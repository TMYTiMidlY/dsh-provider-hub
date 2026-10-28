import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

// Minimal hook-capable React stand-in: function components expand inline and
// each instance keeps its own hook state, keyed by tree path plus React key —
// the same isolation real reconciliation gives conditionally mounted panels.
function createHarness({ chartWidth = 240 } = {}) {
  const states = new Map()
  const root = { path: '#root', counters: new Map(), cursor: 0 }
  const stack = [root]
  let visited = new Set()
  let effects = []
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
      if (typeof type !== 'function') {
        const node = { type, props: merged }
        if (props?.ref && typeof props.ref === 'object') props.ref.current = {
          focus() { node.focused = (node.focused || 0) + 1 },
          getBoundingClientRect() { return { width: chartWidth } },
          contains(target) { return flatten(node).includes(target) },
          querySelectorAll() { return flatten(node).filter(child => child.props?.['data-account-choice']).map(child => child.props.ref?.current || { focus() { child.focused = (child.focused || 0) + 1 } }) },
        }
        return node
      }
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
        effects.push(() => { slot.cleanup = effect() })
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
    root.counters = new Map(); root.cursor = 0; visited = new Set(); effects = []
    const tree = factory()
    for (const effect of effects) effect()
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
const TEST_NOW = 1791721950 + 12 * 3600
function loadClient(React, now = TEST_NOW) {
  let registered
  vm.runInNewContext(readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8'), {
    Date: class extends Date { constructor(...args) { super(...(args.length ? args : [now * 1000])) } static now() { return now * 1000 } },
    window: { __ModuleLoader__: { load: entry => { registered = entry } } },
    AbortController,
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
  const { React, render } = createHarness({ chartWidth: options.chartWidth })
  const clientCapture = { dependencies: [] }
  const plugin = loadClient(React)
  let cardFactory
  let actionsFactory
  const capture = { inject: (name, callback) => callback(), register: (seat, callback) => { if (seat.name === 'settings.models.provider-card') cardFactory = callback; if (seat.name === 'settings.models.provider-actions') actionsFactory = callback } }
  const searchLogin = options.searchLogin ?? { list: async () => ({ ok: true, value: { entries: [{ key: 'llm-pi-ai/openai-codex', authorized: true, methods: [{ id: 'oauth', label: 'OAuth' }], inFlight: false }] } }) }
  const bundles = {}
  await plugin.apply({
    locale: {
      register: (ns, dictionaries) => { bundles[ns] = dictionaries; return () => {} },
      bind: ns => (key, params) => {
        const template = bundles[ns]?.[options.locale || 'zh']?.[key] ?? key
        return params ? template.replace(/\{(\w+)\}/g, (match, name) => (name in params ? String(params[name]) : match)) : template
      },
    },
    slots: { inject: (name, callback) => callback(), register: () => {} },
    configForms: { get: () => ({ getSnapshot: () => ({ state: 'unavailable' }), subscribe: () => () => {}, mutate: async () => { throw new Error('not served') } }), whileServed: () => () => {} },
    effect: callback => { callback(); return () => {} },
    remote: { $mount: async descriptor => { clientCapture.remote = descriptor; return async () => {} } },
    inject: (_deps, callback) => { clientCapture.dependencies.push(_deps); callback({ uiWorkspace: options.workspace, remote: { searchLogin, quota, keyPool: pool, codexAccounts: accounts }, slots: capture }); return Object.assign(Promise.resolve(), { dispose: async () => {} }) },
  })
  assert.ok(cardFactory, 'provider-card render captured')
  const owner = { provider: { provider, settingsNs: options.settingsNs || 'llm-pi-ai' }, buttonClassName: options.buttonClassName, settingsNs: options.settingsNs || 'llm-pi-ai', keyConfigured: options.keyConfigured ?? (provider === 'openai-codex') }
  const draw = () => render(() => [options.headerActions ? React.createElement(actionsFactory, { ...owner, key: 'header' }) : null, React.createElement(cardFactory, { ...owner, key: 'body' })])
  return { draw, pool, accounts, remoteDescriptor: clientCapture.remote, dependencies: clientCapture.dependencies }
}

test('Models account management never renders search marketing or credential-reuse copy', async () => {
  for (const locale of ['zh', 'en']) for (const provider of ['openai-codex', 'zai', 'zai-coding-cn']) {
    const quota = { snapshot: async () => ({ ok: true, value: { status: 'signed-out' } }), history: async () => ({ ok: true, value: { status: 'ok', points: [] } }) }
    const { draw } = await mountPanel(quota, { locale, provider, keyConfigured: true })
    openManagement(flatten(draw()))
    await settleDraw(draw)
    const text = flatten(draw()).filter(node => node.type !== 'style').map(node => typeof node.props?.children === 'string' ? node.props.children : '').join('\n')
    assert.doesNotMatch(text, /搜索|search/iu)
    if (provider !== 'openai-codex') assert.match(text, locale === 'zh' ? /只预览额度与历史/u : /only previews its quota/u)
  }
})

const settle = async () => { for (let i = 0; i < 6; i++) await new Promise(resolve => setImmediate(resolve)) }

// The quota area lives behind a native fold: collapsed by default, so its
// panels (and their snapshot probes) only mount after the first expand.
const openManagement = nodes => {
  const trigger = nodes.find(node => node.props?.['data-provider-pool-fallback'] || node.props?.['data-provider-pool-action'])
  assert.ok(trigger, 'one compact action opens the management area')
  assert.equal(trigger.props['aria-expanded'], false, 'management starts hidden')
  trigger.props.onClick()
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
  openManagement(nodes)
  await settleDraw(draw)
  nodes = flatten(draw())
  assert.equal(nodes.filter(node => node.props?.['data-quota-section']).length, 1, 'expanding mounts the account quota panel')
  assert.equal(nodes.filter(node => node.props?.['data-codex-accounts']).length, 1, 'the codex account pool mounts with it')
  assert.ok(nodes.some(node => node.props?.['data-codex-accounts']), 'the codex account section is part of the fold')
  assert.equal(calls.snapshot, 1, 'the probe fires exactly on first expand')
  const toggle = nodes.find(node => node.props?.['data-provider-pool-fallback'])
  assert.equal(toggle.props['aria-expanded'], true)
  toggle.props.onClick()
  nodes = flatten(draw())
  assert.equal(nodes.find(node => node.props?.['data-provider-pool-panel']).props.hidden, true, 'collapsing is visual; body stays mounted but takes no height')
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
  openManagement(flatten(draw()))
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
  assert.equal(nodes.filter(node => node.props?.['data-quota-spark-cap']).length, 0, 'no labels imply values at empty window boundaries')
  const axis = nodes.find(node => node.props?.['data-quota-spark-axis'])
  assert.ok(axis, 'time axis renders under the sparkline')
  const ticks = nodes.filter(node => node.props?.['data-quota-spark-tick'])
  assert.deepEqual(ticks.map(tick => tick.props['data-quota-spark-tick']), ['start', 'mid', 'end'])
  assert.ok(ticks.every(tick => /^\d{2}-\d{2}$/.test(tick.props.children)), 'seven-day axis uses calendar dates')
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
  openManagement(flatten(draw()))
  for (let i = 0; i < 8; i++) { await new Promise(resolve => setImmediate(resolve)); draw() }
  const nodes = flatten(draw())
  assert.ok(nodes.find(node => node.props?.['data-quota-section']), 'panel still renders')
  assert.ok(nodes.some(node => (typeof node.props?.children === 'string' && node.props.children.includes('尚无历史记录'))), 'placeholder shows when history fails')
  assert.ok(nodes.find(node => node.props?.['data-quota-window']), 'snapshot data survives a history failure')
})

test('flat usage keeps the 100% axis and hovers name each sample and plan change', async () => {
  const quota = {
    snapshot: async () => ({ ok: true, value: { status: 'ok', snapshot: { account: 'acct-1', windows: [{ kind: 'weekly', usedPercent: 40 }] }, fetchedAt: Math.floor(Date.now() / 1000) } }),
    history: async () => ({ ok: true, value: { status: 'ok', points: Array.from({ length: 7 }, (_, index) => ({ ts: 1791721950 + index * 3600, used: { weekly: 40 }, ...(index < 3 ? { plan: 'pro' } : { plan: 'plus' }) })) } }),
  }
  const { draw } = await mountPanel(quota)
  openManagement(flatten(draw()))
  for (let i = 0; i < 8; i++) { await new Promise(resolve => setImmediate(resolve)); draw() }
  let nodes = flatten(draw())
  const polyline = nodes.find(node => typeof node.props?.points === 'string' && node.props.fill === 'none')
  assert.ok(polyline, 'flat usage still renders a line')
  const ys = polyline.props.points.split(' ').map(pair => Number(pair.split(',')[1]))
  assert.ok(ys.every(y => y === 14), 'a flat 40% line sits at y 14 on the fixed 0–100% axis')
  assert.equal(nodes.filter(node => node.props?.['data-quota-spark-cap']).length, 0)
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
  openManagement(flatten(draw()))
  await settleLoop()
  let nodes = flatten(draw())
  const section = nodes.find(node => node.props?.['data-provider-hub-quota'])
  assert.equal(section.props['data-provider-hub-quota'], 'zai-coding-cn')
  nodes = openPicker(draw, 'pool')
  const options = nodes.filter(node => node.props?.['data-pool-option'])
  assert.deepEqual(options.map(option => option.props['data-pool-option']), ['aaaa0001', 'aaaa0002'])
  assert.match(textOf(options[0]), /zai-gsj.*当前生效/u)
  assert.equal(textOf(options[1]).trim(), 'zai-team')
  assert.equal(nodes.filter(node => node.props?.['data-quota-section']).length, 1, 'the active key carries its quota panel')
  assert.equal(calls.snapshot[0].provider, 'zai-coding-cn', 'the active panel queries the official credential')
  assert.equal(calls.snapshot[0].keyId, 'aaaa0001', 'the default preview names the active pool key')
  assert.equal(calls.snapshot[0].maxAgeMs, 300000)

  // Selecting the second key and expanding details mounts its own panel.
  chooseAccount(draw, 'pool', 'aaaa0002')
  nodes = flatten(draw())
  await settleLoop()
  nodes = flatten(draw())
  assert.equal(nodes.filter(node => node.props?.['data-quota-section']).length, 1, 'the selected key replaces the sole quota panel')
  assert.equal(calls.snapshot.at(-1).keyId, 'aaaa0002', 'selection immediately previews its pool key')
  assert.equal(calls.setActive.length, 0, 'preview never switches the live account')
  assert.equal(calls.history.at(-1).keyId, 'aaaa0002')

  // Renaming the selected key goes through the pool remote.
  startRename(draw, 'pool', 'aaaa0002', 'zai-team-2')
  nodes = flatten(draw())
  const renameForm = nodes.find(node => node.props?.['data-pool-rename'])
  assert.ok(renameForm, 'an inline rename form appears')
  await renameForm.props.onSubmit({ preventDefault: () => {}, stopPropagation() {}, currentTarget: { elements: { name: { value: 'zai-team-2' } } } })
  await settleLoop()
  assert.deepEqual(calls.rename.map(call => ({ ...call })), [{ id: 'aaaa0002', name: 'zai-team-2' }])

  // Switching marks the entry active and refreshes the pool view.
  nodes = flatten(draw())
  nodes.find(node => node.props?.['data-pool-action'] === 'use').props.onClick()
  await settleLoop()
  nodes = flatten(draw())
  assert.deepEqual(calls.setActive.map(call => ({ ...call })), [{ id: 'aaaa0002' }])
  nodes = openPicker(draw, 'pool')
  const optionsAfter = nodes.filter(node => node.props?.['data-pool-option'])
  assert.match(textOf(optionsAfter[1]), /当前生效/u, 'the switched key is labelled active')
  assert.ok(!textOf(optionsAfter[0]).includes('当前生效'))

  // The add form stores a named key through the pool remote.
  const form = nodes.find(node => node.props?.['data-pool-add'])
  await form.props.onSubmit({
    preventDefault: () => {}, stopPropagation() {},
    currentTarget: { elements: { name: { value: 'zai-new' }, value: { value: 'sk-synthetic-new' } }, reset: () => {} },
  })
  assert.deepEqual(calls.add.map(call => ({ ...call })), [{ provider: 'zai-coding-cn', name: 'zai-new', value: 'sk-synthetic-new', accountType: 'personal' }])

  // Selecting back the first key, then removing it.
  nodes = flatten(draw())
  chooseAccount(draw, 'pool', 'aaaa0001')
  nodes = flatten(draw())
  await dropAccount(draw, 'pool', 'aaaa0001')
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
  openManagement(flatten(draw()))
  await settleLoop()
  let nodes = flatten(draw())
  const current = nodes.find(node => node.props?.['data-codex-current'])
  assert.ok(current, 'the current account remains available to assistive technology')
  assert.match(current.props.className, /\bph-sr-only\b/u, 'the current line does not duplicate the visible picker identity')
  assert.match(current.props.children, /vickie@example.test/u)
  assert.ok(!nodes.some(node => node.props?.['data-codex-action'] === 'use'), 'the active account has no redundant use action')
  nodes = openPicker(draw, 'codex')
  const options = nodes.filter(node => node.props?.['data-codex-option'])
  assert.deepEqual(options.map(option => option.props['data-codex-option']), ['ab12cd34', 'ef567890'])
  assert.match(textOf(options[0]), /vickie.*当前生效/u)
  // The import form previews both CLI directories with their availability.
  nodes = await openAdd(draw, 'cli', 'gth')
  let importForm = nodes.find(node => node.props?.['data-codex-import'])
  assert.ok(importForm, 'the import form renders inside the fold')
  nodes = openPicker(draw, 'codex-source')
  const sourceOptions = nodes.filter(node => node.props?.['data-codex-source-option'])
  assert.deepEqual(sourceOptions.map(option => option.props['data-codex-source-option']), ['codex', 'codex-gth', 'missing'])
  assert.equal(flatten(sourceOptions[0]).find(node => node.props?.className === 'ph-account-name').props.children, 'qq@example.test', 'source email is the primary row identity')
  assert.match(textOf(flatten(sourceOptions[0]).find(node => node.props?.className === 'ph-account-description')), /codex（全局/u, 'the CLI label remains a secondary description')
  assert.match(textOf(sourceOptions[1]), /已过期/u)
  assert.equal(sourceOptions[1].props.disabled, false, 'expired sources remain inspectable and importable')
  assert.equal(sourceOptions[2].props.disabled, false, 'missing sources remain inspectable, but cannot be imported')
  assert.ok(!nodes.some(node => node.type === 'select'), 'CLI sources also use the non-native picker')
  const sourceList = nodes.find(node => node.props?.['data-account-list'] === 'codex-source')
  assert.ok(!flatten(sourceList).some(node => node.props?.['data-account-rename']), 'source directories have no rename mutation')
  const sourceDetails = nodes.find(node => node.props?.['data-codex-source-details'])
  assert.equal(flatten(sourceDetails).find(node => node.type === 'details').props.open, undefined, 'source paths are tucked into a closed details disclosure')
  assert.equal(nodes.find(node => node.props?.['data-codex-source-path']).props.children, '/home/synthetic/.codex')
  assert.equal(nodes.find(node => node.props?.['data-codex-source-status']).props.children, '可导入', 'source status does not repeat the primary email')

  // Import carries the chosen source and optional name, but never switches.
  chooseAccount(draw, 'codex-source', 'codex-gth')
  nodes = flatten(draw())
  importForm = nodes.find(node => node.props?.['data-codex-import'])
  await importForm.props.onSubmit({ preventDefault: () => {}, stopPropagation() {}, currentTarget: { elements: { name: { value: 'gth' } } } })
  await settleLoop()
  assert.deepEqual(calls.import.map(call => ({ ...call })), [{ source: 'codex-gth', name: 'gth' }])
  assert.equal(calls.setActive.length, 0, 'import does not switch accounts')
  nodes = flatten(draw())
  assert.match(nodes.find(node => node.props?.['data-codex-notice']).props.children, /当前账号未切换/u)
  assert.equal(calls.snapshot.at(-1).grantId, '99aabbcc', 'import selects its preview without activating it')
  assert.equal(nodes.filter(node => node.props?.['data-quota-section']).length, 1)
  assert.deepEqual(openPicker(draw, 'codex').filter(node => node.props?.['data-codex-option']).map(option => option.props['data-codex-option']), ['ab12cd34', 'ef567890', '99aabbcc'])

  // Per-account quota preview passes the grant id.
  chooseAccount(draw, 'codex', 'ef567890')
  nodes = flatten(draw())
  await settleLoop()
  assert.equal(calls.snapshot.at(-1).grantId, 'ef567890', 'the per-account panel previews that grant')
  assert.equal(calls.snapshot.at(-1).provider, 'openai-codex')

  // Expired grants are inspectable but cannot be activated, even via a stale callback.
  nodes = flatten(draw())
  const expiredUse = nodes.find(node => node.props?.['data-codex-action'] === 'use')
  assert.equal(expiredUse.props.disabled, true)
  expiredUse.props.onClick()
  assert.equal(calls.setActive.length, 0)
  // Simulate a freshly updated CLI grant arriving before the next pool refresh.
  entries[1].expired = false; entries[1].expires = 1990000600
  // Rename, then switch the official account.
  nodes = flatten(draw())
  startRename(draw, 'codex', 'ef567890', 'qq-main')
  nodes = flatten(draw())
  await nodes.find(node => node.props?.['data-codex-rename']).props.onSubmit({ preventDefault: () => {}, stopPropagation() {}, currentTarget: { elements: { name: { value: 'qq-main' } } } })
  await settleLoop()
  assert.deepEqual(calls.rename.map(call => ({ ...call })), [{ id: 'ef567890', name: 'qq-main' }])
  nodes = flatten(draw())
  nodes.find(node => node.props?.['data-codex-action'] === 'use').props.onClick()
  await settleLoop()
  assert.deepEqual(calls.setActive.map(call => ({ ...call })), [{ id: 'ef567890' }])
  nodes = flatten(draw())
  assert.match(nodes.find(node => node.props?.['data-codex-current']).props.children, /qq@example.test/u, 'the current line follows the switch')
  assert.equal(nodes.find(node => node.props?.['data-codex-select']).props['data-selected-id'], 'ef567890')
  assert.equal(calls.snapshot.at(-1).grantId, 'ef567890', 'the main quota panel follows the switched grant, not only the pool')
  assert.ok(!nodes.some(node => node.props?.['data-quota-email']), 'compact Codex quota does not repeat the picker email')
  assert.ok(!nodes.some(node => node.props?.['data-codex-action'] === 'use'), 'the newly active account no longer offers activation')
  assert.equal(calls.snapshot.at(-1).maxAgeMs, 0, 'mutation refresh bypasses the quota cache')
  assert.ok(!nodes.some(node => node.props?.['data-codex-operation-error']), 'awaited successful actions do not show generic errors')
  // Removing the imported account drops its record.
  chooseAccount(draw, 'codex', '99aabbcc')
  nodes = flatten(draw())
  await dropAccount(draw, 'codex', '99aabbcc')
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
const formEvent = elements => ({ preventDefault() {}, stopPropagation() {}, currentTarget: { elements } })

test('CLI source contract passes request objects and shows full custom directory details', async () => {
  const calls = { sources: [], import: [] }
  const home = '/home/synthetic/very-long-codex-home-path/another-account-with-a-long-name'
  const accounts = {
    ...emptyAccounts(),
    list: async () => ({ ok: true, value: { entries: [], current: { email: 'outside-pool@example.test', source: 'existing' } } }),
    sources: async request => {
      calls.sources.push(request)
      return { ok: true, value: { policy: 'Only bounded Codex-feature homes are discovered.', sources: request.directory ? [
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
  openManagement(flatten(draw()))
  await settleDraw(draw)
  let nodes = await openAdd(draw, 'cli', 'Custom CLI')
  assert.deepEqual(calls.sources.map(request => ({ ...request })), [{}], 'default discovery passes an object, not undefined')
  assert.match(nodes.find(node => node.props?.['data-codex-current']).props.children, /outside-pool@example.test/u, 'a current account outside the pool is not reported signed out')
  assert.ok(nodes.find(node => node.props?.['data-codex-action'] === 'import').props.disabled)
  nodes.find(node => node.type === 'input' && node.props.name === 'directory').props.onChange({ target: { value: '~/codex-work' } })
  nodes = flatten(draw())
  await nodes.find(node => node.props?.['data-codex-directory']).props.onSubmit(formEvent({}))
  await settleDraw(draw)
  nodes = flatten(draw())
  assert.deepEqual(calls.sources.map(request => ({ ...request })), [{}, { directory: '~/codex-work' }])
  assert.equal(nodes.find(node => node.props?.['data-codex-source-select']).props['data-selected-id'], 'directory')
  assert.equal(nodes.find(node => node.props?.['data-codex-source-path']).props.children, home)
  assert.ok(!nodes.some(node => node.props?.['data-codex-source-auth-path']), 'auth.json path is not repeated')
  assert.equal(nodes.find(node => node.props?.['data-codex-source-status']).props.children, '可导入')
  assert.match(textOf(nodes.find(node => node.props?.['data-codex-source-select'])), /custom@example.test/u)
  const sourceDetails = nodes.find(node => node.props?.['data-codex-source-details'])
  assert.equal(flatten(sourceDetails).find(node => node.type === 'details').props.open, undefined)
  assert.ok(flatten(flatten(sourceDetails).find(node => node.type === 'details')).some(node => node.props?.['data-codex-source-path']), 'the full custom path belongs inside the disclosure')
  assert.match(textOf(nodes.find(node => node.props?.['data-codex-source-policy'])), /bounded Codex-feature/u)
  nodes = openPicker(draw, 'codex-source')
  const customSource = nodes.find(node => node.props?.['data-codex-source-option'] === 'directory')
  assert.equal(flatten(customSource).find(node => node.props?.className === 'ph-account-name').props.children, 'custom@example.test')
  assert.equal(flatten(customSource).find(node => node.props?.className === 'ph-account-description').props.children, 'Other Codex home', 'custom label is secondary to the email')
  await nodes.find(node => node.props?.['data-codex-import']).props.onSubmit(formEvent({ name: { value: 'Custom CLI' } }))
  assert.deepEqual(calls.import.map(request => ({ ...request })), [{ directory: home, name: 'Custom CLI' }])

  nodes = await openAdd(draw, 'cli')
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
  openManagement(flatten(draw()))
  await settleDraw(draw)
  let nodes = await openAdd(draw, 'cli')
  assert.match(textOf(nodes.find(node => node.props?.['data-codex-list-error'])), /加载账号池失败.*synthetic list denial/u)
  assert.match(textOf(nodes.find(node => node.props?.['data-codex-source-error'])), /加载 CLI 来源失败.*synthetic directory denial/u)
  assert.ok(!nodes.find(node => node.props?.['data-codex-current']).props.children.includes('未登录'), 'a list error never invents a signed-out current account')
  assert.equal(nodes.find(node => node.props?.['data-codex-action'] === 'import').props.disabled, true)
  listFails = false
  await flatten(nodes.find(node => node.props?.['data-codex-list-error'])).find(node => node.type === 'button').props.onClick()
  nodes = flatten(draw())
  assert.ok(!nodes.some(node => node.props?.['data-codex-list-error']))
  assert.match(textOf(nodes.find(node => node.props?.['data-codex-account-meta'])), /网页授权/u)
  assert.ok(!textOf(nodes.find(node => node.props?.['data-codex-account-meta'])).includes('web@example.test'), 'account metadata identifies the source without repeating email')
  assert.ok(nodes.some(node => node.props?.['data-codex-source-error']), 'a successful pool load does not swallow a source failure')
  sourceFails = false
  await nodes.find(node => node.props?.['data-codex-action'] === 'rescan').props.onClick()
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
  openManagement(flatten(draw()))
  await settleDraw(draw)
  let nodes = await openAdd(draw, 'cli')
  const submitImport = nodes.find(node => node.props?.['data-codex-import']).props.onSubmit
  const importEvent = formEvent({ name: { value: '' } })
  const pendingImport = submitImport(importEvent)
  await submitImport(importEvent)
  assert.equal(calls.import, 1, 'same-render double submit cannot import twice')
  nodes = flatten(draw())
  assert.equal(nodes.find(node => node.props?.['data-codex-action'] === 'use').props.disabled, true)
  assert.ok(nodes.filter(node => node.props?.['data-codex-add-method']).every(node => node.props.disabled), 'cannot switch login methods while mutating')
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
  const calls = { start: [], answer: [], list: 0, snapshot: [] }
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
  const quota = { ...uiQuota(), snapshot: async request => { calls.snapshot.push(request); return { ok: true, value: { status: 'ok', snapshot: { email: entries[0]?.email || 'old@example.test', windows: [] } } } } }
  const { draw } = await mountPanel(quota, { accounts, searchLogin })
  openManagement(flatten(draw()))
  await settleDraw(draw)
  let nodes = await openAdd(draw, 'web')
  assert.match(nodes.find(node => node.props?.['data-login-action'] === 'start').props.children, /继续网页登录/u)
  assert.ok(nodes.some(node => node.props?.['data-web-login']))
  assert.equal(nodes.filter(node => node.props?.['data-codex-add-method']).length, 2)
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
  assert.equal(openPicker(draw, 'codex').find(node => node.props?.['data-codex-option']).props['data-codex-option'], 'new-web')
  assert.match(textOf(nodes.find(node => node.props?.['data-codex-account-meta'])), /网页授权/u)
  assert.equal(nodes.find(node => node.props?.['data-codex-select']).props['data-selected-id'], 'new-web')
  assert.equal(calls.snapshot.at(-1).grantId, 'new-web', 'OAuth completion targets the newly active grant')
  assert.ok(!nodes.some(node => node.props?.['data-quota-email']), 'Codex compact quota omits duplicate identity')
  assert.equal(calls.snapshot.length, 2, 'OAuth completion refreshes the main quota panel')
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
  openManagement(flatten(draw()))
  await settleDraw(draw)
  let nodes = flatten(draw())
  startRename(draw, 'pool', 'named-key', 'New name')
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

test('account pickers share custom row editing and busy guards with provider-specific actions', async () => {
  for (const kind of ['pool', 'codex']) {
    const names = ['Current account with a very long name '.repeat(8), 'Second account']
    const entries = [{ id: 'first', name: names[0], active: true }, { id: 'second', name: names[1], active: false }]
    const renames = []
    let resolveRename
    const service = { ...(kind === 'pool' ? emptyPool() : emptyAccounts()), list: async () => ({ ok: true, value: { entries } }), rename: async request => { renames.push(request); return await new Promise(resolve => { resolveRename = resolve }) } }
    const { draw } = await mountPanel(uiQuota(), kind === 'pool' ? { provider: 'zai', pool: service } : { accounts: service })
    openManagement(flatten(draw())); await settleDraw(draw)
    let nodes = flatten(draw())
    const toolbar = () => flatten(draw()).find(node => node.props?.[`data-${kind}-toolbar`])
    const signature = () => flatten(toolbar()).filter(node => node.type === 'button').map(node => node.props['data-codex-add'] ? 'add' : node.props[`data-${kind}-action`])
    const actions = () => flatten(draw()).filter(node => node.props?.[`data-${kind}-action`] === 'use')
    assert.deepEqual(signature(), kind === 'codex' ? ['add'] : ['use'])
    if (kind === 'pool') assert.equal(actions()[0].props.disabled, true)
    else assert.equal(actions().length, 0, 'active Codex accounts never render a redundant use button')
    assert.equal(nodes.find(node => node.props?.[`data-${kind}-select`]).type, 'button')
    assert.equal(nodes.filter(node => node.type === 'select' && node.props.name !== 'source').length, 0, 'account selection is never a native select')
    nodes = openPicker(draw, kind)
    assert.equal(nodes.find(node => node.props?.['data-account-drop'] === 'first').props.disabled, kind === 'codex', 'only Codex protects the current account from deletion')
    const row = nodes.find(node => node.props?.['data-account-row'] === 'second')
    const icon = flatten(row).find(node => node.props?.['data-account-rename'])
    assert.match(icon.props['aria-label'], /Second account/u)
    assert.equal(icon.props.title, icon.props['aria-label'])
    assert.ok(flatten(row).find(node => node.props?.['data-account-choice']), 'rename and choose are siblings in the row'
    )
    assert.ok(flatten(row).find(node => node.props?.['data-account-drop']), 'delete is a sibling icon in the same row')
    for (const button of nodes.filter(node => node.type === 'button')) assert.equal(flatten(button.props.children).filter(node => node.type === 'button').length, 0, 'no nested buttons')
    let stopped = 0
    icon.props.onClick({ stopPropagation() { stopped++ } })
    nodes = flatten(draw())
    assert.equal(stopped, 1)
    assert.match(textOf(nodes.find(node => node.props?.[`data-${kind}-select`])), /Current account/u, 'renaming another row does not select it')
    let form = nodes.find(node => node.props?.[`data-${kind}-rename`])
    const input = flatten(form).find(node => node.type === 'input')
    input.props.onChange({ target: { value: 'Renamed row' } })
    form = flatten(draw()).find(node => node.props?.[`data-${kind}-rename`])
    const pending = form.props.onSubmit(formEvent({}))
    await form.props.onSubmit(formEvent({}))
    assert.equal(renames.length, 1, 'rename is guarded even before rerender')
    nodes = flatten(draw())
    assert.ok(nodes.filter(node => node.props?.['data-account-edit']).every(node => node.props.disabled), 'save/cancel are disabled while busy')
    assert.ok(nodes.find(node => node.props?.[`data-${kind}-select`]).props.disabled)
    resolveRename({ ok: true, value: {} }); await pending
    nodes = flatten(draw())
    assert.deepEqual(renames.map(value => ({ ...value })), [{ id: 'second', name: 'Renamed row' }])
    assert.ok(!nodes.some(node => node.props?.[`data-${kind}-rename`]))
    nodes = startRename(draw, kind, 'second', 'Discard this')
    nodes.find(node => node.props?.['data-account-edit'] === 'cancel').props.onClick({ stopPropagation() {} })
    assert.ok(!flatten(draw()).some(node => node.props?.[`data-${kind}-rename`]))
    assert.equal(renames.length, 1, 'cancel makes no RPC')
    chooseAccount(draw, kind, 'second')
    assert.deepEqual(signature(), kind === 'codex' ? ['add'] : ['use'], 'the account selection bar keeps its provider-specific action')
    assert.equal(actions().length, 1, 'a non-active preview offers explicit activation')
    assert.equal(actions()[0].props.disabled, false)
    if (kind === 'codex') assert.ok(!flatten(toolbar()).includes(actions()[0]), 'Codex activation is a preview action, not the Add toolbar slot')
  }
})

test('picker keyboard focus uses committed rows and editors keep native text navigation', async () => {
  const pool = { ...emptyPool(), list: async () => ({ ok: true, value: { entries: [{ id: 'a', name: 'A', active: true }, { id: 'b', name: 'B' }] } }) }
  const { draw } = await mountPanel(uiQuota(), { provider: 'zai', pool })
  openManagement(flatten(draw())); await settleDraw(draw)
  let nodes = flatten(draw())
  nodes.find(node => node.props?.['data-pool-select']).props.onKeyDown({ key: 'ArrowUp', preventDefault() {} })
  nodes = flatten(draw())
  assert.equal(nodes.find(node => node.props?.['data-account-choice'] === 'b').focused, 1, 'first ArrowUp opens then focuses last committed row')
  let trigger = nodes.find(node => node.props?.['data-pool-select'])
  trigger.props.onKeyDown({ key: 'ArrowDown', preventDefault() {} })
  assert.equal(nodes.find(node => node.props?.['data-account-choice'] === 'a').focused, 1, 'already-open trigger immediately focuses first row')
  nodes = startRename(draw, 'pool', 'b')
  const list = nodes.find(node => node.props?.['data-account-list'])
  let prevented = false
  list.props.onKeyDown({ key: 'Home', preventDefault() { prevented = true } })
  assert.equal(prevented, false, 'Home/End/arrows stay native while editing')
  const stableTrigger = nodes.find(node => node.props?.['data-pool-select'])
  list.props.onKeyDown({ key: 'Escape', preventDefault() {}, stopPropagation() {} })
  assert.equal(stableTrigger.focused, 1, 'Escape editor cancellation focuses a mounted stable trigger')
  nodes = flatten(draw())
  assert.ok(!nodes.some(node => node.props?.['data-pool-rename']))
  assert.equal(nodes.find(node => node.props?.['data-pool-select']).props['aria-expanded'], true, 'first Escape cancels editing only')
  nodes.find(node => node.props?.['data-account-list']).props.onKeyDown({ key: 'Escape', preventDefault() {}, stopPropagation() {} })
  assert.equal(flatten(draw()).find(node => node.props?.['data-pool-select']).props['aria-expanded'], false)
})

test('every provider uses the same localized account-pool fold title', async () => {
  for (const locale of ['zh', 'en']) for (const provider of ['openai-codex', 'zai', 'kimi-coding']) {
    const { draw } = await mountPanel(uiQuota(), { provider, locale })
    const action = flatten(draw()).find(node => node.props?.['data-provider-pool-fallback'])
    assert.equal(action.props.children, locale === 'zh' ? '账号池与额度' : 'Account pool & quota')
  }
})

test('history axis spans full 24h/7d/30d and recent samples leave earlier time blank', async () => {
  const quota = { ...uiQuota(), history: async () => ({ ok: true, value: { points: [
    { ts: TEST_NOW - 3600, used: { weekly: 20 } }, { ts: TEST_NOW, used: { weekly: 30 } },
  ] } }) }
  const { draw } = await mountPanel(quota)
  openManagement(flatten(draw())); await settleDraw(draw)
  for (const hours of [24, 168, 720]) {
    let nodes = flatten(draw())
    nodes.find(node => node.props?.['data-quota-range'] === String(hours)).props.onClick()
    await settleDraw(draw); nodes = flatten(draw())
    const ticks = nodes.filter(node => node.props?.['data-quota-spark-tick']).map(node => node.props['data-quota-spark-tick-ts'])
    assert.deepEqual(ticks, [TEST_NOW - hours * 3600, TEST_NOW - hours * 1800, TEST_NOW])
    const line = nodes.find(node => node.type === 'polyline')
    const xs = line.props.points.split(' ').map(pair => Number(pair.split(',')[0]))
    assert.ok(Math.abs(xs[0] - (100 - 100 / hours)) < .002)
    assert.equal(xs[1], 100)
    const polygon = nodes.find(node => node.type === 'polygon')
    assert.equal(Number(polygon.props.points.split(',')[0]), xs[0], 'fill starts only at first actual sample')
    assert.equal(nodes.filter(node => node.props?.['data-quota-spark-cap']).length, 0)
    nodes.find(node => node.props?.['data-quota-spark-hit'] === '0').props.onMouseEnter()
    assert.match(flatten(draw()).find(node => node.props?.['data-quota-spark-tip']).props.children, /\d{2}-\d{2} \d{2}:\d{2}/u, 'hover keeps minute precision on 30d views')
  }
})

test('history filters and sorts timestamps, leaves gaps, and renders single or no samples honestly', async () => {
  let points = [
    { ts: TEST_NOW - 3600, used: { weekly: 21 } }, { ts: TEST_NOW - 9 * 3600, used: { weekly: 10 } },
    { ts: TEST_NOW, used: { weekly: 30 } }, { ts: TEST_NOW - 8 * 3600, used: { weekly: 11 } },
    { ts: TEST_NOW - 3600, used: { weekly: 22 } }, { ts: TEST_NOW + 1, used: { weekly: 99 } },
    { ts: TEST_NOW - 169 * 3600, used: { weekly: 99 } }, { ts: 'invalid', used: { weekly: 99 } },
  ]
  const quota = { ...uiQuota(), history: async () => ({ ok: true, value: { points } }) }
  const { draw } = await mountPanel(quota)
  openManagement(flatten(draw())); await settleDraw(draw)
  let nodes = flatten(draw())
  const lines = nodes.filter(node => node.type === 'polyline')
  assert.equal(lines.length, 2, 'missing hourly buckets split curves and fill into separate segments')
  const firstEnd = Number(lines[0].props.points.split(' ').at(-1).split(',')[0])
  const secondStart = Number(lines[1].props.points.split(' ')[0].split(',')[0])
  assert.ok(secondStart > firstEnd + 3)
  assert.deepEqual(nodes.filter(node => node.props?.['data-quota-spark-hit']).map(node => node.props['data-quota-spark-ts']), [TEST_NOW - 9 * 3600, TEST_NOW - 8 * 3600, TEST_NOW - 3600, TEST_NOW])
  points = [{ ts: TEST_NOW - 1800, used: { weekly: 42 } }]
  nodes.find(node => node.props?.['data-quota-refresh']).props.onClick(); await settleDraw(draw)
  nodes = flatten(draw())
  assert.equal(nodes.filter(node => node.type === 'polyline' || node.type === 'polygon').length, 0, 'single sample is not a fabricated line')
  assert.equal(nodes.filter(node => node.props?.['data-quota-spark-point']).length, 1)
  assert.equal(nodes.filter(node => node.props?.['data-quota-spark-hit']).length, 1)
  points = []
  nodes.find(node => node.props?.['data-quota-refresh']).props.onClick(); await settleDraw(draw)
  nodes = flatten(draw())
  assert.ok(nodes.find(node => node.props?.['data-quota-spark-empty']))
  assert.equal(nodes.filter(node => node.props?.['data-quota-spark-tick']).length, 3, 'empty history retains its full time frame')
})

test('history request generations reject stale success and stale failure across range switches', async () => {
  const requests = []
  const quota = { ...uiQuota(), history: request => new Promise(resolve => requests.push({ request, resolve })) }
  const { draw } = await mountPanel(quota)
  openManagement(flatten(draw())); await settleDraw(draw)
  assert.equal(requests[0].request.hours, 168)
  let nodes = flatten(draw())
  nodes.find(node => node.props?.['data-quota-range'] === '720').props.onClick()
  nodes = flatten(draw())
  requests[1].resolve({ ok: true, value: { points: [{ ts: TEST_NOW, used: { weekly: 72 } }] } }); await settleDraw(draw)
  requests[0].resolve({ ok: true, value: { points: [{ ts: TEST_NOW, used: { weekly: 16 } }] } }); await settleDraw(draw)
  nodes = flatten(draw())
  assert.equal(nodes.find(node => node.props?.['data-quota-spark-wrap']).props['data-quota-window-start'], TEST_NOW - 720 * 3600)
  assert.match(textOf(nodes.find(node => node.props?.['data-quota-spark-hit'])), /72%/u)
  nodes.find(node => node.props?.['data-quota-range'] === '168').props.onClick(); draw()
  nodes = flatten(draw())
  assert.ok(nodes.find(node => node.props?.['data-quota-spark-empty']), 'new range cannot borrow old range points')
  nodes.find(node => node.props?.['data-quota-range'] === '720').props.onClick(); draw()
  requests[3].resolve({ ok: true, value: { points: [{ ts: TEST_NOW, used: { weekly: 73 } }] } }); await settleDraw(draw)
  requests[2].resolve({ ok: false, error: { message: 'stale failure' } }); await settleDraw(draw)
  assert.match(textOf(flatten(draw()).find(node => node.props?.['data-quota-spark-hit'])), /73%/u)
})

test('rc.2 entry docks left of the native edit button via borrow-and-return, stays lazy with a body fallback', async () => {
  const source = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
  const containerCss = source.match(/\.provider-hub-pool-entry \{([^}]+)\}/u)?.[1]
  const buttonCss = source.match(/\.provider-hub-pool-entry > \.provider-hub-pool-action \{([^}]+)\}/u)?.[1]
  const dockedCss = source.match(/\.provider-hub-pool-action\[data-provider-pool-dock="row"\] \{([^}]+)\}/u)?.[1]
  assert.match(containerCss, /display:flex/u)
  assert.match(containerCss, /justify-content:flex-end/u)
  assert.match(buttonCss, /width:auto/u)
  assert.match(buttonCss, /max-width:100%/u)
  assert.match(buttonCss, /flex:0 1 auto/u)
  assert.match(buttonCss, /white-space:normal/u)
  assert.ok(dockedCss, 'a docked row variant of the action button exists')
  assert.match(dockedCss, /height:28px/u)
  assert.match(dockedCss, /white-space:nowrap/u)
  assert.doesNotMatch(`${containerCss} ${buttonCss} ${dockedCss}`, /position:|margin[^:]*:\s*-/u, 'no overlay or negative-margin fake header row')
  // Structural borrow-and-return: detect the native row without private class
  // hashes or observers, dock LEFT of the edit button, and always return the
  // node to its React-owned parent so unmounts stay clean. Detection failure
  // keeps the 0.7.1 body-position entry.
  assert.match(source, /closest\?\.\('li'\)/u, 'row detection stays structural')
  assert.match(source, /rowActions\.insertBefore\(node, editButton\)/u, 'docks before the native edit button')
  assert.match(source, /moved\.home\.appendChild\(moved\.node\)/u, 'cleanup returns the borrowed node home')
  assert.doesNotMatch(source, /createPortal|MutationObserver|zGbnIq_/u, 'no portal, observer or private Host class hash')
  for (const locale of ['zh', 'en']) for (const provider of ['openai-codex', 'zai', 'zai-coding-cn', 'kimi-coding', 'xiaomi-token-plan-cn']) {
    let probes = 0
    const quota = { ...uiQuota(), snapshot: async () => { probes++; return { ok: true, value: { status: 'signed-out' } } } }
    const { draw } = await mountPanel(quota, { provider, locale })
    await settleDraw(draw)
    let nodes = flatten(draw())
    const entry = nodes.find(node => node.props?.['data-provider-pool-entry'] === provider)
    assert.ok(entry)
    assert.equal(entry.props.className, 'provider-hub-pool-entry')
    const button = flatten(entry).find(node => node.props?.['data-provider-pool-fallback'] === provider)
    assert.equal(button.type, 'button')
    assert.equal(button.props.type, 'button')
    assert.match(button.props['aria-label'], new RegExp(provider, 'u'))
    assert.equal(button.props.title, button.props.children)
    assert.equal(button.props['aria-expanded'], false)
    assert.equal(probes, 0)
    assert.equal(nodes.filter(node => node.props?.['data-provider-pool-panel']).length, 0)
    button.props.onClick(); await settleDraw(draw)
    nodes = flatten(draw())
    const panel = nodes.find(node => node.props?.['data-provider-pool-panel'] === provider)
    assert.equal(button.props['aria-controls'], panel.props.id)
    assert.equal(panel.props.hidden, false)
    assert.equal(nodes.filter(node => node.props?.['data-provider-pool-entry']).length, 1)
    nodes.find(node => node.props?.['data-provider-pool-fallback']).props.onClick(); draw()
    assert.equal(flatten(draw()).find(node => node.props?.['data-provider-pool-panel']).props.hidden, true)
  }
})

test('an available header action stays lazy; absent action seats use the compact body entry', async () => {
  const calls = { login: 0, list: 0, sources: 0, snapshot: 0 }
  const options = { headerActions: true, buttonClassName: 'official-secondary-button',
    searchLogin: { list: async () => { calls.login++; return { ok: true, value: { entries: [{ key: 'llm-pi-ai/openai-codex', authorized: true }] } } } },
    accounts: { ...emptyAccounts(), list: async () => { calls.list++; return { ok: true, value: { entries: [] } } }, sources: async () => { calls.sources++; return { ok: true, value: { sources: [] } } } },
  }
  const quota = { ...uiQuota(), snapshot: async () => { calls.snapshot++; return { ok: true, value: { status: 'ok', snapshot: { windows: [] } } } } }
  const { draw, dependencies } = await mountPanel(quota, options)
  await settleDraw(draw)
  let nodes = flatten(draw())
  assert.equal(nodes.filter(node => node.props?.['data-provider-pool-action']).length, 1)
  assert.equal(nodes.filter(node => node.props?.['data-provider-pool-fallback']).length, 0, 'header mount effect suppresses body fallback after commit')
  assert.equal(nodes.filter(node => node.props?.['data-provider-pool-panel']).length, 0, 'no hidden wrapper or spacing changes the original body')
  assert.deepEqual(calls, { login: 0, list: 0, sources: 0, snapshot: 0 })
  const action = nodes.find(node => node.props?.['data-provider-pool-action'])
  assert.equal(action.props.className, 'official-secondary-button', 'the seam supplies the same class as official edit')
  assert.equal(action.props.children, '账号池与额度')
  action.props.onClick(); await settleDraw(draw)
  nodes = flatten(draw())
  const panel = nodes.find(node => node.props?.['data-provider-pool-panel'])
  assert.equal(panel.props.id, nodes.find(node => node.props?.['data-provider-pool-action']).props['aria-controls'])
  assert.equal(panel.props.hidden, false)
  assert.equal(nodes.filter(node => node.type === 'summary').length, 0, 'no extra outer fold bar')
  assert.deepEqual(calls, { login: 1, list: 1, sources: 0, snapshot: 1 }, 'opening management never starts CLI discovery')
  nodes.find(node => node.props?.['data-provider-pool-action']).props.onClick(); draw()
  assert.equal(flatten(draw()).find(node => node.props?.['data-provider-pool-panel']).props.style.display, 'none')
  nodes = flatten(draw()); nodes.find(node => node.props?.['data-provider-pool-action']).props.onClick(); await settleDraw(draw)
  assert.deepEqual(calls, { login: 1, list: 1, sources: 0, snapshot: 1 }, 'reopening preserves mounted authorization without scanning CLI sources')
  assert.ok(dependencies.some(deps => deps.length === 1 && deps[0] === 'uiWorkspace'))
  assert.ok(dependencies.some(deps => deps.includes('remote.codexAccounts') && !deps.includes('uiWorkspace')), 'directory service is an independent optional injection')
  options.headerActions = false; await settleDraw(draw)
  nodes = flatten(draw())
  assert.equal(nodes.filter(node => node.props?.['data-provider-pool-fallback']).length, 1, 'header unmount restores compatibility action')
})

test('unified account addition shares one optional name between browser and CLI methods', async () => {
  const imports = []
  const accounts = { ...emptyAccounts(), sources: async () => ({ ok: true, value: { defaultSourceId: 'codex-home', globalPath: '/host/.codex', sources: [
    { id: 'gth', label: 'GTH', path: '/host/gth', available: true, status: 'ready' },
    { id: 'codex-home', default: true, label: 'Default', path: '/host/.codex', available: false, status: 'missing' },
  ] } }), import: async request => { imports.push(request); return { ok: true, value: {} } } }
  const { draw } = await mountPanel(uiQuota(), { accounts })
  openManagement(flatten(draw())); await settleDraw(draw)
  let nodes = await openAdd(draw, 'web', 'Shared display name')
  assert.equal(nodes.filter(node => node.type === 'input' && node.props.name === 'accountName').length, 1)
  assert.ok(!textOf(nodes).includes('方式一'))
  nodes.find(node => node.props?.['data-codex-add-method'] === 'cli').props.onClick(); await settleDraw(draw); nodes = flatten(draw())
  assert.equal(nodes.find(node => node.type === 'input' && node.props.name === 'accountName').props.value, 'Shared display name')
  assert.equal(nodes.find(node => node.props?.['data-codex-source-select']).props['data-selected-id'], 'gth', 'an importable source takes priority over an unusable default')
  assert.equal(nodes.find(node => node.props?.['data-codex-source-path']).props.children, '/host/gth')
  assert.equal(nodes.find(node => node.props?.['data-codex-action'] === 'import').props.disabled, false)
  chooseAccount(draw, 'codex-source', 'gth'); nodes = flatten(draw())
  await nodes.find(node => node.props?.['data-codex-import']).props.onSubmit(formEvent({}))
  assert.deepEqual(imports.map(value => ({ ...value })), [{ source: 'gth', name: 'Shared display name' }])
})

test('Host directory browser shows hidden directories, confirms only chosen Host paths and cancels without changing sources', async () => {
  const calls = { browse: [], sources: [], signals: [] }
  const workspace = { listDirectory: async (path, signal) => {
    calls.browse.push(path); calls.signals.push(signal)
    return path ? { path, home: '/host', crumbs: [{ name: 'Home', path: '/host' }], entries: [] } : { path: '/host', home: '/host', crumbs: [{ name: 'Home', path: '/host' }], entries: [{ name: '.codex', path: '/host/.codex', hidden: true }, { name: 'Windows account', path: 'C:\\Users\\Test\\.codex' }] }
  } }
  const accounts = { ...emptyAccounts(), sources: async request => { calls.sources.push(request); return { ok: true, value: { sources: [{ id: request.directory ? 'directory' : 'codex', label: 'Default', path: request.directory || '/host/.codex', available: true, status: 'ready' }] } } } }
  const { draw } = await mountPanel(uiQuota(), { accounts, workspace })
  openManagement(flatten(draw())); await settleDraw(draw)
  let nodes = await openAdd(draw, 'cli')
  nodes.find(node => node.props?.['data-codex-action'] === 'browse').props.onClick(); await settleDraw(draw)
  nodes = flatten(draw())
  assert.deepEqual(calls.browse, [undefined], 'browsing begins from Host home, not an invented local browser path')
  assert.ok(nodes.find(node => node.props?.['data-directory-entry'] === '/host/.codex'), 'hidden .codex stays visible')
  nodes.find(node => node.props?.['data-directory-entry'] === 'C:\\Users\\Test\\.codex').props.onClick(); await settleDraw(draw)
  nodes = flatten(draw())
  assert.equal(nodes.find(node => node.props?.['data-directory-path']).props.children, 'C:\\Users\\Test\\.codex')
  const before = calls.sources.length
  nodes.find(node => node.props?.['data-directory-action'] === 'cancel').props.onClick(); draw()
  assert.equal(calls.signals.at(-1).aborted, true, 'closing propagates cancellation to the Host directory request')
  assert.equal(calls.sources.length, before)
  nodes = flatten(draw()); nodes.find(node => node.props?.['data-codex-action'] === 'browse').props.onClick(); await settleDraw(draw)
  nodes = flatten(draw()); nodes.find(node => node.props?.['data-directory-entry'] === '/host/.codex').props.onClick(); await settleDraw(draw)
  nodes = flatten(draw()); nodes.find(node => node.props?.['data-directory-action'] === 'select').props.onClick(); await settleDraw(draw)
  assert.deepEqual({ ...calls.sources.at(-1) }, { directory: '/host/.codex' })
  nodes = flatten(draw())
  nodes.find(node => node.type === 'input' && node.props.name === 'directory').props.onChange({ target: { value: 'D:\\Codex Home' } }); nodes = flatten(draw())
  await nodes.find(node => node.props?.['data-codex-directory']).props.onSubmit(formEvent({}))
  assert.deepEqual({ ...calls.sources.at(-1) }, { directory: 'D:\\Codex Home' }, 'Windows input is sent to Host for validation and normalization')
})

test('manual directory controls never inherit muted text and an empty path never triggers discovery', async () => {
  let scans = 0
  const accounts = { ...emptyAccounts(), sources: async () => { scans++; return { ok: true, value: { sources: [{ id: 'codex', path: '/host/.codex', available: true, status: 'ready' }] } } } }
  const { draw } = await mountPanel(uiQuota(), { accounts, workspace: { listDirectory: async () => ({ path: '/host', entries: [] }) } })
  openManagement(flatten(draw())); await settleDraw(draw)
  let nodes = await openAdd(draw, 'cli')
  const manual = nodes.find(node => node.props?.['data-codex-manual-path'])
  assert.ok(!manual.props.className?.includes('ph-muted'), 'a disclosure containing controls is not muted copy')
  const details = nodes.find(node => node.props?.['data-codex-source-details'])
  assert.ok(!details.props.className.includes('ph-muted'))
  assert.equal(nodes.find(node => node.props?.['data-codex-source-status']).props['data-tone'], 'success')
  assert.ok(flatten(manual).some(node => node.props?.className === 'ph-manual-body'))
  assert.equal(nodes.find(node => node.props?.['data-codex-action'] === 'sources').props.disabled, true)
  const before = scans
  await nodes.find(node => node.props?.['data-codex-directory']).props.onSubmit(formEvent({}))
  assert.equal(scans, before, 'blank manual submit does not rerun a generic scan')
  nodes.find(node => node.type === 'input' && node.props.name === 'directory').props.onChange({ target: { value: '   ' } })
  nodes = flatten(draw())
  assert.equal(nodes.find(node => node.props?.['data-codex-action'] === 'sources').props.disabled, true)
})

test('directory browsing announces loading and empty states, retries the failed path and restores cancel focus', async () => {
  let finish
  let denied = true
  const paths = []
  const workspace = { listDirectory: async path => {
    paths.push(path)
    if (!path) return new Promise(resolve => { finish = resolve })
    if (denied) throw new Error('synthetic access denied')
    return { path, crumbs: [{ name: 'host', path: '/host' }, { name: 'empty', path }], entries: [] }
  } }
  const { draw } = await mountPanel(uiQuota(), { workspace })
  openManagement(flatten(draw())); await settleDraw(draw)
  let nodes = await openAdd(draw, 'cli')
  nodes.find(node => node.props?.['data-codex-action'] === 'browse').props.onClick()
  draw(); nodes = flatten(draw())
  assert.equal(nodes.find(node => node.props?.['data-directory-loading']).props.role, 'status')
  assert.equal(nodes.find(node => node.props?.['data-directory-action'] === 'select').props.disabled, true)
  finish({ path: '/host', crumbs: [{ name: 'host', path: '/host' }], entries: [{ name: 'empty', path: '/host/empty' }] })
  await settleDraw(draw); nodes = flatten(draw())
  assert.equal(nodes.find(node => node.props?.['aria-current'] === 'page').props.title, '/host')
  assert.ok(flatten(nodes.find(node => node.props?.['data-directory-entry'])).some(node => node.type === 'svg'), 'directory affordance uses a folder icon')
  await nodes.find(node => node.props?.['data-directory-entry']).props.onClick()
  nodes = flatten(draw())
  assert.match(textOf(nodes.find(node => node.props?.['data-directory-error'])), /synthetic access denied/)
  denied = false
  await nodes.find(node => node.props?.['data-directory-action'] === 'retry').props.onClick()
  nodes = flatten(draw())
  assert.deepEqual(paths, [undefined, '/host/empty', '/host/empty'], 'retry targets the directory that failed, not its parent')
  assert.equal(nodes.find(node => node.props?.['data-directory-empty']).props.role, 'status')
  assert.equal(nodes.find(node => node.props?.['data-directory-action'] === 'select').props.disabled, false, 'empty directories can still be selected')
  let prevented = false
  nodes.find(node => node.props?.['data-directory-browser']).props.onKeyDown({ key: 'Escape', preventDefault() { prevented = true }, stopPropagation() {} })
  const tree = draw(); nodes = flatten(tree)
  assert.equal(prevented, true)
  assert.ok(!nodes.some(node => node.props?.['data-directory-browser']))
  assert.equal(nodes.find(node => node.props?.['data-codex-action'] === 'browse').focused, 1, 'cancel restores focus after the browser closes')
})

test('directory native-picker fallback is limited to the declared unavailable capability', async () => {
  let picks = 0
  const calls = []
  const workspace = { listDirectory: async () => { throw { rpcError: { code: 'directory-picker/unavailable', details: { capability: 'native' } } } }, pickDirectory: async () => { picks++; return 'C:\\Codex' } }
  const accounts = { ...emptyAccounts(), sources: async request => { calls.push(request); return { ok: true, value: { sources: [] } } } }
  const { draw } = await mountPanel(uiQuota(), { workspace, accounts })
  openManagement(flatten(draw())); await settleDraw(draw)
  let nodes = await openAdd(draw, 'cli')
  nodes.find(node => node.props?.['data-codex-action'] === 'browse').props.onClick(); await settleDraw(draw)
  assert.equal(picks, 1)
  assert.deepEqual({ ...calls.at(-1) }, { directory: 'C:\\Codex' })
  workspace.listDirectory = async () => { throw new Error('synthetic host read denied') }
  nodes = flatten(draw()); nodes.find(node => node.props?.['data-codex-action'] === 'browse').props.onClick(); await settleDraw(draw)
  nodes = flatten(draw())
  assert.equal(picks, 1, 'ordinary errors must not silently invoke native picker')
  assert.match(textOf(nodes.find(node => node.props?.['data-directory-error'])), /synthetic host read denied/u)
})

test('one selected preview waits for pool loading and ignores stale selection responses without activation', async () => {
  for (const kind of ['pool', 'codex']) {
    let finishList
    const entries = [{ id: 'active', name: 'Active', active: true }, { id: 'preview', name: 'Preview', active: false }]
    const calls = { snapshot: [], history: [], use: [] }
    let finishPreview
    const service = { ...(kind === 'pool' ? emptyPool() : emptyAccounts()), list: () => new Promise(resolve => { finishList = resolve }), setActive: async request => { calls.use.push(request); return { ok: true, value: {} } } }
    const quota = {
      snapshot: async request => {
        calls.snapshot.push(request)
        const id = kind === 'pool' ? request.keyId : request.grantId
        if (id === 'preview') return await new Promise(resolve => { finishPreview = resolve })
        return { ok: true, value: { status: 'ok', snapshot: { email: `${id || 'official'}@example.test`, windows: [] } } }
      },
      history: async request => { calls.history.push(request); return { ok: true, value: { points: [] } } },
    }
    const { draw } = await mountPanel(quota, kind === 'pool' ? { provider: 'kimi-coding', pool: service, keyConfigured: true } : { accounts: service })
    openManagement(flatten(draw())); await settleDraw(draw)
    assert.equal(calls.snapshot.length, 0, 'official fallback cannot probe while list is unresolved')
    finishList({ ok: true, value: { entries } }); await settleDraw(draw)
    let nodes = flatten(draw())
    assert.equal(calls.snapshot.length, 1, 'loaded active entry triggers exactly one probe')
    assert.equal(nodes.filter(node => node.props?.['data-quota-section']).length, 1)
    if (kind === 'pool') assert.equal(nodes.find(node => node.props?.['data-quota-email']).props.children, 'active@example.test')
    else { assert.equal(nodes.find(node => node.props?.['data-codex-select']).props['data-selected-id'], 'active'); assert.equal(calls.snapshot.at(-1).grantId, 'active'); assert.ok(!nodes.some(node => node.props?.['data-quota-email'])) }
    chooseAccount(draw, kind, 'preview'); await settleDraw(draw)
    nodes = flatten(draw())
    assert.equal(nodes.filter(node => node.props?.['data-quota-section']).length, 1)
    assert.ok(!nodes.some(node => node.props?.['data-quota-email']), 'old account identity is not carried into pending preview')
    assert.equal(kind === 'pool' ? calls.snapshot.at(-1).keyId : calls.snapshot.at(-1).grantId, 'preview')
    chooseAccount(draw, kind, 'active'); await settleDraw(draw)
    finishPreview({ ok: true, value: { status: 'ok', snapshot: { email: 'stale-preview@example.test', windows: [] } } }); await settleDraw(draw)
    nodes = flatten(draw())
    if (kind === 'pool') assert.equal(nodes.find(node => node.props?.['data-quota-email']).props.children, 'active@example.test')
    else { assert.equal(nodes.find(node => node.props?.['data-codex-select']).props['data-selected-id'], 'active'); assert.equal(calls.snapshot.at(-1).grantId, 'active'); assert.ok(!nodes.some(node => node.props?.['data-quota-email'])) }
    assert.equal(calls.use.length, 0)
    assert.ok(calls.history.every(request => (kind === 'pool' ? request.keyId : request.grantId) === 'active'), 'unmounted stale snapshots cannot launch another account history probe')
    const bar = nodes.find(node => node.props?.[`data-${kind === 'pool' ? 'pool' : 'codex'}-bar`])
    assert.equal(bar.props.children.length, 2, 'picker and its provider-specific toolbar are direct siblings in one bar')
    assert.deepEqual(flatten(bar).filter(node => node.props?.[`data-${kind}-action`]).map(node => node.props[`data-${kind}-action`]), kind === 'pool' ? ['use'] : [])
    if (kind === 'codex') assert.ok(flatten(bar).some(node => node.props?.['data-codex-add']))
  }
})

test('empty loaded pools fall back to one official quota only when a credential is configured', async () => {
  for (const provider of ['openai-codex', 'kimi-coding']) {
    const requests = []
    const quota = { ...uiQuota(), snapshot: async request => { requests.push(request); return { ok: true, value: { status: 'ok', snapshot: { windows: [] } } } } }
    const { draw } = await mountPanel(quota, { provider, keyConfigured: true })
    openManagement(flatten(draw())); await settleDraw(draw)
    assert.equal(requests.length, 1)
    assert.equal(requests[0].keyId, undefined)
    assert.equal(requests[0].grantId, undefined)
    assert.equal(flatten(draw()).filter(node => node.props?.['data-quota-section']).length, 1)
  }
  const requests = []
  const quota = { ...uiQuota(), snapshot: async request => { requests.push(request); return { ok: true, value: {} } } }
  const { draw } = await mountPanel(quota, { provider: 'kimi-coding', keyConfigured: false })
  openManagement(flatten(draw())); await settleDraw(draw)
  assert.equal(requests.length, 0)
})

test('row deletion is scoped, guarded, error-visible, and falls back after deleting the selected account', async () => {
  for (const kind of ['pool', 'codex']) {
    const entries = [{ id: 'active', name: 'Active', active: true }, { id: 'selected', name: 'Selected' }, { id: 'other', name: 'Other' }]
    const calls = { drop: [], use: [] }
    let finishDrop
    const service = { ...(kind === 'pool' ? emptyPool() : emptyAccounts()), list: async () => ({ ok: true, value: { entries: [...entries] } }), drop: async request => { calls.drop.push(request); return await new Promise(resolve => { finishDrop = resolve }) }, setActive: async request => { calls.use.push(request); return { ok: true, value: {} } } }
    const { draw } = await mountPanel(uiQuota(), kind === 'pool' ? { provider: 'kimi-coding', pool: service, keyConfigured: true } : { accounts: service })
    openManagement(flatten(draw())); await settleDraw(draw)
    chooseAccount(draw, kind, 'selected'); await settleDraw(draw)
    let nodes = openPicker(draw, kind)
    const otherRow = nodes.find(node => node.props?.['data-account-row'] === 'other')
    assert.equal(flatten(otherRow).filter(node => node.type === 'button').length, 3, 'choice, rename and drop are sibling row actions')
    const drop = flatten(otherRow).find(node => node.props?.['data-account-drop']).props.onClick
    let stopped = 0
    const pending = drop({ stopPropagation() { stopped++ } })
    await drop({ stopPropagation() { stopped++ } })
    assert.equal(calls.drop.length, 1)
    assert.equal(stopped, 2)
    nodes = flatten(draw())
    assert.ok(nodes.filter(node => node.props?.['data-account-drop']).every(node => node.props.disabled))
    assert.equal(nodes.find(node => node.props?.[`data-${kind}-select`]).props['data-selected-id'], 'selected', 'drop never selects the clicked row')
    finishDrop({ ok: false, error: { message: 'synthetic remove denied' } }); await pending
    nodes = flatten(draw())
    assert.match(textOf(nodes.find(node => node.props?.role === 'alert')), /(?:删除失败|删除账号失败).*synthetic remove denied/u)
    assert.equal(calls.use.length, 0)
    nodes = openPicker(draw, kind)
    const removeSelected = nodes.find(node => node.props?.['data-account-drop'] === 'selected').props.onClick
    const removing = removeSelected({ stopPropagation() {} })
    entries.splice(1, 1)
    finishDrop({ ok: true, value: {} }); await removing; await settleDraw(draw)
    nodes = flatten(draw())
    assert.equal(nodes.find(node => node.props?.[`data-${kind}-select`]).props['data-selected-id'], 'active', 'deleted selected item falls back to active before first')
    assert.equal(nodes.filter(node => node.props?.['data-quota-section']).length, 1)
    nodes = openPicker(draw, kind)
    const currentDrop = nodes.find(node => node.props?.['data-account-drop'] === 'active')
    assert.equal(currentDrop.props.disabled, kind === 'codex')
    if (kind === 'codex') {
      await currentDrop.props.onClick({ stopPropagation() {} })
      assert.equal(calls.drop.length, 2, 'stale callbacks cannot delete the current Codex grant')
    }
    assert.equal(calls.use.length, 0)
  }
})

test('explicit unsupported quota and Xiaomi omit all history RPCs, polling, controls and graphs', async () => {
  for (const provider of ['xiaomi-token-plan-cn', 'zai']) {
    const before = vmTimerId
    let history = 0
    const quota = { snapshot: async () => ({ ok: true, value: { status: 'unsupported', message: 'synthetic console-only quota', helpUrl: 'https://example.test/console', lastSnapshot: { windows: [{ kind: 'weekly', usedPercent: 20 }] } } }), history: async () => { history++; return { ok: true, value: { points: [] } } } }
    const { draw } = await mountPanel(quota, { provider, keyConfigured: true })
    openManagement(flatten(draw())); await settleDraw(draw)
    let nodes = flatten(draw())
    assert.equal(history, 0)
    assert.equal(vmTimers.filter(timer => timer.id > before && timer.interval).length, 0, 'unsupported has no history interval at all')
    assert.ok(nodes.find(node => node.props?.['data-quota-help']))
    assert.match(textOf(nodes.find(node => node.props?.['data-quota-notice'])), /synthetic console-only quota/u)
    assert.ok(!nodes.some(node => node.props?.['data-quota-range'] || node.props?.['data-quota-spark-axis'] || node.props?.['data-quota-spark-empty'] || node.props?.['data-quota-window']))
    assert.ok(!textOf(nodes).includes('用量历史'))
    nodes.find(node => node.props?.['data-quota-refresh']).props.onClick(); await settleDraw(draw)
    assert.equal(history, 0)
  }
  for (const status of ['network', 'signed-out', 'expired']) {
    let history = 0
    const quota = { snapshot: async () => ({ ok: true, value: { status } }), history: async () => { history++; return { ok: true, value: { points: [] } } } }
    const { draw } = await mountPanel(quota, { provider: 'zai', keyConfigured: true })
    openManagement(flatten(draw())); await settleDraw(draw)
    assert.equal(history, 1, `${status} is recoverable, not unsupported`)
    assert.equal(flatten(draw()).filter(node => node.props?.['data-quota-range']).length, 3)
  }
})

test('cadence gaps use elapsed seconds and per-point sampling metadata rather than hour buckets or current config', async () => {
  let points = []
  let currentCadence = 86400
  const quota = { ...uiQuota(), history: async () => ({ ok: true, value: { points, sampleIntervalSeconds: currentCadence } }) }
  const { draw } = await mountPanel(quota)
  openManagement(flatten(draw())); await settleDraw(draw)
  const hourBase = Math.floor(TEST_NOW / 3600) * 3600 - 12 * 3600
  for (const scenario of [
    { minutes: 63, expected: 1 }, { minutes: 64, expected: 1 }, { minutes: 91, expected: 0 }, { minutes: 120, expected: 0 },
    { minutes: 120, interval: 7200, expected: 1 }, { minutes: 179, interval: 7200, expected: 1 }, { minutes: 181, interval: 7200, expected: 0 },
    { minutes: 64, interval: 60, expected: 1 }, { minutes: 91, interval: 60, expected: 0 },
  ]) {
    const first = hourBase + 59 * 60
    points = [{ ts: first, used: { weekly: 10 } }, { ts: first + scenario.minutes * 60, used: { weekly: 20 } }].map(point => ({ ...point, ...(scenario.interval ? { sampleIntervalSeconds: scenario.interval } : {}) }))
    let nodes = flatten(draw())
    nodes.find(node => node.props?.['data-quota-refresh']).props.onClick(); await settleDraw(draw)
    nodes = flatten(draw())
    assert.equal(nodes.filter(node => node.type === 'polyline').length, scenario.expected, `${scenario.minutes}min elapsed at ${scenario.interval || 'legacy'} cadence`)
    assert.equal(nodes.find(node => node.props?.['data-quota-spark-wrap']).props['data-quota-sample-interval'], currentCadence, 'current config is preserved atomically as metadata, not applied retroactively to old samples')
    assert.equal(nodes.filter(node => node.props?.['data-quota-spark-point']).length, scenario.expected ? 0 : 2)
  }
})

test('ZAI regional account forms isolate personal and per-account team scopes without leaking to other providers', async () => {
  for (const provider of ['zai', 'zai-coding-cn']) {
    const requests = []
    const pool = { ...emptyPool(), add: async request => { requests.push(request); return { ok: true, value: {} } }, list: async () => ({ ok: true, value: { entries: [{ id: 'team', name: 'Work', accountType: 'team', organization: 'org-safe', project: 'project-safe', active: true }] } }) }
    const { draw } = await mountPanel(uiQuota(), { provider, pool, keyConfigured: true })
    openManagement(flatten(draw())); await settleDraw(draw)
    let nodes = flatten(draw())
    assert.equal(nodes.filter(node => node.props?.['data-pool-type']).length, 2)
    assert.equal(nodes.find(node => node.props?.['data-pool-type'] === 'personal').props['aria-pressed'], true)
    assert.ok(!nodes.some(node => node.type === 'input' && ['organization', 'project'].includes(node.props.name)))
    nodes.find(node => node.props?.['data-pool-type'] === 'team').props.onClick(); nodes = flatten(draw())
    for (const name of ['organization', 'project']) assert.equal(nodes.find(node => node.type === 'input' && node.props.name === name).props.required, true)
    let form = nodes.find(node => node.props?.['data-pool-add'])
    await form.props.onSubmit(formEvent({ name: { value: 'Team' }, value: { value: 'synthetic-secret' }, organization: { value: ' org-id ' }, project: { value: '' } }))
    assert.equal(requests.length, 0, 'team scope pair is validated even outside native HTML form validation')
    nodes = flatten(draw())
    assert.match(textOf(nodes.find(node => node.props?.role === 'alert')), /Organization ID.*Project ID/u)
    form = nodes.find(node => node.props?.['data-pool-add'])
    await form.props.onSubmit(formEvent({ name: { value: 'Team' }, value: { value: 'synthetic-secret' }, organization: { value: ' org-id ' }, project: { value: ' project-id ' } }))
    assert.deepEqual({ ...requests.at(-1) }, { provider, name: 'Team', value: 'synthetic-secret', accountType: 'team', organization: 'org-id', project: 'project-id' })
    nodes = flatten(draw()); nodes.find(node => node.props?.['data-pool-type'] === 'personal').props.onClick(); nodes = flatten(draw())
    assert.ok(!nodes.some(node => node.type === 'input' && ['organization', 'project'].includes(node.props.name)))
    await nodes.find(node => node.props?.['data-pool-add']).props.onSubmit(formEvent({ name: { value: 'Personal' }, value: { value: 'synthetic-secret' }, organization: { value: 'stale-org' }, project: { value: 'stale-project' } }))
    assert.deepEqual({ ...requests.at(-1) }, { provider, name: 'Personal', value: 'synthetic-secret', accountType: 'personal' })
    nodes = openPicker(draw, 'pool')
    assert.match(textOf(nodes.find(node => node.props?.['data-account-team'])), /团队账号/u)
    assert.ok(!JSON.stringify(nodes).includes('synthetic-secret'))
  }
  const requests = []
  const pool = { ...emptyPool(), add: async request => { requests.push(request); return { ok: true, value: {} } } }
  const { draw } = await mountPanel(uiQuota(), { provider: 'kimi-coding', pool })
  openManagement(flatten(draw())); await settleDraw(draw)
  const nodes = flatten(draw())
  assert.ok(!nodes.some(node => node.props?.['data-pool-account-type']))
  await nodes.find(node => node.props?.['data-pool-add']).props.onSubmit(formEvent({ name: { value: 'Generic' }, value: { value: 'synthetic-secret' }, organization: { value: 'unused' }, project: { value: 'unused' } }))
  assert.deepEqual({ ...requests.at(-1) }, { provider: 'kimi-coding', name: 'Generic', value: 'synthetic-secret' })
})

test('account-name placeholders are generic in both locales and retain real existing account names', async () => {
  const source = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
  assert.ok(!/zai-gsj|vickie|codex-gth/iu.test(source), 'plugin copy has no personal examples or obsolete hardcoded launcher labels')
  for (const locale of ['zh', 'en']) {
    const pool = { ...emptyPool(), list: async () => ({ ok: true, value: { entries: [{ id: 'real', name: 'Existing user-provided name', active: true }] } }) }
    const { draw } = await mountPanel(uiQuota(), { provider: 'zai', pool, locale })
    openManagement(flatten(draw())); await settleDraw(draw)
    const nodes = flatten(draw())
    assert.equal(nodes.find(node => node.type === 'input' && node.props.name === 'name').props.placeholder, locale === 'zh' ? '例如：工作账号' : 'e.g. Work account')
    assert.ok(textOf(nodes).includes('Existing user-provided name'))
    const codex = await mountPanel(uiQuota(), { locale })
    openManagement(flatten(codex.draw())); await settleDraw(codex.draw)
    const add = await openAdd(codex.draw, 'web')
    assert.equal(add.find(node => node.type === 'input' && node.props.name === 'accountName').props.placeholder, locale === 'zh' ? '例如：工作账号' : 'e.g. Work account')
  }
})

test('history exposes fixed 0/50/100 percent ticks and bounded key values at their actual sample coordinates', async () => {
  const values = [5, 90, 20, 2, 55, 45]
  const points = values.map((value, index) => ({ ts: TEST_NOW - (6 - index) * 86400, used: { weekly: value }, plan: index < 4 ? 'pro' : 'plus', sampleIntervalSeconds: 86400 }))
  const quota = { ...uiQuota(), history: async () => ({ ok: true, value: { points } }) }
  const { draw } = await mountPanel(quota)
  openManagement(flatten(draw())); await settleDraw(draw)
  const nodes = flatten(draw())
  const ticks = nodes.filter(node => node.props?.['data-quota-spark-y-tick'])
  assert.deepEqual(ticks.map(node => node.props.children), ['100%', '50%', '0%'])
  assert.deepEqual(ticks.map(node => node.props['data-quota-spark-y-tick']), ['100', '50', '0'])
  const labels = nodes.filter(node => node.props?.['data-quota-spark-value'])
  assert.equal(labels.length, 6, 'first/last, min/max, reset and plan change are a bounded selection, not every sample')
  assert.deepEqual(labels.map(node => node.props.children), ['5%', '45%', '2%', '90%', '20%', '55%'])
  assert.deepEqual(labels.map(node => node.props['data-quota-spark-value-reason']), ['first', 'last', 'min', 'max', 'reset', 'plan'])
  for (const label of labels) {
    assert.equal(label.type, 'span', 'sample values are visible content rather than hover-only titles')
    const point = points.find(point => point.ts === label.props['data-quota-spark-value'])
    const expectedX = ((point.ts - (TEST_NOW - 168 * 3600)) / (168 * 3600)) * 100
    assert.equal(label.props['data-quota-spark-value-x'], expectedX)
    assert.equal(label.props.style.left, `${expectedX}%`)
    const leader = nodes.find(node => node.props?.['data-quota-spark-label-leader'] === point.ts)
    assert.ok(Math.abs(Number(leader.props.x1) - expectedX) < .001)
    assert.equal(leader.props.x1, leader.props.x2, 'labels never create a horizontal line across unknown history')
    const dot = nodes.find(node => node.props?.['data-quota-spark-label-point'] === point.ts)
    assert.equal(dot.props.cx, leader.props.x1)
    const pointY = Number(dot.props.cy) * 3
    const labelTop = parseFloat(label.props.style.top)
    assert.ok(pointY < labelTop - 3 || pointY > labelTop + 19, 'value box leaves its actual sample marker visible')
  }
  assert.ok(labels[0].props['data-quota-spark-value-x'] > 0, 'first observed value is not pasted onto the empty window boundary')
  assert.ok(labels[1].props['data-quota-spark-value-x'] < 100, 'last observed value is not extrapolated to now')
  assert.equal(nodes.filter(node => node.props?.['data-quota-spark-cap']).length, 0)
})

test('dense right-edge histories keep endpoint values readable without overlapping labels on narrow 7d and 30d charts', async () => {
  const points = Array.from({ length: 137 }, (_, index) => ({ ts: TEST_NOW - 1800 + index * 10, used: { weekly: index === 30 ? 98 : index === 100 ? 1 : 40 + index % 10 }, plan: index < 70 ? 'pro' : 'plus' }))
  const quota = { ...uiQuota(), history: async () => ({ ok: true, value: { points } }) }
  for (const chartWidth of [120, 240, 480]) {
    const { draw } = await mountPanel(quota, { chartWidth })
    openManagement(flatten(draw())); await settleDraw(draw)
    for (const range of [168, 720]) {
      let nodes = flatten(draw())
      nodes.find(node => node.props?.['data-quota-range'] === String(range)).props.onClick(); await settleDraw(draw)
      nodes = flatten(draw())
      const labels = nodes.filter(node => node.props?.['data-quota-spark-value'])
      assert.ok(labels.length >= 2 && labels.length <= 6, 'labels remain bounded even with 137 samples')
      assert.equal(labels[0].props['data-quota-spark-value'], points[0].ts)
      assert.equal(labels[1].props['data-quota-spark-value'], points.at(-1).ts, 'first and last samples win collision priority')
      assert.equal(labels[0].props.children, '40%')
      assert.equal(labels[1].props.children, '46%')
      const boxes = labels.map(label => {
        const x = label.props['data-quota-spark-value-x'] * chartWidth / 100
        assert.equal(label.props.style.left, `${label.props['data-quota-spark-value-x']}%`, 'every label anchor remains at its real time position')
        const left = x + parseFloat(label.props.style.marginLeft)
        const width = parseFloat(label.props.style.width)
        const top = parseFloat(label.props.style.top)
        assert.ok(left >= -.001 && left + width <= chartWidth + .001, 'edge-aligned label stays inside the measured plot')
        assert.ok(top >= 0 && top + 16 <= 72, 'vertical lanes stay within the readable plot height')
        return { left, right: left + width, top, bottom: top + 16 }
      })
      for (let left = 0; left < boxes.length; left++) for (let right = left + 1; right < boxes.length; right++) {
        const a = boxes[left], b = boxes[right]
        assert.ok(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top, 'numeric value boxes never collide')
      }
      assert.equal(nodes.filter(node => node.props?.['data-quota-spark-hit']).length, 137, 'unlabelled samples retain full hover detail')
      assert.equal(nodes.filter(node => node.props?.['data-quota-spark-y-tick']).length, 3)
    }
  }
})

test('single-point and empty histories keep fixed axes without fabricated endpoint labels or lines', async () => {
  let points = [{ ts: TEST_NOW - 90 * 60, used: { weekly: 37 } }]
  const quota = { ...uiQuota(), history: async () => ({ ok: true, value: { points } }) }
  const { draw } = await mountPanel(quota)
  openManagement(flatten(draw())); await settleDraw(draw)
  let nodes = flatten(draw())
  const labels = nodes.filter(node => node.props?.['data-quota-spark-value'])
  assert.equal(labels.length, 1, 'one observation gets one visible label, not two invented endpoints')
  assert.equal(labels[0].props.children, '37%')
  assert.equal(labels[0].props['data-quota-spark-value'], points[0].ts)
  assert.equal(nodes.filter(node => node.props?.['data-quota-spark-point']).length, 1)
  assert.equal(nodes.filter(node => node.type === 'polyline' || node.type === 'polygon').length, 0)
  points = [{ ts: TEST_NOW + 60, used: { weekly: 98 } }, { ts: TEST_NOW - 169 * 3600, used: { weekly: 99 } }]
  nodes.find(node => node.props?.['data-quota-refresh']).props.onClick(); await settleDraw(draw)
  nodes = flatten(draw())
  assert.equal(nodes.filter(node => node.props?.['data-quota-spark-value']).length, 0, 'future and out-of-window samples cannot invent visible values')
  assert.equal(nodes.filter(node => node.props?.['data-quota-spark-label-point']).length, 0)
  assert.equal(nodes.filter(node => node.props?.['data-quota-spark-y-tick']).length, 3, 'fixed scale remains available without data')
  assert.equal(nodes.filter(node => node.props?.['data-quota-spark-tick']).length, 3)
  assert.ok(nodes.find(node => node.props?.['data-quota-spark-empty']))
})

function openPicker(draw, kind) {
  let nodes = flatten(draw())
  const trigger = nodes.find(node => node.props?.[`data-${kind}-select`])
  if (!trigger.props['aria-expanded']) trigger.props.onClick()
  return flatten(draw())
}
function chooseAccount(draw, kind, id) {
  const nodes = openPicker(draw, kind)
  nodes.find(node => node.props?.['data-account-choice'] === id).props.onClick()
  return flatten(draw())
}
function startRename(draw, kind, id, name) {
  let nodes = openPicker(draw, kind)
  nodes.find(node => node.props?.['data-account-rename'] === id).props.onClick({ stopPropagation() {} })
  nodes = flatten(draw())
  if (name !== undefined) nodes.find(node => node.props?.[`data-${kind}-rename`] === id).props.children[0].props.onChange({ target: { value: name } })
  return flatten(draw())
}

async function openAdd(draw, method = 'web', name = '') {
  let nodes = flatten(draw())
  const add = nodes.find(node => node.props?.['data-codex-add'])
  if (!add.props['aria-expanded']) add.props.onClick()
  nodes = flatten(draw())
  nodes.find(node => node.props?.['data-codex-add-method'] === method).props.onClick()
  nodes = flatten(draw())
  nodes.find(node => node.type === 'input' && node.props.name === 'accountName').props.onChange({ target: { value: name } })
  await settleDraw(draw)
  return flatten(draw())
}

async function dropAccount(draw, kind, id) {
  const nodes = openPicker(draw, kind)
  return await nodes.find(node => node.props?.['data-account-drop'] === id).props.onClick({ stopPropagation() {} })
}

test('Codex addition stays beside selection and scans only when CLI import is opened', async () => {
  let scans = 0
  const accounts = { ...emptyAccounts(), list: async () => ({ ok: true, value: { entries: [{ id: 'current', name: 'Current', active: true }] } }), sources: async () => { scans++; return { ok: true, value: { sources: [] } } } }
  const { draw } = await mountPanel(uiQuota(), { accounts })
  openManagement(flatten(draw())); await settleDraw(draw)
  let nodes = flatten(draw())
  assert.equal(scans, 0)
  const bar = nodes.find(node => node.props?.['data-codex-bar'])
  assert.ok(flatten(bar).some(node => node.props?.['data-codex-add']))
  assert.ok(flatten(bar).some(node => node.props?.['data-codex-select']))
  nodes = await openAdd(draw, 'web')
  assert.equal(scans, 0, 'browser authorization does not inspect disk')
  assert.ok(nodes.indexOf(nodes.find(node => node.props?.['data-codex-add-panel'])) < nodes.indexOf(nodes.find(node => node.props?.['data-quota-section'])))
  assert.match(nodes.find(node => node.props?.['data-codex-add-panel']).props.className, /ph-add-panel/u)
  nodes = await openAdd(draw, 'cli')
  assert.equal(scans, 1)
  nodes.find(node => node.props?.['data-codex-add-close']).props.onClick()
  nodes = await openAdd(draw, 'cli')
  assert.equal(scans, 1, 'reopening preserves the discovered sources instead of scanning again')
})

test('CLI scanning exposes pending and partial states while preventing overlapping scans', async () => {
  let finishScan, calls = 0
  const accounts = { ...emptyAccounts(), sources: () => { calls++; return new Promise(resolve => { finishScan = resolve }) } }
  const { draw } = await mountPanel(uiQuota(), { accounts })
  openManagement(flatten(draw())); await settleDraw(draw)
  let nodes = await openAdd(draw, 'cli')
  let status = nodes.find(node => node.props?.['data-codex-scan-status'])
  assert.equal(status.props['data-codex-scan-status'], 'scanning')
  assert.equal(status.props['aria-busy'], true)
  assert.match(textOf(status), /正在扫描.*最多约 8 秒/u)
  const rescan = nodes.find(node => node.props?.['data-codex-action'] === 'rescan')
  assert.equal(rescan.props.disabled, true)
  await rescan.props.onClick(); await rescan.props.onClick()
  assert.equal(calls, 1, 'even stale callbacks cannot start overlapping discovery')
  finishScan({ ok: true, value: { sources: [{ id: 'found', label: 'Found', path: '/host/codex', available: true }], scan: { elapsedMs: 321, checkedDirectories: 160, truncated: true, timedOut: false, budgetMs: 8000 } } })
  await settleDraw(draw); nodes = flatten(draw())
  status = nodes.find(node => node.props?.['data-codex-scan-status'])
  assert.equal(status.props['aria-busy'], false)
  assert.match(textOf(status), /找到 1.*0\.3.*扫描上限/u)
  const pending = nodes.find(node => node.props?.['data-codex-action'] === 'rescan').props.onClick()
  assert.equal(calls, 2)
  finishScan({ ok: true, value: { sources: [], scan: { elapsedMs: 8000, checkedDirectories: 20, truncated: false, timedOut: true, budgetMs: 8000 } } })
  await pending; await settleDraw(draw); nodes = flatten(draw())
  assert.match(textOf(nodes.find(node => node.props?.['data-codex-scan-status'])), /时间预算/u)
  assert.equal(nodes.find(node => node.props?.['data-codex-action'] === 'import').props.disabled, true)
})

test('successful CLI import closes its form, clears the name and previews without activation', async () => {
  const requests = []
  let switches = 0
  const entries = [{ id: 'current', name: 'Current', active: true }]
  const accounts = { ...emptyAccounts(), list: async () => ({ ok: true, value: { entries } }), sources: async () => ({ ok: true, value: { sources: [{ id: 'source', path: '/host/codex-other', available: true, email: 'other@example.test' }] } }), import: async request => { requests.push(request); entries.push({ id: 'new', name: 'Other', active: false }); return { ok: true, value: { entry: { id: 'new' } } } }, setActive: async () => { switches++; return { ok: true, value: {} } } }
  const { draw } = await mountPanel(uiQuota(), { accounts })
  openManagement(flatten(draw())); await settleDraw(draw)
  let nodes = await openAdd(draw, 'cli', 'Named account')
  await nodes.find(node => node.props?.['data-codex-import']).props.onSubmit(formEvent({}))
  await settleDraw(draw); nodes = flatten(draw())
  assert.ok(!nodes.some(node => node.props?.['data-codex-add-panel']))
  assert.equal(nodes.find(node => node.props?.['data-codex-select']).props['data-selected-id'], 'new')
  assert.deepEqual(requests.map(request => ({ ...request })), [{ source: 'source', name: 'Named account' }])
  assert.equal(switches, 0)
  nodes.find(node => node.props?.['data-codex-add']).props.onClick(); nodes = flatten(draw())
  assert.equal(nodes.find(node => node.type === 'input' && node.props.name === 'accountName').props.value, '')
})
