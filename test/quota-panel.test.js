import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

// Minimal hook-capable React stand-in: function components expand inline and
// each instance keeps its own hook state, keyed by tree path plus React key —
// the same isolation real reconciliation gives conditionally mounted panels.
function createHarness() {
  const states = new Map()
  const root = { path: '#root', counters: new Map(), cursor: 0 }
  const stack = [root]
  let visited = new Set()
  const sameDeps = (left, right) => Array.isArray(left) && Array.isArray(right) && left.length === right.length && left.every((value, index) => Object.is(value, right[index]))
  const hooks = () => {
    const frame = stack[stack.length - 1]
    visited.add(frame.path)
    const slots = states.get(frame.path) ?? []
    states.set(frame.path, slots)
    return { frame, slots }
  }
  const React = {
    createElement: (type, props, ...children) => {
      const merged = { ...props, children: children.length <= 1 ? children[0] : children }
      if (typeof type !== 'function') return { type, props: merged }
      const parent = stack[stack.length - 1]
      const identity = props?.key !== undefined ? `key:${props.key}` : `${type.name || 'anon'}:${parent.counters.get(type) ?? 0}`
      if (props?.key === undefined) parent.counters.set(type, (parent.counters.get(type) ?? 0) + 1)
      stack.push({ path: `${parent.path}/${identity}`, counters: new Map(), cursor: 0 })
      try { return type(merged) } finally { stack.pop() }
    },
    Fragment: Symbol.for('react.fragment'),
    useState(initial) {
      const { frame, slots } = hooks()
      const slot = slots[frame.cursor++] ??= { value: typeof initial === 'function' ? initial() : initial }
      return [slot.value, value => { slot.value = typeof value === 'function' ? value(slot.value) : value }]
    },
    useRef(initial) {
      const { frame, slots } = hooks()
      slots[frame.cursor++] ??= { ref: { current: initial } }
      return slots[frame.cursor - 1].ref
    },
    useEffect(effect, deps) {
      const { frame, slots } = hooks()
      const slot = slots[frame.cursor++] ??= { ran: false }
      if (!slot.ran || !sameDeps(slot.deps, deps)) {
        slot.cleanup?.()
        slot.ran = true
        slot.deps = deps
        slot.cleanup = effect()
      }
    },
    useCallback(fn, deps) {
      const { frame, slots } = hooks()
      const slot = slots[frame.cursor++] ??= {}
      if (!sameDeps(slot.deps, deps)) { slot.deps = deps; slot.callback = fn }
      return slot.callback
    },
  }
  const render = factory => {
    root.counters = new Map(); root.cursor = 0; visited = new Set()
    const tree = factory()
    for (const [path, slots] of states) {
      if (!visited.has(path)) { for (const slot of slots) slot?.cleanup?.(); states.delete(path) }
    }
    return tree
  }
  return { React, render }
}

// Fake timers inside the client VM: the panel installs an auto-refresh
// interval; real ones would keep the test process alive.
const vmTimers = []
let vmTimerId = 0
function loadClient(React) {
  let registered
  vm.runInNewContext(readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8'), {
    window: { __ModuleLoader__: { load: entry => { registered = entry } } },
    setInterval: fn => { const id = ++vmTimerId; vmTimers.push({ id, fn, interval: true }); return id },
    clearInterval: id => { const index = vmTimers.findIndex(timer => timer.id === id); if (index >= 0) vmTimers.splice(index, 1) },
    setTimeout: fn => { const id = ++vmTimerId; vmTimers.push({ id, fn, interval: false }); return id },
    clearTimeout: id => { const index = vmTimers.findIndex(timer => timer.id === id); if (index >= 0) vmTimers.splice(index, 1) },
  })
  return registered.factory(id => {
    if (id === 'react') return React
    return {
      SettingsForm: () => null,
      SettingsFormModel: class {
        constructor() {}
        bind() { return { getSnapshot: () => ({}), subscribe: () => () => {} } }
        shell() { return {} }
        field() { return { text: '' } }
        actions() { return {} }
        dispose() {}
      },
    }
  })
}

const flatten = node => {
  if (Array.isArray(node)) return node.flatMap(flatten)
  if (node && typeof node === 'object') return [node, ...flatten(node.props?.children ?? [])]
  return []
}

const emptyPool = () => ({
  list: async () => ({ ok: true, value: { entries: [] } }),
  add: async () => ({ ok: true, value: {} }),
  drop: async () => ({ ok: true, value: {} }),
  rename: async () => ({ ok: true, value: {} }),
  setActive: async () => ({ ok: true, value: {} }),
})

const emptyAccounts = () => ({
  list: async () => ({ ok: true, value: { entries: [] } }),
  sources: async () => ({ ok: true, value: { sources: [] } }),
  import: async () => ({ ok: true, value: {} }),
  drop: async () => ({ ok: true, value: {} }),
  rename: async () => ({ ok: true, value: {} }),
  setActive: async () => ({ ok: true, value: {} }),
})

async function mountPanel(quota, options = {}) {
  const provider = options.provider ?? 'openai-codex'
  const pool = options.pool ?? emptyPool()
  const accounts = options.accounts ?? emptyAccounts()
  const { React, render } = createHarness()
  const clientCapture = {}
  const plugin = loadClient(React)
  let cardFactory
  const capture = { inject: (name, callback) => callback(), register: (seat, callback) => { cardFactory = callback } }
  const searchLogin = options.searchLogin ?? { list: async () => ({ ok: true, value: { entries: [{ key: 'llm-pi-ai/openai-codex', authorized: true, methods: [{ id: 'oauth', label: 'OAuth' }], inFlight: false }] } }) }
  const bundles = {}
  await plugin.apply({
    locale: {
      register: (ns, dictionaries) => { bundles[ns] = dictionaries; return () => {} },
      bind: ns => (key, params) => {
        const template = bundles[ns]?.zh?.[key] ?? key
        return params ? template.replace(/\{(\w+)\}/g, (match, name) => (name in params ? String(params[name]) : match)) : template
      },
    },
    slots: { inject: (name, callback) => callback(), register: () => {} },
    configForms: { get: () => ({ getSnapshot: () => ({ state: 'unavailable' }), subscribe: () => () => {}, mutate: async () => { throw new Error('not served') } }), whileServed: () => () => {} },
    effect: callback => { callback(); return () => {} },
    remote: { $mount: async descriptor => { clientCapture.remote = descriptor; return async () => {} } },
    inject: (_deps, callback) => { callback({ remote: { searchLogin, quota, keyPool: pool, codexAccounts: accounts }, slots: capture }); return Object.assign(Promise.resolve(), { dispose: async () => {} }) },
  })
  assert.ok(cardFactory, 'provider-card render captured')
  const draw = () => render(() => cardFactory({ provider: { provider }, keyConfigured: options.keyConfigured ?? (provider === 'openai-codex') }))
  return { draw, pool, accounts, remoteDescriptor: clientCapture.remote }
}

const settle = async () => { for (let i = 0; i < 6; i++) await new Promise(resolve => setImmediate(resolve)) }

// The quota area lives behind a native fold: collapsed by default, so its
// panels (and their snapshot probes) only mount after the first expand.
const openFold = nodes => {
  const fold = nodes.find(node => node.props?.['data-fold'] === 'true')
  assert.ok(fold, 'a fold wraps the quota area')
  assert.equal(fold.props['data-fold-open'], 'false', 'fold starts collapsed')
  fold.props.onToggle({ currentTarget: { open: true } })
}

test('quota folds stay collapsed until opened, then the panel probes once', async () => {
  const calls = { snapshot: 0, history: 0 }
  const quota = {
    snapshot: async () => { calls.snapshot++; return { ok: true, value: { status: 'ok', snapshot: { account: 'acct-1', windows: [{ kind: 'weekly', usedPercent: 30 }] }, fetchedAt: Math.floor(Date.now() / 1000) } } },
    history: async () => { calls.history++; return { ok: true, value: { status: 'ok', points: [] } } },
  }
  const { draw } = await mountPanel(quota)
  draw()
  let nodes = flatten(draw())
  assert.equal(nodes.filter(node => node.props?.['data-quota-section']).length, 0, 'no quota panel mounts while collapsed')
  assert.equal(nodes.filter(node => node.props?.['data-codex-accounts']).length, 0, 'no account pool mounts while collapsed')
  assert.equal(calls.snapshot, 0, 'no snapshot probe fires while collapsed')
  openFold(nodes)
  await settle()
  nodes = flatten(draw())
  assert.equal(nodes.filter(node => node.props?.['data-quota-section']).length, 1, 'expanding mounts the account quota panel')
  assert.equal(nodes.filter(node => node.props?.['data-codex-accounts']).length, 1, 'the codex account pool mounts with it')
  assert.ok(nodes.some(node => node.props?.['data-codex-accounts']), 'the codex account section is part of the fold')
  assert.equal(calls.snapshot, 1, 'the probe fires exactly on first expand')
  const fold = nodes.find(node => node.props?.['data-fold'] === 'true')
  assert.equal(fold.props['data-fold-open'], 'true')
  fold.props.onToggle({ currentTarget: { open: false } })
  nodes = flatten(draw())
  assert.equal(nodes.find(node => node.props?.['data-fold']).props['data-fold-open'], 'false', 'collapsing is visual; the body stays revealed')
  assert.equal(nodes.filter(node => node.props?.['data-quota-section']).length, 1)
})

test('QuotaPanel renders the sparkline once history points arrive', async () => {
  const calls = { snapshot: 0, history: 0 }
  const quota = {
    snapshot: async () => { calls.snapshot++; return { ok: true, value: { status: 'ok', snapshot: { account: 'acct-1', email: 'quota@example.test', plan: 'pro', windows: [{ kind: 'weekly', usedPercent: 27, windowSeconds: 604800, resetAt: 1792295880 }], credits: { balance: 62500, unlimited: false }, resetCredits: { available: 3, credits: [{ title: 'Full reset', expiresAt: 1792295880, status: 'available' }, { title: 'Full reset', expiresAt: 1793000000, status: 'available' }] } }, fetchedAt: Math.floor(Date.now() / 1000) } } },
    history: async () => { calls.history++; return { ok: true, value: { status: 'ok', points: Array.from({ length: 13 }, (_, index) => ({ ts: 1791721950 + index * 3600, used: { weekly: 16 + index } })) } } },
  }
  const { draw } = await mountPanel(quota)
  const settleLoop = async () => { for (let i = 0; i < 8; i++) { await new Promise(resolve => setImmediate(resolve)); draw() } }
  openFold(flatten(draw()))
  await settleLoop()
  const nodes = flatten(draw())
  const section = nodes.find(node => node.props?.['data-quota-section'])
  assert.ok(section, 'quota section renders')
  assert.equal(section.props['data-quota-state'], 'ok')
  assert.equal(calls.snapshot, 1)
  assert.equal(calls.history, 1, 'history loads right after the snapshot')
  const spark = nodes.find(node => node.props?.['data-quota-spark'])
  assert.ok(spark, 'sparkline renders once points exist')
  assert.equal(spark.props['data-quota-spark'], 'weekly')
  const polyline = nodes.find(node => typeof node.props?.points === 'string' && node.props.fill === 'none')
  assert.ok(polyline, 'trend polyline renders')
  const ys = polyline.props.points.split(' ').map(pair => Number(pair.split(',')[1]))
  // Fixed 0–100% axis: 16% maps to y 18.8 and 28% to y 16.4 exactly.
  assert.equal(ys[0], 18.8)
  assert.equal(ys[ys.length - 1], 16.4)
  assert.ok(ys.every((y, index) => index === 0 || y <= ys[index - 1]), 'rising usage draws a falling line')
  const caps = nodes.filter(node => node.props?.['data-quota-spark-cap'])
  assert.equal(caps.length, 2, 'endpoint value labels render')
  assert.equal(caps[0].props['data-quota-spark-cap'], 'start')
  assert.equal(caps[0].props.children, '16%')
  assert.equal(caps[1].props['data-quota-spark-cap'], 'end')
  assert.equal(caps[1].props.children, '28%')
  const axis = nodes.find(node => node.props?.['data-quota-spark-axis'])
  assert.ok(axis, 'time axis renders under the sparkline')
  const ticks = nodes.filter(node => node.props?.['data-quota-spark-tick'])
  assert.deepEqual(ticks.map(tick => tick.props['data-quota-spark-tick']), ['start', 'mid', 'end'])
  assert.ok(ticks.every(tick => /^\d{2}-\d{2} \d{2}:\d{2}$/.test(tick.props.children)), 'sub-two-day span shows hour-precision ticks')
  const bars = nodes.filter(node => node.props?.['data-quota-window'])
  assert.equal(bars.length, 1)
  assert.equal(bars[0].props['data-quota-window'], 'weekly')
  const creditRows = nodes.filter(node => node.props?.['data-quota-credit'])
  assert.equal(creditRows.length, 2, 'per-credit expiry rows render')
  assert.ok(nodes.some(node => typeof node.props?.children === 'string' && node.props.children.includes('到期')), 'each credit shows its expiry stamp')
  // vmTimers is file-global: this test's panel registered the newest interval.
  const interval = vmTimers.filter(timer => timer.interval).at(-1)
  assert.ok(interval, 'history auto-refresh interval installed')
  interval.fn()
  await settleLoop()
  assert.equal(calls.history, 2, 'periodic refresh re-reads history without user action')
  const refresh = nodes.find(node => node.props?.['data-quota-refresh'])
  assert.ok(refresh, 'manual refresh button present')
  refresh.props.onClick()
  await settleLoop()
  assert.equal(calls.snapshot, 2, 'manual refresh triggers another snapshot')
  assert.equal(calls.history, 3)
})

test('QuotaPanel falls back to the placeholder and keeps data on history failure', async () => {
  const quota = {
    snapshot: async () => ({ ok: true, value: { status: 'ok', snapshot: { account: 'acct-1', windows: [{ kind: 'weekly', usedPercent: 40 }] }, fetchedAt: Math.floor(Date.now() / 1000) } }),
    history: async () => ({ ok: false, error: { message: 'synthetic history failure' } }),
  }
  const { draw } = await mountPanel(quota)
  openFold(flatten(draw()))
  for (let i = 0; i < 8; i++) { await new Promise(resolve => setImmediate(resolve)); draw() }
  const nodes = flatten(draw())
  assert.ok(nodes.find(node => node.props?.['data-quota-section']), 'panel still renders')
  assert.ok(nodes.some(node => (typeof node.props?.children === 'string' && node.props.children.includes('暂无历史记录'))), 'placeholder shows when history fails')
  assert.ok(nodes.find(node => node.props?.['data-quota-window']), 'snapshot data survives a history failure')
})

test('flat usage keeps the 100% axis and hovers name each sample and plan change', async () => {
  const quota = {
    snapshot: async () => ({ ok: true, value: { status: 'ok', snapshot: { account: 'acct-1', windows: [{ kind: 'weekly', usedPercent: 40 }] }, fetchedAt: Math.floor(Date.now() / 1000) } }),
    history: async () => ({ ok: true, value: { status: 'ok', points: Array.from({ length: 7 }, (_, index) => ({ ts: 1791721950 + index * 3600, used: { weekly: 40 }, ...(index < 3 ? { plan: 'pro' } : { plan: 'plus' }) })) } }),
  }
  const { draw } = await mountPanel(quota)
  openFold(flatten(draw()))
  for (let i = 0; i < 8; i++) { await new Promise(resolve => setImmediate(resolve)); draw() }
  let nodes = flatten(draw())
  const polyline = nodes.find(node => typeof node.props?.points === 'string' && node.props.fill === 'none')
  assert.ok(polyline, 'flat usage still renders a line')
  const ys = polyline.props.points.split(' ').map(pair => Number(pair.split(',')[1]))
  assert.ok(ys.every(y => y === 14), 'a flat 40% line sits at y 14 on the fixed 0–100% axis')
  const caps = nodes.filter(node => node.props?.['data-quota-spark-cap'])
  assert.equal(caps.map(cap => cap.props.children).join('→'), '40%→40%')
  // Plan changes draw one dashed separator with a title naming both plans.
  const planMark = nodes.find(node => node.props?.['data-quota-spark-plan'])
  assert.ok(planMark, 'a plan change draws a separator')
  assert.equal(planMark.props['data-quota-spark-plan'], '3')
  const planTitle = flatten(planMark).find(node => node.type === 'title')
  assert.equal(planTitle.props.children, '订阅变化：pro → plus')
  // Hovering a sample shows its timestamp, usage and plan; leaving clears it.
  const hits = nodes.filter(node => node.props?.['data-quota-spark-hit'])
  assert.equal(hits.length, 7, 'one hover hit zone per sample')
  hits[4].props.onMouseEnter()
  nodes = flatten(draw())
  const tip = nodes.find(node => node.props?.['data-quota-spark-tip'])
  assert.ok(tip, 'tooltip appears on hover')
  assert.equal(tip.props['data-quota-spark-tip'], '4')
  assert.match(tip.props.children, /\d{2}-\d{2} \d{2}:\d{2} · 已用 40% · plus/u)
  hits[4].props.onMouseLeave()
  nodes = flatten(draw())
  assert.equal(nodes.find(node => node.props?.['data-quota-spark-tip']), undefined, 'tooltip clears on leave')
})

test('API-key provider card previews every pool key and switches the active one', async () => {
  const calls = { snapshot: [], history: [], setActive: [], drop: [], add: [], rename: [] }
  const quota = {
    snapshot: async request => {
      calls.snapshot.push(request)
      return { ok: true, value: { status: 'ok', snapshot: { account: `acct-${request.keyId ?? 'active'}`, windows: [{ kind: 'weekly', usedPercent: 30 }] }, fetchedAt: Math.floor(Date.now() / 1000) } }
    },
    history: async request => {
      calls.history.push(request)
      return { ok: true, value: { status: 'ok', points: Array.from({ length: 3 }, (_, index) => ({ ts: 1791721950 + index * 3600, used: { weekly: 30 + index } })) } }
    },
  }
  const entries = [
    { id: 'aaaa0001', name: 'zai-gsj', provider: 'zai-coding-cn', configured: true, active: true },
    { id: 'aaaa0002', name: 'zai-team', provider: 'zai-coding-cn', configured: true, active: false },
  ]
  const pool = {
    list: async request => ({ ok: true, value: { entries: entries.filter(entry => entry.provider === request.provider) } }),
    add: async request => { calls.add.push(request); return { ok: true, value: {} } },
    drop: async request => { calls.drop.push(request); return { ok: true, value: {} } },
    setActive: async request => {
      calls.setActive.push(request)
      for (const entry of entries) entry.active = entry.id === request.id
      return { ok: true, value: {} }
    },
    rename: async request => { calls.rename.push(request); return { ok: true, value: {} } },
  }
  const { draw } = await mountPanel(quota, { provider: 'zai-coding-cn', pool, keyConfigured: true })
  const settleLoop = async () => { for (let i = 0; i < 8; i++) { await new Promise(resolve => setImmediate(resolve)); draw() } }
  openFold(flatten(draw()))
  await settleLoop()
  let nodes = flatten(draw())
  const section = nodes.find(node => node.props?.['data-provider-hub-quota'])
  assert.equal(section.props['data-provider-hub-quota'], 'zai-coding-cn')
  const select = nodes.find(node => node.props?.['data-pool-select'])
  assert.ok(select, 'the pool renders as a dropdown')
  const options = nodes.filter(node => node.props?.['data-pool-option'])
  assert.deepEqual(options.map(option => option.props['data-pool-option']), ['aaaa0001', 'aaaa0002'])
  assert.match(options[0].props.children, /zai-gsj（当前生效）/u)
  assert.equal(options[1].props.children, 'zai-team')
  assert.equal(nodes.filter(node => node.props?.['data-quota-section']).length, 1, 'the active key carries its quota panel')
  assert.equal(calls.snapshot[0].provider, 'zai-coding-cn', 'the active panel queries the official credential')
  assert.equal(calls.snapshot[0].keyId, undefined, 'the active panel rides the route credential, not a pool key')
  assert.equal(calls.snapshot[0].maxAgeMs, 300000)

  // Selecting the second key and expanding details mounts its own panel.
  select.props.onChange({ target: { value: 'aaaa0002' } })
  nodes = flatten(draw())
  nodes.find(node => node.props?.['data-pool-action'] === 'details').props.onClick()
  await settleLoop()
  nodes = flatten(draw())
  assert.equal(nodes.filter(node => node.props?.['data-quota-section']).length, 2, 'the selected key previews its own quota')
  assert.equal(calls.snapshot.at(-1).keyId, 'aaaa0002', 'the expanded panel names its pool key')

  // Renaming the selected key goes through the pool remote.
  nodes.find(node => node.props?.['data-pool-action'] === 'rename').props.onClick()
  nodes = flatten(draw())
  const renameForm = nodes.find(node => node.props?.['data-pool-rename'])
  assert.ok(renameForm, 'an inline rename form appears')
  await renameForm.props.onSubmit({ preventDefault: () => {}, currentTarget: { elements: { name: { value: 'zai-team-2' } } } })
  await settleLoop()
  assert.deepEqual(calls.rename.map(call => ({ ...call })), [{ id: 'aaaa0002', name: 'zai-team-2' }])

  // Switching marks the entry active and refreshes the pool view.
  nodes = flatten(draw())
  nodes.find(node => node.props?.['data-pool-action'] === 'use').props.onClick()
  await settleLoop()
  nodes = flatten(draw())
  assert.deepEqual(calls.setActive.map(call => ({ ...call })), [{ id: 'aaaa0002' }])
  const optionsAfter = nodes.filter(node => node.props?.['data-pool-option'])
  assert.match(optionsAfter[1].props.children, /（当前生效）/u, 'the switched key is labelled active')
  assert.ok(!String(optionsAfter[0].props.children).includes('当前生效'))

  // The add form stores a named key through the pool remote.
  const form = nodes.find(node => node.props?.['data-pool-add'])
  await form.props.onSubmit({
    preventDefault: () => {},
    currentTarget: { elements: { name: { value: 'zai-new' }, value: { value: 'sk-synthetic-new' } }, reset: () => {} },
  })
  assert.deepEqual(calls.add.map(call => ({ ...call })), [{ provider: 'zai-coding-cn', name: 'zai-new', value: 'sk-synthetic-new' }])

  // Selecting back the first key, then removing it.
  nodes = flatten(draw())
  nodes.find(node => node.props?.['data-pool-select']).props.onChange({ target: { value: 'aaaa0001' } })
  nodes = flatten(draw())
  nodes.find(node => node.props?.['data-pool-action'] === 'remove').props.onClick()
  await settleLoop()
  assert.deepEqual(calls.drop.map(call => ({ ...call })), [{ id: 'aaaa0001' }])
  assert.ok(!JSON.stringify(flatten(draw())).includes('sk-synthetic'), 'no rendered node ever carries a secret value')
})

test('Codex account pool lists sources, imports, switches, renames and drops', async () => {
  const calls = { snapshot: [], history: [], import: [], setActive: [], drop: [], rename: [] }
  const quota = {
    snapshot: async request => {
      calls.snapshot.push(request)
      const email = entries.find(entry => request.grantId ? entry.id === request.grantId : entry.active)?.email
      return { ok: true, value: { status: 'ok', snapshot: { account: email, email, windows: [{ kind: 'weekly', usedPercent: 20 }] }, fetchedAt: Math.floor(Date.now() / 1000) } }
    },
    history: async request => {
      calls.history.push(request)
      return { ok: true, value: { status: 'ok', points: Array.from({ length: 3 }, (_, index) => ({ ts: 1791721950 + index * 3600, used: { weekly: 20 + index } })) } }
    },
  }
  const entries = [
    { id: 'ab12cd34', name: 'vickie', accountId: 'b8508d9e…', email: 'vickie@example.test', expires: 1790000000, active: true, source: 'web' },
    { id: 'ef567890', name: 'qq', accountId: '8c8d6075…', email: 'qq@example.test', expires: 1790000600, active: false, source: 'cli', sourcePath: '/home/synthetic/.codex', expired: true },
  ]
  const accounts = {
    list: async () => ({ ok: true, value: { entries } }),
    sources: async () => ({ ok: true, value: { sources: [
      { id: 'codex', label: 'codex（全局 ~/.codex）', path: '/home/synthetic/.codex', authPath: '/home/synthetic/.codex/auth.json', available: true, status: 'ok', email: 'qq@example.test', expires: 1990000600 },
      { id: 'codex-gth', label: 'codex-gth', path: '/home/synthetic/.codex/.cc-switch-launches/x', authPath: '/home/synthetic/.codex/.cc-switch-launches/x/auth.json', available: true, status: 'expired', email: 'gth@example.test', expires: 1790000600 },
      { id: 'missing', label: 'Missing directory', path: '/home/synthetic/absent', available: false, status: 'missing' },
    ] } }),
    import: async request => { calls.import.push(request); entries.push({ id: '99aabbcc', name: request.name || 'gth', email: 'gth@example.test', active: false }); return { ok: true, value: { entry: { id: '99aabbcc' } } } },
    drop: async request => { calls.drop.push(request); return { ok: true, value: {} } },
    rename: async request => { calls.rename.push(request); return { ok: true, value: {} } },
    setActive: async request => { calls.setActive.push(request); for (const entry of entries) entry.active = entry.id === request.id; return { ok: true, value: {} } },
  }
  const { draw } = await mountPanel(quota, { provider: 'openai-codex', accounts })
  const settleLoop = async () => { for (let i = 0; i < 8; i++) { await new Promise(resolve => setImmediate(resolve)); draw() } }
  openFold(flatten(draw()))
  await settleLoop()
  let nodes = flatten(draw())
  const current = nodes.find(node => node.props?.['data-codex-current'])
  assert.ok(current, 'the current account line renders')
  assert.match(current.props.children, /vickie@example.test/u)
  const select = nodes.find(node => node.props?.['data-codex-select'])
  assert.ok(select, 'the account pool renders as a dropdown')
  const options = nodes.filter(node => node.props?.['data-codex-option'])
  assert.deepEqual(options.map(option => option.props['data-codex-option']), ['ab12cd34', 'ef567890'])
  assert.match(options[0].props.children, /vickie（当前生效）/u)
  // The import form previews both CLI directories with their availability.
  let importForm = nodes.find(node => node.props?.['data-codex-import'])
  assert.ok(importForm, 'the import form renders inside the fold')
  const sourceOptions = nodes.filter(node => node.props?.['data-codex-source'])
  assert.deepEqual(sourceOptions.map(option => option.props['data-codex-source']), ['codex', 'codex-gth', 'missing'])
  assert.match(sourceOptions[0].props.children, /codex（全局/u)
  assert.ok(!sourceOptions[0].props.children.includes('qq@example.test'), 'email is not squeezed into an option')
  assert.match(sourceOptions[1].props.children, /已过期/u)
  assert.equal(sourceOptions[1].props.disabled, false, 'expired sources remain importable')
  assert.equal(sourceOptions[2].props.disabled, true, 'unusable sources are disabled')
  assert.equal(nodes.find(node => node.props?.['data-codex-source-path']).props.children, '/home/synthetic/.codex')
  assert.match(nodes.find(node => node.props?.['data-codex-source-status']).props.children, /qq@example.test/u)

  // Import carries the chosen source and optional name, but never switches.
  nodes.find(node => node.props?.['data-codex-source-select']).props.onChange({ target: { value: 'codex-gth' } })
  nodes = flatten(draw())
  importForm = nodes.find(node => node.props?.['data-codex-import'])
  await importForm.props.onSubmit({ preventDefault: () => {}, currentTarget: { elements: { name: { value: 'gth' } } } })
  await settleLoop()
  assert.deepEqual(calls.import.map(call => ({ ...call })), [{ source: 'codex-gth', name: 'gth' }])
  assert.equal(calls.setActive.length, 0, 'import does not switch accounts')
  nodes = flatten(draw())
  assert.match(nodes.find(node => node.props?.['data-codex-notice']).props.children, /当前账号未切换/u)
  assert.ok(calls.snapshot.filter(request => !request.grantId).length >= 2, 'import refreshes the main quota panel')
  assert.deepEqual(nodes.filter(node => node.props?.['data-codex-option']).map(option => option.props['data-codex-option']), ['ab12cd34', 'ef567890', '99aabbcc'])

  // Per-account quota preview passes the grant id.
  select.props.onChange({ target: { value: 'ef567890' } })
  nodes = flatten(draw())
  nodes.find(node => node.props?.['data-codex-action'] === 'details').props.onClick()
  await settleLoop()
  assert.equal(calls.snapshot.at(-1).grantId, 'ef567890', 'the per-account panel previews that grant')
  assert.equal(calls.snapshot.at(-1).provider, 'openai-codex')

  // Rename, then switch the official account.
  nodes = flatten(draw())
  nodes.find(node => node.props?.['data-codex-action'] === 'rename').props.onClick()
  nodes = flatten(draw())
  await nodes.find(node => node.props?.['data-codex-rename']).props.onSubmit({ preventDefault: () => {}, currentTarget: { elements: { name: { value: 'qq-main' } } } })
  await settleLoop()
  assert.deepEqual(calls.rename.map(call => ({ ...call })), [{ id: 'ef567890', name: 'qq-main' }])
  nodes = flatten(draw())
  nodes.find(node => node.props?.['data-codex-action'] === 'use').props.onClick()
  await settleLoop()
  assert.deepEqual(calls.setActive.map(call => ({ ...call })), [{ id: 'ef567890' }])
  nodes = flatten(draw())
  assert.match(nodes.find(node => node.props?.['data-codex-current']).props.children, /qq@example.test/u, 'the current line follows the switch')
  assert.equal(nodes.find(node => node.props?.['data-quota-email']).props.children, 'qq@example.test', 'the main quota panel follows the switch, not only the pool')
  assert.equal(calls.snapshot.filter(request => !request.grantId).at(-1).maxAgeMs, 0, 'mutation refresh bypasses the quota cache')
  assert.ok(!nodes.some(node => node.props?.['data-codex-operation-error']), 'awaited successful actions do not show generic errors')
  // Removing the imported account drops its record.
  nodes.find(node => node.props?.['data-codex-select']).props.onChange({ target: { value: '99aabbcc' } })
  nodes = flatten(draw())
  nodes.find(node => node.props?.['data-codex-action'] === 'remove').props.onClick()
  await settleLoop()
  assert.deepEqual(calls.drop.map(call => ({ ...call })), [{ id: '99aabbcc' }])
  assert.ok(!JSON.stringify(flatten(draw())).includes('access'), 'no rendered node carries grant material')
})

const uiQuota = () => ({
  snapshot: async () => ({ ok: true, value: { status: 'ok', snapshot: { account: 'synthetic', windows: [] } } }),
  history: async () => ({ ok: true, value: { points: [] } }),
})
const settleDraw = async draw => { for (let i = 0; i < 8; i++) { await new Promise(resolve => setImmediate(resolve)); draw() } }
const textOf = node => {
  if (Array.isArray(node)) return node.map(textOf).join(' ')
  if (node && typeof node === 'object') return textOf(node.props?.children)
  return typeof node === 'string' ? node : ''
}
const formEvent = elements => ({ preventDefault() {}, currentTarget: { elements } })

test('CLI source contract passes request objects and shows full custom directory details', async () => {
  const calls = { sources: [], import: [] }
  const home = '/home/synthetic/very-long-codex-home-path/another-account-with-a-long-name'
  const accounts = {
    ...emptyAccounts(),
    list: async () => ({ ok: true, value: { entries: [], current: { email: 'outside-pool@example.test', source: 'existing' } } }),
    sources: async request => {
      calls.sources.push(request)
      return { ok: true, value: { policy: 'Only fixed and bounded cc-switch homes are discovered.', sources: request.directory ? [
        { id: 'directory', label: 'Other Codex home', path: home, authPath: `${home}/auth.json`, available: true, status: 'ok', email: 'custom@example.test', expires: 1990000000 },
      ] : [] } }
    },
    import: async request => { calls.import.push(request); return { ok: true, value: { entry: { id: 'new-cli' } } } },
  }
  const { draw, remoteDescriptor } = await mountPanel(uiQuota(), { accounts })
  const sourceDescriptor = remoteDescriptor.descriptors.find(item => item.service === 'codexAccounts' && item.method === 'sources')
  assert.equal(sourceDescriptor.parameters.length, 1, 'the client descriptor agrees with the host request contract')
  assert.equal(sourceDescriptor.parameters[0].name, 'request')
  assert.deepEqual({ ...sourceDescriptor.parameters[0].codec.create().parse({ directory: '~/codex-work' }) }, { directory: '~/codex-work' })
  assert.throws(() => sourceDescriptor.parameters[0].codec.create().parse('~/codex-work'))
  openFold(flatten(draw()))
  await settleDraw(draw)
  let nodes = flatten(draw())
  assert.deepEqual(calls.sources.map(request => ({ ...request })), [{}], 'default discovery passes an object, not undefined')
  assert.match(nodes.find(node => node.props?.['data-codex-current']).props.children, /outside-pool@example.test/u, 'a current account outside the pool is not reported signed out')
  assert.ok(nodes.find(node => node.props?.['data-codex-action'] === 'import').props.disabled)
  nodes.find(node => node.type === 'input' && node.props.name === 'directory').props.onChange({ target: { value: '~/codex-work' } })
  nodes = flatten(draw())
  await nodes.find(node => node.props?.['data-codex-directory']).props.onSubmit(formEvent({}))
  await settleDraw(draw)
  nodes = flatten(draw())
  assert.deepEqual(calls.sources.map(request => ({ ...request })), [{}, { directory: '~/codex-work' }])
  assert.equal(nodes.find(node => node.props?.['data-codex-source-select']).props.value, 'directory')
  assert.equal(nodes.find(node => node.props?.['data-codex-source-path']).props.children, home)
  assert.equal(nodes.find(node => node.props?.['data-codex-source-auth-path']).props.children, `${home}/auth.json`)
  assert.match(nodes.find(node => node.props?.['data-codex-source-status']).props.children, /custom@example.test.*可导入/u)
  assert.match(nodes.find(node => node.props?.['data-codex-source-policy']).props.children, /bounded cc-switch/u)
  assert.equal(nodes.find(node => node.props?.['data-codex-source']).props.children, 'Other Codex home', 'the option contains only its concise label')
  await nodes.find(node => node.props?.['data-codex-import']).props.onSubmit(formEvent({ name: { value: 'Custom CLI' } }))
  assert.deepEqual(calls.import.map(request => ({ ...request })), [{ directory: home, name: 'Custom CLI' }])

  nodes = flatten(draw())
  nodes.find(node => node.type === 'input' && node.props.name === 'directory').props.onChange({ target: { value: 'relative/not-allowed' } })
  nodes = flatten(draw())
  await nodes.find(node => node.props?.['data-codex-directory']).props.onSubmit(formEvent({}))
  nodes = flatten(draw())
  assert.equal(calls.sources.length, 2, 'relative paths never reach host discovery')
  assert.match(textOf(nodes.find(node => node.props?.['data-codex-source-error'])), /绝对路径/u)
})

test('source and account load errors remain separate, visible and retryable', async () => {
  let sourceFails = true
  let listFails = true
  const accounts = {
    ...emptyAccounts(),
    list: async () => listFails ? { ok: false, error: { message: 'synthetic list denial' } } : { ok: true, value: { entries: [{ id: 'web-account', name: 'Browser account', email: 'web@example.test', source: 'web', active: true }] } },
    sources: async () => sourceFails ? { ok: false, error: { message: 'synthetic directory denial' } } : { ok: true, value: { sources: [{ id: 'codex', label: 'Default Codex', path: '/home/synthetic/.codex', available: true, status: 'ok' }] } },
  }
  const { draw } = await mountPanel(uiQuota(), { accounts })
  openFold(flatten(draw()))
  await settleDraw(draw)
  let nodes = flatten(draw())
  assert.match(textOf(nodes.find(node => node.props?.['data-codex-list-error'])), /加载账号池失败.*synthetic list denial/u)
  assert.match(textOf(nodes.find(node => node.props?.['data-codex-source-error'])), /加载 CLI 来源失败.*synthetic directory denial/u)
  assert.ok(!nodes.find(node => node.props?.['data-codex-current']).props.children.includes('未登录'), 'a list error never invents a signed-out current account')
  assert.equal(nodes.find(node => node.props?.['data-codex-action'] === 'import').props.disabled, true)
  listFails = false
  await flatten(nodes.find(node => node.props?.['data-codex-list-error'])).find(node => node.type === 'button').props.onClick()
  nodes = flatten(draw())
  assert.ok(!nodes.some(node => node.props?.['data-codex-list-error']))
  assert.match(textOf(nodes.find(node => node.props?.['data-codex-account-meta'])), /网页授权.*web@example.test/u)
  assert.ok(nodes.some(node => node.props?.['data-codex-source-error']), 'a successful pool load does not swallow a source failure')
  sourceFails = false
  await nodes.find(node => node.props?.['data-codex-directory']).props.onSubmit(formEvent({}))
  nodes = flatten(draw())
  assert.ok(!nodes.some(node => node.props?.['data-codex-source-error']))
  assert.equal(nodes.find(node => node.props?.['data-codex-action'] === 'import').props.disabled, false)
})

test('async import and switch errors show operation context and block duplicate mutations', async () => {
  let resolveImport
  let resolveSwitch
  const calls = { import: 0, switch: 0, snapshot: 0 }
  const accounts = {
    ...emptyAccounts(),
    list: async () => ({ ok: true, value: { entries: [{ id: 'other', name: 'Other', email: 'other@example.test', source: 'existing', active: false }] } }),
    sources: async () => ({ ok: true, value: { sources: [{ id: 'codex', label: 'Default', path: '/home/synthetic/.codex', available: true, status: 'ok' }] } }),
    import: async () => { calls.import++; return await new Promise(resolve => { resolveImport = resolve }) },
    setActive: async () => { calls.switch++; return await new Promise(resolve => { resolveSwitch = resolve }) },
  }
  const quota = { ...uiQuota(), snapshot: async () => { calls.snapshot++; return { ok: true, value: { status: 'ok', snapshot: { account: 'current', windows: [] } } } } }
  const { draw } = await mountPanel(quota, { accounts })
  openFold(flatten(draw()))
  await settleDraw(draw)
  let nodes = flatten(draw())
  const submitImport = nodes.find(node => node.props?.['data-codex-import']).props.onSubmit
  const importEvent = formEvent({ name: { value: '' } })
  const pendingImport = submitImport(importEvent)
  await submitImport(importEvent)
  assert.equal(calls.import, 1, 'same-render double submit cannot import twice')
  nodes = flatten(draw())
  assert.equal(nodes.find(node => node.props?.['data-codex-action'] === 'use').props.disabled, true)
  assert.equal(nodes.find(node => node.props?.['data-login-action'] === 'start').props.disabled, true)
  resolveImport({ ok: false, error: { message: 'synthetic invalid auth file' } })
  await pendingImport
  nodes = flatten(draw())
  assert.match(textOf(nodes.find(node => node.props?.['data-codex-operation-error'])), /导入失败.*synthetic invalid auth file/u)
  assert.equal(calls.snapshot, 1, 'a failed import does not imply a successful quota refresh')
  const switchAccount = nodes.find(node => node.props?.['data-codex-action'] === 'use').props.onClick
  const pendingSwitch = switchAccount()
  await switchAccount()
  assert.equal(calls.switch, 1, 'same-render repeated switch cannot reenter')
  resolveSwitch({ ok: false, error: { message: 'synthetic grant missing' } })
  await pendingSwitch
  nodes = flatten(draw())
  assert.match(textOf(nodes.find(node => node.props?.['data-codex-operation-error'])), /切换账号失败.*synthetic grant missing/u)
  assert.equal(nodes.find(node => node.props?.['data-codex-action'] === 'use').props.disabled, false)
  assert.equal(calls.snapshot, 1, 'a failed switch keeps the current quota panel')
})

test('browser login reuses searchLogin.start and preserves notices while refreshing pool and quota', async () => {
  const calls = { start: [], answer: [], list: 0, snapshot: 0 }
  const entries = []
  let resolveStart
  const searchLogin = {
    list: async () => ({ ok: true, value: { entries: [{ key: 'llm-pi-ai/openai-codex', authorized: true, inFlight: false }] } }),
    start: async request => { calls.start.push(request); return await new Promise(resolve => { resolveStart = resolve }) },
    answer: async (id, value) => {
      calls.answer.push({ id, value })
      entries.push({ id: 'new-web', name: 'Second browser', email: 'browser@example.test', source: 'web', active: true })
      return { ok: true, value: { id, status: 'authorized' } }
    },
  }
  const accounts = { ...emptyAccounts(), list: async () => { calls.list++; return { ok: true, value: { entries } } } }
  const quota = { ...uiQuota(), snapshot: async () => { calls.snapshot++; return { ok: true, value: { status: 'ok', snapshot: { email: entries[0]?.email || 'old@example.test', windows: [] } } } } }
  const { draw } = await mountPanel(quota, { accounts, searchLogin })
  openFold(flatten(draw()))
  await settleDraw(draw)
  let nodes = flatten(draw())
  assert.match(nodes.find(node => node.props?.['data-login-action'] === 'start').props.children, /添加.*另一个账号/u)
  assert.ok(nodes.some(node => node.props?.['data-web-login']))
  assert.ok(nodes.some(node => node.props?.['data-codex-cli-login']))
  nodes.find(node => node.type === 'input' && node.props.name === 'accountName').props.onChange({ target: { value: 'Second browser' } })
  nodes = flatten(draw())
  const start = nodes.find(node => node.props?.['data-login-action'] === 'start').props.onClick
  const pendingStart = start()
  await start()
  assert.equal(calls.start.length, 1, 'OAuth start is guarded before rerender')
  resolveStart({ ok: true, value: { id: 'attempt-web', status: 'waiting', notice: { message: 'Authorize the new account', url: 'https://example.test/oauth', code: 'SYNTHETIC' }, prompt: { message: 'Paste confirmation', kind: 'text' } } })
  await pendingStart
  nodes = flatten(draw())
  assert.deepEqual(calls.start.map(request => ({ ...request })), [{ key: 'llm-pi-ai/openai-codex', accountName: 'Second browser' }])
  assert.equal(nodes.find(node => node.props?.['data-login-action'] === 'open').props.href, 'https://example.test/oauth')
  assert.match(textOf(nodes.find(node => node.props?.['data-login-notice'])), /Authorize the new account.*SYNTHETIC/u)
  const previousLists = calls.list
  await nodes.find(node => node.type === 'form' && node.props['aria-label'] === '确认 ChatGPT 授权').props.onSubmit(formEvent({ answer: { value: 'confirmed' } }))
  await settleDraw(draw)
  nodes = flatten(draw())
  assert.deepEqual(calls.answer, [{ id: 'attempt-web', value: 'confirmed' }])
  assert.ok(calls.list > previousLists, 'OAuth completion refreshes the shared account pool')
  assert.equal(nodes.find(node => node.props?.['data-codex-option']).props['data-codex-option'], 'new-web')
  assert.match(textOf(nodes.find(node => node.props?.['data-codex-account-meta'])), /网页授权/u)
  assert.equal(nodes.find(node => node.props?.['data-quota-email']).props.children, 'browser@example.test')
  assert.equal(calls.snapshot, 2, 'OAuth completion refreshes the main quota panel')
})

test('KeyPool awaits rejected mutations, preserves rename drafts and guards add reentry', async () => {
  let finishAdd
  let resetCount = 0
  const calls = { add: 0 }
  const pool = {
    ...emptyPool(),
    list: async () => ({ ok: true, value: { entries: [{ id: 'named-key', name: 'Existing', active: false }] } }),
    rename: async () => ({ ok: false, error: { message: 'synthetic rename rejection' } }),
    add: async () => { calls.add++; return await new Promise(resolve => { finishAdd = resolve }) },
  }
  const { draw } = await mountPanel(uiQuota(), { provider: 'zai', keyConfigured: true, pool })
  openFold(flatten(draw()))
  await settleDraw(draw)
  let nodes = flatten(draw())
  nodes.find(node => node.props?.['data-pool-action'] === 'rename').props.onClick()
  nodes = flatten(draw())
  await nodes.find(node => node.props?.['data-pool-rename']).props.onSubmit(formEvent({ name: { value: 'New name' } }))
  nodes = flatten(draw())
  assert.match(textOf(nodes.find(node => node.props?.role === 'alert')), /重命名失败.*synthetic rename rejection/u)
  assert.ok(nodes.some(node => node.props?.['data-pool-rename']), 'failed rename keeps the editing form')
  const event = formEvent({ name: { value: 'New key' }, value: { value: 'synthetic-test-only' } })
  event.currentTarget.reset = () => { resetCount++ }
  const add = nodes.find(node => node.props?.['data-pool-add']).props.onSubmit
  const pending = add(event)
  await add(event)
  assert.equal(calls.add, 1)
  finishAdd({ ok: false, error: { message: 'synthetic add rejection' } })
  await pending
  nodes = flatten(draw())
  assert.match(textOf(nodes.find(node => node.props?.role === 'alert')), /添加失败.*synthetic add rejection/u)
  assert.equal(resetCount, 0, 'failed remote add does not erase the form')
})
