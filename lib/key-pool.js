// Named key pool per provider route: extra API keys stored beside the one
// official credential reference a route uses. Secrets live only in the DSH
// credentials store (written through its own service, never returned to the
// browser); this file holds the non-secret metadata — id, name, provider and
// the generated reference each secret sits under.
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { isRecord } from './search.js'
import { quotaProvider } from './quota-providers.js'

export const KEY_POOL_PREFIX = 'KEY_POOL_'

/** Where the pool keeps its metadata: $DSH_HOME/dsh-provider-hub/key-pool.json. */
export function keyPoolPath(homeDir) {
  const base = homeDir ?? process.env.DSH_HOME ?? join(homedir(), '.dsh')
  return join(base, 'dsh-provider-hub', 'key-pool.json')
}

const REF_SEGMENT = provider => provider.toUpperCase().replace(/[^A-Z0-9]+/g, '_')
const trimName = name => (typeof name === 'string' ? name.trim().slice(0, 64) : '')

/**
 * The pool over one provider's keys. `add` stores the secret under a generated
 * `KEY_POOL_<PROVIDER>_<ID>` reference, `setActive` copies a pool secret into
 * the provider's official reference (what pi-ai, search and quota resolve), so
 * switching takes effect on the next operation of every consumer.
 */
export class KeyPool {
  constructor(path, { credentials, now = () => Date.now() } = {}) {
    this.path = path
    this.credentials = credentials
    this.now = now
    this.loaded = undefined
    this.chain = Promise.resolve()
  }

  /** One serialized read-modify-write over the metadata file. */
  mutate(operation) {
    const run = this.chain.then(async () => {
      const document = await this.load()
      const result = await operation(document)
      await this.save(document)
      return result
    })
    this.chain = run.catch(() => {})
    return run
  }

  async load() {
    if (this.loaded) return this.loaded
    let text
    try {
      text = await readFile(this.path, 'utf8')
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error
      this.loaded = { version: 1, entries: [] }
      return this.loaded
    }
    let parsed
    try { parsed = JSON.parse(text) } catch { parsed = undefined }
    const entries = isRecord(parsed) && Array.isArray(parsed.entries) ? parsed.entries.filter(entry => isRecord(entry) && typeof entry.id === 'string' && typeof entry.ref === 'string' && typeof entry.provider === 'string') : []
    this.loaded = { version: 1, entries }
    return this.loaded
  }

  async save(document) {
    await mkdir(dirname(this.path), { recursive: true, mode: 0o700 })
    const tmp = `${this.path}.tmp`
    await writeFile(tmp, `${JSON.stringify({ version: 1, entries: document.entries }, null, 2)}\n`, { mode: 0o600 })
    await rename(tmp, this.path)
    this.loaded = document
  }

  /** Pool entries of one provider (or all), with their active/configured facts. */
  async list(providerId) {
    const document = await this.load()
    const entries = document.entries.filter(entry => providerId === undefined || entry.provider === providerId)
    const activeValues = new Map()
    const views = []
    for (const entry of entries) {
      const provider = quotaProvider(entry.provider)
      const activeRef = provider?.activeRef
      if (activeRef && !activeValues.has(entry.provider)) {
        const resolved = await this.credentials?.resolve?.(activeRef)
        activeValues.set(entry.provider, typeof resolved?.value === 'string' && resolved.value ? resolved.value : undefined)
      }
      const resolved = await this.credentials?.resolve?.(entry.ref)
      const value = typeof resolved?.value === 'string' && resolved.value ? resolved.value : undefined
      views.push({
        id: entry.id,
        name: entry.name,
        provider: entry.provider,
        configured: value !== undefined,
        active: value !== undefined && activeValues.get(entry.provider) === value,
      })
    }
    return views
  }

  /** The stored secret for one pool entry; host-side only. */
  async secretOf(id) {
    const document = await this.load()
    const entry = document.entries.find(candidate => candidate.id === id)
    if (!entry) return undefined
    const resolved = await this.credentials?.resolve?.(entry.ref)
    const value = typeof resolved?.value === 'string' && resolved.value ? resolved.value : undefined
    return value === undefined ? undefined : { entry, value }
  }

  async add({ provider: providerId, name, value }) {
    const provider = quotaProvider(providerId)
    if (!provider?.activeRef) throw new Error(`no key pool is available for provider ${providerId}`)
    const label = trimName(name)
    if (!label) throw new Error('key name must be a non-empty string')
    if (typeof value !== 'string' || value.trim().length === 0) throw new Error('key value must be a non-empty string')
    const secret = value.trim()
    const id = randomUUID().slice(0, 8)
    const ref = `${KEY_POOL_PREFIX}${REF_SEGMENT(providerId)}_${id.toUpperCase()}`
    return this.mutate(async document => {
      await this.credentials?.set?.(ref, secret)
      document.entries.push({ id, name: label, provider: providerId, ref, createdAt: Math.floor(this.now() / 1000) })
      return { id, name: label, provider: providerId }
    })
  }

  async remove({ id }) {
    return this.mutate(async document => {
      const index = document.entries.findIndex(entry => entry.id === id)
      if (index < 0) throw new Error('key pool entry not found')
      const [entry] = document.entries.splice(index, 1)
      await this.credentials?.unset?.(entry.ref)
      return { id }
    })
  }

  async rename({ id, name }) {
    const label = trimName(name)
    if (!label) throw new Error('key name must be a non-empty string')
    return this.mutate(async document => {
      const entry = document.entries.find(candidate => candidate.id === id)
      if (!entry) throw new Error('key pool entry not found')
      entry.name = label
      return { id, name: label }
    })
  }

  /** Copy one pool secret onto the provider's official reference. */
  async setActive({ id }) {
    const secret = await this.secretOf(id)
    if (!secret) throw new Error('key pool entry has no stored secret')
    const provider = quotaProvider(secret.entry.provider)
    if (!provider?.activeRef) throw new Error(`no official credential reference for provider ${secret.entry.provider}`)
    await this.credentials?.set?.(provider.activeRef, secret.value)
    return { id: secret.entry.id, provider: secret.entry.provider, ref: provider.activeRef }
  }
}

const text = (value, label, max = 64) => {
  if (typeof value !== 'string' || value.trim().length === 0) throw new Error(`${label} must be a non-empty string`)
  return value.trim().slice(0, max)
}

/**
 * Host bridge for the browser key-pool card. Views carry names, ids and
 * status facts only — secret values are written once through the credentials
 * service and never read back across the remote boundary.
 */
export class KeyPoolService extends TypertRemoteService {
  static inject = ['credentials']

  constructor(ctx, options = {}) {
    super(ctx, 'keyPool')
    this.pool = options.pool ?? new KeyPool(keyPoolPath(options.homeDir), { credentials: ctx.credentials, now: options.now })
  }

  async list(request = {}) {
    const provider = typeof request?.provider === 'string' && request.provider ? request.provider : undefined
    return { entries: await this.pool.list(provider) }
  }

  async add(request = {}) {
    const provider = text(request?.provider, 'provider')
    if (!quotaProvider(provider)?.activeRef) throw new Error(`no key pool is available for provider ${provider}`)
    return { entry: await this.pool.add({ provider, name: text(request?.name, 'key name'), value: text(request?.value, 'key value', 4096) }) }
  }

  async remove(request = {}) {
    return this.pool.remove({ id: text(request?.id, 'key id', 64) })
  }

  async rename(request = {}) {
    return this.pool.rename({ id: text(request?.id, 'key id', 64), name: text(request?.name, 'key name') })
  }

  async setActive(request = {}) {
    return this.pool.setActive({ id: text(request?.id, 'key id', 64) })
  }
}
