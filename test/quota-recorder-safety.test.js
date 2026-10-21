import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { QuotaHistory, QuotaService } from '../lib/quota.js'
import { quotaProvider } from '../lib/quota-providers.js'
const NOW = 1800000000000
const token = (email, nonce = '') => `synthetic.${Buffer.from(JSON.stringify({ email, nonce })).toString('base64url')}.signature`
const payload = (email, accountId, expires = NOW + 3600000) => ({ type: 'oauth', access: token(email), accountId, expires })
const usage = (percent = 10) => ({ rate_limit: { primary_window: { used_percent: percent, limit_window_seconds: 604800 } } })
const response = value => Response.json(value)
function service({ official = payload('a@test', 'workspace-a'), resolveSecret = async () => undefined, fetch, history, config = {}, now = () => NOW, cleanups = [], ...options } = {}) {
  const svc = Object.create(QuotaService.prototype)
  Object.defineProperty(svc, 'ctx', { value: { credentials: { readRecord: async key => key === 'llm-pi-ai/openai-codex' && official ? { kind: 'grant', payload: typeof official === 'function' ? official() : official } : undefined, resolve: resolveSecret, set: async () => { throw new Error('recorder must never write credentials') } }, effect: callback => { const cleanup = callback(); cleanups.push(cleanup); return cleanup } } })
  svc.install({ fetch, history: history ?? { append: async () => {}, compact: async () => {} }, readConfig: () => config, now, startRecorder: false, ...options })
  return svc
}
async function temporary(t) {
  const root = await mkdtemp(join(tmpdir(), 'provider-quota-safety-'))
  t.after(async () => { const intended = resolve(root); assert.equal(dirname(intended), resolve(tmpdir())); assert.ok(intended.startsWith(join(resolve(tmpdir()), 'provider-quota-safety-'))); await rm(intended, { recursive: true, force: true }) })
  return root
}
const settle = () => new Promise(resolve => setImmediate(resolve))

test('recorder captures inactive Codex accounts, dedupes full identities and never switches credentials', async () => {
  const a = payload('a@test', 'workspace-a'), b = payload('b@test', 'workspace-b'), expired = payload('old@test', 'old', NOW - 1), bad = payload('bad@test', 'bad')
  let official = a
  const grants = { a, b, expired, bad }
  const points = [], calls = []
  const svc = service({ official: () => official, history: { append: async point => points.push(point), compact: async () => {} }, fetch: async (_url, options) => {
    calls.push(options.headers['chatgpt-account-id'])
    if (options.headers['chatgpt-account-id'] === 'bad') throw new Error('PRIVATE_FAILURE')
    return response(usage())
  } })
  svc.codexAccounts = { list: async () => { official = b; return Object.keys(grants).map(id => ({ id, active: id === 'a' })) }, grant: async id => grants[id] }
  const result = await svc.record()
  assert.deepEqual(calls.sort(), ['bad', 'workspace-a', 'workspace-b'])
  assert.equal(result['openai-codex#grant:b'], 'covered', 'official B and slot B are one identity despite a switch after list')
  assert.equal(result['openai-codex#grant:expired'], 'expired')
  assert.equal(result['openai-codex#grant:bad'], 'network')
  assert.deepEqual(points.map(point => point.account).sort(), ['a@test', 'b@test'])
  assert.deepEqual(points.map(point => point.accountId).sort(), ['workspace-a', 'workspace-b'])
  assert.ok(points.every(point => point.sampleIntervalSeconds === 3600))
  assert.equal(official, b, 'sampling leaves the user-selected credential untouched')
  assert.ok(!JSON.stringify(result).includes('PRIVATE_FAILURE'))
})

test('a fresher pooled credential is preferred, and a failed candidate never hides a valid alternative', async () => {
  for (const newestIsValid of [true, false]) {
    const official = { ...payload('a@test', 'workspace-a', NOW + (newestIsValid ? 3600000 : 7200000)), access: token('a@test', 'official') }
    const pooled = { ...payload('a@test', 'workspace-a', NOW + (newestIsValid ? 7200000 : 3600000)), access: token('a@test', 'pooled') }
    const attempts = [], points = []
    const svc = service({ official, history: { append: async point => points.push(point), compact: async () => {} }, fetch: async (_url, options) => {
      attempts.push(options.headers.authorization)
      return options.headers.authorization === `Bearer ${official.access}` ? Response.json({}, { status: 401 }) : response(usage(31))
    } })
    svc.codexAccounts = { list: async () => [{ id: 'pool' }], grant: async () => pooled }
    const result = await svc.record()
    assert.equal(result['openai-codex#grant:pool'], 'ok')
    assert.equal(attempts.length, newestIsValid ? 1 : 2)
    assert.equal(result['openai-codex'], newestIsValid ? 'covered' : 'expired')
    assert.equal(points.length, 1)
    assert.equal(points[0].used.weekly, 31)
  }
})

test('recorder ticks coalesce and pool discovery failure does not stop the official target', async () => {
  let release, calls = 0
  const svc = service({ fetch: async () => { calls++; await new Promise(resolve => { release = resolve }); return response(usage()) } })
  svc.codexAccounts = { list: async () => { throw new Error('pool unavailable') } }
  const first = svc.record(), second = svc.record()
  assert.equal(first, second)
  for (let attempt = 0; attempt < 20 && !release; attempt++) await settle()
  assert.ok(release)
  release()
  assert.equal((await first)['openai-codex'], 'ok')
  assert.equal(calls, 1)
})

test('a hung upstream query times out, cannot poison the cache later, and does not stop the next tick', async () => {
  let late, signal, calls = 0
  const points = []
  const svc = service({ timeoutMs: 15, history: { append: async point => points.push(point), compact: async () => {} }, fetch: async (_url, options) => {
    calls++
    if (calls === 1) { signal = options.signal; return new Promise(resolve => { late = () => resolve(response(usage(5))) }) }
    return response(usage(70))
  } })
  assert.equal((await svc.record())['openai-codex'], 'network')
  assert.equal(signal.aborted, true)
  assert.equal(points.length, 0)
  assert.equal((await svc.record())['openai-codex'], 'ok')
  late(); await settle(); await settle()
  assert.equal(points.length, 1)
  assert.equal((await svc.snapshot()).snapshot.windows[0].usedPercent, 70, 'late aborted work cannot replace the newer result')
})

test('fixed recorder cadence subtracts probe duration, skips missed slots and survives failure', async () => {
  let now = 0
  const jobs = [], cleanups = [], config = { quotaIntervalMinutes: 60 }
  const timers = { setTimeout: (fn, delay) => { const job = { fn, delay, unref() {} }; jobs.push(job); return job }, clearTimeout: job => { job.cleared = true } }
  const svc = service({ now: () => now, config, cleanups, recorderTimers: timers })
  svc.record = async () => { now += 180000 }
  svc.startRecorder()
  assert.equal(jobs[0].delay, 10000)
  now += jobs[0].delay; await jobs[0].fn()
  assert.equal(jobs[1].delay, 57 * 60000)
  now += jobs[1].delay
  svc.record = async () => { now += 130 * 60000; throw new Error('failed tick') }
  await jobs[1].fn()
  assert.equal(jobs[2].delay, 50 * 60000, 'missed slots are skipped without overlapping or burst catch-up')
  config.quotaIntervalMinutes = 30
  now += jobs[2].delay; svc.record = async () => { now += 60000 }
  await jobs[2].fn()
  assert.equal(jobs[3].delay, 29 * 60000)
  cleanups[0]()
  assert.equal(jobs[3].cleared, true)
})

test('history filters full workspace identity before hourly aggregation and prefers exact rows', async t => {
  const root = await temporary(t), store = new QuotaHistory(join(root, 'history.jsonl'))
  for (const point of [
    { ts: 3610, account: 'same@test', accountId: 'A', used: { weekly: 11 } },
    { ts: 3620, account: 'same@test', accountId: 'B', used: { weekly: 22 } },
    { ts: 3605, account: 'same@test', accountId: 'A', used: { weekly: 1 } },
    { ts: 3690, account: 'same@test', used: { weekly: 99 } },
  ]) await store.append(point)
  assert.deepEqual((await store.read('openai-codex', ['same@test'], 0, { accountId: 'A' })).map(point => point.used.weekly), [11])
  assert.deepEqual((await store.read('openai-codex', ['same@test'], 0, { accountId: 'B' })).map(point => point.used.weekly), [22])
  assert.deepEqual((await store.read('openai-codex', ['same@test'], 0)).map(point => point.used.weekly), [99], 'an unknown workspace cannot consume scoped rows')
})

test('ambiguous legacy rows remain on disk but are not mixed; expired grants retain local history', async t => {
  const root = await temporary(t), store = new QuotaHistory(join(root, 'history.jsonl'))
  const grants = { a: payload('same@test', 'A'), b: payload('same@test', 'B'), c: payload('other@test', 'A') }
  const ts = NOW / 1000 - 1000
  for (const point of [
    { ts: ts - 7200, account: 'same@test', used: { weekly: 90 } }, { ts: ts - 3600, account: 'A', used: { weekly: 91 } },
    { ts, account: 'same@test', accountId: 'A', used: { weekly: 11 }, sampleIntervalSeconds: 7200 },
    { ts, account: 'same@test', accountId: 'B', used: { weekly: 22 } }, { ts, account: 'other@test', accountId: 'A', used: { weekly: 33 } },
  ]) await store.append(point)
  const svc = service({ official: grants.a, history: store, fetch: async () => { throw new Error('local history must never fetch') } })
  svc.codexAccounts = { grant: async id => grants[id], slots: async () => Object.values(grants).map(payload => ({ payload })) }
  for (const [id, value] of [['a', 11], ['b', 22], ['c', 33]]) {
    const view = await svc.history({ grantId: id, hours: 24 })
    assert.deepEqual(view.points.map(point => point.used.weekly), [value])
    assert.equal(view.legacyAmbiguous, true)
  }
  // Removing an account slot must not erase evidence of historical ambiguity.
  svc.codexAccounts.slots = async () => [{ payload: grants.a }]
  const afterDelete = await svc.history({ grantId: 'a' })
  assert.deepEqual(afterDelete.points.map(point => point.used.weekly), [11])
  grants.a.expires = NOW - 1
  const expired = await svc.history({ grantId: 'a' })
  assert.equal(expired.status, 'expired')
  assert.equal(expired.points[0].sampleIntervalSeconds, 7200)
  assert.equal(expired.sampleIntervalSeconds, 3600)
  const expiredOfficial = await svc.history({ hours: 24 })
  assert.equal(expiredOfficial.status, 'expired')
  assert.deepEqual(expiredOfficial.points.map(point => point.used.weekly), [11], 'official expired OAuth identity remains available for local history without a refresh')
  assert.equal((await readFile(store.path, 'utf8')).trim().split('\n').length, 5)
})

test('team projects sharing a key have isolated cache and history, including official active metadata', async t => {
  const root = await temporary(t), store = new QuotaHistory(join(root, 'history.jsonl'))
  let project = 'project-a'
  const requests = []
  const svc = service({ official: null, resolveSecret: async ref => ref === 'ZAI_API_KEY' ? { value: 'synthetic-shared-secret' } : undefined, history: store, fetch: async (url, options) => {
    requests.push({ url: String(url), headers: options.headers })
    return response({ code: 200, success: true, data: { limits: [{ type: 'TOKENS_LIMIT', unit: 6, number: 1, percentage: project === 'project-a' ? 10 : 80 }] } })
  } })
  svc.keyPool = { secretOf: async () => ({ value: 'synthetic-shared-secret', entry: { provider: 'zai', accountType: 'team', organization: 'organization', project } }), activeMetadata: async () => ({ accountType: 'team', organization: 'organization', project }) }
  assert.equal(await svc.recordProvider(quotaProvider('zai'), 'key-a'), 'ok')
  project = 'project-b'
  assert.equal((await svc.snapshot({ provider: 'zai', keyId: 'key-a' })).snapshot.windows[0].usedPercent, 80, 'a same-secret project change cannot hit the previous cache')
  assert.equal(await svc.recordProvider(quotaProvider('zai'), 'key-a'), 'ok')
  assert.deepEqual((await svc.history({ provider: 'zai', keyId: 'key-a' })).points.map(point => point.used.weekly), [80])
  project = 'project-a'
  assert.deepEqual((await svc.history({ provider: 'zai', keyId: 'key-a' })).points.map(point => point.used.weekly), [10])
  assert.equal((await svc.snapshot({ provider: 'zai' })).status, 'ok')
  assert.equal(requests.at(-1).headers['Bigmodel-Project'], 'project-a', 'the official key inherits its explicitly selected per-key scope')
  assert.ok(requests.every(request => request.url.endsWith('?type=2') && request.headers['Bigmodel-Organization'] === 'organization'))
  const text = await readFile(store.path, 'utf8')
  assert.ok(!text.includes('synthetic-shared-secret'))
  assert.equal(new Set(text.trim().split('\n').map(line => JSON.parse(line).queryScope)).size, 2)
})

test('compaction preserves independent workspace latest points and serialized concurrent appends', async t => {
  const root = await temporary(t), store = new QuotaHistory(join(root, 'history.jsonl'), { now: () => NOW })
  const old = NOW / 1000 - 20 * 86400
  await store.append({ ts: old, account: 'same@test', accountId: 'A', used: { weekly: 1 } })
  await store.append({ ts: old, account: 'same@test', accountId: 'B', used: { weekly: 2 } })
  await Promise.all([store.compact(7), store.append({ ts: NOW / 1000, account: 'new@test', accountId: 'C', used: { weekly: 3 } })])
  const points = (await readFile(store.path, 'utf8')).trim().split('\n').map(line => JSON.parse(line))
  assert.deepEqual(points.map(point => point.accountId).sort(), ['A', 'B', 'C'])
})
