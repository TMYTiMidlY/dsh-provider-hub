import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, access } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import vm from 'node:vm'

// The published React bundle imports CSS, so Node cannot import its root. Run
// the exact Host-owned, self-contained form regions in a VM instead. No copied
// staging algorithm: the actual Host model does the draft/fencing work. Snapshot
// publication is a test boundary: the published browser store imports dev-only
// zustand/immer dependencies not installed in the CLI Host. Do not install them.
// As in runtime.test.js, a missing explicit runtime or changed contract fails
// this layer rather than silently skipping it.
const explicitRuntimeRoot = process.env.DSH_TEST_RUNTIME_ROOT
const runtimePath = join(explicitRuntimeRoot ?? '/usr/local/lib/node_modules/@deepseek-ai/dsh', 'node_modules/@deepseek-ai')
let usePeerImports = false
try { await access(join(runtimePath, 'dsh-client-ui-primitives/lib/index.js')) } catch (error) {
  if (explicitRuntimeRoot !== undefined || !['ENOENT', 'ENOTDIR'].includes(error.code)) throw error
  usePeerImports = true
}
const runtimeUrl = name => usePeerImports ? import.meta.resolve(`@deepseek-ai/${name}`) : pathToFileURL(join(runtimePath, name, 'lib/index.js')).href
const primitiveSource = await readFile(new URL(runtimeUrl('dsh-client-ui-primitives')), 'utf8')
function createSnapshotStore(initial) {
  let snapshot = initial
  const listeners = new Set()
  return {
    getSnapshot: () => snapshot,
    subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener) },
    set: next => { snapshot = next; for (const listener of [...listeners]) listener() },
  }
}
function region(name) {
  const marker = `//#region lib/types/settings-form/${name}.js`
  const start = primitiveSource.indexOf(marker)
  assert.notEqual(start, -1, `Host must publish the ${name} contract region`)
  const end = primitiveSource.indexOf('//#endregion', start)
  assert.notEqual(end, -1)
  return primitiveSource.slice(start, end)
}
let frameEffects = []
const element = (type, props) => ({ type, props })
const { SettingsFormModel: HostSettingsFormModel, SettingsForm } = vm.runInNewContext(
  `${region('form-model')}\n${region('SettingsForm')}\n({ SettingsFormModel, SettingsForm })`, {
    createSnapshotStore,
    useRef: value => ({ current: value }),
    useEffect: callback => frameEffects.push(callback()),
    jsx: element, jsxs: element, css$25: {},
  }, { filename: 'installed-host-settings-forms.js' },
)
const clientSource = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8')
const plain = value => JSON.parse(JSON.stringify(value))
const settled = () => new Promise(resolve => setImmediate(resolve))
const imageIds = ['openai-codex', 'zai', 'zai-cn']
// The merged entry owns one combined form; every field below is writable
// through the same namespace, so a save must touch only the drafted fields.
const NAMESPACE = 'dsh-provider-hub'
const FIELDS = ['searchProviders', 'imageProviders', 'searchMaxResults', 'quotaRecord', 'quotaIntervalMinutes', 'quotaHistoryDays', 'zaiTeamOrganization', 'zaiTeamProject']
const DEFAULTS = { searchProviders: ['openai-codex'], imageProviders: ['openai-codex'], searchMaxResults: 200, quotaRecord: true, quotaIntervalMinutes: 60, quotaHistoryDays: 180, zaiTeamOrganization: '', zaiTeamProject: '' }

function nodesOf(tree) {
  const result = []
  const visit = node => {
    if (Array.isArray(node)) { node.forEach(visit); return }
    if (!node || typeof node !== 'object') return
    result.push(node)
    const children = node.props?.children
    if (children !== undefined) visit(children)
  }
  visit(tree)
  return result
}
function mountFrame(props) {
  frameEffects = []
  const tree = SettingsForm(props)
  const cleanups = frameEffects
  frameEffects = []
  return { tree, unmount: () => { for (const cleanup of cleanups) cleanup?.() } }
}

// Only the transport/Host document is synthetic. It accepts ordered path ops,
// performs revision fencing, and publishes the schema-resolved acceptance.
async function withClient(t, config = {}) {
  let registered
  let disposed = false
  const effects = []
  const initial = config[NAMESPACE] ?? {}
  const base = plain(initial.base ?? DEFAULTS)
  const user = plain(initial.user ?? {})
  const resolve = (base, user) => ({ ...DEFAULTS, ...base, ...user })
  const store = createSnapshotStore({ status: 'ready', writable: true, revision: 1, base, user, value: resolve(base, user) })
  const scope = {
    namespace: NAMESPACE, writes: [], subscriptions: 0, unsubscriptions: 0,
    getSnapshot: store.getSnapshot,
    subscribe(listener) {
      this.subscriptions++
      const off = store.subscribe(listener)
      return () => { this.unsubscriptions++; off() }
    },
    replace(patch) {
      const next = { ...plain(store.getSnapshot()), ...plain(patch) }
      next.value = resolve(next.base, next.user)
      store.set(next)
    },
    async mutate(ops, expectedRevision) {
      this.writes.push({ ops: plain(ops), expectedRevision })
      const commit = () => {
        const snapshot = store.getSnapshot()
        if (!snapshot.writable || snapshot.status !== 'ready' || expectedRevision !== snapshot.revision) return false
        const next = plain(snapshot)
        for (const op of ops) {
          assert.equal(op.path.length, 1)
          const field = op.path[0]
          assert.ok(FIELDS.includes(field), `form writes only owned fields, saw ${field}`)
          if (op.op === 'unset') delete next.user[field]
          else { assert.equal(op.op, 'set'); next.user[field] = plain(op.value) }
        }
        next.value = resolve(next.base, next.user)
        next.revision++
        store.set(next)
        return true
      }
      return this.behavior ? await this.behavior(commit) : commit()
    },
    dispose() { throw new Error('client cannot dispose shared configForms scope') },
  }
  const models = []
  const specs = []
  let disposals = 0
  class SettingsFormModel extends HostSettingsFormModel {
    constructor(received, fields) {
      super(scope, fields)
      models.push(this)
      specs.push(Array.from(fields, field => field.field))
    }
    dispose() { disposals++; super.dispose() }
  }
  const React = {
    createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    useState: () => [undefined, () => {}], useRef: value => ({ current: value }), useEffect: () => {}, useCallback: value => value,
  }
  // Host Switch renders an input; the createElement mock never invokes functions,
  // so the literal element type keeps switch nodes inspectable.
  const Switch = 'input'
  const SettingsValueField = props => element('div', props)
  vm.runInNewContext(clientSource, { window: { __ModuleLoader__: { load: entry => { registered = entry } } } })
  const plugin = registered.factory(name => {
    if (name === 'react') return React
    assert.equal(name, '@deepseek-ai/dsh-client-ui-primitives')
    return { SettingsForm, SettingsFormModel, SettingsValueField, Switch }
  })
  let seatEntry
  const slots = {
    inject: (_name, callback) => callback(),
    register: (seat, render) => {
      if (['settings.models.provider-card', 'settings.models.provider-actions'].includes(seat.name)) {
        assert.equal(seat.key, 'llm-pi-ai', 'Models extensions keep their adapter namespace')
        return () => {}
      }
      assert.equal(seat.name, 'plugins.bundle.config', 'the merged bundle owns one keyed config page')
      assert.equal(seat.key, NAMESPACE)
      seatEntry = { seat, render }
      return () => { seatEntry = undefined }
    },
  }
  const bundles = {}
  const locale = {
    register: (ns, dictionaries) => { bundles[ns] = dictionaries; return () => {} },
    bind: ns => (key, params) => {
      const template = bundles[ns]?.zh?.[key] ?? key
      return params ? template.replace(/\{(\w+)\}/g, (match, name) => (name in params ? String(params[name]) : match)) : template
    },
  }
  const stopPlugin = await plugin.apply({
    locale,
    slots,
    configForms: {
      get: id => { assert.equal(id, NAMESPACE); return scope },
      whileServed: (ids, register) => { assert.equal(ids.join(','), NAMESPACE); return register(new Set(ids)) },
    },
    effect: callback => { const cleanup = callback(); effects.push(cleanup); return cleanup },
    remote: { $mount: async () => async () => {} },
    inject: (_dependencies, callback) => {
      callback({ remote: { searchLogin: {}, quota: {}, keyPool: {} }, slots })
      return Object.assign(Promise.resolve(), { dispose: async () => {} })
    },
  })
  const fixture = {
    scope, store, models, specs, get disposals() { return disposals },
    render() {
      assert.ok(seatEntry, 'bundle config page must stay registered')
      const injected = seatEntry.seat.inject()
      const props = { ...injected, useSearchProviderCard: select => select(injected.hooks.searchProviderCard.getSnapshot()) }
      const form = seatEntry.render(props)
      assert.equal(form.type, SettingsForm)
      const nodes = nodesOf(form)
      return { form, props, nodes, switches: nodes.filter(node => node.type === 'input' && 'checked' in node.props && typeof node.props.onChange === 'function') }
    },
    async dispose() {
      if (disposed) return
      disposed = true
      await stopPlugin()
      for (const cleanup of effects.reverse()) if (typeof cleanup === 'function') cleanup()
    },
  }
  t.after(() => fixture.dispose())
  await settled()
  return fixture
}
// The data attribute lives on the wrapper row; the switch input is its child.
const imageRows = rendered => rendered.nodes.filter(node => node.props?.['data-image-provider'])
const imageSwitchOf = (rendered, id) => {
  const row = imageRows(rendered).find(node => node.props['data-image-provider'] === id)
  return row ? nodesOf(row.props.children).find(node => node.type === 'input') : undefined
}
const selected = rendered => imageRows(rendered).filter(row => imageSwitchOf(rendered, row.props['data-image-provider'])?.props.checked).map(row => row.props['data-image-provider'])
const switchImage = (fixture, target) => {
  for (const id of imageIds) {
    const rendered = fixture.render()
    imageSwitchOf(rendered, id)?.props.onChange(target.includes(id))
  }
}

test('merged real Host model stages the combined form and an image-only edit persists only imageProviders', async t => {
  const fixture = await withClient(t)
  assert.deepEqual(fixture.specs[0], ["searchProviders", "imageProviders", 'searchMaxResults', 'quotaRecord', 'quotaIntervalMinutes', 'quotaHistoryDays', 'zaiTeamOrganization', 'zaiTeamProject'], 'one model owns the combined field order')
  assert.equal(fixture.models.length, 1, 'exactly one staged model for the package page')
  switchImage(fixture, ['openai-codex', 'zai'])
  let rendered = fixture.render()
  assert.deepEqual(selected(rendered), ['openai-codex', 'zai'])
  assert.equal(fixture.scope.writes.length, 0, 'toggles stage without writing')
  await rendered.form.props.onSave()
  assert.equal(fixture.scope.writes.length, 1)
  assert.deepEqual(fixture.scope.writes[0].ops.filter(op => op.path[0] !== 'imageProviders'), [], 'no search/quota field is touched by an image-only edit')
  assert.equal(fixture.scope.writes[0].ops.length, 1)
  assert.deepEqual(fixture.scope.writes[0].ops[0].value, ['openai-codex', 'zai'])
  rendered = fixture.render()
  assert.deepEqual(selected(rendered), ['openai-codex', 'zai'], 'accepted value re-renders')
})

test('real Host model preserves every image combination and explicit all-off across remount', async t => {
  const fixture = await withClient(t)
  for (const value of [['zai'], ['openai-codex', 'zai', 'zai-cn'], []]) {
    switchImage(fixture, value)
    // The Host action fires the async save without returning its promise;
    // yield a macrotask so the fence clears before the next iteration.
    fixture.render().form.props.onSave()
    await settled()
    const model = new HostSettingsFormModel(fixture.scope, [
      { field: 'imageProviders', format: v => JSON.stringify(v === undefined ? ['openai-codex'] : v), parse: text => { const v = JSON.parse(text); return Array.isArray(v) ? { kind: 'set', value: v } : undefined } },
    ])
    try {
      const store = model.bind(() => ({ ...model.shell(), imageProviders: model.field('imageProviders') }))
      assert.deepEqual(JSON.parse(store.getSnapshot().imageProviders.text), value)
    } finally { model.dispose() }
  }
  assert.deepEqual(selected(fixture.render()), [], 'explicit all-off stays off after save')
})

test('image reset stages unset and inherits deployment defaults, empty base, or schema Codex default', async t => {
  const fixture = await withClient(t, { [NAMESPACE]: { user: { imageProviders: ['zai'] } } })
  let rendered = fixture.render()
  assert.ok(rendered.nodes.some(node => node.props?.['data-image-action'] === 'reset'), 'a user override offers the image reset')
  rendered.props.resetField('imageProviders')
  await fixture.render().form.props.onSave()
  const last = fixture.scope.writes.at(-1)
  assert.deepEqual(last.ops, [{ op: 'unset', path: ['imageProviders'] }], 'reset persists an unset, not a hard-coded array')
  assert.deepEqual(selected(fixture.render()), ['openai-codex'], 'unset inherits the deployment base default')
  for (const [base, expectation] of [[{ imageProviders: [] }, []], [{}, ['openai-codex']]]) {
    const scoped = await withClient(t, { [NAMESPACE]: { base } })
    const model = new HostSettingsFormModel(scoped.scope, [{ field: 'imageProviders', format: v => JSON.stringify(v === undefined ? ['openai-codex'] : v), parse: text => { const v = JSON.parse(text); return Array.isArray(v) ? { kind: 'set', value: v } : undefined } }])
    try {
      const store = model.bind(() => ({ ...model.shell(), imageProviders: model.field('imageProviders') }))
      assert.deepEqual(JSON.parse(store.getSnapshot().imageProviders.text), expectation, `base ${JSON.stringify(base)} resolves ${JSON.stringify(expectation)}`)
    } finally { model.dispose() }
  }
})

test('native discard and actual SettingsForm unmount drop only their own drafts without writing', async t => {
  const fixture = await withClient(t)
  switchImage(fixture, ['zai-cn'])
  let rendered = fixture.render()
  assert.ok(rendered.form.props.state.dirty)
  rendered.form.props.onDiscard()
  rendered = fixture.render()
  assert.deepEqual(selected(rendered), ['openai-codex'], 'discard restores the accepted value')
  switchImage(fixture, [])
  const frame = mountFrame({ ...fixture.render().form.props })
  frame.unmount()
  assert.deepEqual(selected(fixture.render()), ['openai-codex'], 'unmount-driven discard drops the draft')
  assert.equal(fixture.scope.writes.length, 0)
})

test('revision conflict preserves native drafts and never silently rebases or overwrites the new Host value', async t => {
  const fixture = await withClient(t)
  switchImage(fixture, ['zai'])
  fixture.scope.behavior = commit => (fixture.scope.replace({ revision: 99, user: { imageProviders: ['zai-cn'] } }), Promise.resolve(false))
  const rendered = fixture.render()
  await rendered.form.props.onSave()
  fixture.scope.behavior = undefined
  assert.deepEqual(selected(fixture.render()).sort(), ['zai'], 'conflict keeps the local draft')
  assert.deepEqual(fixture.scope.getSnapshot().user.imageProviders, ['zai-cn'], 'the newer Host value wins remotely')
})

test('native transport failure preserves draft and uses fixed form copy rather than the raw error', async t => {
  const fixture = await withClient(t)
  switchImage(fixture, ['zai'])
  fixture.scope.behavior = () => Promise.reject(new Error('SYNTHETIC_TRANSPORT_SECRET'))
  const rendered = fixture.render()
  await rendered.form.props.onSave()
  fixture.scope.behavior = undefined
  assert.deepEqual(selected(fixture.render()), ['zai'], 'draft survives the failure')
  assert.doesNotMatch(JSON.stringify(rendered.form.props.state), /SYNTHETIC_TRANSPORT_SECRET/u)
})

test('native read-only, in-flight, invalid, and unavailable states keep their guards and drafts', async t => {
  const fixture = await withClient(t)
  fixture.scope.replace({ writable: false })
  let rendered = fixture.render()
  assert.ok(imageIds.every(id => imageSwitchOf(rendered, id)?.props.disabled), 'read-only disables image switches')
  fixture.scope.replace({ writable: true, status: 'ready' })
  switchImage(fixture, ['zai'])
  fixture.scope.behavior = () => new Promise(() => {})
  const pending = fixture.render().form.props.onSave()
  await settled()
  rendered = fixture.render()
  assert.ok(imageIds.every(id => imageSwitchOf(rendered, id)?.props.disabled), 'in-flight save disables image switches')
  void pending
  const invalid = fixture.render()
  assert.equal(invalid.form.props.state.imageProviders.invalid, false)
  fixture.scope.replace({ status: 'unavailable' })
  const unavailable = fixture.render()
  const frame = mountFrame(unavailable.form.props)
  try {
    assert.ok(nodesOf(frame.tree).some(node => node.props?.role === 'status' && /未加载|unavailable/u.test(String(node.props.children))), 'unserved namespace shows the fixed unavailable line')
  } finally { frame.unmount() }
  assert.equal(fixture.scope.writes.length, 1, 'only the still-pending in-flight write was attempted')
  assert.deepEqual(fixture.scope.getSnapshot().user.imageProviders ?? ['openai-codex'], ['openai-codex'], 'the fenced write never landed')
})

test('image section renders inside the single package card with three independent switches and locale copy', async t => {
  const fixture = await withClient(t)
  const rendered = fixture.render()
  assert.deepEqual(imageRows(rendered).map(row => row.props['data-image-provider']), imageIds)
  assert.ok(imageIds.every(id => typeof imageSwitchOf(rendered, id)?.props.onChange === 'function'))
  assert.ok(rendered.nodes.some(node => node.props?.['data-image-selection'] === 'openai-codex'), 'selection summary reflects the default')
  assert.ok(rendered.nodes.some(node => String(node.props?.children ?? '').includes('多选') || String(node.props?.children ?? '').includes('自动群发') || rendered.nodes.some(n => n.props?.id === 'provider-hub-image-hint')), 'fan-out semantics copy present')
  assert.ok(rendered.nodes.some(node => node.props?.['data-search-provider']), 'search switches share the same card')
  assert.ok(!rendered.nodes.some(node => node.props?.id === 'dsh-image-tools'), 'no second form is mounted')
})
