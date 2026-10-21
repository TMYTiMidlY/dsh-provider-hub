#!/usr/bin/env node
/** Explicit, fail-closed compatibility shim. Importing this module never writes.
 * --root is the DSH installation root containing node_modules/@deepseek-ai/.
 * Two files cannot be atomically committed together: a durable journal permits
 * guarded recovery after interruption; ordinary failures restore owned writes.
 */
import { createHash, randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import { lstat, open, realpath, rename, unlink } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { Script } from 'node:vm'
import { fileURLToPath } from 'node:url'

export const SLOT = 'settings.models.provider-actions'
export const TARGETS = Object.freeze({
  client: 'node_modules/@deepseek-ai/dsh-client-ui-settings-models/lib/client.js',
  types: 'node_modules/@deepseek-ai/dsh-client-ui-settings-models/lib/types/client/slot-contract.d.ts',
})
const JOURNAL = '.model-actions-compat.json'
const LOCK = '.model-actions-compat.lock'
const digest = bytes => createHash('sha256').update(bytes).digest('hex')
const lines = (indent, values) => values.map(([extra, text]) => '\t'.repeat(indent + extra) + text).join('\n')
const CARD_DECL = lines(5, [[0, '"settings.models.provider-card": {'], [1, 'kind: "keyed",'], [1, 'scope: "root"'], [0, '},']])
const ACTION_DECL = CARD_DECL.replace('provider-card', 'provider-actions')
const EDIT = lines(11, [
  [0, 'children: [(0, react_jsx_runtime.jsx)("button", {'],
  [1, 'type: "button",'],
  [1, 'className: ModelsSection_module_css_default["secondaryButton"],'],
  [1, '"aria-label": providerCopy(t("editProvider"), target),'],
  [1, 'onClick: () => {'],
  [2, 'setSavedTarget(void 0);'],
  [2, 'setAddOpen(false);'],
  [2, 'setEditing(open ? void 0 : target);'],
  [1, '},'],
  [1, 'children: t("edit")'],
  [0, '}), '],
])
const EDIT_CONTEXT = '\t'.repeat(11) + 'className: ModelsSection_module_css_default["rowActions"],\n' + EDIT
const ACTION_RENDER = 'renderSlot("settings.models.provider-actions", {\n' + lines(12, [
  [0, 'provider: row.entry,'], [0, 'configured: row.configured,'],
  [0, 'keyConfigured: keyConfiguredOf(row),'],
  [0, 'buttonClassName: ModelsSection_module_css_default["secondaryButton"]'],
]) + '\n' + '\t'.repeat(11) + '}, { entryKey: row.entry.settingsNs }), '
const TYPE_CARD = "        'settings.models.provider-card': {\n            kind: 'keyed';\n            scope: 'root';\n            owner: ProviderCardExtrasOwnerProps;\n        };"
const TYPE_ACTION = "        /** Optional same-row actions beside the provider editor; no occupant means no UI. */\n        'settings.models.provider-actions': {\n            kind: 'keyed';\n            scope: 'root';\n            owner: ProviderActionsOwnerProps;\n        };"
const TYPE_FOOTER = '/** Owner share of the footer area (the section supplies nothing). */'
const TYPE_OWNER = '/** Owner share of a provider header action occurrence. */\nexport interface ProviderActionsOwnerProps extends ProviderCardExtrasOwnerProps {\n    /** The section\'s standard secondary-button class for visually consistent actions. */\n    buttonClassName: string;\n}\n'
function fail(message) { throw new Error(`models actions compatibility: ${message}`) }
function count(text, needle) { return text.split(needle).length - 1 }
function once(text, needle, label) { if (count(text, needle) !== 1) fail(`${label}: expected exactly one recognized anchor`) }
function cleanAnchors(client, types) {
  once(client, CARD_DECL, 'runtime provider-card declaration')
  once(client, EDIT_CONTEXT + 'row.removable ?', 'unchanged editor / rowActions context')
  once(types, TYPE_CARD, 'provider-card type')
  once(types, TYPE_FOOTER, 'footer type insertion')
  once(types, 'export interface ProviderCardExtrasOwnerProps {', 'provider owner declaration')
  for (const field of ['provider: ProviderDirectoryEntry;', 'configured: boolean;', 'keyConfigured: boolean;']) once(types, field, 'provider owner ' + field)
  new Script(client, { filename: 'models-client.js' })
}
function patchedAnchors(client, types) {
  if (count(client, SLOT) !== 2 || count(types, SLOT) !== 1) fail('partial or unknown existing action seam')
  once(client, ACTION_DECL + '\n' + CARD_DECL, 'keyed root action declaration')
  once(client, EDIT_CONTEXT + ACTION_RENDER + 'row.removable ?', 'same-row action dispatch and owner contract')
  once(types, TYPE_ACTION + '\n' + TYPE_CARD, 'keyed action type contract')
  once(types, TYPE_OWNER + TYPE_FOOTER, 'action owner / button class contract')
  // Verify the rest of the original known layout too, not only a marker.
  cleanAnchors(client.replace(ACTION_DECL + '\n', '').replace(ACTION_RENDER, ''), types.replace(TYPE_ACTION + '\n', '').replace(TYPE_OWNER, ''))
  new Script(client, { filename: 'models-client.js' })
}
/** Pure two-file transform. Unknown, duplicated and partially patched layouts fail. */
export function transform({ client, types }) {
  if (typeof client !== 'string' || typeof types !== 'string') fail('both UTF-8 source texts are required')
  if (client.includes(SLOT) || types.includes(SLOT)) {
    patchedAnchors(client, types)
    return { status: 'present', changed: false, client, types }
  }
  cleanAnchors(client, types)
  const nextClient = client.replace(CARD_DECL, ACTION_DECL + '\n' + CARD_DECL).replace(EDIT_CONTEXT, EDIT_CONTEXT + ACTION_RENDER)
  const nextTypes = types.replace(TYPE_CARD, TYPE_ACTION + '\n' + TYPE_CARD).replace(TYPE_FOOTER, TYPE_OWNER + TYPE_FOOTER)
  patchedAnchors(nextClient, nextTypes)
  return { status: 'ready', changed: true, client: nextClient, types: nextTypes }
}
async function rootOf(root) {
  if (typeof root !== 'string' || !root || !isAbsolute(root)) fail('an explicit absolute DSH installation root is required')
  const canonical = await realpath(root)
  if (!(await lstat(canonical)).isDirectory()) fail('root must be a directory')
  return canonical
}
function contained(root, path) {
  const rel = relative(root, path)
  if (!rel || rel === '..' || rel.startsWith('..' + sep) || isAbsolute(rel)) fail('path escaped explicit installation root')
  return path
}
async function readRegular(root, path) {
  contained(root, path)
  // Refuse symlinks, including a package directory redirected outside root.
  const resolved = await realpath(path)
  if (resolved !== path) fail('symlinked installation targets are unsupported: ' + relative(root, path))
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    const stat = await handle.stat()
    if (!stat.isFile() || stat.nlink !== 1) fail('expected a regular single-link file: ' + relative(root, path))
    const bytes = await handle.readFile()
    return { bytes, mode: stat.mode & 0o7777, hash: digest(bytes) }
  } finally { await handle.close() }
}
async function snapshot(root) {
  const files = []
  for (const [key, path] of Object.entries(TARGETS)) {
    const absolute = contained(root, join(root, path))
    const current = await readRegular(root, absolute)
    const text = current.bytes.toString('utf8')
    if (!Buffer.from(text).equals(current.bytes)) fail('target is not round-trip UTF-8')
    files.push({ key, path, absolute, text, ...current })
  }
  return files
}
function summary(root, transformed, files) {
  return { root, status: transformed.status, changed: transformed.changed, files: files.map(file => ({ path: file.path, beforeHash: file.hash, afterHash: digest(transformed[file.key]), mode: file.mode })) }
}
/** Read-only, including on the real installation. Creates no locks or backups. */
export async function check({ root } = {}) {
  const canonical = await rootOf(root)
  const files = await snapshot(canonical)
  return summary(canonical, transform(Object.fromEntries(files.map(file => [file.key, file.text]))), files)
}
async function exclusiveWrite(path, bytes, mode = 0o600) {
  const handle = await open(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, mode)
  try { await handle.chmod(mode); await handle.writeFile(bytes); await handle.sync() } finally { await handle.close() }
}
async function assertHash(root, path, expected) {
  const current = await readRegular(root, path)
  if (current.hash !== expected) fail('concurrent/external modification: ' + relative(root, path))
  return current
}
async function atomicReplace(root, path, bytes, mode, expected) {
  contained(root, path)
  const temp = contained(root, join(dirname(path), '.model-actions-' + randomUUID() + '.tmp'))
  await exclusiveWrite(temp, bytes, mode)
  try {
    await assertHash(root, path, expected)
    await rename(temp, path)
  } finally {
    // temp is a checked, exact sibling path generated above; never recursive.
    await unlink(temp).catch(error => { if (error.code !== 'ENOENT') throw error })
  }
}
async function withLock(root, operation) {
  const path = contained(root, join(root, LOCK))
  const handle = await open(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600).catch(error => {
    if (error.code === 'EEXIST') fail('another operation or interrupted lock exists; inspect the lock before removing it')
    throw error
  })
  const owned = await handle.stat()
  try { await handle.writeFile(`${process.pid}\n`); await handle.sync(); return await operation() }
  finally {
    await handle.close()
    const current = await lstat(path).catch(error => { if (error.code === 'ENOENT') return null; throw error })
    if (current && current.ino === owned.ino && current.dev === owned.dev) await unlink(path)
  }
}
function journalOf(root, files, transformed) {
  return { format: 'models-provider-actions-v1', files: files.map(file => ({ path: file.path, beforeHash: file.hash, afterHash: digest(transformed[file.key]), mode: file.mode, backup: file.path + '.provider-actions-' + file.hash + '.bak' })) }
}
async function readJournal(root) {
  const stored = await readRegular(root, join(root, JOURNAL))
  if (stored.mode !== 0o600) fail('journal must have mode 0600')
  let value
  try { value = JSON.parse(stored.bytes.toString('utf8')) } catch { fail('invalid journal JSON') }
  if (value?.format !== 'models-provider-actions-v1' || !Array.isArray(value.files) || value.files.length !== 2) fail('unknown journal format')
  for (const [index, path] of Object.values(TARGETS).entries()) {
    const entry = value.files[index]
    if (entry?.path !== path || !/^[a-f0-9]{64}$/.test(entry.beforeHash ?? '') || !/^[a-f0-9]{64}$/.test(entry.afterHash ?? '') || !Number.isInteger(entry.mode) || entry.mode < 0 || entry.mode > 0o7777 || entry.backup !== path + '.provider-actions-' + entry.beforeHash + '.bak') fail('invalid journal target/hash/mode')
  }
  return value
}
/** Explicit application only. Validate every file before creating any backups. */
export async function apply({ root } = {}) {
  const canonical = await rootOf(root)
  return withLock(canonical, async () => {
    const files = await snapshot(canonical)
    const transformed = transform(Object.fromEntries(files.map(file => [file.key, file.text])))
    if (!transformed.changed) return summary(canonical, transformed, files)
    const journal = journalOf(canonical, files, transformed)
    // Preflight existing recovery artifacts too: an unknown journal or a bad
    // second backup must not cause even the first backup to be created.
    try {
      const existing = await readJournal(canonical)
      if (JSON.stringify(existing) !== JSON.stringify(journal)) fail('journal belongs to a different original installation; rollback or inspect first')
    } catch (error) { if (error.code !== 'ENOENT') throw error }
    for (const [index, file] of files.entries()) {
      try {
        const existing = await assertHash(canonical, join(canonical, journal.files[index].backup), file.hash)
        if (existing.mode !== 0o600) fail('existing backup must have mode 0600')
      } catch (error) { if (error.code !== 'ENOENT') throw error }
    }
    // All layout and existing-artifact checks finish before the first backup.
    for (const [index, file] of files.entries()) {
      await assertHash(canonical, file.absolute, file.hash)
      const backup = contained(canonical, join(canonical, journal.files[index].backup))
      try { await exclusiveWrite(backup, file.bytes) }
      catch (error) {
        if (error.code !== 'EEXIST') throw error
        const existing = await assertHash(canonical, backup, file.hash)
        if (existing.mode !== 0o600) fail('existing backup must have mode 0600')
      }
    }
    const journalPath = contained(canonical, join(canonical, JOURNAL))
    try { await exclusiveWrite(journalPath, JSON.stringify(journal, null, 2) + '\n') }
    catch (error) {
      if (error.code !== 'EEXIST') throw error
      if (JSON.stringify(await readJournal(canonical)) !== JSON.stringify(journal)) fail('journal belongs to a different original installation; rollback or inspect first')
    }
    try {
      // Recheck all files after backup preparation, before changing either file.
      for (const file of files) await assertHash(canonical, file.absolute, file.hash)
      for (const file of files) await atomicReplace(canonical, file.absolute, Buffer.from(transformed[file.key]), file.mode, file.hash)
    } catch (error) {
      const failures = []
      for (const [index, file] of files.entries()) {
        try {
          const current = await readRegular(canonical, file.absolute)
          if (current.hash === file.hash) continue
          if (current.hash !== journal.files[index].afterHash) fail('external content prevents automatic recovery')
          await atomicReplace(canonical, file.absolute, file.bytes, file.mode, current.hash)
        } catch (recovery) { failures.push(`${file.path}: ${recovery.message}`) }
      }
      if (failures.length) fail(`apply failed; guarded recovery needs inspection: ${failures.join('; ')}`)
      throw error
    }
    return { ...summary(canonical, transformed, files), status: 'applied', journal: JOURNAL }
  })
}
/** Restore only journal-matching bytes. Any external modification aborts all writes. */
export async function rollback({ root } = {}) {
  const canonical = await rootOf(root)
  return withLock(canonical, async () => {
    const journal = await readJournal(canonical)
    const entries = []
    for (const entry of journal.files) {
      const path = contained(canonical, join(canonical, entry.path))
      const backup = await assertHash(canonical, join(canonical, entry.backup), entry.beforeHash)
      if (backup.mode !== 0o600) fail('backup must have mode 0600')
      const current = await readRegular(canonical, path)
      if (current.hash !== entry.afterHash && current.hash !== entry.beforeHash) fail('external modification prevents rollback: ' + entry.path)
      entries.push({ ...entry, absolute: path, backup, current })
    }
    // Verify backups describe the exact known clean -> patched transformation.
    const transformed = transform({ client: entries[0].backup.bytes.toString('utf8'), types: entries[1].backup.bytes.toString('utf8') })
    if (!transformed.changed || entries.some((entry, index) => digest(transformed[Object.keys(TARGETS)[index]]) !== entry.afterHash)) fail('journal does not describe a recognized patch')
    for (const entry of entries) await assertHash(canonical, entry.absolute, entry.current.hash)
    const restored = []
    try {
      for (const entry of entries) {
        if (entry.current.hash === entry.beforeHash) continue
        await atomicReplace(canonical, entry.absolute, entry.backup.bytes, entry.mode, entry.afterHash)
        restored.push(entry)
      }
    } catch (error) {
      const failures = []
      for (const entry of restored) {
        try { await atomicReplace(canonical, entry.absolute, entry.current.bytes, entry.current.mode, entry.beforeHash) }
        catch (recovery) { failures.push(recovery.message) }
      }
      if (failures.length) fail('rollback recovery needs inspection: ' + failures.join('; '))
      throw error
    }
    return { root: canonical, status: restored.length ? 'rolled-back' : 'original', changed: restored.length > 0 }
  })
}
export async function main(args = process.argv.slice(2)) {
  const usage = 'Usage: node model-actions-compat.mjs (--check|--apply|--rollback) --root /absolute/dsh/install'
  if (args.length !== 3 || !['--check', '--apply', '--rollback'].includes(args[0]) || args[1] !== '--root') fail(usage)
  const actions = { '--check': check, '--apply': apply, '--rollback': rollback }
  return actions[args[0]]({ root: args[2] })
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then(result => console.log(JSON.stringify(result, null, 2)), error => { console.error(error.message); process.exitCode = 1 })
}
