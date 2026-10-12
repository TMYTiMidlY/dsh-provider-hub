import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { QuotaFormatError, QuotaHistory, QuotaService, identityFromToken, parseQuotaBody, parseResetCreditsBody, quotaHistoryPath } from '../lib/quota.js'

const b64url = value => Buffer.from(JSON.stringify(value)).toString('base64url')
const syntheticToken = (claims = {}) => `synthetic-header.${b64url(claims)}.synthetic-signature`
const profileToken = syntheticToken({ 'https://api.openai.com/profile': { email: 'quota@example.test' }, 'https://api.openai.com/auth': { chatgpt_plan_type: 'pro' } })
const grant = (payload = {}) => ({ kind: 'grant', payload: { type: 'oauth', access: profileToken, accountId: 'acct-1', expires: Date.now() + 3_600_000, ...payload } })

const liveFixture = () => ({
  user_id: 'user-synthetic',
  account_id: 'acct-1',
  email: 'quota@example.test',
  plan_type: 'pro',
  rate_limit: {
    allowed: true,
    limit_reached: false,
    primary_window: { used_percent: 15, limit_window_seconds: 604800, reset_after_seconds: 576747, reset_at: 1792295880 },
    secondary_window: null,
  },
  code_review_rate_limit: null,
  additional_rate_limits: null,
  credits: { has_credits: true, unlimited: false, balance: '62500.0000000000', approx_local_messages: [15625, 81250] },
  spend_control: { reached: false, individual_limit: null },
  rate_limit_reset_credits: { available_count: 3, applicable_available_count: 0 },
})

function service({ record = grant(), readRecord, fetchImpl, config = {}, history, now } = {}) {
  const svc = Object.create(QuotaService.prototype)
  Object.defineProperty(svc, 'ctx', { value: { credentials: { readRecord: readRecord ?? (async () => record) }, effect: () => () => {} } })
  svc.install({ fetch: fetchImpl, now, readConfig: () => config, history, startRecorder: false })
  return svc
}

const jsonResponse = (value, status = 200) => Response.json(value, { status })

const resetCreditsFixture = () => ({
  credits: [
    { id: 'RateLimitResetCredit_a', reset_type: 'codex_rate_limits', status: 'available', granted_at: '2026-09-22T20:58:10.363939Z', expires_at: '2026-10-22T20:58:10.363939Z', title: 'Full reset' },
    { id: 'RateLimitResetCredit_b', reset_type: 'codex_rate_limits', status: 'available', granted_at: '2026-09-29T19:10:22.010515Z', expires_at: '2026-10-29T19:10:22.010515Z', title: 'Full reset' },
    { id: 'RateLimitResetCredit_c', reset_type: 'codex_rate_limits', status: 'redeemed', granted_at: '2026-10-01T00:00:00Z', expires_at: '2026-11-01T00:00:00Z', title: 'Full reset' },
  ],
  available_count: 3,
  total_earned_count: 0,
})

// Count only the primary usage reads; the reset-credits detail read is a
// second, best-effort call inside the same fetch round.
const countingFetch = (fixture = liveFixture, credits = resetCreditsFixture) => {
  const state = { calls: 0, creditCalls: 0 }
  state.fetch = async url => {
    if (String(url).includes('rate-limit-reset-credits')) { state.creditCalls++; return jsonResponse(credits()) }
    state.calls++
    return jsonResponse(fixture())
  }
  return state
}

test('parser normalizes the current single-weekly-window shape', () => {
  const parsed = parseQuotaBody(liveFixture())
  assert.deepEqual(parsed.windows, [{ kind: 'weekly', usedPercent: 15, windowSeconds: 604800, resetAt: 1792295880 }])
  assert.equal(parsed.email, 'quota@example.test')
  assert.equal(parsed.plan, 'pro')
  assert.equal(parsed.credits.balance, 62500)
  assert.equal(parsed.credits.unlimited, false)
  assert.deepEqual(parsed.credits.approxLocalMessages, [15625, 81250])
  assert.deepEqual(parsed.resetCredits, { available: 3 })
})

test('parser reads legacy alias families and classifies windows by duration', () => {
  const parsed = parseQuotaBody({
    rate_limits: {
      five_hour: { percent_left: 73.5, reset_time_ms: 1_763_393_600_000, limit_window_seconds: 18000 },
      weekly: { percent_left: 87, reset_time_ms: 1_769_984_000_000, limit_window_seconds: 604800 },
    },
  })
  assert.equal(parsed.windows.length, 2)
  const short = parsed.windows.find(window => window.kind === 'short')
  const weekly = parsed.windows.find(window => window.kind === 'weekly')
  assert.equal(short.usedPercent, 26.5)
  assert.equal(short.windowSeconds, 18000)
  assert.equal(short.resetAt, 1_763_393_600)
  assert.equal(weekly.usedPercent, 13)
  assert.equal(weekly.resetAt, 1_769_984_000)
})

test('parser accepts ISO reset strings and rejects responses without windows', () => {
  const parsed = parseQuotaBody({ rate_limit: { primary_window: { usedPercent: 40, resetsAt: '2026-10-18T03:58:00Z' } } })
  assert.equal(parsed.windows[0].resetAt, Math.floor(Date.parse('2026-10-18T03:58:00Z') / 1000))
  assert.equal(parsed.windows[0].kind, 'short', 'a window without duration falls back to the short slot')
  assert.throws(() => parseQuotaBody({ rate_limit: { primary_window: null, secondary_window: null } }), QuotaFormatError)
  assert.throws(() => parseQuotaBody({}), QuotaFormatError)
  assert.throws(() => parseQuotaBody('nope'), QuotaFormatError)
})

test('identity fallbacks decode from the access token claims', () => {
  assert.deepEqual(identityFromToken(profileToken), { email: 'quota@example.test', plan: 'pro' })
  assert.deepEqual(identityFromToken(syntheticToken({ email: 'fallback@example.test' })), { email: 'fallback@example.test' })
  assert.deepEqual(identityFromToken('not-a-jwt'), {})
})

test('history file lives under the plugin-owned DSH_HOME directory', () => {
  assert.ok(quotaHistoryPath('/tmp/synthetic-home').endsWith(join('dsh-provider-hub', 'quota-history.jsonl')))
})

test('QuotaHistory appends, filters by account and dedupes per hour', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-quota-history-'))
  try {
    const history = new QuotaHistory(join(dir, 'quota-history.jsonl'))
    await history.append({ ts: 1000, account: 'acct-1', used: { weekly: 10 }, credits: 60000 })
    await history.append({ ts: 2000, account: 'acct-1', used: { weekly: 12 }, credits: 60000 })
    await history.append({ ts: 3000, account: 'acct-2', used: { weekly: 50 } })
    await history.append({ ts: 5000, account: 'acct-1', used: { weekly: 14 }, credits: 61000 })
    const points = await history.read('acct-1', 0)
    assert.deepEqual(points, [{ ts: 2000, used: { weekly: 12 }, credits: 60000 }, { ts: 5000, used: { weekly: 14 }, credits: 61000 }])
    assert.deepEqual(await history.read('acct-1', 2500), [{ ts: 5000, used: { weekly: 14 }, credits: 61000 }])
    assert.deepEqual(await history.read('acct-none', 0), [])
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('QuotaHistory compaction drops old points but keeps the newest per account', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-quota-compact-'))
  try {
    let now = 200_000_000
    const history = new QuotaHistory(join(dir, 'quota-history.jsonl'), { now: () => now })
    await history.append({ ts: 1000, account: 'acct-1', used: { weekly: 5 } })
    await history.append({ ts: 2000, account: 'acct-2', used: { weekly: 6 } })
    await history.append({ ts: Math.floor(now / 1000) - 100, account: 'acct-1', used: { weekly: 7 } })
    assert.equal(await history.compact(1), true)
    const text = await readFile(join(dir, 'quota-history.jsonl'), 'utf8')
    const kept = text.trim().split('\n').map(line => JSON.parse(line))
    assert.deepEqual(kept.map(point => point.ts).sort((a, b) => a - b), [2000, Math.floor(now / 1000) - 100])
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('snapshot serves a normalized view without leaking the access token', async () => {
  const fetch = countingFetch()
  const svc = service({ fetchImpl: fetch.fetch })
  const result = await svc.snapshot({})
  assert.equal(result.status, 'ok')
  assert.equal(result.snapshot.email, 'quota@example.test')
  assert.equal(result.snapshot.account, 'acct-1')
  assert.deepEqual(result.snapshot.windows, [{ kind: 'weekly', usedPercent: 15, windowSeconds: 604800, resetAt: 1792295880 }])
  assert.equal(result.snapshot.credits.balance, 62500)
  assert.doesNotMatch(JSON.stringify(result), /synthetic-header|synthetic-signature/u)
  const cached = await svc.snapshot({})
  assert.equal(cached.cached, true)
  assert.equal(fetch.calls, 1)
})

test('per-credit expiry details enrich the reset credits view', async () => {
  const fetch = countingFetch()
  const svc = service({ fetchImpl: fetch.fetch })
  const result = await svc.snapshot({})
  assert.equal(result.status, 'ok')
  assert.equal(result.snapshot.resetCredits.available, 3)
  assert.equal(result.snapshot.resetCredits.credits.length, 3)
  assert.deepEqual(result.snapshot.resetCredits.credits[0], { title: 'Full reset', grantedAt: Math.floor(Date.parse('2026-09-22T20:58:10.363939Z') / 1000), expiresAt: Math.floor(Date.parse('2026-10-22T20:58:10.363939Z') / 1000), status: 'available' })
  assert.equal(fetch.creditCalls, 1)
})

test('reset credits detail failure falls back to the aggregate count', async () => {
  const fetch = countingFetch(liveFixture, () => { throw new Error('synthetic credits failure') })
  const svc = service({ fetchImpl: fetch.fetch })
  const result = await svc.snapshot({})
  assert.equal(result.status, 'ok')
  assert.deepEqual(result.snapshot.resetCredits, { available: 3 })
})

test('reset credits detail read is skipped when no credits are available', async () => {
  const fetch = countingFetch(() => ({ ...liveFixture(), rate_limit_reset_credits: { available_count: 0, applicable_available_count: 0 } }))
  const svc = service({ fetchImpl: fetch.fetch })
  const result = await svc.snapshot({})
  assert.equal(result.status, 'ok')
  assert.equal(result.snapshot.resetCredits, undefined)
  assert.equal(fetch.creditCalls, 0)
})

test('parseResetCreditsBody reads expiry details and skips malformed entries', () => {
  const parsed = parseResetCreditsBody(resetCreditsFixture())
  assert.equal(parsed.available, 3)
  assert.equal(parsed.credits.length, 3)
  assert.throws(() => parseResetCreditsBody({ credits: 'nope' }), QuotaFormatError)
  const sparse = parseResetCreditsBody({ credits: [{ title: 'No expiry' }, { expires_at: '2026-11-06T23:36:20Z', title: 'Full reset' }] })
  assert.equal(sparse.credits.length, 1)
  assert.equal(sparse.credits[0].title, 'Full reset')
})

test('manual refresh is clamped to one upstream call per minute per account', async () => {
  const fetch = countingFetch()
  let now = 1_000_000_000_000
  const svc = service({ fetchImpl: fetch.fetch, now: () => now })
  await svc.snapshot({ maxAgeMs: 0 })
  now += 10_000
  const throttled = await svc.snapshot({ maxAgeMs: 0 })
  assert.equal(throttled.cached, true)
  assert.equal(throttled.throttled, true)
  assert.equal(fetch.calls, 1)
  now += 120_000
  await svc.snapshot({ maxAgeMs: 0 })
  assert.equal(fetch.calls, 2)
})

test('switching accounts bypasses the spacing clamp', async () => {
  const fetch = countingFetch()
  let now = 1_000_000_000_000
  let accountId = 'acct-1'
  const svc = service({ readRecord: async () => grant({ accountId }), fetchImpl: fetch.fetch, now: () => now })
  await svc.snapshot({ maxAgeMs: 0 })
  accountId = 'acct-2'
  now += 10_000
  const switched = await svc.snapshot({ maxAgeMs: 0 })
  assert.equal(switched.status, 'ok')
  assert.equal(switched.snapshot.account, 'acct-2')
  assert.equal(fetch.calls, 2)
})

test('signed-out and expired credentials surface as distinct states', async () => {
  assert.equal((await service({ record: null }).snapshot({})).status, 'signed-out')
  assert.equal((await service({ record: grant({ expires: 1_000_000_000_000 - 1 }) }).snapshot({})).status, 'expired')
})

test('a rejected upstream call keeps the last good snapshot and names the recovery path', async () => {
  let usageCalls = 0
  let now = 1_000_000_000_000
  const svc = service({ fetchImpl: async url => {
    if (String(url).includes('rate-limit-reset-credits')) return jsonResponse(resetCreditsFixture())
    usageCalls++
    return usageCalls === 1 ? jsonResponse(liveFixture()) : new Response('{}', { status: 401 })
  }, now: () => now })
  await svc.snapshot({ maxAgeMs: 0 })
  now += 120_000
  const rejected = await svc.snapshot({ maxAgeMs: 0 })
  assert.equal(rejected.status, 'expired')
  assert.match(rejected.message, /刷新/u)
  assert.equal(rejected.lastSnapshot.windows[0].usedPercent, 15)
  assert.equal(rejected.lastFetchAt, Math.floor((now - 120_000) / 1000))
})

test('network failures and unexpected response shapes degrade gracefully', async () => {
  assert.equal((await service({ fetchImpl: async () => { throw new Error('synthetic offline') } }).snapshot({})).status, 'network')
  assert.equal((await service({ fetchImpl: async () => jsonResponse({ unrelated: true }) }).snapshot({})).status, 'unsupported')
  assert.equal((await service({ fetchImpl: async () => new Response('not json', { status: 200 }) }).snapshot({})).status, 'unsupported')
})

test('the recorder appends history points and honours the quotaRecord switch', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-quota-record-'))
  try {
    const history = new QuotaHistory(join(dir, 'quota-history.jsonl'))
    const svc = service({ fetchImpl: async () => jsonResponse(liveFixture()), history, config: {} })
    assert.equal(await svc.record(), 'ok')
    const text = await readFile(join(dir, 'quota-history.jsonl'), 'utf8')
    const point = JSON.parse(text.trim())
    assert.equal(point.account, 'acct-1')
    assert.deepEqual(point.used, { weekly: 15 })
    assert.equal(point.credits, 62500)
    const off = service({ fetchImpl: async () => jsonResponse(liveFixture()), history, config: { quotaRecord: false } })
    assert.equal(await off.record(), 'disabled')
    const offText = await readFile(join(dir, 'quota-history.jsonl'), 'utf8')
    assert.equal(offText.trim().split('\n').length, 1)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('history RPC filters to the current account within the requested window', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-quota-rpc-'))
  try {
    let now = 1_000_000_000_000
    const history = new QuotaHistory(join(dir, 'quota-history.jsonl'), { now: () => now })
    await history.append({ ts: Math.floor(now / 1000) - 7200, account: 'acct-1', used: { weekly: 5 } })
    await history.append({ ts: Math.floor(now / 1000) - 3600, account: 'acct-1', used: { weekly: 6 } })
    await history.append({ ts: Math.floor(now / 1000) - 3600, account: 'acct-9', used: { weekly: 99 } })
    const svc = service({ history, now: () => now })
    const result = await svc.history({ hours: 24 })
    assert.equal(result.status, 'ok')
    assert.deepEqual(result.points.map(point => point.used.weekly), [5, 6])
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
