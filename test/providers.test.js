import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { WebError } from '@deepseek-ai/dsh-web'
import { createSearchProvider, PROVIDERS, ROUTER_PROVIDER_ID } from '../lib/providers.js'
import { SearchError } from '../lib/search.js'

const outcome = label => ({ content: label, sources: [{ url: `https://example.invalid/${label}` }], truncated: false })
const config = overrides => ({ searchProviders: ['openai-codex'], enabledProviders: [...PROVIDERS], timeoutMs: 60000, ...overrides })
const officialContext = provider => ({ web: { searchProviders: new Map(provider ? [['deepseek-official', provider]] : []) } })
const pendingUntilAbort = (_ctx, _query, _options, signal) => new Promise((resolve, reject) => {
  if (signal.aborted) return reject(signal.reason)
  signal.addEventListener('abort', () => reject(signal.reason), { once: true })
})
const isCode = code => error => error instanceof WebError && error.code === code
const settled = () => new Promise(resolve => setImmediate(resolve))
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done }); return { promise, resolve } }

// Timeout signals are unref'ed; a bounded test interval keeps pending adapters alive.
async function withTimer(operation) {
  const keepAlive = setInterval(() => {}, 1000)
  try { return await operation() } finally { clearInterval(keepAlive) }
}

test('router is a native provider and rereads independent selections on each call', async () => {
  let current = config()
  const calls = []
  const router = createSearchProvider(officialContext(), () => current, {
    codexSearch: async (_ctx, query, options, signal) => { calls.push({ provider: 'openai-codex', query, options, signal }); return outcome('codex') },
    zaiSearch: async (_ctx, query, options, signal) => { calls.push({ provider: 'zai', query, options, signal }); return outcome('zai') },
  })
  assert.equal(router.id, ROUTER_PROVIDER_ID)
  assert.equal(typeof router.available, 'function')
  assert.equal((await router.search({ query: 'first', maxResults: 3 })).content, 'codex')
  current = config({ searchProviders: ['zai'] })
  assert.equal((await router.search({ query: 'second', maxResults: 5 })).content, 'zai')
  assert.deepEqual(calls.map(call => [call.provider, call.query, call.options.maxResults]), [['openai-codex', 'first', 3], ['zai', 'second', 5]])
  assert.ok(calls.every(call => call.signal instanceof AbortSignal))
})

test('both toggles off call the official provider directly without recursive seam dispatch', async () => {
  let seen
  const ctx = officialContext({ available: () => true, search: async (request, signal) => { seen = { request, signal }; return outcome('official') } })
  ctx.web.search = () => { throw new Error('recursive ctx.web.search is forbidden') }
  const router = createSearchProvider(ctx, () => config({ searchProviders: [] }))
  const result = await router.search({ query: ' official query ', maxResults: 2 }, new AbortController().signal)
  assert.equal(result.content, 'official')
  assert.deepEqual(seen.request, { query: 'official query', maxResults: 2 })
  assert.equal(seen.signal.aborted, false)
})

test('both toggles off preserve legitimate official source URLs longer than adapter metadata bounds', async () => {
  const longUrl = `https://example.invalid/document/${'a'.repeat(2500)}?section=full#citation`
  const ctx = officialContext({ available: () => true, search: async () => ({ sources: [{ url: longUrl, title: 'Long official citation' }], truncated: false }) })
  const result = await createSearchProvider(ctx, () => config({ searchProviders: [] })).search({ query: 'official long URL', maxResults: 1 })
  assert.equal(result.sources[0].url, longUrl)
  assert.equal(result.sources[0].title, 'Long official citation')
  assert.equal(result.truncated, false)
})

test('fixed reader route retains default source bound and deployment endpoint independently of toggle selections', async () => {
  let options
  const router = createSearchProvider(officialContext(), () => config({ searchProviders: [], zreadEndpoint: 'https://reader.invalid/?url={url}' }), {
    googleZreadSearch: async (_ctx, query, value) => { assert.equal(query, 'query'); options = value; return outcome('reader') },
  }, 'google-zread')
  await router.search({ query: 'query' })
  assert.equal(options.maxResults, 8)
  assert.equal(options.endpoint, 'https://reader.invalid/?url={url}')
})

test('inflight calls copy their toggle snapshot while later calls see in-place array edits', async () => {
  const current = config()
  const gate = deferred()
  let codexCalls = 0
  let zaiCalls = 0
  const router = createSearchProvider(officialContext(), () => current, {
    codexSearch: async () => { codexCalls++; return codexCalls === 1 ? gate.promise : outcome('later-codex') },
    zaiSearch: async () => { zaiCalls++; return outcome('new-selection') },
  })
  const first = router.search({ query: 'inflight' })
  await settled()
  current.searchProviders.push('zai')
  const second = await router.search({ query: 'later' })
  gate.resolve(outcome('old-selection'))
  assert.equal((await first).content, 'old-selection')
  assert.match(second.content, /new-selection/u)
  assert.equal(zaiCalls, 1)
})

test('both providers genuinely start before either completes and receive one shared signal', async () => {
  const starts = []
  const gates = [deferred(), deferred()]
  const signals = []
  const adapter = (id, index) => (_ctx, query, options, signal) => {
    starts.push(id); signals.push(signal)
    assert.equal(query, 'parallel query')
    assert.equal(options.maxResults, 4)
    return gates[index].promise
  }
  const router = createSearchProvider(officialContext(), () => config({ searchProviders: ['openai-codex', 'zai'] }), {
    codexSearch: adapter('openai-codex', 0), zaiSearch: adapter('zai', 1),
  })
  const task = router.search({ query: 'parallel query', maxResults: 4 })
  await settled()
  const admittedBeforeRelease = [...starts]
  gates[1].resolve(outcome('zai-answer'))
  gates[0].resolve(outcome('codex-answer'))
  const result = await task
  assert.deepEqual(admittedBeforeRelease, ['openai-codex', 'zai'])
  assert.equal(signals[0], signals[1])
  assert.match(result.content, /codex-answer/u)
  assert.match(result.content, /zai-answer/u)
})

test('combined results round-robin across providers, deduplicate URLs, and honor a total source cap', async () => {
  const source = suffix => ({ url: `https://example.invalid/${suffix}` })
  const router = createSearchProvider(officialContext(), () => config({ searchProviders: ['openai-codex', 'zai'] }), {
    codexSearch: async () => ({ content: 'codex answer', sources: [source('shared'), source('a2'), source('a3'), source('a4')], truncated: false }),
    zaiSearch: async () => ({ content: 'zai answer', sources: [source('shared'), source('b2'), source('b3'), source('b4')], truncated: false }),
  })
  const result = await router.search({ query: 'query', maxResults: 4 })
  assert.deepEqual(result.sources.map(source => source.url), ['shared', 'b2', 'a2', 'b3'].map(id => `https://example.invalid/${id}`))
  assert.equal(result.truncated, true)
  assert.match(result.content, /codex answer/u)
  assert.match(result.content, /zai answer/u)
})

test('duplicate provider toggles dispatch each backend once and duplicate-only lists are not truncated', async () => {
  const calls = []
  const source = { url: 'https://example.invalid/shared' }
  const router = createSearchProvider(officialContext(), () => config({ searchProviders: ['openai-codex', 'openai-codex', 'zai', 'zai'] }), {
    codexSearch: async () => { calls.push('codex'); return { sources: [source, source], truncated: false } },
    zaiSearch: async () => { calls.push('zai'); return { sources: [source], truncated: false } },
  })
  const result = await router.search({ query: 'duplicates', maxResults: 1 })
  assert.deepEqual(calls, ['codex', 'zai'])
  assert.deepEqual(result.sources, [source])
  assert.equal(result.truncated, false)
})

test('combined URL deduplication ignores fragments and nonroot trailing slashes without rewriting source URLs', async () => {
  const original = 'https://example.invalid/article/#codex'
  const router = createSearchProvider(officialContext(), () => config({ searchProviders: ['openai-codex', 'zai'] }), {
    codexSearch: async () => ({ sources: [{ url: original, title: 'Original citation' }, { url: 'https://example.invalid/?lang=en' }], truncated: false }),
    zaiSearch: async () => ({ sources: [{ url: 'https://example.invalid/article#zai' }, { url: 'https://example.invalid/article///#again' }, { url: 'https://example.invalid/?lang=zh' }], truncated: false }),
  })
  const result = await router.search({ query: 'normalized URLs', maxResults: 8 })
  assert.deepEqual(result.sources.map(source => source.url), [original, 'https://example.invalid/?lang=zh', 'https://example.invalid/?lang=en'])
  assert.equal(result.sources[0].title, 'Original citation')
  assert.equal(result.truncated, false)
})

test('partial success exposes a failed provider code without leaking its secret-bearing error message', async () => {
  const secret = 'SYNTHETIC_PRIVATE_TOKEN_NEVER_RENDER'
  const router = createSearchProvider(officialContext(), () => config({ searchProviders: ['openai-codex', 'zai'] }), {
    codexSearch: async () => { throw new SearchError(`Credential token=${secret}`, 'CREDENTIAL_MISSING') },
    zaiSearch: async () => outcome('public-zai'),
  })
  const result = await router.search({ query: 'safe partial' })
  assert.match(result.content, /WEB_PROVIDER_CREDENTIAL_MISSING/u)
  assert.doesNotMatch(JSON.stringify(result), new RegExp(secret, 'u'))
  assert.doesNotMatch(result.content, /Credential token=/u)
})

test('one ordinary failure does not abort a successful sibling and returns an explicit partial-results notice', async () => {
  let siblingSignal
  let siblingFinished = false
  const gate = deferred()
  const router = createSearchProvider(officialContext(), () => config({ searchProviders: ['openai-codex', 'zai'] }), {
    codexSearch: async () => { throw new SearchError('Synthetic Codex failed', 'PROVIDER_ERROR') },
    zaiSearch: async (_ctx, _query, _options, signal) => { siblingSignal = signal; const result = await gate.promise; siblingFinished = true; return result },
  })
  const task = router.search({ query: 'partial' })
  await settled()
  assert.equal(siblingSignal.aborted, false)
  gate.resolve(outcome('successful-zai'))
  const result = await task
  assert.equal(siblingFinished, true)
  assert.equal(result.sources[0].url, 'https://example.invalid/successful-zai')
  assert.match(result.content, /successful-zai/u)
  assert.match(result.content, /openai-codex|Codex/iu)
  assert.match(result.content, /fail|partial|失败|部分/iu)
})

test('a successful empty result is not misclassified as all providers failed', async () => {
  const router = createSearchProvider(officialContext(), () => config({ searchProviders: ['openai-codex', 'zai'] }), {
    codexSearch: async () => ({ sources: [], truncated: false }),
    zaiSearch: async () => { throw new SearchError('Synthetic ZAI unavailable', 'CREDENTIAL_MISSING') },
  })
  const result = await router.search({ query: 'no citations' })
  assert.deepEqual(result.sources, [])
  assert.match(result.content, /zai|Z\.AI/iu)
})

test('two ordinary failures produce WEB_PROVIDER_ALL_FAILED instead of hiding either provider', async () => {
  const router = createSearchProvider(officialContext(), () => config({ searchProviders: ['openai-codex', 'zai'] }), {
    codexSearch: async () => { throw new SearchError('Synthetic Codex denied', 'CREDENTIAL_MISSING') },
    zaiSearch: async () => { throw new SearchError('Synthetic ZAI unavailable', 'PROVIDER_ERROR') },
  })
  await assert.rejects(router.search({ query: 'both failed' }), error => {
    assert.ok(isCode('WEB_PROVIDER_ALL_FAILED')(error))
    assert.match(error.message, /openai-codex|Codex/iu)
    assert.match(error.message, /zai|Z\.AI/iu)
    return true
  })
})

test('selection accepts only OpenAI/ZAI arrays, rejecting other types and ordinary DeepSeek/Google selection', async () => {
  let calls = 0
  let current = config()
  const router = createSearchProvider(officialContext(), () => current, { codexSearch: async () => { calls++; return outcome('bad') } })
  for (const searchProviders of [null, 'openai-codex', {}, ['unknown-provider'], ['deepseek-official'], ['google-zread']]) {
    current = config({ searchProviders })
    await assert.rejects(router.search({ query: 'query' }), isCode('WEB_PROVIDER_CONFIG'), JSON.stringify(searchProviders))
  }
  assert.equal(calls, 0)
})

test('a deployment-disabled selection fails explicitly before any backend dispatch', async () => {
  let calls = 0
  const router = createSearchProvider(officialContext(), () => config({ searchProviders: ['openai-codex', 'zai'], enabledProviders: ['openai-codex'] }), {
    codexSearch: async () => { calls++; return outcome('bad') }, zaiSearch: async () => { calls++; return outcome('bad') },
  })
  await assert.rejects(router.search({ query: 'query' }), isCode('WEB_PROVIDER_CONFIGURED_UNAVAILABLE'))
  assert.equal(calls, 0)
})

test('missing or unavailable official fallback never silently chooses another backend', async () => {
  const selected = () => config({ searchProviders: [] })
  await assert.rejects(createSearchProvider(officialContext(), selected).search({ query: 'query' }), isCode('WEB_PROVIDER_CONFIGURED_MISSING'))
  let calls = 0
  const unavailable = officialContext({ available: () => false, search: async () => { calls++; return outcome('bad') } })
  await assert.rejects(createSearchProvider(unavailable, selected).search({ query: 'query' }), isCode('WEB_PROVIDER_CONFIGURED_UNAVAILABLE'))
  assert.equal(calls, 0)
})

test('single-provider credential failure retains its stable machine-readable code', async () => {
  const router = createSearchProvider(officialContext(), () => config(), { codexSearch: async () => { throw new SearchError('Synthetic credential is missing', 'CREDENTIAL_MISSING') } })
  await assert.rejects(router.search({ query: 'query' }), error => error instanceof WebError && error.code === 'WEB_PROVIDER_CREDENTIAL_MISSING' && /Search credentials are missing/u.test(error.message))
})

test('single-provider backend error messages never expose secret-bearing HTTP or MCP echoes', async () => {
  const secret = 'SYNTHETIC_SECRET_SINGLE_PROVIDER'
  for (const failure of [new SearchError(`HTTP 401 Bearer ${secret}`, 'CREDENTIAL_MISSING'), new SearchError(`MCP echo ${secret}`, 'PROVIDER_ERROR'), new Error(`Transport echo ${secret}`)]) {
    const router = createSearchProvider(officialContext(), () => config(), { codexSearch: async () => { throw failure } })
    await assert.rejects(router.search({ query: 'safe error' }), error => {
      assert.ok(error instanceof WebError)
      assert.doesNotMatch(error.message, new RegExp(secret, 'u'))
      assert.doesNotMatch(error.message, /HTTP 401|MCP echo|Transport echo/u)
      return true
    })
  }
})

test('malformed result shapes are failed routes rather than corrupting a successful sibling', async () => {
  const malformed = [
    null, undefined, {}, { sources: {} }, { sources: [null] }, { sources: [{}] },
    { sources: [{ url: 'javascript:alert(1)' }] }, { sources: [{ url: 'ftp://example.invalid/' }] },
    { sources: [{ url: 'https://example.invalid/', title: 42 }] },
    { sources: [{ url: 'https://example.invalid/', snippet: false }] },
    { sources: [{ url: 'https://example.invalid/', publishedAt: [] }] },
    { sources: [], content: 42 }, { sources: [], truncated: 'true' },
  ]
  for (const value of malformed) {
    const adapters = { codexSearch: async () => value, zaiSearch: async () => outcome('well-formed-zai') }
    const single = createSearchProvider(officialContext(), () => config(), adapters)
    await assert.rejects(single.search({ query: 'invalid shape' }), isCode('WEB_PROVIDER_ERROR'))
    const combined = createSearchProvider(officialContext(), () => config({ searchProviders: ['openai-codex', 'zai'] }), adapters)
    const result = await combined.search({ query: 'invalid route and good sibling' })
    assert.deepEqual(result.sources, outcome('well-formed-zai').sources)
    assert.match(result.content, /WEB_PROVIDER_ERROR/u)
  }
})

test('minimal valid provider shape accepts absent optional content and truncation fields', async () => {
  const router = createSearchProvider(officialContext(), () => config(), { codexSearch: async () => ({ sources: [] }) })
  assert.deepEqual(await router.search({ query: 'valid empty' }), { sources: [], truncated: false })
})

test('pre-aborted combined search never dispatches and inflight cancellation aborts both providers', async () => {
  let calls = 0
  const signals = []
  const adapter = (...args) => { calls++; signals.push(args[3]); return pendingUntilAbort(...args) }
  const router = createSearchProvider(officialContext(), () => config({ searchProviders: ['openai-codex', 'zai'] }), { codexSearch: adapter, zaiSearch: adapter })
  await assert.rejects(router.search({ query: 'pre-cancelled' }, AbortSignal.abort()), isCode('WEB_ABORTED'))
  assert.equal(calls, 0)
  const controller = new AbortController()
  const pending = router.search({ query: 'inflight' }, controller.signal)
  await settled()
  controller.abort(new Error('synthetic user cancellation'))
  await assert.rejects(pending, isCode('WEB_ABORTED'))
  assert.equal(calls, 2)
  assert.ok(signals.every(signal => signal.aborted))
})

test('caller cancellation is fatal even after one backend already completed successfully', async () => {
  const controller = new AbortController()
  let ready
  const started = new Promise(resolve => { ready = resolve })
  const router = createSearchProvider(officialContext(), () => config({ searchProviders: ['openai-codex', 'zai'] }), {
    codexSearch: async () => outcome('completed'),
    zaiSearch: (...args) => { ready(); return pendingUntilAbort(...args) },
  })
  const task = router.search({ query: 'cancel partial' }, controller.signal)
  await started
  await settled()
  controller.abort(new Error('user cancellation must win'))
  await assert.rejects(task, isCode('WEB_ABORTED'))
})

test('fixed native direct providers ignore global toggle selections while honoring enablement', async () => {
  let current = config({ searchProviders: ['zai'] })
  const router = createSearchProvider(officialContext(), () => current, {
    codexSearch: async () => outcome('fixed-codex'), zaiSearch: async () => { throw new Error('must not follow toggle selection') },
  }, 'openai-codex')
  assert.equal(router.id, 'openai-codex')
  assert.equal((await router.search({ query: 'query' })).content, 'fixed-codex')
  current = config({ searchProviders: [], enabledProviders: ['zai'] })
  await assert.rejects(router.search({ query: 'query' }), isCode('WEB_PROVIDER_CONFIGURED_UNAVAILABLE'))
})

test('router normalizes queries and rejects blanks or oversized text before dispatch', async () => {
  const queries = []
  const router = createSearchProvider(officialContext(), () => config(), { codexSearch: async (_ctx, query) => { queries.push(query); return outcome('valid') } })
  await router.search({ query: '  useful search  ' })
  assert.deepEqual(queries, ['useful search'])
  await assert.rejects(router.search({ query: '   ' }))
  await assert.rejects(router.search({ query: 'x'.repeat(4097) }))
  assert.equal(queries.length, 1)
})

test('single results deduplicate over-returning adapters and honor a zero-result limit', async () => {
  const router = createSearchProvider(officialContext(), () => config(), { codexSearch: async () => ({ sources: [{ url: 'https://a.invalid/' }, { url: 'https://a.invalid/' }, { url: 'https://b.invalid/' }, { url: 'https://c.invalid/' }], truncated: false }) })
  const limited = await router.search({ query: 'query', maxResults: 2 })
  assert.deepEqual(limited.sources.map(source => source.url), ['https://a.invalid/', 'https://b.invalid/'])
  assert.equal(limited.truncated, true)
  assert.deepEqual((await router.search({ query: 'query', maxResults: 0 })).sources, [])
})

test('single-provider canonical URL deduplication matches the same route beside an empty successful sibling', async () => {
  const sources = [
    { url: 'https://example.invalid/article#one' },
    { url: 'https://example.invalid/article/#two' },
    { url: 'https://example.invalid/article///#three' },
    { url: 'https://example.invalid/#first' },
    { url: 'https://example.invalid/#second' },
  ]
  const adapters = { codexSearch: async () => ({ content: 'original single answer', sources, truncated: false }), zaiSearch: async () => ({ sources: [], truncated: false }) }
  const single = await createSearchProvider(officialContext(), () => config(), adapters).search({ query: 'canonical single', maxResults: 3 })
  const combined = await createSearchProvider(officialContext(), () => config({ searchProviders: ['openai-codex', 'zai'] }), adapters).search({ query: 'empty sibling', maxResults: 3 })
  assert.deepEqual(single.sources, [sources[0], sources[3]])
  assert.equal(single.content, 'original single answer')
  assert.equal(single.truncated, false)
  assert.deepEqual(combined.sources, single.sources)
  assert.equal(combined.truncated, single.truncated)
})

test('invalid timeout and result limits fail before backend calls', async () => {
  let calls = 0
  let current = config()
  const router = createSearchProvider(officialContext(), () => current, { codexSearch: async () => { calls++; return outcome('bad') } })
  for (const maxResults of [-1, 1.5, NaN]) await assert.rejects(router.search({ query: 'query', maxResults }), isCode('WEB_PROVIDER_CONFIG'))
  for (const timeoutMs of [0, 1.5, 300001]) { current = config({ timeoutMs }); await assert.rejects(router.search({ query: 'query' }), isCode('WEB_PROVIDER_CONFIG')) }
  assert.equal(calls, 0)
})

test('typed native errors retain their explicit code for a single official fallback', async () => {
  const router = createSearchProvider(officialContext({ available: () => true, search: async () => { throw new WebError('Synthetic rate limit', 'SYNTHETIC_RATE_LIMIT') } }), () => config({ searchProviders: [] }))
  await assert.rejects(router.search({ query: 'query' }), isCode('SYNTHETIC_RATE_LIMIT'))
})

test('trusted official route retains a cross-copy native WebError identity and machine code', async () => {
  class NativeWebError extends Error {
    constructor(message, code) { super(message); this.name = 'WebError'; this.code = code }
  }
  const foreign = new NativeWebError('Host-native credential guidance', 'WEB_PROVIDER_CREDENTIAL_MISSING')
  assert.equal(foreign instanceof WebError, false, 'simulate a separate peer-module class identity')
  const router = createSearchProvider(officialContext({ available: () => true, search: async () => { throw foreign } }), () => config({ searchProviders: [] }))
  await assert.rejects(router.search({ query: 'official foreign error' }), error => {
    assert.equal(error, foreign, 'both inner and outer mapping retain the original Host-native error')
    assert.equal(error.code, 'WEB_PROVIDER_CREDENTIAL_MISSING')
    assert.equal(error.message, 'Host-native credential guidance')
    return true
  })
})

test('the same foreign typed error from Codex or ZAI remains an untrusted sanitized backend error', async () => {
  class NativeWebError extends Error {
    constructor(message, code) { super(message); this.name = 'WebError'; this.code = code }
  }
  const secret = 'SYNTHETIC_FOREIGN_ERROR_SECRET'
  const foreign = new NativeWebError(`Backend echoed ${secret}`, 'WEB_PROVIDER_CREDENTIAL_MISSING')
  for (const provider of ['openai-codex', 'zai']) {
    const router = createSearchProvider(officialContext(), () => config({ searchProviders: [provider] }), { codexSearch: async () => { throw foreign }, zaiSearch: async () => { throw foreign } })
    await assert.rejects(router.search({ query: 'untrusted foreign error' }), error => {
      assert.notEqual(error, foreign)
      assert.ok(error instanceof WebError)
      assert.equal(error.code, 'WEB_PROVIDER_ERROR')
      assert.equal(error.message, 'Search provider failed')
      assert.doesNotMatch(error.message, new RegExp(secret, 'u'))
      assert.equal(error.cause, undefined)
      return true
    })
  }
})

test('official cross-copy structural recognition rejects malformed or unbounded error codes', async () => {
  class NativeWebError extends Error {
    constructor(code) { super('Synthetic backend echo must not pass through'); this.name = 'WebError'; this.code = code }
  }
  for (const code of ['lowercase', 'WEB-CODE', 'W'.repeat(65), 42, undefined]) {
    const foreign = new NativeWebError(code)
    const router = createSearchProvider(officialContext({ available: () => true, search: async () => { throw foreign } }), () => config({ searchProviders: [] }))
    await assert.rejects(router.search({ query: 'invalid foreign code' }), error => {
      assert.notEqual(error, foreign)
      assert.equal(error.code, 'WEB_PROVIDER_ERROR')
      assert.equal(error.message, 'Search provider failed')
      return true
    })
  }
})

test('synchronous cancellation during dispatch observes an already-rejected backend promise', () => {
  const providersUrl = new URL('../lib/providers.js', import.meta.url).href
  const script = `
    import assert from 'node:assert/strict';
    const { createSearchProvider, PROVIDERS } = await import(${JSON.stringify(providersUrl)});
    const controller = new AbortController();
    const router = createSearchProvider({}, () => ({ searchProviders: ['openai-codex', 'zai'], enabledProviders: PROVIDERS, timeoutMs: 60000 }), {
      codexSearch: () => { controller.abort(new Error('synthetic synchronous cancellation')); return Promise.reject(new Error('synthetic rejected backend')); },
      zaiSearch: () => Promise.reject(new Error('synthetic second rejected backend')),
    });
    await assert.rejects(router.search({ query: 'query' }, controller.signal), error => error.code === 'WEB_ABORTED');
    await new Promise(resolve => setImmediate(resolve));
  `
  const child = spawnSync(process.execPath, ['--unhandled-rejections=strict', '--input-type=module', '-e', script], { encoding: 'utf8', timeout: 5000, env: {} })
  assert.equal(child.error, undefined)
  assert.equal(child.signal, null)
  assert.equal(child.status, 0, child.stderr)
})

test('timeout retains first-source classification if its listener also aborts the caller', async () => withTimer(async () => {
  const controller = new AbortController()
  let firstReason
  const router = createSearchProvider(officialContext(), () => config({ timeoutMs: 10 }), { codexSearch: (_ctx, _query, _options, signal) => new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => { firstReason = signal.reason; controller.abort(new Error('synthetic secondary caller cancellation')); reject(signal.reason) }, { once: true })
  }) })
  await assert.rejects(router.search({ query: 'timeout wins' }, controller.signal), error => { assert.equal(error.code, 'WEB_PROVIDER_TIMEOUT'); assert.equal(error.cause, firstReason); assert.equal(error.cause.name, 'TimeoutError'); return true })
  assert.equal(controller.signal.aborted, true)
}))

test('shared timeout is fatal rather than returning partial success when the other backend stalls', async () => withTimer(async () => {
  const router = createSearchProvider(officialContext(), () => config({ searchProviders: ['openai-codex', 'zai'], timeoutMs: 10 }), { codexSearch: async () => outcome('completed'), zaiSearch: pendingUntilAbort })
  await assert.rejects(router.search({ query: 'fatal timeout' }), isCode('WEB_PROVIDER_TIMEOUT'))
}))

test('deployment timeout aborts a cooperative single adapter with WEB_PROVIDER_TIMEOUT', async () => withTimer(async () => {
  const router = createSearchProvider(officialContext(), () => config({ timeoutMs: 10 }), { codexSearch: pendingUntilAbort })
  await assert.rejects(router.search({ query: 'timeout' }), isCode('WEB_PROVIDER_TIMEOUT'))
}))
