import { lookup as dnsLookup } from 'node:dns/promises'
import { request as httpsRequest } from 'node:https'
import { BlockList, isIP } from 'node:net'
import { Readable } from 'node:stream'
import { ImageError, resolveZaiImageKey } from './image-auth.js'

export const IMAGE_PROVIDERS = Object.freeze(['openai-codex', 'zai', 'zai-cn'])
export const IMAGE_ROUTES = Object.freeze({
  'openai-codex': Object.freeze({ tool: 'image_generate_codex', label: 'ChatGPT / Codex', model: 'gpt-image-2', endpoint: 'https://chatgpt.com/backend-api/codex/images/generations', editEndpoint: 'https://chatgpt.com/backend-api/codex/images/edits' }),
  zai: Object.freeze({ tool: 'image_generate_zai', label: 'Z.AI 国际版', model: 'glm-image', endpoint: 'https://api.z.ai/api/paas/v4/images/generations' }),
  'zai-cn': Object.freeze({ tool: 'image_generate_zai_cn', label: '智谱国内版', model: 'glm-image', endpoint: 'https://open.bigmodel.cn/api/paas/v4/images/generations' }),
})
export const MAX_IMAGE_BYTES = 32 * 1024 * 1024
const MAX_ERROR_BYTES = 64 * 1024

export function imageSelection(raw = {}) {
  const ids = raw.imageProviders ?? ['openai-codex']
  if (!Array.isArray(ids) || ids.some(id => !IMAGE_PROVIDERS.includes(id))) throw new ImageError('Invalid image tool selection', 'IMAGE_CONFIG')
  const timeoutMs = raw.imageTimeoutMs ?? 300000
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 600000) throw new ImageError('Image timeout must be between 1 and 600000 ms', 'IMAGE_CONFIG')
  return { imageProviders: [...new Set(ids)], imageTimeoutMs: timeoutMs }
}

// Measured on the subscription endpoint: total resolution is normalized to a
// ~1.57MP budget, so only the aspect ratio is a meaningful request hint.
// Canonical ladder entries are divisible by 32 (GLM) and 16 (Codex).
export const IMAGE_ASPECTS = Object.freeze(['auto', '1:1', '3:2', '2:3', '16:9', '9:16'])
const ASPECT_SIZES = Object.freeze({
  '1:1': '1024x1024', '3:2': '1536x1024', '2:3': '1024x1536', '16:9': '1536x864', '9:16': '864x1536',
})

export function normalizeImageRequest(provider, args) {
  if (!Object.hasOwn(IMAGE_ROUTES, provider)) throw new ImageError('Unknown image provider', 'IMAGE_CONFIG')
  const route = IMAGE_ROUTES[provider]
  const prompt = typeof args?.prompt === 'string' ? args.prompt.trim() : ''
  if (!prompt || prompt.length > (provider === 'openai-codex' ? 10000 : 1000)) throw new ImageError('Image prompt is empty or exceeds the provider limit', 'IMAGE_INVALID_INPUT')
  const codex = provider === 'openai-codex'
  const aspect = args.aspectRatio ?? 'auto'
  if (!IMAGE_ASPECTS.includes(aspect)) throw new ImageError('Invalid image aspect ratio', 'IMAGE_INVALID_INPUT')
  const body = { model: route.model, prompt }
  if (aspect === 'auto' && codex) body.size = 'auto'
  else body.size = ASPECT_SIZES[aspect === 'auto' ? '1:1' : aspect]
  if (codex) {
    const background = args.background ?? 'auto'
    if (!['auto', 'opaque', 'transparent'].includes(background)) throw new ImageError('Invalid image background', 'IMAGE_INVALID_INPUT')
    Object.assign(body, { background, n: 1 })
  } else body.quality = 'hd'
  return body
}

/** Exact pixel dimensions from PNG IHDR / JPEG SOF headers (no image library). */
export function imageDimensions(mediaType, data) {
  try {
    if (mediaType === 'image/png' && data.length >= 24 && data.readUInt32BE(12) === 0x49484452) {
      return { width: data.readUInt32BE(16), height: data.readUInt32BE(20) }
    }
    if (mediaType === 'image/jpeg') {
      let offset = 2
      while (offset + 9 < data.length) {
        if (data[offset] !== 0xff) { offset++; continue }
        const marker = data[offset + 1]
        if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
          return { height: data.readUInt16BE(offset + 5), width: data.readUInt16BE(offset + 7) }
        }
        offset += 2 + data.readUInt16BE(offset + 2)
      }
    }
  } catch { /* fall through to the caller's preview fallback */ }
  return undefined
}

const ASPECT_VALUE = { '1:1': 1, '3:2': 3 / 2, '2:3': 2 / 3, '16:9': 16 / 9, '9:16': 9 / 16 }

/** Soft-drift check: the endpoint rewrites aspect by content; warn, never fail. */
export function aspectDrift(aspect, width, height) {
  const wanted = ASPECT_VALUE[aspect]
  if (wanted === undefined || !Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1) return undefined
  const actual = width / height
  const drift = actual / wanted
  if (drift >= 0.8 && drift <= 1.25) return undefined
  const wide = actual >= 1
  const [a, b] = wide ? [actual, 1] : [1, 1 / actual]
  return { requested: aspect, actual: `${a.toFixed(2)}:${b.toFixed(2)}`, ratio: +drift.toFixed(2) }
}

function cancelBody(response) {
  // Initiate cleanup without letting a broken source's cancellation promise
  // keep an error/abort waiting forever. Always observe eventual rejection.
  try { void response.body?.cancel().catch(() => {}) } catch {}
}

/** Bound while reading, not after response.text/json has buffered everything. */
export async function boundedBytes(response, maxBytes, signal) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) {
    cancelBody(response)
    throw new ImageError('Invalid image response byte limit', 'IMAGE_CONFIG')
  }
  if (signal?.aborted) { cancelBody(response); signal.throwIfAborted() }
  const declared = Number(response.headers?.get('content-length'))
  if (Number.isFinite(declared) && declared > maxBytes) {
    cancelBody(response)
    throw new ImageError('Image response exceeds the configured byte limit', 'IMAGE_TOO_LARGE')
  }
  if (!response.body) throw new ImageError('Image service returned an unreadable response')
  const reader = response.body.getReader()
  const cancel = () => { void reader.cancel().catch(() => {}) }
  signal?.addEventListener('abort', cancel, { once: true })
  const chunks = []
  let total = 0
  try {
    for (;;) {
      signal?.throwIfAborted()
      const { done, value } = await reader.read()
      signal?.throwIfAborted()
      if (done) break
      total += value.byteLength
      if (total > maxBytes) throw new ImageError('Image response exceeds the configured byte limit', 'IMAGE_TOO_LARGE')
      chunks.push(Buffer.from(value))
    }
    return Buffer.concat(chunks, total)
  } catch {
    cancel()
    if (signal?.aborted) throw signal.reason
    if (total > maxBytes) throw new ImageError('Image response exceeds the configured byte limit', 'IMAGE_TOO_LARGE')
    throw new ImageError('Image response could not be read')
  } finally {
    signal?.removeEventListener('abort', cancel)
    reader.releaseLock()
  }
}

export function decodeImageBase64(encoded, maxBytes = MAX_IMAGE_BYTES) {
  if (typeof encoded !== 'string' || !encoded || encoded.length % 4 || encoded.length > Math.ceil(maxBytes / 3) * 4) throw new ImageError('Image service returned invalid or oversized base64', 'IMAGE_INVALID_RESULT')
  const decoded = Buffer.from(encoded, 'base64')
  // Native decode is permissive; canonical round-trip rejects junk/padding without
  // the recursive regular expression that overflows on multi-megabyte images.
  if (decoded.length > maxBytes || decoded.toString('base64') !== encoded) throw new ImageError('Image service returned invalid or oversized base64', 'IMAGE_INVALID_RESULT')
  return decoded
}

export function imageMediaType(data) {
  if (data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png'
  if (data[0] === 255 && data[1] === 216 && data[2] === 255) return 'image/jpeg'
  if (data.subarray(0, 4).toString() === 'RIFF' && data.subarray(8, 12).toString() === 'WEBP') return 'image/webp'
  throw new ImageError('Image service returned an unsupported image format', 'IMAGE_INVALID_RESULT')
}

const nonPublicV4 = new BlockList()
for (const [address, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24],
  ['192.88.99.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24],
  ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
]) nonPublicV4.addSubnet(address, prefix, 'ipv4')
const globalV6 = new BlockList()
globalV6.addSubnet('2000::', 3, 'ipv6')
const nonPublicV6 = new BlockList()
// Fail closed on IETF protocol assignments, documentation, 6to4 (which
// embeds IPv4), and retired 6bone. Only ordinary global unicast is eligible;
// mapped IPv4, NAT64, loopback, ULA, link-local and multicast are outside it.
for (const [address, prefix] of [['2001::', 23], ['2001:db8::', 32], ['2002::', 16], ['3ffe::', 16], ['3fff::', 20]]) {
  nonPublicV6.addSubnet(address, prefix, 'ipv6')
}
export function isPublicImageAddress(address) {
  if (typeof address !== 'string' || address.includes('%')) return false
  const family = isIP(address)
  return family === 4 ? !nonPublicV4.check(address, 'ipv4')
    : family === 6 && globalV6.check(address, 'ipv6') && !nonPublicV6.check(address, 'ipv6')
}

function imageLookup(host, signal, lookup) {
  // This is the socket's actual lookup, not a preflight followed by another
  // DNS lookup. Return only verified literal addresses to the connection.
  return (hostname, options, callback) => {
    const resolve = async () => {
      signal?.throwIfAborted()
      if (hostname.toLowerCase() !== host) throw new ImageError('Unexpected image download hostname', 'IMAGE_DOWNLOAD_FAILED')
      const addresses = await lookup(host, { all: true, verbatim: true })
      signal?.throwIfAborted()
      if (!Array.isArray(addresses) || !addresses.length || addresses.some(item => !isPublicImageAddress(item?.address) || isIP(item.address) !== item.family)) {
        throw new ImageError('Z.AI image hostname did not resolve exclusively to public addresses', 'IMAGE_DOWNLOAD_FAILED')
      }
      const family = options?.family
      const selected = addresses.filter(item => !family || item.family === family)
      if (!selected.length) throw new ImageError('Z.AI image hostname has no eligible public address', 'IMAGE_DOWNLOAD_FAILED')
      return selected.map(({ address, family }) => ({ address, family }))
    }
    void resolve().then(addresses => {
      if (options?.all) callback(null, addresses)
      else callback(null, addresses[0].address, addresses[0].family)
    }, () => callback(new ImageError('Z.AI image DNS/public-address validation failed; no download was made', 'IMAGE_DOWNLOAD_FAILED')))
  }
}

/** Direct HTTPS only: no ambient proxy, credentials, redirect, or second DNS lookup. */
export async function downloadZaiImage(url, signal, maxBytes = MAX_IMAGE_BYTES, { lookup = dnsLookup, request = httpsRequest } = {}) {
  signal?.throwIfAborted()
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > MAX_IMAGE_BYTES) throw new ImageError('Invalid image download byte limit', 'IMAGE_CONFIG')
  let parsed
  try { parsed = new URL(url) } catch { throw new ImageError('Z.AI returned an invalid image URL', 'IMAGE_INVALID_RESULT') }
  const host = parsed.hostname.toLowerCase()
  const domains = ['bigmodel.cn', 'chatglm.cn', 'z.ai']
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.port && parsed.port !== '443'
    || !domains.some(domain => host === domain || host.endsWith(`.${domain}`))) {
    throw new ImageError('Z.AI image URL is outside the allowed first-party HTTPS origins', 'IMAGE_INVALID_RESULT')
  }
  parsed.hash = ''
  return new Promise((resolve, reject) => {
    let outgoing, incoming, settled = false
    const finish = (error, bytes) => {
      if (settled) return
      settled = true
      signal?.removeEventListener('abort', abort)
      if (error) { incoming?.destroy(); outgoing?.destroy(); reject(error) }
      else resolve(bytes)
    }
    const failure = () => finish(signal?.aborted ? signal.reason : new ImageError('Z.AI original image download failed; generation may already have consumed quota, do not regenerate', 'IMAGE_DOWNLOAD_FAILED'))
    const abort = () => finish(signal.reason)
    signal?.addEventListener('abort', abort, { once: true })
    try {
      outgoing = request(parsed, {
        method: 'GET', headers: { accept: 'image/*' }, signal,
        // Never reuse a global/proxy agent socket that bypassed our lookup.
        agent: false, autoSelectFamily: false, rejectUnauthorized: true,
        maxHeaderSize: 16384, lookup: imageLookup(host, signal, lookup),
      }, response => {
        incoming = response
        if (settled) { response.destroy(); return }
        if (response.statusCode < 200 || response.statusCode >= 300 || !Number.isInteger(response.statusCode)) {
          // No redirect following and no unbounded/error-body buffering.
          finish(new ImageError(`Z.AI original image download failed (HTTP ${Number.isInteger(response.statusCode) ? response.statusCode : 'unknown'}); generation may already have consumed quota, do not regenerate`, 'IMAGE_DOWNLOAD_FAILED'))
          return
        }
        try {
          const readable = { headers: { get: name => response.headers[name] }, body: Readable.toWeb(response) }
          void boundedBytes(readable, maxBytes, signal).then(bytes => finish(undefined, bytes), error => {
            if (signal?.aborted) finish(signal.reason)
            else if (error instanceof ImageError) finish(error)
            else failure()
          })
        } catch { failure() }
      })
      outgoing.on('error', failure)
      if (settled) outgoing.destroy()
      else if (signal?.aborted) abort()
      else outgoing.end()
    } catch { failure() }
  })
}

function httpFailure(provider, status, value) {
  const rawCode = value?.error?.code ?? value?.code
  const code = typeof rawCode === 'string' || typeof rawCode === 'number' ? String(rawCode) : ''
  if (status === 401 || status === 403) return new ImageError(`${IMAGE_ROUTES[provider].label} image credentials were rejected; check Models`, 'IMAGE_CREDENTIAL_MISSING')
  if (provider !== 'openai-codex' && code === '1113') return new ImageError(`${IMAGE_ROUTES[provider].label} standard image API balance/resource package is unavailable; Coding Plan search quota does not cover GLM-Image`, 'IMAGE_QUOTA_UNAVAILABLE')
  if (status === 429) return new ImageError(`${IMAGE_ROUTES[provider].label} image quota or rate limit is unavailable`, 'IMAGE_QUOTA_UNAVAILABLE')
  return new ImageError(`${IMAGE_ROUTES[provider].label} image request failed (HTTP ${status}); not retried`)
}

/** Exactly one generation/edit POST. No provider/model/key fallback or automatic retries. */
export async function generateImageBytes(ctx, provider, body, signal, { fetcher = fetch, codexAuth, download = downloadZaiImage, maxBytes = MAX_IMAGE_BYTES, callId, operation = 'generate' } = {}) {
  signal.throwIfAborted()
  if (!Object.hasOwn(IMAGE_ROUTES, provider)) throw new ImageError('Unknown image provider', 'IMAGE_CONFIG')
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > MAX_IMAGE_BYTES) throw new ImageError('Invalid image byte limit', 'IMAGE_CONFIG')
  const route = IMAGE_ROUTES[provider]
  if (!['generate', 'edit'].includes(operation) || operation === 'edit' && !route.editEndpoint) throw new ImageError('Unsupported image operation', 'IMAGE_INVALID_INPUT')
  if (operation === 'edit' && (!Array.isArray(body?.images) || body.images.length < 1 || body.images.length > 5)) throw new ImageError('Image editing requires 1–5 reference images', 'IMAGE_INVALID_INPUT')
  if (operation === 'generate' && body?.images !== undefined) throw new ImageError('Reference images require the edit operation', 'IMAGE_INVALID_INPUT')
  const endpoint = operation === 'edit' ? route.editEndpoint : route.endpoint
  const headers = { 'content-type': 'application/json', accept: 'application/json' }
  if (provider === 'openai-codex') {
    const auth = await codexAuth(signal)
    Object.assign(headers, { authorization: `Bearer ${auth.access}`, 'chatgpt-account-id': auth.accountId, originator: 'deepseek-harness' })
    if (callId) headers['x-codex-image-turn-id'] = String(callId)
  } else headers.authorization = `Bearer ${await resolveZaiImageKey(ctx, provider, signal)}`
  signal.throwIfAborted()
  // Once this POST is submitted, any lost/invalid result is an uncertain paid
  // outcome, not permission to replay the generation or select another key.
  try {
    let response
    try { response = await fetcher(endpoint, { method: 'POST', redirect: 'error', headers, body: JSON.stringify(body), signal }) } catch {
      if (signal.aborted) throw signal.reason
      throw new ImageError('Image request transport failed; remote outcome is uncertain, do not automatically retry')
    }
    const maximum = response.ok && provider === 'openai-codex' ? Math.ceil(maxBytes / 3) * 4 + 1024 * 1024 : MAX_ERROR_BYTES
    let bytes
    try { bytes = await boundedBytes(response, maximum, signal) } catch (error) {
      if (!response.ok && !signal.aborted) throw httpFailure(provider, response.status)
      throw error
    }
    let value
    try { value = JSON.parse(bytes.toString('utf8')) } catch {
      if (response.ok) throw new ImageError('Image service returned invalid JSON', 'IMAGE_INVALID_RESULT')
    }
    if (!response.ok) throw httpFailure(provider, response.status, value)
    if (!Array.isArray(value?.data) || value.data.length !== 1) throw new ImageError('Image service did not return exactly one image', 'IMAGE_INVALID_RESULT')
    const image = provider === 'openai-codex' ? decodeImageBase64(value.data[0]?.b64_json, maxBytes)
      : await download(value.data[0]?.url, signal, maxBytes)
    return { data: image, mediaType: imageMediaType(image) }
  } catch (error) {
    if (signal.aborted) throw signal.reason
    if (error instanceof ImageError) throw new ImageError(`${error.message}; generation may already have consumed quota, do not automatically retry`, error.code)
    // A fetch, stream or TLS error can include signed URLs or bearer values.
    throw new ImageError('Image request or result transport failed; remote outcome is uncertain, do not automatically retry')
  }
}
