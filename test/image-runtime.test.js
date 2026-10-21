import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { access, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { createImageTool, installImageTools } from '../lib/images.js'
import { ImageError } from '../lib/image-auth.js'

// As in the search runtime suite, test the actual public Host packages without
// silently skipping CI. DSH_TEST_RUNTIME_ROOT can name an isolated installation.
const explicitRoot = process.env.DSH_TEST_RUNTIME_ROOT
const packageRoot = join(explicitRoot ?? '/usr/local/lib/node_modules/@deepseek-ai/dsh', 'node_modules/@deepseek-ai')
let usePeers = false
try { await access(join(packageRoot, 'dsh-tools/lib/index.js')) } catch (error) {
  if (explicitRoot !== undefined || !['ENOENT', 'ENOTDIR'].includes(error.code)) throw error
  usePeers = true
}
const moduleUrl = name => usePeers ? import.meta.resolve(`@deepseek-ai/${name}`) : pathToFileURL(join(packageRoot, name, 'lib/index.js')).href
const [{ Context }, { SystemPrompt }, { ToolRuntime }, { createScope }, timeoutPolicy, localAttachments, llm] = await Promise.all([
  import(moduleUrl('cordis')), import(moduleUrl('dsh-system-prompt')), import(moduleUrl('dsh-tools')),
  import(moduleUrl('dsh-scope')), import(moduleUrl('dsh-tool-call-timeout-policy')), import(moduleUrl('dsh-attachment-local')), import(moduleUrl('dsh-llm')),
])
const sharp = createRequire(moduleUrl('dsh-attachment-local'))('sharp')
const source = Buffer.from('OFFLINE_RUNTIME_IMAGE')
const hash = data => `sha256:${createHash('sha256').update(data).digest('hex')}`
const newSignal = () => new AbortController().signal
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done }); return { promise, resolve } }

function memoryAttachments() {
  const writes = []
  return {
    writes,
    imageLimits: { maxImageBytes: 2048, maxMessageImageBytes: 4096 },
    async validateImage() { writes.push('validate') },
    async saveImage(input) { writes.push('preview'); return { attachmentId: hash(Buffer.from('NORMALIZED')), mediaType: 'image/webp', bytes: 10, width: 64, height: 32, name: input.name } },
    async saveFile(input) { writes.push('original'); return { attachmentId: hash(input.data), name: input.name, bytes: input.data.byteLength } },
    fileHostPath(ref) { return `/immutable/${ref.name}` },
  }
}

async function withRuntime(operation, { mode = 'native', modalities = ['text', 'image'], generate, timeoutMs = 300000 } = {}) {
  const root = new Context(); const scopes = []; const attachments = memoryAttachments(); const routes = []; const calls = []
  let config = { imageProviders: ['openai-codex', 'zai', 'zai-cn'], imageTimeoutMs: timeoutMs }
  try {
    await root.plugin(SystemPrompt, {})
    root.provide('attachments', attachments)
    root.provide('credentials', { readRecord() { throw new Error('REAL_CREDENTIAL_READ_FORBIDDEN') } })
    root.provide('fs', { processPathFromHostPath: path => `/execution${path}` })
    root.provide('llm', { async resolveModelInfo(provider, model) { routes.push([provider, model]); return { inputModalities: modalities } } })
    await root.plugin(ToolRuntime, { mode })
    const agent = { options: { provider: 'default-route', model: 'default-model' }, session: { header: { cwd: '/offline/workspace' }, requestHeader: () => ({ config: { provider: 'accepted-route', model: 'accepted-model' } }), append(type, data) { calls.push({ type, data }) } } }
    const scope = createScope(root, agent); scopes.push(scope)
    const generateStub = generate ?? (async (_ctx, provider, body, signal) => { signal.throwIfAborted(); calls.push({ type: 'generate', provider, body }); return { data: source, mediaType: 'image/png' } })
    const makeTool = provider => createImageTool(root, provider, () => config, { generate: generateStub, codexAuth: async () => { throw new Error('REAL_AUTH_FORBIDDEN') } })
    let next = 0
    const invoke = (args = { prompt: 'offline new image' }, overrides = {}) => root.tools.execute({ name: 'image_generate_codex', callId: `offline-runtime-${++next}`, arguments: args, agent, signal: newSignal(), ...overrides })
    return await operation({ root, scope, scopes, agent, attachments, calls, routes, makeTool, invoke, config: () => config, setConfig: next => { config = { ...config, ...next } } })
  } finally {
    await Promise.all(scopes.map(scope => scope.dispose()))
    await root.fiber.dispose()
  }
}

async function scopedToolEffect(scope, callback) {
  let dispose
  await scope.ctx.plugin(Object.assign(ctx => { dispose = callback(ctx.tools) }, { inject: ['tools', 'systemPrompt'] }))
  return dispose
}

function installFakePtc(root, { timeoutMs, maximum = 600000 } = {}) {
  const run = async spec => {
    const child = spec.bindings[0].functions.image_generate_codex({ prompt: 'offline nested image' })
    if (timeoutMs === undefined) return { logs: [], value: await child }
    let timer
    try {
      return await Promise.race([child.then(value => ({ logs: [], value })), new Promise(done => { timer = setTimeout(() => done({ logs: [], error: { kind: 'timeout', message: `execution deadline reached (${timeoutMs}ms)` } }), timeoutMs) })])
    } finally { clearTimeout(timer) }
  }
  root.provide('ptcRuntime', { language: 'typescript', timeout: { defaultMs: timeoutMs ?? 120000, maxMs: maximum }, resolve: spec => spec, run })
}

function assertFailure(result, code) {
  assert.equal(result.isError, true)
  assert.equal(result.error.info.code, code)
  assert.doesNotMatch(JSON.stringify(result), /SYNTHETIC_PRIVATE|PRIVATE_CANCEL_REASON/u)
}

function assertUncertain(result) {
  const text = result.content.filter(block => block.type === 'text').map(block => block.text).join('\n')
  assert.match(text, /uncertain/u)
  assert.match(text, /do not automatically retry/u)
}

test('actual registry validates image inputs/outputs and retains machine errors at the full boundary', async () => {
  await withRuntime(async ({ root, makeTool, invoke, setConfig, calls, attachments }) => {
    root.tools.register(makeTool('openai-codex'))
    assertFailure(await invoke({ prompt: 'mock' }, { agent: undefined }), 'IMAGE_SESSION_REQUIRED')
    assertFailure(await invoke({ prompt: ' ' }), 'IMAGE_INVALID_INPUT')
    setConfig({ imageProviders: [] })
    assertFailure(await invoke(), 'IMAGE_DISABLED')
    setConfig({ imageProviders: ['openai-codex'], imageTimeoutMs: 600001 })
    assertFailure(await invoke(), 'IMAGE_CONFIG')
    assert.equal(calls.filter(row => row.type === 'generate').length, 0)
    assert.deepEqual(attachments.writes, [])
    setConfig({ imageTimeoutMs: 300000 })
    const result = await invoke()
    assert.equal(result.isError, false)
    assert.equal(result.value.original.attachmentId, hash(source))
    assert.deepEqual(result.content.map(block => block.type), ['text', 'file', 'image'])
    assert.equal(result.additionalContexts, undefined)
    assert.equal(result.meta.kind, 'provider-hub-image')
    assert.ok(Object.isFrozen(result.value))
  })
})

test('actual registry preserves safe quota/auth failures and redacts arbitrary provider causes', async () => {
  for (const error of [new ImageError('Safe quota unavailable', 'IMAGE_QUOTA_UNAVAILABLE'), new ImageError('Safe credentials unavailable', 'IMAGE_CREDENTIAL_MISSING'), new Error('SYNTHETIC_PRIVATE_TOKEN', { cause: new Error('SYNTHETIC_PRIVATE_CAUSE') })]) {
    await withRuntime(async ({ root, makeTool, invoke, attachments }) => {
      root.tools.register(makeTool('openai-codex'))
      const result = await invoke()
      assertFailure(result, error instanceof ImageError ? error.code : 'IMAGE_PROVIDER_ERROR')
      assert.deepEqual(attachments.writes, [])
    }, { generate: async () => { throw error } })
  }
})

test('global tools reach minimal and obey allow/deny intersection and monotonic guards', async () => {
  await withRuntime(async ({ root, makeTool, invoke, scope, scopes, calls, agent }) => {
    for (const provider of ['openai-codex', 'zai', 'zai-cn']) root.tools.register(makeTool(provider))
    // A minimal preset declares no mask, so it inherits all Host-global tools.
    const minimalAgent = { session: { header: {} } }; const minimalScope = createScope(root, minimalAgent); scopes.push(minimalScope)
    assert.equal(root.tools.schemas(minimalAgent).length, 3)
    const allowed = await scopedToolEffect(scope, tools => tools.restrict({ allow: ['image_generate_codex', 'image_generate_zai'] }))
    const denied = await scopedToolEffect(scope, tools => tools.restrict({ deny: ['image_generate_codex'] }))
    assert.deepEqual(root.tools.schemas(agent).map(tool => tool.name), ['image_generate_zai'])
    assertFailure(await invoke(), 'UNKNOWN_TOOL')
    assert.equal(calls.filter(row => row.type === 'generate').length, 0)
    denied(); allowed()
    const guard = root.tools.guard(() => 'Image generation denied by owner policy')
    assert.equal((await invoke()).isError, true)
    assert.equal(calls.filter(row => row.type === 'generate').length, 0)
    guard()
    assert.equal((await invoke()).isError, false)
    assert.equal(calls.filter(row => row.type === 'generate').length, 1)
  })
})

test('actual Cordis registration survives repeated volatile selections and unloads without duplicates', async () => {
  await withRuntime(async ({ root, config, setConfig }) => {
    setConfig({ imageProviders: ['openai-codex'] })
    const volatile = { imageProviders: { get: () => config().imageProviders }, imageTimeoutMs: { get: () => config().imageTimeoutMs } }
    // Exercise the same mount as Hub.apply(), including real Cordis child
    // activation. Passing these boxes into the standalone Config would fail.
    const fiber = await installImageTools(root, volatile)
    // Reproduce the real Loader's exact owner-fiber dispatch filter; a plain
    // root.emit would incorrectly let a child-owned listener pass this test.
    const emitUpdate = () => {
      const emitter = Object.create(root)
      emitter[Context.filter] = owner => owner.fiber === root.fiber
      root.emit(emitter, 'loader/volatile-update', [['imageProviders']])
    }
    const names = () => root.tools.schemas().map(tool => tool.name).sort()
    assert.deepEqual(names(), ['image_generate_codex'])
    assert.equal(root.tools.get('image_edit_codex'), undefined, 'the old model-facing edit name is not registered')
    assert.deepEqual(root.tools.schemas()[0].parameters.required, ['prompt'])
    assert.ok(root.tools.schemas()[0].parameters.properties.imagePaths, 'the registered generation schema includes optional references')
    for (let n = 0; n < 20; n++) {
      setConfig({ imageProviders: ['openai-codex', 'zai', 'zai-cn', 'zai'] }); emitUpdate()
      assert.deepEqual(names(), ['image_generate_codex', 'image_generate_zai', 'image_generate_zai_cn'])
      setConfig({ imageProviders: [] }); emitUpdate()
      assert.deepEqual(names(), [])
    }
    setConfig({ imageProviders: ['zai'] }); emitUpdate()
    assert.deepEqual(names(), ['image_generate_zai'])
    await fiber.dispose()
    assert.deepEqual(names(), [])
    // Disposed fiber listeners cannot restore registrations.
    emitUpdate()
    assert.deepEqual(names(), [])
  })
})

test('disabling/disposal blocks later dispatch but drains an already-started snapshot exactly once', async () => {
  const started = deferred(); const finish = deferred(); let generations = 0
  await withRuntime(async ({ root, makeTool, invoke, setConfig }) => {
    const dispose = root.tools.register(makeTool('openai-codex'))
    const pending = invoke()
    await started.promise
    setConfig({ imageProviders: [] }); dispose()
    assertFailure(await invoke(), 'UNKNOWN_TOOL')
    finish.resolve()
    const result = await pending
    assert.equal(result.isError, false)
    assert.equal(generations, 1)
  }, { generate: async () => { generations++; started.resolve(); await finish.promise; return { data: source, mediaType: 'image/png' } } })
})

test('native and PTC/both visibility share the same restricted dispatch, without mode overrides', async () => {
  await withRuntime(async ({ root, makeTool, invoke, scope, agent, calls }) => {
    root.tools.register(makeTool('openai-codex')); installFakePtc(root)
    assert.deepEqual(root.tools.wireSchemas(agent).schemas.map(tool => tool.name), ['image_generate_codex'])
    const restore = await scopedToolEffect(scope, tools => tools.presentAs('ptc'))
    assert.deepEqual(root.tools.wireSchemas(agent).schemas.map(tool => tool.name), ['run_code'])
    assertFailure(await invoke(), 'UNKNOWN_TOOL')
    assert.equal(calls.filter(row => row.type === 'generate').length, 0)
    const deny = await scopedToolEffect(scope, tools => tools.restrict({ deny: ['image_generate_codex'] }))
    const blocked = await invoke({ description: 'offline restricted PTC', code: 'mock' }, { name: 'run_code' })
    assert.equal(blocked.isError, true)
    assert.equal(calls.filter(row => row.type === 'generate').length, 0)
    deny(); restore()
    const restoreBoth = await scopedToolEffect(scope, tools => tools.presentAs('both'))
    assert.deepEqual(root.tools.wireSchemas(agent).schemas.map(tool => tool.name), ['image_generate_codex', 'run_code'])
    restoreBoth()
  })
})

test('real Host PTC bridge forwards one vision image context and one pure-text file context', async () => {
  for (const modalities of [['text', 'image'], ['text']]) {
    await withRuntime(async ({ root, makeTool, invoke, calls }) => {
      root.tools.register(makeTool('openai-codex')); installFakePtc(root)
      const result = await invoke({ description: 'offline PTC image', code: 'mock', timeoutMs: 400000 }, { name: 'run_code' })
      assert.equal(result.isError, false)
      assert.equal(result.additionalContexts.length, 1)
      const context = result.additionalContexts[0]
      assert.deepEqual(context.content.map(block => block.type), modalities.includes('image') ? ['text', 'file', 'image'] : ['text', 'file'])
      assert.equal(calls.filter(row => row.type === 'generate').length, 1)
      const dispatch = calls.find(row => row.type === 'tool/ptc-dispatch')
      assert.equal(dispatch.data.isError, false)
      assert.equal(dispatch.data.content.some(block => block.type === 'file'), true)
    }, { mode: 'both', modalities })
  }
})

test('post-execute blocking discards image and file contexts in real PTC forwarding', async () => {
  for (const modalities of [['text', 'image'], ['text']]) {
    await withRuntime(async ({ root, makeTool, invoke }) => {
      root.tools.register(makeTool('openai-codex')); installFakePtc(root)
      root.on('tools/post-execute', (exec, _result, next) => exec.name === 'image_generate_codex' ? Promise.resolve({ kind: 'block', feedback: [{ type: 'text', text: 'Blocked by deployment policy' }] }) : next())
      const result = await invoke({ description: 'offline blocked image', code: 'mock' }, { name: 'run_code' })
      assert.equal(result.isError, true)
      assert.equal(result.additionalContexts, undefined)
      assert.doesNotMatch(JSON.stringify(result), /sha256:/u)
    }, { mode: 'both', modalities })
  }
})

test('own timeout and caller cancellation retain safe structured codes, no writes and no retry', async () => {
  let generations = 0; const secondStarted = deferred()
  const generate = async (_ctx, _provider, _body, signal) => { generations++; if (generations === 2) secondStarted.resolve(); return new Promise((resolve, reject) => { if (signal.aborted) reject(signal.reason); else signal.addEventListener('abort', () => reject(signal.reason), { once: true }) }) }
  await withRuntime(async ({ root, makeTool, invoke, attachments }) => {
    root.tools.register(makeTool('openai-codex'))
    const keepAlive = setInterval(() => {}, 1000)
    try {
      const timed = await invoke()
      assertFailure(timed, 'IMAGE_TIMEOUT'); assertUncertain(timed)
      assert.equal(generations, 1)
      const controller = new AbortController()
      const cancelled = invoke(undefined, { signal: controller.signal })
      // Wait until the body of this second call is dispatched, not merely policy.
      await secondStarted.promise
      controller.abort('PRIVATE_CANCEL_REASON')
      const result = await cancelled
      assertFailure(result, 'IMAGE_ABORTED'); assertUncertain(result)
      assert.equal(generations, 2)
      assert.deepEqual(attachments.writes, [])
    } finally { clearInterval(keepAlive) }
  }, { timeoutMs: 25, generate })
})

test('real timeout-policy wrapper preserves uncertain warning when its earlier deadline wins', async () => {
  let generations = 0
  await withRuntime(async ({ root, makeTool, invoke, attachments }) => {
    await root.plugin(timeoutPolicy)
    const tool = makeTool('openai-codex')
    // Scale only the declaration for this deterministic test; production keeps
    // a 610000ms outer budget above the 600000ms configurable inner maximum.
    tool.timeoutMs = 15
    root.tools.register(tool)
    const result = await invoke()
    assertFailure(result, 'TOOL_TIMEOUT'); assertUncertain(result)
    assert.equal(generations, 1)
    assert.deepEqual(attachments.writes, [])
  }, { timeoutMs: 1000, generate: async (_ctx, _provider, _body, signal) => { generations++; return new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true })) } })
})

test('outer PTC deadline cancels and drains the nested generation without a retry', async () => {
  let generations = 0; let cleaned = false; let childResult
  await withRuntime(async ({ root, makeTool, invoke }) => {
    root.tools.register(makeTool('openai-codex')); installFakePtc(root, { timeoutMs: 10 })
    root.on('tools/result', (exec, result) => { if (exec.name === 'image_generate_codex') childResult = result })
    const result = await invoke({ description: 'offline outer deadline', code: 'mock' }, { name: 'run_code' })
    assert.equal(result.isError, true)
    assert.equal(cleaned, true)
    assert.equal(generations, 1)
    assertFailure(childResult, 'IMAGE_ABORTED'); assertUncertain(childResult)
  }, { mode: 'both', generate: async (_ctx, _provider, _body, signal) => { generations++; return new Promise((resolve, reject) => signal.addEventListener('abort', () => { cleaned = true; reject(signal.reason) }, { once: true })) } })
})

test('quiescent cancellation waits for non-cancellable attachment validation and starts no later writes', async () => {
  const validating = deferred(); const release = deferred()
  await withRuntime(async ({ root, makeTool, invoke, attachments }) => {
    attachments.validateImage = async () => { validating.resolve(); await release.promise }
    root.tools.register(makeTool('openai-codex'))
    const controller = new AbortController(); let settled = false
    const pending = invoke(undefined, { signal: controller.signal }).then(result => { settled = true; return result })
    await validating.promise; controller.abort('PRIVATE_CANCEL_REASON')
    await new Promise(done => setImmediate(done))
    assert.equal(settled, false)
    release.resolve()
    assertFailure(await pending, 'IMAGE_ABORTED')
    assert.deepEqual(attachments.writes, [])
  })
})

test('actual LocalAttachmentStore fully validates image and keeps metadata-rich original bytes verbatim', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-image-runtime-'))
  const resolvedDirectory = await realpath(directory)
  const root = new Context()
  try {
    const store = new localAttachments.LocalAttachmentStore(root, { dshHome: resolvedDirectory })
    const original = await sharp({ create: { width: 96, height: 64, channels: 3, background: '#12ab34' } }).withMetadata({ density: 120 }).png().toBuffer()
    const ctx = { attachments: store, credentials: {}, get: name => name === 'llm' ? { resolveModelInfo: async () => ({ inputModalities: ['text'] }) } : undefined }
    const tool = createImageTool(ctx, 'openai-codex', () => ({}), { generate: async () => ({ data: original, mediaType: 'image/png' }) })
    const result = await tool.execute({ prompt: 'offline codec fixture' }, { callId: 'offline-real-codec', signal: newSignal(), agent: { session: { requestHeader: () => ({ config: { provider: 'text', model: 'text' } }) } } })
    assert.equal(result.original.attachmentId, hash(original))
    const chunks = []; for await (const chunk of store.readFileStream(result.original)) chunks.push(Buffer.from(chunk))
    assert.deepEqual(Buffer.concat(chunks), original)
    const normalized = await store.readImage(result.image)
    assert.notDeepEqual(Buffer.from(normalized.data), original)
    assert.equal(normalized.ref.mediaType, 'image/jpeg')
    const metadata = await sharp(normalized.data).metadata()
    assert.equal(metadata.width, 96); assert.equal(metadata.height, 64)
    assert.equal(metadata.exif, undefined)
    assert.equal(result.imageForModel, false)
    assert.ok(llm.projectFilesToText([{ role: 'user', content: tool.output.render({}, result) }], () => undefined)[0].content.every(block => block.type === 'text'))
    let originalsSaved = 0
    const wrapped = { imageLimits: store.imageLimits, validateImage: input => store.validateImage(input), saveImage: input => store.saveImage(input), saveFile: input => { originalsSaved++; return store.saveFile(input) } }
    const invalidTool = createImageTool({ ...ctx, attachments: wrapped }, 'openai-codex', () => ({}), { generate: async () => ({ data: original.subarray(0, 40), mediaType: 'image/png' }) })
    await assert.rejects(invalidTool.execute({ prompt: 'offline corrupt image' }, { signal: newSignal(), agent: { session: {} } }), error => error.code === 'IMAGE_PROVIDER_ERROR' && error.cause === undefined)
    assert.equal(originalsSaved, 0)
    // Real filesystem + full decoder: original bytes reach the edits transport,
    // whereas a truncated image is rejected before any paid request.
    const { LocalFileSystem } = await import(moduleUrl('dsh-fs-local'))
    await root.plugin(LocalFileSystem, { cwd: resolvedDirectory })
    await writeFile(join(resolvedDirectory, 'reference.png'), original)
    await writeFile(join(resolvedDirectory, 'corrupt.png'), original.subarray(0, 40))
    let edits = 0
    const editTool = createImageTool({ ...ctx, get: key => key === 'fs' ? root.fs : undefined }, 'openai-codex', () => ({}), { generate: async (_ctx, _provider, body, _signal, options) => {
      edits++
      assert.equal(options.operation, 'edit')
      assert.equal(body.images[0].image_url, `data:image/png;base64,${original.toString('base64')}`)
      return { data: original, mediaType: 'image/png' }
    } })
    const exec = { signal: newSignal(), agent: { session: { header: { cwd: resolvedDirectory } } } }
    const edited = await editTool.execute({ prompt: 'offline edit', imagePaths: ['reference.png'] }, exec)
    assert.equal(edited.operation, 'edit'); assert.equal(edited.original.attachmentId, hash(original))
    await assert.rejects(editTool.execute({ prompt: 'offline invalid', imagePaths: ['corrupt.png'] }, exec), error => error.code === 'IMAGE_REFERENCE_INVALID')
    const pixelLimited = {
      ...ctx,
      get: key => key === 'fs' ? root.fs : undefined,
      attachments: {
        imageLimits: store.imageLimits,
        validateImage: input => localAttachments.validateImageFile(input, { ...store.imageLimits, maxImagePixels: 1 }, store.normalizationPolicy),
        saveImage: () => assert.fail('over-pixel reference must not be persisted'),
        saveFile: () => assert.fail('over-pixel reference must not be persisted'),
      },
    }
    const pixelTool = createImageTool(pixelLimited, 'openai-codex', () => ({}), { generate: async () => { edits++; assert.fail('over-pixel reference must not reach transport') } })
    await assert.rejects(pixelTool.execute({ prompt: 'offline pixel limit', imagePaths: ['reference.png'] }, exec), error => error.code === 'IMAGE_REFERENCE_INVALID')
    assert.equal(edits, 1)
  } finally {
    await root.fiber.dispose()
    // Verify the canonical deletion target is exactly this test-created root.
    assert.equal(await realpath(directory), resolvedDirectory)
    assert.equal(dirname(resolvedDirectory), await realpath(tmpdir()))
    assert.match(resolvedDirectory, /\/dsh-image-runtime-[^/]+$/u)
    await rm(resolvedDirectory, { recursive: true, force: true })
  }
})
