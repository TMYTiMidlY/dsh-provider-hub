// Named Codex account pool: OAuth grants imported from Codex CLI directories
// act as a second login method for openai-codex next to the browser OAuth flow.
// Each named account is one credential record under this plugin's own scope;
// switching copies a grant into the official llm-pi-ai/openai-codex record
// through modifyRecord, so every consumer (conversation, search, quota) picks
// it up on its next operation. Token values never cross the remote boundary —
// views carry names, ids and expiry facts only.
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { isRecord } from './search.js'
import { identityFromToken } from './quota-providers.js'

export const CODEX_ACCOUNT_PREFIX = 'dsh-provider-hub/codex-account-'
export const CODEX_OFFICIAL_RECORD = 'llm-pi-ai/openai-codex'

// The Codex CLI homes worth offering for import, matching the external sync
// tool's SOURCES: the global install and the cc-switch codex-gth launch dir.
export const CODEX_CLI_SOURCES = [
  { id: 'codex', path: () => join(homedir(), '.codex', 'auth.json') },
  { id: 'codex-gth', path: () => join(homedir(), '.codex', '.cc-switch-launches', '40b7472da8db3f767b3960f45bb06cfe45a2918d5600f1a475530f55489c50a4', 'auth.json') },
]

function jwtExpiresMs(access) {
  try {
    const claims = JSON.parse(Buffer.from(access.split('.')[1], 'base64url').toString('utf8'))
    return typeof claims.exp === 'number' && Number.isFinite(claims.exp) ? Math.floor(claims.exp * 1000) : undefined
  } catch {
    return undefined
  }
}

/** One Codex CLI auth.json mapped onto the DSH grant payload, or undefined. */
export async function readCliGrant(path) {
  let text
  try {
    text = await readFile(path, 'utf8')
  } catch {
    return undefined
  }
  let data
  try { data = JSON.parse(text) } catch { return undefined }
  const tokens = isRecord(data.tokens) ? data.tokens : {}
  const access = typeof tokens.access_token === 'string' && tokens.access_token ? tokens.access_token : undefined
  const refresh = typeof tokens.refresh_token === 'string' && tokens.refresh_token ? tokens.refresh_token : undefined
  const accountId = typeof tokens.account_id === 'string' && tokens.account_id ? tokens.account_id : undefined
  if (!access || !refresh || !accountId) return undefined
  const expires = jwtExpiresMs(access)
  if (expires === undefined) return undefined
  return { type: 'oauth', access, refresh, expires, accountId }
}

const trimName = name => (typeof name === 'string' ? name.trim().slice(0, 64) : '')
const grantOf = record => (record?.kind === 'grant' && isRecord(record.payload) && record.payload.type === 'oauth' && typeof record.payload.access === 'string' && record.payload.access ? record.payload : undefined)
const brief = value => (typeof value === 'string' && value ? `${value.slice(0, 8)}…` : undefined)
/** The canonical grant fields the official record expects — pool metadata stays pool-side. */
const canonical = payload => ({ type: 'oauth', access: payload.access, refresh: payload.refresh, expires: payload.expires, accountId: payload.accountId })

/**
 * The Codex account pool over this plugin's credential records. Grants are
 * stored verbatim (plus name/source metadata inside the payload); `setActive`
 * first writes the current official grant back into its own slot so token
 * freshness survives a switch, then copies the chosen grant into the official
 * record. For the same account, whichever grant expires later wins.
 */
export class CodexAccounts {
  constructor({ credentials, now = () => Date.now(), sources } = {}) {
    this.credentials = credentials
    this.now = now
    this.sources = sources ?? CODEX_CLI_SOURCES
  }

  view(id, payload, official) {
    const identity = identityFromToken(payload.access)
    return {
      id,
      name: typeof payload.name === 'string' && payload.name ? payload.name : id,
      accountId: brief(payload.accountId),
      ...(identity.email ? { email: identity.email } : {}),
      ...(typeof payload.expires === 'number' && Number.isFinite(payload.expires) ? { expires: Math.floor(payload.expires / 1000) } : {}),
      ...(typeof payload.source === 'string' && payload.source ? { source: payload.source } : {}),
      active: official !== undefined && payload.access === official.access,
    }
  }

  async officialPayload() {
    return grantOf(await this.credentials.readRecord(CODEX_OFFICIAL_RECORD))
  }

  /** The stored grant for one account id; host-side only, never crosses the wire. */
  async grant(id) {
    if (!/^[0-9a-f]{8}$/.test(String(id))) return undefined
    return grantOf(await this.credentials.readRecord(CODEX_ACCOUNT_PREFIX + id))
  }

  /** Pool records as [{id, payload}] in storage order. */
  async slots() {
    const entries = []
    for (const entry of await this.credentials.listRecords()) {
      if (!String(entry.key).startsWith(CODEX_ACCOUNT_PREFIX)) continue
      const payload = grantOf(await this.credentials.readRecord(entry.key))
      if (payload) entries.push({ key: String(entry.key), id: String(entry.key).slice(CODEX_ACCOUNT_PREFIX.length), payload })
    }
    return entries
  }

  async findByAccount(accountId, email) {
    for (const slot of await this.slots()) {
      if (slot.payload.accountId === accountId || (email && identityFromToken(slot.payload.access).email === email)) return slot
    }
    return undefined
  }

  async list() {
    const official = await this.officialPayload()
    const entries = []
    for (const slot of await this.slots()) entries.push(this.view(slot.id, slot.payload, official))
    return entries
  }

  /** Import one CLI directory's login state as a named pool account. */
  async importFrom({ source, name }) {
    const def = this.sources.find(candidate => candidate.id === source)
    if (!def) throw new Error(`unknown Codex CLI source: ${source}`)
    const grant = await readCliGrant(def.path())
    if (!grant) throw new Error('该 Codex CLI 目录没有可用的登录态（缺少 token 或无法解析过期时间）')
    const identity = identityFromToken(grant.access)
    const label = trimName(name) || identity.email || grant.accountId
    const official = await this.officialPayload()
    const existing = await this.findByAccount(grant.accountId, identity.email)
    if (existing) {
      // Same account: keep whichever token set expires later, and the label wins.
      const merged = grant.expires > existing.payload.expires
        ? { ...existing.payload, ...grant, name: label }
        : { ...existing.payload, name: label }
      await this.credentials.modifyRecord(existing.key, async () => ({ kind: 'grant', payload: merged }))
      return { ...this.view(existing.id, merged, official), updated: true }
    }
    const id = randomUUID().slice(0, 8)
    const payload = { ...grant, name: label, source: def.id, importedAt: Math.floor(this.now() / 1000) }
    await this.credentials.modifyRecord(CODEX_ACCOUNT_PREFIX + id, async () => ({ kind: 'grant', payload }))
    return this.view(id, payload, official)
  }
  async remove({ id }) {
    if (!/^[0-9a-f]{8}$/.test(String(id))) throw new Error('codex account not found')
    const key = CODEX_ACCOUNT_PREFIX + id
    if (!grantOf(await this.credentials.readRecord(key))) throw new Error('codex account not found')
    await this.credentials.deleteRecord(key)
    return { id }
  }

  async rename({ id, name }) {
    if (!/^[0-9a-f]{8}$/.test(String(id))) throw new Error('codex account not found')
    const label = trimName(name)
    if (!label) throw new Error('account name must be a non-empty string')
    const key = CODEX_ACCOUNT_PREFIX + id
    let updated
    await this.credentials.modifyRecord(key, async current => {
      const payload = grantOf(current)
      if (!payload) throw new Error('codex account not found')
      updated = { ...payload, name: label }
      return { kind: 'grant', payload: updated }
    })
    return this.view(id, updated, await this.officialPayload())
  }

  async setActive({ id }) {
    if (!/^[0-9a-f]{8}$/.test(String(id))) throw new Error('codex account not found')
    const key = CODEX_ACCOUNT_PREFIX + id
    const chosen = grantOf(await this.credentials.readRecord(key))
    if (!chosen) throw new Error('codex account not found')
    const official = await this.officialPayload()
    // 1. Write the current official grant back into its own slot, so its token
    //    freshness survives the switch (only when it is actually fresher).
    if (official?.access && official.accountId) {
      const own = await this.findByAccount(official.accountId, identityFromToken(official.access).email)
      if (own && official.expires > own.payload.expires) {
        await this.credentials.modifyRecord(own.key, async () => ({ kind: 'grant', payload: { ...own.payload, ...canonical(official) } }))
      }
    }
    // 2. Same account re-activation: whichever grant expires later wins.
    const grant = official?.accountId === chosen.accountId && official.expires > chosen.expires ? { ...chosen, ...canonical(official) } : chosen
    // 3. Switch the official record — the one write path every consumer re-reads.
    await this.credentials.modifyRecord(CODEX_OFFICIAL_RECORD, async () => ({ kind: 'grant', payload: canonical(grant) }))
    return { id, name: grant.name, active: true }
  }
}

const text = (value, label, max = 64) => {
  if (typeof value !== 'string' || value.trim().length === 0) throw new Error(`${label} must be a non-empty string`)
  return value.trim().slice(0, max)
}

/**
 * Host bridge for the browser Codex-accounts card. Views never include token
 * values; `sources` previews the CLI directories without moving their state.
 */
export class CodexAccountsService extends TypertRemoteService {
  static inject = ['credentials']

  constructor(ctx, options = {}) {
    super(ctx, 'codexAccounts')
    this.accounts = options.accounts ?? new CodexAccounts({ credentials: ctx.credentials, now: options.now })
  }

  async list() {
    return { entries: await this.accounts.list() }
  }

  async sources() {
    return {
      sources: await Promise.all((this.accounts.sources ?? CODEX_CLI_SOURCES).map(async source => {
        const grant = await readCliGrant(source.path())
        return {
          id: source.id,
          path: source.path(),
          available: grant !== undefined,
          ...(grant ? { accountId: brief(grant.accountId), ...(identityFromToken(grant.access).email ? { email: identityFromToken(grant.access).email } : {}), expires: Math.floor(grant.expires / 1000) } : {}),
        }
      })),
    }
  }

  async import(request = {}) {
    return { entry: await this.accounts.importFrom({ source: text(request?.source, 'source'), name: request?.name }) }
  }

  // Wire name must stay off RemoteNamespaceService's own members (`remove`
  // collides with the namespace unmount API and rejects the whole mount).
  async drop(request = {}) {
    return this.accounts.remove({ id: text(request?.id, 'account id', 64) })
  }

  async rename(request = {}) {
    return this.accounts.rename({ id: text(request?.id, 'account id', 64), name: text(request?.name, 'account name') })
  }

  async setActive(request = {}) {
    return this.accounts.setActive({ id: text(request?.id, 'account id', 64) })
  }
}
