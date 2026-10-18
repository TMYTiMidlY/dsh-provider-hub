import { randomUUID } from 'node:crypto'
import z from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { createUserMessage, HarnessError } from '@deepseek-ai/dsh-llm'
import { createCodexImageAuth, ImageError } from './image-auth.js'
import { generateImageBytes, IMAGE_ASPECTS, IMAGE_PROVIDERS, IMAGE_ROUTES, aspectDrift, imageDimensions, imageSelection, MAX_IMAGE_BYTES, normalizeImageRequest } from './image-providers.js'

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
    aspectWarning: { type: 'object', additionalProperties: false, properties: { requested: string, actual: string } },
    original: { type: 'object', required: true, additionalProperties: false, properties: { attachmentId: string, name: string, bytes: integer } },
    originalPath: { type: 'string' }, imageForModel: { type: 'boolean', required: true },
  },
}
const imageRef = ref => ({ attachmentId: String(ref.attachmentId), mediaType: ref.mediaType, bytes: ref.bytes, width: ref.width, height: ref.height,
  ...(ref.name === undefined ? {} : { name: ref.name }), ...(ref.originalDimensions === undefined ? {} : { originalDimensions: { ...ref.originalDimensions } }) })

export function imageResultContent(value) {
  const dimensions = value.image.originalDimensions ?? value.image
  const text = `Generated one image with ${IMAGE_ROUTES[value.provider].label}. Original: ${value.original.name}, ${dimensions.width}x${dimensions.height}, ${value.original.bytes} bytes. Requested aspect: ${value.aspectRatio}.`
    + (value.aspectWarning ? ` WARNING: the actual aspect ratio (${value.aspectWarning.actual}) visibly deviates from the requested ${value.aspectWarning.requested} — the endpoint rewrote it by content. Mention this deviation to the user; the image itself is still valid.` : '')
    + ' Preview may be normalized; the file attachment retains the original bytes.'
    + (value.originalPath ? `\nOriginal file: ${value.originalPath}\nUse present to declare the original as a final deliverable when needed.` : '')
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

export function createImageTool(ctx, provider, readConfig, { fetcher, codexAuth = createCodexImageAuth(ctx), generate = generateImageBytes } = {}) {
  const route = IMAGE_ROUTES[provider]
  const codex = provider === 'openai-codex'
  return defineTool({
    name: route.tool,
    description: `Generate exactly one new image using ${route.label}, only when the user requests image output. ${codex ? 'Uses the existing ChatGPT/Codex login.' : 'Uses this region\'s standard paid GLM-Image API; Coding Plan search/vision quota does not cover generation.'} Multiple enabled image tools are alternatives, not an automatic batch. Do not call multiple tools unless the user asks for outputs from multiple providers. This tool does not edit reference images. Never silently replace an edit with a new image. No automatic retry or provider fallback: after timeout/download failure generation may already have consumed quota. In run_code, explicitly choose a total timeoutMs large enough for this several-minute image call plus approval waits, within the deployment maximum. An outer run_code timeout may finish first and also has an uncertain remote outcome.`,
    parameters: {
      prompt: { type: 'string', required: true, description: 'Complete description of the new image.' },
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
        if (!exec.agent?.session) throw new ImageError('Image generation requires a session-owned tool call', 'IMAGE_SESSION_REQUIRED')
        const attachments = ctx.attachments
        if (!['validateImage', 'saveImage', 'saveFile'].every(key => typeof attachments?.[key] === 'function')) throw new ImageError('Durable image and original-file attachment storage is required', 'IMAGE_CONFIG')
        const body = normalizeImageRequest(provider, args)
        timeout = AbortSignal.timeout(config.imageTimeoutMs)
        signal = AbortSignal.any([signal, timeout])
        const imageForModel = await imageCapable(ctx, exec, signal)
        const maxBytes = Math.min(MAX_IMAGE_BYTES, attachments.imageLimits?.maxImageBytes, attachments.imageLimits?.maxMessageImageBytes)
        if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) throw new ImageError('Invalid deployment image byte limits', 'IMAGE_CONFIG')
        const generated = await generate(ctx, provider, body, signal, { fetcher, codexAuth, maxBytes, callId: exec.callId })
        signal.throwIfAborted()
        const extension = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }[generated.mediaType]
        if (!extension || generated.data.byteLength > maxBytes) throw new ImageError('Image result is invalid or exceeds deployment limits', 'IMAGE_INVALID_RESULT')
        const name = `${provider}-image-${randomUUID()}.${extension}`
        const input = { data: generated.data, mediaType: generated.mediaType, name }
        // Full image decode validates pixels/format before any original is saved.
        await attachments.validateImage(input)
        signal.throwIfAborted()
        const ref = await attachments.saveImage(input)
        signal.throwIfAborted()
        const original = await attachments.saveFile({ data: generated.data, name })
        signal.throwIfAborted()
        const hostPath = attachments.fileHostPath?.(original)
        const originalPath = hostPath ? ctx.get?.('fs')?.processPathFromHostPath?.(hostPath) : undefined
        // Soft drift check: exact header dimensions when parseable, otherwise
        // the (aspect-preserving) normalized preview dimensions.
        const exact = imageDimensions(generated.mediaType, generated.data)
        const dims = exact ?? { width: ref.width, height: ref.height }
        const aspect = args.aspectRatio ?? 'auto'
        const drift = aspectDrift(aspect, dims.width, dims.height)
        const value = { provider, aspectRatio: aspect, image: imageRef(ref), original: { attachmentId: String(original.attachmentId), name: original.name, bytes: original.bytes }, imageForModel,
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
          safeError = new ImageError(timedOut ? 'Image generation timed out; remote outcome is uncertain, do not automatically retry' : 'Image generation cancelled; remote work may already have consumed quota', timedOut ? 'IMAGE_TIMEOUT' : 'IMAGE_ABORTED')
        } else {
          safeError = error instanceof ImageError ? error : new ImageError('Image generation or persistence failed; not retried. Remote generation may already have consumed quota')
        }
        // Only this Host boundary depends on its public routable error class.
        // Never chain provider/store errors: their causes may contain secrets.
        throw new HarnessError(safeError.message, safeError.code)
      }
    },
  })
}

/** Global tools inherit the normal per-agent allow/deny mask and native/PTC mode. */
export function apply(ctx, config = {}) {
  const readConfig = () => ({ imageProviders: current(config.imageProviders), imageTimeoutMs: current(config.imageTimeoutMs) })
  const registered = new Map()
  const codexAuth = createCodexImageAuth(ctx)
  const sync = () => {
    const selected = imageSelection(readConfig()).imageProviders
    for (const [id, dispose] of registered) if (!selected.includes(id)) { dispose(); registered.delete(id) }
    for (const id of selected) if (!registered.has(id)) registered.set(id, ctx.tools.register(createImageTool(ctx, id, readConfig, { codexAuth })))
  }
  sync()
  ctx.on('loader/volatile-update', sync)
  ctx.effect(() => () => { for (const dispose of registered.values()) dispose(); registered.clear() }, 'dsh-image-tools: registrations')
}
export default { name, inject, Config, apply }
