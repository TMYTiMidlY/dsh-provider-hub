// Multi-provider account quota: read-only queries against each provider's own
// usage endpoint plus an hourly local recorder. Credentials are only ever
// read; tokens are never refreshed, logged, or returned to the browser.
import { appendFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { SearchError, boundedText, isRecord } from './search.js'
import { QuotaFormatError, clampInt, windowKind } from './quota-core.js'
import { QUOTA_PROVIDERS, apiKeyAccount, quotaProvider, quotaQueryScope, identityFromToken, parseQuotaBody, parseResetCreditsBody } from './quota-providers.js'

const TOKEN_EXPIRY_MARGIN_MS = 5 * 60_000
const DEFAULT_MAX_AGE_MS = 300_000
const DEFAULT_INTERVAL_MINUTES = 60
const DEFAULT_HISTORY_DAYS = 180
const MIN_FETCH_SPACING_MS = 60_000
const RECORDER_FIRST_DELAY_MS = 10_000
const DEFAULT_PROVIDER = 'openai-codex'
const isZai = provider => provider.id === 'zai' || provider.id === 'zai-coding-cn'
const intervalSeconds = config => clampInt(config.quotaIntervalMinutes, 1, 1440, DEFAULT_INTERVAL_MINUTES) * 60
const keyMetadata = entry => entry?.accountType ? { accountType: entry.accountType, ...(entry.accountType === 'team' ? { organization: entry.organization, project: entry.project } : {}) } : {}
const identityOf = (provider, credential) => JSON.stringify([credential.account, credential.accountId || '', isZai(provider) ? quotaQueryScope(credential) : ''])

export { QuotaFormatError, identityFromToken, parseQuotaBody, parseResetCreditsBody, windowKind }

/** Where the hourly recorder persists its points: $DSH_HOME/dsh-provider-hub/. */
export function quotaHistoryPath(homeDir) {
  const base = homeDir ?? process.env.DSH_HOME ?? join(homedir(), '.dsh')
  return join(base, 'dsh-provider-hub', 'quota-history.jsonl')
}

function sanitizePoint(point) {
  const used = {}
  if (isRecord(point.used)) for (const [kind, value] of Object.entries(point.used)) if (typeof value === 'number' && Number.isFinite(value)) used[kind] = value
  return { ts: point.ts, ...(Object.keys(used).length ? { used } : {}), ...(typeof point.credits === 'number' && Number.isFinite(point.credits) ? { credits: point.credits } : {}), ...(typeof point.plan === 'string' && point.plan ? { plan: point.plan } : {}), ...(Number.isFinite(point.sampleIntervalSeconds) && point.sampleIntervalSeconds > 0 ? { sampleIntervalSeconds: point.sampleIntervalSeconds } : {}) }
}

/**
 * Append-only JSONL history with per-provider/account filtering and daily
 * compaction. Points written before multi-provider support carry no provider
 * and read back as the Codex account they were recorded for.
 */
export class QuotaHistory {
  constructor(path, { now = () => Date.now() } = {}) {
    this.path = path
    this.now = now
    this.operations = Promise.resolve()
  }

  exclusive(operation) {
    const pending = this.operations.then(operation)
    this.operations = pending.catch(() => {})
    return pending
  }

  append(point) {
    return this.exclusive(async () => {
      await mkdir(dirname(this.path), { recursive: true, mode: 0o700 }).catch(error => { throw new Error(`quota history directory unavailable: ${error?.message ?? error}`) })
      await appendFile(this.path, `${JSON.stringify(point)}\n`, { flag: 'a', mode: 0o600 })
    })
  }

  /**
   * Read one account's points. The account may be a list: a credential whose
   * stable account id changed (Codex moved from the account UUID to the login
   * email) passes both spellings so its older points fold into one curve.
   */
  async read(provider, accounts, sinceTs, scope = {}) {
    const wanted = new Set(Array.isArray(accounts) ? accounts : [accounts])
    let text
    try {
      text = await readFile(this.path, 'utf8')
    } catch (error) {
      if (error?.code === 'ENOENT') return []
      throw error
    }
    const rows = []
    for (const line of text.split('\n')) {
      if (!line.trim()) continue
      try { const point = JSON.parse(line); if (isRecord(point) && Number.isFinite(point.ts)) rows.push(point) } catch { /* skip malformed lines */ }
    }
    scope = { ...scope }
    if (provider === DEFAULT_PROVIDER && scope.accountId) {
      const workspaces = new Map(), members = new Map()
      for (const point of rows) {
        if ((point.provider ?? DEFAULT_PROVIDER) !== provider || typeof point.accountId !== 'string' || !point.accountId || typeof point.account !== 'string' || !point.account.includes('@')) continue
        const email = point.account.trim().toLowerCase()
        if (!workspaces.has(email)) workspaces.set(email, new Set())
        workspaces.get(email).add(point.accountId)
        if (!members.has(point.accountId)) members.set(point.accountId, new Set())
        members.get(point.accountId).add(email)
      }
      scope.email ??= [...wanted].find(account => typeof account === 'string' && account.includes('@'))
      scope.legacyAccount ??= scope.accountId
      scope.ambiguousEmail ||= (workspaces.get(scope.email?.trim().toLowerCase())?.size || 0) > 1
      scope.ambiguousLegacy ||= (members.get(scope.accountId)?.size || 0) > 1
    }
    const byHour = new Map()
    for (const point of rows) {
      if (!wanted.has(point.account) || point.ts < sinceTs) continue
      if ((point.provider ?? 'openai-codex') !== provider) continue
      if (provider === DEFAULT_PROVIDER) {
        if (point.accountId && (!scope.accountId || point.accountId !== scope.accountId)) continue
        if (!point.accountId && (scope.ambiguousEmail && point.account === scope.email || scope.ambiguousLegacy && point.account === scope.legacyAccount)) continue
      }
      if ((provider === 'zai' || provider === 'zai-coding-cn') && (point.queryScope || 'personal') !== (scope.queryScope || 'personal')) continue
      const hour = Math.floor(point.ts / 3600)
      const previous = byHour.get(hour)
      const exact = provider === DEFAULT_PROVIDER && !!point.accountId
      if (!previous || exact && !previous.exact || exact === previous.exact && point.ts >= previous.point.ts) byHour.set(hour, { exact, point })
    }
    return [...byHour.values()].map(entry => sanitizePoint(entry.point)).sort((a, b) => a.ts - b.ts)
  }

  compact(retentionDays) { return this.exclusive(() => this.compactNow(retentionDays)) }

  async compactNow(retentionDays) {
    let text
    try {
      text = await readFile(this.path, 'utf8')
    } catch (error) {
      if (error?.code === 'ENOENT') return false
      throw error
    }
    const lines = text.split('\n').filter(line => line.trim().length > 0)
    const cutoff = Math.floor(this.now() / 1000) - Math.max(1, retentionDays) * 86_400
    const newestPerAccount = new Map()
    const kept = []
    for (const line of lines) {
      let point
      try { point = JSON.parse(line) } catch { continue }
      if (!isRecord(point) || typeof point.ts !== 'number') continue
      const key = JSON.stringify([point.provider ?? DEFAULT_PROVIDER, point.account, point.accountId || '', point.queryScope || 'personal'])
      if (!newestPerAccount.has(key) || point.ts > newestPerAccount.get(key).ts) newestPerAccount.set(key, point)
      if (point.ts >= cutoff) kept.push(point)
    }
    for (const newest of newestPerAccount.values()) if (!kept.includes(newest)) kept.push(newest)
    if (kept.length === lines.length) return false
    kept.sort((a, b) => a.ts - b.ts)
    const tmp = `${this.path}.${randomUUID()}.tmp`
    await mkdir(dirname(this.path), { recursive: true, mode: 0o700 }).catch(() => {})
    await writeFile(tmp, `${kept.map(point => JSON.stringify(point)).join('\n')}\n`, { mode: 0o600 })
    await rename(tmp, this.path)
    return true
  }
}

async function fetchBody(request, fetchImpl, signal) {
  let response
  try {
    response = await fetchImpl(request.url, {
      method: 'GET',
      redirect: 'error',
      signal,
      headers: { ...request.headers, 'user-agent': request.headers?.['user-agent'] ?? 'dsh-provider-hub-quota' },
    })
  } catch (error) {
    if (signal?.aborted) throw new SearchError('Quota query aborted', 'CANCELLED', error)
    throw new SearchError('Quota request failed', 'PROVIDER_ERROR', error)
  }
  const text = await boundedText(response, signal)
  if (!response.ok) {
    const error = new SearchError(`quota endpoint returned HTTP ${response.status}`, response.status === 401 || response.status === 403 ? 'CREDENTIAL_MISSING' : 'PROVIDER_ERROR')
    error.statusCode = response.status
    throw error
  }
  try {
    return text.length === 0 ? undefined : JSON.parse(text)
  } catch {
    throw new QuotaFormatError(`quota response is not valid JSON (HTTP ${response.status})`)
  }
}

/**
 * Host-side quota service across every registered provider route. `snapshot`
 * serves the browser card (cache-first with a spacing clamp per provider); the
 * recorder polls hourly and appends one history point per usable account while
 * DSH runs. Token refresh stays out of scope on purpose.
 */
export class QuotaService extends TypertRemoteService {
  static inject = ['credentials']

  constructor(ctx, options = {}) {
    super(ctx, 'quota')
    this.install(options)
  }

  install(options = {}) {
    this.quotaOptions = options
    this.now = options.now ?? (() => Date.now())
    this.fetchImpl = options.fetch ?? fetch
    this.keyPool = options.keyPool
    this.codexAccounts = options.codexAccounts
    this.historyStore = options.history ?? new QuotaHistory(quotaHistoryPath(options.homeDir), { now: this.now })
    this.caches = new Map()
    this.lastGood = new Map()
    this.inflight = new Map()
    this.lastFetchAttemptAt = new Map()
    this.lastCompactDay = -1
    this.recorderStarted = false
    this.recorderInFlight = undefined
    this.recorderTimers = options.recorderTimers ?? { setTimeout, clearTimeout }
    this.initialSampleRequested = false
    this.initialSampleDrain = undefined
    this.recorderDisposed = false
    options.onReady?.(this)
    if (options.startRecorder !== false) this.startRecorder()
    return this
  }

  readQuotaConfig() {
    return this.quotaOptions.readConfig?.() ?? {}
  }

  /** The provider route for one request, defaulting to the Codex grant. */
  providerOf(request) {
    const id = typeof request?.provider === 'string' && request.provider ? request.provider : DEFAULT_PROVIDER
    return quotaProvider(id)
  }

  /** Cache scope: one provider route, plus the pool key or Codex grant when one is named. */
  scope(provider, keyId, grantId) {
    return keyId ? `${provider.id}#${keyId}` : grantId ? `${provider.id}#grant:${grantId}` : provider.id
  }

  /** Valid credential + stable account id, or why it is unavailable. */
  async credential(provider, keyId, grantId) {
    if (!provider) return { state: 'unsupported' }
    if ((keyId && grantId) || (grantId && provider.id !== 'openai-codex')) return { state: 'signed-out' }
    if (keyId) {
      const secret = await this.keyPool?.secretOf(keyId).catch(() => undefined)
      if (!secret || secret.entry.provider !== provider.id) return { state: 'signed-out' }
      return { state: 'ok', access: secret.value, account: apiKeyAccount(secret.value), keyId, ...keyMetadata(secret.entry) }
    }
    if (grantId) {
      const grant = await this.codexAccounts?.grant(grantId)
      if (!grant) return { state: 'signed-out' }
      const identity = identityFromToken(grant.access)
      const account = identity.email ?? grant.accountId
      const expires = typeof grant.expires === 'number' && Number.isFinite(grant.expires) ? grant.expires : undefined
      const view = { access: grant.access, account, accountId: grant.accountId, grantId, ...(expires !== undefined ? { expires } : {}), ...(grant.accountId && grant.accountId !== account ? { legacyAccount: grant.accountId } : {}) }
      return expires !== undefined && this.now() >= expires - TOKEN_EXPIRY_MARGIN_MS ? { state: 'expired', ...view } : { state: 'ok', ...view }
    }
    try {
      const credential = await provider.credential(this.ctx, { now: this.now })
      if (isZai(provider) && credential.access && this.keyPool?.activeMetadata) return { ...credential, ...await this.keyPool.activeMetadata(provider.id, credential.access) }
      return credential
    } catch {
      return { state: 'signed-out' }
    }
  }

  async snapshot(request = {}) {
    const provider = this.providerOf(request)
    if (!provider?.credential || provider.unsupported) return { status: 'unsupported', ...(provider?.unsupported ?? { message: 'quota is not available for this provider' }) }
    const keyId = typeof request?.keyId === 'string' && request.keyId ? request.keyId : undefined
    const grantId = typeof request?.grantId === 'string' && request.grantId ? request.grantId : undefined
    const credential = await this.credential(provider, keyId, grantId)
    if (credential.state !== 'ok') return this.unavailableStatus(credential, provider)
    const maxAgeMs = clampInt(request?.maxAgeMs, 0, 24 * 60 * 60_000, DEFAULT_MAX_AGE_MS)
    const cache = this.caches.get(this.scope(provider, keyId, grantId))
    if (cache && cache.identity === identityOf(provider, credential) && this.now() - cache.fetchedAt <= maxAgeMs) {
      return { status: 'ok', snapshot: cache.snapshot, fetchedAt: Math.floor(cache.fetchedAt / 1000), cached: true }
    }
    return this.fetchFresh(provider, credential)
  }

  unavailableStatus(credential, provider) {
    if (credential.state === 'expired') return { status: 'expired' }
    return { status: 'signed-out', ...(provider?.unsupported ? provider.unsupported : {}) }
  }

  async history(request = {}) {
    const hours = clampInt(request?.hours, 1, 24 * 366, 168)
    const provider = this.providerOf(request)
    if (!provider?.credential || provider.unsupported) return { status: 'unsupported', points: [], ...(provider?.unsupported ?? {}) }
    const keyId = typeof request?.keyId === 'string' && request.keyId ? request.keyId : undefined
    const grantId = typeof request?.grantId === 'string' && request.grantId ? request.grantId : undefined
    const credential = await this.credential(provider, keyId, grantId)
    const quotaConfig = this.readQuotaConfig()
    const sampleIntervalSeconds = intervalSeconds(quotaConfig)
    const target = `${provider.id}${keyId ? `#${keyId}` : grantId ? `#grant:${grantId}` : ''}`
    const matchesLastIdentity = this.lastRecorderResults?.identities?.[target] === identityOf(provider, credential)
    const lastStatus = matchesLastIdentity ? this.lastRecorderResults.statuses[target] : undefined
    const sampling = { enabled: quotaConfig.quotaRecord !== false, status: quotaConfig.quotaRecord === false ? 'disabled' : lastStatus ?? (this.lastRecorderResults ? 'not-probed' : 'pending'), ...(matchesLastIdentity ? { lastTickAt: this.lastRecorderResults.at } : {}) }
    if (!credential.account || !['ok', 'expired'].includes(credential.state)) return { status: credential.state, points: [], sampleIntervalSeconds, sampling }
    const since = Math.floor(this.now() / 1000) - hours * 3600
    const accounts = [credential.account, ...(credential.legacyAccount && credential.legacyAccount !== credential.account ? [credential.legacyAccount] : [])]
    const scope = { ...(credential.accountId ? { accountId: credential.accountId } : {}), ...(provider.id === DEFAULT_PROVIDER ? { email: credential.account, legacyAccount: credential.legacyAccount } : {}), ...(isZai(provider) ? { queryScope: quotaQueryScope(credential) } : {}) }
    if (provider.id === DEFAULT_PROVIDER && this.codexAccounts?.slots) {
      try {
        const known = [{ email: identityFromToken(credential.access).email?.trim().toLowerCase(), accountId: credential.accountId }, ...(await this.codexAccounts.slots()).map(slot => ({ email: identityFromToken(slot.payload.access).email?.trim().toLowerCase(), accountId: slot.payload.accountId }))]
        const email = identityFromToken(credential.access).email?.trim().toLowerCase()
        scope.email = credential.account
        scope.legacyAccount = credential.legacyAccount
        scope.ambiguousEmail = !!email && new Set(known.filter(item => item.email === email && item.accountId).map(item => item.accountId)).size > 1
        scope.ambiguousLegacy = !!credential.accountId && new Set(known.filter(item => item.accountId === credential.accountId && item.email).map(item => item.email)).size > 1
      } catch { scope.email = credential.account; scope.legacyAccount = credential.legacyAccount; scope.ambiguousEmail = scope.ambiguousLegacy = true }
    }
    // Local historical data remains readable after token expiry, with its
    // expired status intact. Ambiguous unscoped legacy rows are never guessed.
    return { status: credential.state, points: await this.historyStore.read(provider.id, accounts, since, scope), sampleIntervalSeconds, sampling, ...(scope.ambiguousEmail || scope.ambiguousLegacy ? { legacyAmbiguous: true } : {}) }
  }

  async fetchFresh(provider, credential, { force = false } = {}) {
    const scope = this.scope(provider, credential.keyId, credential.grantId)
    const pending = this.inflight.get(scope)
    const identity = identityOf(provider, credential)
    if (pending && pending.identity === identity) return pending.promise
    const cache = this.caches.get(scope)
    if (!force && cache && cache.identity === identity && this.now() - (this.lastFetchAttemptAt.get(scope) ?? -Infinity) < MIN_FETCH_SPACING_MS) {
      return { status: 'ok', snapshot: cache.snapshot, fetchedAt: Math.floor(cache.fetchedAt / 1000), cached: true, throttled: true }
    }
    const promise = this.runFetch(provider, credential)
    this.inflight.set(scope, { account: credential.account, identity, promise })
    try {
      return await promise
    } finally {
      if (this.inflight.get(scope)?.promise === promise) this.inflight.delete(scope)
    }
  }

  async runFetch(provider, credential) {
    const controller = new AbortController()
    const timeoutMs = clampInt(this.quotaOptions.timeoutMs, 1, 300000, 15000)
    let timer
    const deadline = new Promise(resolve => {
      timer = setTimeout(() => {
        controller.abort()
        const last = this.lastGood.get(this.scope(provider, credential.keyId, credential.grantId))
        resolve({ status: 'network', message: '额度查询超时，请稍后重试', ...(last?.identity === identityOf(provider, credential) ? { lastSnapshot: last.snapshot, lastFetchAt: Math.floor(last.fetchedAt / 1000) } : {}) })
      }, timeoutMs)
    })
    try { return await Promise.race([this.readFresh(provider, credential, controller.signal), deadline]) }
    finally { clearTimeout(timer) }
  }

  async readFresh(provider, credential, signal) {
    const scope = this.scope(provider, credential.keyId, credential.grantId)
    this.lastFetchAttemptAt.set(scope, this.now())
    const lastGood = this.lastGood.get(scope)
    const staleForAccount = lastGood && lastGood.identity === identityOf(provider, credential) ? { lastSnapshot: lastGood.snapshot, lastFetchAt: Math.floor(lastGood.fetchedAt / 1000) } : {}
    try {
      const read = request => { if (signal.aborted) throw new SearchError('Quota query aborted', 'CANCELLED'); return fetchBody(request, this.fetchImpl, signal) }
      const candidates = provider.requests(credential, this.readQuotaConfig())
      let parsed
      let lastError
      let unavailable
      for (const candidate of candidates) {
        if (candidate.unavailable) { unavailable = candidate.unavailable; continue }
        try {
          const body = await read(candidate)
          parsed = (candidate.parse ?? provider.parse)(body)
          break
        } catch (error) {
          if (signal.aborted) throw error
          lastError = error
        }
      }
      if (!parsed) {
        if (unavailable && lastError instanceof QuotaFormatError) {
          return { status: 'unsupported', ...unavailable, ...staleForAccount }
        }
        throw lastError ?? new QuotaFormatError('quota endpoint produced no candidate response')
      }
      if (provider.enrich) parsed = await provider.enrich(parsed, credential, read)
      if (provider.id === DEFAULT_PROVIDER && (!parsed.email || !parsed.plan)) {
        const identity = identityFromToken(credential.access)
        if (!parsed.email && identity.email) parsed.email = identity.email
        if (!parsed.plan && identity.plan) parsed.plan = identity.plan
      }
      if (signal.aborted) throw new SearchError('Quota query aborted', 'CANCELLED')
      const snapshot = { ...parsed, account: credential.account, provider: provider.id, fetchedAt: Math.floor(this.now() / 1000) }
      const cache = { snapshot, fetchedAt: this.now(), account: credential.account, identity: identityOf(provider, credential) }
      this.caches.set(scope, cache)
      this.lastGood.set(scope, cache)
      return { status: 'ok', snapshot, fetchedAt: snapshot.fetchedAt }
    } catch (error) {
      if (error instanceof QuotaFormatError) return { status: 'unsupported', message: error.message, ...(provider.unsupported ?? {}), ...staleForAccount }
      if (error instanceof SearchError && error.code === 'CREDENTIAL_MISSING') return { status: 'expired', message: '额度查询被拒绝，令牌或 API Key 可能已失效；请在模型页更新凭据后点刷新重试', ...staleForAccount }
      return { status: 'network', message: '额度查询失败，请检查网络连接', ...staleForAccount }
    }
  }

  /** Record one immutable credential snapshot without activating or refreshing it. */
  async recordProvider(provider, keyId, grantId, prepared) {
    if (provider.unsupported || !provider.requests) return 'unsupported'
    const credential = prepared ?? await this.credential(provider, keyId, grantId)
    if (credential.state !== 'ok') return credential.state
    const result = await this.fetchFresh(provider, credential, { force: true })
    if (result.status !== 'ok' || !result.snapshot) return result.status
    const used = {}
    for (const window of result.snapshot.windows) used[window.kind] = window.usedPercent
    await this.historyStore.append({
      ts: result.snapshot.fetchedAt,
      provider: provider.id,
      account: result.snapshot.account,
      ...(credential.accountId ? { accountId: credential.accountId } : {}),
      ...(isZai(provider) ? { queryScope: quotaQueryScope(credential) } : {}),
      sampleIntervalSeconds: intervalSeconds(this.readQuotaConfig()),
      ...(Object.keys(used).length ? { used } : {}),
      ...(typeof result.snapshot.credits?.balance === 'number' && Number.isFinite(result.snapshot.credits.balance) ? { credits: result.snapshot.credits.balance } : {}),
      ...(typeof result.snapshot.plan === 'string' && result.snapshot.plan ? { plan: result.snapshot.plan.slice(0, 32) } : {}),
    })
    return 'ok'
  }

  /** Account commits trigger a first sample without waiting for the hourly tick.
   * If a tick already captured its targets, wait for it and scan again. Adds
   * arriving during that scan request one more pass, never an overlapping tick.
   */
  requestInitialSample() {
    if (this.recorderDisposed) return Promise.resolve('disabled')
    this.initialSampleRequested = true
    if (this.initialSampleDrain) return this.initialSampleDrain
    const pending = (async () => {
      if (this.recorderInFlight) await this.recorderInFlight.catch(() => {})
      while (this.initialSampleRequested && !this.recorderDisposed) {
        this.initialSampleRequested = false
        await this.record()
      }
    })()
    this.initialSampleDrain = pending
    const done = () => {
      if (this.initialSampleDrain === pending) this.initialSampleDrain = undefined
      // An add callback can run between the loop resolving and this finalizer.
      // Consume that tail notification instead of leaving it until an hour tick.
      if (this.initialSampleRequested && !this.recorderDisposed) void this.requestInitialSample().catch(() => {
        this.ctx?.logger?.warn?.('Initial account quota rescan failed; scheduled sampling will continue')
      })
    }
    void pending.then(done, done)
    return pending
  }

  /** Coalesce manual and timer ticks so append/compact cannot race each other. */
  record() {
    if (this.recorderInFlight) return this.recorderInFlight
    const pending = this.recordNow()
    this.recorderInFlight = pending
    const done = () => { if (this.recorderInFlight === pending) this.recorderInFlight = undefined }
    void pending.then(done, done)
    return pending
  }

  async recordNow() {
    const config = this.readQuotaConfig()
    if (config.quotaRecord === false) return 'disabled'
    const poolEntries = await this.keyPool?.list?.().catch(() => []) ?? []
    const grants = await this.codexAccounts?.list?.().catch(() => []) ?? []
    const targets = QUOTA_PROVIDERS.flatMap(provider => [
      [provider, undefined, undefined],
      ...poolEntries.filter(entry => entry.provider === provider.id).map(entry => [provider, entry.id, undefined]),
      ...(provider.id === DEFAULT_PROVIDER ? grants.map(entry => [provider, undefined, entry.id]) : []),
    ])
    // Resolve all identities before launching upstream work. Do not trust the
    // list view's active bit: a user may switch while the tick is preparing.
    const prepared = await Promise.all(targets.map(async ([provider, keyId, grantId]) => ({ provider, keyId, grantId,
      credential: provider.unsupported || !provider.requests ? { state: 'unsupported' } : await this.credential(provider, keyId, grantId).catch(() => ({ state: 'network' })),
    })))
    const groups = new Map()
    for (const target of prepared) {
      const key = `${target.provider.id}${target.keyId ? `#${target.keyId}` : target.grantId ? `#grant:${target.grantId}` : ''}`
      const identity = target.provider.id === DEFAULT_PROVIDER && target.credential.state === 'ok' ? identityOf(target.provider, target.credential) : key
      if (!groups.has(identity)) groups.set(identity, [])
      groups.get(identity).push({ ...target, key })
    }
    const results = (await Promise.all([...groups.values()].map(async members => {
      members.sort((left, right) => (right.credential.expires || 0) - (left.credential.expires || 0))
      const statuses = [], attempted = new Set()
      let success = false, failure = 'network'
      for (const { provider, keyId, grantId, credential, key } of members) {
        if (success) { statuses.push([key, 'covered']); continue }
        if (credential.access && attempted.has(credential.access)) { statuses.push([key, failure]); continue }
        if (credential.access) attempted.add(credential.access)
        failure = await this.recordProvider(provider, keyId, grantId, credential).catch(() => 'network')
        success = failure === 'ok'
        statuses.push([key, failure])
      }
      return statuses
    }))).flat()
    const identities = Object.fromEntries(prepared.map(({ provider, keyId, grantId, credential }) => [`${provider.id}${keyId ? `#${keyId}` : grantId ? `#grant:${grantId}` : ''}`, identityOf(provider, credential)]))
    this.lastRecorderResults = { at: Math.floor(this.now() / 1000), statuses: Object.fromEntries(results), identities }
    await this.maybeCompact(config).catch(() => {
      this.ctx?.logger?.warn?.('Quota history compaction failed; recorded points were retained and maintenance will retry')
    })
    return this.lastRecorderResults.statuses
  }

  async maybeCompact(config) {
    const day = Math.floor(this.now() / 86_400_000)
    if (day - this.lastCompactDay < 1) return
    await this.historyStore.compact(clampInt(config.quotaHistoryDays, 1, 3650, DEFAULT_HISTORY_DAYS))
    this.lastCompactDay = day
  }

  /** Hourly background loop; survives errors and follows interval config changes. */
  startRecorder() {
    if (this.recorderStarted) return
    this.recorderStarted = true
    let stopped = false
    let timer
    const schedule = startedAt => {
      const intervalMs = intervalSeconds(this.readQuotaConfig()) * 1000
      const elapsed = Math.max(0, this.now() - startedAt)
      // Anchor to the tick start, not completion. Slow probes do not add drift;
      // missed slots are skipped rather than burst-filled with invented past data.
      const nextDue = startedAt + (Math.floor(elapsed / intervalMs) + 1) * intervalMs
      timer = this.recorderTimers.setTimeout(tick, Math.max(0, nextDue - this.now()))
      if (typeof timer?.unref === 'function') timer.unref()
    }
    const tick = async () => {
      if (stopped) return
      const startedAt = this.now()
      try {
        await this.record()
      } catch {
        // A failed target/tick must never permanently stop future sampling.
      } finally { if (!stopped) schedule(startedAt) }
    }
    timer = this.recorderTimers.setTimeout(tick, RECORDER_FIRST_DELAY_MS)
    if (typeof timer?.unref === 'function') timer.unref()
    this.ctx.effect(() => () => {
      stopped = true
      this.recorderDisposed = true
      if (timer) this.recorderTimers.clearTimeout(timer)
    }, 'dsh-provider-hub: quota recorder')
  }
}
