import test from 'node:test'
import assert from 'node:assert/strict'
import { Context } from '@deepseek-ai/cordis'
import { SystemPrompt } from '@deepseek-ai/dsh-system-prompt'
import { ToolRuntime } from '@deepseek-ai/dsh-tools'
import { WebRuntime } from '@deepseek-ai/dsh-web'
import { createScope, scopeOf } from '@deepseek-ai/dsh-scope'
import * as toolWeb from '@deepseek-ai/dsh-tool-web'
import { installToolWebConfigHook, syncActiveToolWebLimit } from '../lib/index.js'

// Boot the real tool chain the way presets do (tool-web mounted in a scope) and
// prove the provider-hub `internal/config` hook uniformly overrides the native
// tool's `searchMaxResults` — the request cap every downstream layer follows.
async function boot() {
  const root = new Context()
  const scopes = []
  const captured = {}
  try {
    await root.plugin(SystemPrompt, {})
    await root.plugin(ToolRuntime, {})
    await root.plugin(WebRuntime, { searchProvider: 'stub' })
    await root.plugin(Object.assign(ctx => {
      ctx.web.registerSearchProvider({
        id: 'stub',
        available: () => true,
        search: async request => {
          captured.request = request
          return {
            sources: Array.from({ length: 12 }, (_, i) => ({ url: `https://example.invalid/s/${i}`, title: `s${i}` })),
            truncated: false,
          }
        },
      })
    }, { inject: ['web'] }))
    return { root, scopes, captured }
  } catch (error) {
    await root.fiber.dispose()
    throw error
  }
}

async function search(root, scope, key) {
  const result = await root.tools.execute({
    callId: `search-max-results-${key}-${Math.random()}`,
    name: 'web_search',
    arguments: { queries: [`${key} query`] },
    signal: new AbortController().signal,
    agent: scopeOf(scope.ctx),
  })
  return result
}

const settle = () => new Promise(resolve => setImmediate(resolve))

test('hook overrides searchMaxResults for every tool-web activation', async () => {
  const { root, scopes, captured } = await boot()
  try {
    installToolWebConfigHook(root, () => ({ searchMaxResults: 200 }))
    const agentScope = createScope(root, {}); scopes.push(agentScope)
    await agentScope.ctx.plugin(toolWeb, { fetch: false, search: true })
    const result = await search(root, agentScope, 'hook')
    assert.equal(result.isError, false)
    assert.equal(captured.request.maxResults, 200)
    assert.equal(result.value.sources.length, 12)
    assert.equal(result.value.truncated, false)
  } finally { await Promise.all(scopes.map(item => item.dispose())); await root.fiber.dispose() }
})

test('without a configured limit every received source is returned', async () => {
  const { root, scopes, captured } = await boot()
  try {
    installToolWebConfigHook(root, () => ({ searchMaxResults: undefined }))
    const agentScope = createScope(root, {}); scopes.push(agentScope)
    await agentScope.ctx.plugin(toolWeb, { fetch: false, search: true })
    const result = await search(root, agentScope, 'default')
    assert.equal(result.isError, false)
    assert.equal(captured.request.maxResults, Number.MAX_SAFE_INTEGER)
    assert.equal(result.value.sources.length, 12)
    assert.equal(result.value.truncated, false)
  } finally { await Promise.all(scopes.map(item => item.dispose())); await root.fiber.dispose() }
})

// Production boot order: the base `tool-web` entry resolves its config (native
// default 8) before provider-hub activates on the same services. The waterfall
// hook alone never sees that resolution; the registry reconciliation must
// restart the already-active fiber with the configured limit.
test('a tool-web fiber activated before the hook is reconciled by the sync', async () => {
  const { root, scopes, captured } = await boot()
  try {
    const agentScope = createScope(root, {}); scopes.push(agentScope)
    await agentScope.ctx.plugin(toolWeb, { fetch: false, search: true })
    const before = await search(root, agentScope, 'late-before')
    assert.equal(before.value.sources.length, 8)
    installToolWebConfigHook(root, () => ({ searchMaxResults: 200 }))
    await syncActiveToolWebLimit(root, () => ({ searchMaxResults: 200 }))
    const after = await search(root, agentScope, 'late-after')
    assert.equal(after.isError, false)
    assert.equal(captured.request.maxResults, 200)
    assert.equal(after.value.sources.length, 12)
    assert.equal(after.value.truncated, false)
  } finally { await Promise.all(scopes.map(item => item.dispose())); await root.fiber.dispose() }
})

// The deployed host mounts its bundled tool-web copy while this package's peer
// dependency resolves to another physical copy, so identity comparisons fail
// and the fiber has no loader entry; detection must fall back to config shape.
test('structural detection matches a second tool-web module instance', async () => {
  const toolWebHref = import.meta.resolve('@deepseek-ai/dsh-tool-web')
  assert.notEqual(toolWebHref, undefined)
  const duplicate = await import(`${toolWebHref}?dual-copy`)
  assert.notEqual(duplicate.Config, toolWeb.Config)
  const { root, scopes, captured } = await boot()
  try {
    installToolWebConfigHook(root, () => ({ searchMaxResults: 50 }))
    const agentScope = createScope(root, {}); scopes.push(agentScope)
    await agentScope.ctx.plugin(duplicate, { fetch: false, search: true })
    const result = await search(root, agentScope, 'dual-copy')
    assert.equal(result.isError, false)
    assert.equal(captured.request.maxResults, 50)
    assert.equal(result.value.sources.length, 12)
  } finally { await Promise.all(scopes.map(item => item.dispose())); await root.fiber.dispose() }
})
