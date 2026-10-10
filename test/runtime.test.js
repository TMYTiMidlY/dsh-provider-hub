import test from 'node:test'
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import { join } from 'node:path'
import { access } from 'node:fs/promises'
import { createSearchProvider, PROVIDERS, ROUTER_PROVIDER_ID } from '../lib/providers.js'
import { SearchError } from '../lib/search.js'

// Exercise installed runtime packages without booting the production app,
// loading real credentials, writing sessions, or networking. Clean CI installs
// use bare peer imports when this machine's global DSH checkout is absent.
const explicitRuntimeRoot = process.env.DSH_TEST_RUNTIME_ROOT
const runtimeRoot = explicitRuntimeRoot ?? '/usr/local/lib/node_modules/@deepseek-ai/dsh'
const runtimePath = join(runtimeRoot, 'node_modules/@deepseek-ai')
let usePeerImports = false
try {
  await access(join(runtimePath, 'dsh-tools/lib/index.js'))
} catch (error) {
  if (explicitRuntimeRoot !== undefined || !['ENOENT', 'ENOTDIR'].includes(error.code)) throw error
  usePeerImports = true
}
const load = name => usePeerImports
  ? import(`@deepseek-ai/${name}`)
  : import(pathToFileURL(join(runtimePath, name, 'lib/index.js')).href)
const [cordis, prompt, tools, web, official, scope] = await Promise.all([
  load('cordis'), load('dsh-system-prompt'), load('dsh-tools'), load('dsh-web'), load('dsh-tool-web'), load('dsh-scope'),
])
// Import/activation failures are hard failures, never a silently skipped layer.
const runtime = { ...cordis, ...prompt, ...tools, ...web, official, ...scope }

async function withRuntime(adapters, operation, { maxResults = 3, searchProviders = ['openai-codex'], timeoutMs = 60000 } = {}) {
  const { Context, SystemPrompt, ToolRuntime, WebRuntime, createScope, official } = runtime
  const root = new Context()
  const scopes = []
  let current = { searchProviders: [...searchProviders], enabledProviders: [...PROVIDERS], timeoutMs }
  try {
    await root.plugin(SystemPrompt, {})
    await root.plugin(ToolRuntime, {})
    await root.plugin(WebRuntime, { searchProvider: ROUTER_PROVIDER_ID })
    const providers = Object.assign(ctx => {
      ctx.web.registerSearchProvider({ id: 'deepseek-official', available: () => true, search: async () => ({ content: 'synthetic official', sources: [], truncated: false }) })
      ctx.web.registerSearchProvider(createSearchProvider(ctx, () => current, adapters))
    }, { inject: ['web'] })
    const providerFiber = await root.plugin(providers)
    const native = runtime.createScope(root, {})
    scopes.push(native)
    await native.ctx.plugin(official, { fetch: false, searchMaxResults: maxResults })
    const minimal = createScope(root, {})
    scopes.push(minimal)
    let id = 0
    const invoke = (args, signal = new AbortController().signal, key = runtime.scopeOf(native.ctx)) => root.tools.execute({
      callId: `runtime-test-${++id}`, name: 'web_search', arguments: args, signal, agent: key,
    })
    return await operation({ root, native, minimal, providerFiber, invoke, switchTo: providers => { current = { ...current, searchProviders: Array.isArray(providers) ? [...providers] : [providers] } } })
  } finally {
    await Promise.all(scopes.map(scope => scope.dispose()))
    await root.fiber.dispose()
  }
}

test('real DSH registry preserves official queries schema, scoped visibility, and dynamic routing', async () => {
  await withRuntime({ codexSearch: async () => ({ content: 'codex', sources: [], truncated: false }), zaiSearch: async () => ({ content: 'zai', sources: [], truncated: false }) }, async ({ root, native, minimal, invoke, switchTo }) => {
    const key = runtime.scopeOf(native.ctx)
    const schema = root.tools.schemas(key).find(tool => tool.name === 'web_search')
    const definition = root.tools.get('web_search', key)
    assert.deepEqual(Object.keys(schema.parameters.properties), ['queries'])
    assert.ok(!root.tools.schemas(runtime.scopeOf(minimal.ctx)).some(tool => tool.name === 'web_search'), 'Host provider must not leak a search tool into minimal')
    assert.equal((await invoke({ queries: ['first'] })).value.content, 'codex')
    switchTo('zai')
    assert.equal((await invoke({ queries: ['second'] })).value.content, 'zai')
    switchTo(['openai-codex', 'zai'])
    const both = await invoke({ queries: ['third'] })
    assert.match(both.value.content, /codex/u)
    assert.match(both.value.content, /zai/u)
    switchTo([])
    assert.equal((await invoke({ queries: ['official fallback'] })).value.content, 'synthetic official')
    assert.equal(root.tools.get('web_search', key), definition, 'settings never rebuild the existing scoped tool')
    assert.equal(root.tools.schemas(key).find(tool => tool.name === 'web_search').parameters.properties.queries.type, 'array')
    const hidden = await invoke({ queries: ['hidden'] }, undefined, runtime.scopeOf(minimal.ctx))
    assert.equal(hidden.isError, true)
  })
})

test('real official tool rejects invalid queries and collapses exact duplicates before provider calls', async () => {
  const queries = []
  await withRuntime({ codexSearch: async (_ctx, query) => { queries.push(query); return { sources: [], truncated: false } } }, async ({ invoke }) => {
    for (const args of [{ query: 'legacy' }, { queries: [] }, { queries: [' '] }, { queries: ['a', 'b', 'c', 'd', 'e'] }, { queries: [3] }]) {
      assert.equal((await invoke(args)).isError, true, JSON.stringify(args))
    }
    assert.equal(queries.length, 0)
    assert.equal((await invoke({ queries: ['same', 'same'] })).isError, false)
    assert.deepEqual(queries, ['same'])
    // The official implicit parameter root is open; an undeclared legacy
    // provider argument is ignored rather than becoming a backend override.
    assert.equal((await invoke({ queries: ['ignored-extra'], provider: 'zai' })).isError, false)
    assert.deepEqual(queries, ['same', 'ignored-extra'])
  })
})

test('real seam caps over-returning providers and official batch merge is round-robin and deduplicated', async () => {
  const source = suffix => ({ url: `https://example.invalid/${suffix}` })
  await withRuntime({ codexSearch: async (_ctx, query) => ({
    content: `answer-${query}`,
    sources: query === 'a' ? [source('shared'), source('a2'), source('a3'), source('a4')] : [source('shared'), source('b2'), source('b3'), source('b4')],
    truncated: false,
  }) }, async ({ invoke }) => {
    const single = await invoke({ queries: ['a'] })
    assert.equal(single.isError, false)
    assert.equal(single.value.sources.length, 3)
    assert.equal(single.value.truncated, true)
    const batch = await invoke({ queries: ['a', 'b'] })
    assert.equal(batch.isError, false)
    assert.deepEqual(batch.value.sources.map(source => source.url), ['https://example.invalid/shared', 'https://example.invalid/a2', 'https://example.invalid/b2'])
    assert.equal(batch.value.truncated, true)
    assert.match(batch.value.content, /### a\n\nanswer-a/u)
    assert.match(batch.value.content, /### b\n\nanswer-b/u)
    assert.equal(batch.meta.sources.length, 3)
    assert.equal(batch.meta.truncated, true)
    assert.match(batch.content[0].text, /untrusted data/u)
    assert.match(batch.content[0].text, /Cite/u)
  })
})

test('real official batch failure aborts siblings and waits for their cleanup before returning', async () => {
  let cleaned = false
  await withRuntime({ codexSearch: async (_ctx, query, _options, signal) => {
    if (query === 'fail') throw new SearchError('synthetic first failure', 'SYNTHETIC_FAILURE')
    return new Promise((resolve, reject) => {
      const stop = () => { cleaned = true; reject(signal.reason) }
      if (signal.aborted) stop()
      else signal.addEventListener('abort', stop, { once: true })
    })
  } }, async ({ invoke }) => {
    const result = await invoke({ queries: ['pending', 'fail'] })
    assert.equal(result.isError, true)
    assert.match(result.error.message, /Search provider failed/u)
    assert.equal(cleaned, true)
  })
})

test('real official multi-query search fans out across both enabled providers then applies the shared source cap', async () => {
  const calls = []
  const adapter = id => async (_ctx, query) => {
    calls.push(`${query}/${id}`)
    return { content: `${query}-${id}-answer`, sources: [1, 2, 3].map(rank => ({ url: `https://example.invalid/${query}/${id}/${rank}` })), truncated: false }
  }
  await withRuntime({ codexSearch: adapter('codex'), zaiSearch: adapter('zai') }, async ({ invoke }) => {
    const result = await invoke({ queries: ['a', 'b'] })
    assert.equal(result.isError, false)
    assert.deepEqual(calls.sort(), ['a/codex', 'a/zai', 'b/codex', 'b/zai'])
    assert.equal(result.value.sources.length, 3)
    assert.equal(result.value.truncated, true)
    assert.deepEqual(result.value.sources.map(source => source.url), ['https://example.invalid/a/codex/1', 'https://example.invalid/b/codex/1', 'https://example.invalid/a/zai/1'])
    for (const answer of ['a-codex-answer', 'a-zai-answer', 'b-codex-answer', 'b-zai-answer']) assert.match(result.value.content, new RegExp(answer, 'u'))
    assert.deepEqual(result.meta.sources, result.value.sources)
  }, { searchProviders: ['openai-codex', 'zai'] })
})

test('existing scoped consumers hot-switch together without rebuilding shared registry or tool definitions', async () => {
  await withRuntime({ codexSearch: async () => ({ content: 'codex', sources: [], truncated: false }), zaiSearch: async () => ({ content: 'zai', sources: [], truncated: false }) }, async ({ root, native, invoke, switchTo }) => {
    const other = runtime.createScope(root, {})
    try {
      await other.ctx.plugin(runtime.official, { fetch: false })
      const keys = [runtime.scopeOf(native.ctx), runtime.scopeOf(other.ctx)]
      const definitions = keys.map(key => root.tools.get('web_search', key))
      const registry = root.web.searchProviders
      for (const key of keys) assert.equal((await invoke({ queries: ['before'] }, undefined, key)).value.content, 'codex')
      switchTo(['openai-codex', 'zai'])
      for (const key of keys) {
        const result = await invoke({ queries: ['after'] }, undefined, key)
        assert.match(result.value.content, /codex/u)
        assert.match(result.value.content, /zai/u)
      }
      switchTo([])
      for (const key of keys) assert.equal((await invoke({ queries: ['fallback'] }, undefined, key)).value.content, 'synthetic official')
      assert.equal(root.web.searchProviders, registry)
      keys.forEach((key, index) => assert.equal(root.tools.get('web_search', key), definitions[index]))
    } finally { await other.dispose() }
  })
})

test('real official tool renders safe partial backend failure as success without exposing error messages', async () => {
  const secret = 'SYNTHETIC_SECRET_NOT_MODEL_VISIBLE'
  await withRuntime({
    codexSearch: async () => { throw new SearchError(`Synthetic error carrying ${secret}`, 'CREDENTIAL_MISSING') },
    zaiSearch: async () => ({ content: 'public-zai', sources: [{ url: 'https://example.invalid/zai' }], truncated: false }),
  }, async ({ invoke }) => {
    const result = await invoke({ queries: ['partial'] })
    assert.equal(result.isError, false)
    assert.equal(result.value.sources.length, 1)
    assert.match(result.content[0].text, /WEB_PROVIDER_CREDENTIAL_MISSING/u)
    assert.doesNotMatch(JSON.stringify(result), new RegExp(secret, 'u'))
  }, { searchProviders: ['openai-codex', 'zai'] })
})

test('real registry pre-cancellation avoids provider work and missing selected router stays explicit', async () => {
  let calls = 0
  await withRuntime({ codexSearch: async () => { calls++; return { sources: [], truncated: false } } }, async ({ invoke, providerFiber }) => {
    assert.equal((await invoke({ queries: ['cancelled'] }, AbortSignal.abort())).isError, true)
    assert.equal(calls, 0)
    await providerFiber.dispose()
    const result = await invoke({ queries: ['after-dispose'] })
    assert.equal(result.isError, true)
    assert.match(result.error.message, /not registered/u)
    assert.equal(calls, 0)
  })
})
