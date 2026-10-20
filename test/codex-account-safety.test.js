import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { execFileSync } from 'node:child_process'
import { CodexAccounts, CODEX_ACCOUNT_PREFIX as PREFIX, CODEX_OFFICIAL_RECORD as OFFICIAL, readCliGrant, sameCodexAccount } from '../lib/codex-accounts.js'
import { SearchLoginService } from '../lib/index.js'

const now = 1800000000000
const token = (email, expires = now + 3600000) => `header.${Buffer.from(JSON.stringify({ exp: expires / 1000, email })).toString('base64url')}.signature`
const grant = (email, accountId = email, expires = now + 3600000) => ({ type: 'oauth', access: token(email, expires), refresh: `refresh-${email}`, accountId, expires })
const record = payload => ({ kind: 'grant', payload })
const noUndefined = value => { if (value && typeof value === 'object') for (const item of Object.values(value)) { assert.notEqual(item, undefined, 'official strict JSON payload rejects undefined'); noUndefined(item) } }
function credentials(initial) {
  const records = new Map(initial ? [[OFFICIAL, record(initial)]] : [])
  const writes = []
  return {
    records, writes,
    readRecord: async key => records.get(key),
    listRecords: async () => [...records].map(([key, value]) => ({ key, kind: value.kind })),
    modifyRecord: async (key, mutate) => { const next = await mutate(records.get(key)); if (next !== undefined) { noUndefined(next); writes.push(key); records.set(key, next) } return records.get(key) },
    deleteRecord: async key => { records.delete(key) },
  }
}
const poolFor = (store, options = {}) => new CodexAccounts({ credentials: store, now: () => now, sources: [], ...options })
async function temporary(t) {
  const dir = await mkdtemp(join(tmpdir(), 'codex-account-safety-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  return dir
}
async function auth(dir, payload = grant('cli@test')) {
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'auth.json'), JSON.stringify({ tokens: { access_token: payload.access, refresh_token: payload.refresh, account_id: payload.accountId } }), { mode: 0o600 })
}
const settle = async () => { for (let i = 0; i < 5; i++) await new Promise(resolve => setImmediate(resolve)) }
function bridge(store, pool, begin) {
  const svc = Object.create(SearchLoginService.prototype)
  Object.defineProperty(svc, 'ctx', { value: { credentials: store, authorization: { describe: () => ({}), begin } } })
  svc.accounts = pool; svc.attempts = new Map()
  return svc
}

test('legacy web-only account is captured before switching, without changing its active grant', async () => {
  const a = grant('original@test'), b = grant('cli@test')
  const store = credentials(a), pool = poolFor(store)
  const before = JSON.stringify(store.records.get(OFFICIAL))
  const entries = await pool.list()
  assert.equal(entries.length, 1)
  assert.equal(entries[0].source, 'existing')
  assert.equal(entries[0].active, true)
  assert.equal(JSON.stringify(store.records.get(OFFICIAL)), before)
  const added = await pool.saveGrant(b, { source: 'cli', name: 'cli' })
  await pool.setActive({ id: added.id })
  assert.equal(store.records.get(OFFICIAL).payload.access, b.access)
  assert.ok((await pool.list()).some(entry => entry.email === 'original@test'))
  await pool.setActive({ id: entries[0].id })
  assert.equal(store.records.get(OFFICIAL).payload.access, a.access)
  await assert.rejects(pool.remove({ id: entries[0].id }), /不能删除当前账号/u)
})

test('official browser OAuth A to B preserves both, names B, and does not replace OAuth implementation', async () => {
  const a = grant('original@test'), b = grant('new@test')
  const store = credentials(a), pool = poolFor(store)
  let started = 0
  const svc = bridge(store, pool, async () => {
    started++
    assert.ok((await pool.slots()).some(slot => slot.payload.access === a.access), 'backup must precede OAuth write')
    store.records.set(OFFICIAL, record(b))
    return { status: 'authorized' }
  })
  const attempt = svc.start({ key: OFFICIAL, accountName: 'second browser login' })
  await settle()
  assert.equal(started, 1)
  assert.equal(svc.status(attempt.id).status, 'authorized')
  const entries = await pool.list()
  assert.equal(entries.length, 2)
  assert.equal(entries.find(entry => entry.email === 'new@test').source, 'web')
  assert.equal(entries.find(entry => entry.email === 'new@test').name, 'second browser login')
  assert.equal(entries.find(entry => entry.email === 'original@test').active, false)
})

test('failed/cancelled browser login retains original; failed capture prevents OAuth entirely', async () => {
  for (const outcome of ['cancelled', 'failed']) {
    const original = grant('original@test'), store = credentials(original), pool = poolFor(store)
    const svc = bridge(store, pool, async () => { if (outcome === 'failed') throw new Error('PRIVATE_TOKEN'); return { status: outcome } })
    const attempt = svc.start({ key: OFFICIAL })
    await settle()
    assert.equal(svc.status(attempt.id).status, outcome)
    assert.equal((await pool.list()).length, 1)
    assert.equal(store.records.get(OFFICIAL).payload.access, original.access)
    assert.ok(!JSON.stringify(svc.status(attempt.id)).includes('PRIVATE_TOKEN'))
  }
  const store = credentials(grant('original@test')), pool = poolFor(store)
  pool.captureOfficial = async () => { throw new Error('Cannot save prior account') }
  let started = false
  const svc = bridge(store, pool, async () => { started = true })
  const attempt = svc.start({ key: OFFICIAL })
  await settle()
  assert.equal(started, false)
  assert.equal(svc.status(attempt.id).status, 'failed')
})

test('account identity does not merge different users of one team or different teams of one user', () => {
  assert.equal(sameCodexAccount(grant('a@test', 'team'), grant('b@test', 'team')), false)
  assert.equal(sameCodexAccount(grant('a@test', 'team-1'), grant('a@test', 'team-2')), false)
  assert.equal(sameCodexAccount(grant('a@test', 'team'), grant('a@test', 'team', now + 7200000)), true)
})

test('queued credential notifications retain intermediate logins, not just the final current account', async () => {
  const store = credentials(grant('first@test')), pool = poolFor(store)
  let release
  const blocker = new Promise(resolve => { release = resolve })
  pool.chain = blocker
  store.records.set(OFFICIAL, record(grant('second@test')))
  const second = pool.rememberOfficialChange()
  store.records.set(OFFICIAL, record(grant('third@test')))
  const third = pool.rememberOfficialChange()
  release()
  await Promise.all([second, third])
  const entries = await pool.list()
  assert.deepEqual(entries.map(entry => entry.email).sort(), ['second@test', 'third@test'])
})

test('cross-process change during switch is refused rather than overwriting an unpreserved account', async () => {
  const store = credentials(grant('first@test')), pool = poolFor(store)
  const slot = await pool.saveGrant(grant('chosen@test'))
  const modify = store.modifyRecord
  store.modifyRecord = async (key, mutate) => {
    if (key === OFFICIAL) {
      let next
      // Read-only barrier remains harmless; simulate a writer only before the
      // actual switch callback, after its current record has been captured.
      return modify(key, async old => {
        next = await mutate(old)
        if (next !== undefined) {
          store.records.set(OFFICIAL, record(grant('racer@test')))
          return mutate(store.records.get(OFFICIAL))
        }
        return undefined
      })
    }
    return modify(key, mutate)
  }
  await assert.rejects(pool.setActive({ id: slot.id }), /发生变化/u)
  assert.equal(store.records.get(OFFICIAL).payload.accountId, 'racer@test')
  assert.ok((await pool.slots()).some(entry => entry.payload.accountId === 'first@test'))
})

test('authoritative capture fences stale cached official snapshots against a newer disk record', async () => {
  const old = grant('same@test'), fresh = grant('same@test', 'same@test', now + 7200000)
  const store = credentials(old), pool = poolFor(store)
  const slot = await pool.saveGrant(fresh)
  const modify = store.modifyRecord
  store.modifyRecord = async (key, mutate) => {
    if (key.startsWith(PREFIX)) store.records.set(OFFICIAL, record(fresh))
    return modify(key, mutate)
  }
  await assert.rejects(pool.captureOfficial({ authoritative: true }), /未覆盖账号池/u)
  assert.equal((await pool.grant(slot.id)).access, fresh.access)
})

test('optional OAuth fields round-trip through strict JSON and expired switches are refused', async () => {
  const minimal = { type: 'oauth', access: token('minimal@test') }
  const store = credentials(minimal), pool = poolFor(store)
  await pool.captureOfficial()
  const b = await pool.saveGrant(grant('second@test'))
  await pool.setActive({ id: b.id })
  const a = (await pool.list()).find(entry => entry.email === 'minimal@test')
  await pool.setActive({ id: a.id })
  noUndefined(store.records.get(OFFICIAL).payload)
  const expired = await pool.saveGrant(grant('expired@test', 'expired', now - 1000))
  await assert.rejects(pool.setActive({ id: expired.id }), /已过期/u)
})

test('CLI discovery follows explicit roots/launchers, dedupes paths, and accepts a selected directory', async t => {
  const home = await temporary(t)
  const global = join(home,'.codex'), cc = join(global,'.cc-switch-launches','different-hash'), extra = join(home,'other-home')
  await Promise.all([auth(global), auth(cc, grant('gth@test')), auth(extra, grant('extra@test'))])
  await mkdir(join(home,'.local','bin'), { recursive: true })
  await writeFile(join(home,'.local','bin','codex-gth'), `#!/bin/sh\nexport CODEX_HOME="${cc}"\nexit 99\n`)
  await writeFile(join(home,'.local','bin','codex-comment'), `# CODEX_HOME="${extra}"\necho CODEX_HOME="${extra}"\n`)
  await symlink(global, join(home,'alias'))
  const pool = poolFor(credentials(), { home, env: { CODEX_HOME: join(home,'alias') }, sources: undefined })
  const view = await pool.sourcesView({})
  assert.equal(view.sources.filter(source => source.authPath === join(global,'auth.json')).length, 1)
  assert.equal(view.sources.filter(source => source.path === cc).length, 1)
  assert.ok(view.sources.some(source => source.label === 'codex-gth'))
  assert.ok(!view.sources.some(source => source.path === extra), 'echoes/comments are not executable assignments')
  assert.ok(view.policy.includes('不执行启动器'))
  const custom = await pool.sourcesView({ directory: extra })
  assert.equal(custom.sources.find(source => source.id === 'directory').path, extra)
  const imported = await pool.importFrom({ directory: extra, name: 'manual' })
  assert.equal(imported.email, 'extra@test')
  assert.equal(await pool.officialPayload(), undefined, 'import does not silently activate')
  await assert.rejects(pool.sourcesView({ directory: 'relative/path' }), /绝对目录/u)
  assert.ok(!JSON.stringify(view).includes('refresh-'))
  assert.ok(!JSON.stringify(view).includes('header.'))
})

test('bad auth/JWT sources are isolated; expired OAuth is discoverable and API-key auth is not OAuth', async t => {
  const home = await temporary(t), root = join(home,'.codex'), launches = join(root,'.cc-switch-launches')
  await auth(root)
  for (const [name, claims] of [['null', null], ['array', []], ['string', 'oops'], ['big', { exp: 1e100 }]]) {
    const dir = join(launches,name)
    await mkdir(dir, { recursive: true })
    const access = `header.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.signature`
    await writeFile(join(dir,'auth.json'), JSON.stringify({ tokens: { access_token: access, refresh_token: 'SECRET', account_id: 'x' } }))
    assert.equal(await readCliGrant(join(dir,'auth.json')), undefined)
  }
  await auth(join(launches,'expired'), grant('expired@test','x',now-10000))
  await mkdir(join(launches,'apikey'), { recursive: true })
  await writeFile(join(launches,'apikey','auth.json'), JSON.stringify({ OPENAI_API_KEY: 'SECRET', auth_mode: 'apikey' }))
  const view = await poolFor(credentials(), { home, env: {}, sources: undefined }).sourcesView()
  assert.equal(view.sources.filter(source => source.status === 'invalid').length, 4)
  assert.equal(view.sources.filter(source => source.status === 'ready').length, 1)
  assert.equal(view.sources.find(source => source.status === 'expired').available, true)
  assert.equal(view.sources.find(source => source.status === 'api-key').available, false)
})

test('nonregular auth files and launcher FIFOs cannot block discovery', { skip: process.platform === 'win32' }, async t => {
  const home = await temporary(t)
  await mkdir(join(home,'.codex'), { recursive: true })
  await mkdir(join(home,'.local','bin'), { recursive: true })
  execFileSync('mkfifo', [join(home,'.codex','auth.json'), join(home,'.local','bin','codex-pipe')])
  const result = await poolFor(credentials(), { home, env: {}, sources: undefined }).sourcesView()
  assert.equal(result.sources[0].status, 'invalid')
})

test('real credentials-local writer preserves strict JSON, locking, notifications and disk reconciliation', async t => {
  const root = process.env.DSH_TEST_RUNTIME_ROOT
  if (!root) { t.skip('Set DSH_TEST_RUNTIME_ROOT to run the official credentials-local integration'); return }
  const { LocalCredentialProvider } = await import(pathToFileURL(join(root,'node_modules/@deepseek-ai/dsh-credentials-local/lib/index.js')))
  const dir = await temporary(t), filename = join(dir,'.credentials.yaml')
  function local() {
    return Object.assign(Object.create(LocalCredentialProvider.prototype), { spec: { filename, watch: false }, values: new Map(), records: new Map(), operations: Promise.resolve(), closed: false, notifyRecordUpdated() {}, notifyUpdated() {} })
  }
  const one = local(), two = local()
  await one.loadInitial(); await two.loadInitial()
  await one.modifyRecord(OFFICIAL, async () => record(grant('one@test')))
  const pool = poolFor(two)
  assert.equal(await two.readRecord(OFFICIAL), undefined, 'second process cache has not watched the write yet')
  await pool.captureOfficial()
  assert.equal((await pool.list())[0].email, 'one@test', 'read-only lock barrier reconciles disk')
  const second = await pool.saveGrant(grant('two@test'))
  // Exercise callback notifications while the document writer lock is held.
  two.notifyRecordUpdated = key => { if (key === OFFICIAL) void pool.rememberOfficialChange() }
  await pool.setActive({ id: second.id })
  await pool.chain
  assert.equal((await pool.list()).length, 2)
  assert.ok((await readFile(filename,'utf8')).includes('codex-account-'))
})
