import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { WebError } from '@deepseek-ai/dsh-web'
import { createSearchProvider, PROVIDERS, ROUTER_PROVIDER_ID } from '../lib/providers.js'
import { SearchError } from '../lib/search.js'

const source = (id, extra = {}) => ({ url: `https://example.invalid/${id}`, title: `Result ${id}`, ...extra })
const outcome = id => ({ content: `RAW_BACKEND_CONTENT_${id}`, sources: [source(id)], truncated: false })
const empty = () => ({ content: 'RAW_BACKEND_EMPTY_ANSWER', sources: [], truncated: false })
const config = overrides => ({ searchProviders: ['openai-codex'], enabledProviders: [...PROVIDERS], timeoutMs: 60000, ...overrides })
const officialContext = (provider = { available: () => true, search: async () => empty() }) => ({ web: { searchProviders: new Map(provider ? [['deepseek-official', provider]] : []) } })
const pendingUntilAbort = (_ctx, _query, _options, signal) => new Promise((resolve, reject) => {
  if (signal.aborted) return reject(signal.reason)
  signal.addEventListener('abort', () => reject(signal.reason), { once: true })
})
const isCode = code => error => error instanceof WebError && error.code === code
const settled = () => new Promise(resolve => setImmediate(resolve))
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done }); return { promise, resolve } }
const assertNoRaw = value => assert.doesNotMatch(JSON.stringify(value), /RAW_BACKEND_/u)
const titles = result => result.sources.map(item => item.title)
async function withTimer(operation) {
  const keepAlive = setInterval(() => {}, 1000)
  try { return await operation() } finally { clearInterval(keepAlive) }
}

test('official always runs while optional selections reread shared settings on every call', async () => {
  let current = config(); const calls = []
  const official = { available: () => true, search: async (request, signal) => { calls.push(['official', request.query, request.maxResults]); assert.ok(signal instanceof AbortSignal); return outcome('official') } }
  const router = createSearchProvider(officialContext(official), () => current, {
    codexSearch: async (_ctx, query, options) => { calls.push(['codex', query, options.maxResults]); return outcome('codex') },
    zaiSearch: async (_ctx, query, options) => { calls.push(['zai', query, options.maxResults]); return outcome('zai') },
  })
  assert.equal(router.id, ROUTER_PROVIDER_ID)
  const first = await router.search({ query: 'first', maxResults: 3 })
  current = config({ searchProviders: ['zai'] })
  const second = await router.search({ query: 'second', maxResults: 5 })
  assert.deepEqual(calls, [['official', 'first', 3], ['codex', 'first', 3], ['official', 'second', 5], ['zai', 'second', 5]])
  assert.deepEqual(titles(first), ['[官方] Result official', '[OpenAI] Result codex'])
  assert.deepEqual(titles(second), ['[官方] Result official', '[ZAI] Result zai'])
  assertNoRaw(first); assertNoRaw(second)
})

test('zero enhancements call official only without recursion and still mark provenance', async () => {
  let seen
  const ctx = officialContext({ available: () => true, search: async (request, signal) => { seen = { request, signal }; return outcome('official') } })
  ctx.web.search = () => { throw new Error('recursive ctx.web.search is forbidden') }
  const result = await createSearchProvider(ctx, () => config({ searchProviders: [] })).search({ query: ' official query ', maxResults: 2 })
  assert.deepEqual(seen.request, { query: 'official query', maxResults: 2 })
  assert.equal(seen.signal.aborted, false)
  assert.equal(result.sources[0].title, '[官方] Result official')
  assert.equal(result.content, '搜索来源：官方 1 条。合并去重后展示 1 条。')
  assertNoRaw(result)
})

test('official-only long citation URLs survive without adapter metadata length limits', async () => {
  const longUrl = `https://example.invalid/document/${'a'.repeat(2500)}?section=full#citation`
  const ctx = officialContext({ available: () => true, search: async () => ({ sources: [{ url: longUrl, title: 'Long official citation' }], truncated: false }) })
  const result = await createSearchProvider(ctx, () => config({ searchProviders: [] })).search({ query: 'long URL', maxResults: 1 })
  assert.equal(result.sources[0].url, longUrl)
  assert.equal(result.sources[0].title, '[官方] Long official citation')
  assert.equal(result.truncated, false)
})

test('all three routes start before any completes and share one cancellation signal', async () => {
  const starts = []; const signals = []; const gates = [deferred(), deferred(), deferred()]
  const start = (id, index, signal) => { starts.push(id); signals.push(signal); return gates[index].promise }
  const ctx = officialContext({ available: () => true, search: (request, signal) => { assert.equal(request.maxResults, 4); return start('official', 0, signal) } })
  const router = createSearchProvider(ctx, () => config({ searchProviders: ['openai-codex', 'zai'] }), {
    codexSearch: (_ctx, query, options, signal) => { assert.equal(query, 'parallel'); assert.equal(options.maxResults, 4); return start('codex', 1, signal) },
    zaiSearch: (_ctx, _query, _options, signal) => start('zai', 2, signal),
  })
  const task = router.search({ query: 'parallel', maxResults: 4 }); await settled()
  const beforeRelease = [...starts]
  gates[2].resolve(outcome('zai')); gates[1].resolve(outcome('codex')); gates[0].resolve(outcome('official'))
  const result = await task
  assert.deepEqual(beforeRelease, ['official', 'codex', 'zai'])
  assert.ok(signals.every(signal => signal === signals[0]))
  assert.deepEqual(titles(result), ['[官方] Result official', '[OpenAI] Result codex', '[ZAI] Result zai'])
})

test('three-route round-robin uses a fair total cap with per-route unique counts', async () => {
  const rows = id => ({ content: `RAW_BACKEND_${id}`, sources: [1, 2, 3, 4].map(rank => source(`${id}-${rank}`)), truncated: false })
  const router = createSearchProvider(officialContext({ available: () => true, search: async () => rows('official') }), () => config({ searchProviders: ['openai-codex', 'zai'] }), { codexSearch: async () => rows('codex'), zaiSearch: async () => rows('zai') })
  const result = await router.search({ query: 'fair', maxResults: 8 })
  assert.deepEqual(result.sources.map(item => item.url), ['official-1', 'codex-1', 'zai-1', 'official-2', 'codex-2', 'zai-2', 'official-3', 'codex-3'].map(id => source(id).url))
  assert.equal(result.truncated, true)
  assert.equal(result.content, '搜索来源：官方 4 条；OpenAI 4 条；ZAI 4 条。合并去重后展示 8 条。')
  assertNoRaw(result)
})

test('canonical duplicate URLs union actual origins in fixed order without rewriting original URL', async () => {
  const original = 'https://example.invalid/article/#official'
  const router = createSearchProvider(officialContext({ available: () => true, search: async () => ({ sources: [{ url: original, title: 'Original citation' }], truncated: false }) }), () => config({ searchProviders: ['zai', 'openai-codex'] }), {
    codexSearch: async () => ({ sources: [{ url: 'https://example.invalid/article#openai' }], truncated: false }),
    zaiSearch: async () => ({ sources: [{ url: 'https://example.invalid/article///#zai' }], truncated: false }),
  })
  const result = await router.search({ query: 'origins', maxResults: 8 })
  assert.equal(result.sources.length, 1)
  assert.equal(result.sources[0].url, original)
  assert.equal(result.sources[0].title, '[官方 + OpenAI + ZAI] Original citation')
  assert.equal(result.truncated, false)
})

test('a duplicate beyond the output cap still augments origins of the retained source', async () => {
  const router = createSearchProvider(officialContext({ available: () => true, search: async () => ({ sources: [source('shared')], truncated: false }) }), () => config({ searchProviders: ['openai-codex', 'zai'] }), {
    codexSearch: async () => ({ sources: [...Array.from({ length: 20 }, (_, index) => source(`codex-${index}`)), { url: `${source('shared').url}/#late-openai` }], truncated: false }),
    zaiSearch: async () => ({ sources: [source('zai-first'), { url: `${source('shared').url}#late-zai` }], truncated: false }),
  })
  const result = await router.search({ query: 'late union', maxResults: 1 })
  assert.equal(result.sources[0].title, '[官方 + OpenAI + ZAI] Result shared')
  assert.equal(result.sources.length, 1)
  assert.equal(result.truncated, true)
})

test('duplicate toggle ids dispatch once and duplicate-only rows are not falsely truncated', async () => {
  const calls = []; const shared = source('shared')
  const router = createSearchProvider(officialContext({ available: () => true, search: async () => { calls.push('official'); return { sources: [shared, shared], truncated: false } } }), () => config({ searchProviders: ['openai-codex', 'openai-codex', 'zai', 'zai'] }), {
    codexSearch: async () => { calls.push('codex'); return { sources: [shared], truncated: false } }, zaiSearch: async () => { calls.push('zai'); return { sources: [shared], truncated: false } },
  })
  const result = await router.search({ query: 'duplicates', maxResults: 1 })
  assert.deepEqual(calls, ['official', 'codex', 'zai'])
  assert.equal(result.sources[0].title, '[官方 + OpenAI + ZAI] Result shared')
  assert.equal(result.content, '搜索来源：官方 1 条；OpenAI 1 条；ZAI 1 条。合并去重后展示 1 条。')
  assert.equal(result.truncated, false)
})

test('metadata is whitelisted, bounded and stripped of control, bidi and excess whitespace', async () => {
  const router = createSearchProvider(officialContext(), () => config(), { codexSearch: async () => ({ content: 'RAW_BACKEND_MALICIOUS_MARKDOWN', sources: [{ url: source('metadata').url, title: `  Spaced\n\t\u202e title ${'x'.repeat(600)}  `, snippet: `  summary\n\t\u2066 ${'y'.repeat(800)}  `, publishedAt: ' 2026-10-10 ', provider: 'fake-origin', arbitrary: 'SYNTHETIC_SOURCE_EXTRA' }], truncated: false }) })
  const result = await router.search({ query: 'metadata' }); const row = result.sources[0]
  assert.deepEqual(Object.keys(row).sort(), ['publishedAt', 'snippet', 'title', 'url'])
  assert.match(row.title, /^\[OpenAI\] /u)
  assert.ok(row.title.length <= 250); assert.ok(row.snippet.length <= 300)
  assert.doesNotMatch(row.title + row.snippet, /[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]| {2,}/u)
  assertNoRaw(result); assert.doesNotMatch(JSON.stringify(result), /SYNTHETIC_SOURCE_EXTRA|fake-origin/u)
})

test('inflight selection snapshots resist in-place edits while later calls see the new enhancement', async () => {
  const current = config(); const gate = deferred(); let codexCalls = 0; let zaiCalls = 0
  const router = createSearchProvider(officialContext(), () => current, { codexSearch: async () => { codexCalls++; return codexCalls === 1 ? gate.promise : outcome('later-codex') }, zaiSearch: async () => { zaiCalls++; return outcome('later-zai') } })
  const first = router.search({ query: 'first' }); await settled(); current.searchProviders.push('zai')
  const second = await router.search({ query: 'second' }); gate.resolve(outcome('old-codex'))
  assert.deepEqual((await first).sources.map(item => item.url), [source('old-codex').url])
  assert.deepEqual(second.sources.map(item => item.url), [source('later-codex').url, source('later-zai').url])
  assert.equal(zaiCalls, 1)
})

test('an optional failure never cancels siblings and exposes only a safe short router status', async () => {
  const secret = 'SYNTHETIC_ERROR_SECRET'; const gate = deferred(); let siblingSignal
  const router = createSearchProvider(officialContext({ available: () => true, search: async () => outcome('official') }), () => config({ searchProviders: ['openai-codex', 'zai'] }), {
    codexSearch: async () => { throw new SearchError(`Credential ${secret}`, 'CREDENTIAL_MISSING') }, zaiSearch: async (_ctx, _query, _options, signal) => { siblingSignal = signal; return gate.promise },
  })
  const task = router.search({ query: 'partial' }); await settled(); assert.equal(siblingSignal.aborted, false); gate.resolve(outcome('zai'))
  const result = await task
  assert.deepEqual(titles(result), ['[官方] Result official', '[ZAI] Result zai'])
  assert.match(result.content, /OpenAI未成功（WEB_PROVIDER_CREDENTIAL_MISSING）/u)
  assert.doesNotMatch(JSON.stringify(result), new RegExp(secret, 'u')); assertNoRaw(result)
})

test('official available without credentials is an actual failure, not an invented official success', async () => {
  let officialCalls = 0
  const router = createSearchProvider(officialContext({ available: () => true, search: async () => { officialCalls++; throw new WebError('Synthetic credential missing', 'WEB_PROVIDER_CREDENTIAL_MISSING') } }), () => config({ searchProviders: ['zai'] }), { zaiSearch: async () => outcome('zai') })
  const result = await router.search({ query: 'official unavailable' })
  assert.equal(officialCalls, 1); assert.deepEqual(titles(result), ['[ZAI] Result zai'])
  assert.match(result.content, /官方未成功（WEB_PROVIDER_CREDENTIAL_MISSING）/u); assertNoRaw(result)
})

test('all three failures yield ALL_FAILED without raw messages or arbitrary provider codes', async () => {
  const secret = 'SYNTHETIC_ALL_FAILED_SECRET'
  const router = createSearchProvider(officialContext({ available: () => true, search: async () => { throw new WebError(secret, 'WEB_PROVIDER_ERROR') } }), () => config({ searchProviders: ['openai-codex', 'zai'] }), { codexSearch: async () => { throw new SearchError(secret, 'CREDENTIAL_MISSING') }, zaiSearch: async () => { throw new Error(secret) } })
  await assert.rejects(router.search({ query: 'all failed' }), error => { assert.ok(isCode('WEB_PROVIDER_ALL_FAILED')(error)); assert.equal(error.message, 'All search providers failed'); assert.equal(error.cause, undefined); return true })
})

test('successful empty results do not become ALL_FAILED and raw empty answers are not returned', async () => {
  const router = createSearchProvider(officialContext(), () => config({ searchProviders: ['openai-codex', 'zai'] }), { codexSearch: async () => empty(), zaiSearch: async () => { throw new Error('Synthetic failed route') } })
  const result = await router.search({ query: 'empty success' })
  assert.deepEqual(result.sources, []); assert.match(result.content, /WEB_PROVIDER_ERROR/u); assertNoRaw(result)
})

test('invalid selection types and disabled routes reject before any provider dispatch', async () => {
  let current = config(); let calls = 0
  const router = createSearchProvider(officialContext({ available: () => true, search: async () => { calls++; return empty() } }), () => current, { codexSearch: async () => { calls++; return empty() } })
  for (const searchProviders of [null, 'openai-codex', {}, ['unknown'], ['deepseek-official'], ['google-zread']]) { current = config({ searchProviders }); await assert.rejects(router.search({ query: 'invalid' }), isCode('WEB_PROVIDER_CONFIG')) }
  current = config({ searchProviders: ['openai-codex', 'zai'], enabledProviders: ['deepseek-official', 'openai-codex'] })
  await assert.rejects(router.search({ query: 'disabled' }), isCode('WEB_PROVIDER_CONFIGURED_UNAVAILABLE')); assert.equal(calls, 0)
})

test('official-only missing or unavailable registration fails without silent fallback', async () => {
  const selected = () => config({ searchProviders: [] })
  await assert.rejects(createSearchProvider(officialContext(null), selected).search({ query: 'missing' }), isCode('WEB_PROVIDER_CONFIGURED_MISSING'))
  await assert.rejects(createSearchProvider(officialContext({ available: () => false, search: async () => empty() }), selected).search({ query: 'unavailable' }), isCode('WEB_PROVIDER_CONFIGURED_UNAVAILABLE'))
})

test('fixed operational override is a single route with provenance, safe status and no official dispatch', async () => {
  let options
  const ctx = officialContext({ available: () => true, search: async () => { throw new Error('fixed direct must not call official') } })
  const reader = createSearchProvider(ctx, () => config({ searchProviders: [], zreadEndpoint: 'https://reader.invalid/?url={url}' }), { googleZreadSearch: async (_ctx, _query, value) => { options = value; return outcome('reader') } }, 'google-zread')
  const result = await reader.search({ query: 'reader' })
  assert.equal(options.maxResults, 8); assert.equal(options.endpoint, 'https://reader.invalid/?url={url}')
  assert.equal(result.sources[0].title, '[Google] Result reader'); assertNoRaw(result)
  const codex = createSearchProvider(ctx, () => config({ searchProviders: ['zai'] }), { codexSearch: async () => outcome('codex') }, 'openai-codex')
  assert.equal((await codex.search({ query: 'direct' })).sources[0].title, '[OpenAI] Result codex')
})

test('direct single-provider errors retain public codes but strip HTTP and MCP secret echoes', async () => {
  const secret = 'SYNTHETIC_DIRECT_ERROR_SECRET'
  for (const failure of [new SearchError(`HTTP Bearer ${secret}`, 'CREDENTIAL_MISSING'), new SearchError(`MCP ${secret}`, 'PROVIDER_ERROR'), new Error(secret)]) {
    const router = createSearchProvider(officialContext(), () => config(), { codexSearch: async () => { throw failure } }, 'openai-codex')
    await assert.rejects(router.search({ query: 'safe error' }), error => { assert.ok(error instanceof WebError); assert.doesNotMatch(error.message, new RegExp(secret, 'u')); assert.equal(error.cause, undefined); return true })
  }
})

test('malformed backend values fail that route without corrupting successful sibling sources', async () => {
  const malformed = [null, undefined, {}, { sources: {} }, { sources: [null] }, { sources: [{}] }, { sources: [{ url: 'javascript:alert(1)' }] }, { sources: [{ url: 'ftp://example.invalid/' }] }, { sources: [{ url: source('bad').url, title: 42 }] }, { sources: [{ url: source('bad').url, snippet: false }] }, { sources: [{ url: source('bad').url, publishedAt: [] }] }, { sources: [], content: 42 }, { sources: [], truncated: 'true' }]
  for (const value of malformed) {
    const adapters = { codexSearch: async () => value, zaiSearch: async () => outcome('good-zai') }
    await assert.rejects(createSearchProvider(officialContext(), () => config(), adapters, 'openai-codex').search({ query: 'bad shape' }), isCode('WEB_PROVIDER_ERROR'))
    const result = await createSearchProvider(officialContext(), () => config({ searchProviders: ['openai-codex', 'zai'] }), adapters).search({ query: 'partial shape' })
    assert.deepEqual(titles(result), ['[ZAI] Result good-zai']); assert.match(result.content, /WEB_PROVIDER_ERROR/u)
  }
})

test('a sparse source array fails only that route and leaves successful siblings intact', async () => {
  const sparse = new Array(2)
  sparse[1] = source('unusable-sparse-row')
  const router = createSearchProvider(officialContext(), () => config({ searchProviders: ['openai-codex', 'zai'] }), { codexSearch: async () => ({ sources: sparse, truncated: false }), zaiSearch: async () => outcome('good-zai') })
  const result = await router.search({ query: 'sparse route' })
  assert.deepEqual(titles(result), ['[ZAI] Result good-zai'])
  assert.match(result.content, /OpenAI未成功（WEB_PROVIDER_ERROR）/u)
})

test('each source URL is read once so validation and projection use the same snapshot', async () => {
  let reads = 0
  const expected = source('snapshot').url
  const row = { title: 'Snapshot citation', get url() { reads++; return reads === 1 ? expected : 'javascript:SYNTHETIC_PRIVATE_GETTER' } }
  const router = createSearchProvider(officialContext(), () => config(), { codexSearch: async () => ({ sources: [row], truncated: false }) })
  const result = await router.search({ query: 'URL getter' })
  assert.equal(reads, 1)
  assert.equal(result.sources[0].url, expected)
  assert.doesNotMatch(JSON.stringify(result), /SYNTHETIC_PRIVATE_GETTER/u)
})

test('typed error code is read once before allowlisting and cannot flip to a private code', async () => {
  class NativeWebError extends Error {
    constructor() { super('SYNTHETIC_PRIVATE_MESSAGE'); this.name = 'WebError' }
    get code() { reads++; return reads === 1 ? 'WEB_PROVIDER_CREDENTIAL_MISSING' : 'SYNTHETIC_PRIVATE_CODE' }
  }
  let reads = 0
  const failure = new NativeWebError()
  const router = createSearchProvider(officialContext({ available: () => true, search: async () => { throw failure } }), () => config({ searchProviders: [] }))
  await assert.rejects(router.search({ query: 'code getter' }), error => {
    assert.equal(reads, 1)
    assert.equal(error.code, 'WEB_PROVIDER_CREDENTIAL_MISSING')
    assert.doesNotMatch(error.message + error.code, /SYNTHETIC_PRIVATE_/u)
    return true
  })
})

test('hostile Proxy prototype traps in a failed route cannot destroy a successful sibling', async () => {
  const failure = new Proxy({}, { getPrototypeOf() { throw new Error('SYNTHETIC_PRIVATE_PROXY_TRAP') } })
  const router = createSearchProvider(officialContext(), () => config({ searchProviders: ['openai-codex', 'zai'] }), { codexSearch: async () => { throw failure }, zaiSearch: async () => outcome('good-zai') })
  const result = await router.search({ query: 'proxy error' })
  assert.deepEqual(titles(result), ['[ZAI] Result good-zai'])
  assert.match(result.content, /OpenAI未成功（WEB_PROVIDER_ERROR）/u)
  assert.doesNotMatch(JSON.stringify(result), /SYNTHETIC_PRIVATE_PROXY_TRAP/u)
})

test('throwing native error name getters become a safe route failure rather than cancelling siblings', async () => {
  const failure = new Error('SYNTHETIC_PRIVATE_NAME_MESSAGE')
  Object.defineProperty(failure, 'name', { get() { throw new Error('SYNTHETIC_PRIVATE_NAME_TRAP') } })
  const router = createSearchProvider(officialContext({ available: () => true, search: async () => { throw failure } }), () => config(), { codexSearch: async () => outcome('good-codex') })
  const result = await router.search({ query: 'name getter' })
  assert.deepEqual(titles(result), ['[OpenAI] Result good-codex'])
  assert.match(result.content, /官方未成功（WEB_PROVIDER_ERROR）/u)
  assert.doesNotMatch(JSON.stringify(result), /SYNTHETIC_PRIVATE_NAME/u)
})

test('query normalization and invalid limits reject before backend dispatch', async () => {
  const queries = []; let current = config()
  const router = createSearchProvider(officialContext(), () => current, { codexSearch: async (_ctx, query) => { queries.push(query); return outcome('valid') } })
  await router.search({ query: '  useful query  ' }); assert.deepEqual(queries, ['useful query'])
  for (const query of ['   ', 'x'.repeat(4097)]) await assert.rejects(router.search({ query }))
  for (const maxResults of [-1, 1.5, NaN]) await assert.rejects(router.search({ query: 'query', maxResults }), isCode('WEB_PROVIDER_CONFIG'))
  for (const timeoutMs of [0, 1.5, 300001]) { current = config({ timeoutMs }); await assert.rejects(router.search({ query: 'query' }), isCode('WEB_PROVIDER_CONFIG')) }
  assert.equal(queries.length, 1)
})

test('single and shared empty-sibling routes use the same canonical dedupe and truncation', async () => {
  const rows = [source('article'), { url: `${source('article').url}/#second` }, source('other')]
  const adapters = { codexSearch: async () => ({ sources: rows, truncated: false }), zaiSearch: async () => empty() }
  const direct = await createSearchProvider(officialContext(), () => config(), adapters, 'openai-codex').search({ query: 'direct', maxResults: 2 })
  const shared = await createSearchProvider(officialContext(), () => config({ searchProviders: ['openai-codex', 'zai'] }), adapters).search({ query: 'shared', maxResults: 2 })
  assert.deepEqual(shared.sources, direct.sources); assert.equal(shared.truncated, false)
  const zero = await createSearchProvider(officialContext(), () => config(), adapters).search({ query: 'zero', maxResults: 0 })
  assert.deepEqual(zero.sources, []); assert.equal(zero.truncated, true)
})

test('pre-cancel dispatches nothing while inflight abort reaches all three routes', async () => {
  const signals = []; let calls = 0
  const pending = (...args) => { calls++; signals.push(args[3]); return pendingUntilAbort(...args) }
  const ctx = officialContext({ available: () => true, search: (request, signal) => pending(null, request.query, request, signal) })
  const router = createSearchProvider(ctx, () => config({ searchProviders: ['openai-codex', 'zai'] }), { codexSearch: pending, zaiSearch: pending })
  await assert.rejects(router.search({ query: 'pre-cancelled' }, AbortSignal.abort()), isCode('WEB_ABORTED')); assert.equal(calls, 0)
  const controller = new AbortController(); const task = router.search({ query: 'inflight' }, controller.signal)
  await settled(); controller.abort(new Error('synthetic user cancellation'))
  await assert.rejects(task, isCode('WEB_ABORTED')); assert.equal(calls, 3); assert.ok(signals.every(signal => signal.aborted))
})

test('caller cancellation and shared deadline stay fatal after another route has succeeded', async () => withTimer(async () => {
  const router = createSearchProvider(officialContext({ available: () => true, search: async () => outcome('completed-official') }), () => config({ searchProviders: ['openai-codex', 'zai'], timeoutMs: 20 }), { codexSearch: async () => outcome('completed-codex'), zaiSearch: pendingUntilAbort })
  await assert.rejects(router.search({ query: 'timeout' }), isCode('WEB_PROVIDER_TIMEOUT'))
  const controller = new AbortController(); const task = router.search({ query: 'caller cancel' }, controller.signal)
  await settled(); controller.abort(new Error('synthetic cancellation')); await assert.rejects(task, isCode('WEB_ABORTED'))
}))

test('timeout retains the first reason when its listener subsequently aborts caller', async () => withTimer(async () => {
  const controller = new AbortController(); let firstReason
  const router = createSearchProvider(officialContext(), () => config({ timeoutMs: 10 }), { codexSearch: (_ctx, _query, _options, signal) => new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => { firstReason = signal.reason; controller.abort(new Error('secondary cancellation')); reject(signal.reason) }, { once: true })
  }) })
  await assert.rejects(router.search({ query: 'timeout wins' }, controller.signal), error => { assert.equal(error.code, 'WEB_PROVIDER_TIMEOUT'); assert.equal(error.cause, firstReason); assert.equal(error.cause.name, 'TimeoutError'); return true })
}))

test('synchronous cancellation observes rejected backend promises under strict rejection handling', () => {
  const providersUrl = new URL('../lib/providers.js', import.meta.url).href
  const script = `
    import assert from 'node:assert/strict';
    const {createSearchProvider,PROVIDERS}=await import(${JSON.stringify(providersUrl)});
    const controller=new AbortController();
    const ctx={web:{searchProviders:new Map([['deepseek-official',{available:()=>true,search:async()=>({sources:[],truncated:false})}]])}};
    const router=createSearchProvider(ctx,()=>({searchProviders:['openai-codex','zai'],enabledProviders:PROVIDERS,timeoutMs:60000}),{
      codexSearch:()=>{controller.abort(new Error('synthetic cancellation'));return Promise.reject(new Error('synthetic rejection'));},
      zaiSearch:()=>Promise.reject(new Error('synthetic second rejection')),
    });
    await assert.rejects(router.search({query:'query'},controller.signal),error=>error.code==='WEB_ABORTED');
    await new Promise(resolve=>setImmediate(resolve));
  `
  const child = spawnSync(process.execPath, ['--unhandled-rejections=strict', '--input-type=module', '-e', script], { encoding: 'utf8', timeout: 5000, env: {} })
  assert.equal(child.error, undefined); assert.equal(child.signal, null); assert.equal(child.status, 0, child.stderr)
})

test('cross-copy official errors preserve approved codes but sanitize unknown codes and optional routes', async () => {
  class NativeWebError extends Error { constructor(message, code) { super(message); this.name = 'WebError'; this.code = code } }
  const missing = new NativeWebError('SYNTHETIC_NATIVE_ERROR_SECRET', 'WEB_PROVIDER_CREDENTIAL_MISSING')
  const trusted = createSearchProvider(officialContext({ available: () => true, search: async () => { throw missing } }), () => config({ searchProviders: [] }))
  await assert.rejects(trusted.search({ query: 'official error' }), error => { assert.equal(error.code, 'WEB_PROVIDER_CREDENTIAL_MISSING'); assert.notEqual(error, missing); assert.doesNotMatch(error.message, /SYNTHETIC_NATIVE_ERROR_SECRET/u); assert.equal(error.cause, undefined); return true })
  for (const code of ['SYNTHETIC_UNKNOWN', 'lowercase', 'WEB-CODE', 'W'.repeat(65), 42]) {
    const foreign = new NativeWebError('SYNTHETIC_NATIVE_ERROR_SECRET', code)
    const router = createSearchProvider(officialContext({ available: () => true, search: async () => { throw foreign } }), () => config({ searchProviders: [] }))
    await assert.rejects(router.search({ query: 'unknown native error' }), error => { assert.equal(error.code, 'WEB_PROVIDER_ERROR'); assert.doesNotMatch(error.message, /SYNTHETIC_NATIVE_ERROR_SECRET/u); return true })
  }
  for (const id of ['openai-codex', 'zai']) {
    const router = createSearchProvider(officialContext(), () => config(), { codexSearch: async () => { throw missing }, zaiSearch: async () => { throw missing } }, id)
    await assert.rejects(router.search({ query: 'foreign optional error' }), error => { assert.equal(error.code, 'WEB_PROVIDER_ERROR'); assert.notEqual(error, missing); assert.equal(error.cause, undefined); return true })
  }
})
