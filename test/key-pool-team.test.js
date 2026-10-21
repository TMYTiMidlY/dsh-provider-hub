import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { KeyPool, KeyPoolService } from '../lib/key-pool.js'
import { quotaQueryScope } from '../lib/quota-providers.js'

const credentialsForTest = () => {
  const refs = new Map()
  const writes = []
  return {
    refs, writes,
    resolve: async ref => refs.has(ref) ? { value: refs.get(ref) } : undefined,
    set: async (ref, value) => { writes.push(ref); refs.set(ref, value) },
    unset: async ref => { refs.delete(ref) },
  }
}
async function setup(t) {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-key-pool-team-'))
  t.after(async () => {
    const target = resolve(dir)
    assert.ok(target.startsWith(join(tmpdir(), 'dsh-key-pool-team-')))
    await rm(target, { recursive: true, force: true })
  })
  const path = join(dir, 'key-pool.json')
  const credentials = credentialsForTest()
  const pool = new KeyPool(path, { credentials })
  const service = Object.create(KeyPoolService.prototype)
  service.pool = pool
  return { path, credentials, pool, service }
}
const teamInput = (provider = 'zai', extra = {}) => ({ provider, name: 'Team', value: 'sk-synthetic-team-secret', accountType: 'team', organization: ' org_one ', project: ' project_one ', ...extra })

test('team fields validate completely before any credential or metadata write', async t => {
  const { path, pool, credentials } = await setup(t)
  const invalid = [
    { organization: undefined }, { project: undefined }, { organization: '' }, { project: '   ' },
    { organization: 'x'.repeat(257) }, { project: 'x'.repeat(257) },
    { organization: 'org\r\nInjected: value' }, { project: 'project\0bad' },
    { organization: 'with space' }, { organization: '组织' }, { project: 'tab\tvalue' },
    { organization: 'trailing\n' }, { accountType: 'automatic' },
    { provider: 'kimi-coding' }, { provider: 'xiaomi-token-plan-cn' },
  ]
  for (const extra of invalid) await assert.rejects(pool.add(teamInput('zai', extra)))
  assert.equal(credentials.writes.length, 0)
  await assert.rejects(readFile(path), { code: 'ENOENT' })
})

test('service forwards non-secret team metadata, personal clears residual selectors, legacy remains untyped', async t => {
  const { path, service, pool, credentials } = await setup(t)
  const { entry: team } = await service.add(teamInput('zai-coding-cn'))
  const { entry: personal } = await service.add({ ...teamInput('zai-coding-cn'), name: 'Personal', accountType: 'personal' })
  const { entry: legacy } = await service.add({ provider: 'zai-coding-cn', name: 'Legacy', value: 'sk-synthetic-legacy-secret' })
  assert.deepEqual({ accountType: team.accountType, organization: team.organization, project: team.project }, { accountType: 'team', organization: 'org_one', project: 'project_one' })
  assert.equal(personal.accountType, 'personal')
  assert.equal(personal.organization, undefined)
  assert.equal(personal.project, undefined)
  assert.equal(legacy.accountType, undefined)
  const listed = (await service.list()).entries
  assert.deepEqual(listed.find(entry => entry.id === team.id), { ...team, configured: true, active: false })
  const hostSecret = await pool.secretOf(team.id)
  assert.equal(hostSecret.value, 'sk-synthetic-team-secret')
  assert.equal(hostSecret.entry.accountType, 'team')
  assert.equal(hostSecret.entry.organization, 'org_one')
  const json = JSON.stringify([team, personal, legacy, listed, await readFile(path, 'utf8')])
  assert.ok(!json.includes('sk-synthetic'), 'remote outputs and on-disk metadata never carry secret values')
  assert.equal(credentials.refs.size, 3, 'all secrets remain in the credential store only')
})

test('add never infers active team scope; explicit same-secret selections are persisted and unique', async t => {
  const { path, pool, credentials } = await setup(t)
  credentials.refs.set('ZAI_API_KEY', 'sk-synthetic-team-secret')
  const first = await pool.add(teamInput('zai'))
  const second = await pool.add(teamInput('zai', { name: 'Other project', project: 'project_two' }))
  assert.deepEqual(await pool.activeMetadata('zai', 'sk-synthetic-team-secret'), {})
  assert.ok((await pool.list()).every(entry => !entry.active), 'adding explicit team entries never claims the unchanged official key acquired that scope')
  await pool.setActive({ id: first.id })
  assert.equal((await pool.activeMetadata('zai', 'sk-synthetic-team-secret')).project, 'project_one')
  assert.equal((await pool.list()).find(entry => entry.active).id, first.id)
  await pool.setActive({ id: second.id })
  const metadata = await pool.activeMetadata('zai', 'sk-synthetic-team-secret')
  assert.equal(metadata.project, 'project_two')
  assert.notEqual(quotaQueryScope(metadata), quotaQueryScope((await pool.secretOf(first.id)).entry))
  assert.deepEqual((await pool.list()).filter(entry => entry.active).map(entry => entry.id), [second.id])
  const text = await readFile(path, 'utf8')
  assert.ok(!text.includes('sk-synthetic'))
  const stored = JSON.parse(text).activeSelections.zai
  assert.match(stored.secretHash, /^[a-f0-9]{64}$/u)
  assert.equal(stored.entryId, second.id)
  const reloaded = new KeyPool(path, { credentials })
  assert.deepEqual(await reloaded.activeMetadata('zai', 'sk-synthetic-team-secret'), metadata)
  assert.deepEqual(await reloaded.activeMetadata('zai-coding-cn', 'sk-synthetic-team-secret'), {}, 'a route never inherits another route selection')
})

test('removing the selected pool entry leaves official scope intact; external secret changes are fenced', async t => {
  const { path, pool, credentials } = await setup(t)
  const added = await pool.add(teamInput('zai-coding-cn'))
  await pool.setActive({ id: added.id })
  const expected = await pool.activeMetadata('zai-coding-cn', 'sk-synthetic-team-secret')
  await pool.remove({ id: added.id })
  assert.equal(credentials.refs.get('ZAI_CODING_CN_API_KEY'), 'sk-synthetic-team-secret')
  assert.deepEqual(await pool.activeMetadata('zai-coding-cn', 'sk-synthetic-team-secret'), expected)
  assert.equal((await pool.list()).length, 0)
  const reloaded = new KeyPool(path, { credentials })
  assert.deepEqual(await reloaded.activeMetadata('zai-coding-cn', 'sk-synthetic-team-secret'), expected)
  credentials.refs.set('ZAI_CODING_CN_API_KEY', 'sk-synthetic-external-secret')
  assert.deepEqual(await reloaded.activeMetadata('zai-coding-cn', 'sk-synthetic-external-secret'), {})
})

test('personal activation clears previous team selectors even with the same secret', async t => {
  const { pool } = await setup(t)
  const team = await pool.add(teamInput())
  const personal = await pool.add(teamInput('zai', { name: 'Personal', accountType: 'personal' }))
  await pool.setActive({ id: team.id })
  await pool.setActive({ id: personal.id })
  assert.deepEqual(await pool.activeMetadata('zai', 'sk-synthetic-team-secret'), { accountType: 'personal' })
  assert.deepEqual((await pool.list()).filter(entry => entry.active).map(entry => entry.id), [personal.id])
})

test('version-one legacy documents load without type or active selections', async t => {
  const { path, credentials } = await setup(t)
  const legacy = { id: 'legacy', name: 'Original', provider: 'zai', ref: 'KEY_POOL_ZAI_LEGACY' }
  await writeFile(path, JSON.stringify({ version: 1, entries: [legacy] }))
  credentials.refs.set(legacy.ref, 'sk-synthetic-original')
  credentials.refs.set('ZAI_API_KEY', 'sk-synthetic-original')
  const pool = new KeyPool(path, { credentials })
  assert.deepEqual(await pool.activeMetadata('zai', 'sk-synthetic-original'), {})
  assert.equal((await pool.list())[0].active, true)
  assert.equal((await pool.list())[0].accountType, undefined)
  await pool.setActive({ id: legacy.id })
  assert.deepEqual(await pool.activeMetadata('zai', 'sk-synthetic-original'), {})
  assert.equal(JSON.parse(await readFile(path, 'utf8')).version, 1)
})

test('a live instance observes another instance selecting a different same-secret scope', async t => {
  const { path, pool, credentials } = await setup(t)
  const first = await pool.add(teamInput())
  const second = await pool.add(teamInput('zai', { project: 'external_project' }))
  await pool.setActive({ id: first.id })
  const other = new KeyPool(path, { credentials })
  assert.equal((await other.activeMetadata('zai', 'sk-synthetic-team-secret')).project, 'project_one')
  await pool.setActive({ id: second.id })
  assert.equal((await other.activeMetadata('zai', 'sk-synthetic-team-secret')).project, 'external_project')
  assert.deepEqual((await other.list()).filter(entry => entry.active).map(entry => entry.id), [second.id])
})

test('serial activation selects the last requested scope without split metadata', async t => {
  const { pool } = await setup(t)
  const first = await pool.add(teamInput())
  const second = await pool.add(teamInput('zai', { project: 'last_project' }))
  await Promise.all([pool.setActive({ id: first.id }), pool.setActive({ id: second.id })])
  assert.equal((await pool.activeMetadata('zai', 'sk-synthetic-team-secret')).project, 'last_project')
  assert.deepEqual((await pool.list()).filter(entry => entry.active).map(entry => entry.id), [second.id])
})
