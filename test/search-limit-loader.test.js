import test from 'node:test'
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import { join } from 'node:path'
import z from '@deepseek-ai/schemastery'
import { installToolWebConfigHook } from '../lib/index.js'

// Optional installed-host layer, run alongside the existing runtime suites with
// DSH_TEST_RUNTIME_ROOT. The always-on lifecycle suite separately covers peers.
const runtimeRoot = process.env.DSH_TEST_RUNTIME_ROOT
const moduleUrl = name => pathToFileURL(join(runtimeRoot, 'node_modules/@deepseek-ai', name, 'lib/index.js')).href
const tick = () => new Promise(resolve => setImmediate(resolve))

test('real Loader entry.update applies volatile limits and preserves raw expressions', { skip: !runtimeRoot }, async t => {
  const [{ Context }, { Loader }, toolWeb] = await Promise.all([
    import(moduleUrl('cordis')), import(moduleUrl('cordis-plugin-loader')), import(moduleUrl('dsh-tool-web')),
  ])
  const root = new Context(); t.after(() => root.fiber.dispose())
  await root.plugin(Loader, {})
  const runs = []
  const modules = {
    tool: { name: 'tool-web', Config: toolWeb.Config, apply(_ctx, config) { runs.push(config.searchMaxResults) } },
    owner: { name: 'limit-owner', Config: z.object({
      searchMaxResults: z.number().default(0).volatile(),
      unrelated: z.boolean().default(true).volatile(),
    }), apply(ctx, config) { installToolWebConfigHook(ctx, () => ({ searchMaxResults: config.searchMaxResults.get() })) } },
  }
  // In-memory import boundary only; real Entry creation, interpolation, schema
  // validation, volatile-only commit and scoped event delivery are untouched.
  root.loader.import = async name => modules[name]
  let writes = 0
  root.loader.write = () => { writes++ }
  const raw = { searchMaxResults: { __jsExpr: '13' }, fetch: false }
  await root.loader.root.create({ id: 'test-tool', name: 'tool', config: raw })
  await root.loader.await()
  const tool = root.loader.store['test-tool'].fiber
  await root.loader.root.create({ id: 'test-owner', name: 'owner', config: {} })
  await root.loader.await(); await tick()
  const ownerEntry = root.loader.store['test-owner']
  const ownerFiber = ownerEntry.fiber
  assert.equal(tool.config.searchMaxResults, Number.MAX_SAFE_INTEGER)
  await ownerEntry.update({ config: { searchMaxResults: 5 } }); await tick()
  assert.equal(ownerEntry.fiber, ownerFiber, 'volatile saves do not restart provider-hub')
  assert.equal(tool.config.searchMaxResults, 5)
  await ownerEntry.update({ config: { searchMaxResults: 5, unrelated: false } }); await tick()
  assert.deepEqual(runs, [13, Number.MAX_SAFE_INTEGER, 5], 'unrelated saves do not restart tool-web')
  await ownerEntry.update({ config: { searchMaxResults: 0, unrelated: false } }); await tick()
  assert.equal(tool.config.searchMaxResults, Number.MAX_SAFE_INTEGER)
  assert.deepEqual(raw, { searchMaxResults: { __jsExpr: '13' }, fetch: false })
  assert.equal(writes, 0, 'runtime reconciliation never writes the deployment patch')
  await ownerFiber.dispose()
  assert.equal(tool.config.searchMaxResults, 13)
  assert.deepEqual(raw.searchMaxResults, { __jsExpr: '13' })
})
