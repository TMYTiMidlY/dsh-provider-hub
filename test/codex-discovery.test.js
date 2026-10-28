import test from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { performance } from 'node:perf_hooks'
import { CodexAccounts, CODEX_ACCOUNT_PREFIX } from '../lib/codex-accounts.js'
import { CodexDiscovery, DISCOVERY_LIMITS, literalCodexHomes } from '../lib/codex-discovery.js'

const NOW = 1800000000000
const jwt = (email, expires = NOW + 3600000) => `header.${Buffer.from(JSON.stringify({ email, exp: expires / 1000 })).toString('base64url')}.signature`
const grant = email => ({ type: 'oauth', access: jwt(email), refresh: 'PRIVATE_REFRESH', accountId: email, expires: NOW + 3600000 })
function credentials() {
  const records = new Map()
  return {
    records,
    async listRecords() { return [...records.keys()].map(key => ({ key })) },
    async readRecord(key) { return records.get(key) },
    async modifyRecord(key, mutate) { const next = await mutate(records.get(key)); if (next !== undefined) records.set(key, next); return records.get(key) },
  }
}
async function temporary(t) {
  const dir = await fs.mkdtemp(join(tmpdir(), 'codex-discovery-'))
  t.after(() => fs.rm(dir, { recursive: true, force: true }))
  return dir
}
async function auth(path, email = 'cli@test') {
  await fs.mkdir(path, { recursive: true })
  await fs.writeFile(join(path, 'auth.json'), JSON.stringify({ tokens: { access_token: jwt(email), refresh_token: 'PRIVATE_REFRESH', account_id: email } }))
}
const pool = (home, extra = {}) => new CodexAccounts({ credentials: credentials(), home, env: {}, now: () => NOW, ...extra })
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))

// Wall-clock assertions use generous margins; actual scans use small injected
// limits, never slow real mounts or an eight-second test sleep.
test('generic shallow features find nested homes, preserve missing default, and return only safe metadata', async t => {
  const home = await temporary(t)
  const nested = join(home, 'my-Codex-homes', 'profiles', 'team')
  const shallow = join(home, '.config', 'assistant', 'work')
  const configOnly = join(home, '.local', 'share', 'cli-profile')
  await Promise.all([auth(nested, 'nested@test'), auth(shallow, 'shallow@test'), fs.mkdir(configOnly, { recursive: true })])
  await fs.writeFile(join(configOnly, 'config.toml'), 'model_provider = "openai"\n')
  const view = await pool(home).sourcesView()
  assert.equal(view.globalPath, join(home, '.codex'))
  assert.equal(view.sources.find(source => source.default).status, 'missing')
  for (const path of [nested, shallow, configOnly]) assert.ok(view.sources.some(source => source.path === path), path)
  assert.equal(view.sources.find(source => source.path === configOnly).status, 'missing')
  assert.deepEqual(Object.keys(view.scan).sort(), ['budgetMs', 'checkedDirectories', 'elapsedMs', 'timedOut', 'truncated'])
  assert.equal(view.scan.budgetMs, 8000)
  assert.equal(view.scan.timedOut, false)
  assert.ok(view.scan.checkedDirectories <= 160)
  assert.ok(!/PRIVATE_REFRESH|header\.|access_token|refresh_token/u.test(JSON.stringify(view)))
})

test('literal declarations are generic, multiline, non-executing, and reject shell concatenation/substitution', async t => {
  const home = await temporary(t), root = await temporary(t)
  const first = join(root, 'one'), second = join(root, 'two'), marker = join(root, 'EXECUTED')
  await Promise.all([auth(first), auth(second), fs.mkdir(join(home, '.local', 'bin'), { recursive: true })])
  await fs.writeFile(join(home, '.local', 'bin', 'work-assistant'), `#!/bin/sh\ntouch '${marker}'\nexport CODEX_HOME="${first}"\nexec env CODEX_HOME='${second}' codex\n`)
  await fs.writeFile(join(home, '.profile'), `CODEX_HOME="${first}"\n`)
  const view = await pool(home).sourcesView()
  assert.equal(view.sources.filter(source => source.path === first).length, 1)
  assert.equal(view.sources.filter(source => source.path === second).length, 1)
  await assert.rejects(fs.stat(marker), { code: 'ENOENT' })
  assert.deepEqual(literalCodexHomes('# CODEX_HOME=/ignored\necho CODEX_HOME=/ignored\nCODEX_HOME="/x"$(evil)\nCODEX_HOME=/x$(evil)\nCODEX_HOME="/x"suffix\nCODEX_HOME=\'$HOME/x\'\nexport CODEX_HOME="${HOME}/codex work"\nenv CODEX_HOME=/absolute codex\n'), ['${HOME}/codex work', '/absolute'])
})

test('manual directory checks do not enumerate, read history, inspect defaults or recurse', async t => {
  const home = await temporary(t), chosen = join(home, 'selected')
  await auth(chosen)
  const opened = [], store = credentials()
  store.listRecords = async () => { throw new Error('history must not be consulted') }
  const accounts = pool(home, { credentials: store, env: { CODEX_HOME: '/unrelated' }, discovery: { fs: { ...fs, opendir: () => { throw new Error('must not enumerate') }, open: async (path, flags) => { opened.push(path); return fs.open(path, flags) } } } })
  const view = await accounts.sourcesView({ directory: chosen })
  assert.equal(view.sources.length, 1)
  assert.equal(view.sources[0].id, 'directory')
  assert.equal(view.scan.checkedDirectories, 1)
  assert.deepEqual(opened, [join(chosen, 'auth.json')])
  assert.equal(view.globalPath, undefined)
  assert.equal((await accounts.sourcesView({ directory: join(chosen, 'gone') })).sources[0].status, 'missing')
  await assert.rejects(accounts.sourcesView({ directory: 'relative' }), /绝对目录/u)
  await assert.rejects(accounts.sourcesView({ directory: '' }), /绝对目录/u)
  await assert.rejects(accounts.importFrom({ directory: ' ' }), /绝对目录/u)
})

test('historical imported paths remain discoverable without arbitrary home recursion', async t => {
  const home = await temporary(t), outside = join(await temporary(t), 'personal-cli')
  await auth(outside, 'history@test')
  const store = credentials()
  store.records.set(CODEX_ACCOUNT_PREFIX + '1234abcd', { kind: 'grant', payload: { ...grant('history@test'), sourcePath: outside } })
  const view = await pool(home, { credentials: store }).sourcesView()
  assert.equal(view.sources.find(source => source.path === outside).email, 'history@test')
  assert.equal(view.sources.find(source => source.path === outside).label, '历史导入目录')
})

test('import reuses cached definitions, rechecks auth, never rediscovers and reports lost/API-key files', async t => {
  const home = await temporary(t), chosen = join(home, 'codex-personal')
  await auth(chosen, 'before@test')
  let enumerations = 0
  const accounts = pool(home, { discovery: { fs: { ...fs, opendir: async path => { enumerations++; return fs.opendir(path) } } } })
  const view = await accounts.sourcesView(), id = view.sources.find(source => source.path === chosen).id
  const before = enumerations
  await auth(chosen, 'after@test')
  assert.equal((await accounts.importFrom({ source: id })).email, 'after@test')
  assert.equal(enumerations, before)
  await fs.rm(join(chosen, 'auth.json'))
  await assert.rejects(accounts.importFrom({ source: id }), /没有 auth.json/u)
  await fs.writeFile(join(chosen, 'auth.json'), JSON.stringify({ auth_mode: 'apikey', OPENAI_API_KEY: 'PRIVATE_KEY' }))
  await assert.rejects(accounts.importFrom({ source: id }), /API Key/u)
  await assert.rejects(accounts.importFrom({ source: 'cli-forged' }), /未找到/u)
  assert.equal(enumerations, before)
})

test('a slow open returns promptly and late completion only closes, never stats/reads or reschedules', async t => {
  const home = await temporary(t), chosen = join(home, 'manual')
  await auth(chosen)
  let release, stats = 0, reads = 0, closed = 0, opens = 0
  const accounts = pool(home, { discovery: { limits: { ioTimeoutMs: 20, budgetMs: 80 }, fs: { ...fs, open: () => { opens++; return new Promise(resolve => { release = () => resolve({ stat: async () => { stats++ }, read: async () => { reads++ }, close: async () => { closed++ } }) }) } } } })
  const start = performance.now(), view = await accounts.sourcesView({ directory: chosen })
  assert.ok(performance.now() - start < 300)
  assert.equal(view.scan.timedOut, true)
  assert.equal(view.sources[0].status, 'timed-out')
  assert.equal(view.sources[0].available, false)
  release()
  await delay(5)
  assert.deepEqual({ opens, stats, reads, closed }, { opens: 1, stats: 0, reads: 0, closed: 1 })
})

test('the total budget includes auth inspection and no I/O starts after the scan returns', async t => {
  const home = await temporary(t), paths = []
  const accounts = pool(home, { discovery: { limits: { budgetMs: 35, ioTimeoutMs: 100 }, fs: { ...fs, lstat: async path => { paths.push(path); await delay(25); return fs.lstat(path) } } } })
  const start = performance.now(), view = await accounts.sourcesView()
  const count = paths.length
  assert.ok(performance.now() - start < 300)
  assert.equal(view.scan.timedOut, true)
  assert.ok(view.sources.some(source => source.default), 'default preview is prioritized before traversal')
  await delay(60)
  assert.equal(paths.length, count, 'late results cannot restart the stopped traversal')
})

test('hung physical I/O remains concurrency-bounded across repeated requests', async t => {
  const home = await temporary(t), releases = []
  for (const file of ['.profile', '.bash_profile', '.bashrc', '.zprofile', '.zshrc']) await fs.writeFile(join(home, file), '# ordinary startup file\n')
  let active = 0, peak = 0
  const accounts = pool(home, { discovery: { limits: { ioTimeoutMs: 15, budgetMs: 80 }, fs: { ...fs, open: async (path, flags) => {
    if (!/\.(?:profile|bash_profile|bashrc|zprofile|zshrc)$/u.test(path)) return fs.open(path, flags)
    active++; peak = Math.max(peak, active)
    return new Promise(resolve => releases.push(() => { active--; resolve({ close: async () => {} }) }))
  } } } })
  const first = await accounts.sourcesView(), second = await accounts.sourcesView()
  assert.equal(first.scan.timedOut, true)
  assert.equal(second.scan.timedOut, true)
  assert.equal(peak, 4)
  assert.equal(releases.length, 4)
  for (const release of releases) release()
  await delay(5)
  assert.equal(accounts.discovery.pending, 0)
})

test('slow realpath preserves default metadata and a slow credential history cannot stall discovery', async t => {
  const home = await temporary(t)
  await auth(join(home, 'codex-ready'), 'ready@test')
  const slowPath = pool(home, { discovery: { limits: { ioTimeoutMs: 15, budgetMs: 100 }, fs: { ...fs, realpath: () => new Promise(() => {}) } } })
  const view = await slowPath.sourcesView()
  assert.equal(view.sources.find(source => source.default).status, 'timed-out')
  assert.equal(view.globalPath, join(home, '.codex'))
  assert.equal(view.scan.timedOut, true)
  const store = credentials()
  store.listRecords = () => new Promise(() => {})
  const history = await pool(home, { credentials: store, discovery: { limits: { ioTimeoutMs: 15, budgetMs: 150 } } }).sourcesView()
  assert.equal(history.scan.timedOut, true)
  assert.ok(history.sources.some(source => source.email === 'ready@test'))
})

test('a slow close cannot wedge preview/import and retains its resource slot', async t => {
  const home = await temporary(t), chosen = join(home, 'selected'), releases = []
  await auth(chosen)
  const accounts = pool(home, { discovery: { limits: { ioTimeoutMs: 15, budgetMs: 80 }, fs: { ...fs, open: async (path, flags) => {
    const handle = await fs.open(path, flags)
    return { stat: () => handle.stat(), read: (...args) => handle.read(...args), close: () => new Promise(resolve => releases.push(async () => { await handle.close(); resolve() })) }
  } } } })
  const view = await accounts.sourcesView({ directory: chosen })
  assert.equal(view.scan.timedOut, true)
  assert.equal(view.sources[0].status, 'ready')
  assert.equal(accounts.discovery.closing, 1)
  assert.equal((await accounts.importFrom({ directory: chosen })).email, 'cli@test')
  assert.equal(accounts.discovery.closing, 2)
  for (const release of releases) await release()
  await delay(5)
  assert.equal(accounts.discovery.closing, 0)
})

test('a CODEX_HOME alias to home never broadens traversal to unrelated subtrees', async t => {
  const home = await temporary(t)
  await auth(join(home, 'unrelated', 'deep'), 'do-not-crawl@test')
  const view = await pool(home, { env: { CODEX_HOME: home } }).sourcesView()
  assert.ok(!view.sources.some(source => source.email === 'do-not-crawl@test'))
  assert.equal(view.globalPath, home)
})

test('directory, source, depth, entry and operation caps report partial scans', async t => {
  const home = await temporary(t)
  for (let i = 0; i < 8; i++) await auth(join(home, `codex-${i}`, 'nested', 'deep'), `${i}@test`)
  const bounded = await pool(home, { discovery: { limits: { maxDirectories: 5 } } }).sourcesView()
  assert.ok(bounded.scan.checkedDirectories <= 5)
  assert.equal(bounded.scan.truncated, true)
  const shallow = await pool(home, { discovery: { limits: { maxDepth: 1 } } }).sourcesView()
  assert.equal(shallow.scan.truncated, true)
  assert.ok(!shallow.sources.some(source => source.email))
  const limitedEntries = await pool(home, { discovery: { limits: { entriesPerDirectory: 2, maxEntries: 3 } } }).sourcesView()
  assert.equal(limitedEntries.scan.truncated, true)
  const operationCap = await pool(home, { discovery: { limits: { maxOperations: 3 } } }).sourcesView()
  assert.equal(operationCap.scan.truncated, true)
  const capped = pool(home, { discovery: { limits: { maxSources: 2 } } })
  for (let i = 0; i < 5; i++) await auth(join(home, `codex-direct-${i}`))
  const sources = await capped.sourcesView()
  assert.ok(sources.sources.length <= 2)
  assert.equal(sources.scan.truncated, true)
  assert.ok(capped.discovery.cached.size <= 2)
  const hard = new CodexDiscovery({ limits: Object.fromEntries(Object.keys(DISCOVERY_LIMITS).map(key => [key, 1e9])) })
  assert.deepEqual(hard.limits, DISCOVERY_LIMITS)
})

test('auth and declaration size caps reject before reading oversized files', async t => {
  const home = await temporary(t), chosen = join(home, 'selected')
  await fs.mkdir(chosen)
  await fs.writeFile(join(chosen, 'auth.json'), 'x'.repeat(DISCOVERY_LIMITS.authBytes + 1))
  const accounts = pool(home)
  assert.equal((await accounts.sourcesView({ directory: chosen })).sources[0].status, 'invalid')
  await fs.mkdir(join(home, '.local', 'bin'), { recursive: true })
  const outside = join(await temporary(t), 'outside')
  await auth(outside)
  await fs.writeFile(join(home, '.local', 'bin', 'too-big'), `CODEX_HOME="${outside}"\n${'#'.repeat(DISCOVERY_LIMITS.textBytes)}`)
  assert.ok(!(await accounts.sourcesView()).sources.some(source => source.path === outside))
})

test('unreadable, API-key, missing and expired auth have explicit non-secret statuses', async t => {
  const home = await temporary(t)
  await auth(join(home, '.codex'))
  const accounts = pool(home, { discovery: { fs: { ...fs, open: async (path, flags) => { if (path === join(home, '.codex', 'auth.json')) throw Object.assign(new Error('PRIVATE'), { code: 'EACCES' }); return fs.open(path, flags) } } } })
  const unreadable = await accounts.sourcesView()
  assert.equal(unreadable.sources[0].status, 'unreadable')
  assert.ok(!JSON.stringify(unreadable).includes('PRIVATE'))
  const chosen = join(home, 'selected')
  await fs.mkdir(chosen)
  await fs.writeFile(join(chosen, 'auth.json'), JSON.stringify({ tokens: { access_token: jwt('expired@test', NOW - 1000), refresh_token: 'PRIVATE_REFRESH', account_id: 'expired' } }))
  const expired = await accounts.sourcesView({ directory: chosen })
  assert.equal(expired.sources[0].status, 'expired')
  assert.equal(expired.sources[0].available, true)
  await fs.writeFile(join(chosen, 'auth.json'), JSON.stringify({ auth_mode: 'apikey', OPENAI_API_KEY: 'PRIVATE_KEY' }))
  assert.equal((await accounts.sourcesView({ directory: chosen })).sources[0].status, 'api-key')
})

test('automatic traversal refuses directory/ancestor/auth symlinks; explicit directory aliases dedupe', { skip: process.platform === 'win32' }, async t => {
  const home = await temporary(t), outside = await temporary(t)
  await auth(join(outside, 'share'), 'ancestor-link@test')
  await auth(join(outside, 'share', 'cli'), 'outside@test')
  await auth(join(outside, 'actual'), 'alias@test')
  await fs.symlink(outside, join(home, '.local'))
  await fs.symlink(join(outside, 'actual'), join(home, 'codex-alias'))
  const direct = join(home, 'codex-direct')
  await fs.mkdir(direct)
  await fs.symlink(join(outside, 'actual', 'auth.json'), join(direct, 'auth.json'))
  const accounts = pool(home)
  const automatic = await accounts.sourcesView()
  assert.ok(!automatic.sources.some(source => ['outside@test', 'alias@test', 'ancestor-link@test'].includes(source.email)))
  assert.equal(automatic.sources.find(source => source.path === direct).status, 'invalid')
  const explicit = pool(home, { env: { CODEX_HOME: join(home, 'codex-alias') } })
  const view = await explicit.sourcesView()
  assert.equal(view.sources.filter(source => source.email === 'alias@test').length, 1)
  assert.equal(view.sources.find(source => source.default).path, join(outside, 'actual'))
  assert.equal((await accounts.sourcesView({ directory: join(home, 'codex-alias') })).sources[0].email, 'alias@test')
})

test('unrelated auth files are not mistaken for Codex homes, while broken named homes stay inspectable', async t => {
  const home = await temporary(t)
  const unrelated = join(home, '.config', 'another-app')
  const broken = join(home, 'codex-personal')
  await Promise.all([fs.mkdir(unrelated, { recursive: true }), fs.mkdir(broken)])
  await Promise.all([fs.writeFile(join(unrelated, 'auth.json'), '{"session":"not-codex"}'), fs.writeFile(join(broken, 'auth.json'), '{broken')])
  const view = await pool(home).sourcesView()
  assert.ok(!view.sources.some(source => source.path === unrelated))
  assert.equal(view.sources.find(source => source.path === broken).status, 'invalid')
})
