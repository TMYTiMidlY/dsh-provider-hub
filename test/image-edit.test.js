import test from 'node:test'
import assert from 'node:assert/strict'
import { Context } from '@deepseek-ai/cordis'
import { SystemPrompt } from '@deepseek-ai/dsh-system-prompt'
import { ToolRuntime } from '@deepseek-ai/dsh-tools'
import { createScope } from '@deepseek-ai/dsh-scope'
import { createImageTool, imageResultContent } from '../lib/images.js'
import { generateImageBytes, IMAGE_ROUTES, normalizeImageRequest } from '../lib/image-providers.js'

const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0])
// Distinct headers are intentional unit-test transport fixtures; real decode
// admission is covered against LocalAttachmentStore in image-runtime.test.js.
const reference = Buffer.concat([png, Buffer.from('SECOND_REFERENCE')])
const signal = () => new AbortController().signal
const args = () => ({ prompt: 'Improve clarity; preserve identity; second image is lighting only.', imagePaths: ['source.png', 'light.png'] })
const auth = async () => ({ access: 'offline-secret', accountId: 'offline-account' })
function fixture({ config = {}, fsError, validationError, generate } = {}) {
  const calls = [], posts = []
  const fs = {
    async resolve(path, options) { calls.push(['resolve', path, options.cwd]); return path },
    async readBytes(target, s, limit) { s.throwIfAborted(); calls.push(['read', target, limit]); if (fsError) throw fsError; return target === 'light.png' ? reference : png },
    processPathFromHostPath: path => path,
  }
  const attachments = {
    imageLimits: { maxImageBytes: 1024, maxMessageImageBytes: 2048 },
    async validateImage(input) { calls.push(['validate', input.mediaType]); if (validationError) throw validationError },
    async saveImage() { calls.push(['preview']); return { attachmentId: 'sha256:' + 'a'.repeat(64), mediaType: 'image/png', width: 32, height: 32, bytes: png.length } },
    async saveFile({ name }) { calls.push(['file']); return { attachmentId: 'sha256:' + 'b'.repeat(64), name, bytes: png.length } },
  }
  const ctx = { attachments, credentials: {}, get: key => key === 'fs' ? fs : undefined }
  const tool = createImageTool(ctx, 'openai-codex', () => config, { codexAuth: auth, generate: generate ?? (async (_ctx, provider, body, s, options) => {
    posts.push({ provider, body, options }); s.throwIfAborted(); return { data: png, mediaType: 'image/png' }
  }) })
  const exec = { callId: 'offline-edit', signal: signal(), agent: { session: { header: { cwd: '/execution/workspace' } } } }
  return { ctx, fs, attachments, tool, exec, calls, posts }
}

test('unified Codex schema makes references optional and documents no fallback or exact-likeness guarantee', () => {
  const { tool } = fixture()
  assert.equal(tool.name, 'image_generate_codex')
  assert.deepEqual(tool.parameters.required, ['prompt'])
  assert.ok(tool.parameters.properties.imagePaths)
  assert.match(tool.description, /without falling back to text-only generation/u)
  assert.match(tool.description, /Do not promise unchanged pixels or perfect likeness/u)
  assert.ok(tool.timeoutMs > 600000)
})

test('generation and editing share common parameters, output shape and delivery contract', async () => {
  const f = fixture()
  const generation = createImageTool(f.ctx, 'openai-codex', () => ({}), { codexAuth: auth, generate: async () => ({ data: png, mediaType: 'image/png' }) })
  for (const key of ['prompt', 'aspectRatio', 'background']) {
    assert.equal(f.tool.parameters.properties[key].type, generation.parameters.properties[key].type)
    if (key !== 'prompt') assert.deepEqual(f.tool.parameters.properties[key], generation.parameters.properties[key])
  }
  assert.deepEqual(Object.keys(generation.parameters.properties), ['prompt', 'imagePaths', 'aspectRatio', 'background'])
  assert.deepEqual(Object.keys(f.tool.parameters.properties), ['prompt', 'imagePaths', 'aspectRatio', 'background'])
  assert.deepEqual(f.tool.output.schema, generation.output.schema)
  const generated = await generation.execute({ prompt: 'new image' }, f.exec)
  const edited = await f.tool.execute(args(), f.exec)
  assert.deepEqual(Object.keys(edited).sort(), Object.keys(generated).sort())
  assert.equal(generated.operation, 'generate'); assert.equal(generated.referenceCount, 0)
  assert.equal(edited.operation, 'edit'); assert.equal(edited.referenceCount, 2)
  for (const value of [generated, edited]) {
    const content = imageResultContent(value)
    assert.deepEqual(content.map(row => row.type), ['text', 'file'])
    assert.match(content[0].text, /Output:.*Preview may be normalized/u)
    assert.equal(generation.output.presentationMeta({}, value).kind, 'provider-hub-image')
  }
  // Old or misspelled reference arguments are rejected, never silently ignored.
  for (const key of ['referencedImagePaths', 'images', 'imagePath']) {
    await assert.rejects(generation.execute({ prompt: 'edit', [key]: ['source.png'] }, f.exec), error => error.name === 'ToolArgsError')
  }
})

test('editing reads ordered bounded local bytes through the FS capability before one request', async () => {
  const { tool, exec, calls, posts } = fixture()
  const result = await tool.execute(args(), exec)
  assert.equal(posts.length, 1)
  assert.equal(posts[0].options.operation, 'edit')
  assert.equal(posts[0].body.images.length, 2)
  assert.deepEqual(posts[0].body.images, [png, reference].map(data => ({ image_url: `data:image/png;base64,${data.toString('base64')}` })))
  assert.deepEqual(calls.filter(row => row[0] === 'resolve'), [['resolve', 'source.png', '/execution/workspace'], ['resolve', 'light.png', '/execution/workspace']])
  assert.equal(calls.filter(row => row[0] === 'validate').length, 3)
  assert.equal(result.operation, 'edit'); assert.equal(result.referenceCount, 2)
  assert.match(result.original.name, /^openai-codex-image-/u)
  assert.doesNotMatch(JSON.stringify(result), /base64|source.png|light.png/u)
  assert.match(imageResultContent(result)[0].text, /Generated one image using 2 reference images/u)
  assert.match(imageResultContent(result)[0].text, /Output:/u)
})

test('explicit undefined, empty, over-count, non-path and remote references cannot become text-only generation', async () => {
  for (const paths of [undefined, null, false, 'source.png', [], Array(6).fill('source.png'), [null], [''], ['\0'], ['https://example.org/a.png'], ['file:///private/a.png'], ['data:image/png;base64,abc']]) {
    const f = fixture()
    await assert.rejects(f.tool.execute({ prompt: 'edit', imagePaths: paths }, f.exec), error => error.name === 'ToolArgsError' || ['IMAGE_INVALID_INPUT', 'IMAGE_REFERENCE_INVALID'].includes(error.code))
    assert.equal(f.posts.length, 0)
  }
})

test('unreadable, corrupt or oversized references fail closed and redact the FS/store error', async () => {
  for (const options of [{ fsError: new Error('PRIVATE_FS_SENTINEL') }, { validationError: new Error('PRIVATE_STORE_SENTINEL') }]) {
    const f = fixture(options)
    await assert.rejects(f.tool.execute(args(), f.exec), error => error.code === 'IMAGE_REFERENCE_INVALID' && !/PRIVATE/u.test(error.message) && error.cause === undefined)
    assert.equal(f.posts.length, 0)
    assert.equal(f.calls.some(row => ['preview', 'file'].includes(row[0])), false)
  }
  const large = fixture()
  large.fs.readBytes = async () => Buffer.alloc(1025)
  await assert.rejects(large.tool.execute(args(), large.exec), error => error.code === 'IMAGE_REFERENCE_INVALID')
  assert.equal(large.posts.length, 0)
})

test('aggregate reference limit and absent FS prevent network dispatch', async () => {
  const total = fixture(); total.attachments.imageLimits.maxMessageImageBytes = 20
  await assert.rejects(total.tool.execute(args(), total.exec), error => error.code === 'IMAGE_REFERENCE_INVALID')
  assert.equal(total.posts.length, 0)
  const noFs = fixture(); noFs.ctx.get = () => undefined
  await assert.rejects(noFs.tool.execute(args(), noFs.exec), error => error.code === 'IMAGE_CONFIG')
  assert.equal(noFs.posts.length, 0)
})

test('disabled and pre-cancelled edit calls read no references and submit nothing', async () => {
  const disabled = fixture({ config: { imageProviders: [] } })
  await assert.rejects(disabled.tool.execute(args(), disabled.exec), error => error.code === 'IMAGE_DISABLED')
  assert.deepEqual(disabled.calls, [])
  const aborted = fixture()
  await assert.rejects(aborted.tool.execute(args(), { ...aborted.exec, signal: AbortSignal.abort() }), error => error.code === 'IMAGE_ABORTED')
  assert.deepEqual(aborted.calls, [])
})

test('reference-validation cancellation drains without starting an edit or persistence', async () => {
  const f = fixture(); const controller = new AbortController()
  f.attachments.validateImage = async () => { controller.abort() }
  await assert.rejects(f.tool.execute(args(), { ...f.exec, signal: controller.signal }), error => error.code === 'IMAGE_ABORTED')
  assert.equal(f.posts.length, 0)
})

test('caller FS isolation overrides the global FS and never falls back to host access', async () => {
  const root = new Context(); let scope
  try {
    await root.plugin(SystemPrompt, {})
    await root.plugin(ToolRuntime, { mode: 'native' })
    const f = fixture()
    root.provide('fs', f.fs)
    const isolated = root.isolate('fs')
    let denied = 0
    isolated.provide('fs', { resolve: async () => { denied++; throw new Error('ISOLATED_DENIAL') }, readBytes: async () => assert.fail('denied before read') })
    const agent = { ...f.exec.agent, ctx: isolated }
    scope = createScope(root, agent)
    root.tools.register(f.tool)
    const result = await root.tools.execute({ name: 'image_generate_codex', callId: 'isolated-edit', arguments: args(), agent, signal: signal() })
    assert.equal(result.isError, true)
    assert.equal(result.error.info.code, 'IMAGE_REFERENCE_INVALID')
    assert.equal(denied, 1); assert.equal(f.posts.length, 0); assert.deepEqual(f.calls, [])
    // An execution world with no FS is a configuration error, not host fallback.
    const absent = { ...f.exec, agent: { ...agent, ctx: { get: () => undefined } } }
    await assert.rejects(f.tool.execute(args(), absent), error => error.code === 'IMAGE_CONFIG')
    assert.deepEqual(f.calls, [])
  } finally { await scope?.dispose(); await root.fiber.dispose() }
})

test('the same Codex tool selects generations or edits solely from imagePaths presence', async () => {
  const f = fixture()
  const requests = []
  const fetcher = async (url, request) => {
    requests.push({ url, body: JSON.parse(request.body) })
    return Response.json({ data: [{ b64_json: png.toString('base64') }] })
  }
  const tool = createImageTool(f.ctx, 'openai-codex', () => ({}), { fetcher, codexAuth: auth })
  const text = await tool.execute({ prompt: 'new image' }, f.exec)
  assert.equal(text.operation, 'generate'); assert.equal(text.referenceCount, 0)
  assert.deepEqual(f.calls.filter(row => row[0] === 'read'), [])
  assert.equal(requests[0].url, IMAGE_ROUTES['openai-codex'].endpoint)
  assert.equal(requests[0].body.images, undefined)
  const withImages = await tool.execute(args(), f.exec)
  assert.equal(withImages.operation, 'edit'); assert.equal(withImages.referenceCount, 2)
  assert.equal(requests.length, 2, 'one POST per accepted call, never both endpoints')
  assert.equal(requests[1].url, IMAGE_ROUTES['openai-codex'].editEndpoint)
  assert.deepEqual(requests[1].body.images, [png, reference].map(data => ({ image_url: `data:image/png;base64,${data.toString('base64')}` })))
  await assert.rejects(tool.execute({ prompt: 'bad reference', imagePaths: [] }, f.exec), error => error.code === 'IMAGE_INVALID_INPUT')
  assert.equal(requests.length, 2, 'invalid images cannot issue a text-only fallback')
})

test('Z.AI tools remain text-only and reject reference parameters before dispatch', async () => {
  const f = fixture()
  for (const provider of ['zai', 'zai-cn']) {
    const tool = createImageTool(f.ctx, provider, () => ({ imageProviders: [provider] }), { generate: async () => assert.fail('must not dispatch') })
    assert.equal(tool.parameters.properties.imagePaths, undefined)
    await assert.rejects(tool.execute(args(), f.exec), error => error.name === 'ToolArgsError')
  }
})

test('edit transport sends exactly one authenticated JSON edits POST, retaining generation routing', async () => {
  const requests = []
  const fetcher = async (url, request) => { requests.push({ url, request }); return Response.json({ data: [{ b64_json: png.toString('base64') }] }) }
  const body = { ...normalizeImageRequest('openai-codex', { prompt: 'edit' }), images: [{ image_url: `data:image/png;base64,${png.toString('base64')}` }] }
  const result = await generateImageBytes({}, 'openai-codex', body, signal(), { fetcher, codexAuth: auth, operation: 'edit', callId: 'offline-edit-id' })
  assert.deepEqual(result.data, png)
  assert.equal(requests.length, 1)
  assert.equal(requests[0].url, IMAGE_ROUTES['openai-codex'].editEndpoint)
  assert.equal(requests[0].request.redirect, 'error')
  assert.deepEqual(JSON.parse(requests[0].request.body), body)
  assert.equal(requests[0].request.headers['x-codex-image-turn-id'], 'offline-edit-id')
  assert.equal(requests[0].request.headers.authorization, 'Bearer offline-secret')
  await generateImageBytes({}, 'openai-codex', normalizeImageRequest('openai-codex', { prompt: 'new' }), signal(), { fetcher, codexAuth: auth })
  assert.equal(requests[1].url, IMAGE_ROUTES['openai-codex'].endpoint)
})

test('unsupported or reference-free edit operations never authenticate or send a request', async () => {
  for (const [provider, body, operation] of [['zai', {}, 'edit'], ['openai-codex', {}, 'edit'], ['openai-codex', { images: [] }, 'edit'], ['openai-codex', { images: [{}] }, 'generate'], ['openai-codex', {}, 'other']]) {
    const forbidden = async () => assert.fail('must not dispatch')
    await assert.rejects(generateImageBytes({}, provider, body, signal(), { operation, codexAuth: forbidden, fetcher: forbidden }), error => error.code === 'IMAGE_INVALID_INPUT')
  }
})

test('edit transport loss is uncertain, sanitized and never retried', async () => {
  let calls = 0
  const body = { ...normalizeImageRequest('openai-codex', { prompt: 'edit' }), images: [{ image_url: 'data:image/png;base64,AAAA' }] }
  await assert.rejects(generateImageBytes({}, 'openai-codex', body, signal(), { operation: 'edit', codexAuth: auth, fetcher: async () => { calls++; throw new Error('PRIVATE_TRANSPORT') } }), error => /uncertain.*do not automatically retry/u.test(error.message) && !/PRIVATE/u.test(error.message))
  assert.equal(calls, 1)
})

test('unified reference calls use the same nested PTC dispatch and file forwarding', async () => {
  const root = new Context(); let scope
  try {
    await root.plugin(SystemPrompt, {})
    await root.plugin(ToolRuntime, { mode: 'both' })
    const f = fixture(); f.exec.agent.session.append = () => {}
    scope = createScope(root, f.exec.agent)
    root.tools.register(f.tool)
    root.provide('ptcRuntime', {
      language: 'typescript', timeout: { defaultMs: 120000, maxMs: 600000 }, resolve: spec => spec,
      run: async spec => ({ logs: [], value: await spec.bindings[0].functions.image_generate_codex(args()) }),
    })
    const result = await root.tools.execute({ name: 'run_code', callId: 'offline-unified-ptc', arguments: { description: 'offline reference generation', code: 'mock', timeoutMs: 400000 }, agent: f.exec.agent, signal: signal() })
    assert.equal(result.isError, false)
    assert.equal(f.posts.length, 1)
    assert.equal(f.posts[0].options.operation, 'edit')
    assert.equal(result.additionalContexts.length, 1)
    assert.deepEqual(result.additionalContexts[0].content.map(row => row.type), ['text', 'file'])
    assert.match(result.additionalContexts[0].content[0].text, /using 2 reference images/u)
    const legacy = await root.tools.execute({ name: 'image_edit_codex', callId: 'offline-removed-tool', arguments: args(), agent: f.exec.agent, signal: signal() })
    assert.equal(legacy.error.info.code, 'UNKNOWN_TOOL')
    assert.equal(f.posts.length, 1)
  } finally { await scope?.dispose(); await root.fiber.dispose() }
})

test('real Host registry validates unified reference input/output and respects the shared deny guard', async () => {
  const root = new Context(); let scope
  try {
    await root.plugin(SystemPrompt, {})
    await root.plugin(ToolRuntime, { mode: 'native' })
    const f = fixture(); scope = createScope(root, f.exec.agent)
    root.tools.register(f.tool)
    const invoke = arguments_ => root.tools.execute({ name: 'image_generate_codex', callId: 'offline-edit-registry', arguments: arguments_, agent: f.exec.agent, signal: signal() })
    assert.equal((await invoke({ prompt: 'invalid refs', imagePaths: [] })).isError, true)
    assert.equal(f.posts.length, 0)
    const result = await invoke(args())
    assert.equal(result.isError, false)
    assert.equal(result.value.operation, 'edit')
    assert.deepEqual(result.content.map(row => row.type), ['text', 'file'])
    const unguard = root.tools.guard(exec => exec.name === 'image_generate_codex' ? 'Edit forbidden' : undefined)
    assert.equal((await invoke(args())).isError, true)
    assert.equal(f.posts.length, 1)
    unguard()
  } finally { await scope?.dispose(); await root.fiber.dispose() }
})
