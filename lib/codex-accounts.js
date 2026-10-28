// Web OAuth and CLI imports share one account pool. Only metadata crosses the
// remote boundary; the official provider record remains the active credential.
import { randomUUID } from 'node:crypto'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { codexDirectoryPath } from './codex-paths.js'
import { CodexDiscovery, boundedFile, inspectionTimedOut, SOURCE_POLICY } from './codex-discovery.js'
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { isRecord } from './search.js'
import { identityFromToken } from './quota-providers.js'

export const CODEX_ACCOUNT_PREFIX = 'dsh-provider-hub/codex-account-'
export const CODEX_OFFICIAL_RECORD = 'llm-pi-ai/openai-codex'
const trimName = name => typeof name === 'string' ? name.trim().slice(0, 64) : ''
const grantOf = record => record?.kind === 'grant' && isRecord(record.payload) && record.payload.type === 'oauth' && typeof record.payload.access === 'string' && record.payload.access ? record.payload : undefined
const brief = value => typeof value === 'string' && value ? `${value.slice(0, 8)}…` : undefined
const expiry = payload => Number.isFinite(payload?.expires) ? payload.expires : 0
const sourceOf = payload => ['web', 'existing'].includes(payload?.source) ? payload.source : 'cli'
// Keep optional grant fields optional: credential payloads must survive strict
// JSON validation (undefined fields are not storable in the official service).
const canonical = payload => Object.fromEntries(Object.entries(payload).filter(([key, value]) => value !== undefined && !['name', 'source', 'sourcePath', 'importedAt'].includes(key)))
export function sameCodexAccount(a, b) {
  if (!a || !b) return false
  // Workspace id can be shared by several team members, and one email can
  // belong to several workspaces. Neither alone may merge distinct users.
  const left = identityFromToken(a.access).email?.trim().toLowerCase()
  const right = identityFromToken(b.access).email?.trim().toLowerCase()
  if (left && right && left !== right) return false
  if (a.accountId && b.accountId && a.accountId !== b.accountId) return false
  if (left && right) return true
  return a.accountId && b.accountId ? a.accountId === b.accountId : a.access === b.access
}
function jwtClaims(access) {
  try { const claims = JSON.parse(Buffer.from(access.split('.')[1], 'base64url').toString('utf8')); return isRecord(claims) ? claims : {} } catch { return {} }
}

/** Safe, bounded auth-file parser. Never include the file contents in errors. */
async function inspectAuth(path, scope) {
  let data
  try { data = JSON.parse(await boundedFile(path, scope.owner.limits.authBytes, scope)) }
  catch (error) { return { status: inspectionTimedOut(error) ? 'timed-out' : error?.code === 'ENOENT' ? 'missing' : error?.code === 'EACCES' ? 'unreadable' : 'invalid' } }
  if (!isRecord(data)) return { status: 'invalid' }
  const tokens = isRecord(data.tokens) ? data.tokens : {}
  if (data.auth_mode === 'apikey' || (!tokens.access_token && data.OPENAI_API_KEY)) return { status: 'api-key' }
  const access = tokens.access_token
  const refresh = tokens.refresh_token
  if (typeof access !== 'string' || !access || typeof refresh !== 'string' || !refresh) return { status: 'invalid' }
  const claims = jwtClaims(access)
  const accountId = typeof tokens.account_id === 'string' && tokens.account_id ? tokens.account_id : claims['https://api.openai.com/auth']?.chatgpt_account_id
  if (typeof accountId !== 'string' || !accountId || !Number.isFinite(claims.exp) || claims.exp <= 0 || claims.exp > 8.64e12) return { status: 'invalid' }
  return { status: 'ready', grant: { type: 'oauth', access, refresh, expires: Math.floor(claims.exp * 1000), accountId } }
}
export async function readCliGrant(path) {
  const scope = new CodexDiscovery().scope()
  try { return (await inspectAuth(path, scope)).grant } finally { scope.finish() }
}

export class CodexAccounts {
  constructor({ credentials, now = () => Date.now(), sources, home = homedir(), env = process.env, isBusy = () => false, discovery = {} } = {}) {
    this.credentials = credentials
    this.now = now
    this.fixedSources = sources
    this.home = home
    this.env = env
    this.directoryPath = value => codexDirectoryPath(value, { home: this.home, env: this.env })
    this.discovery = new CodexDiscovery({ ...discovery, home, env, directoryPath: value => this.directoryPath(value) })
    this.isBusy = isBusy
    this.chain = Promise.resolve()
  }
  serial(operation) {
    const result = this.chain.then(operation)
    this.chain = result.catch(() => {})
    return result
  }
  view(id, payload, official) {
    const identity = identityFromToken(payload.access)
    return {
      ...(id ? { id } : {}), name: trimName(payload.name) || identity.email || brief(payload.accountId) || 'Codex',
      accountId: brief(payload.accountId), ...(identity.email ? { email: identity.email } : {}),
      ...(expiry(payload) ? { expires: Math.floor(payload.expires / 1000) } : {}),
      source: sourceOf(payload), ...(payload.sourcePath ? { sourcePath: payload.sourcePath } : {}),
      expired: !!expiry(payload) && expiry(payload) <= this.now(), active: sameCodexAccount(payload, official),
    }
  }
  async officialPayload() { return grantOf(await this.credentials.readRecord(CODEX_OFFICIAL_RECORD)) }
  // The local credential service reconciles disk under this official record's
  // mutation lock. Returning undefined is a read-only synchronization barrier,
  // not an event or write (ordinary readRecord may lag an external refresh).
  async freshOfficial() {
    return grantOf(await this.credentials.modifyRecord(CODEX_OFFICIAL_RECORD, async () => undefined))
  }
  async grant(id) {
    if (!/^[0-9a-f]{8}$/u.test(String(id))) return undefined
    return grantOf(await this.credentials.readRecord(CODEX_ACCOUNT_PREFIX + id))
  }
  async slots() {
    const slots = []
    for (const entry of await this.credentials.listRecords()) {
      const key = String(entry.key)
      if (!new RegExp(`^${CODEX_ACCOUNT_PREFIX}[0-9a-f]{8}$`, 'u').test(key)) continue
      const payload = grantOf(await this.credentials.readRecord(key))
      if (payload) slots.push({ key, id: key.slice(CODEX_ACCOUNT_PREFIX.length), payload })
    }
    return slots
  }
  async saveGrant(grant, { name, source = 'existing', sourcePath, authoritative = false } = {}) {
    const found = (await this.slots()).find(slot => sameCodexAccount(slot.payload, grant))
    const id = found?.id ?? randomUUID().slice(0, 8)
    const label = trimName(name)
    const record = await this.credentials.modifyRecord(CODEX_ACCOUNT_PREFIX + id, async current => {
      const old = grantOf(current)
      if (current && !sameCodexAccount(old, grant)) throw new Error('账号记录已变化，请刷新后重试')
      if (authoritative) {
        // modifyRecord has reconciled the document before invoking this callback.
        // A read here is safe (no nested write/lock) and fences a stale snapshot
        // against a newer cross-process login/refresh. Never downgrade its pool.
        const live = await this.officialPayload()
        if (JSON.stringify(canonical(live ?? {})) !== JSON.stringify(canonical(grant))) throw new Error('当前登录态已变化，未覆盖账号池；请刷新重试')
      }
      const useNew = !old || authoritative || expiry(grant) > expiry(old)
      const next = { ...(old ?? {}), ...(useNew ? canonical(grant) : {}),
        name: label || old?.name || identityFromToken(grant.access).email || brief(grant.accountId) || 'Codex',
        source: source === 'web' ? 'web' : old?.source ?? source,
        importedAt: old?.importedAt ?? Math.floor(this.now() / 1000),
        ...(sourcePath ? { sourcePath } : {}),
      }
      // Avoid rewriting identical snapshots on every quota/list request.
      return old && JSON.stringify(next) === JSON.stringify(old) ? undefined : { kind: 'grant', payload: next }
    })
    return { id, payload: grantOf(record), updated: !!found }
  }
  // Always capture the record BEFORE an OAuth flow or account switch may
  // replace it. This creates a slot even for an old native-login-only account.
  captureOfficial(options = {}) {
    return this.serial(async () => {
      const grant = await this.freshOfficial()
      if (!grant) return undefined
      const saved = await this.saveGrant(grant, options)
      return this.view(saved.id, saved.payload, grant)
    })
  }
  rememberOfficialChange() {
    // Take the event's snapshot NOW, not after the serialized queue drains: two
    // rapid external logins must not both be mistaken for the final account.
    const snapshot = this.officialPayload()
    return snapshot.then(grant => grant ? this.serial(() => this.saveGrant(grant)) : undefined)
  }
  async list() {
    await this.captureOfficial()
    const official = await this.officialPayload()
    return (await this.slots()).map(slot => this.view(slot.id, slot.payload, official))
  }
  async current() {
    const official = await this.officialPayload()
    if (!official) return undefined
    const slot = (await this.slots()).find(slot => sameCodexAccount(slot.payload, official))
    return this.view(slot?.id, { ...official, ...(slot ? { name: slot.payload.name, source: slot.payload.source } : { source: 'existing' }) }, official)
  }
  async historicalPaths(scope) {
    const entries = await scope.io(() => this.credentials.listRecords())
    const paths = []
    let checked = 0
    const limit = this.discovery.limits.maxHistory * 4
    if (entries.length > limit) scope.truncated = true
    for (const entry of entries.slice(0, limit)) {
      if (!new RegExp(`^${CODEX_ACCOUNT_PREFIX}[0-9a-f]{8}$`, 'u').test(String(entry.key))) continue
      if (checked++ >= this.discovery.limits.maxHistory) { scope.truncated = true; break }
      if (!scope.active()) break
      const payload = grantOf(await scope.io(() => this.credentials.readRecord(entry.key)))
      if (typeof payload?.sourcePath === 'string') paths.push(payload.sourcePath)
    }
    return paths
  }
  async sourcesView(request = {}) {
    if (request.directory !== undefined && typeof request.directory !== 'string') throw new Error('Codex home 目录必须是文本')
    const { definitions, inspections, scan } = await this.discovery.scan({ directory: request.directory, fixedSources: this.fixedSources, historicalPaths: scope => this.historicalPaths(scope), inspect: inspectAuth })
    const sources = definitions.map(source => {
      const inspected = inspections.get(source.id), grant = inspected.grant
      const status = grant && expiry(grant) <= this.now() ? 'expired' : inspected.status
      return { ...source, available: !!grant, status,
        ...(grant ? { ...identityFromToken(grant.access), accountId: brief(grant.accountId), expires: Math.floor(grant.expires / 1000) } : {}),
      }
    })
    const global = sources.find(source => source.default)
    return { sources, scan, policy: SOURCE_POLICY, ...(global ? { defaultSourceId: global.id, globalPath: global.path } : {}), hostPlatform: process.platform }
  }
  async importFrom({ source, directory, name }) {
    if (directory !== undefined && typeof directory !== 'string') throw new Error('Codex home 目录必须是文本')
    const scope = this.discovery.scope()
    let def, inspected
    try {
      if (directory !== undefined) { const path = await scope.io(() => this.directoryPath(directory)); def = { path, authPath: join(path, 'auth.json') } }
      else {
        def = this.discovery.cached.get(source)
        // Import never repeats discovery. Defaults and embedding-provided
        // definitions remain cheap to use even before the first preview.
        if (!def && this.fixedSources) {
          const item = this.fixedSources.find(item => item.id === source)
          if (item) { const authPath = typeof item.path === 'function' ? item.path() : item.path; def = { path: dirname(authPath), authPath } }
        }
        if (!def && !this.fixedSources && (source === 'codex' || source === 'codex-home' && this.env.CODEX_HOME)) {
          const path = await scope.io(() => this.directoryPath(source === 'codex-home' ? this.env.CODEX_HOME : join(this.home, '.codex')))
          def = { path, authPath: join(path, 'auth.json') }
        }
      }
      if (!def) throw new Error('未找到选择的 CLI 目录，请重新发现或指定 Codex home 目录')
      inspected = await inspectAuth(def.authPath, scope)
    } catch (error) {
      if (inspectionTimedOut(error)) throw new Error('检查目录超时，请稍后重试或选择本机目录')
      throw error
    } finally { scope.finish() }
    if (!inspected.grant) throw new Error(({ missing: '该目录没有 auth.json，请先使用 Codex CLI 登录', unreadable: '无权读取该目录的 auth.json', 'api-key': '该目录使用 API Key，不是可导入的 ChatGPT 登录态', 'timed-out': '检查目录超时，请稍后重试或选择本机目录' })[inspected.status] ?? 'auth.json 不是完整的 Codex OAuth 登录态（需要 access、refresh、account_id 与过期时间）')
    return this.serial(async () => {
      const official = await this.freshOfficial()
      if (official) await this.saveGrant(official)
      const saved = await this.saveGrant(inspected.grant, { name, source: 'cli', sourcePath: def.path })
      return { ...this.view(saved.id, saved.payload, official), ...(saved.updated ? { updated: true } : {}) }
    })
  }
  remove({ id }) {
    return this.serial(async () => {
      if (!(await this.grant(id))) throw new Error('codex account not found')
      if (sameCodexAccount(await this.grant(id), await this.officialPayload())) throw new Error('不能删除当前账号；请先切换到另一个账号')
      await this.credentials.deleteRecord(CODEX_ACCOUNT_PREFIX + id)
      return { id }
    })
  }
  rename({ id, name }) {
    return this.serial(async () => {
      if (!/^[0-9a-f]{8}$/u.test(String(id))) throw new Error('codex account not found')
      const label = trimName(name)
      if (!label) throw new Error('account name must be a non-empty string')
      const record = await this.credentials.modifyRecord(CODEX_ACCOUNT_PREFIX + id, async current => {
        const payload = grantOf(current)
        if (!payload) throw new Error('codex account not found')
        return { kind: 'grant', payload: { ...payload, name: label } }
      })
      return this.view(id, record.payload, await this.officialPayload())
    })
  }
  setActive({ id }) {
    return this.serial(async () => {
      if (this.isBusy()) throw new Error('网页登录正在进行，请完成或取消后再切换账号')
      const chosen = await this.grant(id)
      if (!chosen) throw new Error('codex account not found')
      const official = await this.freshOfficial()
      if (official) await this.saveGrant(official)
      const grant = sameCodexAccount(official, chosen) && expiry(official) >= expiry(chosen) ? official : chosen
      if (expiry(grant) && expiry(grant) <= this.now()) throw new Error('该账号登录态已过期，请重新网页登录或导入更新后的 CLI 登录态')
      await this.credentials.modifyRecord(CODEX_OFFICIAL_RECORD, async current => {
        // An OAuth refresh or another writer may have won since capture. Never
        // overwrite a newly appeared credential that has not been preserved.
        if (JSON.stringify(current?.payload) !== JSON.stringify(official)) throw new Error('当前登录态刚刚发生变化，请刷新后重试')
        return { kind: 'grant', payload: canonical(grant) }
      })
      return { id, name: chosen.name, active: true }
    })
  }
}

const text = (value, label) => { if (typeof value !== 'string' || !value.trim() || value.length > 128) throw new Error(`${label} must be a non-empty string`); return value.trim() }
export class CodexAccountsService extends TypertRemoteService {
  static inject = ['credentials']
  constructor(ctx, options = {}) { super(ctx, 'codexAccounts'); this.accounts = options.accounts ?? new CodexAccounts({ credentials: ctx.credentials, now: options.now }); this.onAdded = options.onAdded }
  async list() { return { entries: await this.accounts.list(), current: await this.accounts.current() } }
  async sources(request = {}) { return this.accounts.sourcesView(request) }
  async import(request = {}) {
    const entry = await this.accounts.importFrom(request)
    void Promise.resolve().then(() => this.onAdded?.()).catch(() => {})
    return { entry }
  }
  async drop(request = {}) { return this.accounts.remove({ id: text(request.id, 'account id') }) }
  async rename(request = {}) { return this.accounts.rename({ id: text(request.id,'account id'), name: text(request.name, 'account name') }) }
  async setActive(request = {}) { return this.accounts.setActive({ id: text(request.id, 'account id') }) }
}
