import test from 'node:test'
import assert from 'node:assert/strict'
import { chmod, lstat, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { Script } from 'node:vm'
import { apply, check, main, rollback, SLOT, TARGETS, transform } from '../scripts/model-actions-compat.mjs'

const BASE = resolve(tmpdir())
const pad = (tabs, text) => '\t'.repeat(tabs) + text
function fixture() {
  const declaration = [pad(5, '"settings.models.provider-card": {'), pad(6, 'kind: "keyed",'), pad(6, 'scope: "root"'), pad(5, '},')].join('\n')
  const client = `const declared = {\n${declaration}\n};\nfunction ModelsSection() { return {\n` + [
    pad(11, 'className: ModelsSection_module_css_default["rowActions"],'),
    pad(11, 'children: [(0, react_jsx_runtime.jsx)("button", {'),
    pad(12, 'type: "button",'),
    pad(12, 'className: ModelsSection_module_css_default["secondaryButton"],'),
    pad(12, '"aria-label": providerCopy(t("editProvider"), target),'),
    pad(12, 'onClick: () => {'), pad(13, 'setSavedTarget(void 0);'), pad(13, 'setAddOpen(false);'), pad(13, 'setEditing(open ? void 0 : target);'),
    pad(12, '},'), pad(12, 'children: t("edit")'),
    pad(11, '}), row.removable ? { unchangedDelete: true } : null]'),
  ].join('\n') + '\n}; }\n'
  const types = `import type { ProviderDirectoryEntry } from './store.ts';
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface SlotMap {
        'settings.models.provider-card': {
            kind: 'keyed';
            scope: 'root';
            owner: ProviderCardExtrasOwnerProps;
        };
    }
}
export interface ProviderCardExtrasOwnerProps {
    provider: ProviderDirectoryEntry;
    configured: boolean;
    keyConfigured: boolean;
}
/** Owner share of the footer area (the section supplies nothing). */
export interface ModelsFooterOwnerProps { children?: never; }
`
  return { client, types }
}
async function installation(t, source = fixture()) {
  // All test writes stay in the explicitly delegated isolation directory.
  const root = await mkdtemp(join(BASE, 'fixture-'))
  t.after(async () => {
    const intended = resolve(root)
    assert.equal(dirname(intended), BASE)
    assert.ok(intended.startsWith(join(BASE, 'fixture-')))
    await rm(intended, { recursive: true, force: true })
  })
  for (const [key, path] of Object.entries(TARGETS)) {
    await mkdir(dirname(join(root, path)), { recursive: true })
    await writeFile(join(root, path), source[key])
    await chmod(join(root, path), key === 'client' ? 0o640 : 0o644)
  }
  return root
}
async function contents(root) {
  return Object.fromEntries(await Promise.all(Object.entries(TARGETS).map(async ([key, path]) => [key, await readFile(join(root, path), 'utf8')])))
}

test('pure transform adds only neutral keyed declaration, dispatch and owner type', () => {
  const source = fixture()
  const result = transform(source)
  assert.equal(result.status, 'ready')
  assert.equal(result.changed, true)
  assert.equal(result.client.split(SLOT).length - 1, 2)
  assert.equal(result.types.split(SLOT).length - 1, 1)
  assert.match(result.client, /provider: row\.entry,\s+configured: row\.configured,\s+keyConfigured: keyConfiguredOf\(row\),\s+buttonClassName: ModelsSection_module_css_default\["secondaryButton"\]/u)
  assert.match(result.client, /entryKey: row\.entry\.settingsNs/u)
  assert.match(result.types, /ProviderActionsOwnerProps extends ProviderCardExtrasOwnerProps/u)
  assert.match(result.types, /buttonClassName: string;/u)
  assert.ok(!result.client.includes('dsh-provider-hub'))
  assert.equal(result.client.split('setEditing(open ? void 0 : target);').length - 1, 1)
  assert.equal(result.client.split('unchangedDelete: true').length - 1, 1)
  assert.ok(result.client.includes('children: t("edit")'))
  new Script(result.client)
  const restored = result.client.replace(/\t{5}"settings.models.provider-actions": \{\n\t{6}kind: "keyed",\n\t{6}scope: "root"\n\t{5}\},\n/u, '').replace(/renderSlot\("settings.models.provider-actions", \{[\s\S]*?\}, \{ entryKey: row.entry.settingsNs \}\), /u, '')
  assert.equal(restored, source.client, 'editor, rowActions and remove behavior are byte-preserved')
})

test('already matching official contract is a validated no-op without relying on a marker', () => {
  const first = transform(fixture())
  const second = transform(first)
  assert.equal(second.status, 'present')
  assert.equal(second.changed, false)
  assert.equal(second.client, first.client)
  assert.equal(second.types, first.types)
  for (const source of [
    { ...first, client: first.client.replace('buttonClassName: ModelsSection_module_css_default', 'buttonClassName: otherStyle') },
    { ...first, client: first.client.replace('entryKey: row.entry.settingsNs }), row.removable', 'entryKey: row.entry.provider }), row.removable') },
    { ...first, types: first.types.replace('buttonClassName: string;', 'buttonClassName: number;') },
    { ...first, types: first.types.replace('ProviderActionsOwnerProps extends ProviderCardExtrasOwnerProps', 'ProviderActionsOwnerProps extends SomethingElse') },
  ]) assert.throws(() => transform(source), /compatibility:/u)
})

test('partial, unknown and duplicated anchors are rejected together', () => {
  const source = fixture()
  const patched = transform(source)
  for (const bad of [
    { ...source, client: patched.client },
    { ...source, types: patched.types },
    { ...source, client: source.client.replace('children: t("edit")', 'children: t("unknownEdit")') },
    { ...source, types: source.types.replace('keyConfigured: boolean;', 'different: boolean;') },
    { ...source, client: source.client + '\n' + source.client },
    { ...source, types: source.types + '\n' + source.types },
  ]) assert.throws(() => transform(bad), /compatibility:/u)
})

test('check is read-only; apply preserves modes and creates private hash backups', async t => {
  const original = fixture()
  const root = await installation(t, original)
  const beforeCheck = await readdir(root)
  const result = await check({ root })
  assert.equal(result.status, 'ready')
  assert.deepEqual(await readdir(root), beforeCheck, 'check creates no lock, journal or backup')
  assert.deepEqual(await contents(root), original)
  const applied = await apply({ root })
  assert.equal(applied.status, 'applied')
  const journal = JSON.parse(await readFile(join(root, '.model-actions-compat.json'), 'utf8'))
  const identities = []
  for (const [index, file] of journal.files.entries()) {
    assert.equal((await lstat(join(root, file.path))).mode & 0o777, index === 0 ? 0o640 : 0o644)
    const backup = await lstat(join(root, file.backup))
    assert.equal(backup.mode & 0o777, 0o600)
    identities.push(backup.ino)
    assert.equal(await readFile(join(root, file.backup), 'utf8'), original[Object.keys(TARGETS)[index]])
    assert.ok(file.backup.includes(file.beforeHash))
  }
  assert.equal((await lstat(join(root, '.model-actions-compat.json'))).mode & 0o777, 0o600)
  assert.equal((await apply({ root })).status, 'present')
  assert.equal((await check({ root })).status, 'present')
  assert.deepEqual(await Promise.all(journal.files.map(async file => (await lstat(join(root, file.backup))).ino)), identities, 'idempotent apply never overwrites O_EXCL backups')
  assert.equal((await rollback({ root })).status, 'rolled-back')
  assert.deepEqual(await contents(root), original)
  assert.equal((await rollback({ root })).status, 'original')
  assert.equal((await apply({ root })).status, 'applied', 'the same journal and backups permit explicit reapplication')
})

test('all files preflight before writes: unknown second target leaves both untouched', async t => {
  const original = fixture()
  original.types = original.types.replace('scope: \'root\';', 'scope: \'session\';')
  const root = await installation(t, original)
  await assert.rejects(apply({ root }), /expected exactly one/u)
  assert.deepEqual(await contents(root), original)
  assert.deepEqual(await readdir(root), ['node_modules'])
  assert.deepEqual(await readdir(dirname(join(root, TARGETS.client))), ['client.js', 'types'])
})

test('O_EXCL backup collision is never overwritten and original files remain clean', async t => {
  const root = await installation(t)
  const report = await check({ root })
  const path = join(root, report.files[0].path + '.provider-actions-' + report.files[0].beforeHash + '.bak')
  await writeFile(path, 'external backup', { mode: 0o600 })
  await assert.rejects(apply({ root }), /external modification/u)
  assert.equal(await readFile(path, 'utf8'), 'external backup')
  assert.deepEqual(await contents(root), fixture())
})

test('unknown journal and second-backup collisions preflight before creating recovery files', async t => {
  for (const kind of ['journal', 'second-backup']) {
    const root = await installation(t)
    const report = await check({ root })
    if (kind === 'journal') await writeFile(join(root, '.model-actions-compat.json'), '{"format":"unknown"}', { mode: 0o600 })
    else await writeFile(join(root, report.files[1].path + '.provider-actions-' + report.files[1].beforeHash + '.bak'), 'different original', { mode: 0o600 })
    await assert.rejects(apply({ root }), /journal|external modification/u)
    assert.deepEqual(await contents(root), fixture())
    const firstBackup = join(root, report.files[0].path + '.provider-actions-' + report.files[0].beforeHash + '.bak')
    await assert.rejects(lstat(firstBackup), { code: 'ENOENT' })
  }
})

test('rollback preflights all targets and refuses an external second-file update', async t => {
  const root = await installation(t)
  await apply({ root })
  const patched = await contents(root)
  const external = patched.types + '\n// external newer release\n'
  await writeFile(join(root, TARGETS.types), external)
  await assert.rejects(rollback({ root }), /external modification prevents rollback/u)
  assert.deepEqual(await contents(root), { client: patched.client, types: external }, 'no first-file restore occurs when second-file guard fails')
})

test('rollback refuses backup tampering and modified journal targets', async t => {
  const root = await installation(t)
  await apply({ root })
  const patched = await contents(root)
  const journalPath = join(root, '.model-actions-compat.json')
  const journal = JSON.parse(await readFile(journalPath, 'utf8'))
  await writeFile(join(root, journal.files[0].backup), 'tampered')
  await assert.rejects(rollback({ root }), /external modification/u)
  assert.deepEqual(await contents(root), patched)
  journal.files[0].backup = '../../outside'
  await writeFile(journalPath, JSON.stringify(journal))
  await assert.rejects(rollback({ root }), /invalid journal/u)
  assert.deepEqual(await contents(root), patched)
})

test('interrupted apply with one original file can be safely recovered', async t => {
  const source = fixture()
  const root = await installation(t, source)
  await apply({ root })
  await writeFile(join(root, TARGETS.types), source.types)
  assert.equal((await rollback({ root })).status, 'rolled-back')
  assert.deepEqual(await contents(root), source)
})

test('explicit absolute root, regular files and operation lock are mandatory', async t => {
  await assert.rejects(check(), /explicit absolute/u)
  await assert.rejects(check({ root: '.' }), /explicit absolute/u)
  await assert.rejects(main([]), /Usage:/u)
  await assert.rejects(main(['--apply']), /Usage:/u)
  const root = await installation(t)
  const lock = join(root, '.model-actions-compat.lock')
  await writeFile(lock, 'external lock')
  await assert.rejects(apply({ root }), /interrupted lock/u)
  assert.equal(await readFile(lock, 'utf8'), 'external lock')
  assert.deepEqual(await contents(root), fixture())
  const other = await installation(t)
  const target = join(other, TARGETS.client)
  const intended = resolve(target)
  assert.ok(intended.startsWith(other + '/'))
  await rm(intended)
  await symlink(join(root, TARGETS.client), target)
  await assert.rejects(check({ root: other }), /symlinked installation/u)
})
