// Multi-provider account quota: read-only queries against each provider's own
// usage endpoint plus an hourly local recorder. Credentials are only ever
// read; tokens are never refreshed, logged, or returned to the browser.
import { appendFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { SearchError, boundedText, isRecord } from './search.js'
import { QuotaFormatError, clampInt, windowKind } from './quota-core.js'
import { QUOTA_PROVIDERS, apiKeyAccount, quotaProvider, identityFromToken, parseQuotaBody, parseResetCreditsBody } from './quota-providers.js'

const TOKEN_EXPIRY_MARGIN_MS = 5 * 60_000
const DEFAULT_MAX_AGE_MS = 300_000
const DEFAULT_INTERVAL_MINUTES = 60
const DEFAULT_HISTORY_DAYS = 180
const MIN_FETCH_SPACING_MS = 60_000
const RECORDER_FIRST_DELAY_MS = 10_000
const DEFAULT_PROVIDER = 'openai-codex'

export { QuotaFormatError, identityFromToken, parseQuotaBody, parseResetCreditsBody, windowKind }

/** Where the hourly recorder persists its points: $DSH_HOME/dsh-provider-hub/. */
export function quotaHistoryPath(homeDir) {
  const base = homeDir ?? process.env.DSH_HOME ?? join(homedir(), '.dsh')
  return join(base, 'dsh-provider-hub', 'quota-history.jsonl')
}

function sanitizePoint(point) {
  const used = {}
  if (isRecord(point.used)) for (const [kind, value] of Object.entries(point.used)) if (typeof value === 'number' && Number.isFinite(value)) used[kind] = value
  return { ts: point.ts, ...(Object.keys(used).length ? { used } : {}), ...(typeof point.credits === 'number' && Number.isFinite(point.credits) ? { credits: point.credits } : {}), ...(typeof point.plan === 'string' && point.plan ? { plan: point.plan } : {}) }
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
  }

  async append(point) {
    await mkdir(dirname(this.path), { recursive: true, mode: 0o700 }).catch(error => { throw new Error(`quota history directory unavailable: ${error?.message ?? error}`) })
    await appendFile(this.path, `${JSON.stringify(point)}\n`, { flag: 'a', mode: 0o600 })
  }

  /**
   * Read one account's points. The account may be a list: a credential whose
   * stable account id changed (Codex moved from the account UUID to the login
   * email) passes both spellings so its older points fold into one curve.
   */
  async read(provider, accounts, sinceTs) {
    const wanted = new Set(Array.isArray(accounts) ? accounts : [accounts])
    let text
    try {
      text = await readFile(this.path, 'utf8')
    } catch (error) {
      if (error?.code === 'ENOENT') return []
      throw error
    }
    const byHour = new Map()
    for (const line of text.split('\n')) {
      if (!line.trim()) continue
      let point
      try { point = JSON.parse(line) } catch { continue }
      if (!isRecord(point) || typeof point.ts !== 'number' || !wanted.has(point.account) || point.ts < sinceTs) continue
      if ((point.provider ?? 'openai-codex') !== provider) continue
      byHour.set(Math.floor(point.ts / 3600), sanitizePoint(point))
    }
    return [...byHour.values()].sort((a, b) => a.ts - b.ts)
  }

  async compact(retentionDays) {
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
      const key = `${point.provider ?? 'openai-codex'}\u0000${point.account}`
      if (!newestPerAccount.has(key) || point.ts > newestPerAccount.get(key).ts) newestPerAccount.set(key, point)
      if (point.ts >= cutoff) kept.push(point)
    }
    for (const newest of newestPerAccount.values()) if (!kept.includes(newest)) kept.push(newest)
    if (kept.length === lines.length) return false
    kept.sort((a, b) => a.ts - b.ts)
    const tmp = `${this.path}.tmp`
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
      return { state: 'ok', access: secret.value, account: apiKeyAccount(secret.value), keyId }
    }
    if (grantId) {
      const grant = await this.codexAccounts?.grant(grantId)
      if (!grant) return { state: 'signed-out' }
      const identity = identityFromToken(grant.access)
      const account = identity.email ?? grant.accountId
      const expires = typeof grant.expires === 'number' && Number.isFinite(grant.expires) ? grant.expires : undefined
      const view = { access: grant.access, account, accountId: grant.accountId, grantId, ...(grant.accountId && grant.accountId !== account ? { legacyAccount: grant.accountId } : {}) }
      return expires !== undefined && this.now() >= expires - TOKEN_EXPIRY_MARGIN_MS ? { state: 'expired', ...view } : { state: 'ok', ...view }
    }
    try {
      return await provider.credential(this.ctx, { now: this.now })
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
    if (cache && cache.account === credential.account && this.now() - cache.fetchedAt <= maxAgeMs) {
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
    if (credential.state !== 'ok') return { status: credential.state, points: [] }
    const since = Math.floor(this.now() / 1000) - hours * 3600
    // Account-id spellings that ever named this same credential (the Codex
    // account UUID before the login-email switch) read as one curve.
    const accounts = [credential.account, ...(credential.legacyAccount && credential.legacyAccount !== credential.account ? [credential.legacyAccount] : [])]
    return { status: 'ok', points: await this.historyStore.read(provider.id, accounts, since) }
  }

  async fetchFresh(provider, credential, { force = false } = {}) {
    const scope = this.scope(provider, credential.keyId, credential.grantId)
    const pending = this.inflight.get(scope)
    if (pending && pending.account === credential.account) return pending.promise
    const cache = this.caches.get(scope)
    if (!force && cache && cache.account === credential.account && this.now() - (this.lastFetchAttemptAt.get(scope) ?? -Infinity) < MIN_FETCH_SPACING_MS) {
      return { status: 'ok', snapshot: cache.snapshot, fetchedAt: Math.floor(cache.fetchedAt / 1000), cached: true, throttled: true }
    }
    const promise = this.runFetch(provider, credential)
    this.inflight.set(scope, { account: credential.account, promise })
    try {
      return await promise
    } finally {
      if (this.inflight.get(scope)?.promise === promise) this.inflight.delete(scope)
    }
  }

  async runFetch(provider, credential) {
    const scope = this.scope(provider, credential.keyId, credential.grantId)
    this.lastFetchAttemptAt.set(scope, this.now())
    const lastGood = this.lastGood.get(scope)
    const staleForAccount = lastGood && lastGood.account === credential.account ? { lastSnapshot: lastGood.snapshot, lastFetchAt: Math.floor(lastGood.fetchedAt / 1000) } : {}
    try {
      const read = request => fetchBody(request, this.fetchImpl)
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
      const snapshot = { ...parsed, account: credential.account, provider: provider.id, fetchedAt: Math.floor(this.now() / 1000) }
      const cache = { snapshot, fetchedAt: this.now(), account: credential.account }
      this.caches.set(scope, cache)
      this.lastGood.set(scope, cache)
      return { status: 'ok', snapshot, fetchedAt: snapshot.fetchedAt }
    } catch (error) {
      if (error instanceof QuotaFormatError) return { status: 'unsupported', message: error.message, ...(provider.unsupported ?? {}), ...staleForAccount }
      if (error instanceof SearchError && error.code === 'CREDENTIAL_MISSING') return { status: 'expired', message: '额度查询被拒绝，令牌或 API Key 可能已失效；请在模型页更新凭据后点刷新重试', ...staleForAccount }
      return { status: 'network', message: '额度查询失败，请检查网络连接', ...staleForAccount }
    }
  }

  /** One recorder tick for a single provider route (optionally one pool key). */
  async recordProvider(provider, keyId) {
    if (provider.unsupported || !provider.requests) return 'unsupported'
    const credential = await this.credential(provider, keyId)
    if (credential.state !== 'ok') return credential.state
    const result = await this.fetchFresh(provider, credential, { force: true })
    if (result.status !== 'ok' || !result.snapshot) return result.status
    const used = {}
    for (const window of result.snapshot.windows) used[window.kind] = window.usedPercent
    await this.historyStore.append({
      ts: result.snapshot.fetchedAt,
      provider: provider.id,
      account: result.snapshot.account,
      ...(Object.keys(used).length ? { used } : {}),
      ...(typeof result.snapshot.credits?.balance === 'number' && Number.isFinite(result.snapshot.credits.balance) ? { credits: result.snapshot.credits.balance } : {}),
      ...(typeof result.snapshot.plan === 'string' && result.snapshot.plan ? { plan: result.snapshot.plan.slice(0, 32) } : {}),
    })
    return 'ok'
  }

  /** One recorder tick: fetch the active credential and every pool key. */
  async record() {
    const config = this.readQuotaConfig()
    if (config.quotaRecord === false) return 'disabled'
    const poolEntries = await this.keyPool?.list().catch(() => []) ?? []
    const targets = QUOTA_PROVIDERS.flatMap(provider => [
      [provider, undefined],
      ...poolEntries.filter(entry => entry.provider === provider.id).map(entry => [provider, entry.id]),
    ])
    const results = await Promise.all(targets.map(async ([provider, keyId]) => [`${provider.id}${keyId ? `#${keyId}` : ''}`, await this.recordProvider(provider, keyId).catch(() => 'network')]))
    await this.maybeCompact(config)
    return Object.fromEntries(results)
  }

  async maybeCompact(config) {
    const day = Math.floor(this.now() / 86_400_000)
    if (day - this.lastCompactDay < 1) return
    this.lastCompactDay = day
    await this.historyStore.compact(clampInt(config.quotaHistoryDays, 1, 3650, DEFAULT_HISTORY_DAYS))
  }

  /** Hourly background loop; survives errors and follows interval config changes. */
  startRecorder() {
    if (this.recorderStarted) return
    this.recorderStarted = true
    let stopped = false
    let timer
    const schedule = () => {
      const minutes = clampInt(this.readQuotaConfig().quotaIntervalMinutes, 1, 1440, DEFAULT_INTERVAL_MINUTES)
      timer = setTimeout(tick, minutes * 60_000)
      if (typeof timer?.unref === 'function') timer.unref()
    }
    const tick = async () => {
      if (stopped) return
      try {
        await this.record()
      } catch {
        // The recorder never propagates failures to the host loop.
      }
      if (!stopped) schedule()
    }
    timer = setTimeout(tick, RECORDER_FIRST_DELAY_MS)
    if (typeof timer?.unref === 'function') timer.unref()
    this.ctx.effect(() => () => {
      stopped = true
      if (timer) clearTimeout(timer)
    }, 'dsh-provider-hub: quota recorder')
  }
}
