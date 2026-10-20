import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { HarnessError, projectFilesToText } from '@deepseek-ai/dsh-llm'
import { createImageTool, imageResultContent } from '../lib/images.js'
import { ImageError } from '../lib/image-auth.js'

const source = Buffer.from('OFFLINE_IMAGE_BYTES')
const digest = data => `sha256:${createHash('sha256').update(data).digest('hex')}`
const freshSignal = () => new AbortController().signal

function fixture({ modalities = ['text', 'image'], config = {}, generate, mapping = true } = {}) {
  const calls = []; const originals = []; const contexts = []; const routes = []
  const attachments = {
    imageLimits: { maxImageBytes: 2048, maxMessageImageBytes: 4096 },
    async validateImage(input) { calls.push('validate'); assert.deepEqual(input.data, source) },
    async saveImage(input) {
      calls.push('preview')
      return { attachmentId: digest(Buffer.from('NORMALIZED_PREVIEW')), mediaType: 'image/webp', bytes: 18, width: 32, height: 16, originalDimensions: { width: 64, height: 32 }, name: input.name }
    },
    async saveFile(input) { calls.push('original'); originals.push(Buffer.from(input.data)); return { attachmentId: digest(input.data), name: input.name, bytes: input.data.byteLength } },
    fileHostPath(ref) { return `/immutable/${ref.name}` },
  }
  const ctx = {
    attachments,
    credentials: { readRecord() { throw new Error('REAL_CREDENTIAL_READ_FORBIDDEN') } },
    get(name) {
      if (name === 'llm') return { async resolveModelInfo(provider, model, signal) { signal.throwIfAborted(); routes.push([provider, model]); return { inputModalities: modalities } } }
      if (name === 'fs') return { processPathFromHostPath(path) { return mapping ? `/execution${path}` : undefined } }
    },
  }
  const tool = createImageTool(ctx, 'openai-codex', () => config, {
    codexAuth: async () => { throw new Error('REAL_AUTH_FORBIDDEN') },
    generate: generate ?? (async (_ctx, provider, body, signal, options) => { calls.push('generate'); assert.equal(provider, 'openai-codex'); signal.throwIfAborted(); assert.equal(options.maxBytes, 2048); return { data: source, mediaType: 'image/png' } }),
  })
  const exec = { signal: freshSignal(), callId: 'offline-unit-image', agent: { session: { requestHeader: () => ({ config: { provider: 'chat-provider', model: 'chat-model' } }) } }, deferContext: context => contexts.push(context) }
  return { ctx, tool, exec, calls, originals, contexts, routes }
}

function rejectsCode(code) {
  return error => { assert.ok(error instanceof HarnessError); assert.equal(error.code, code); assert.equal(error.cause, undefined); return true }
}

test('image tool declares one generation only, stable outer budget and no binary output path/edit inputs', () => {
  const { tool } = fixture()
  assert.equal(tool.name, 'image_generate_codex')
  assert.ok(tool.timeoutMs > 600000)
  assert.equal(tool.isConcurrencySafe({ prompt: 'mock' }), true)
  assert.deepEqual(Object.keys(tool.parameters.properties), ['prompt', 'aspectRatio', 'background'])
  assert.deepEqual(tool.parameters.properties.aspectRatio.enum, ['auto', '1:1', '3:2', '2:3', '16:9', '9:16'])
  assert.match(tool.parameters.properties.aspectRatio.description, /Resolution cannot be requested/u)
  assert.match(tool.description, /alternatives, not an automatic batch/u)
  assert.match(tool.description, /does not edit/u)
  assert.match(tool.description, /Use image_edit_codex with imagePaths/u)
  assert.match(tool.description, /run_code.*timeoutMs/u)
})

test('generation returns normalized preview plus byte-exact original and execution-world path', async () => {
  const { tool, exec, calls, originals, contexts } = fixture()
  const value = await tool.execute({ prompt: 'mock new image' }, exec)
  assert.deepEqual(calls, ['generate', 'validate', 'preview', 'original'])
  assert.deepEqual(originals, [source])
  assert.equal(value.original.attachmentId, digest(source))
  assert.notEqual(value.image.attachmentId, value.original.attachmentId)
  assert.equal(value.image.mediaType, 'image/webp')
  assert.match(value.original.name, /^openai-codex-image-[0-9a-f-]+\.png$/u)
  assert.equal(value.originalPath, `/execution/immutable/${value.original.name}`)
  const content = imageResultContent(value)
  assert.deepEqual(content.map(block => block.type), ['text', 'file', 'image'])
  assert.match(content[0].text, /64x32/u)
  assert.match(content[0].text, /normalized.*original bytes/u)
  assert.equal(value.aspectRatio, 'auto')
  assert.equal(value.operation, 'generate')
  assert.equal(value.referenceCount, 0)
  assert.equal(value.aspectWarning, undefined, 'auto never drifts')
  assert.doesNotMatch(JSON.stringify(value), /OFFLINE_IMAGE_BYTES|NORMALIZED_PREVIEW/u)
  assert.equal(contexts.length, 0)
})

test('visible aspect deviation is reported as a soft warning while the image is still returned', async () => {
  const { tool, exec } = fixture()
  const value = await tool.execute({ prompt: 'mock square request', aspectRatio: '1:1' }, exec)
  assert.equal(value.aspectRatio, '1:1')
  assert.deepEqual(value.aspectWarning, { requested: '1:1', actual: '2.00:1.00' })
  const content = imageResultContent(value)
  assert.match(content[0].text, /Requested aspect: 1:1/u)
  assert.match(content[0].text, /WARNING.*deviates/u)
  assert.deepEqual(content.map(block => block.type), ['text', 'file', 'image'], 'the image still ships')
})

test('matching aspect ratio produces no warning field', async () => {
  const { tool, exec } = fixture()
  // The mock image is 64x32 (2:1); 16:9 differs by only 1.125x — within tolerance.
  const value = await tool.execute({ prompt: 'mock landscape request', aspectRatio: '16:9' }, exec)
  assert.equal(value.aspectWarning, undefined)
})

test('pure-text nested result forwards exactly one file context and projects to adapter-safe text', async () => {
  const { tool, exec, contexts } = fixture({ modalities: ['text'], mapping: false })
  const value = await tool.execute({ prompt: 'mock' }, { ...exec, parent: {} })
  assert.equal(value.imageForModel, false)
  assert.equal(value.originalPath, undefined)
  assert.equal(contexts.length, 1)
  assert.deepEqual(contexts[0].content.map(block => block.type), ['text', 'file'])
  const projected = projectFilesToText([contexts[0]], () => undefined)
  assert.ok(projected[0].content.every(block => block.type === 'text'))
  assert.match(projected[0].content[1].text, /cannot access a readable path/u)
})

test('vision nested result relies on Host PTC forwarding and does not defer another copy', async () => {
  const { tool, exec, contexts } = fixture()
  const value = await tool.execute({ prompt: 'mock' }, { ...exec, parent: {} })
  assert.equal(value.imageForModel, true)
  assert.equal(contexts.length, 0)
})

test('image capability follows current accepted request override and child/fork header, then options fallback', async () => {
  const { tool, exec, routes } = fixture()
  exec.agent.options = { provider: 'default-provider', model: 'default-model' }
  let header = { config: { provider: 'parent-route', model: 'parent-model' } }
  exec.agent.session.requestHeader = () => header
  await tool.execute({ prompt: 'parent' }, exec)
  header = { config: { provider: 'child-override', model: 'child-model' } }
  await tool.execute({ prompt: 'child after accepted resume request' }, exec)
  header = undefined
  await tool.execute({ prompt: 'fallback before a request header exists' }, exec)
  assert.deepEqual(routes, [['parent-route', 'parent-model'], ['child-override', 'child-model'], ['default-provider', 'default-model']])
})

test('missing/unknown LLM capabilities degrade to file-only rather than forcing images', async () => {
  for (const resolve of [undefined, async () => { throw new Error('SYNTHETIC_PRIVATE_MODEL_ERROR') }]) {
    const { tool, ctx, exec } = fixture()
    ctx.get = () => resolve && { resolveModelInfo: resolve }
    const value = await tool.execute({ prompt: 'mock' }, exec)
    assert.equal(value.imageForModel, false)
    assert.deepEqual(imageResultContent(value).map(block => block.type), ['text', 'file'])
  }
})

test('full execute boundary routes disabled/session/config/input failures without generation', async () => {
  const { tool, exec, calls } = fixture({ config: { imageProviders: [] } })
  await assert.rejects(tool.execute({ prompt: 'mock' }, exec), rejectsCode('IMAGE_DISABLED'))
  assert.deepEqual(calls, [])
  const enabled = fixture()
  await assert.rejects(enabled.tool.execute({ prompt: 'mock' }, { ...enabled.exec, agent: undefined }), rejectsCode('IMAGE_SESSION_REQUIRED'))
  enabled.ctx.attachments = {}
  await assert.rejects(enabled.tool.execute({ prompt: 'mock' }, enabled.exec), rejectsCode('IMAGE_CONFIG'))
  assert.deepEqual(enabled.calls, [])
  const invalid = fixture()
  await assert.rejects(invalid.tool.execute({ prompt: '   ' }, invalid.exec), rejectsCode('IMAGE_INVALID_INPUT'))
  invalid.ctx.attachments.imageLimits = undefined
  await assert.rejects(invalid.tool.execute({ prompt: 'mock' }, invalid.exec), rejectsCode('IMAGE_CONFIG'))
  const invalidSettings = fixture({ config: { imageTimeoutMs: 600001 } })
  await assert.rejects(invalidSettings.tool.execute({ prompt: 'mock' }, invalidSettings.exec), rejectsCode('IMAGE_CONFIG'))
  assert.deepEqual(invalid.calls, [])
  assert.deepEqual(invalidSettings.calls, [])
})

test('provider errors retain safe IMAGE code while arbitrary failures are redacted without causes', async () => {
  const explicit = fixture({ generate: async () => { throw new ImageError('Safe quota unavailable', 'IMAGE_QUOTA_UNAVAILABLE') } })
  await assert.rejects(explicit.tool.execute({ prompt: 'mock' }, explicit.exec), rejectsCode('IMAGE_QUOTA_UNAVAILABLE'))
  const secret = 'SYNTHETIC_PRIVATE_AUTH_TOKEN'
  const arbitrary = fixture({ generate: async () => { throw new Error(secret, { cause: new Error(secret) }) } })
  await assert.rejects(arbitrary.tool.execute({ prompt: 'mock' }, arbitrary.exec), error => { rejectsCode('IMAGE_PROVIDER_ERROR')(error); assert.doesNotMatch(error.message, new RegExp(secret, 'u')); return true })
})

test('invalid image validation and unsupported/over-limit results never save an original', async () => {
  const invalid = fixture()
  invalid.ctx.attachments.validateImage = async () => { throw new Error('CORRUPT_IMAGE_PRIVATE_DETAILS') }
  await assert.rejects(invalid.tool.execute({ prompt: 'mock' }, invalid.exec), rejectsCode('IMAGE_PROVIDER_ERROR'))
  assert.deepEqual(invalid.originals, [])
  assert.deepEqual(invalid.calls, ['generate'])
  for (const generated of [{ data: source, mediaType: 'image/gif' }, { data: Buffer.alloc(2049), mediaType: 'image/png' }]) {
    const f = fixture({ generate: async () => generated })
    await assert.rejects(f.tool.execute({ prompt: 'mock' }, f.exec), rejectsCode('IMAGE_INVALID_RESULT'))
    assert.deepEqual(f.originals, [])
  }
})

test('explicit cancellation before dispatch and between persistence phases prevents later writes', async () => {
  const before = fixture()
  await assert.rejects(before.tool.execute({ prompt: 'mock' }, { ...before.exec, signal: AbortSignal.abort('PRIVATE_CANCEL_REASON') }), rejectsCode('IMAGE_ABORTED'))
  assert.deepEqual(before.calls, [])
  const controller = new AbortController(); const afterValidation = fixture()
  afterValidation.ctx.attachments.validateImage = async () => { afterValidation.calls.push('validate'); controller.abort('PRIVATE_CANCEL_REASON') }
  await assert.rejects(afterValidation.tool.execute({ prompt: 'mock' }, { ...afterValidation.exec, signal: controller.signal }), rejectsCode('IMAGE_ABORTED'))
  assert.deepEqual(afterValidation.calls, ['generate', 'validate'])
  assert.deepEqual(afterValidation.originals, [])
})

test('finalizer preserves uncertain warning on outer deadlines but does not claim pre-dispatch side effects', () => {
  const { tool } = fixture()
  for (const code of ['TOOL_TIMEOUT', 'ABORTED']) {
    const content = tool.finalizeContent({}, { isError: true, content: [{ type: 'text', text: 'Generic host failure' }], error: { message: 'Generic host failure', info: { code } } })
    assert.match(content[1].text, /uncertain.*consumed quota.*do not automatically retry/u)
  }
  const denied = { isError: true, content: [{ type: 'text', text: 'No dispatch' }], error: { info: { code: 'ABORTED_BEFORE_DISPATCH' } } }
  assert.equal(tool.finalizeContent({}, denied), denied.content)
  const success = { isError: false, content: [{ type: 'text', text: 'ok' }] }
  assert.equal(tool.finalizeContent({}, success), success.content)
})
