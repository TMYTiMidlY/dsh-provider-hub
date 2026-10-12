import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

// Minimal hook-capable React stand-in: enough to drive LoginCard + QuotaPanel
// mount, async load, state updates and re-renders, as the browser would.
function createHarness() {
  const slots = []
  let cursor = 0
  const React = {
    // Auto-expand function components so one render pass executes hooks in
    // true top-down order; collapse single children like real React does.
    createElement: (type, props, ...children) => {
      const merged = { ...props, children: children.length <= 1 ? children[0] : children }
      if (typeof type === 'function') return type(merged)
      return { type, props: merged }
    },
    Fragment: Symbol.for('react.fragment'),
    useState(initial) {
      const index = cursor++
      const slot = slots[index] ??= { value: typeof initial === 'function' ? initial() : initial }
      return [slot.value, value => { slot.value = typeof value === 'function' ? value(slot.value) : value }]
    },
    useRef(initial) {
      const index = cursor++
      slots[index] ??= { ref: { current: initial } }
      return slots[index].ref
    },
    useEffect(effect) {
      const index = cursor++
      slots[index] ??= { ran: false }
      if (!slots[index].ran) slots[index].ran = true, effect()
    },
    useCallback(fn) { cursor++; return fn },
  }
  const render = factory => { cursor = 0; return factory() }
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

async function mountPanel(quota) {
  const { React, render } = createHarness()
  const plugin = loadClient(React)
  let cardFactory
  const capture = { inject: (name, callback) => callback(), register: (seat, callback) => { cardFactory = callback } }
  const searchLogin = { list: async () => ({ ok: true, value: { entries: [{ key: 'llm-pi-ai/openai-codex', authorized: true, methods: [{ id: 'oauth', label: 'OAuth' }], inFlight: false }] } }) }
  await plugin.apply({
    slots: { inject: (name, callback) => callback(), register: () => {} },
    configForms: { get: () => ({ getSnapshot: () => ({ state: 'unavailable' }), subscribe: () => () => {}, mutate: async () => { throw new Error('not served') } }), whileServed: () => () => {} },
    effect: callback => { callback(); return () => {} },
    remote: { $mount: async () => async () => {} },
    inject: (_deps, callback) => { callback({ remote: { searchLogin, quota }, slots: capture }); return Object.assign(Promise.resolve(), { dispose: async () => {} }) },
  })
  assert.ok(cardFactory, 'provider-card render captured')
  const draw = () => render(() => cardFactory({ provider: { provider: 'openai-codex' } }))
  return { draw }
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
