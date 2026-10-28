import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { DEFAULT_ACCOUNT_NAME, KEY_POOL_PREFIX, KeyPool, KeyPoolService } from '../lib/key-pool.js'

const ORIGINAL = 'sk-synthetic-original'
const OTHER = 'sk-synthetic-other'
const team = (project = 'project_one') => ({ accountType: 'team', organization: 'org_one', project })
async function setup(t, entries = []) {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-key-pool-default-'))
  t.after(async () => {
    const target = resolve(dir)
    assert.ok(target.startsWith(join(tmpdir(), 'dsh-key-pool-default-')))
    await rm(target, { recursive: true, force: true })
  })
  const path = join(dir, 'key-pool.json')
  const refs = new Map()
  const writes = []
  const reads = []
  const credentials = {
    refs, writes, reads,
    resolve: async ref => { reads.push(ref); return refs.has(ref) ? { value: refs.get(ref) } : undefined },
    set: async (ref, value) => { writes.push(ref); refs.set(ref, value) },
    unset: async ref => { writes.push(ref); refs.delete(ref) },
  }
  if (entries.length) await writeFile(path, JSON.stringify({ version: 1, entries }))
  const pool = new KeyPool(path, { credentials, now: () => 123_000 })
  const service = Object.create(KeyPoolService.prototype)
  service.pool = pool
  return { path, credentials, pool, service }
}
const entry = (id, extra = {}) => ({ id, name: id, provider: 'zai', ref: `KEY_POOL_ZAI_${id.toUpperCase()}`, ...extra })
const add = (pool, extra = {}) => pool.add({ provider: 'zai', name: 'New account', value: OTHER, ...extra })
const documentAt = async path => JSON.parse(await readFile(path, 'utf8'))

test('list never imports official credentials or creates metadata as a side effect', async t => {
  const { path, credentials, pool, service } = await setup(t)
  credentials.refs.set('ZAI_API_KEY', ORIGINAL)
  assert.deepEqual(await pool.list('zai'), [])
  assert.deepEqual(await service.list(), { entries: [] })
  assert.deepEqual(credentials.writes, [])
  assert.deepEqual(credentials.reads, [], 'no pool entries means no credential inspection is needed')
  await assert.rejects(readFile(path), { code: 'ENOENT' })
})

test('legacy empty names have a stable read-only fallback without exposing credential references', async t => {
  const entries = [entry('missing', { name: undefined }), entry('empty', { name: '' }), entry('spaces', { name: '  ' }), entry('named', { name: 'My original name' })]
  const { path, credentials, service } = await setup(t, entries)
  for (const item of entries) credentials.refs.set(item.ref, ORIGINAL)
  credentials.refs.set('ZAI_API_KEY', ORIGINAL)
  const before = await readFile(path, 'utf8')
  const first = await service.list({ provider: 'zai' })
  assert.deepEqual(first.entries.map(item => item.name), [DEFAULT_ACCOUNT_NAME, DEFAULT_ACCOUNT_NAME, DEFAULT_ACCOUNT_NAME, 'My original name'])
  assert.deepEqual(await service.list({ provider: 'zai' }), first)
  assert.equal(first.entries.filter(item => item.active).length, 1)
  assert.ok(first.entries.every(item => !('value' in item) && !('ref' in item)))
  assert.ok(!JSON.stringify(first).includes(ORIGINAL))
  assert.equal(await readFile(path, 'utf8'), before)
  assert.deepEqual(credentials.writes, [])
})

for (const [provider, activeRef] of [['zai', 'ZAI_API_KEY'], ['zai-coding-cn', 'ZAI_CODING_CN_API_KEY'], ['kimi-coding', 'KIMI_API_KEY'], ['xiaomi-token-plan-cn', 'XIAOMI_TOKEN_PLAN_CN_API_KEY']]) {
  test(`${provider}: add preserves a named default without switching, then both accounts remain switchable`, async t => {
    const { path, credentials, pool, service } = await setup(t)
    credentials.refs.set(activeRef, ORIGINAL)
    const { entry: added } = await service.add({ provider, name: 'Second account', value: OTHER })
    const entries = (await service.list({ provider })).entries
    const original = entries.find(item => item.id !== added.id)
    assert.equal(entries.length, 2)
    assert.deepEqual(original, { id: original.id, name: DEFAULT_ACCOUNT_NAME, provider, configured: true, active: true })
    assert.equal(entries.find(item => item.id === added.id).active, false)
    assert.equal(credentials.refs.get(activeRef), ORIGINAL, 'adding must not switch the official key')
    assert.ok(!credentials.writes.includes(activeRef))
    assert.equal((await pool.secretOf(original.id)).value, ORIGINAL)
    assert.equal((await documentAt(path)).entries.find(item => item.id === original.id).createdAt, 123)
    assert.ok(!JSON.stringify([added, entries, await documentAt(path)]).includes('sk-synthetic'))
    await pool.setActive({ id: added.id })
    assert.equal(credentials.refs.get(activeRef), OTHER)
    await pool.setActive({ id: original.id })
    assert.equal(credentials.refs.get(activeRef), ORIGINAL)
    const reloaded = new KeyPool(path, { credentials })
    assert.equal((await reloaded.list(provider)).length, 2)
    assert.deepEqual((await reloaded.list(provider)).filter(item => item.active).map(item => item.id), [original.id])
  })
}

test('setActive persists an unpooled official key before overwriting its reference', async t => {
  const target = entry('target')
  const { path, credentials, pool } = await setup(t, [target])
  credentials.refs.set(target.ref, OTHER)
  credentials.refs.set('ZAI_API_KEY', ORIGINAL)
  const set = credentials.set
  let backupId
  credentials.set = async (ref, value) => {
    if (ref === 'ZAI_API_KEY') {
      const document = await documentAt(path)
      const backup = document.entries.find(item => item.id !== target.id)
      backupId = backup.id
      assert.equal(backup.name, DEFAULT_ACCOUNT_NAME)
      assert.equal(credentials.refs.get(backup.ref), ORIGINAL, 'both secret and its metadata must already be durable')
      assert.equal((await new KeyPool(path, { credentials }).secretOf(backup.id)).value, ORIGINAL)
    }
    await set(ref, value)
  }
  await pool.setActive({ id: target.id })
  assert.ok(backupId)
  assert.equal(credentials.refs.get('ZAI_API_KEY'), OTHER)
  assert.equal((await pool.list()).length, 2)
})

test('already-pooled current accounts retain their custom name without automatic duplicates', async t => {
  const original = entry('original', { name: 'Original custom name' })
  const foreign = entry('foreign', { provider: 'zai-coding-cn' })
  const { credentials, pool } = await setup(t, [original, foreign])
  credentials.refs.set(original.ref, ORIGINAL)
  credentials.refs.set(foreign.ref, ORIGINAL)
  credentials.refs.set('ZAI_API_KEY', ORIGINAL)
  const first = await add(pool)
  const second = await add(pool, { name: 'Third account', value: 'sk-synthetic-third' })
  assert.equal((await pool.list('zai')).length, 3)
  assert.equal((await pool.list('zai'))[0].name, 'Original custom name')
  await pool.setActive({ id: first.id })
  await pool.setActive({ id: second.id })
  await pool.setActive({ id: original.id })
  assert.equal((await pool.list('zai')).length, 3)
  assert.deepEqual((await pool.list('zai')).filter(item => item.active).map(item => item.name), ['Original custom name'])
  assert.equal((await pool.list('zai-coding-cn')).length, 1, 'preservation is isolated by provider route')
})

test('adding the unpooled official secret in the same scope uses the new user-named entry as its backup', async t => {
  const { credentials, pool } = await setup(t)
  credentials.refs.set('ZAI_API_KEY', ORIGINAL)
  const added = await add(pool, { name: 'My existing key', value: ORIGINAL, accountType: 'personal' })
  assert.deepEqual(await pool.list('zai'), [{ ...added, configured: true, active: true }])
  assert.equal(credentials.writes.length, 1, 'do not store an extra default copy of the same incoming account')
  assert.deepEqual(await pool.activeMetadata('zai', ORIGINAL), {}, 'add must not change the official scope')
  await add(pool)
  assert.equal((await pool.list('zai')).length, 2)
  assert.equal((await pool.list('zai'))[0].name, 'My existing key')
})

test('an explicit mutation names an existing blank current entry instead of duplicating it', async t => {
  const original = entry('original', { name: '' })
  const { path, credentials, pool } = await setup(t, [original])
  credentials.refs.set(original.ref, ORIGINAL)
  credentials.refs.set('ZAI_API_KEY', ORIGINAL)
  await add(pool)
  assert.equal((await pool.list('zai')).length, 2)
  assert.equal((await documentAt(path)).entries[0].name, DEFAULT_ACCOUNT_NAME)
})

test('same-secret team entries never supply an unselected official key with guessed metadata', async t => {
  const existingTeam = entry('existing-team', { name: 'Other team', ...team() })
  const { credentials, pool } = await setup(t, [existingTeam])
  credentials.refs.set(existingTeam.ref, ORIGINAL)
  credentials.refs.set('ZAI_API_KEY', ORIGINAL)
  const addedTeam = await add(pool, { value: ORIGINAL, ...team('project_two') })
  const entries = await pool.list('zai')
  assert.equal(entries.length, 3, 'the untyped official key needs its own scope-preserving backup')
  const original = entries.find(item => item.active)
  assert.equal(original.name, DEFAULT_ACCOUNT_NAME)
  assert.equal(original.accountType, undefined)
  assert.equal(original.organization, undefined)
  assert.deepEqual(await pool.activeMetadata('zai', ORIGINAL), {})
  await pool.setActive({ id: addedTeam.id })
  assert.deepEqual(await pool.activeMetadata('zai', ORIGINAL), team('project_two'))
  await pool.setActive({ id: original.id })
  assert.deepEqual(await pool.activeMetadata('zai', ORIGINAL), {})
  assert.equal((await pool.list('zai')).length, 3)
})

test('preservation prefers the selected same-secret team entry and keeps its name and project', async t => {
  const { credentials, pool } = await setup(t)
  const first = await add(pool, { name: 'First team', value: ORIGINAL, ...team() })
  const selected = await add(pool, { name: 'Selected team', value: ORIGINAL, ...team('project_two') })
  await pool.setActive({ id: selected.id })
  const other = await add(pool)
  assert.equal((await pool.list('zai')).length, 3, 'a selected team already in the pool is not backed up again')
  assert.deepEqual((await pool.list('zai')).filter(item => item.active).map(item => item.id), [selected.id])
  await pool.setActive({ id: other.id })
  await pool.setActive({ id: selected.id })
  assert.deepEqual(await pool.activeMetadata('zai', ORIGINAL), team('project_two'))
  assert.equal((await pool.list('zai')).find(item => item.id === selected.id).name, 'Selected team')
  assert.equal((await pool.list('zai')).find(item => item.id === first.id).active, false)
})

test('a removed selected team is preserved with its bound scope, not another same-secret project', async t => {
  const { path, credentials, pool } = await setup(t)
  const removed = await add(pool, { value: ORIGINAL, ...team() })
  await add(pool, { name: 'Other team', value: ORIGINAL, ...team('project_two') })
  await pool.setActive({ id: removed.id })
  await pool.remove({ id: removed.id })
  const other = await add(pool)
  const preserved = (await pool.list('zai')).find(item => item.active)
  assert.equal(preserved.name, DEFAULT_ACCOUNT_NAME)
  assert.deepEqual({ accountType: preserved.accountType, organization: preserved.organization, project: preserved.project }, team())
  assert.equal((await documentAt(path)).activeSelections.zai.entryId, preserved.id)
  await pool.setActive({ id: other.id })
  await pool.setActive({ id: preserved.id })
  assert.deepEqual(await pool.activeMetadata('zai', ORIGINAL), team())
  assert.equal(credentials.refs.get('ZAI_API_KEY'), ORIGINAL)
  assert.equal((await pool.list('zai')).length, 3)
})

test('a re-added removed selected account can itself preserve the official key and selected scope', async t => {
  const { credentials, pool } = await setup(t)
  const old = await add(pool, { value: ORIGINAL, ...team() })
  await pool.setActive({ id: old.id })
  await pool.remove({ id: old.id })
  const replacement = await add(pool, { name: 'Restored team', value: ORIGINAL, ...team() })
  assert.deepEqual(await pool.list('zai'), [{ ...replacement, configured: true, active: true }])
  assert.deepEqual(await pool.activeMetadata('zai', ORIGINAL), team())
  assert.equal(credentials.refs.get('ZAI_API_KEY'), ORIGINAL)
})

test('external changes to the official secret fence stale selected team metadata', async t => {
  const { credentials, pool } = await setup(t)
  const selected = await add(pool, { value: ORIGINAL, ...team() })
  await pool.setActive({ id: selected.id })
  credentials.refs.set('ZAI_API_KEY', 'sk-synthetic-external')
  await add(pool)
  const preserved = (await pool.list('zai')).find(item => item.active)
  assert.equal(preserved.name, DEFAULT_ACCOUNT_NAME)
  assert.equal(preserved.accountType, undefined)
  assert.deepEqual(await pool.activeMetadata('zai', 'sk-synthetic-external'), {})
})

for (const operation of ['add', 'setActive']) {
  for (const failure of ['credential', 'metadata']) {
    test(`${operation} aborts when ${failure} preservation fails, leaving the official key untouched`, async t => {
      const target = entry('target')
      const { path, credentials, pool } = await setup(t, [target])
      credentials.refs.set(target.ref, OTHER)
      credentials.refs.set('ZAI_API_KEY', ORIGINAL)
      const before = await readFile(path, 'utf8')
      const set = credentials.set
      const save = pool.save.bind(pool)
      if (failure === 'credential') credentials.set = async (ref, value) => {
        if (ref.startsWith(KEY_POOL_PREFIX)) throw new Error('backup credential failed')
        await set(ref, value)
      }
      else pool.save = async () => { throw new Error('backup metadata failed') }
      const invoke = () => operation === 'add' ? add(pool) : pool.setActive({ id: target.id })
      await assert.rejects(invoke(), /backup (credential|metadata) failed/u)
      assert.equal(credentials.refs.get('ZAI_API_KEY'), ORIGINAL)
      assert.ok(!credentials.writes.includes('ZAI_API_KEY'))
      assert.equal(await readFile(path, 'utf8'), before)
      assert.equal((await pool.list('zai')).length, 1, 'staged backup metadata must not leak after persistence fails')
      credentials.set = set
      pool.save = save
      await invoke()
      assert.equal((await pool.list('zai')).filter(item => item.name === DEFAULT_ACCOUNT_NAME).length, 1, 'a failed mutation must not poison the serialization chain')
    })
  }
}

test('invalid activation targets are rejected before reading or preserving unrelated official keys', async t => {
  const entries = [entry('missing-secret'), entry('unsupported', { provider: 'openai-codex' }), entry('bad-team', { accountType: 'team' })]
  const { path, credentials, pool } = await setup(t, entries)
  credentials.refs.set('ZAI_API_KEY', ORIGINAL)
  credentials.refs.set(entries[1].ref, OTHER)
  credentials.refs.set(entries[2].ref, OTHER)
  const before = await readFile(path, 'utf8')
  for (const id of ['not-found', ...entries.map(item => item.id)]) await assert.rejects(pool.setActive({ id }))
  assert.deepEqual(credentials.writes, [])
  assert.ok(!credentials.reads.includes('ZAI_API_KEY'))
  assert.equal(await readFile(path, 'utf8'), before)
})

test('concurrent explicit adds preserve the original only once without switching it', async t => {
  const { credentials, pool } = await setup(t)
  credentials.refs.set('ZAI_API_KEY', ORIGINAL)
  await Promise.all([add(pool, { name: 'First' }), add(pool, { name: 'Second' })])
  const entries = await pool.list('zai')
  assert.equal(entries.length, 3)
  assert.equal(entries.filter(item => item.name === DEFAULT_ACCOUNT_NAME).length, 1)
  assert.deepEqual(entries.filter(item => item.active).map(item => item.name), [DEFAULT_ACCOUNT_NAME])
  assert.equal(credentials.refs.get('ZAI_API_KEY'), ORIGINAL)
})
