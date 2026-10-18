import test, { beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { createModels } from '@earendil-works/pi-ai'
import { openaiCodexProvider } from '@earendil-works/pi-ai/providers/openai-codex'
import { accountIdFromAccess, codexCredentialStore, createCodexImageAuth, ImageError, resolveZaiImageKey } from '../lib/image-auth.js'

const KEY = 'llm-pi-ai/openai-codex'
const load = async () => ({ createModels, openaiCodexProvider })
const jwt = account => `offline.${Buffer.from(JSON.stringify({ 'https://api.openai.com/auth': { chatgpt_account_id: account } })).toString('base64url')}.fake`
const record = (account = 'offline-account', expires = Date.now() + 3600000) => ({ kind: 'grant', payload: { type: 'oauth', access: jwt(account), refresh: 'offline-refresh', expires } })
const signal = () => new AbortController().signal
const missing = error => error instanceof ImageError && error.code === 'IMAGE_CREDENTIAL_MISSING'
const safe = error => !`${error.message}\n${error.stack}\n${JSON.stringify(error.cause)}`.includes('offline-secret-sentinel') && error.cause === undefined

// These tests use real installed Pi OAuth logic, but every network boundary is
// mocked. They never open the user's credential store or an OAuth connection.
beforeEach(t => { t.mock.method(globalThis, 'fetch', async () => { throw new Error('Unmocked network is forbidden') }) })
function memory(initial, beforeCommit) {
  let value = structuredClone(initial), tail = Promise.resolve()
  const counters = { reads: 0, modifications: 0, commits: 0, refs: 0 }
  return {
    counters, value: () => structuredClone(value),
    async readRecord(key) { assert.equal(key, KEY); counters.reads++; return structuredClone(value) },
    async resolve() { counters.refs++; throw new Error('OAuth must not fall back to an API key') },
    async modifyRecord(key, mutate) {
      assert.equal(key, KEY)
      const previous = tail; let release
      tail = new Promise(resolve => { release = resolve }); await previous
      counters.modifications++
      try {
        const next = await mutate(structuredClone(value))
        if (next !== undefined) { beforeCommit?.(); value = structuredClone(next); counters.commits++ }
        return structuredClone(value)
      } finally { release() }
    },
  }
}
function refreshNetwork(t, handler) {
  let calls = 0
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    calls++
    assert.equal(String(url), 'https://auth.openai.com/oauth/token')
    assert.equal(init.method, 'POST')
    assert.equal(init.body.get('grant_type'), 'refresh_token')
    assert.equal(init.body.get('refresh_token'), 'offline-refresh')
    return handler?.(init) ?? new Response(JSON.stringify({ access_token: jwt('rotated-account'), refresh_token: 'offline-rotated', expires_in: 3600 }))
  })
  return () => calls
}

test('Codex auth is lazy and a fresh grant has no OAuth network or key fallback', async () => {
  const credentials = memory(record()), counts = { loads: 0 }
  const auth = createCodexImageAuth({ credentials }, { load: async () => { counts.loads++; return load() } })
  assert.equal(counts.loads, 0); assert.equal(credentials.counters.reads, 0)
  assert.equal((await auth(signal())).accountId, 'offline-account')
  assert.equal((await auth(signal())).access, jwt('offline-account'))
  assert.equal(counts.loads, 1); assert.equal(credentials.counters.reads, 2)
  assert.equal(credentials.counters.commits, 0); assert.equal(credentials.counters.refs, 0)
})

test('cached Pi collection resolves the live service after fresh A to B replacement', async () => {
  const a = memory(record('account-a')), b = memory(record('account-b'))
  let selected = a
  const auth = createCodexImageAuth({ credentials: a, get: key => { assert.equal(key, 'credentials'); return selected } }, { load })
  assert.equal((await auth(signal())).accountId, 'account-a')
  selected = b
  assert.equal((await auth(signal())).accountId, 'account-b')
  assert.equal(a.counters.reads, 1); assert.equal(b.counters.reads, 1)
  selected = undefined
  await assert.rejects(auth(signal()), missing)
  assert.equal(a.counters.reads, 1); assert.equal(b.counters.reads, 1)
})

test('live replacement to expired B refreshes only B, not the original store', async t => {
  const calls = refreshNetwork(t)
  const a = memory(record('account-a')), b = memory(record('account-b', Date.now() - 1))
  const ctx = { credentials: a }, auth = createCodexImageAuth(ctx, { load })
  await auth(signal()); ctx.credentials = b
  assert.equal((await auth(signal())).accountId, 'rotated-account')
  assert.equal(calls(), 1); assert.equal(a.counters.commits, 0); assert.equal(b.counters.commits, 1)
})

test('twelve concurrent calls across two Pi collections share one serialized refresh', async t => {
  const calls = refreshNetwork(t), credentials = memory(record('expired', Date.now() - 1))
  const resolvers = [createCodexImageAuth({ credentials }, { load }), createCodexImageAuth({ credentials }, { load })]
  const results = await Promise.all(Array.from({ length: 12 }, (_, index) => resolvers[index % 2](signal())))
  assert.ok(results.every(result => result.accountId === 'rotated-account'))
  assert.equal(calls(), 1); assert.equal(credentials.counters.commits, 1)
  assert.equal(credentials.value().payload.refresh, 'offline-rotated')
})

test('service replacement during rotation does not move the transaction to another store', async t => {
  refreshNetwork(t)
  const b = memory(record('account-b'))
  const ctx = {}
  const a = memory(record('expired', Date.now() - 1), () => { ctx.credentials = b })
  ctx.credentials = a
  const auth = createCodexImageAuth(ctx, { load })
  assert.equal((await auth(signal())).accountId, 'rotated-account')
  assert.equal(a.counters.commits, 1); assert.equal(b.counters.commits, 0)
  assert.equal(b.value().payload.access, jwt('account-b'))
  assert.equal((await auth(signal())).accountId, 'account-b')
})

test('replacement between optimistic read and locked modify rechecks B without refreshing A', async t => {
  const calls = refreshNetwork(t), a = memory(record('expired-a', Date.now() - 1)), b = memory(record('fresh-b'))
  const ctx = { credentials: a }, readA = a.readRecord.bind(a)
  a.readRecord = async key => { const value = await readA(key); ctx.credentials = b; return value }
  assert.equal((await createCodexImageAuth(ctx, { load })(signal())).accountId, 'fresh-b')
  assert.equal(calls(), 0); assert.equal(a.counters.modifications, 0); assert.equal(b.counters.modifications, 1)
  assert.equal(b.counters.commits, 0)
})

test('queued credential modification rechecks cancellation before running the refresh mutator', async () => {
  let enter, release, mutations = 0
  const entered = new Promise(resolve => { enter = resolve }), gate = new Promise(resolve => { release = resolve })
  const controller = new AbortController()
  const credentials = { async modifyRecord(_key, mutate) { enter(); await gate; return mutate(record()) } }
  const modifying = codexCredentialStore(credentials).modify('openai-codex', () => { mutations++; return record().payload }, { signal: controller.signal })
  await entered; controller.abort(new Error('offline cancellation')); release()
  await assert.rejects(modifying, /offline cancellation/)
  assert.equal(mutations, 0)
})

test('cancellation after refresh resolves still commits the rotated grant', async t => {
  const calls = refreshNetwork(t), controller = new AbortController()
  const credentials = memory(record('expired', Date.now() - 1), () => controller.abort(new Error('offline cancellation')))
  await assert.rejects(createCodexImageAuth({ credentials }, { load })(controller.signal), /offline cancellation/)
  assert.equal(calls(), 1); assert.equal(credentials.counters.commits, 1)
  assert.equal(credentials.value().payload.refresh, 'offline-rotated')
})

test('failed refresh preserves the old grant and hides the private body/cause', async t => {
  const calls = refreshNetwork(t, () => new Response('offline-secret-sentinel', { status: 401 }))
  const before = record('expired', Date.now() - 1), credentials = memory(before)
  await assert.rejects(createCodexImageAuth({ credentials }, { load })(signal()), error => missing(error) && safe(error))
  assert.equal(calls(), 1); assert.equal(credentials.counters.commits, 0); assert.equal(credentials.counters.refs, 0)
  assert.deepEqual(credentials.value(), before)
})

test('missing OAuth and API-key-only records never use the API key', async () => {
  for (const initial of [undefined, { kind: 'api-key', key: 'offline-secret-sentinel' }]) {
    const credentials = memory(initial)
    await assert.rejects(createCodexImageAuth({ credentials }, { load })(signal()), error => missing(error) && safe(error))
    assert.equal(credentials.counters.refs, 0); assert.equal(credentials.counters.commits, 0)
  }
})

test('pre-cancelled auth does not load Pi or read the store', async () => {
  const credentials = memory(record()), controller = new AbortController()
  controller.abort(new Error('offline cancellation'))
  const auth = createCodexImageAuth({ credentials }, { load: () => { throw new Error('must not load') } })
  await assert.rejects(auth(controller.signal), /offline cancellation/)
  assert.equal(credentials.counters.reads, 0); assert.equal(credentials.counters.modifications, 0)
})

test('store and lazy loader diagnostics never expose private messages or causes', async () => {
  const credentials = { async readRecord() { throw new ImageError('offline-secret-sentinel') } }
  await assert.rejects(createCodexImageAuth({ credentials }, { load })(signal()), error => missing(error) && safe(error))
  await assert.rejects(createCodexImageAuth({}, { load: async () => { throw new Error('offline-secret-sentinel') } })(signal()), error => error.code === 'IMAGE_CONFIG' && safe(error))
})

test('bridge list follows a getter; unsupported ids and deletion cannot mutate authorization', async () => {
  let selected = memory(record())
  const store = codexCredentialStore(() => selected)
  assert.deepEqual(await store.list(), [{ providerId: 'openai-codex', type: 'oauth' }])
  selected = memory({ kind: 'api-key', key: 'offline-key' })
  assert.deepEqual(await store.list(), [])
  await assert.rejects(store.read('zai'), error => error.code === 'IMAGE_CONFIG')
  await assert.rejects(store.modify('zai', () => undefined), error => error.code === 'IMAGE_CONFIG')
  await assert.rejects(store.delete('openai-codex'), error => error.code === 'IMAGE_CONFIG')
  assert.equal(selected.counters.modifications, 0)
})

test('JWT account extraction rejects invalid/missing identity without exposing its input', () => {
  assert.equal(accountIdFromAccess(jwt('offline-account')), 'offline-account')
  for (const invalid of ['offline-secret-sentinel', 'a.b.c', `a.${Buffer.from('{}').toString('base64url')}.c`, jwt(' ')]) {
    assert.throws(() => accountIdFromAccess(invalid), error => missing(error) && safe(error))
  }
})

function regional({ records = {}, refs = {}, failure } = {}) {
  const read = [], resolved = []
  return { read, resolved, credentials: {
    async readRecord(key) { read.push(key); if (failure) throw failure; return records[key] },
    async resolve(ref) { resolved.push(ref); return refs[ref] === undefined ? undefined : { value: refs[ref] } },
  } }
}
test('each Z.AI route uses only its own record key or fixed regional reference', async () => {
  const f = regional({ refs: { ZAI_API_KEY: 'offline-international', ZAI_CODING_CN_API_KEY: 'offline-domestic' } })
  assert.equal(await resolveZaiImageKey(f, 'zai', signal()), 'offline-international')
  assert.equal(await resolveZaiImageKey(f, 'zai-cn', signal()), 'offline-domestic')
  assert.deepEqual(f.read, ['llm-pi-ai/zai', 'llm-pi-ai/zai-coding-cn'])
  assert.deepEqual(f.resolved, ['ZAI_API_KEY', 'ZAI_CODING_CN_API_KEY'])
  const stored = regional({ records: { 'llm-pi-ai/zai': { kind: 'api-key', key: 'offline-stored' } }, refs: { ZAI_API_KEY: 'offline-ambient' } })
  assert.equal(await resolveZaiImageKey(stored, 'zai', signal()), 'offline-stored')
  assert.deepEqual(stored.resolved, [])
})

test('record.env cannot select another region or act as an arbitrary credential-ref list', async () => {
  for (const [provider, id, own, other] of [['zai', 'zai', 'ZAI_API_KEY', 'ZAI_CODING_CN_API_KEY'], ['zai-cn', 'zai-coding-cn', 'ZAI_CODING_CN_API_KEY', 'ZAI_API_KEY']]) {
    const f = regional({ records: { [`llm-pi-ai/${id}`]: { kind: 'api-key', env: { unrelated: other, [own]: 'offline-env-value' } } }, refs: { [other]: 'offline-other-key' } })
    await assert.rejects(resolveZaiImageKey(f, provider, signal()), missing)
    assert.deepEqual(f.resolved, [own])
  }
})

test('regional resolver uses the live service and sanitizes even foreign ImageError', async () => {
  const a = regional({ refs: { ZAI_API_KEY: 'offline-a' } }), b = regional({ refs: { ZAI_API_KEY: 'offline-b' } })
  let selected = a.credentials
  const ctx = { credentials: a.credentials, get: () => selected }
  assert.equal(await resolveZaiImageKey(ctx, 'zai'), 'offline-a')
  selected = b.credentials
  assert.equal(await resolveZaiImageKey(ctx, 'zai'), 'offline-b')
  selected = regional({ failure: new ImageError('offline-secret-sentinel') }).credentials
  await assert.rejects(resolveZaiImageKey(ctx, 'zai'), error => missing(error) && safe(error))
  selected = undefined
  await assert.rejects(resolveZaiImageKey(ctx, 'zai'), missing)
})

test('unsupported regional record/provider and pre-cancel cannot discover other keys', async () => {
  const f = regional({ records: { 'llm-pi-ai/zai': { kind: 'grant', payload: {} } }, refs: { ZAI_API_KEY: 'offline-key' } })
  await assert.rejects(resolveZaiImageKey(f, 'zai'), missing)
  assert.deepEqual(f.resolved, [])
  await assert.rejects(resolveZaiImageKey(f, 'zai-coding-cn'), error => error.code === 'IMAGE_CONFIG')
  const controller = new AbortController(); controller.abort(new Error('offline cancellation'))
  const before = f.read.length
  await assert.rejects(resolveZaiImageKey(f, 'zai', controller.signal), /offline cancellation/)
  assert.equal(f.read.length, before)
})
