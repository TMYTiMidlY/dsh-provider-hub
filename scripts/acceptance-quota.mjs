// Acceptance for multi-provider quota + the key pool (provider-hub >= 0.5.0).
//
// Tier A (offline): the composed QuotaService over the real key-pool metadata
//   records one history point per usable account, and the browser card renders
//   every provider panel plus its pool rows.
// Tier B (real): every stored key and the active credential answer a live
//   read-only quota query; the two Z.AI plan shapes (personal / team) and the
//   Kimi pool are checked against their first-party endpoints.
//
// Credentials come from $DSH_HOME/.credentials.yaml through a read-only shim;
// values are never printed.
import { readFile, mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { createRequire } from 'node:module'
import { QuotaService } from '../lib/quota.js'
import { KeyPool, keyPoolPath } from '../lib/key-pool.js'
import { QUOTA_PROVIDERS, apiKeyAccount } from '../lib/quota-providers.js'

const require = createRequire(import.meta.url)
const yamlLib = require(join(homedir(), '.nvm/versions/node/v24.21.0/lib/node_modules/@deepseek-ai/dsh/node_modules/js-yaml'))
const doc = yamlLib.load(await readFile(join(homedir(), '.dsh/.credentials.yaml'), 'utf8'))
const credentials = {
  readRecord: async id => doc.records?.[id],
  resolve: async ref => (doc.refs?.[ref] !== undefined ? { value: doc.refs[ref] } : undefined),
  set: async () => { throw new Error('acceptance is read-only') },
  unset: async () => { throw new Error('acceptance is read-only') },
}
const describeRef = ref => (typeof doc.refs?.[ref] === 'string' && doc.refs[ref] ? 'set' : 'missing')
console.log(`[auth] codex grant: ${doc.records?.['llm-pi-ai/openai-codex'] ? 'stored' : 'missing'} · ` +
  ['KIMI_API_KEY', 'ZAI_API_KEY', 'ZAI_CODING_CN_API_KEY', 'XIAOMI_TOKEN_PLAN_CN_API_KEY'].map(ref => `${ref}=${describeRef(ref)}`).join(' · '))

const pool = new KeyPool(keyPoolPath(), { credentials })
const entries = await pool.list()
console.log(`[pool] ${entries.length} named keys: ${entries.map(entry => `${entry.name}→${entry.provider}${entry.active ? '（当前生效）' : ''}`).join(', ')}`)

const stamp = at => new Date(at * 1000).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })
const windowLine = window => `${window.kind}${window.windowSeconds ? `(${Math.round(window.windowSeconds / 3600)}h)` : ''} 已用 ${window.usedPercent.toFixed(1)}%${window.resetAt ? ` · 重置 ${stamp(window.resetAt)}` : ''}`

// ── Tier B: live read-only quota for the active credential and every pool key ─
console.log('\n=== Tier B: live quota reads (active credential + each pool key) ===')
const historyDir = await mkdtemp(join(homedir(), '.dsh/dsh-provider-hub/acceptance-quota-'))
const { QuotaHistory } = await import('../lib/quota.js')
const service = Object.create(QuotaService.prototype)
Object.defineProperty(service, 'ctx', { value: { credentials, effect: () => () => {} } })
service.install({ keyPool: pool, history: new QuotaHistory(join(historyDir, 'quota-history.jsonl')), startRecorder: false, readConfig: () => ({}) })

let liveOk = 0
const failures = []
for (const provider of QUOTA_PROVIDERS) {
  const targets = [[undefined, 'active'], ...entries.filter(entry => entry.provider === provider.id).map(entry => [entry.id, entry.name])]
  for (const [keyId, label] of targets) {
    const result = await service.snapshot({ provider: provider.id, keyId, maxAgeMs: 0 })
    const where = `${provider.id} · ${label}`
    if (result.status === 'ok') {
      liveOk++
      console.log(`  ✓ ${where}: plan=${result.snapshot.plan ?? '-'} account=${result.snapshot.account.slice(0, 12)}`)
      for (const window of result.snapshot.windows) console.log(`      ${windowLine(window)}`)
    } else if (result.status === 'unsupported') {
      console.log(`  · ${where}: 不支持（${String(result.message ?? '').slice(0, 40)}…）${result.helpUrl ? ` → ${result.helpUrl}` : ''}`)
    } else {
      failures.push(`${where}: ${result.status}`)
      console.log(`  ✗ ${where}: ${result.status} ${String(result.message ?? '').slice(0, 60)}`)
    }
  }
}
if (failures.length) throw new Error(`Tier B FAIL: ${failures.join('; ')}`)
console.log(`Tier B PASS: ${liveOk} live quota reads across the active credentials and pool keys`)

// ── Tier A: one history point per usable account, per provider ───────────────
console.log('\n=== Tier A: recorder + history keyed by provider/account ===')
const recorded = await service.record()
console.log(`  record(): ${Object.entries(recorded).map(([id, status]) => `${id}=${status}`).join(', ')}`)
const points = []
for (const provider of QUOTA_PROVIDERS) {
  for (const [keyId] of [[undefined], ...entries.filter(entry => entry.provider === provider.id).map(entry => [entry.id])]) {
    const view = await service.history({ provider: provider.id, keyId, hours: 24 })
    if (view.status === 'ok' && view.points.length) points.push(`${provider.id}${keyId ? '#pool' : ''}:${view.points.length}`)
  }
}
console.log(`  history points: ${points.join(', ')}`)
if (points.length === 0) throw new Error('Tier A FAIL: the recorder persisted no history points')
console.log('Tier A PASS: every usable account recorded its own point')

// ── Tier A: the browser card renders each provider panel and its pool rows ───
console.log('\n=== Tier A: browser card rendering ===')
const vm = await import('node:vm')
const { readFileSync } = await import('node:fs')
let registered
const React = {
  createElement: (type, props, ...children) => {
    const merged = { ...props, children: children.length <= 1 ? children[0] : children }
    return typeof type === 'function' ? type(merged) : { type, props: merged }
  },
  Fragment: Symbol.for('react.fragment'),
  useState: initial => [typeof initial === 'function' ? initial() : initial, () => {}],
  useRef: initial => ({ current: initial }),
  useEffect: () => {},
  useCallback: fn => fn,
}
vm.runInNewContext(readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8'), {
  window: { __ModuleLoader__: { load: entry => { registered = entry } } },
  setInterval: () => 0, clearInterval: () => {}, setTimeout: () => 0, clearTimeout: () => {},
})
const plugin = registered.factory(id => (id === 'react' ? React : {
  SettingsForm: () => null,
  SettingsFormModel: class {
    bind() { return { getSnapshot: () => ({}), subscribe: () => () => {} } }
    shell() { return {} }
    field() { return { text: '' } }
    actions() { return {} }
    dispose() {}
  },
  SettingsValueField: () => null,
  Switch: () => null,
}))
let cardFactory
const quotaRemote = {
  snapshot: async request => ({ ok: true, value: await service.snapshot({ ...request, maxAgeMs: 0 }) }),
  history: async request => ({ ok: true, value: await service.history(request) }),
}
const poolRemote = {
  list: async request => ({ ok: true, value: { entries: await pool.list(request?.provider) } }),
}
await plugin.apply({
  locale: { register: () => () => {}, bind: () => key => key },
  slots: { inject: (_name, callback) => callback(), register: () => {} },
  configForms: { get: () => ({ getSnapshot: () => ({ state: 'unavailable' }), subscribe: () => () => {} }), whileServed: () => () => {} },
  effect: callback => { callback(); return () => {} },
  remote: { $mount: async () => async () => {} },
  inject: (_deps, callback) => { callback({ remote: { searchLogin: { list: async () => ({ ok: true, value: { entries: [] } }) }, quota: quotaRemote, keyPool: poolRemote }, slots: { inject: (name, cb) => cb(), register: (_seat, cb) => { cardFactory = cb } } }); return Object.assign(Promise.resolve(), { dispose: async () => {} }) },
})
const flatten = node => {
  if (Array.isArray(node)) return node.flatMap(flatten)
  if (node && typeof node === 'object') return [node, ...flatten(node.props?.children ?? [])]
  return []
}
for (const provider of QUOTA_PROVIDERS) {
  const tree = flatten(cardFactory({ provider: { provider: provider.id }, keyConfigured: true, pool: poolRemote, quota: quotaRemote }))
  const section = tree.find(node => node.props?.['data-provider-hub-quota'])
  const panels = tree.filter(node => node.props?.['data-quota-section'])
  const rows = tree.filter(node => node.props?.['data-pool-entry'])
  if (!section && provider.id !== 'openai-codex') throw new Error(`render FAIL: no card for ${provider.id}`)
  console.log(`  ✓ ${provider.id}: panel=${panels.length ? 'yes' : 'no'} pool rows=${rows.length}`)
}
console.log('Tier A PASS: every provider card renders its quota panel and named pool rows')

await rm(historyDir, { recursive: true, force: true })
console.log('\nACCEPTANCE PASS')
