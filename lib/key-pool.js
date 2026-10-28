// Named key pool per provider route: extra API keys stored beside the one
// official credential reference a route uses. Secrets live only in the DSH
// credentials store (written through its own service, never returned to the
// browser); this file holds the non-secret metadata — id, name, provider and
// the generated reference each secret sits under.
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { isRecord } from './search.js'
import { quotaAccountMetadata, quotaProvider, quotaQueryScope } from './quota-providers.js'

export const KEY_POOL_PREFIX = 'KEY_POOL_'
export const DEFAULT_ACCOUNT_NAME = '默认账号'

/** Where the pool keeps its metadata: $DSH_HOME/dsh-provider-hub/key-pool.json. */
export function keyPoolPath(homeDir) {
  const base = homeDir ?? process.env.DSH_HOME ?? join(homedir(), '.dsh')
  return join(base, 'dsh-provider-hub', 'key-pool.json')
}

const REF_SEGMENT = provider => provider.toUpperCase().replace(/[^A-Z0-9]+/g, '_')
const trimName = name => (typeof name === 'string' ? name.trim().slice(0, 64) : '')
const entryName = name => trimName(name) ? name : DEFAULT_ACCOUNT_NAME
const secretHash = value => createHash('sha256').update(value).digest('hex')
const teamProviders = new Set(['zai', 'zai-coding-cn'])
function entryMetadata(provider, input) {
  const metadata = quotaAccountMetadata(input)
  if (metadata.accountType === 'team' && !teamProviders.has(provider)) throw new Error('team accounts are only available for zai and zai-coding-cn')
  return metadata
}
const selectedFor = (document, provider, value) => {
  const selected = document.activeSelections?.[provider]
  return value && selected?.secretHash === secretHash(value) ? selected : undefined
}

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
      // Stage metadata mutations: a failed persistence must not publish an
      // in-memory scope selection that never reached the metadata file.
      const document = structuredClone(await this.load(true))
      const result = await operation(document)
      await this.save(document)
      return result
    })
    this.chain = run.catch(() => {})
    return run
  }

  async load(fresh = false) {
    if (this.loaded && !fresh) return this.loaded
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
    const activeSelections = {}
    if (isRecord(parsed?.activeSelections)) for (const [provider, selected] of Object.entries(parsed.activeSelections)) {
      if (!quotaProvider(provider)?.activeRef || !isRecord(selected) || !/^[a-f0-9]{64}$/u.test(selected.secretHash ?? '') || typeof selected.entryId !== 'string') continue
      try {
        activeSelections[provider] = { secretHash: selected.secretHash, entryId: selected.entryId, ...entryMetadata(provider, selected) }
      } catch { /* A malformed on-disk scope must never become an HTTP header. */ }
    }
    this.loaded = { version: 1, entries, activeSelections }
    return this.loaded
  }

  async save(document) {
    await mkdir(dirname(this.path), { recursive: true, mode: 0o700 })
    const tmp = `${this.path}.tmp`
    await writeFile(tmp, `${JSON.stringify({ version: 1, entries: document.entries, ...(document.activeSelections && Object.keys(document.activeSelections).length ? { activeSelections: document.activeSelections } : {}) }, null, 2)}\n`, { mode: 0o600 })
    await rename(tmp, this.path)
    this.loaded = document
  }

  /** Pool entries of one provider (or all), with their active/configured facts. */
  async list(providerId) {
    await this.chain
    const document = await this.load(true)
    const entries = document.entries.filter(entry => providerId === undefined || entry.provider === providerId)
    const activeValues = new Map()
    const views = []
    const fallbackChosen = new Set()
    for (const entry of entries) {
      const provider = quotaProvider(entry.provider)
      const activeRef = provider?.activeRef
      if (activeRef && !activeValues.has(entry.provider)) {
        const resolved = await this.credentials?.resolve?.(activeRef)
        activeValues.set(entry.provider, typeof resolved?.value === 'string' && resolved.value ? resolved.value : undefined)
      }
      const resolved = await this.credentials?.resolve?.(entry.ref)
      const value = typeof resolved?.value === 'string' && resolved.value ? resolved.value : undefined
      const metadata = entryMetadata(entry.provider, entry)
      const selected = selectedFor(document, entry.provider, activeValues.get(entry.provider))
      const sameValue = value !== undefined && activeValues.get(entry.provider) === value
      const active = sameValue && (selected
        ? selected.entryId === entry.id && quotaQueryScope(selected) === quotaQueryScope(metadata)
        : metadata.accountType !== 'team' && !fallbackChosen.has(entry.provider))
      if (active) fallbackChosen.add(entry.provider)
      views.push({
        id: entry.id,
        name: entryName(entry.name),
        provider: entry.provider,
        ...metadata,
        configured: value !== undefined,
        active,
      })
    }
    return views
  }

  /** The stored secret for one pool entry; host-side only. */
  async secretOf(id) {
    const document = await this.load(true)
    const entry = document.entries.find(candidate => candidate.id === id)
    if (!entry) return undefined
    const resolved = await this.credentials?.resolve?.(entry.ref)
    const value = typeof resolved?.value === 'string' && resolved.value ? resolved.value : undefined
    const { accountType: _type, organization: _organization, project: _project, ...base } = entry
    return value === undefined ? undefined : { entry: { ...base, ...entryMetadata(entry.provider, entry) }, value }
  }

  /** Host-only: an explicit selection, bound to the current official secret.
   * Never infer this from add/list order: adding a same-secret team entry must
   * not silently switch the official query's organization or project.
   */
  async activeMetadata(providerId, secretValue) {
    if (typeof secretValue !== 'string' || !secretValue) return {}
    await this.chain
    // Same-secret scope changes do not emit a different credential value, so
    // re-read the atomic metadata file instead of trusting an older cache.
    const selected = selectedFor(await this.load(true), providerId, secretValue)
    return selected ? entryMetadata(providerId, selected) : {}
  }

  /** Preserve the official key only inside an explicit serialized mutation.
   * A matching secret alone cannot identify a team scope: only the selection
   * bound to the official value may supply organization/project metadata.
   */
  async preserveActive(document, providerId, pending) {
    const provider = quotaProvider(providerId)
    const resolved = await this.credentials?.resolve?.(provider.activeRef)
    const value = typeof resolved?.value === 'string' && resolved.value ? resolved.value : undefined
    if (!value) return
    const selected = selectedFor(document, providerId, value)
    const metadata = selected ? entryMetadata(providerId, selected) : {}
    const scope = quotaQueryScope(metadata)
    const candidates = document.entries.filter(entry => entry.provider === providerId)
    // Keep the exact selected account (and its name) ahead of same-secret peers.
    candidates.sort((a, b) => Number(b.id === selected?.entryId) - Number(a.id === selected?.entryId))
    let preserved
    for (const candidate of candidates) {
      if (quotaQueryScope(entryMetadata(providerId, candidate)) !== scope) continue
      const stored = await this.credentials?.resolve?.(candidate.ref)
      if (stored?.value === value) { preserved = candidate; break }
    }
    if (!preserved && pending?.value === value && quotaQueryScope(pending.entry) === scope) {
      // add will persist this new, user-named entry without touching the official
      // ref. It already preserves the same account; no default duplicate needed.
      if (selected) document.activeSelections[providerId] = { ...selected, entryId: pending.entry.id }
      return
    }
    let changed = false
    if (!preserved) {
      const id = randomUUID().slice(0, 8)
      const ref = `${KEY_POOL_PREFIX}${REF_SEGMENT(providerId)}_${id.toUpperCase()}`
      preserved = { id, name: DEFAULT_ACCOUNT_NAME, provider: providerId, ref, ...metadata, createdAt: Math.floor(this.now() / 1000) }
      await this.credentials?.set?.(ref, value)
      document.entries.push(preserved)
      changed = true
    } else if (!trimName(preserved.name)) {
      preserved.name = DEFAULT_ACCOUNT_NAME
      changed = true
    }
    if (selected && selected.entryId !== preserved.id) {
      document.activeSelections[providerId] = { ...selected, entryId: preserved.id }
      changed = true
    }
    // setActive must never overwrite the only durable copy. Persist the backup
    // reference and scope before the caller is allowed to write the official ref.
    if (changed) await this.save(document)
  }

  async add({ provider: providerId, name, value, accountType, organization, project }) {
    const provider = quotaProvider(providerId)
    if (!provider?.activeRef) throw new Error(`no key pool is available for provider ${providerId}`)
    const metadata = entryMetadata(providerId, { accountType, organization, project })
    const label = trimName(name)
    if (!label) throw new Error('key name must be a non-empty string')
    if (typeof value !== 'string' || value.trim().length === 0) throw new Error('key value must be a non-empty string')
    const secret = value.trim()
    const id = randomUUID().slice(0, 8)
    const ref = `${KEY_POOL_PREFIX}${REF_SEGMENT(providerId)}_${id.toUpperCase()}`
    return this.mutate(async document => {
      const entry = { id, name: label, provider: providerId, ref, ...metadata, createdAt: Math.floor(this.now() / 1000) }
      await this.preserveActive(document, providerId, { entry, value: secret })
      await this.credentials?.set?.(ref, secret)
      document.entries.push(entry)
      return { id, name: label, provider: providerId, ...metadata }
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
    return this.mutate(async document => {
      const entry = document.entries.find(candidate => candidate.id === id)
      if (!entry) throw new Error('key pool entry not found')
      const resolved = await this.credentials?.resolve?.(entry.ref)
      const value = typeof resolved?.value === 'string' && resolved.value ? resolved.value : undefined
      if (!value) throw new Error('key pool entry has no stored secret')
      const provider = quotaProvider(entry.provider)
      if (!provider?.activeRef) throw new Error(`no official credential reference for provider ${entry.provider}`)
      const metadata = entryMetadata(entry.provider, entry)
      await this.preserveActive(document, entry.provider)
      await this.credentials?.set?.(provider.activeRef, value)
      document.activeSelections ??= {}
      document.activeSelections[entry.provider] = { entryId: entry.id, secretHash: secretHash(value), ...metadata }
      return { id: entry.id, provider: entry.provider, ref: provider.activeRef, ...metadata }
    })
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
    this.onAdded = options.onAdded
  }

  async list(request = {}) {
    const provider = typeof request?.provider === 'string' && request.provider ? request.provider : undefined
    return { entries: await this.pool.list(provider) }
  }

  async add(request = {}) {
    const provider = text(request?.provider, 'provider')
    if (!quotaProvider(provider)?.activeRef) throw new Error(`no key pool is available for provider ${provider}`)
    const entry = await this.pool.add({ provider, name: text(request?.name, 'key name'), value: text(request?.value, 'key value', 4096), accountType: request?.accountType, organization: request?.organization, project: request?.project })
    // Sampling is independent of the credential commit. A probe failure must
    // never turn a successfully added account into a reported add failure.
    void Promise.resolve().then(() => this.onAdded?.()).catch(() => {})
    return { entry }
  }

  // Wire name must stay off RemoteNamespaceService's own members: `remove`
  // collides with the namespace unmount API and rejects the whole mount.
  async drop(request = {}) {
    return this.pool.remove({ id: text(request?.id, 'key id', 64) })
  }

  async rename(request = {}) {
    return this.pool.rename({ id: text(request?.id, 'key id', 64), name: text(request?.name, 'key name') })
  }

  async setActive(request = {}) {
    return this.pool.setActive({ id: text(request?.id, 'key id', 64) })
  }
}
