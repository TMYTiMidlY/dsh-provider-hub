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
  const hooks = () => {
    const frame = stack[stack.length - 1]
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
    useEffect(effect) {
      const { frame, slots } = hooks()
      const slot = slots[frame.cursor++] ??= { ran: false }
      if (!slot.ran) { slot.ran = true; effect() }
    },
    useCallback(fn) { hooks().frame.cursor++; return fn },
  }
  const render = factory => { root.counters = new Map(); root.cursor = 0; return factory() }
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

async function mountPanel(quota, options = {}) {
  const provider = options.provider ?? 'openai-codex'
  const pool = options.pool ?? emptyPool()
  const { React, render } = createHarness()
  const plugin = loadClient(React)
  let cardFactory
  const capture = { inject: (name, callback) => callback(), register: (seat, callback) => { cardFactory = callback } }
  const searchLogin = { list: async () => ({ ok: true, value: { entries: [{ key: 'llm-pi-ai/openai-codex', authorized: true, methods: [{ id: 'oauth', label: 'OAuth' }], inFlight: false }] } }) }
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
    remote: { $mount: async () => async () => {} },
    inject: (_deps, callback) => { callback({ remote: { searchLogin, quota, keyPool: pool }, slots: capture }); return Object.assign(Promise.resolve(), { dispose: async () => {} }) },
  })
  assert.ok(cardFactory, 'provider-card render captured')
  const draw = () => render(() => cardFactory({ provider: { provider }, keyConfigured: options.keyConfigured ?? (provider === 'openai-codex'), pool, quota }))
  return { draw, pool }
}

const settle = async () => { for (let i = 0; i < 6; i++) await new Promise(resolve => setImmediate(resolve)) }

test('QuotaPanel renders the sparkline once history points arrive', async () => {
  const calls = { snapshot: 0, history: 0 }
  const quota = {
    snapshot: async () => { calls.snapshot++; return { ok: true, value: { status: 'ok', snapshot: { account: 'acct-1', email: 'quota@example.test', plan: 'pro', windows: [{ kind: 'weekly', usedPercent: 27, windowSeconds: 604800, resetAt: 1792295880 }], credits: { balance: 62500, unlimited: false }, resetCredits: { available: 3, credits: [{ title: 'Full reset', expiresAt: 1792295880, status: 'available' }, { title: 'Full reset', expiresAt: 1793000000, status: 'available' }] } }, fetchedAt: Math.floor(Date.now() / 1000) } } },
    history: async () => { calls.history++; return { ok: true, value: { status: 'ok', points: Array.from({ length: 13 }, (_, index) => ({ ts: 1791721950 + index * 3600, used: { weekly: 16 + index } })) } } },
  }
  const { draw } = await mountPanel(quota)
  const settle = async () => { for (let i = 0; i < 8; i++) { await new Promise(resolve => setImmediate(resolve)); draw() } }
  draw()
  await settle()
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
  assert.ok(Math.max(...ys) - Math.min(...ys) >= 10, 'trend spans the vertical range instead of a near-flat line')
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
  const interval = vmTimers.find(timer => timer.interval)
  assert.ok(interval, 'history auto-refresh interval installed')
  interval.fn()
  await settle()
  assert.equal(calls.history, 2, 'periodic refresh re-reads history without user action')
  const refresh = nodes.find(node => node.props?.['data-quota-refresh'])
  assert.ok(refresh, 'manual refresh button present')
  refresh.props.onClick()
  await settle()
  assert.equal(calls.snapshot, 2, 'manual refresh triggers another snapshot')
  assert.equal(calls.history, 3)
})

test('QuotaPanel falls back to the placeholder and keeps data on history failure', async () => {
  const quota = {
    snapshot: async () => ({ ok: true, value: { status: 'ok', snapshot: { account: 'acct-1', windows: [{ kind: 'weekly', usedPercent: 40 }] }, fetchedAt: Math.floor(Date.now() / 1000) } }),
    history: async () => ({ ok: false, error: { message: 'synthetic history failure' } }),
  }
  const { draw } = await mountPanel(quota)
  const settleLoop = async () => { for (let i = 0; i < 8; i++) { await new Promise(resolve => setImmediate(resolve)); draw() } }
  draw()
  await settleLoop()
  const nodes = flatten(draw())
  assert.ok(nodes.find(node => node.props?.['data-quota-section']), 'panel still renders')
  assert.ok(nodes.some(node => (typeof node.props?.children === 'string' && node.props.children.includes('暂无历史记录'))), 'placeholder shows when history fails')
  assert.ok(nodes.find(node => node.props?.['data-quota-window']), 'snapshot data survives a history failure')
})

test('QuotaPanel keeps the sparkline centred and labelled when usage is flat', async () => {
  const quota = {
    snapshot: async () => ({ ok: true, value: { status: 'ok', snapshot: { account: 'acct-1', windows: [{ kind: 'weekly', usedPercent: 40 }] }, fetchedAt: Math.floor(Date.now() / 1000) } }),
    history: async () => ({ ok: true, value: { status: 'ok', points: Array.from({ length: 4 }, (_, index) => ({ ts: 1791721950 + index * 259200, used: { weekly: 40 } })) } }),
  }
  const { draw } = await mountPanel(quota)
  draw()
  for (let i = 0; i < 8; i++) { await new Promise(resolve => setImmediate(resolve)); draw() }
  const nodes = flatten(draw())
  const polyline = nodes.find(node => typeof node.props?.points === 'string' && node.props.fill === 'none')
  assert.ok(polyline, 'flat usage still renders a line')
  const ys = polyline.props.points.split(' ').map(pair => Number(pair.split(',')[1]))
  assert.ok(ys.every(y => Number.isFinite(y)), 'flat values map to finite coordinates')
  assert.ok(ys.every(y => y === ys[0]), 'flat values render as one horizontal line')
  assert.ok(Math.abs(ys[0] - 12) < 0.5, 'flat line sits at the vertical centre')
  const caps = nodes.filter(node => node.props?.['data-quota-spark-cap'])
  assert.equal(caps.map(cap => cap.props.children).join('→'), '40%→40%')
  const ticks = nodes.filter(node => node.props?.['data-quota-spark-tick'])
  assert.equal(ticks.length, 3, 'flat series still carries the time axis')
  assert.ok(ticks.every(tick => /^\d{2}-\d{2}$/.test(tick.props.children)), 'multi-day span shows day-precision ticks')
})

test('API-key provider card previews every pool key and switches the active one', async () => {
  const calls = { snapshot: [], history: [], setActive: [], drop: [], add: [] }
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
    rename: async () => ({ ok: true, value: {} }),
  }
  const { draw } = await mountPanel(quota, { provider: 'zai-coding-cn', pool, keyConfigured: true })
  const settleLoop = async () => { for (let i = 0; i < 8; i++) { await new Promise(resolve => setImmediate(resolve)); draw() } }
  draw()
  await settleLoop()
  let nodes = flatten(draw())
  const section = nodes.find(node => node.props?.['data-provider-hub-quota'])
  assert.equal(section.props['data-provider-hub-quota'], 'zai-coding-cn')
  const rows = nodes.filter(node => node.props?.['data-pool-entry'])
  assert.deepEqual(rows.map(row => row.props['data-pool-entry']), ['aaaa0001', 'aaaa0002'], 'one row per stored key, in order')
  assert.deepEqual(rows.map(row => row.props['data-pool-active']), ['true', 'false'])
  assert.equal(nodes.filter(node => node.props?.['data-quota-section']).length, 1, 'the active key carries its quota panel')
  assert.equal(calls.snapshot[0].provider, 'zai-coding-cn', 'the active panel queries the official credential')
  assert.equal(calls.snapshot[0].keyId, undefined, 'the active panel rides the route credential, not a pool key')
  assert.equal(calls.snapshot[0].maxAgeMs, 300000)

  // Expanding a pool key mounts its own panel against that key alone.
  nodes.filter(node => node.props?.['data-pool-action'] === 'details')[1].props.onClick()
  await settleLoop()
  nodes = flatten(draw())
  assert.equal(nodes.filter(node => node.props?.['data-quota-section']).length, 2, 'each expanded key previews its own quota')
  assert.equal(calls.snapshot.at(-1).keyId, 'aaaa0002', 'the expanded panel names its pool key')

  // Switching marks the entry active and refreshes the pool view (only the
  // inactive entry offers the switch).
  nodes.filter(node => node.props?.['data-pool-action'] === 'use')[0].props.onClick()
  await settleLoop()
  nodes = flatten(draw())
  assert.deepEqual(calls.setActive.map(call => ({ ...call })), [{ id: 'aaaa0002' }])
  assert.deepEqual(nodes.filter(node => node.props?.['data-pool-entry']).map(row => row.props['data-pool-active']), ['false', 'true'])

  // The add form stores a named key through the pool remote.
  const form = nodes.find(node => node.props?.['data-pool-add'])
  await form.props.onSubmit({
    preventDefault: () => {},
    currentTarget: { elements: { name: { value: 'zai-new' }, value: { value: 'sk-synthetic-new' } }, reset: () => {} },
  })
  assert.deepEqual(calls.add.map(call => ({ ...call })), [{ provider: 'zai-coding-cn', name: 'zai-new', value: 'sk-synthetic-new' }])

  nodes.filter(node => node.props?.['data-pool-action'] === 'remove')[0].props.onClick()
  await settleLoop()
  assert.deepEqual(calls.drop.map(call => ({ ...call })), [{ id: 'aaaa0001' }])
  assert.ok(!JSON.stringify(flatten(draw())).includes('sk-synthetic'), 'no rendered node ever carries a secret value')
})
