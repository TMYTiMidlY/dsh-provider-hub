// Codex account quota: read-only queries against the ChatGPT backend usage
// endpoint plus an hourly local recorder. Credentials are only ever read;
// tokens are never refreshed, logged, or returned to the browser.
import { appendFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { accountIdFromToken, boundedText, isRecord, SearchError, storedGrantAccess } from './search.js'

const USAGE_URL = 'https://chatgpt.com/backend-api/wham/usage'
const CREDENTIAL_KEY = 'llm-pi-ai/openai-codex'
const WEEKLY_THRESHOLD_SECONDS = 172_800
const MIN_FETCH_SPACING_MS = 60_000
const TOKEN_EXPIRY_MARGIN_MS = 5 * 60_000
const DEFAULT_MAX_AGE_MS = 300_000
const DEFAULT_INTERVAL_MINUTES = 60
const DEFAULT_HISTORY_DAYS = 180
const RECORDER_FIRST_DELAY_MS = 10_000

export class QuotaFormatError extends Error {
  constructor(message) {
    super(message)
    this.name = 'QuotaFormatError'
  }
}

const clampInt = (value, min, max, fallback) => {
  const n = Number(value)
  if (!Number.isInteger(n) || n < min || n > max) return fallback
  return n
}

/** Classify a rate-limit window by its duration, never by its field position. */
export function windowKind(seconds) {
  return typeof seconds === 'number' && Number.isFinite(seconds) && seconds >= WEEKLY_THRESHOLD_SECONDS ? 'weekly' : 'short'
}

function readUsedPercent(window) {
  for (const key of ['used_percent', 'usedPercent']) {
    const value = window[key]
    if (typeof value === 'number' && Number.isFinite(value)) return Math.min(100, Math.max(0, value))
  }
  for (const key of ['percent_left', 'percentLeft']) {
    const value = window[key]
    if (typeof value === 'number' && Number.isFinite(value)) return Math.min(100, Math.max(0, 100 - value))
  }
  return undefined
}

function readResetAt(window) {
  if (typeof window.reset_at === 'number' && Number.isFinite(window.reset_at)) {
    return Math.floor(window.reset_at > 1e12 ? window.reset_at / 1000 : window.reset_at)
  }
  if (typeof window.reset_time_ms === 'number' && Number.isFinite(window.reset_time_ms)) return Math.floor(window.reset_time_ms / 1000)
  for (const key of ['resetsAt', 'resetAt']) {
    if (typeof window[key] === 'string') {
      const parsed = Date.parse(window[key])
      if (!Number.isNaN(parsed)) return Math.floor(parsed / 1000)
    }
  }
  return undefined
}

function readWindow(window) {
  if (!isRecord(window)) return undefined
  const usedPercent = readUsedPercent(window)
  if (usedPercent === undefined) return undefined
  const seconds = typeof window.limit_window_seconds === 'number' && Number.isFinite(window.limit_window_seconds) ? Math.floor(window.limit_window_seconds) : undefined
  const resetAt = readResetAt(window)
  return { kind: windowKind(seconds), usedPercent, ...(seconds !== undefined ? { windowSeconds: seconds } : {}), ...(resetAt !== undefined ? { resetAt } : {}) }
}

/**
 * Normalize a wham/usage response. The endpoint is undocumented and its
 * schema has changed between versions, so every field is read through its
 * observed alias family and windows are classified by duration.
 */
export function parseQuotaBody(value) {
  if (!isRecord(value)) throw new QuotaFormatError('usage response is not an object')
  const root = isRecord(value.rate_limit) ? value.rate_limit : isRecord(value.rate_limits) ? value.rate_limits : undefined
  if (!root) throw new QuotaFormatError('usage response has no rate_limit windows')
  const windows = new Map()
  const consider = window => {
    const parsed = readWindow(window)
    if (parsed && !windows.has(parsed.kind)) windows.set(parsed.kind, parsed)
  }
  for (const family of [['five_hour', 'primary_window', 'primary'], ['weekly', 'secondary_window', 'secondary']]) {
    for (const key of family) {
      if (isRecord(root[key])) {
        consider(root[key])
        break
      }
    }
  }
  if (windows.size === 0) throw new QuotaFormatError('usage response has no usable rate-limit window')
  const credits = isRecord(value.credits)
    ? {
        ...(typeof value.credits.balance === 'number' || typeof value.credits.balance === 'string' ? { balance: Number.parseFloat(value.credits.balance) } : {}),
        ...(typeof value.credits.unlimited === 'boolean' ? { unlimited: value.credits.unlimited } : {}),
        ...(Array.isArray(value.credits.approx_local_messages) ? { approxLocalMessages: value.credits.approx_local_messages.filter(n => typeof n === 'number' && Number.isFinite(n)) } : {}),
      }
    : undefined
  const resetCredits = isRecord(value.rate_limit_reset_credits) && typeof value.rate_limit_reset_credits.available_count === 'number'
    ? { available: value.rate_limit_reset_credits.available_count }
    : undefined
  return {
    ...(typeof value.email === 'string' && value.email ? { email: value.email } : {}),
    ...(typeof value.plan_type === 'string' && value.plan_type ? { plan: value.plan_type } : {}),
    windows: [...windows.values()],
    ...(credits && (credits.balance !== undefined || credits.unlimited !== undefined) ? { credits } : {}),
    ...(resetCredits ? { resetCredits } : {}),
  }
}

/** Identity fallbacks decoded from the access token when the body omits them. */
export function identityFromToken(access) {
  try {
    const part = access.split('.')[1]
    const claims = JSON.parse(Buffer.from(part, 'base64url').toString('utf8'))
    const profile = isRecord(claims['https://api.openai.com/profile']) ? claims['https://api.openai.com/profile'] : {}
    const auth = isRecord(claims['https://api.openai.com/auth']) ? claims['https://api.openai.com/auth'] : {}
    const email = typeof profile.email === 'string' && profile.email ? profile.email : typeof claims.email === 'string' && claims.email ? claims.email : undefined
    const plan = typeof auth.chatgpt_plan_type === 'string' && auth.chatgpt_plan_type ? auth.chatgpt_plan_type : undefined
    return { ...(email ? { email } : {}), ...(plan ? { plan } : {}) }
  } catch {
    return {}
  }
}

/** Where the hourly recorder persists its points: $DSH_HOME/dsh-provider-hub/. */
export function quotaHistoryPath(homeDir) {
  const base = homeDir ?? process.env.DSH_HOME ?? join(homedir(), '.dsh')
  return join(base, 'dsh-provider-hub', 'quota-history.jsonl')
}

function sanitizePoint(point) {
  const used = {}
  if (isRecord(point.used)) for (const [kind, value] of Object.entries(point.used)) if (typeof value === 'number' && Number.isFinite(value)) used[kind] = value
  return { ts: point.ts, ...(Object.keys(used).length ? { used } : {}), ...(typeof point.credits === 'number' && Number.isFinite(point.credits) ? { credits: point.credits } : {}) }
}

/** Append-only JSONL history with per-account filtering and daily compaction. */
export class QuotaHistory {
  constructor(path, { now = () => Date.now() } = {}) {
    this.path = path
    this.now = now
  }

  async append(point) {
    await mkdir(dirname(this.path), { recursive: true, mode: 0o700 }).catch(error => { throw new Error(`quota history directory unavailable: ${error?.message ?? error}`) })
    await appendFile(this.path, `${JSON.stringify(point)}\n`, { flag: 'a', mode: 0o600 })
  }

  async read(account, sinceTs) {
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
      if (!isRecord(point) || typeof point.ts !== 'number' || point.account !== account || point.ts < sinceTs) continue
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
      if (!newestPerAccount.has(point.account) || point.ts > newestPerAccount.get(point.account).ts) newestPerAccount.set(point.account, point)
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

async function fetchUsageBody(credential, fetchImpl, signal) {
  let response
  try {
    response = await fetchImpl(USAGE_URL, {
      method: 'GET',
      redirect: 'error',
      signal,
      headers: { authorization: `Bearer ${credential.access}`, 'chatgpt-account-id': credential.accountId, accept: 'application/json', 'user-agent': 'codex_cli_rs' },
    })
  } catch (error) {
    if (signal?.aborted) throw new SearchError('Quota query aborted', 'CANCELLED', error)
    throw new SearchError('Quota request failed', 'PROVIDER_ERROR', error)
  }
  const text = await boundedText(response, signal)
  if (!response.ok) {
    const error = new SearchError(`Usage endpoint returned HTTP ${response.status}`, response.status === 401 || response.status === 403 ? 'CREDENTIAL_MISSING' : 'PROVIDER_ERROR')
    error.statusCode = response.status
    throw error
  }
  try {
    return text.length === 0 ? undefined : JSON.parse(text)
  } catch (error) {
    throw new QuotaFormatError(`usage response is not valid JSON (HTTP ${response.status})`)
  }
}

/**
 * Host-side quota service. `snapshot` serves the browser card (cache-first
 * with a spacing clamp); the recorder polls hourly and appends history while
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
    this.historyStore = options.history ?? new QuotaHistory(quotaHistoryPath(options.homeDir), { now: this.now })
    this.cache = undefined
    this.lastGood = undefined
    this.inflight = undefined
    this.lastFetchAttemptAt = -Infinity
    this.lastCompactDay = -1
    this.recorderStarted = false
    if (options.startRecorder !== false) this.startRecorder()
    return this
  }

  readQuotaConfig() {
    return this.quotaOptions.readConfig?.() ?? {}
  }

  /** Valid access token + account id, or why it is unavailable. */
  async credential() {
    const record = await this.ctx.credentials.readRecord(CREDENTIAL_KEY)
    const access = storedGrantAccess(record)
    if (!access) {
      const payload = isRecord(record?.payload) ? record.payload : {}
      const expires = typeof payload.expires === 'number' && Number.isFinite(payload.expires) ? payload.expires : undefined
      return expires !== undefined && this.now() >= expires - TOKEN_EXPIRY_MARGIN_MS ? { state: 'expired' } : { state: 'signed-out' }
    }
    const payload = isRecord(record.payload) ? record.payload : {}
    let accountId = typeof payload.accountId === 'string' && payload.accountId ? payload.accountId : undefined
    if (!accountId) {
      try {
        accountId = accountIdFromToken(access)
      } catch {
        return { state: 'expired' }
      }
    }
    return { state: 'ok', access, accountId }
  }

  async snapshot(request = {}) {
    const credential = await this.credential()
    if (credential.state !== 'ok') return { status: credential.state }
    const maxAgeMs = clampInt(request?.maxAgeMs, 0, 24 * 60 * 60_000, DEFAULT_MAX_AGE_MS)
    if (this.cache && this.cache.account === credential.accountId && this.now() - this.cache.fetchedAt <= maxAgeMs) {
      return { status: 'ok', snapshot: this.cache.snapshot, fetchedAt: Math.floor(this.cache.fetchedAt / 1000), cached: true }
    }
    return this.fetchFresh(credential)
  }

  async history(request = {}) {
    const hours = clampInt(request?.hours, 1, 24 * 366, 168)
    const credential = await this.credential()
    if (credential.state !== 'ok') return { status: credential.state, points: [] }
    const since = Math.floor(this.now() / 1000) - hours * 3600
    return { status: 'ok', points: await this.historyStore.read(credential.accountId, since) }
  }

  async fetchFresh(credential, { force = false } = {}) {
    if (this.inflight && this.inflight.account === credential.accountId) return this.inflight.promise
    if (!force && this.cache && this.cache.account === credential.accountId && this.now() - this.lastFetchAttemptAt < MIN_FETCH_SPACING_MS) {
      return { status: 'ok', snapshot: this.cache.snapshot, fetchedAt: Math.floor(this.cache.fetchedAt / 1000), cached: true, throttled: true }
    }
    const promise = this.runFetch(credential)
    this.inflight = { account: credential.accountId, promise }
    try {
      return await promise
    } finally {
      if (this.inflight?.promise === promise) this.inflight = undefined
    }
  }

  async runFetch(credential) {
    this.lastFetchAttemptAt = this.now()
    const staleForAccount = this.lastGood && this.lastGood.account === credential.accountId ? { lastSnapshot: this.lastGood.snapshot, lastFetchAt: Math.floor(this.lastGood.fetchedAt / 1000) } : {}
    try {
      const body = await fetchUsageBody(credential, this.fetchImpl)
      const parsed = parseQuotaBody(body)
      if (!parsed.email || !parsed.plan) {
        const identity = identityFromToken(credential.access)
        if (!parsed.email && identity.email) parsed.email = identity.email
        if (!parsed.plan && identity.plan) parsed.plan = identity.plan
      }
      const snapshot = { ...parsed, account: credential.accountId, fetchedAt: Math.floor(this.now() / 1000) }
      this.cache = { snapshot, fetchedAt: this.now(), account: credential.accountId }
      this.lastGood = this.cache
      return { status: 'ok', snapshot, fetchedAt: snapshot.fetchedAt }
    } catch (error) {
      if (error instanceof QuotaFormatError) return { status: 'unsupported', message: error.message, ...staleForAccount }
      if (error instanceof SearchError && error.code === 'CREDENTIAL_MISSING') return { status: 'expired', message: '额度查询被拒绝，令牌可能已过期；在 DSH 发送一次对话即可自动刷新', ...staleForAccount }
      return { status: 'network', message: '额度查询失败，请检查网络连接', ...staleForAccount }
    }
  }

  /** One recorder tick: fetch fresh and append a history point. */
  async record() {
    const config = this.readQuotaConfig()
    if (config.quotaRecord === false) return 'disabled'
    const credential = await this.credential()
    if (credential.state !== 'ok') return credential.state
    const result = await this.fetchFresh(credential, { force: true })
    if (result.status !== 'ok' || !result.snapshot) return result.status
    const used = {}
    for (const window of result.snapshot.windows) used[window.kind] = window.usedPercent
    await this.historyStore.append({
      ts: result.snapshot.fetchedAt,
      account: result.snapshot.account,
      ...(Object.keys(used).length ? { used } : {}),
      ...(typeof result.snapshot.credits?.balance === 'number' && Number.isFinite(result.snapshot.credits.balance) ? { credits: result.snapshot.credits.balance } : {}),
    })
    await this.maybeCompact(config)
    return 'ok'
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
