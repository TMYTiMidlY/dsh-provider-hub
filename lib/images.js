import { randomUUID } from 'node:crypto'
import z from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { createUserMessage, HarnessError } from '@deepseek-ai/dsh-llm'
import { createCodexImageAuth, ImageError } from './image-auth.js'
import { generateImageBytes, IMAGE_ASPECTS, IMAGE_PROVIDERS, IMAGE_ROUTES, aspectDrift, imageDimensions, imageMediaType, imageSelection, MAX_IMAGE_BYTES, normalizeImageRequest } from './image-providers.js'

export const name = 'dsh-image-tools'
export const inject = ['tools', 'attachments', 'credentials']
export const Config = z.object({
  imageProviders: z.array(z.union(IMAGE_PROVIDERS.map(id => z.const(id)))).default(['openai-codex']).volatile(),
  imageTimeoutMs: z.number().step(1).min(1).max(600000).default(300000).volatile(),
})
const current = value => value && typeof value.get === 'function' ? value.get() : value
const string = { type: 'string', required: true }
const integer = { type: 'integer', required: true }
const imageSchema = {
  type: 'object', required: true, additionalProperties: false,
  properties: { attachmentId: string, mediaType: string, bytes: integer, width: integer, height: integer, name: { type: 'string' }, originalDimensions: { type: 'object', additionalProperties: false, properties: { width: integer, height: integer } } },
}
const outputSchema = {
  type: 'object', additionalProperties: false,
  properties: {
    provider: string, aspectRatio: string, image: imageSchema,
    operation: { type: 'string', required: true, enum: ['generate', 'edit'], description: 'The completed image operation.' },
    referenceCount: { type: 'integer', required: true, description: 'Number of input images; zero for text-to-image generation.' },
    aspectWarning: { type: 'object', additionalProperties: false, properties: { requested: string, actual: string } },
    original: { type: 'object', required: true, description: 'Byte-exact output file, not an input reference; image is its normalized preview.', additionalProperties: false, properties: { attachmentId: string, name: string, bytes: integer } },
    originalPath: { type: 'string', description: 'Readable output-file path in the calling execution world, when available.' },
    imageForModel: { type: 'boolean', required: true, description: 'Whether the result also includes an image block for this model.' },
  },
}
const imageRef = ref => ({ attachmentId: String(ref.attachmentId), mediaType: ref.mediaType, bytes: ref.bytes, width: ref.width, height: ref.height,
  ...(ref.name === undefined ? {} : { name: ref.name }), ...(ref.originalDimensions === undefined ? {} : { originalDimensions: { ...ref.originalDimensions } }) })

export function imageResultContent(value) {
  const dimensions = value.image.originalDimensions ?? value.image
  const text = `${value.operation === 'edit' ? `Edited one image using ${value.referenceCount} input image${value.referenceCount === 1 ? '' : 's'}` : 'Generated one image from text'} with ${IMAGE_ROUTES[value.provider].label}. Output: ${value.original.name}, ${dimensions.width}x${dimensions.height}, ${value.original.bytes} bytes. Requested aspect: ${value.aspectRatio}.`
    + (value.aspectWarning ? ` WARNING: the actual aspect ratio (${value.aspectWarning.actual}) visibly deviates from the requested ${value.aspectWarning.requested} — the endpoint rewrote it by content. Mention this deviation to the user; the image itself is still valid.` : '')
    + ' Preview may be normalized; the file attachment retains the original bytes.'
    + (value.originalPath ? `\nOutput file: ${value.originalPath}\nRead back the result and compare it with the request before delivery. Use present when a separate file deliverable is useful.` : '')
  return [{ type: 'text', text }, { type: 'file', attachment: value.original }, ...(value.imageForModel ? [{ type: 'image', attachment: value.image }] : [])]
}

async function imageCapable(ctx, exec, signal) {
  const routed = exec.agent?.session?.requestHeader?.()?.config
  const provider = routed?.provider ?? exec.agent?.options?.provider
  const model = routed?.model ?? exec.agent?.options?.model
  const llm = ctx.get?.('llm')
  if (!provider || !model || !llm?.resolveModelInfo) return false
  try { return (await llm.resolveModelInfo(provider, model, signal)).inputModalities?.includes('image') === true }
  catch { signal.throwIfAborted(); return false }
}

const uncertainOutcome = 'Remote image outcome is uncertain and generation may already have consumed quota; do not automatically retry or regenerate.'

function finalizeImageContent(_exec, result) {
  if (!result.isError || !['TOOL_TIMEOUT', 'ABORTED', 'IMAGE_TIMEOUT', 'IMAGE_ABORTED'].includes(result.error?.info?.code)) return result.content
  if (result.content.some(block => block.type === 'text' && block.text.includes('uncertain') && block.text.includes('do not automatically retry'))) return result.content
  return [...result.content, { type: 'text', text: uncertainOutcome }]
}

/** Read through the execution-world FS capability, never node:fs or remote URLs. */
async function referenceImages(ctx, args, exec, signal, maxBytes) {
  const paths = args.imagePaths
  if (!Array.isArray(paths) || paths.length < 1 || paths.length > 5 || paths.some(path => typeof path !== 'string' || !path.trim() || path.includes('\0') || (/^[a-z][a-z\d+.-]*:/iu.test(path) && !/^[a-z]:[\\/]/iu.test(path)))) {
    throw new ImageError('Editing requires 1–5 readable local reference image paths, not URLs', 'IMAGE_INVALID_INPUT')
  }
  // Global registration must not bypass an isolated/remote caller's FS.
  const executionCtx = exec.agent?.ctx ?? ctx
  const fs = executionCtx.get?.('fs')
  if (!fs?.resolve || !fs?.readBytes) throw new ImageError('Reference image editing requires an execution-world filesystem', 'IMAGE_CONFIG')
  const totalLimit = Math.min(MAX_IMAGE_BYTES, ctx.attachments.imageLimits.maxMessageImageBytes)
  let total = 0
  const images = []
  for (const path of paths) {
    signal.throwIfAborted()
    let data, mediaType
    try {
      const target = await fs.resolve(path, { cwd: exec.agent.session.header?.cwd, signal })
      const remaining = Math.min(maxBytes, totalLimit - total)
      if (remaining < 1) throw new Error('reference budget')
      data = Buffer.from(await fs.readBytes(target, signal, remaining))
      if (!data.length || data.length > remaining) throw new Error('reference budget')
      mediaType = imageMediaType(data)
      await ctx.attachments.validateImage({ data, mediaType })
    } catch {
      signal.throwIfAborted()
      throw new ImageError('A reference image is unreadable, invalid, unsupported or exceeds deployment limits; no image request was sent', 'IMAGE_REFERENCE_INVALID')
    }
    signal.throwIfAborted()
    total += data.length
    images.push({ image_url: `data:${mediaType};base64,${data.toString('base64')}` })
  }
  return images
}

export function createImageEditTool(ctx, readConfig, options = {}) {
  return createImageTool(ctx, 'openai-codex', readConfig, { ...options, operation: 'edit' })
}

export function createImageTool(ctx, provider, readConfig, { fetcher, codexAuth = createCodexImageAuth(ctx), generate = generateImageBytes, operation = 'generate' } = {}) {
  const route = IMAGE_ROUTES[provider]
  const codex = provider === 'openai-codex'
  const edit = operation === 'edit'
  if (!['generate', 'edit'].includes(operation) || edit && !route?.editTool) throw new ImageError('Unsupported image operation', 'IMAGE_CONFIG')
  const tool = defineTool({
    name: edit ? route.editTool : route.tool,
    description: `${edit ? 'Edit exactly one image from local input images' : 'Generate exactly one new image from text'} using ${route.label}, only when the user requests image output. `
      + (codex ? 'Uses the existing ChatGPT/Codex login. ' : 'Uses this region\'s standard paid GLM-Image API; Coding Plan search/vision quota does not cover generation. ')
      + (edit
        ? 'Provide imagePaths with the image to edit first, then any references; explain their roles and what to preserve in prompt. Never falls back to text-only generation. No mask support. Do not promise unchanged pixels or perfect likeness. '
        : `This tool does not edit existing images. ${codex ? 'Use image_edit_codex with imagePaths for reference-based work. ' : ''}Never silently replace an edit with a new image. `)
      + 'Returns the same preview, byte-exact output file and readable output path as the other image tools; read back and check the result before delivery. Multiple enabled image tools are alternatives, not an automatic batch. Follow the user\'s requested provider and batch size. No automatic retry or provider fallback: timeout, cancellation or download failure may already have consumed quota. In run_code, choose a total timeoutMs large enough for this several-minute call plus approval waits, within the deployment maximum; an outer timeout also leaves the remote outcome uncertain.',
    parameters: {
      prompt: { type: 'string', required: true, description: edit ? 'Changes to make, what to preserve, and the role of each reference in order.' : 'Complete description of the new image.' },
      ...(edit ? { imagePaths: { type: 'array', required: true, items: { type: 'string' }, description: '1–5 local paths readable in this execution world; original first, then optional style/lighting references. Images are sent to Codex. No URLs or base64. Byte and pixel limits apply.' } } : {}),
      // Measured: the endpoint normalizes total resolution (~1.57MP) and mostly
      // honors only the ratio, sometimes rewriting even that by content.
      aspectRatio: { type: 'string', enum: [...IMAGE_ASPECTS], description: `Aspect ratio hint (default auto). ${IMAGE_ASPECTS.slice(1).join(', ')}. Resolution cannot be requested; a visible ratio deviation is reported as a warning in the result.` },
      ...(codex ? { background: { type: 'string', enum: ['auto', 'opaque', 'transparent'], description: 'auto unless the user requests transparency.' } } : {}),
    },
    output: { schema: outputSchema, render: (_args, value) => imageResultContent(value), presentationMeta: (_args, value) => ({ kind: 'provider-hub-image', provider: value.provider, original: value.original, preview: value.image }) },
    // Keep the Host wrapper outside the maximum user budget so our own timer
    // normally wins. Finalization retains the uncertainty warning when a
    // shorter deployment/caller deadline wins instead.
    timeoutMs: 610000,
    finalizeContent: finalizeImageContent,
    // Each call is stateless (own config snapshot, lock-serialized credential
    // refresh, independent attachment writes) and the first-party endpoints
    // accept simultaneous generations. Parallel-safe lets the host run a
    // user-requested batch concurrently instead of an exclusive barrier that
    // serializes the step and burns queued calls' outer timeout budget.
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      let signal = exec.signal
      let timeout
      try {
        // One accepted call owns this snapshot. Disabling/unloading removes
        // later dispatches, but does not abandon already-started paid work.
        const config = imageSelection(readConfig())
        if (!config.imageProviders.includes(provider)) throw new ImageError('This image tool was disabled in settings', 'IMAGE_DISABLED')
        signal.throwIfAborted()
        if (!exec.agent?.session) throw new ImageError('Image tools require a session-owned tool call', 'IMAGE_SESSION_REQUIRED')
        const attachments = ctx.attachments
        if (!['validateImage', 'saveImage', 'saveFile'].every(key => typeof attachments?.[key] === 'function')) throw new ImageError('Durable image and original-file attachment storage is required', 'IMAGE_CONFIG')
        const body = normalizeImageRequest(provider, args)
        timeout = AbortSignal.timeout(config.imageTimeoutMs)
        signal = AbortSignal.any([signal, timeout])
        const imageForModel = await imageCapable(ctx, exec, signal)
        const maxBytes = Math.min(MAX_IMAGE_BYTES, attachments.imageLimits?.maxImageBytes, attachments.imageLimits?.maxMessageImageBytes)
        if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) throw new ImageError('Invalid deployment image byte limits', 'IMAGE_CONFIG')
        if (edit) body.images = await referenceImages(ctx, args, exec, signal, maxBytes)
        const generated = await generate(ctx, provider, body, signal, { fetcher, codexAuth, maxBytes, callId: exec.callId, operation })
        signal.throwIfAborted()
        const extension = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }[generated.mediaType]
        if (!extension || generated.data.byteLength > maxBytes) throw new ImageError('Image result is invalid or exceeds deployment limits', 'IMAGE_INVALID_RESULT')
        const name = `${provider}-${edit ? 'edit' : 'image'}-${randomUUID()}.${extension}`
        const input = { data: generated.data, mediaType: generated.mediaType, name }
        // Full image decode validates pixels/format before any original is saved.
        await attachments.validateImage(input)
        signal.throwIfAborted()
        const ref = await attachments.saveImage(input)
        signal.throwIfAborted()
        const original = await attachments.saveFile({ data: generated.data, name })
        signal.throwIfAborted()
        const hostPath = attachments.fileHostPath?.(original)
        const originalPath = hostPath ? (exec.agent?.ctx ?? ctx).get?.('fs')?.processPathFromHostPath?.(hostPath) : undefined
        // Soft drift check: exact header dimensions when parseable, otherwise
        // the (aspect-preserving) normalized preview dimensions.
        const exact = imageDimensions(generated.mediaType, generated.data)
        const dims = exact ?? { width: ref.width, height: ref.height }
        const aspect = args.aspectRatio ?? 'auto'
        const drift = aspectDrift(aspect, dims.width, dims.height)
        const value = { provider, aspectRatio: aspect, image: imageRef(ref), original: { attachmentId: String(original.attachmentId), name: original.name, bytes: original.bytes }, imageForModel,
          operation, referenceCount: edit ? body.images.length : 0,
          ...(drift ? { aspectWarning: { requested: drift.requested, actual: drift.actual } } : {}),
          ...(originalPath === undefined ? {} : { originalPath }) }
        // The Host PTC bridge already forwards image-bearing results once.
        // Text-only routes need their file handle forwarded explicitly.
        if (exec.parent !== undefined && !imageForModel) exec.deferContext(createUserMessage({ content: imageResultContent(value), source: { kind: 'provider-hub-image' } }))
        return value
      } catch (error) {
        let safeError
        if (signal.aborted) {
          const timedOut = timeout?.aborted && signal.reason === timeout.reason
          safeError = new ImageError(timedOut ? 'Image request timed out; remote outcome is uncertain, do not automatically retry' : 'Image request cancelled; remote work may already have consumed quota', timedOut ? 'IMAGE_TIMEOUT' : 'IMAGE_ABORTED')
        } else {
          safeError = error instanceof ImageError ? error : new ImageError('Image generation or persistence failed; not retried. Remote generation may already have consumed quota')
        }
        // Only this Host boundary depends on its public routable error class.
        // Never chain provider/store errors: their causes may contain secrets.
        throw new HarnessError(safeError.message, safeError.code)
      }
    },
  })
  // The implicit parameter DSL leaves objects open. Close this shared schema
  // before registration so unknown reference inputs cannot silently generate
  // a new image; defineTool's direct validator uses this same schema object.
  tool.parameters.additionalProperties = false
  return tool
}

/** Global tools inherit the normal per-agent allow/deny mask and native/PTC mode. */
export function apply(ctx, config = {}, updateContext = ctx) {
  const readConfig = () => ({ imageProviders: current(config.imageProviders), imageTimeoutMs: current(config.imageTimeoutMs) })
  const registered = new Map()
  const codexAuth = createCodexImageAuth(ctx)
  const sync = () => {
    const selected = imageSelection(readConfig()).imageProviders
    for (const [id, dispose] of registered) if (!selected.includes(id)) { dispose(); registered.delete(id) }
    for (const id of selected) if (!registered.has(id)) {
      const disposers = [ctx.tools.register(createImageTool(ctx, id, readConfig, { codexAuth }))]
      try { if (id === 'openai-codex') disposers.push(ctx.tools.register(createImageEditTool(ctx, readConfig, { codexAuth }))) }
      catch (error) { for (const dispose of disposers) dispose(); throw error }
      registered.set(id, () => { for (const dispose of disposers) dispose() })
    }
  }
  sync()
  // Loader targets the changed entry's exact fiber. Embedded image tools must
  // subscribe through the owning Hub, not through this internal child fiber.
  const disposeUpdate = updateContext.on('loader/volatile-update', sync)
  ctx.effect(() => () => { disposeUpdate(); for (const dispose of registered.values()) dispose(); registered.clear() }, 'dsh-image-tools: registrations')
}
/** The Hub already validated these values and owns their live boxes. Do not
 * feed them through a second schema: a volatile box is not an array/number. */
export function installImageTools(ctx, config = {}) {
  return ctx.plugin({ name, inject, apply: imageCtx => apply(imageCtx, config, ctx) })
}

export default { name, inject, Config, apply }
