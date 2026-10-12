import test from 'node:test'
import assert from 'node:assert/strict'
import { Context } from '@deepseek-ai/cordis'
import { SystemPrompt } from '@deepseek-ai/dsh-system-prompt'
import { ToolRuntime } from '@deepseek-ai/dsh-tools'
import { WebRuntime } from '@deepseek-ai/dsh-web'
import { createScope, scopeOf } from '@deepseek-ai/dsh-scope'
import * as toolWeb from '@deepseek-ai/dsh-tool-web'
import { installToolWebConfigHook } from '../lib/index.js'

// Boot the real tool chain the way presets do (tool-web mounted in a scope) and
// prove the provider-hub `internal/config` hook uniformly overrides the native
// tool's `searchMaxResults` — the request cap every downstream layer follows.
async function boot(limit) {
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
    installToolWebConfigHook(root, () => ({ searchMaxResults: limit }))
    const agentScope = createScope(root, {}); scopes.push(agentScope)
    await agentScope.ctx.plugin(toolWeb, { fetch: false, search: true })
    const result = await root.tools.execute({
      callId: `search-max-results-${Math.random()}`,
      name: 'web_search',
      arguments: { queries: ['hook query'] },
      signal: new AbortController().signal,
      agent: scopeOf(agentScope.ctx),
    })
    return { captured, result }
  } finally { await Promise.all(scopes.map(item => item.dispose())); await root.fiber.dispose() }
}

test('hook overrides searchMaxResults for every tool-web activation', async () => {
  const { captured, result } = await boot(200)
  assert.equal(result.isError, false)
  assert.equal(captured.request.maxResults, 200)
  assert.equal(result.value.sources.length, 12)
  assert.equal(result.value.truncated, false)
})

test('without a configured limit the official default 8 still applies', async () => {
  const { captured, result } = await boot(undefined)
  assert.equal(result.isError, false)
  assert.equal(captured.request.maxResults, 8)
  assert.equal(result.value.sources.length, 8)
  assert.equal(result.value.truncated, true)
})
