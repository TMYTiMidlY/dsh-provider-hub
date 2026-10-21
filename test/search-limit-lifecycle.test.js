import test from 'node:test'
import assert from 'node:assert/strict'
import { Context } from '@deepseek-ai/cordis'
import { createVolatile, updateVolatile } from '@deepseek-ai/cosmokit'
import * as toolWeb from '@deepseek-ai/dsh-tool-web'
import { SystemPrompt } from '@deepseek-ai/dsh-system-prompt'
import { ToolRuntime } from '@deepseek-ai/dsh-tools'
import { WebRuntime } from '@deepseek-ai/dsh-web'
import { createScope, scopeOf } from '@deepseek-ai/dsh-scope'
import { installToolWebConfigHook, syncActiveToolWebLimit } from '../lib/index.js'
import { createSearchProvider } from '../lib/providers.js'
import { nativeSearchLimit } from '../lib/search-limit.js'

const tick = () => new Promise(resolve => setImmediate(resolve))
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done }); return { promise, resolve } }

// A distinct runtime with the real tool-web schema and identity, controllable
// activation delay, and no network. It exercises Cordis lifecycle, not mock restarts.
function probeTool(gate) {
  const seen = []
  return { seen, plugin: {
    name: 'tool-web', Config: toolWeb.Config,
    async apply(_ctx, config) { seen.push(config.searchMaxResults); if (seen.length === 1 && gate) await gate.promise },
  } }
}

async function fixture(t) {
  const root = new Context()
  t.after(() => root.fiber.dispose())
  const mount = async (readConfig) => root.plugin({ name: 'search-limit-owner', apply: ctx => { installToolWebConfigHook(ctx, readConfig) } })
  return { root, mount }
}

test('zero/default means all, positive values remain explicit caps', () => {
  assert.equal(nativeSearchLimit(), Number.MAX_SAFE_INTEGER)
  assert.equal(nativeSearchLimit(0), Number.MAX_SAFE_INTEGER)
  assert.equal(nativeSearchLimit(200), 200)
  for (const invalid of [-1, 0.5, 1001, NaN, Infinity, '0', null]) assert.throws(() => nativeSearchLimit(invalid))
})

test('late installation preserves raw config and disposal restores deployment cap', async t => {
  const { root, mount } = await fixture(t)
  const probe = probeTool()
  const raw = { searchMaxResults: 13, fetch: false }
  const tool = await root.plugin(probe.plugin, raw)
  const owner = await mount(() => ({ searchMaxResults: 200 }))
  await tick()
  assert.equal(tool.config.searchMaxResults, 200)
  assert.equal(tool._config, raw, 'never feed parsed config back into Fiber.update')
  assert.deepEqual(raw, { searchMaxResults: 13, fetch: false })
  await owner.dispose()
  assert.equal(tool.config.searchMaxResults, 13)
  assert.deepEqual(probe.seen, [13, 200, 13])
})

test('loader volatile notifications synchronize running tools, unrelated settings do not', async t => {
  const { root, mount } = await fixture(t)
  const limit = createVolatile(200)
  const probe = probeTool()
  const tool = await root.plugin(probe.plugin, { searchMaxResults: 13 })
  const owner = await mount(() => ({ searchMaxResults: limit.get() }))
  await tick()
  const emit = paths => {
    // Exact loader contract: notify only listeners owned by the updated fiber.
    const sender = Object.create(owner.ctx)
    sender[Context.filter] = context => context.fiber === owner
    owner.ctx.emit(sender, 'loader/volatile-update', paths)
  }
  updateVolatile(limit, createVolatile(5))
  emit([['quotaRecord']]); await tick()
  assert.equal(tool.config.searchMaxResults, 200)
  emit([['searchMaxResults']]); await tick()
  assert.equal(tool.config.searchMaxResults, 5)
  updateVolatile(limit, createVolatile(0))
  emit([['searchMaxResults']]); await tick()
  assert.equal(tool.config.searchMaxResults, Number.MAX_SAFE_INTEGER)
  assert.deepEqual(probe.seen, [13, 200, 5, Number.MAX_SAFE_INTEGER])
  await owner.dispose()
  assert.equal(tool.config.searchMaxResults, 13)
})

test('late hook waits for an already-resolved but still-loading tool', async t => {
  const { root, mount } = await fixture(t)
  const gate = deferred(); const probe = probeTool(gate)
  const tool = root.plugin(probe.plugin, { searchMaxResults: 8 })
  await tick()
  assert.deepEqual(probe.seen, [8])
  const owner = await mount(() => ({ searchMaxResults: 0 }))
  gate.resolve(); await tool.await(); await tick()
  assert.equal(tool.config.searchMaxResults, Number.MAX_SAFE_INTEGER)
  assert.deepEqual(probe.seen, [8, Number.MAX_SAFE_INTEGER])
  await owner.dispose()
  assert.equal(tool.config.searchMaxResults, 8)
})

test('disposal waits for loading tools before restoring native config', async t => {
  const { root, mount } = await fixture(t)
  const owner = await mount(() => ({ searchMaxResults: 0 }))
  const gate = deferred(); const probe = probeTool(gate)
  const tool = root.plugin(probe.plugin, { searchMaxResults: 13 })
  await tick()
  assert.deepEqual(probe.seen, [Number.MAX_SAFE_INTEGER])
  const disposal = owner.dispose()
  gate.resolve(); await disposal
  assert.equal(tool.config.searchMaxResults, 13)
  assert.deepEqual(probe.seen, [Number.MAX_SAFE_INTEGER, 13])
})

test('lookalike config and children inheriting the loader entry are left alone', async t => {
  const { root, mount } = await fixture(t)
  const unrelated = await root.plugin({ name: 'other-plugin', Config: toolWeb.Config, apply() {} }, { searchMaxResults: 17 })
  // Share a schema shape without sharing the native Config object identity.
  const duplicate = await import(`${import.meta.resolve('@deepseek-ai/dsh-tool-web')}?limit-lookalike`)
  const lookalike = await root.plugin({ name: 'unrelated', Config: duplicate.Config, apply() {} }, { searchMaxResults: 19 })
  const entry = { options: { name: '@deepseek-ai/dsh-tool-web' } }
  const child = await root.plugin({ name: 'unrelated-child', apply() {} }, { searchMaxResults: 23 })
  child.entry = entry
  child.parent = Object.create(child.parent, { fiber: { value: { entry } } })
  const owner = await mount(() => ({ searchMaxResults: 0 }))
  await tick()
  // Exact native Config identity is intentionally supported; mere lookalikes are not.
  assert.equal(unrelated.config.searchMaxResults, Number.MAX_SAFE_INTEGER)
  assert.equal(lookalike.config.searchMaxResults, 19)
  assert.equal(child.config.searchMaxResults, 23)
  await owner.dispose()
  assert.equal(unrelated.config.searchMaxResults, 17)
})

test('owner and tool children dispose together without reviving the tool', async t => {
  const { root } = await fixture(t)
  const probe = probeTool()
  let tool
  const owner = await root.plugin({ name: 'parent-owner', async apply(ctx) {
    installToolWebConfigHook(ctx, () => ({ searchMaxResults: 0 }))
    tool = await ctx.plugin(probe.plugin, { searchMaxResults: 13 })
  } })
  await owner.dispose()
  assert.equal(tool.uid, null)
  assert.deepEqual(probe.seen, [Number.MAX_SAFE_INTEGER])
})

test('all three providers and multiple queries return more than 200 deduplicated sources', async t => {
  const { root } = await fixture(t)
  await root.plugin(SystemPrompt, {})
  await root.plugin(ToolRuntime, {})
  await root.plugin(WebRuntime, { searchProvider: 'limit-union' })
  const observed = []
  const rows = (id, query, limit) => {
    observed.push(limit)
    return { sources: Array.from({ length: 90 }, (_, i) => ({
      url: i ? `https://example.invalid/${query}/${id}/${i}` : 'https://example.invalid/common',
      title: `${id}-${i}`,
    })), truncated: false }
  }
  const router = createSearchProvider({ web: { searchProviders: new Map([
    ['deepseek-official', { available: () => true, search: async request => rows('official', request.query, request.maxResults) }],
  ]) } }, () => ({ searchProviders: ['openai-codex', 'zai'] }), {
    codexSearch: async (_ctx, query, options) => rows('codex', query, options.maxResults),
    zaiSearch: async (_ctx, query, options) => rows('zai', query, options.maxResults),
  })
  root.web.registerSearchProvider({ ...router, id: 'limit-union' })
  const scope = createScope(root, {}); t.after(() => scope.dispose())
  await scope.ctx.plugin(toolWeb, { fetch: false }) // Resolve native 8 before hook installation.
  const remove = installToolWebConfigHook(root, () => ({ searchMaxResults: 0 }))
  await syncActiveToolWebLimit(root, () => ({ searchMaxResults: 0 }))
  const result = await root.tools.execute({ callId: 'limit-all-union', name: 'web_search',
    arguments: { queries: ['one', 'two'] }, signal: new AbortController().signal, agent: scopeOf(scope.ctx) })
  assert.equal(result.isError, false)
  assert.equal(result.value.sources.length, 535)
  assert.equal(new Set(result.value.sources.map(source => source.url)).size, 535)
  assert.equal(result.value.truncated, false)
  assert.deepEqual(result.meta.sources, result.value.sources, 'the UI receives all sources too')
  const lastSource = result.value.sources.at(-1)
  assert.ok(result.content[0].text.includes(lastSource.url), 'model-visible text retains the last source')
  const card = root.tools.get('web_search', scopeOf(scope.ctx)).presentResult({ queries: ['one', 'two'] }, result)
  assert.equal(card.sources.length, 535)
  assert.ok(observed.every(limit => limit === Number.MAX_SAFE_INTEGER))
  assert.match(result.value.content, /官方 90 条；OpenAI 90 条；ZAI 90 条。合并去重后展示 268 条/)
  const common = result.value.sources.find(source => source.url.endsWith('/common'))
  assert.match(common.title, /官方 \+ OpenAI \+ ZAI/)
  await remove()
})
