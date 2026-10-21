// Quota sources per provider route: where the read-only usage endpoint lives,
// which credential authenticates it, and how its wire shape maps onto the
// normalized quotaWindow vocabulary. Endpoints are fixed first-party addresses;
// credentials are only ever read, never refreshed, logged, or returned.
import { createHash } from 'node:crypto'
import { QuotaFormatError, clampPercent, epochSeconds, finiteNumber, isRecord, quotaWindow, windowKind } from './quota-core.js'
import { resolveRecordApiKey } from './search.js'

const CODEX_USAGE_URL = 'https://chatgpt.com/backend-api/wham/usage'
const CODEX_RESET_CREDITS_URL = 'https://chatgpt.com/backend-api/wham/rate-limit-reset-credits'
const ZAI_QUOTA_URL = 'https://open.bigmodel.cn/api/monitor/usage/quota/limit'
const ZAI_GLOBAL_QUOTA_URL = 'https://api.z.ai/api/monitor/usage/quota/limit'
const KIMI_USAGES_URL = 'https://api.kimi.com/coding/v1/usages'
export const XIAOMI_CONSOLE_URL = 'https://platform.xiaomimimo.com/console/plan-manage'

// ── Codex / ChatGPT (wham) ───────────────────────────────────────────────────

function readUsedPercent(window) {
  for (const key of ['used_percent', 'usedPercent']) {
    const value = window[key]
    if (typeof value === 'number' && Number.isFinite(value)) return clampPercent(value)
  }
  for (const key of ['percent_left', 'percentLeft']) {
    const value = window[key]
    if (typeof value === 'number' && Number.isFinite(value)) return clampPercent(100 - value)
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
  return quotaWindow({ kind: windowKind(seconds), usedPercent, windowSeconds: seconds, resetAt: readResetAt(window) })
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
  const resetCredits = isRecord(value.rate_limit_reset_credits) && typeof value.rate_limit_reset_credits.available_count === 'number' && value.rate_limit_reset_credits.available_count > 0
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

/** Per-credit expiry details behind the aggregate reset count. */
export function parseResetCreditsBody(value) {
  if (!isRecord(value) || !Array.isArray(value.credits)) throw new QuotaFormatError('reset credits response is not valid')
  const credits = value.credits.filter(isRecord).map(credit => {
    const expiresAt = epochSeconds(credit.expires_at)
    if (expiresAt === undefined) return undefined
    return {
      ...(typeof credit.title === 'string' && credit.title ? { title: credit.title } : {}),
      ...(epochSeconds(credit.granted_at) !== undefined ? { grantedAt: epochSeconds(credit.granted_at) } : {}),
      expiresAt,
      ...(typeof credit.status === 'string' && credit.status ? { status: credit.status } : {}),
    }
  }).filter(Boolean)
  return {
    ...(typeof value.available_count === 'number' && Number.isFinite(value.available_count) ? { available: value.available_count } : {}),
    ...(credits.length ? { credits } : {}),
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

// ── Z.AI / GLM Coding Plan (monitor quota API) ───────────────────────────────

// Wire window units are minutes; observed: 1=day, 3=hour, 5=minute, 6=week.
const ZAI_UNIT_MINUTES = { 1: 1440, 3: 60, 5: 1, 6: 10080 }
const ZAI_LIMIT_TYPES = new Set(['TOKENS_LIMIT', 'CREDIT_LIMIT', 'TIME_LIMIT'])

/**
 * Normalize `GET /api/monitor/usage/quota/limit` (open.bigmodel.cn / api.z.ai).
 * Each `data.limits[]` entry carries its own type, window length and counters;
 * entries without a usable percentage after count reconciliation are dropped
 * rather than reported as 0% used.
 */
export function parseZaiQuotaBody(value) {
  if (!isRecord(value)) throw new QuotaFormatError('zai quota response is not an object')
  const data = isRecord(value.data) ? value.data : undefined
  const detail = typeof value.msg === 'string' && value.msg ? `（${value.msg}）` : ''
  if (!data || !Array.isArray(data.limits)) throw new QuotaFormatError(`zai quota response has no data.limits${detail}`)
  const windows = new Map()
  for (const entry of data.limits) {
    if (!isRecord(entry) || !ZAI_LIMIT_TYPES.has(entry.type)) continue
    const number = finiteNumber(entry.number)
    const unitMinutes = ZAI_UNIT_MINUTES[entry.unit]
    // The monthly tool-call lane is marked by a unit-5/number-1 TIME_LIMIT.
    const windowMinutes = entry.type === 'TIME_LIMIT' && entry.unit === 5 && number === 1 ? 30 * 24 * 60 : number && unitMinutes ? number * unitMinutes : undefined
    if (!windowMinutes) continue
    const usage = finiteNumber(entry.usage)
    const current = finiteNumber(entry.currentValue)
    const remaining = finiteNumber(entry.remaining)
    let usedPercent = finiteNumber(entry.percentage)
    if (usage !== undefined && usage > 0) {
      let used
      if (remaining !== undefined) used = Math.max(usage - remaining, current === undefined ? usage - remaining : current)
      else if (current !== undefined) used = current
      if (used !== undefined) usedPercent = (clampPercent((used / usage) * 100))
    }
    if (usedPercent === undefined) continue
    const window = quotaWindow({ usedPercent, windowSeconds: windowMinutes * 60, resetAt: epochSeconds(entry.nextResetTime) })
    if (window && !windows.has(window.kind)) windows.set(window.kind, window)
  }
  if (windows.size === 0) throw new QuotaFormatError(`zai quota response has no usable limit window${detail}`)
  return {
    windows: [...windows.values()],
    ...(typeof data.level === 'string' && data.level ? { plan: data.level } : {}),
  }
}

// ── Kimi For Coding (usages API) ─────────────────────────────────────────────

const KIMI_RATIO_WINDOW_SECONDS = { limit_5h: 5 * 3600, limit_7d: 7 * 86_400, limit_30d: 30 * 86_400, limit_1m: 30 * 86_400, limit_monthly: 30 * 86_400 }
const KIMI_TIME_UNIT_SECONDS = { TIME_UNIT_SECOND: 1, TIME_UNIT_MINUTE: 60, TIME_UNIT_HOUR: 3600, TIME_UNIT_DAY: 86_400, TIME_UNIT_WEEK: 604_800 }

function kimiRatioWindow(key, pool) {
  if (!isRecord(pool)) return undefined
  const usedPercent = finiteNumber(pool.used_ratio) !== undefined ? finiteNumber(pool.used_ratio) * 100 : finiteNumber(pool.used_percent)
  if (usedPercent === undefined) return undefined
  return quotaWindow({ usedPercent, windowSeconds: KIMI_RATIO_WINDOW_SECONDS[key], resetAt: epochSeconds(pool.reset_time) })
}

function kimiCountWindow(seconds, detail) {
  if (!isRecord(detail)) return undefined
  const limit = finiteNumber(detail.limit)
  const used = finiteNumber(detail.used)
  const remaining = finiteNumber(detail.remaining)
  let usedPercent
  if (used !== undefined && limit) usedPercent = (used / limit) * 100
  else if (remaining !== undefined && limit) usedPercent = ((limit - remaining) / limit) * 100
  return quotaWindow({ usedPercent, windowSeconds: seconds, resetAt: epochSeconds(detail.resetTime) })
}

/**
 * Normalize `GET /coding/v1/usages`. The newer `usages` ratio pools are the
 * precise reading and win; older count-based `usage` / `limits[]` windows fill
 * whatever the response omits.
 */
export function parseKimiQuotaBody(value) {
  if (!isRecord(value)) throw new QuotaFormatError('kimi usages response is not an object')
  const windows = new Map()
  const consider = window => {
    if (window && !windows.has(window.kind)) windows.set(window.kind, window)
  }
  if (isRecord(value.usages)) {
    for (const [key, pool] of Object.entries(value.usages)) consider(kimiRatioWindow(key, pool))
  }
  if (Array.isArray(value.limits)) {
    for (const entry of value.limits) {
      if (!isRecord(entry) || !isRecord(entry.window)) continue
      const unit = KIMI_TIME_UNIT_SECONDS[entry.window.timeUnit]
      const duration = finiteNumber(entry.window.duration)
      if (!unit || !duration) continue
      consider(kimiCountWindow(unit * duration, entry.detail))
    }
  }
  if (isRecord(value.usage) && !windows.has('weekly')) consider(kimiCountWindow(7 * 86_400, value.usage))
  if (windows.size === 0) throw new QuotaFormatError('kimi usages response has no usable usage pool')
  const plan = [value.membership, value.plan, value.tier, value.plan_type].find(name => typeof name === 'string' && name)
  return { windows: [...windows.values()], ...(plan ? { plan } : {}) }
}

// ── credential resolution ────────────────────────────────────────────────────

/** A stable, non-reversible history account id for API-key providers. */
export function apiKeyAccount(access) {
  return `key-${createHash('sha256').update(access).digest('hex').slice(0, 16)}`
}

async function apiKeyCredential(ctx, { recordKey, refs }) {
  const record = await ctx.credentials.readRecord(recordKey)
  const stored = await resolveRecordApiKey(ctx, record)
  if (stored) return { state: 'ok', access: stored, account: apiKeyAccount(stored) }
  for (const ref of refs) {
    const resolved = await ctx.credentials.resolve?.(ref)
    const value = typeof resolved?.value === 'string' && resolved.value ? resolved.value : process.env[ref]
    if (value) return { state: 'ok', access: value, account: apiKeyAccount(value) }
  }
  return { state: 'signed-out' }
}

const TOKEN_EXPIRY_MARGIN_MS = 5 * 60_000

async function codexCredential(ctx, { now = () => Date.now() } = {}) {
  const record = await ctx.credentials.readRecord('llm-pi-ai/openai-codex')
  const payload = isRecord(record?.payload) ? record.payload : {}
  const expires = typeof payload.expires === 'number' && Number.isFinite(payload.expires) ? payload.expires : undefined
  const expired = expires !== undefined && now() >= expires - TOKEN_EXPIRY_MARGIN_MS
  // Expired OAuth material is decoded locally only, so existing history stays
  // readable. The state still prevents every quota request and token refresh.
  const access = record?.kind === 'grant' && payload.type === 'oauth' && typeof payload.access === 'string' && payload.access ? payload.access : undefined
  if (!access) return { state: expired ? 'expired' : 'signed-out' }
  // History binds to the login email: it survives account-id spelling changes,
  // while the older uuid payload spelling rides along as a legacy alias so the
  // points recorded before the switch fold into the same curve.
  const identity = identityFromToken(access)
  const accountId = typeof payload.accountId === 'string' && payload.accountId ? payload.accountId : undefined
  const account = identity.email ?? accountId ?? 'codex'
  return { state: expired ? 'expired' : 'ok', access, account, accountId, ...(expires !== undefined ? { expires } : {}), ...(accountId && accountId !== account ? { legacyAccount: accountId } : {}) }
}

const bearer = (url, access, extraHeaders = {}) => ({
  url,
  headers: { authorization: `Bearer ${access}`, accept: 'application/json', ...extraHeaders },
})

/** Normalize non-secret, explicit account metadata before it reaches HTTP headers. */
export function quotaAccountMetadata({ accountType, organization, project } = {}) {
  if (accountType === undefined) return {}
  if (accountType !== 'personal' && accountType !== 'team') throw new Error('accountType must be personal or team')
  if (accountType === 'personal') return { accountType }
  const identifier = (value, label) => {
    // Check raw control characters before trim: a trailing CR/LF must not be
    // silently admitted as an identifier. IDs use printable, non-space ASCII.
    if (typeof value !== 'string' || /[^\x20-\x7e]/u.test(value)) throw new Error(`${label} must be an HTTP-header-safe ID`)
    const id = value.trim()
    if (!id || id.length > 256 || /[^\x21-\x7e]/u.test(id)) throw new Error(`${label} must be a non-empty ID of at most 256 characters`)
    return id
  }
  return { accountType, organization: identifier(organization, 'organization'), project: identifier(project, 'project') }
}

/** Stable non-secret scope; legacy and personal retain one compatible lane. */
export function quotaQueryScope(credential = {}) {
  const metadata = quotaAccountMetadata(credential)
  return metadata.accountType === 'team'
    ? `team-${createHash('sha256').update(JSON.stringify([metadata.organization, metadata.project])).digest('hex')}`
    : 'personal'
}

/** The BigModel team selectors one legacy global-fallback query needs. */
export function zaiTeamSelectors(options = {}) {
  try {
    const metadata = quotaAccountMetadata({ accountType: 'team', organization: options.zaiTeamOrganization, project: options.zaiTeamProject })
    return { organizationId: metadata.organization, projectId: metadata.project }
  } catch { return undefined }
}

const ZAI_TEAM_UNAVAILABLE = {
  message: '该 key 是团队版额度：查询需要 Bigmodel-Organization / Bigmodel-Project 组织与项目 ID，请在 profile 的 dsh-provider-hub 配置里填写 zaiTeamOrganization 与 zaiTeamProject 后点刷新重试。',
  helpUrl: 'https://bigmodel.cn/coding-plan/team/usage-stats',
}

/**
 * Shared Z.AI-family request policy: explicit team goes straight to type=2;
 * explicit personal never inherits global selectors. Only legacy untyped keys
 * retain personal-first/global-team-fallback behavior.
 */
const zaiRequests = url => (credential, options = {}) => {
  const metadata = quotaAccountMetadata(credential)
  const teamRequest = team => bearer(`${url}?type=2`, credential.access, { 'Bigmodel-Organization': team.organizationId, 'Bigmodel-Project': team.projectId })
  if (metadata.accountType === 'team') return [teamRequest({ organizationId: metadata.organization, projectId: metadata.project })]
  if (metadata.accountType === 'personal') return [bearer(url, credential.access)]
  // Untyped pre-existing entries keep their old global fallback behavior.
  const team = zaiTeamSelectors(options)
  return [bearer(url, credential.access), team ? teamRequest(team) : { unavailable: ZAI_TEAM_UNAVAILABLE }]
}

/**
 * Every quota surface this plugin serves, in display order. `credential`
 * resolves read-only auth, `request` builds the fixed-endpoint call, `parse`
 * normalizes the body, and `unsupported` surfaces a console link instead of a
 * query when the platform publishes no usage API.
 */
export const QUOTA_PROVIDERS = [
  {
    id: 'openai-codex',
    credential: codexCredential,
    requests: credential => [{
      url: CODEX_USAGE_URL,
      headers: { authorization: `Bearer ${credential.access}`, ...(credential.accountId ? { 'chatgpt-account-id': credential.accountId } : {}), accept: 'application/json', 'user-agent': 'codex_cli_rs' },
    }],
    parse: parseQuotaBody,
    enrich: async (parsed, credential, fetchJsonBody) => {
      if (!parsed.resetCredits?.available) return parsed
      // Per-credit expiry details are a second, best-effort read; the aggregate
      // count from the usage response stays authoritative when it fails.
      try {
        const detail = parseResetCreditsBody(await fetchJsonBody(bearer(CODEX_RESET_CREDITS_URL, credential.access)))
        return {
          ...parsed,
          resetCredits: {
            available: typeof detail.available === 'number' ? detail.available : parsed.resetCredits.available,
            ...(detail.credits?.length ? { credits: detail.credits } : {}),
          },
        }
      } catch {
        return parsed
      }
    },
  },
  {
    id: 'xiaomi-token-plan-cn',
    unsupported: {
      message: 'Xiaomi Token Plan 暂无官方额度查询 API，无法查询或记录用量历史；请到控制台查看。',
      helpUrl: XIAOMI_CONSOLE_URL,
    },
    activeRef: 'XIAOMI_TOKEN_PLAN_CN_API_KEY',
    credential: ctx => apiKeyCredential(ctx, { recordKey: 'llm-pi-ai/xiaomi-token-plan-cn', refs: ['XIAOMI_TOKEN_PLAN_CN_API_KEY'] }),
  },
  {
    id: 'zai',
    activeRef: 'ZAI_API_KEY',
    credential: ctx => apiKeyCredential(ctx, { recordKey: 'llm-pi-ai/zai', refs: ['ZAI_API_KEY'] }),
    requests: zaiRequests(ZAI_GLOBAL_QUOTA_URL),
    parse: parseZaiQuotaBody,
  },
  {
    id: 'zai-coding-cn',
    activeRef: 'ZAI_CODING_CN_API_KEY',
    credential: ctx => apiKeyCredential(ctx, { recordKey: 'llm-pi-ai/zai-coding-cn', refs: ['ZAI_CODING_CN_API_KEY'] }),
    requests: zaiRequests(ZAI_QUOTA_URL),
    parse: parseZaiQuotaBody,
  },
  {
    id: 'kimi-coding',
    activeRef: 'KIMI_API_KEY',
    credential: ctx => apiKeyCredential(ctx, { recordKey: 'llm-pi-ai/kimi-coding', refs: ['KIMI_API_KEY', 'KIMI_CODING_API_KEY'] }),
    requests: credential => [bearer(KIMI_USAGES_URL, credential.access)],
    parse: parseKimiQuotaBody,
  },
]

export const quotaProvider = id => QUOTA_PROVIDERS.find(provider => provider.id === id)
