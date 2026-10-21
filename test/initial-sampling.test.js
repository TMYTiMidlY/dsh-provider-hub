import test from 'node:test'
import assert from 'node:assert/strict'
import { QuotaService } from '../lib/quota.js'
import { KeyPoolService } from '../lib/key-pool.js'
import { CodexAccountsService } from '../lib/codex-accounts.js'
import { apply } from '../lib/index.js'
const settle = () => new Promise(resolve => setImmediate(resolve))
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done }); return { promise, resolve } }
const sampler = options => Object.create(QuotaService.prototype).install({ startRecorder: false, history: { append: async () => {}, compact: async () => {}, read: async () => [] }, ...options })

test('new-account sampling rescans after an already captured tick and coalesces later additions', async () => {
  const old = deferred(), first = deferred()
  const svc = sampler({ readConfig: () => ({}) })
  svc.recorderInFlight = old.promise
  let scans = 0, active = 0, maximum = 0
  svc.record = async () => { scans++; maximum = Math.max(maximum, ++active); if (scans === 1) await first.promise; active-- }
  const result = svc.requestInitialSample()
  assert.equal(scans, 0, 'an existing tick must finish first')
  assert.equal(svc.requestInitialSample(), result)
  old.resolve(); await settle()
  assert.equal(scans, 1)
  assert.equal(svc.requestInitialSample(), result, 'an add during this scan queues a rescan, not a parallel tick')
  first.resolve(); await result
  assert.equal(scans, 2)
  assert.equal(maximum, 1)
  assert.equal(svc.initialSampleDrain, undefined)
  svc.recorderDisposed = true
  await svc.requestInitialSample()
  assert.equal(scans, 2)
})

test('an add queued at the completed drain tail still triggers a fresh scan', async () => {
  const gate = deferred(), svc = sampler({ readConfig: () => ({}) })
  let scans = 0
  svc.record = () => { scans++; return scans === 1 ? gate.promise : Promise.resolve() }
  const first = svc.requestInitialSample()
  void gate.promise.then(() => svc.requestInitialSample())
  gate.resolve()
  await first
  await settle()
  assert.equal(scans, 2, 'the notification between loop resolution and finalizer must not wait for the hourly timer')
  assert.equal(svc.initialSampleRequested, false)
  assert.equal(svc.initialSampleDrain, undefined)
})

test('first sampling honours disabled recording and a failed drain can be retried', async () => {
  let network = 0
  const svc = sampler({ readConfig: () => ({ quotaRecord: false }), fetch: async () => { network++; throw new Error('forbidden') } })
  await svc.requestInitialSample()
  assert.equal(network, 0)
  let attempts = 0
  svc.record = async () => { if (++attempts === 1) throw new Error('temporary write failure') }
  await assert.rejects(svc.requestInitialSample(), /temporary write failure/u)
  await svc.requestInitialSample()
  assert.equal(attempts, 2)
})

test('key and CLI commits notify first sampling without awaiting probes or masking commit failures', async () => {
  for (const kind of ['key', 'codex']) {
    const probe = deferred()
    let committed = false, notified = 0
    const entry = { id: 'synthetic-entry', name: 'Work account' }
    const bridge = Object.create((kind === 'key' ? KeyPoolService : CodexAccountsService).prototype)
    bridge.onAdded = () => { assert.equal(committed, true); notified++; return probe.promise }
    const commit = async () => { committed = true; return entry }
    if (kind === 'key') bridge.pool = { add: commit }
    else bridge.accounts = { importFrom: commit }
    const invoke = () => kind === 'key' ? bridge.add({ provider: 'zai', name: 'Work account', value: 'synthetic-key' }) : bridge.import({ sourceId: 'codex' })
    assert.deepEqual(await invoke(), { entry })
    assert.equal(notified, 1)
    probe.resolve(); await settle()
    bridge.onAdded = () => Promise.reject(new Error('probe failed'))
    assert.deepEqual(await invoke(), { entry }, 'a failed asynchronous probe does not change a successful add')
    await settle()
    bridge.onAdded = () => { notified++ }
    const failed = async () => { throw new Error('commit failed') }
    if (kind === 'key') bridge.pool.add = failed
    else bridge.accounts.importFrom = failed
    await assert.rejects(invoke(), /commit failed/u)
    assert.equal(notified, 1)
  }
})

test('Host wires both account bridges to the same ready sampler and retains pre-ready notifications', async () => {
  const plugins = []
  apply({ plugin: (type, options) => plugins.push({ type, options }), on: () => () => {}, web: { registerSearchProvider() {} } }, { searchProviders: [], imageProviders: [], quotaRecord: true })
  const keys = plugins.find(item => item.type === KeyPoolService).options
  const codex = plugins.find(item => item.type === CodexAccountsService).options
  const quota = plugins.find(item => item.type === QuotaService).options
  assert.equal(keys.onAdded, codex.onAdded)
  let requests = 0
  keys.onAdded()
  quota.onReady({ requestInitialSample: () => { requests++; return Promise.resolve() } })
  assert.equal(requests, 1)
  codex.onAdded()
  assert.equal(requests, 2)
})

test('local history exposes safe account-specific sampler status rather than hiding missing targets', async () => {
  const config = { quotaRecord: true }
  const svc = sampler({ readConfig: () => config, now: () => 1800000000000, fetch: async () => Response.json({ rate_limit: { primary_window: { used_percent: 12, limit_window_seconds: 604800 } } }) })
  svc.credential = async provider => provider.id === 'openai-codex' ? { state: 'ok', account: 'safe@example.test', accountId: 'workspace', access: 'synthetic-private-material' } : { state: 'signed-out' }
  assert.equal((await svc.history()).sampling.status, 'pending')
  await svc.record()
  const state = (await svc.history()).sampling
  assert.deepEqual(state, { enabled: true, status: 'ok', lastTickAt: 1800000000 })
  assert.equal((await svc.history({ grantId: 'not-in-the-scan' })).sampling.status, 'not-probed')
  svc.credential = async provider => provider.id === 'openai-codex' ? { state: 'ok', account: 'other@example.test', accountId: 'other-workspace', access: 'synthetic-private-material' } : { state: 'signed-out' }
  const switched = (await svc.history()).sampling
  assert.equal(switched.status, 'not-probed', 'a new official identity cannot inherit the old account sampling success')
  assert.equal(Object.hasOwn(switched, 'lastTickAt'), false)
  config.quotaRecord = false
  assert.equal((await svc.history()).sampling.status, 'disabled')
  assert.ok(!JSON.stringify(state).includes('synthetic-private-material'))
})
