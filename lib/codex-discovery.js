// Host-only, feature-based Codex home discovery. No shell evaluation, recursive
// home crawl, or unbounded readdir/readFile. A scope also covers auth inspection.
import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import * as filesystem from 'node:fs/promises'
import { performance } from 'node:perf_hooks'
import { basename, dirname, join, relative, resolve, sep } from 'node:path'

export const DISCOVERY_LIMITS = Object.freeze({ budgetMs: 8000, ioTimeoutMs: 400, concurrency: 4, maxDirectories: 160, maxEntries: 2048, entriesPerDirectory: 128, maxDepth: 3, maxSources: 100, maxDeclarations: 32, maxHistory: 100, maxOperations: 4096, authBytes: 1024 * 1024, textBytes: 32768 })
export const SOURCE_POLICY = '只读常用目录、浅层候选和字面 CODEX_HOME；不执行脚本、不全盘扫描、不跟随扫描中的符号链接。手动路径仅检查该目录。'
const timeoutError = () => Object.assign(new Error('Codex discovery I/O timed out'), { code: 'CODEX_SCAN_TIMEOUT' })
const isTimeout = error => error?.code === 'CODEX_SCAN_TIMEOUT'
const ignored = /^(?:node_modules|vendor|\.git|\.cache|cache|caches|sessions|logs|history|tmp|temp|Downloads|Trash)$/iu
const configFeature = /^\s*(?:model|model_provider|approval_policy|sandbox_mode|cli_auth_credentials_store|chatgpt_base_url)\s*=|^\s*\[(?:model_providers|profiles)(?:\.|\])/mu
const sourceId = path => `cli-${createHash('sha256').update(path).digest('hex').slice(0, 16)}`

// This accepts a deliberately small shell-literal subset, not shell syntax.
// Quotes must terminate the entire value; concatenations/substitutions/escapes
// are ignored. Multiple independent literal declarations can describe homes.
export function literalCodexHomes(text) {
  const homes = []
  const assignment = /^\s*(?:export\s+|(?:exec\s+)?env\s+)?CODEX_HOME=(?:"([^"\\\r\n]*)"|'([^'\r\n]*)'|([^\s;'"`]+))(?=\s|;|$)/gmu
  for (const match of text.matchAll(assignment)) {
    const value = match[1] ?? match[2] ?? match[3]
    const rest = value.replace(/^(?:~|\$HOME|\$\{HOME\})(?=[/\\]|$)/u, '')
    if (!value || /[$`;&|<>(){}\r\n\0]/u.test(rest) || (match[3] !== undefined && /\\/u.test(value)) || (match[2] !== undefined && /[$~`]/u.test(value))) continue
    homes.push(value)
    if (homes.length === 16) break
  }
  return homes
}

class ScanScope {
  constructor(owner) {
    this.owner = owner
    this.started = performance.now()
    this.deadline = this.started + owner.limits.budgetMs
    this.stopped = false
    this.timedOut = false
    this.truncated = false
    this.checkedDirectories = 0
    this.checkedPaths = new Set()
    this.entries = 0
    this.operations = 0
  }
  active() {
    if (!this.stopped && performance.now() >= this.deadline) { this.timedOut = true; this.stopped = true }
    return !this.stopped
  }
  checkDirectory(path) {
    if (!this.active()) return false
    if (this.checkedPaths.has(path)) return true
    if (this.checkedDirectories >= this.owner.limits.maxDirectories) { this.truncated = true; this.stopped = true; return false }
    this.checkedPaths.add(path)
    this.checkedDirectories++
    return true
  }
  // Physical operations retain their concurrency slot until they actually
  // settle, even after a timeout. Repeated requests cannot pile up hung I/O.
  async io(operation, lateCleanup) {
    if (!this.active()) throw timeoutError()
    if (this.operations >= this.owner.limits.maxOperations) { this.truncated = true; this.stopped = true; throw timeoutError() }
    if (this.owner.pending + this.owner.closing >= this.owner.limits.concurrency) { this.timedOut = true; this.stopped = true; throw timeoutError() }
    this.operations++
    this.owner.pending++
    let expired = false, timer
    const work = Promise.resolve().then(() => {
      if (!this.active()) throw timeoutError()
      return operation()
    }).finally(() => { this.owner.pending-- })
    // Successful late opens must still close their handle, but never proceed
    // to stat/read or schedule new discovery work after the request stops.
    work.then(value => { if (expired) void lateCleanup?.(value) }, () => {})
    try {
      return await Promise.race([work, new Promise((_, reject) => {
        timer = setTimeout(() => { expired = true; this.timedOut = true; this.active(); reject(timeoutError()) }, Math.max(1, Math.min(this.owner.limits.ioTimeoutMs, this.deadline - performance.now())))
      })])
    } finally { clearTimeout(timer) }
  }
  async close(handle) {
    // Cleanup is the only work allowed after stop. A hung close retains a slot
    // too, and is detached only from the caller's bounded response wait.
    this.owner.closing++
    let timer
    const cleanup = close(handle).finally(() => { this.owner.closing-- })
    try { await Promise.race([cleanup, new Promise(resolve => { timer = setTimeout(() => { this.timedOut = true; resolve() }, Math.max(1, Math.min(this.owner.limits.ioTimeoutMs, this.deadline - performance.now()))) })]) }
    finally { clearTimeout(timer) }
  }
  finish() {
    this.active()
    this.stopped = true
    return { elapsedMs: Math.ceil(performance.now() - this.started), checkedDirectories: this.checkedDirectories, timedOut: this.timedOut, truncated: this.truncated, budgetMs: this.owner.limits.budgetMs }
  }
}
const close = handle => { try { return Promise.resolve(handle.close()).catch(() => {}) } catch { return Promise.resolve() } }

export async function boundedFile(path, maxBytes, scope) {
  const fs = scope.owner.fs
  // lstat also refuses file symlinks on hosts without O_NOFOLLOW. On POSIX,
  // NOFOLLOW additionally closes the last-component replacement race.
  const before = await scope.io(() => fs.lstat(path))
  if (!before.isFile() || before.isSymbolicLink() || before.size > maxBytes) throw new Error('Not a bounded regular file')
  const file = await scope.io(() => fs.open(path, constants.O_RDONLY | (constants.O_NONBLOCK ?? 0) | (constants.O_NOFOLLOW ?? 0)), handle => scope.close(handle))
  try {
    const info = await scope.io(() => file.stat())
    if (!info.isFile() || info.size > maxBytes) throw new Error('Not a bounded regular file')
    const buffer = Buffer.alloc(maxBytes + 1)
    let offset = 0
    while (offset < buffer.length) {
      const { bytesRead } = await scope.io(() => file.read(buffer, offset, buffer.length - offset, offset))
      if (!bytesRead) break
      offset += bytesRead
    }
    if (offset > maxBytes) throw new Error('File too large')
    return buffer.subarray(0, offset).toString('utf8')
  } finally { await scope.close(file) }
}

export class CodexDiscovery {
  constructor({ home, env, directoryPath, limits = {}, fs = filesystem } = {}) {
    this.home = home
    this.env = env
    this.directoryPath = directoryPath
    this.fs = fs
    this.pending = 0
    this.closing = 0
    this.cached = new Map()
    // Internal test/embedding options can lower limits, never raise hard caps.
    this.limits = Object.fromEntries(Object.entries(DISCOVERY_LIMITS).map(([key, cap]) => [key, Number.isFinite(limits[key]) ? Math.max(1, Math.min(cap, Math.floor(limits[key]))) : cap]))
  }
  scope() { return new ScanScope(this) }
  async safeDirectory(path, scope) {
    // Check every component for automatic roots such as ~/.local/share: lstat
    // of the leaf alone would still follow a symlink in an ancestor.
    const rest = relative(this.home, path)
    const components = rest && !rest.startsWith(`..${sep}`) && rest !== '..' && !rest.startsWith(sep) ? rest.split(sep) : []
    let current = components.length ? this.home : path
    for (const part of [undefined, ...components]) {
      if (part !== undefined) current = join(current, part)
      const info = await scope.io(() => this.fs.lstat(current))
      if (!info.isDirectory() || info.isSymbolicLink()) return false
    }
    return true
  }
  async entries(path, scope) {
    const entries = []
    let dir, complete = false
    try {
      if (!scope.checkDirectory(path) || !await this.safeDirectory(path, scope)) return entries
      dir = await scope.io(() => this.fs.opendir(path), handle => scope.close(handle))
      for (let index = 0; index < this.limits.entriesPerDirectory && scope.active(); index++) {
        if (scope.entries >= this.limits.maxEntries) { scope.truncated = true; break }
        const entry = await scope.io(() => dir.read())
        if (!entry) { complete = true; break }
        scope.entries++
        entries.push(entry)
      }
      // No extra read merely to determine whether this directory was complete.
      // Hitting an entry cap is conservatively reported as a partial scan.
      if (!complete) scope.truncated = true
    } catch { /* missing, unreadable or slow directories are isolated */ }
    finally { if (dir) await scope.close(dir) }
    return entries.sort((a, b) => a.name.localeCompare(b.name))
  }
  remember(definitions) {
    for (const def of definitions) {
      this.cached.delete(def.id)
      this.cached.set(def.id, def)
    }
    while (this.cached.size > this.limits.maxSources) this.cached.delete(this.cached.keys().next().value)
  }
  async scan({ directory, fixedSources, historicalPaths, inspect }) {
    const scope = this.scope(), definitions = [], inspections = new Map(), seen = new Map(), visited = new Set(), queue = []
    const normalized = async value => scope.io(() => this.directoryPath(value))
    const enqueueRoot = path => {
      // A configured alias may resolve to home or a filesystem root. Never
      // turn either into a broad recursive crawl, even with the global caps.
      if (dirname(path) !== path) queue.push({ path, depth: 0, rootOnly: path === resolve(this.home) })
    }
    const add = async (path, { label = basename(path), id, isDefault = false, authPath, explicit = false, force = false } = {}) => {
      if (!scope.checkDirectory(resolve(path))) return
      let info, actual = resolve(path)
      try {
        if (explicit) actual = await scope.io(() => this.fs.realpath(actual))
        else { info = await scope.io(() => this.fs.lstat(actual)); if (!info.isDirectory() || info.isSymbolicLink()) return }
      } catch (error) { if (!force) return; if (isTimeout(error)) info = 'timed-out' }
      const auth = authPath ?? join(actual, 'auth.json')
      const previous = seen.get(auth)
      if (previous) { if (isDefault) previous.default = true; return previous }
      if (definitions.length >= this.limits.maxSources) { scope.truncated = true; scope.stopped = true; return }
      const def = { path: actual, label, id: id ?? sourceId(actual), default: isDefault, authPath: auth }
      // Reserve the canonical path before inspection, so concurrent literal
      // aliases never produce duplicate results or read the same auth twice.
      seen.set(auth, def)
      let inspected
      try { inspected = info === 'timed-out' ? { status: 'timed-out' } : await inspect(auth, scope) } catch { inspected = { status: 'timed-out' } }
      if (!scope.active() && !inspected) return
      const codexNamed = relative(this.home, actual).split(sep).some(part => /codex/iu.test(part))
      if (!force && (inspected.status === 'missing' || (!['ready', 'api-key'].includes(inspected.status) && !codexNamed))) {
        let config = ''
        try { config = await boundedFile(join(actual, 'config.toml'), this.limits.textBytes, scope) } catch { /* no Codex feature */ }
        if (!configFeature.test(config)) { seen.delete(auth); return }
      }
      // An unreadable/malformed auth remains useful for a Codex-named/configured
      // home, but an unrelated application's auth.json is not Codex evidence.
      // A timeout alone is not evidence of a home unless explicitly selected.
      if (!force && inspected.status === 'timed-out') { seen.delete(auth); return }
      if (definitions.length >= this.limits.maxSources) { seen.delete(auth); scope.truncated = true; return }
      definitions.push(def)
      inspections.set(def.id, inspected)
      return def
    }
    const visit = async task => {
      if (!scope.active() || visited.has(task.path)) return
      if (!scope.checkDirectory(task.path)) return
      visited.add(task.path)
      try { if (!await this.safeDirectory(task.path, scope)) return } catch { return }
      if (!task.rootOnly) await add(task.path)
      if (!scope.active()) return
      for (const entry of await this.entries(task.path, scope)) {
        if (!entry.isDirectory() || entry.isSymbolicLink() || ignored.test(entry.name)) continue
        if (task.rootOnly && !/codex/iu.test(entry.name)) continue
        if (!task.rootOnly && task.depth >= this.limits.maxDepth) { scope.truncated = true; continue }
        if (queue.length + visited.size >= this.limits.maxDirectories) { scope.truncated = true; break }
        queue.push({ path: join(task.path, entry.name), depth: task.rootOnly ? 0 : task.depth + 1 })
      }
    }
    const workers = async items => {
      let next = 0
      const count = Math.min(this.limits.concurrency - this.pending - this.closing, items.length)
      if (count <= 0 && items.length) { scope.timedOut = true; scope.stopped = true; return }
      await Promise.all(Array.from({ length: count }, async () => {
        while (scope.active() && next < items.length) await items[next++]()
      }))
    }
    try {
      if (directory !== undefined) {
        const path = await normalized(directory)
        await add(path, { id: 'directory', label: '所选目录', explicit: true, force: true })
      } else if (fixedSources) {
        for (const item of fixedSources.slice(0, this.limits.maxSources)) {
          if (!scope.active()) break
          const auth = typeof item.path === 'function' ? item.path() : item.path
          await add(dirname(auth), { id: item.id, label: item.label ?? item.id, authPath: auth, isDefault: item.default === true || item.id === 'codex', explicit: true, force: true })
        }
        if (fixedSources.length > this.limits.maxSources) scope.truncated = true
      } else {
        let environmentDefault = false
        if (this.env.CODEX_HOME) {
          try {
            const path = await normalized(this.env.CODEX_HOME)
            environmentDefault = true
            const def = await add(path, { id: 'codex-home', label: '默认目录（CODEX_HOME）', isDefault: true, explicit: true, force: true })
            enqueueRoot(def?.path ?? path)
          } catch { /* malformed environment is not admitted */ }
        }
        const global = join(this.home, '.codex')
        let globalDef
        if (scope.active()) globalDef = await add(global, { id: 'codex', label: '全局目录（~/.codex）', isDefault: !environmentDefault, explicit: true, force: true })
        enqueueRoot(globalDef?.path ?? global)
        queue.push({ path: this.home, depth: 0, rootOnly: true }, ...['.config', '.local/share', '.local/state', ...(process.platform === 'darwin' ? ['Library/Application Support'] : [])].map(path => ({ path: join(this.home, path), depth: 1 })))
        // Historical imports are explicit definitions, not roots to recurse.
        if (historicalPaths && scope.active()) {
          try {
            for (const value of (await historicalPaths(scope)).slice(0, this.limits.maxHistory)) {
              if (!scope.active()) break
              try { const path = await normalized(value); await add(path, { label: '历史导入目录', explicit: true, force: true }) } catch { /* invalid history */ }
            }
          } catch { /* a slow credential service must not block file discovery */ }
        }
        // Read a bounded number of ordinary user launchers and shell startup
        // files as text. Their filename need not belong to a particular tool.
        const bin = join(this.home, '.local', 'bin')
        const declarations = (await this.entries(bin, scope)).filter(entry => entry.isFile() && !entry.isSymbolicLink()).slice(0, this.limits.maxDeclarations).map(entry => ({ path: join(bin, entry.name), label: entry.name }))
        if (declarations.length >= this.limits.maxDeclarations) scope.truncated = true
        declarations.push(...['.profile', '.bash_profile', '.bashrc', '.zprofile', '.zshrc'].map(name => ({ path: join(this.home, name), label: name })))
        await workers(declarations.map(file => async () => {
          let text
          try { text = await boundedFile(file.path, this.limits.textBytes, scope) } catch { return }
          for (const value of literalCodexHomes(text)) {
            if (!scope.active()) break
            try { const path = await normalized(value); await add(path, { label: file.label, explicit: true, force: true }) } catch { /* not a literal absolute home */ }
          }
        }))
        // Breadth-first traversal; waves preserve priority for shallow homes.
        while (scope.active() && queue.length) {
          const wave = queue.splice(0, this.limits.concurrency)
          await workers(wave.map(task => () => visit(task)))
        }
      }
    } catch (error) { if (!isTimeout(error)) throw error }
    const scan = scope.finish()
    this.remember(definitions)
    return { definitions, inspections, scan }
  }
}

export const inspectionTimedOut = isTimeout
