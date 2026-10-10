import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { apply } from '../lib/index.js'
import { PROVIDERS, ROUTER_PROVIDER_ID } from '../lib/providers.js'
import { resolveRecordApiKey } from '../lib/search.js'

const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url)))

test('package pins a private volatile-capable Schema builder without bundling duplicate Host runtimes', () => {
  // A peer would resolve to a pre-existing profile-root Schema, which may lack
  // volatile support. A direct exact dependency gives this plugin its own
  // builder while runtime services continue to come from the Host.
  assert.deepEqual(manifest.dependencies, { '@deepseek-ai/schemastery': '3.18.5-alpha.1' })
  assert.equal(Object.hasOwn(manifest.peerDependencies, '@deepseek-ai/schemastery'), false)
  assert.deepEqual(manifest.peerDependencies, {
    '@deepseek-ai/cordis': '>=4.0.5-alpha.1',
    '@deepseek-ai/dsh-tool-web': '>=0.2.1-alpha.1',
    '@deepseek-ai/dsh-authorization': '>=0.2.1-alpha.1',
    '@deepseek-ai/dsh-credentials': '>=0.2.1-alpha.1',
    '@deepseek-ai/dsh-tools': '>=0.2.1-alpha.1',
    '@deepseek-ai/dsh-typert-protocol': '>=0.2.1-alpha.1',
    '@deepseek-ai/dsh-web': '>=0.2.1-alpha.1',
  })
})

test('client is a declared boot-roster plugin, not an early head script', () => {
  assert.equal(manifest.exports['./client'], './lib/client.js')
  assert.equal(manifest.dsh.client.platform, 'web')
  assert.ok(manifest.dsh.client.external.includes('react'))
  let registered
  vm.runInNewContext(readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8'), {
    window: { __ModuleLoader__: { load: entry => { registered = entry } } },
  })
  assert.equal(registered.id, manifest.name)
  assert.equal(typeof registered.factory, 'function')
})

test('client stages independent OpenAI/ZAI switches and only Codex OAuth without owning the settings scope', async () => {
  let registered
  let loginRender
  let settingsRender
  let settingsSeat
  let saved = 0
  let savedValue
  let formDisposed = false
  let watchDisposed = false
  const effects = []
  const state = { writable: true, saving: false, dirty: false, searchProviders: { text: '["openai-codex"]', overridden: false, invalid: false } }
  const scope = {
    getSnapshot: () => ({ state: 'served', fields: { searchProviders: { value: ['openai-codex'] } } }),
    subscribe: () => () => {},
    mutate: async callback => { saved++; savedValue = callback({ searchProviders: ['openai-codex'] }); return savedValue },
    dispose: () => { throw new Error('shared configForms scope must not be disposed by client') },
  }
  class SettingsFormModel {
    constructor(received, fields) {
      assert.equal(received, scope)
      assert.equal(fields.length, 1)
      assert.equal(fields[0].field, 'searchProviders')
      assert.equal(fields[0].format(['openai-codex', 'zai']), '["openai-codex","zai"]')
      assert.equal(JSON.stringify(fields[0].parse('[]').value), '[]')
      assert.equal(fields[0].parse('["deepseek-official"]'), undefined)
      assert.equal(fields[0].parse('["google-zread"]'), undefined)
      assert.equal(fields[0].parse('"zai"'), undefined)
      this.fields = fields
    }
    bind(project) { return { getSnapshot: project, subscribe: () => () => {} } }
    shell() { return { writable: state.writable, saving: state.saving, dirty: state.dirty } }
    field(name) { return state[name] }
    actions() { return {
      edit: (name, value) => { state[name] = { ...state[name], text: value }; state.dirty = true },
      resetField: name => { state[name] = { ...state[name], text: '["openai-codex"]' } },
      save: () => scope.mutate(value => ({ ...value, searchProviders: this.fields[0].parse(state.searchProviders.text).value })),
      discard: () => { state.dirty = false },
    } }
    dispose() { formDisposed = true }
  }
  const SettingsForm = () => null
  const React = {
    createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    useState: () => [undefined, () => {}],
    useRef: value => ({ current: value }),
    useEffect: () => {},
    useCallback: value => value,
  }
  vm.runInNewContext(readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8'), {
    window: { __ModuleLoader__: { load: entry => { registered = entry } } },
  })
  const plugin = registered.factory(id => {
    if (id === 'react') return React
    assert.equal(id, '@deepseek-ai/dsh-client-ui-primitives')
    return { SettingsForm, SettingsFormModel }
  })
  const slots = {
    inject: (_name, callback) => callback(),
    register: (seat, callback) => {
      if (seat.name === 'plugins.item') { settingsSeat = seat; settingsRender = callback }
      else { assert.equal(seat.key, 'llm-pi-ai'); loginRender = callback }
      return () => {}
    },
  }
  const scoped = { remote: { searchLogin: {} }, slots }
  const dispose = await plugin.apply({
    slots,
    configForms: {
      get: id => { assert.equal(id, 'dsh-web-search'); return scope },
      whileServed: (ids, callback) => { assert.equal(ids.join(','), 'dsh-web-search'); const cleanup = callback(); return () => { watchDisposed = true; cleanup() } },
    },
    effect: callback => { const cleanup = callback(); effects.push(cleanup); return cleanup },
    remote: { $mount: async () => async () => {} },
    inject: (_dependencies, callback) => {
      callback(scoped)
      return Object.assign(Promise.resolve(), { dispose: async () => {} })
    },
  })
  for (const provider of ['zai', 'zai-coding-cn', 'deepseek']) {
    const card = loginRender({ provider: { provider } })
    assert.equal(card.type(card.props), null)
  }
  const card = loginRender({ provider: { provider: 'openai-codex' } })
  assert.equal(card.type(card.props).props['data-provider-hub-login'], 'openai-codex')
  assert.equal(settingsSeat.id, 'search-provider')
  const injected = settingsSeat.inject()
  const props = { ...injected, useSearchProviderCard: selector => selector(injected.hooks.searchProviderCard.getSnapshot()) }
  assert.match(settingsRender({ ...props, view: 'summary' }), /官方搜索始终保留.*附加.*Codex.*Z\.AI/u)
  const renderForm = () => {
    const form = settingsRender(props)
    assert.equal(form.type, SettingsForm)
    const nodes = []
    const visit = node => { if (Array.isArray(node)) { node.forEach(visit); return }; if (node && typeof node === 'object') { nodes.push(node); for (const child of node.props?.children ?? []) visit(child) } }
    visit(form)
    assert.ok(!nodes.some(node => node.type === 'select'), 'there is no exclusive provider dropdown')
    const switches = nodes.filter(node => node.type === 'input' && node.props.type === 'checkbox' && node.props.role === 'switch')
    assert.equal(switches.length, 2)
    const baseline = nodes.find(node => node.props?.['data-search-baseline'] === 'deepseek-official')
    assert.ok(baseline, 'official baseline is visibly non-interactive, not a third toggle')
    assert.notEqual(baseline.type, 'input')
    assert.ok(!switches.some(node => node.props['data-search-provider'] === 'deepseek-official'))
    assert.ok(nodes.some(node => node.type === 'legend' && node.props.children.includes('附加搜索增强')))
    return { form, switches }
  }
  let rendered = renderForm()
  assert.equal(rendered.switches.find(node => node.props['data-search-provider'] === 'openai-codex').props.checked, true)
  assert.equal(rendered.switches.find(node => node.props['data-search-provider'] === 'zai').props.checked, false)
  rendered.switches.find(node => node.props['data-search-provider'] === 'zai').props.onChange({ target: { checked: true } })
  assert.equal(saved, 0, 'changing a toggle stages an edit without mutating global settings')
  rendered = renderForm()
  assert.ok(rendered.switches.every(node => node.props.checked))
  await rendered.form.props.onSave()
  assert.equal(saved, 1)
  assert.equal(JSON.stringify(savedValue.searchProviders), '["openai-codex","zai"]')
  rendered.switches.find(node => node.props['data-search-provider'] === 'openai-codex').props.onChange({ target: { checked: false } })
  rendered = renderForm()
  rendered.switches.find(node => node.props['data-search-provider'] === 'zai').props.onChange({ target: { checked: false } })
  rendered = renderForm()
  assert.ok(rendered.switches.every(node => !node.props.checked))
  assert.equal(saved, 1)
  await rendered.form.props.onSave()
  assert.equal(saved, 2)
  assert.equal(JSON.stringify(savedValue.searchProviders), '[]', 'both toggles off removes enhancements but keeps official baseline')
  await dispose()
  for (const cleanup of effects.reverse()) if (typeof cleanup === 'function') cleanup()
  assert.equal(formDisposed, true)
  assert.equal(watchDisposed, true)
})

test('Host mounts native providers without shadowing any preset tool or prompt', () => {
  let plugins = 0
  const registered = []
  apply({
    plugin: () => { plugins++ },
    web: { registerSearchProvider: value => { registered.push(value) } },
    tools: { register: () => { throw new Error('Host must not register tools') } },
    systemPrompt: { section: () => { throw new Error('Host must not change preset prompts') } },
  }, { searchProviders: [], enabledProviders: PROVIDERS, timeoutMs: 60000 })
  assert.equal(plugins, 1)
  assert.deepEqual(registered.map(provider => provider.id).sort(), [ROUTER_PROVIDER_ID, 'openai-codex', 'zai', 'google-zread'].sort())
  assert.ok(registered.every(provider => typeof provider.search === 'function' && typeof provider.available === 'function'))
})

test('published bundle supplies only the Host patch and no extra Agent mode', () => {
  assert.deepEqual([manifest.dsh.bundle.patch].flat(), ['./cordis.patch.yml'])
  assert.ok(!manifest.files.includes('preset.patch.yml'))
  const patch = readFileSync(new URL('../cordis.patch.yml', import.meta.url), 'utf8')
  assert.doesNotMatch(patch, /dsh-agent-preset|preset-provider-hub|dsh-web-search\/tool/u)
  assert.match(patch, /searchProvider/u)
  assert.match(patch, /DSH_WEB_SEARCH_PROVIDER/u)
  assert.equal(manifest.exports['./tool'], './lib/tool.js', 'compatibility entry remains published')
})

test('Z.AI managed credential references resolve through DSH rather than only shell env', async () => {
  const refs = []
  const key = await resolveRecordApiKey({ credentials: { resolve: async ref => { refs.push(ref); return { value: 'synthetic-test-key' } } } }, { kind: 'api-key', env: { API_KEY: 'NONEXISTENT_SYNTHETIC_ZAI_REF' } })
  assert.equal(key, 'synthetic-test-key')
  assert.deepEqual(refs, ['NONEXISTENT_SYNTHETIC_ZAI_REF'])
})
