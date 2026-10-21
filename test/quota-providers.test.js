import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { QuotaFormatError } from '../lib/quota-core.js'
import { apiKeyAccount, parseKimiQuotaBody, parseZaiQuotaBody, quotaProvider, quotaQueryScope, zaiTeamSelectors } from '../lib/quota-providers.js'
import { KeyPool, KeyPoolService } from '../lib/key-pool.js'
import { QuotaService } from '../lib/quota.js'

// Fixtures mirror the observed first-party responses (values synthetic).
const zaiPersonalFixture = () => ({
  code: 200,
  msg: 'Operation successful',
  data: {
    limits: [
      { type: 'CREDIT_LIMIT', unit: 3, number: 5, usage: 12000, currentValue: 2334, remaining: 9665, percentage: 19, nextResetTime: 1791829546670 },
      { type: 'CREDIT_LIMIT', unit: 6, number: 1, usage: 60000, currentValue: 60022, remaining: 0, percentage: 100, nextResetTime: 1791858327984 },
    ],
    level: 'max',
  },
  success: true,
})

const zaiCodingFixture = () => ({
  code: 200,
  msg: '操作成功',
  data: {
    limits: [
      { type: 'TOKENS_LIMIT', unit: 3, number: 5, percentage: 0 },
      { type: 'TOKENS_LIMIT', unit: 6, number: 1, percentage: 100, nextResetTime: 1792151635984 },
      { type: 'TIME_LIMIT', unit: 5, number: 1, usage: 1000, currentValue: 330, remaining: 670, percentage: 33, nextResetTime: 1793515358983, usageDetails: [{ modelCode: 'search-prime', usage: 329 }] },
    ],
    level: 'pro',
  },
  success: true,
})

const kimiFixture = () => ({
  usage: { limit: '100', used: '22', remaining: '78', resetTime: '2026-10-16T14:17:42.782898Z' },
  limits: [{ window: { duration: 300, timeUnit: 'TIME_UNIT_MINUTE' }, detail: { limit: '100', remaining: '100', resetTime: '2026-10-12T21:17:42.782898Z' } }],
  usages: { limit_5h: { used_ratio: 0, reset_time: '2026-10-12T21:17:42Z' }, limit_7d: { used_ratio: 0.22, reset_time: '2026-10-16T14:17:41Z' } },
})

test('zai quota parser maps plan windows, counters and the monthly tool lane', () => {
  const parsed = parseZaiQuotaBody(zaiPersonalFixture())
  assert.equal(parsed.plan, 'max')
  assert.deepEqual(parsed.windows.map(window => window.kind).sort(), ['short', 'weekly'])
  const weekly = parsed.windows.find(window => window.kind === 'weekly')
  assert.equal(weekly.usedPercent, 100)
  assert.equal(weekly.windowSeconds, 604800)
  assert.equal(weekly.resetAt, Math.floor(1791858327984 / 1000))

  const coding = parseZaiQuotaBody(zaiCodingFixture())
  assert.equal(coding.plan, 'pro')
  assert.deepEqual(coding.windows.map(window => window.kind).sort(), ['monthly', 'short', 'weekly'])
  const monthly = coding.windows.find(window => window.kind === 'monthly')
  assert.equal(monthly.usedPercent, 33, 'count reconciliation wins over a stale percentage')
  assert.equal(monthly.windowSeconds, 30 * 86_400, 'the unit-5/number-1 TIME_LIMIT marker is the monthly tool lane')
  assert.equal(coding.windows.find(window => window.kind === 'short').usedPercent, 0)
})

test('zai quota parser rejects envelopes without usable windows and keeps the server reason', () => {
  assert.throws(() => parseZaiQuotaBody({ code: 500, msg: '当前用户不存在coding plan', success: false }), error => error instanceof QuotaFormatError && error.message.includes('当前用户不存在coding plan'))
  assert.throws(() => parseZaiQuotaBody({ code: 200, data: { limits: [] }, success: true }), QuotaFormatError)
  assert.throws(() => parseZaiQuotaBody({ code: 200, data: { limits: [{ type: 'MYSTERY_LIMIT', unit: 3, number: 5, percentage: 1 }] } }), QuotaFormatError, 'unknown limit types are skipped, not guessed')
})

test('kimi usages parser prefers ratio pools and falls back to count windows', () => {
  const parsed = parseKimiQuotaBody(kimiFixture())
  const byKind = new Map(parsed.windows.map(window => [window.kind, window]))
  assert.equal(byKind.get('short').usedPercent, 0, 'the 5h ratio pool wins over the legacy count')
  assert.equal(byKind.get('short').windowSeconds, 18000)
  assert.equal(byKind.get('weekly').usedPercent, 22, '7d ratio pool maps to the weekly window')
  assert.equal(byKind.get('weekly').windowSeconds, 604800)

  const legacyOnly = parseKimiQuotaBody({
    usage: { limit: '100', used: '22', remaining: '78', resetTime: '2026-10-16T14:17:42Z' },
    limits: [{ window: { duration: 300, timeUnit: 'TIME_UNIT_MINUTE' }, detail: { limit: '100', used: '139', remaining: '-39', resetTime: '2026-10-12T21:17:42Z' } }],
  })
  const legacy = new Map(legacyOnly.windows.map(window => [window.kind, window]))
  assert.equal(legacy.get('weekly').usedPercent, 22, 'the count-based usage pool fills a missing 7d ratio pool')
  assert.ok(legacy.get('short').usedPercent > 0, 'legacy limits describe the 5h lane')
  assert.throws(() => parseKimiQuotaBody({ unrelated: true }), QuotaFormatError)
})

test('API-key accounts are stable hashes, never the secret itself', () => {
  assert.equal(apiKeyAccount('sk-synthetic-a'), apiKeyAccount('sk-synthetic-a'))
  assert.notEqual(apiKeyAccount('sk-synthetic-a'), apiKeyAccount('sk-synthetic-b'))
  assert.match(apiKeyAccount('sk-synthetic-a'), /^key-[0-9a-f]{16}$/u)
})

const fakeCredentials = () => {
  const refs = new Map()
  return {
    refs,
    resolve: async ref => (refs.has(ref) ? { value: refs.get(ref) } : undefined),
    set: async (ref, value) => { refs.set(ref, value) },
    unset: async ref => { refs.delete(ref) },
    readRecord: async () => undefined,
  }
}

test('key pool stores secrets in the credential store and switches the official ref', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-key-pool-'))
  try {
    const credentials = fakeCredentials()
    const pool = new KeyPool(join(dir, 'key-pool.json'), { credentials })
    const added = await pool.add({ provider: 'zai-coding-cn', name: 'zai-gsj', value: 'sk-synthetic-secret-1' })
    await pool.add({ provider: 'zai-coding-cn', name: 'zai-team', value: 'sk-synthetic-secret-2' })
    const entries = await pool.list('zai-coding-cn')
    assert.equal(entries.length, 2)
    assert.equal(entries[0].name, 'zai-gsj')
    assert.equal(entries[0].configured, true)
    assert.equal(entries[0].active, false)
    assert.deepEqual([...credentials.refs.keys()].filter(ref => ref.startsWith('KEY_POOL_')).sort(), entries.map(entry => `KEY_POOL_ZAI_CODING_CN_${entry.id.toUpperCase()}`).sort())
    assert.equal(credentials.refs.get('KEY_POOL_ZAI_CODING_CN_' + entries[0].id.toUpperCase()), 'sk-synthetic-secret-1')

    await pool.setActive({ id: added.id })
    assert.equal(credentials.refs.get('ZAI_CODING_CN_API_KEY'), 'sk-synthetic-secret-1', 'switching copies onto the official reference')
    const afterSwitch = await pool.list('zai-coding-cn')
    assert.equal(afterSwitch.find(entry => entry.id === added.id).active, true)

    await pool.rename({ id: added.id, name: 'zai-gsj-renamed' })
    assert.equal((await pool.list('zai-coding-cn'))[0].name, 'zai-gsj-renamed')
    await pool.remove({ id: added.id })
    assert.equal(credentials.refs.has('KEY_POOL_ZAI_CODING_CN_' + added.id.toUpperCase()), false, 'removing an entry clears its stored secret')
    assert.equal((await pool.list('zai-coding-cn')).length, 1)

    const text = await readFile(join(dir, 'key-pool.json'), 'utf8')
    assert.ok(!text.includes('sk-synthetic-secret'), 'the metadata file never stores secret values')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('key pool views never carry secret values across the remote', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-key-pool-remote-'))
  try {
    const credentials = fakeCredentials()
    const pool = new KeyPool(join(dir, 'key-pool.json'), { credentials })
    const service = Object.create(KeyPoolService.prototype)
    service.pool = pool
    const { entry } = await service.add({ provider: 'kimi-coding', name: 'kimi-main', value: 'sk-kimi-synthetic' })
    const view = JSON.stringify(await service.list({ provider: 'kimi-coding' }))
    assert.ok(!view.includes('sk-kimi-synthetic'), 'list views expose names and ids only')
    assert.equal((await service.list({ provider: 'kimi-coding' })).entries[0].id, entry.id)
    await assert.rejects(() => service.add({ provider: 'kimi-coding', name: '', value: 'sk-kimi-synthetic' }), /name/u)
    await assert.rejects(() => service.setActive({ id: 'missing' }), /not found|no stored secret/u)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

const jsonResponse = (value, status = 200) => Response.json(value, { status })

function service({ fetchImpl, config = {}, credentials = fakeCredentials(), keyPool, history } = {}) {
  const svc = Object.create(QuotaService.prototype)
  Object.defineProperty(svc, 'ctx', { value: { credentials, effect: () => () => {} } })
  svc.install({ fetch: fetchImpl, now: () => 1_000_000_000_000, readConfig: () => config, history, keyPool, startRecorder: false })
  return svc
}

test('quota snapshot queries one pool key by id and rejects foreign requests', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-key-pool-quota-'))
  try {
    const credentials = fakeCredentials()
    const pool = new KeyPool(join(dir, 'key-pool.json'), { credentials })
    const added = await pool.add({ provider: 'zai-coding-cn', name: 'team-key', value: 'sk-synthetic-team' })
    const calls = []
    const svc = service({
      keyPool: pool,
      fetchImpl: async (url, options) => { calls.push({ url: String(url), auth: options.headers.authorization }); return jsonResponse(zaiCodingFixture()) },
    })
    const snapshot = await svc.snapshot({ provider: 'zai-coding-cn', keyId: added.id, maxAgeMs: 0 })
    assert.equal(snapshot.status, 'ok')
    assert.equal(snapshot.snapshot.account, apiKeyAccount('sk-synthetic-team'))
    assert.equal(calls[0].auth, 'Bearer sk-synthetic-team')
    const missing = await svc.snapshot({ provider: 'zai-coding-cn', keyId: 'deadbeef', maxAgeMs: 0 })
    assert.equal(missing.status, 'signed-out', 'an unknown pool id can never borrow another key')
    assert.equal(calls.length, 1)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('team scope carries the selectors while their absence explains the gap', async () => {
  const calls = []
  const fetchImpl = async (url, options) => {
    calls.push({ url: String(url), headers: options.headers })
    return String(url).includes('type=2') ? jsonResponse({ code: 200, data: { limits: [{ type: 'TOKENS_LIMIT', unit: 3, number: 5, percentage: 7 }] }, success: true }) : jsonResponse({ code: 500, msg: '当前用户不存在coding plan', success: false })
  }
  const credentials = fakeCredentials()
  credentials.refs.set('ZAI_CODING_CN_API_KEY', 'sk-synthetic-team')
  const withoutSelectors = service({ fetchImpl, credentials })
  const skipped = await withoutSelectors.snapshot({ provider: 'zai-coding-cn', maxAgeMs: 0 })
  assert.equal(skipped.status, 'unsupported')
  assert.match(skipped.message, /组织/u)
  assert.match(skipped.helpUrl, /^https:\/\//u)
  assert.equal(calls.length, 1, 'without selectors only the personal scope is attempted')

  calls.length = 0
  const withSelectors = service({ fetchImpl, credentials, config: { zaiTeamOrganization: 'org_1', zaiTeamProject: 'proj_2' } })
  assert.deepEqual(zaiTeamSelectors({ zaiTeamOrganization: 'org_1', zaiTeamProject: 'proj_2' }), { organizationId: 'org_1', projectId: 'proj_2' })
  const team = await withSelectors.snapshot({ provider: 'zai-coding-cn', maxAgeMs: 0 })
  assert.equal(team.status, 'ok')
  assert.equal(team.snapshot.windows[0].usedPercent, 7)
  assert.equal(calls.length, 2, 'the team scope is the fallback after the personal one')
  assert.equal(new URL(calls[1].url).searchParams.get('type'), '2')
  assert.equal(calls[1].headers['Bigmodel-Organization'], 'org_1')
  assert.equal(calls[1].headers['Bigmodel-Project'], 'proj_2')
})

test('both ZAI routes select explicit team or personal queries without inheriting global scope', () => {
  const global = { zaiTeamOrganization: 'global_org', zaiTeamProject: 'global_project' }
  for (const id of ['zai', 'zai-coding-cn']) {
    const provider = quotaProvider(id)
    const team = provider.requests({ access: 'synthetic-never-log', accountType: 'team', organization: ' org_local ', project: ' project_local ' }, global)
    assert.equal(team.length, 1, 'explicit team never probes personal first')
    assert.equal(new URL(team[0].url).searchParams.get('type'), '2')
    assert.equal(team[0].headers['Bigmodel-Organization'], 'org_local')
    assert.equal(team[0].headers['Bigmodel-Project'], 'project_local')
    const personal = provider.requests({ access: 'synthetic-never-log', accountType: 'personal', organization: 'stale_org', project: 'stale_project' }, global)
    assert.equal(personal.length, 1)
    assert.equal(new URL(personal[0].url).searchParams.has('type'), false)
    assert.equal(personal[0].headers['Bigmodel-Organization'], undefined)
    assert.equal(personal[0].headers['Bigmodel-Project'], undefined)
    const legacy = provider.requests({ access: 'synthetic-never-log' }, global)
    assert.equal(legacy.length, 2, 'untyped legacy keys retain the global fallback')
    assert.equal(legacy[1].headers['Bigmodel-Organization'], 'global_org')
    assert.throws(() => provider.requests({ access: 'synthetic-never-log', accountType: 'team', organization: 'only_org' }, global), /project/u)
    assert.throws(() => provider.requests({ access: 'synthetic-never-log', accountType: 'team', organization: 'bad\r\nheader', project: 'p' }), /HTTP-header-safe/u)
  }
})

test('quota query scopes bind only normalized team selectors, never secrets', () => {
  assert.equal(quotaQueryScope({}), 'personal')
  assert.equal(quotaQueryScope({ accountType: 'personal', organization: 'unused', project: 'unused' }), 'personal')
  const first = quotaQueryScope({ accountType: 'team', organization: ' org ', project: ' project ', access: 'synthetic-secret-one' })
  assert.match(first, /^team-[a-f0-9]{64}$/u)
  assert.equal(first, quotaQueryScope({ accountType: 'team', organization: 'org', project: 'project', access: 'synthetic-secret-two' }))
  assert.notEqual(first, quotaQueryScope({ accountType: 'team', organization: 'org', project: 'other' }))
  assert.notEqual(quotaQueryScope({ accountType: 'team', organization: 'ab', project: 'c' }), quotaQueryScope({ accountType: 'team', organization: 'a', project: 'bc' }))
  assert.ok(!first.includes('synthetic-secret'))
  assert.throws(() => quotaQueryScope({ accountType: 'team', organization: 'org' }), /project/u)
})

test('quota snapshot exposes the xiaomi console path instead of inventing numbers', async () => {
  const svc = service({ fetchImpl: async () => { throw new Error('must not fetch') } })
  const snapshot = await svc.snapshot({ provider: 'xiaomi-token-plan-cn', maxAgeMs: 0 })
  assert.equal(snapshot.status, 'unsupported')
  assert.match(snapshot.helpUrl, /xiaomimimo/u)
  assert.equal(quotaProvider('xiaomi-token-plan-cn').unsupported.message.includes('Xiaomi Token Plan'), true)
})
