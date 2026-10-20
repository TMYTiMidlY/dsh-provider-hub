import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readFileSync } from 'node:fs'
import { CodexAccounts, CODEX_ACCOUNT_PREFIX, CODEX_OFFICIAL_RECORD, readCliGrant } from '../lib/codex-accounts.js'

const b64url = value => Buffer.from(JSON.stringify(value)).toString('base64url')
const jwt = (claims = {}) => `header.${b64url(claims)}.signature`
const token = (email, expSeconds) => jwt({ exp: expSeconds, 'https://api.openai.com/profile': { email } })
const NOW_MS = 1_800_000_000_000
const now = () => NOW_MS

const authJson = (email, expSeconds, accountId = 'acct-x') => JSON.stringify({ tokens: { access_token: token(email, expSeconds), refresh_token: 'synthetic-refresh', account_id: accountId } })

function fakeCredentials() {
  const records = new Map()
  const order = []
  return {
    records,
    order,
    async readRecord(key) { return records.get(key) },
    async listRecords() { return order.filter(key => records.has(key)).map(key => ({ key, kind: records.get(key).kind })) },
    async modifyRecord(key, mutate) {
      const next = await mutate(records.get(key))
      if (next !== undefined) {
        if (!records.has(key)) order.push(key)
        records.set(key, next)
      }
      return records.get(key)
    },
    async deleteRecord(key) { records.delete(key) },
  }
}

async function withSources(t, files) {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-codex-accounts-'))
  const sources = []
  for (const [id, content] of Object.entries(files)) {
    const path = join(dir, `${id}.json`)
    await writeFile(path, content, { mode: 0o600 })
    sources.push({ id, path: () => path })
  }
  t.after(() => rm(dir, { recursive: true, force: true }))
  return sources
}

const accounts = (credentials, sources) => new CodexAccounts({ credentials, sources, now })

test('readCliGrant maps a Codex CLI auth.json onto the DSH grant payload', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-codex-auth-'))
  try {
    const path = join(dir, 'auth.json')
    await writeFile(path, authJson('vickie@example.test', Math.floor(NOW_MS / 1000) + 3600), 'utf8')
    const grant = await readCliGrant(path)
    assert.deepEqual({ ...grant, access: 'redacted' }, { type: 'oauth', access: 'redacted', refresh: 'synthetic-refresh', expires: (Math.floor(NOW_MS / 1000) + 3600) * 1000, accountId: 'acct-x' })
    assert.equal(await readCliGrant(join(dir, 'missing.json')), undefined, 'a missing file yields no grant')
    await writeFile(path, JSON.stringify({ tokens: { access_token: 'no-jwt-here', refresh_token: 'r', account_id: 'a' } }), 'utf8')
    assert.equal(await readCliGrant(path), undefined, 'an access token without an exp claim yields no grant')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('import stores a named record, dedupes by account and keeps the fresher grant', async t => {
  const sources = await withSources(t, {
    codex: authJson('vickie@example.test', Math.floor(NOW_MS / 1000) + 3600, 'acct-vickie'),
    'codex-gth': authJson('gth@example.test', Math.floor(NOW_MS / 1000) + 7200, 'acct-gth'),
  })
  const credentials = fakeCredentials()
  const pool = accounts(credentials, sources)
  const imported = await pool.importFrom({ source: 'codex', name: 'vickie' })
  assert.equal(imported.name, 'vickie')
  assert.equal(imported.email, 'vickie@example.test')
  assert.equal(imported.accountId, 'acct-vic…')
  assert.equal(imported.active, false, 'nothing is active until the official record matches')
  const record = credentials.records.get(CODEX_ACCOUNT_PREFIX + imported.id)
  assert.equal(record.kind, 'grant')
  assert.equal(record.payload.source, 'cli')
  assert.equal(record.payload.accountId, 'acct-vickie')
  // Re-importing the same directory refreshes the same slot, not a new one.
  const again = await pool.importFrom({ source: 'codex', name: 'vickie-2' })
  assert.equal(again.id, imported.id)
  assert.equal(again.updated, true)
  assert.equal(again.name, 'vickie-2')
  assert.equal(credentials.records.size, 1)
  const stale = await pool.importFrom({ source: 'codex', name: 'ignored' })
  assert.equal(stale.id, imported.id, 'the same account keeps one slot')
  await assert.rejects(pool.importFrom({ source: 'nope' }), /未找到选择的 CLI 目录/u)
})

test('list reports views without token material and marks the active grant', async t => {
  const sources = await withSources(t, { codex: authJson('vickie@example.test', Math.floor(NOW_MS / 1000) + 3600, 'acct-vickie') })
  const credentials = fakeCredentials()
  const pool = accounts(credentials, sources)
  const { id } = await pool.importFrom({ source: 'codex', name: 'vickie' })
  const importedAccess = credentials.records.get(CODEX_ACCOUNT_PREFIX + id).payload.access
  credentials.records.set(CODEX_OFFICIAL_RECORD, { kind: 'grant', payload: { type: 'oauth', access: importedAccess, refresh: 'official-refresh', expires: NOW_MS + 60_000, accountId: 'acct-vickie' } })
  const entries = await pool.list()
  assert.equal(entries.length, 1)
  assert.equal(entries[0].active, true, 'active means the record matches the official access token')
  assert.ok(!JSON.stringify(entries).includes('synthetic-refresh'), 'views never carry refresh tokens')
  assert.ok(!JSON.stringify(entries).includes('header.'), 'views never carry access tokens')
})

test('setActive writes the fresher official grant back to its slot before switching', async t => {
  const sources = await withSources(t, {
    codex: authJson('qq@example.test', Math.floor(NOW_MS / 1000) + 3600, 'acct-qq'),
    'codex-gth': authJson('gth@example.test', Math.floor(NOW_MS / 1000) + 7200, 'acct-gth'),
  })
  const credentials = fakeCredentials()
  const pool = accounts(credentials, sources)
  const qq = await pool.importFrom({ source: 'codex', name: 'qq' })
  const gth = await pool.importFrom({ source: 'codex-gth', name: 'gth' })
  const officialAccess = token('qq@example.test', Math.floor(NOW_MS / 1000) + 9000)
  credentials.records.set(CODEX_OFFICIAL_RECORD, { kind: 'grant', payload: { type: 'oauth', access: officialAccess, refresh: 'official-refresh', expires: NOW_MS + 9_000_000, accountId: 'acct-qq' } })
  await pool.setActive({ id: gth.id })
  // The fresher official qq grant was saved back into its own slot first.
  const qqSlot = credentials.records.get(CODEX_ACCOUNT_PREFIX + qq.id).payload
  assert.equal(qqSlot.access, officialAccess)
  assert.equal(qqSlot.name, 'qq', 'pool metadata survives the write-back')
  // The official record now carries the gth grant in canonical shape.
  const official = credentials.records.get(CODEX_OFFICIAL_RECORD).payload
  assert.equal(official.accountId, 'acct-gth')
  assert.equal(official.name, undefined, 'the official record stays canonical, no pool metadata')
  assert.equal(official.access, token('gth@example.test', Math.floor(NOW_MS / 1000) + 7200))
  // Re-activating the same account with a staller grant keeps the official one.
  await pool.setActive({ id: qq.id })
  assert.equal(credentials.records.get(CODEX_OFFICIAL_RECORD).payload.access, officialAccess, 'same-account switching keeps whichever token expires later')
})

test('rename edits in place and drop removes the record', async t => {
  const sources = await withSources(t, { codex: authJson('vickie@example.test', Math.floor(NOW_MS / 1000) + 3600, 'acct-vickie') })
  const credentials = fakeCredentials()
  const pool = accounts(credentials, sources)
  const { id } = await pool.importFrom({ source: 'codex', name: 'vickie' })
  const renamed = await pool.rename({ id, name: '  main  ' })
  assert.equal(renamed.name, 'main')
  assert.equal(credentials.records.get(CODEX_ACCOUNT_PREFIX + id).payload.name, 'main')
  await pool.remove({ id })
  assert.equal(credentials.records.has(CODEX_ACCOUNT_PREFIX + id), false)
  assert.equal(await pool.rename({ id, name: 'x' }).then(() => 'resolved', error => error.message), 'codex account not found')
})

test('the service mounts with non-reserved wire names and the fixed CLI sources', async () => {
  const source = readFileSync(new URL('../lib/codex-accounts.js', import.meta.url), 'utf8')
  assert.match(source, /extends TypertRemoteService/u)
  assert.match(source, /super\(ctx, 'codexAccounts'\)/u)
  // Wire names must stay off RemoteNamespaceService's own members: only the
  // service class crosses the remote boundary, so scope the check to it.
  const serviceRegion = source.slice(source.indexOf('export class CodexAccountsService'))
  for (const reserved of ['remove', 'has', 'install', 'installDirect', 'installScoped', 'assertMethodAvailable']) {
    assert.ok(!new RegExp(`async ${reserved}\\(`).test(serviceRegion), `wire name ${reserved} is reserved`)
  }
  assert.ok(!source.includes('40b7472da8db3f767b3960f45bb06cfe45a2918d5600f1a475530f55489c50a4'), 'discovery must not hardcode a personal CLI directory')
  assert.ok(source.includes('.cc-switch-launches'))
  for (const method of ['list', 'sources', 'import', 'drop', 'rename', 'setActive']) {
    assert.match(serviceRegion, new RegExp(`async ${method}\\(`, 'u'), `service exposes ${method}`)
  }
})
