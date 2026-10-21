import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { apply, Config } from '../lib/index.js'
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
    '@deepseek-ai/dsh-attachment': '>=0.2.1-alpha.1',
    '@deepseek-ai/dsh-llm': '>=0.2.1-alpha.1',
    '@earendil-works/pi-ai': '0.87.1',
    '@deepseek-ai/dsh-typert-protocol': '>=0.2.1-alpha.1',
    '@deepseek-ai/dsh-web': '>=0.2.1-alpha.1',
  })
  assert.deepEqual(manifest.devDependencies, { '@deepseek-ai/dsh-client-ui-primitives': '0.2.1-alpha.1' }, 'real-model settings tests need the browser library in CI')
  assert.equal(manifest.exports['./images'], './lib/images.js')
})

test('the native settings schema exposes every hub UI field for live saves', () => {
  for (const field of ['searchProviders', 'imageProviders', 'imageTimeoutMs', 'quotaRecord', 'quotaIntervalMinutes', 'quotaHistoryDays', 'zaiTeamOrganization', 'zaiTeamProject']) {
    assert.equal(Config.dict[field].meta.volatile, true, `${field} must be editable via configForms`)
  }
  assert.equal(Config.dict.quotaRecord.meta.default, true)
  assert.equal(Config.dict.quotaIntervalMinutes.meta.default, 60)
  assert.equal(Config.dict.quotaHistoryDays.meta.default, 180)
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

test('Typert metadata declares every endpoint the browser mounts, host and remote face alike', async () => {
  const host = (await import('../lib/typert.host.js')).TYPERT
  const remote = (await import('../lib/typert.remote-client.js')).TYPERT_REMOTE
  const client = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
  const ids = list => list.map(item => item.id).sort()
  assert.deepEqual(ids(host.invocations), ids(remote.descriptors), 'host face and remote face declare the same endpoints')
  const window = {}
  vm.runInNewContext(client.replace('  const loader = window.__ModuleLoader__', '  window.testRemote = remote; const loader = window.__ModuleLoader__'), { window })
  const signature = descriptors => JSON.parse(JSON.stringify(Array.from(descriptors, item => ({ id: item.id, namespace: item.namespace, method: item.method, parameters: Array.from(item.parameters, p => ({ name: p.name, wire: p.wire, source: p.source, codec: p.codec.typeSymbol })), result: item.result.typeSymbol })).sort((a,b) => a.id.localeCompare(b.id))))
  assert.deepEqual(signature(window.testRemote.descriptors), signature(host.invocations), 'browser and host parameter codecs also stay in sync')
  assert.deepEqual(signature(remote.descriptors), signature(host.invocations), 'remote and host signatures stay in sync')
  assert.ok(host.invocations.length > 0)
  for (const descriptor of host.invocations) {
    // The HTTP gateway serves /api/<namespace>/<method> straight from this
    // metadata: one missing row is a 404 in the browser, not a broken service.
    assert.ok(client.includes(`'${descriptor.id}'`), `client mounts ${descriptor.id}`)
    assert.equal(descriptor.service, descriptor.namespace, 'each namespace is served by its same-named service')
    assert.equal(descriptor.id, `dsh-provider-hub#${descriptor.namespace}/${descriptor.method}`)
    assert.deepEqual(descriptor.invocation, { kind: 'direct' })
    assert.equal(typeof descriptor.result.create().parse, 'function')
    for (const parameter of descriptor.parameters) assert.equal(typeof parameter.codec.create().parse, 'function')
  }
  const endpoints = host.invocations.map(item => `${item.namespace}/${item.method}`)
  assert.equal(new Set(endpoints).size, endpoints.length, 'no endpoint is declared twice')
  for (const namespace of ['searchLogin', 'quota', 'keyPool', 'codexAccounts']) {
    assert.ok(endpoints.some(endpoint => endpoint.startsWith(`${namespace}/`)), `${namespace} endpoints stay mounted`)
  }
})

test('client stages independent OpenAI/ZAI switches and only Codex OAuth without owning the settings scope', async () => {
  let registered
  let loginRender
  let actionsRender
  let settingsRender
  let settingsSeat
  let saved = 0
  let savedValue
  let formDisposed = false
  let watchDisposed = false
  const effects = []
  const state = { writable: true, saving: false, dirty: false, searchProviders: { text: '["openai-codex"]', overridden: false, invalid: false }, imageProviders: { text: '["openai-codex"]', overridden: false, invalid: false }, searchMaxResults: { text: '200', overridden: false, invalid: false }, quotaRecord: { text: 'true', overridden: false, invalid: false }, quotaIntervalMinutes: { text: '60', overridden: false, invalid: false }, quotaHistoryDays: { text: '180', overridden: false, invalid: false }, zaiTeamOrganization: { text: '', overridden: false, invalid: false }, zaiTeamProject: { text: '', overridden: false, invalid: false } }
  const scope = {
    getSnapshot: () => ({ state: 'served', fields: { searchProviders: { value: ['openai-codex'] }, imageProviders: { value: ['openai-codex'] }, searchMaxResults: { value: 200 }, quotaRecord: { value: true }, quotaIntervalMinutes: { value: 60 }, quotaHistoryDays: { value: 180 }, zaiTeamOrganization: { value: '' }, zaiTeamProject: { value: '' } } }),
    subscribe: () => () => {},
    mutate: async callback => { saved++; savedValue = callback({ searchProviders: ['openai-codex'], imageProviders: ['openai-codex'], searchMaxResults: 200, quotaRecord: true, quotaIntervalMinutes: 60, quotaHistoryDays: 180, zaiTeamOrganization: '', zaiTeamProject: '' }); return savedValue },
    dispose: () => { throw new Error('shared configForms scope must not be disposed by client') },
  }
  class SettingsFormModel {
    constructor(received, fields) {
      assert.equal(received, scope)
      assert.equal(fields.length, 8)
      assert.equal(fields[0].field, 'searchProviders')
      assert.equal(fields[0].format(['openai-codex', 'zai']), '["openai-codex","zai"]')
      assert.equal(JSON.stringify(fields[0].parse('[]').value), '[]')
      assert.equal(fields[0].parse('["deepseek-official"]'), undefined)
      assert.equal(fields[0].parse('["google-zread"]'), undefined)
      assert.equal(fields[0].parse('"zai"'), undefined)
      assert.equal(fields[1].field, 'imageProviders')
      assert.equal(fields[1].format(undefined), '["openai-codex"]', 'a missing image field inherits the schema default')
      assert.equal(fields[1].format(['openai-codex', 'zai', 'zai-cn']), '["openai-codex","zai","zai-cn"]')
      assert.equal(fields[1].format('junk'), '[]')
      assert.equal(JSON.stringify(fields[1].parse('["openai-codex","zai"]').value), JSON.stringify(['openai-codex', 'zai']))
      assert.equal(JSON.stringify(fields[1].parse('[]').value), '[]', 'explicit all-off stays off')
      assert.equal(fields[1].parse('["zai-coding-cn"]'), undefined, 'credential-source ids are not image tools')
      assert.equal(fields[1].parse('["deepseek-official"]'), undefined)
      assert.equal(JSON.stringify(fields.slice(2).map(field => field.field)), JSON.stringify(['searchMaxResults', 'quotaRecord', 'quotaIntervalMinutes', 'quotaHistoryDays', 'zaiTeamOrganization', 'zaiTeamProject']))
      assert.equal(fields[2].format(200), '200')
      assert.equal(fields[2].format('nonsense'), '200')
      assert.equal(JSON.stringify(fields[2].parse('45')), JSON.stringify({ kind: 'set', value: 45 }))
      assert.equal(JSON.stringify(fields[2].parse('')), JSON.stringify({ kind: 'clear' }), 'an empty draft clears the override back to the composition value')
      assert.equal(fields[2].parse('0'), undefined, 'source cap below schema minimum is staged as invalid')
      assert.equal(fields[2].parse('1001'), undefined)
      assert.equal(fields[3].format(false), 'false')
      assert.equal(fields[3].format(undefined), 'true')
      assert.equal(JSON.stringify(fields[3].parse('false')), JSON.stringify({ kind: 'set', value: false }))
      assert.equal(fields[2].parse('yes'), undefined)
      assert.equal(fields[4].format(45), '45')
      assert.equal(fields[4].format('nonsense'), '60')
      assert.equal(JSON.stringify(fields[4].parse('45')), JSON.stringify({ kind: 'set', value: 45 }))
      assert.equal(fields[4].parse('5'), undefined, 'interval below schema minimum is staged as invalid')
      assert.equal(fields[5].parse('999999'), undefined)
      assert.equal(fields[6].format(undefined), '')
      assert.equal(fields[6].format('org-123'), 'org-123')
      assert.equal(JSON.stringify(fields[6].parse('  org-123  ')), JSON.stringify({ kind: 'set', value: 'org-123' }), 'team ids stage trimmed')
      assert.equal(JSON.stringify(fields[6].parse('')), JSON.stringify({ kind: 'clear' }), 'an empty team field clears the override')
      assert.equal(fields[7].field, 'zaiTeamProject')
      assert.equal(JSON.stringify(fields[7].parse('proj-9')), JSON.stringify({ kind: 'set', value: 'proj-9' }), 'the project field stages like the organization field')
      this.fields = fields
    }
    bind(project) { return { getSnapshot: project, subscribe: () => () => {} } }
    shell() { return { writable: state.writable, saving: state.saving, dirty: state.dirty } }
    field(name) { return state[name] }
    actions() { return {
      edit: (name, value) => { state[name] = { ...state[name], text: value }; state.dirty = true },
      resetField: name => { state[name] = { ...state[name], text: name === 'imageProviders' ? '["openai-codex"]' : '["openai-codex"]' } },
      save: () => scope.mutate(value => ({ ...value, searchProviders: this.fields[0].parse(state.searchProviders.text).value, imageProviders: this.fields[1].parse(state.imageProviders.text).value, searchMaxResults: this.fields[2].parse(state.searchMaxResults.text).value, quotaRecord: this.fields[3].parse(state.quotaRecord.text).value, quotaIntervalMinutes: this.fields[4].parse(state.quotaIntervalMinutes.text).value, quotaHistoryDays: this.fields[5].parse(state.quotaHistoryDays.text).value, zaiTeamOrganization: this.fields[6].parse(state.zaiTeamOrganization.text).kind === 'clear' ? undefined : this.fields[6].parse(state.zaiTeamOrganization.text).value, zaiTeamProject: this.fields[7].parse(state.zaiTeamProject.text).kind === 'clear' ? undefined : this.fields[7].parse(state.zaiTeamProject.text).value })),
      discard: () => { state.dirty = false },
    } }
    dispose() { formDisposed = true }
  }
  const SettingsForm = () => null
  const SettingsValueField = () => null
  const Switch = () => null
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
    return { SettingsForm, SettingsFormModel, SettingsValueField, Switch }
  })
  const slots = {
    inject: (_name, callback) => callback(),
    register: (seat, callback) => {
      assert.notEqual(seat.name, 'plugins.item', 'community settings must not add or replace an Official item')
      if (seat.name === 'plugins.bundle.config') { settingsSeat = seat; settingsRender = callback }
      else {
        assert.ok(['settings.models.provider-card', 'settings.models.provider-actions'].includes(seat.name))
        assert.equal(seat.key, 'llm-pi-ai')
        if (seat.name === 'settings.models.provider-card') loginRender = callback
        else actionsRender = callback
      }
      return () => {}
    },
  }
  const scoped = { remote: { searchLogin: {}, quota: {} }, slots }
  const bundles = {}
  const locale = {
    register: (ns, dictionaries) => { bundles[ns] = dictionaries; return () => {} },
    bind: ns => (key, params) => {
      const template = bundles[ns]?.zh?.[key] ?? key
      return params ? template.replace(/\{(\w+)\}/g, (match, name) => (name in params ? String(params[name]) : match)) : template
    },
  }
  const dispose = await plugin.apply({
    locale,
    slots,
    configForms: {
      get: id => { assert.equal(id, 'dsh-provider-hub'); return scope },
      whileServed: (ids, callback) => { assert.equal(ids.join(','), 'dsh-provider-hub'); const cleanup = callback(); return () => { watchDisposed = true; cleanup() } },
    },
    effect: callback => { const cleanup = callback(); effects.push(cleanup); return cleanup },
    remote: { $mount: async () => async () => {} },
    inject: (_dependencies, callback) => {
      callback(scoped)
      return Object.assign(Promise.resolve(), { dispose: async () => {} })
    },
  })
  const expand = node => (node && typeof node.type === 'function' ? expand(node.type(node.props)) : node)
  for (const provider of ['deepseek', 'anthropic']) {
    const card = loginRender({ provider: { provider } })
    assert.equal(expand(card), null, `no hub card for routes without a quota surface (${provider})`)
  }
  assert.equal(typeof actionsRender, 'function', 'the independent native action slot is registered')
  const openManagement = provider => {
    const props = { provider: { provider, settingsNs: 'llm-pi-ai' }, keyConfigured: true }
    const initial = expand(loginRender(props))
    const children = initial.props.children.flat()
    assert.ok(!children.some(node => node?.props?.['data-provider-pool-panel']), 'management adds no panel before first click')
    const fallback = children.find(node => node?.props?.['data-provider-pool-fallback'])
    assert.ok(fallback, 'older Hosts retain a single compact button')
    const native = expand(actionsRender({ ...props, buttonClassName: 'official-secondary' }))
    assert.equal(native.type, 'button')
    assert.equal(native.props.className, 'official-secondary', 'native action uses the official button style')
    native.props.onClick()
    const panel = expand(loginRender(props)).props.children.flat().find(node => node?.props?.['data-provider-pool-panel'])
    return expand(panel.props.children[0])
  }
  for (const provider of ['zai', 'zai-coding-cn', 'kimi-coding', 'xiaomi-token-plan-cn']) {
    const section = openManagement(provider)
    assert.equal(section.props['data-provider-hub-quota'], provider, 'API-key providers get the quota + key-pool card')
    const nodes = []
    const visit = node => { if (Array.isArray(node)) { node.forEach(visit); return } if (node && typeof node === 'object') { nodes.push(node); for (const child of node.props?.children ?? []) visit(child) } }
    visit(section)
    assert.ok(!nodes.some(node => node.props?.['data-login-action']), 'API-key providers never render an OAuth button')
  }
  assert.equal(openManagement('openai-codex').props['data-provider-hub-login'], 'openai-codex')
  assert.equal(settingsSeat.name, 'plugins.bundle.config')
  assert.equal(settingsSeat.key, manifest.name)
  assert.equal(settingsSeat.id, undefined, 'the form belongs to the installed bundle, not a separate official card')
  const injected = settingsSeat.inject()
  const props = { ...injected, useSearchProviderCard: selector => selector(injected.hooks.searchProviderCard.getSnapshot()) }
  assert.match(settingsRender({ ...props, view: 'summary' }), /官方搜索始终保留.*Codex.*Z\.AI.*额度/u)
  const renderForm = () => {
    const form = settingsRender(props)
    assert.equal(form.type, SettingsForm)
    const nodes = []
    const visit = node => { if (Array.isArray(node)) { node.forEach(visit); return }; if (node && typeof node === 'object') { nodes.push(node); for (const child of node.props?.children ?? []) visit(child) } }
    visit(form)
    assert.ok(!nodes.some(node => node.type === 'select'), 'there is no exclusive provider dropdown')
    const rows = nodes.filter(node => node.props?.['data-search-provider'])
    assert.equal(rows.length, 2, 'one labelled row per enhancement toggle')
    const switches = nodes.filter(node => node.type === Switch && node.props.label.endsWith('搜索增强'))
    assert.equal(switches.length, 2, 'two enhancement toggles rendered through the official Switch')
    const baseline = nodes.find(node => node.props?.['data-search-baseline'] === 'deepseek-official')
    assert.ok(baseline, 'official baseline is visibly non-interactive, not a third toggle')
    assert.notEqual(baseline.type, 'input')
    assert.ok(!rows.some(node => node.props['data-search-provider'] === 'deepseek-official'))
    assert.ok(nodes.some(node => node.type === 'legend' && node.props.children.includes('附加搜索增强')))
    assert.ok(nodes.some(node => node.type === 'legend' && node.props.children.includes('Codex 额度记录')), 'quota settings live in the same card as search settings')
    assert.ok(nodes.some(node => node.type === 'legend' && node.props.children.includes('Z.AI 团队版额度查询')), 'the zai team fields get their own group')
    const openaiSwitch = nodes.find(node => node.type === Switch && node.props.label === '启用 ChatGPT / Codex 搜索增强')
    const zaiSwitch = nodes.find(node => node.type === Switch && node.props.label === '启用 Z.AI 搜索增强')
    const recordSwitch = nodes.find(node => node.type === Switch && node.props.label === '启用每小时额度记录')
    assert.equal(recordSwitch.props.checked, true, 'hourly quota recording defaults on')
    const fields = id => nodes.find(node => node.type === SettingsValueField && node.props.id === id)
    assert.equal(fields('provider-hub-quota-interval').props.text, '60')
    assert.equal(fields('provider-hub-quota-retention').props.text, '180')
    assert.equal(fields('provider-hub-zai-team-org').props.text, '', 'the team organization field renders with its staged text')
    assert.equal(fields('provider-hub-zai-team-project').props.text, '')
    const limitField = fields('provider-hub-result-limit')
    assert.equal(limitField.props.text, '200', 'uniform source cap is editable in the same card')
    assert.equal(limitField.props.numeric, true)
    assert.equal(limitField.props.overriddenLabel, '已覆盖')
    assert.equal(limitField.props.invalid, false)
    return { form, openaiSwitch, zaiSwitch, recordSwitch }
  }
  let rendered = renderForm()
  assert.equal(rendered.openaiSwitch.props.checked, true)
  assert.equal(rendered.zaiSwitch.props.checked, false)
  rendered.zaiSwitch.props.onChange(true)
  assert.equal(saved, 0, 'changing a toggle stages an edit without mutating global settings')
  rendered = renderForm()
  assert.equal(rendered.openaiSwitch.props.checked, true)
  assert.equal(rendered.zaiSwitch.props.checked, true)
  await rendered.form.props.onSave()
  assert.equal(saved, 1)
  assert.equal(JSON.stringify(savedValue.searchProviders), '["openai-codex","zai"]')
  rendered.openaiSwitch.props.onChange(false)
  rendered = renderForm()
  rendered.zaiSwitch.props.onChange(false)
  rendered = renderForm()
  assert.equal(rendered.openaiSwitch.props.checked, false)
  assert.equal(rendered.zaiSwitch.props.checked, false)
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
  const hooks = []
  apply({
    plugin: () => { plugins++ },
    on: (event, handler, options) => { hooks.push([event, options]); return () => {} },
    web: { registerSearchProvider: value => { registered.push(value) } },
    tools: { register: () => { throw new Error('Host must not register tools') } },
    systemPrompt: { section: () => { throw new Error('Host must not change preset prompts') } },
  }, { searchProviders: [], enabledProviders: PROVIDERS, timeoutMs: 60000, searchMaxResults: 200, quotaRecord: true, quotaIntervalMinutes: 60, quotaHistoryDays: 180 })
  assert.equal(plugins, 5, 'search login bridge, key pool, codex accounts, quota service and image tools mount together')
  assert.deepEqual(hooks, [['internal/config', { global: true }], ['credentials/record-updated', undefined]], 'native config hook plus account preservation on official credential changes')
  assert.deepEqual(registered.map(provider => provider.id).sort(), [ROUTER_PROVIDER_ID, 'openai-codex', 'zai', 'google-zread'].sort())
  assert.ok(registered.every(provider => typeof provider.search === 'function' && typeof provider.available === 'function'))
})

test('published bundle supplies only the Host patch and no extra Agent mode', () => {
  assert.deepEqual([manifest.dsh.bundle.patch].flat(), ['./cordis.patch.yml'])
  assert.ok(!manifest.files.includes('preset.patch.yml'))
  const patch = readFileSync(new URL('../cordis.patch.yml', import.meta.url), 'utf8')
  assert.doesNotMatch(patch, /dsh-agent-preset|preset-provider-hub|dsh-provider-hub\/tool/u)
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
