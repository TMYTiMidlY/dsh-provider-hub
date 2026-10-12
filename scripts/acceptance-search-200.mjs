// Acceptance for the unified searchMaxResults setting (provider-hub >= 0.4.5).
//
// The plugin injects its configured `searchMaxResults` into every activated
// tool-web instance via the loader's `internal/config` waterfall — no preset
// patch rows involved. This script boots the real tool chain (bare imports so
// module identity matches lib/index.js) and proves:
//   Tier A (offline): the hook value flows through tool-web → seam → router
//     merge; without a value the official default 8 still caps.
//   Tier B (real backends): one real query returns the whole merged union.
//
// Credentials are read from $DSH_HOME/.credentials.yaml through a read-only
// shim; values are never printed.
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { createRequire } from 'node:module'
import { Context } from '@deepseek-ai/cordis'
import { SystemPrompt } from '@deepseek-ai/dsh-system-prompt'
import { ToolRuntime } from '@deepseek-ai/dsh-tools'
import { WebRuntime } from '@deepseek-ai/dsh-web'
import { createScope, scopeOf } from '@deepseek-ai/dsh-scope'
import * as toolWeb from '@deepseek-ai/dsh-tool-web'
import { installToolWebConfigHook } from '../lib/index.js'
import { createSearchProvider, PROVIDERS, ROUTER_PROVIDER_ID } from '../lib/providers.js'
import * as search from '../lib/search.js'

// ── read-only credential shim (structure only; values never printed) ─────────
const require = createRequire(import.meta.url)
const yamlLib = require(join(homedir(), '.nvm/versions/node/v24.21.0/lib/node_modules/@deepseek-ai/dsh/node_modules/js-yaml'))
const doc = yamlLib.load(await readFile(join(homedir(), '.dsh/.credentials.yaml'), 'utf8'))
const credentials = {
  readRecord: async id => doc.records?.[id],
  resolve: async ref => (doc.refs?.[ref] !== undefined ? { value: doc.refs[ref] } : undefined),
}
const codexRecord = doc.records?.['llm-pi-ai/openai-codex']
const codexValid = codexRecord?.kind === 'grant' && typeof codexRecord.payload?.access === 'string'
  && (typeof codexRecord.payload.expires !== 'number' || Date.now() < codexRecord.payload.expires)
console.log(`[auth] codex grant valid: ${codexValid}; zai ref present: ${typeof doc.refs?.['ZAI_CODING_CN_API_KEY'] === 'string'}`)

// ── runtime boot: hook-installed tool-web, real router wiring ────────────────
async function boot({ limit, adapters, searchProviders, officialSearch = async () => ({ sources: [], truncated: false }) }, operation) {
  const root = new Context(); const scopes = []
  const config = { searchProviders: [...searchProviders], enabledProviders: [...PROVIDERS], timeoutMs: 60000 }
  try {
    await root.plugin(SystemPrompt, {}); await root.plugin(ToolRuntime, {})
    await root.plugin(WebRuntime, { searchProvider: ROUTER_PROVIDER_ID })
    const providers = Object.assign(ctx => {
      ctx.web.registerSearchProvider({ id: 'deepseek-official', available: () => true, search: officialSearch })
      ctx.web.registerSearchProvider(createSearchProvider(ctx, () => config, adapters))
    }, { inject: ['web'] })
    await root.plugin(providers)
    installToolWebConfigHook(root, () => ({ searchMaxResults: limit }))
    const agentScope = createScope(root, {}); scopes.push(agentScope)
    await agentScope.ctx.plugin(toolWeb, { fetch: false })
    const invoke = args => root.tools.execute({
      callId: `acceptance-${Date.now()}-${Math.random()}`, name: 'web_search', arguments: args,
      signal: new AbortController().signal, agent: scopeOf(agentScope.ctx),
    })
    return await operation(invoke)
  } finally { await Promise.all(scopes.map(item => item.dispose())); await root.fiber.dispose() }
}

const unwrap = r => {
  if (r?.isError) throw new Error(`tool call failed: ${JSON.stringify(r).slice(0, 2000)}`)
  if (r?.value === undefined) throw new Error(`unexpected tool result shape: ${JSON.stringify(r).slice(0, 2000)}`)
  return r.value
}

// ── Tier A: hook-driven cap chain, 200 vs unset ──────────────────────────────
console.log('\n=== Tier A: hook-driven cap-chain proof ===')
// 2 enhancement routes × 10 sources with a shared 5-URL core ⇒ 15 unique URLs
const overlapMock = id => async (_ctx, _q, options) => ({
  sources: Array.from({ length: Math.min(options.maxResults, 10) }, (_, i) => ({
    url: `https://example.invalid/${i < 5 ? 'shared' : id}/${i}`, title: `${id} ${i}`,
  })),
  truncated: false,
})
const mockAdapters = { codexSearch: overlapMock('openai'), zaiSearch: overlapMock('zai'), googleZreadSearch: overlapMock('zread') }
for (const limit of [undefined, 200]) {
  const value = await boot({ limit, adapters: mockAdapters, searchProviders: ['openai-codex', 'zai'] },
    invoke => invoke({ queries: ['mock query'] }).then(unwrap))
  console.log(`hook limit=${String(limit).padStart(3)} → sources=${value.sources.length} truncated=${value.truncated}`)
  if (limit === undefined && !(value.sources.length === 8 && value.truncated === true)) throw new Error('Tier A: default-8 contrast broken')
  if (limit === 200 && !(value.sources.length === 15 && value.truncated === false)) throw new Error('Tier A: hook 200 did not carry all 15 sources')
}
console.log('Tier A PASS: the hook uniformly sets the cap; unset keeps the official default')

// ── Tier B: real backends through the hook ───────────────────────────────────
console.log('\n=== Tier B: real backends via hook ===')
const realAdapters = {
  codexSearch: (_ctx, q, o, s) => search.codexSearch({ credentials }, q, o, s),
  zaiSearch: (_ctx, q, o, s) => search.zaiSearch({ credentials }, q, o, s),
  googleZreadSearch: (_ctx, q, o, s) => search.googleZreadSearch({ credentials }, q, o, s),
}
const value = await boot({ limit: 200, adapters: realAdapters, searchProviders: ['openai-codex', 'zai'] },
  invoke => invoke({ queries: ['DeepSeek Harness GitHub latest release'] }).then(unwrap))
console.log(value.content)
console.log(`union sources = ${value.sources.length}, truncated = ${value.truncated}`)
for (const s of value.sources.slice(0, 12)) console.log(' -', s.title, '|', s.url)
if (value.sources.length > 8 && value.truncated === false) console.log('Tier B PASS: hook-driven request returns the whole union')
else console.log('Tier B FAIL: unexpected cap remains — investigate')
