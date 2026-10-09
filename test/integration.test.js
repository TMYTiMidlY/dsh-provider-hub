import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { apply, applySearchTool } from '../lib/index.js'
import { resolveRecordApiKey } from '../lib/search.js'

const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url)))

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

test('client adds only Codex OAuth UI, leaving ZAI API-key editors native', async () => {
  let registered
  let render
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
  const plugin = registered.factory(id => { assert.equal(id, 'react'); return React })
  const scoped = { remote: { searchLogin: {} }, slots: {
    inject: (_name, callback) => callback(),
    register: (seat, callback) => { assert.equal(seat.key, 'llm-pi-ai'); render = callback },
  } }
  const dispose = await plugin.apply({
    remote: { $mount: async () => async () => {} },
    inject: (_dependencies, callback) => {
      callback(scoped)
      return Object.assign(Promise.resolve(), { dispose: async () => {} })
    },
  })
  for (const provider of ['zai', 'zai-coding-cn', 'deepseek']) {
    const card = render({ provider: { provider } })
    assert.equal(card.type(card.props), null)
  }
  const card = render({ provider: { provider: 'openai-codex' } })
  assert.equal(card.type(card.props).props['data-provider-hub-login'], 'openai-codex')
  await dispose()
})

test('host bridge can mount without registering a global shadowed search', () => {
  let plugins = 0
  apply({ plugin: () => { plugins++ } }, { tool: false })
  assert.equal(plugins, 1)
})

test('preset tool has provider schema, validates, dispatches and formats safely', async () => {
  let definition
  let request
  let section
  const ctx = {
    tools: { register: value => { definition = value } },
    systemPrompt: { section: value => { section = value } },
    web: { search: async (value, signal) => {
      request = value
      assert.equal(signal.aborted, false)
      return { sources: [{ url: 'https://example.com/', title: 'Example' }], content: 'test', truncated: false }
    } },
  }
  applySearchTool(ctx, { defaultProvider: 'deepseek-official', enabledProviders: ['deepseek-official'], maxResults: 1 })
  assert.equal(definition.name, 'web_search')
  assert.ok(definition.parameters.properties.provider)
  const result = await definition.execute({ query: ' trial ' }, { signal: new AbortController().signal })
  assert.deepEqual(request, { query: 'trial', maxResults: 1 })
  assert.equal(result.provider, 'deepseek-official')
  assert.equal(result.sources.length, 1)
  assert.match(definition.output.render({}, result)[0].text, /untrusted data/)
  assert.match(section.text, /deepseek-official/)
  await assert.rejects(() => definition.execute({ query: 'trial', provider: 'zai' }, { signal: new AbortController().signal }), /disabled/)
})

test('Z.AI managed credential references resolve through DSH rather than only shell env', async () => {
  const refs = []
  const key = await resolveRecordApiKey({ credentials: { resolve: async ref => { refs.push(ref); return { value: 'synthetic-test-key' } } } }, { kind: 'api-key', env: { API_KEY: 'NONEXISTENT_SYNTHETIC_ZAI_REF' } })
  assert.equal(key, 'synthetic-test-key')
  assert.deepEqual(refs, ['NONEXISTENT_SYNTHETIC_ZAI_REF'])
})
