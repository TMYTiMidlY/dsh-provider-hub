import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { join } from 'node:path'
import { access } from 'node:fs/promises'
import { createSearchProvider, PROVIDERS, ROUTER_PROVIDER_ID } from '../lib/providers.js'
import { SearchError } from '../lib/search.js'

// Use real runtime packages, never silently skip this layer in clean CI.
const explicitRuntimeRoot = process.env.DSH_TEST_RUNTIME_ROOT
const runtimeRoot = explicitRuntimeRoot ?? '/usr/local/lib/node_modules/@deepseek-ai/dsh'
const runtimePath = join(runtimeRoot, 'node_modules/@deepseek-ai')
let usePeerImports = false
try { await access(join(runtimePath, 'dsh-tools/lib/index.js')) } catch (error) {
  if (explicitRuntimeRoot !== undefined || !['ENOENT', 'ENOTDIR'].includes(error.code)) throw error
  usePeerImports = true
}
const load = name => usePeerImports ? import(`@deepseek-ai/${name}`) : import(pathToFileURL(join(runtimePath, name, 'lib/index.js')).href)
const [cordis, prompt, tools, web, official, scope] = await Promise.all([
  load('cordis'), load('dsh-system-prompt'), load('dsh-tools'), load('dsh-web'), load('dsh-tool-web'), load('dsh-scope'),
])
const runtime = { ...cordis, ...prompt, ...tools, ...web, official, ...scope }
const nativeWebModuleUrl = usePeerImports ? import.meta.resolve('@deepseek-ai/dsh-tool-web') : pathToFileURL(join(runtimePath, 'dsh-tool-web/lib/index.js')).href
const source = (id, title = `Native citation ${id}`) => ({ url: `https://example.invalid/${id}`, title })
const resultFor = id => ({ content: `RAW_BACKEND_${id}`, sources: [source(id)], truncated: false })
const assertNoRaw = value => assert.doesNotMatch(JSON.stringify(value), /RAW_BACKEND_/u)

async function withRuntime(adapters, operation, { maxResults = 3, searchProviders = ['openai-codex'], timeoutMs = 60000, officialSearch = async () => ({ content: 'RAW_BACKEND_OFFICIAL_EMPTY', sources: [], truncated: false }) } = {}) {
  const { Context, SystemPrompt, ToolRuntime, WebRuntime, createScope, official } = runtime
  const root = new Context(); const scopes = []
  let current = { searchProviders: [...searchProviders], enabledProviders: [...PROVIDERS], timeoutMs }
  try {
    await root.plugin(SystemPrompt, {}); await root.plugin(ToolRuntime, {})
    await root.plugin(WebRuntime, { searchProvider: ROUTER_PROVIDER_ID })
    const providers = Object.assign(ctx => {
      ctx.web.registerSearchProvider({ id: 'deepseek-official', available: () => true, search: officialSearch })
      ctx.web.registerSearchProvider(createSearchProvider(ctx, () => current, adapters))
    }, { inject: ['web'] })
    const providerFiber = await root.plugin(providers)
    const native = createScope(root, {}); scopes.push(native)
    await native.ctx.plugin(official, { fetch: false, searchMaxResults: maxResults })
    const minimal = createScope(root, {}); scopes.push(minimal)
    let id = 0
    const invoke = (args, signal = new AbortController().signal, key = runtime.scopeOf(native.ctx), nested = false) => root.tools.execute({
      callId: `runtime-test-${++id}`, name: 'web_search', arguments: args, signal, agent: key, ...(nested ? { parent: Symbol('synthetic-parent-execution') } : {}),
    })
    return await operation({ root, native, minimal, providerFiber, invoke, switchTo: providers => { current = { ...current, searchProviders: Array.isArray(providers) ? [...providers] : [providers] } } })
  } finally { await Promise.all(scopes.map(item => item.dispose())); await root.fiber.dispose() }
}

test('real registry preserves native queries schema, minimal visibility and existing definitions across enhancement changes', async () => {
  await withRuntime({ codexSearch: async () => resultFor('codex'), zaiSearch: async () => resultFor('zai') }, async ({ root, native, minimal, invoke, switchTo }) => {
    const key = runtime.scopeOf(native.ctx); const definition = root.tools.get('web_search', key)
    assert.deepEqual(Object.keys(root.tools.schemas(key).find(tool => tool.name === 'web_search').parameters.properties), ['queries'])
    assert.ok(!root.tools.schemas(runtime.scopeOf(minimal.ctx)).some(tool => tool.name === 'web_search'))
    assert.equal((await invoke({ queries: ['first'] })).value.sources[0].title, '[OpenAI] Native citation codex')
    switchTo('zai')
    assert.equal((await invoke({ queries: ['second'] })).value.sources[0].title, '[ZAI] Native citation zai')
    switchTo(['openai-codex', 'zai'])
    const both = await invoke({ queries: ['third'] })
    assert.deepEqual(both.value.sources.map(row => row.title), ['[OpenAI] Native citation codex', '[ZAI] Native citation zai'])
    switchTo([])
    const baseline = await invoke({ queries: ['baseline'] })
    assert.equal(baseline.value.content, '搜索来源：官方 0 条。合并去重后展示 0 条。')
    assert.equal(root.tools.get('web_search', key), definition)
    assertNoRaw(both); assertNoRaw(baseline)
    assert.equal((await invoke({ queries: ['hidden'] }, undefined, runtime.scopeOf(minimal.ctx))).isError, true)
  })
})

test('official tool rejects malformed queries and collapses exact duplicates before provider calls', async () => {
  const queries = []
  await withRuntime({ codexSearch: async (_ctx, query) => { queries.push(query); return { sources: [], truncated: false } } }, async ({ invoke }) => {
    for (const args of [{ query: 'legacy' }, { queries: [] }, { queries: [' '] }, { queries: ['a', 'b', 'c', 'd', 'e'] }, { queries: [3] }]) assert.equal((await invoke(args)).isError, true, JSON.stringify(args))
    assert.equal(queries.length, 0)
    assert.equal((await invoke({ queries: ['same', 'same'] })).isError, false)
    assert.deepEqual(queries, ['same'])
    // The official implicit schema root is open; extra provider is ignored.
    assert.equal((await invoke({ queries: ['ignored'], provider: 'zai' })).isError, false)
    assert.deepEqual(queries, ['same', 'ignored'])
  })
})

test('native value, meta and root card retain strict shapes and exclude every raw backend answer', async () => {
  await withRuntime({ codexSearch: async () => resultFor('shared'), zaiSearch: async () => resultFor('shared') }, async ({ root, native, invoke }) => {
    const args = { queries: ['structured'] }; const result = await invoke(args)
    assert.equal(result.isError, false)
    assert.deepEqual(Object.keys(result.value).sort(), ['content', 'sources', 'truncated'])
    assert.deepEqual(Object.keys(result.meta).sort(), ['answer', 'sources', 'truncated'])
    assert.deepEqual(Object.keys(result.value.sources[0]).sort(), ['title', 'url'])
    assert.equal(result.value.sources[0].title, '[官方 + OpenAI + ZAI] Native citation shared')
    assert.deepEqual(result.meta.sources, result.value.sources)
    assert.equal(result.meta.answer, result.value.content)
    const definition = root.tools.get('web_search', runtime.scopeOf(native.ctx))
    const view = definition.presentResult(args, result)
    assert.equal(view.card, 'web'); assert.equal(view.kind, 'search')
    assert.deepEqual(view.sources, result.value.sources)
    assertNoRaw(result); assertNoRaw(view)
    assert.match(result.content[0].text, /untrusted data/u)
    assert.match(result.content[0].text, /Cite/u)
  }, { searchProviders: ['openai-codex', 'zai'], officialSearch: async () => resultFor('shared') })
})

test('official cross-query merge remains first-wins rather than inventing cross-query provenance unions', async () => {
  const shared = source('same-url', 'Original title')
  await withRuntime({ codexSearch: async (_ctx, query) => ({ content: `RAW_BACKEND_CODEX_${query}`, sources: query === 'a' ? [shared] : [], truncated: false }) }, async ({ invoke }) => {
    const result = await invoke({ queries: ['a', 'b'] })
    assert.equal(result.isError, false)
    assert.equal(result.value.sources.length, 1)
    // q=a has only OpenAI, q=b has only official. Native merge keeps q=a's row.
    assert.equal(result.value.sources[0].title, '[OpenAI] Original title')
    assert.doesNotMatch(result.value.sources[0].title, /官方/u)
    assert.match(result.value.content, /### a/u); assert.match(result.value.content, /### b/u)
    assertNoRaw(result)
  }, { officialSearch: async request => ({ content: `RAW_BACKEND_OFFICIAL_${request.query}`, sources: request.query === 'b' ? [shared] : [], truncated: false }) })
})

test('one model-visible native search with two queries invokes three routes per query and caps the final union', async () => {
  const calls = []
  const rows = (id, query) => { calls.push(`${query}/${id}`); return { content: `RAW_BACKEND_${query}_${id}`, sources: [1, 2, 3].map(rank => source(`${query}/${id}/${rank}`)), truncated: false } }
  await withRuntime({ codexSearch: async (_ctx, query) => rows('codex', query), zaiSearch: async (_ctx, query) => rows('zai', query) }, async ({ invoke }) => {
    const result = await invoke({ queries: ['a', 'b'] })
    assert.equal(result.isError, false)
    assert.deepEqual(calls.sort(), ['a/codex', 'a/official', 'a/zai', 'b/codex', 'b/official', 'b/zai'])
    assert.equal(result.value.sources.length, 3); assert.equal(result.value.truncated, true)
    assert.deepEqual(result.value.sources.map(row => row.url), ['https://example.invalid/a/official/1', 'https://example.invalid/b/official/1', 'https://example.invalid/a/codex/1'])
    assert.deepEqual(result.meta.sources, result.value.sources); assertNoRaw(result)
  }, { searchProviders: ['openai-codex', 'zai'], officialSearch: async request => rows('official', request.query) })
})

test('official query-batch failure cancels pending sibling queries after their route cleanup', async () => {
  let cleaned = 0
  const pending = (query, signal) => {
    if (query === 'fail') throw new SearchError('SYNTHETIC_PRIVATE_FAILURE', 'PROVIDER_ERROR')
    return new Promise((resolve, reject) => { const stop = () => { cleaned++; reject(signal.reason) }; if (signal.aborted) stop(); else signal.addEventListener('abort', stop, { once: true }) })
  }
  await withRuntime({ codexSearch: async (_ctx, query, _options, signal) => pending(query, signal) }, async ({ invoke }) => {
    const result = await invoke({ queries: ['pending', 'fail'] })
    assert.equal(result.isError, true); assert.equal(result.error.message, 'All search providers failed')
    assert.equal(cleaned, 2)
    assert.doesNotMatch(JSON.stringify(result), /SYNTHETIC_PRIVATE_FAILURE/u)
  }, { officialSearch: async (request, signal) => pending(request.query, signal) })
})

test('existing scoped consumers share hot changes without replacing registry or tool definitions', async () => {
  await withRuntime({ codexSearch: async () => resultFor('codex'), zaiSearch: async () => resultFor('zai') }, async ({ root, native, invoke, switchTo }) => {
    const other = runtime.createScope(root, {})
    try {
      await other.ctx.plugin(runtime.official, { fetch: false })
      const keys = [runtime.scopeOf(native.ctx), runtime.scopeOf(other.ctx)]
      const definitions = keys.map(key => root.tools.get('web_search', key)); const registry = root.web.searchProviders
      for (const key of keys) assert.equal((await invoke({ queries: ['before'] }, undefined, key)).value.sources[0].title, '[OpenAI] Native citation codex')
      switchTo(['openai-codex', 'zai'])
      for (const key of keys) assert.deepEqual((await invoke({ queries: ['after'] }, undefined, key)).value.sources.map(row => row.title), ['[OpenAI] Native citation codex', '[ZAI] Native citation zai'])
      assert.equal(root.web.searchProviders, registry)
      keys.forEach((key, index) => assert.equal(root.tools.get('web_search', key), definitions[index]))
    } finally { await other.dispose() }
  })
})

test('partial failure reaches native meta and render safely, without fake official success or raw prose', async () => {
  const secret = 'SYNTHETIC_SECRET_NOT_MODEL_VISIBLE'
  await withRuntime({ codexSearch: async () => { throw new SearchError(secret, 'CREDENTIAL_MISSING') }, zaiSearch: async () => resultFor('zai') }, async ({ invoke }) => {
    const result = await invoke({ queries: ['partial'] })
    assert.equal(result.isError, false); assert.equal(result.value.sources.length, 1)
    assert.equal(result.value.sources[0].title, '[ZAI] Native citation zai')
    assert.match(result.content[0].text, /官方未成功（WEB_PROVIDER_CREDENTIAL_MISSING）/u)
    assert.match(result.content[0].text, /OpenAI未成功（WEB_PROVIDER_CREDENTIAL_MISSING）/u)
    assert.doesNotMatch(JSON.stringify(result), new RegExp(secret, 'u')); assertNoRaw(result)
  }, { searchProviders: ['openai-codex', 'zai'], officialSearch: async () => { throw new runtime.WebError(secret, 'WEB_PROVIDER_CREDENTIAL_MISSING') } })
})

test('nested dispatch retains labeled text and canonical value but no root-only native web metadata', async () => {
  await withRuntime({ codexSearch: async () => resultFor('nested') }, async ({ invoke }) => {
    const args = { queries: ['nested'] }
    const nested = await invoke(args, undefined, undefined, true)
    assert.equal(nested.isError, false); assert.equal(nested.meta, undefined)
    assert.equal(nested.value.sources[0].title, '[OpenAI] Native citation nested')
    assert.match(nested.content[0].text, /OpenAI.*Native citation nested/u)
    assert.equal(runtime.official.presentSearchResult(args, nested), undefined)
    assertNoRaw(nested)
  })
})

test('serialized root metadata replays using only official code in a new process after provider disposal', async () => {
  await withRuntime({ codexSearch: async () => resultFor('history'), zaiSearch: async () => resultFor('history') }, async ({ root, native, invoke, providerFiber }) => {
    const args = { queries: ['history'] }; const live = await invoke(args)
    const record = JSON.parse(JSON.stringify({ args, result: { content: live.content, isError: live.isError, meta: live.meta } }))
    assertNoRaw(record)
    const definition = root.tools.get('web_search', runtime.scopeOf(native.ctx))
    const before = definition.presentResult(record.args, record.result)
    await providerFiber.dispose()
    assert.deepEqual(definition.presentResult(record.args, record.result), before)
    const missing = await invoke({ queries: ['new call after disposal'] })
    assert.equal(missing.isError, true); assert.match(missing.error.message, /not registered/u)
    // No import of this plugin in the child: cold presentation consumes only
    // native tool-web helpers and the serialized durable content/meta projection.
    const script = `
      import assert from 'node:assert/strict';
      import {readFileSync} from 'node:fs';
      const native=await import(${JSON.stringify(nativeWebModuleUrl)});
      const record=JSON.parse(readFileSync(0,'utf8'));
      const view=native.presentSearchResult(record.args,record.result);
      assert.equal(view.card,'web');
      const text=native.formatSearchOutput({sources:record.result.meta.sources,truncated:record.result.meta.truncated,content:record.result.meta.answer});
      process.stdout.write(JSON.stringify({view,text}));
    `
    const child = spawnSync(process.execPath, ['--input-type=module', '-e', script], { input: JSON.stringify(record), encoding: 'utf8', timeout: 5000, env: {} })
    assert.equal(child.error, undefined); assert.equal(child.signal, null); assert.equal(child.status, 0, child.stderr)
    const cold = JSON.parse(child.stdout)
    assert.deepEqual(cold.view, before); assert.match(cold.text, /官方 \+ OpenAI \+ ZAI/u); assertNoRaw(cold)
  }, { searchProviders: ['openai-codex', 'zai'], officialSearch: async () => resultFor('history') })
})

test('a fresh native-only runtime can present old annotated history and use its normal official route for new searches', async () => {
  let record
  await withRuntime({ codexSearch: async () => resultFor('old-history') }, async ({ invoke }) => {
    const result = await invoke({ queries: ['old'] })
    record = JSON.parse(JSON.stringify({ args: { queries: ['old'] }, result: { content: result.content, isError: result.isError, meta: result.meta } }))
  })
  const root = new runtime.Context(); let calls = 0
  try {
    await root.plugin(runtime.SystemPrompt, {}); await root.plugin(runtime.ToolRuntime, {})
    await root.plugin(runtime.WebRuntime, { searchProvider: 'deepseek-official' })
    await root.plugin(Object.assign(ctx => ctx.web.registerSearchProvider({ id: 'deepseek-official', available: () => true, search: async () => { calls++; return { sources: [source('new-official', 'Plain native title')], truncated: false } } }), { inject: ['web'] }))
    await root.plugin(runtime.official, { fetch: false })
    const definition = root.tools.get('web_search')
    assert.equal(definition.presentResult(record.args, record.result).sources[0].title, '[OpenAI] Native citation old-history')
    assert.equal(calls, 0, 'replay does not search again')
    const next = await root.tools.execute({ callId: 'fresh-native', name: 'web_search', arguments: { queries: ['new'] }, signal: new AbortController().signal })
    assert.equal(next.isError, false); assert.equal(calls, 1)
    assert.equal(next.value.sources[0].title, 'Plain native title')
    assert.equal(definition.presentResult(record.args, record.result).sources[0].title, '[OpenAI] Native citation old-history')
  } finally { await root.fiber.dispose() }
})

test('pre-cancelled native call avoids backend work', async () => {
  let calls = 0
  await withRuntime({ codexSearch: async () => { calls++; return resultFor('bad') } }, async ({ invoke }) => {
    assert.equal((await invoke({ queries: ['cancelled'] }, AbortSignal.abort())).isError, true)
    assert.equal(calls, 0)
  })
})
