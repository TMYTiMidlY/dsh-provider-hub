import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { ImageError } from '../lib/image-auth.js'
import {
  aspectDrift, boundedBytes, decodeImageBase64, downloadZaiImage, generateImageBytes, IMAGE_ASPECTS, IMAGE_ROUTES,
  imageDimensions, imageMediaType, imageSelection, isPublicImageAddress, MAX_IMAGE_BYTES, normalizeImageRequest,
} from '../lib/image-providers.js'

const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0])
const signal = () => new AbortController().signal
const safe = error => !`${error.message}\n${error.stack}\n${JSON.stringify(error.cause)}`.includes('offline-secret-sentinel') && error.cause === undefined
const code = expected => error => error instanceof ImageError && error.code === expected
const auth = async () => ({ access: 'offline-access', accountId: 'offline-account' })
const codexBody = () => normalizeImageRequest('openai-codex', { prompt: 'offline picture' })

// Fake only the HTTPS socket/response boundary. The production URL validation,
// socket lookup callback, address classification and bounded reader all run.
// No DNS lookup or TCP/TLS connection is made by these tests.
function transport({ addresses = [{ address: '8.8.8.8', family: 4 }], status = 200, data = png, declared, lookupError, requestError, all = false, family = 0 } = {}) {
  const requests = [], lookups = [], connected = [], responses = []
  let delivered
  const responseReady = new Promise(resolve => { delivered = resolve })
  const lookup = async (host, options) => {
    lookups.push({ host, options })
    if (lookupError) throw lookupError
    return typeof addresses === 'function' ? addresses() : addresses
  }
  const request = (url, options, onResponse) => {
    const req = new EventEmitter()
    req.destroyed = false
    req.destroy = () => { req.destroyed = true }
    req.end = () => {
      queueMicrotask(() => {
        if (req.destroyed) return
        if (requestError) { req.emit('error', requestError); return }
        options.lookup(url.hostname, { family, all }, (error, address, resolvedFamily) => {
          if (error) { req.emit('error', error); return }
          if (req.destroyed) return
          connected.push(all ? address : { address, family: resolvedFamily })
          const response = new PassThrough()
          response.statusCode = status
          response.headers = { ...(declared === undefined ? {} : { 'content-length': String(declared) }), location: 'https://evil.example/redirect' }
          responses.push(response)
          onResponse(response)
          delivered()
          if (data !== undefined && data !== null) response.end(data)
        })
      })
    }
    requests.push({ url, options, req })
    return req
  }
  return { lookup, request, requests, lookups, connected, responses, responseReady }
}
const regionalCtx = refs => ({ credentials: {
  async readRecord() { return undefined },
  async resolve(ref) { return refs[ref] === undefined ? undefined : { value: refs[ref] } },
} })

test('selection defaults, multiple alternatives and explicit all-off do not imply a batch', () => {
  assert.deepEqual(imageSelection(), { imageProviders: ['openai-codex'], imageTimeoutMs: 300000 })
  assert.deepEqual(imageSelection({ imageProviders: [] }).imageProviders, [])
  assert.deepEqual(imageSelection({ imageProviders: ['zai', 'zai-cn', 'zai'] }).imageProviders, ['zai', 'zai-cn'])
  for (const raw of [{ imageProviders: 'zai' }, { imageProviders: ['unknown'] }, { imageTimeoutMs: 0 }, { imageTimeoutMs: 600001 }, { imageTimeoutMs: 1.5 }]) assert.throws(() => imageSelection(raw), code('IMAGE_CONFIG'))
})

test('normalized requests are bounded, fixed-model, single-image generation only', () => {
  assert.deepEqual(codexBody(), { model: 'gpt-image-2', prompt: 'offline picture', size: 'auto', background: 'auto', n: 1 })
  assert.deepEqual(normalizeImageRequest('zai', { prompt: '  offline  ' }), { model: 'glm-image', prompt: 'offline', size: '1024x1024', quality: 'hd' })
  assert.equal(normalizeImageRequest('openai-codex', { prompt: 'offline', aspectRatio: '1:1', background: 'transparent' }).background, 'transparent')
  assert.equal(normalizeImageRequest('zai-cn', { prompt: 'offline', aspectRatio: '16:9' }).size, '1536x864')
  assert.equal(normalizeImageRequest('openai-codex', { prompt: 'offline', aspectRatio: '9:16' }).size, '864x1536')
  assert.equal(normalizeImageRequest('openai-codex', { prompt: 'offline', n: 5, model: 'other', images: ['reference'] }).n, 1)
  for (const provider of ['unknown', 'constructor', 'toString']) assert.throws(() => normalizeImageRequest(provider, { prompt: 'offline' }), code('IMAGE_CONFIG'))
  for (const args of [{ prompt: '' }, { prompt: 'a'.repeat(10001) }, { prompt: 'offline', aspectRatio: '4:3' }, { prompt: 'offline', aspectRatio: 1 }, { prompt: 'offline', background: 'bad' }]) assert.throws(() => normalizeImageRequest('openai-codex', args), code('IMAGE_INVALID_INPUT'))
  for (const args of [{ prompt: 'a'.repeat(1001) }, { prompt: 'offline', aspectRatio: '5:4' }]) assert.throws(() => normalizeImageRequest('zai', args), code('IMAGE_INVALID_INPUT'))
  assert.ok(Object.isFrozen(IMAGE_ROUTES.zai))
  assert.deepEqual([...IMAGE_ASPECTS], ['auto', '1:1', '3:2', '2:3', '16:9', '9:16'])
  // Every canonical ladder entry satisfies both providers' divisibility rules.
  for (const aspect of ['1:1', '3:2', '2:3', '16:9', '9:16']) {
    const { size } = normalizeImageRequest('zai-cn', { prompt: 'offline', aspectRatio: aspect })
    const [width, height] = size.split('x').map(Number)
    assert.equal(width % 32 + height % 32, 0, `${aspect} -> ${size} must be divisible by 32`)
  }
})

test('header dimensions parse PNG IHDR and JPEG SOF exactly, and aspect drift warns only on visible deviation', () => {
  const be32 = value => Buffer.from([value >>> 24, value >>> 16 & 255, value >>> 8 & 255, value & 255])
  const be16 = value => Buffer.from([value >>> 8, value & 255])
  const pngHeader = (width, height) => Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), be32(13), Buffer.from('IHDR', 'ascii'), be32(width), be32(height)])
  const jpegSof = (width, height) => Buffer.concat([Buffer.from([0xff, 0xd8]), Buffer.from([0xff, 0xe0]), be16(16), Buffer.from('JFIF\0', 'ascii'), Buffer.alloc(9), Buffer.from([0xff, 0xc0]), be16(17), Buffer.from([8]), be16(height), be16(width), Buffer.from([3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1])])
  assert.deepEqual(imageDimensions('image/png', pngHeader(1638, 1234)), { width: 1638, height: 1234 })
  assert.equal(imageDimensions('image/png', Buffer.alloc(8)), undefined)
  assert.equal(imageDimensions('image/webp', pngHeader(1, 1)), undefined, 'webp falls back to preview dimensions')
  assert.deepEqual(imageDimensions('image/jpeg', jpegSof(1638, 1234)), { width: 1638, height: 1234 })
  assert.equal(imageDimensions('image/jpeg', Buffer.from([0xff, 0xd8, 0xff, 0xd9])), undefined)
  assert.equal(aspectDrift('1:1', 1254, 1254), undefined, 'square matches')
  assert.equal(aspectDrift('2:3', 1024, 1536), undefined, 'portrait matches')
  assert.deepEqual(aspectDrift('1:1', 1536, 1024), { requested: '1:1', actual: '1.50:1.00', ratio: 1.5 }, 'landscape from square request warns')
  assert.deepEqual(aspectDrift('16:9', 1254, 1254), { requested: '16:9', actual: '1.00:1.00', ratio: 0.56 }, 'square from 16:9 request warns')
  assert.equal(aspectDrift('auto', 1536, 1024), undefined, 'auto never warns')
  assert.equal(aspectDrift('1:1', 0, 0), undefined, 'degenerate dimensions never warn')
})

test('canonical base64 handles multi-megabyte images and exact decoded limits without recursive regex', () => {
  const large = Buffer.alloc(6 * 1024 * 1024 + 1, 93), encoded = large.toString('base64')
  assert.deepEqual(decodeImageBase64(encoded, large.length), large)
  assert.throws(() => decodeImageBase64(encoded, large.length - 1), code('IMAGE_INVALID_RESULT'))
  for (const invalid of ['', 'Zh==', 'Zg===', 'Zg=\n', 'Z-g=', '====', 'Zg']) assert.throws(() => decodeImageBase64(invalid), code('IMAGE_INVALID_RESULT'))
  for (const length of [1, 2, 3, 4, 5]) assert.equal(decodeImageBase64(Buffer.alloc(length).toString('base64'), length).length, length)
})

test('media sniffing recognizes supported headers but leaves complete decoding to attachment validation', () => {
  assert.equal(imageMediaType(png), 'image/png')
  assert.equal(imageMediaType(Buffer.from([255, 216, 255, 0])), 'image/jpeg')
  assert.equal(imageMediaType(Buffer.from('RIFFxxxxWEBP')), 'image/webp')
  assert.throws(() => imageMediaType(Buffer.from('<html>')), code('IMAGE_INVALID_RESULT'))
})

test('bounded reader accepts exact limit and caps actual bytes even with dishonest content-length', async () => {
  assert.deepEqual(await boundedBytes(new Response(png), png.length, signal()), png)
  let cancelled = 0
  const response = new Response(new ReadableStream({ start(c) { c.enqueue(new Uint8Array(9)); c.enqueue(new Uint8Array(9)) }, cancel() { cancelled++ } }), { headers: { 'content-length': '1' } })
  await assert.rejects(boundedBytes(response, 16, signal()), code('IMAGE_TOO_LARGE'))
  assert.equal(cancelled, 1)
})

test('declared oversize and invalid limits cancel unread bodies before buffering', async () => {
  for (const limit of [16, undefined, 0, -1, 1.5]) {
    let cancelled = 0
    const response = new Response(new ReadableStream({ cancel() { cancelled++ } }), { headers: { 'content-length': '17' } })
    await assert.rejects(boundedBytes(response, limit, signal()), code(limit === 16 ? 'IMAGE_TOO_LARGE' : 'IMAGE_CONFIG'))
    assert.equal(cancelled, 1)
  }
})

test('abort closes a pending read even when the source cancellation never resolves', async () => {
  const controller = new AbortController(); let cancelled = 0
  const response = new Response(new ReadableStream({ cancel() { cancelled++; return new Promise(() => {}) } }))
  const reading = boundedBytes(response, 16, controller.signal)
  controller.abort(new Error('offline abort'))
  await assert.rejects(reading, /offline abort/)
  assert.equal(cancelled, 1)
  assert.equal(response.body.locked, false)
})

test('response stream failures sanitize even typed private errors', async () => {
  const response = new Response(new ReadableStream({ start(c) { c.error(new ImageError('offline-secret-sentinel')) } }))
  await assert.rejects(boundedBytes(response, 16, signal()), error => code('IMAGE_PROVIDER_ERROR')(error) && safe(error))
})

test('public address policy rejects private, translated, special-use and documentation addresses', () => {
  for (const address of ['8.8.8.8', '1.1.1.1', '172.15.255.255', '172.32.0.1', '192.169.0.1', '2606:4700:4700::1111', '2001:4860:4860::8888']) assert.equal(isPublicImageAddress(address), true, address)
  for (const address of [undefined, '', 'host.example', '127.1', '0.1.2.3', '10.0.0.1', '100.64.0.1', '100.127.255.255', '127.0.0.1', '169.254.169.254', '172.16.0.1', '172.31.255.255', '192.0.0.1', '192.0.2.1', '192.88.99.1', '192.168.1.1', '198.18.0.1', '198.19.255.255', '198.51.100.1', '203.0.113.1', '224.0.0.1', '239.255.255.255', '240.0.0.1', '255.255.255.255', '::', '::1', '::ffff:127.0.0.1', '::ffff:8.8.8.8', '64:ff9b::a00:1', 'fc00::1', 'fdff::1', 'fe80::1', 'fe80::1%eth0', 'ff02::1', '2001::1', '2001:db8::1', '2002:a00:1::1', '3ffe::1', '3fff::1']) assert.equal(isPublicImageAddress(address), false, String(address))
})

test('invalid result URLs are rejected before DNS or the HTTPS request', async () => {
  const mock = transport()
  for (const url of [undefined, 'not-url', 'http://cdn.z.ai/image', 'file:///image', 'https://evilz.ai/image', 'https://z.ai.evil.example/image', 'https://z.ai./image', 'https://u:p@cdn.z.ai/image', 'https://cdn.z.ai:444/image', 'https://127.0.0.1/image', 'https://2130706433/image', 'https://[::1]/image', 'https://%7A.ai.evil.example/image']) await assert.rejects(downloadZaiImage(url, signal(), 16, mock), code('IMAGE_INVALID_RESULT'))
  assert.equal(mock.requests.length, 0); assert.equal(mock.lookups.length, 0)
})

test('direct download uses socket-pinned public DNS, original TLS host and no bearer/proxy/redirect', async () => {
  let queries = 0
  const mock = transport({ addresses: () => ++queries === 1 ? [{ address: '8.8.8.8', family: 4 }] : [{ address: '127.0.0.1', family: 4 }] })
  assert.deepEqual(await downloadZaiImage('https://CDN.ChatGLM.CN:443/image?signed=offline-secret-sentinel#fragment', signal(), 16, mock), png)
  assert.equal(mock.requests.length, 1); assert.equal(mock.lookups.length, 1)
  assert.deepEqual(mock.lookups[0], { host: 'cdn.chatglm.cn', options: { all: true, verbatim: true } })
  assert.deepEqual(mock.connected, [{ address: '8.8.8.8', family: 4 }])
  const { url, options } = mock.requests[0]
  assert.equal(url.hostname, 'cdn.chatglm.cn'); assert.equal(url.hash, '')
  assert.deepEqual(options.headers, { accept: 'image/*' })
  assert.equal(options.method, 'GET'); assert.equal(options.agent, false)
  assert.equal(options.autoSelectFamily, false); assert.equal(options.rejectUnauthorized, true)
  assert.equal(options.maxHeaderSize, 16384)
})

test('public A/AAAA lookup supports the socket all-address form and explicit family', async () => {
  const addresses = [{ address: '8.8.8.8', family: 4 }, { address: '2606:4700:4700::1111', family: 6 }]
  const mock = transport({ addresses, all: true, family: 6 })
  await downloadZaiImage('https://cdn.bigmodel.cn/image', signal(), 16, mock)
  assert.deepEqual(mock.connected, [[addresses[1]]])
})

test('private/mixed/malformed DNS answers fail closed before a socket address is accepted', async () => {
  for (const addresses of [[], [{ address: '127.0.0.1', family: 4 }], [{ address: '8.8.8.8', family: 4 }, { address: 'fc00::1', family: 6 }], [{ address: '8.8.8.8', family: 6 }], [{ address: 'offline-secret-sentinel', family: 4 }], undefined]) {
    const mock = transport({ addresses: () => addresses })
    await assert.rejects(downloadZaiImage('https://cdn.z.ai/image', signal(), 16, mock), error => code('IMAGE_DOWNLOAD_FAILED')(error) && safe(error))
    assert.equal(mock.requests.length, 1); assert.equal(mock.lookups.length, 1)
    assert.equal(mock.connected.length, 0); assert.equal(mock.responses.length, 0)
    assert.equal(mock.requests[0].req.destroyed, true)
  }
})

test('DNS and TLS/request errors omit signed URLs and private causes', async () => {
  for (const options of [{ lookupError: new Error('offline-secret-sentinel') }, { requestError: new Error('offline-secret-sentinel') }]) {
    const mock = transport(options)
    await assert.rejects(downloadZaiImage('https://cdn.z.ai/image?key=offline-secret-sentinel', signal(), 16, mock), error => code('IMAGE_DOWNLOAD_FAILED')(error) && safe(error))
    assert.equal(mock.requests.length, 1)
  }
})

test('non-2xx and redirects destroy the unread body and never start another download', async () => {
  for (const status of [301, 302, 307, 308, 401, 403, 404, 503]) {
    const mock = transport({ status, data: null })
    await assert.rejects(downloadZaiImage('https://cdn.chatglm.cn/image', signal(), 16, mock), error => code('IMAGE_DOWNLOAD_FAILED')(error) && error.message.includes('do not regenerate'))
    assert.equal(mock.requests.length, 1); assert.equal(mock.responses[0].destroyed, true)
  }
})

test('download body byte caps destroy both response and request', async () => {
  for (const options of [{ data: Buffer.alloc(17) }, { data: png, declared: 17 }]) {
    const mock = transport(options)
    await assert.rejects(downloadZaiImage('https://cdn.z.ai/image', signal(), 16, mock), code('IMAGE_TOO_LARGE'))
    assert.equal(mock.responses[0].destroyed, true); assert.equal(mock.requests[0].req.destroyed, true)
  }
})

test('download cancellation before submission or during DNS does not leak a connection', async () => {
  const controller = new AbortController(), mock = transport()
  controller.abort(new Error('offline abort'))
  await assert.rejects(downloadZaiImage('https://cdn.z.ai/image', controller.signal, 16, mock), /offline abort/)
  assert.equal(mock.requests.length, 0)
  const active = new AbortController(); let release
  const pending = transport({ addresses: () => new Promise(resolve => { release = resolve }) })
  const downloading = downloadZaiImage('https://cdn.z.ai/image', active.signal, 16, pending)
  await new Promise(resolve => queueMicrotask(resolve))
  active.abort(new Error('offline abort'))
  await assert.rejects(downloading, /offline abort/)
  release([{ address: '8.8.8.8', family: 4 }])
  await new Promise(resolve => queueMicrotask(resolve))
  assert.equal(pending.requests[0].req.destroyed, true); assert.equal(pending.connected.length, 0)
})

test('download cancellation during a stalled response body destroys its live streams', async () => {
  const controller = new AbortController(), mock = transport({ data: null })
  const downloading = downloadZaiImage('https://cdn.z.ai/image', controller.signal, 16, mock)
  // Let the fake DNS callback deliver the response; no timers or sockets.
  await mock.responseReady
  assert.equal(mock.responses.length, 1)
  controller.abort(new Error('offline abort'))
  await assert.rejects(downloading, /offline abort/)
  assert.equal(mock.responses[0].destroyed, true); assert.equal(mock.requests[0].req.destroyed, true)
})

test('Codex generation uses one fixed POST and validates returned base64/media bytes', async () => {
  const calls = []
  const result = await generateImageBytes({}, 'openai-codex', codexBody(), signal(), { codexAuth: auth, callId: 'offline-call', maxBytes: 16, fetcher: async (url, init) => {
    calls.push({ url, init })
    return new Response(JSON.stringify({ data: [{ b64_json: png.toString('base64') }] }))
  } })
  assert.deepEqual(result, { data: png, mediaType: 'image/png' })
  assert.equal(calls.length, 1); assert.equal(calls[0].url, IMAGE_ROUTES['openai-codex'].endpoint)
  assert.equal(calls[0].init.method, 'POST'); assert.equal(calls[0].init.redirect, 'error')
  assert.equal(calls[0].init.headers.authorization, 'Bearer offline-access')
  assert.equal(calls[0].init.headers['chatgpt-account-id'], 'offline-account')
  assert.equal(calls[0].init.headers['x-codex-image-turn-id'], 'offline-call')
  assert.equal(JSON.parse(calls[0].init.body).n, 1)
})

test('GLM routes have isolated keys/endpoints and a separate credential-free download seam', async () => {
  const ctx = regionalCtx({ ZAI_API_KEY: 'offline-international', ZAI_CODING_CN_API_KEY: 'offline-domestic' })
  for (const [provider, key] of [['zai', 'offline-international'], ['zai-cn', 'offline-domestic']]) {
    const posts = [], downloads = [], controller = new AbortController()
    const result = await generateImageBytes(ctx, provider, normalizeImageRequest(provider, { prompt: 'offline' }), controller.signal, { maxBytes: 16,
      fetcher: async (url, init) => { posts.push({ url, init }); return new Response(JSON.stringify({ data: [{ url: 'https://cdn.z.ai/offline' }] })) },
      download: async (...args) => { downloads.push(args); return png },
    })
    assert.equal(result.mediaType, 'image/png'); assert.equal(posts.length, 1); assert.equal(downloads.length, 1)
    assert.equal(posts[0].url, IMAGE_ROUTES[provider].endpoint); assert.equal(posts[0].init.headers.authorization, `Bearer ${key}`)
    assert.deepEqual(downloads[0], ['https://cdn.z.ai/offline', controller.signal, 16])
  }
})

test('missing regional credentials do not generate or fall back to another paid route', async () => {
  let posts = 0, downloads = 0
  const ctx = regionalCtx({ ZAI_API_KEY: 'offline-international' })
  await assert.rejects(generateImageBytes(ctx, 'zai-cn', normalizeImageRequest('zai-cn', { prompt: 'offline' }), signal(), {
    fetcher: async () => { posts++; throw new Error('must not generate') }, download: async () => { downloads++; return png },
  }), code('IMAGE_CREDENTIAL_MISSING'))
  assert.equal(posts, 0); assert.equal(downloads, 0)
})

test('non-JSON/empty HTTP failures retain status classification with bounded private bodies', async () => {
  for (const [status, expected] of [[401, 'IMAGE_CREDENTIAL_MISSING'], [403, 'IMAGE_CREDENTIAL_MISSING'], [429, 'IMAGE_QUOTA_UNAVAILABLE'], [503, 'IMAGE_PROVIDER_ERROR']]) {
    for (const body of ['<html>offline-secret-sentinel</html>', '', JSON.stringify({ error: { message: 'offline-secret-sentinel' } })]) {
      let posts = 0
      await assert.rejects(generateImageBytes({}, 'openai-codex', codexBody(), signal(), { codexAuth: auth, fetcher: async () => { posts++; return new Response(body, { status }) } }), error => code(expected)(error) && safe(error))
      assert.equal(posts, 1)
    }
  }
  let cancelled = 0
  const response = new Response(new ReadableStream({ start(c) { c.enqueue(new Uint8Array(65537)) }, cancel() { cancelled++ } }), { status: 401 })
  await assert.rejects(generateImageBytes({}, 'openai-codex', codexBody(), signal(), { codexAuth: auth, fetcher: async () => response }), code('IMAGE_CREDENTIAL_MISSING'))
  assert.equal(cancelled, 1)
})

test('GLM 1113 is explicit standard-API balance failure and is not retried', async () => {
  let posts = 0
  await assert.rejects(generateImageBytes(regionalCtx({ ZAI_API_KEY: 'offline-key' }), 'zai', normalizeImageRequest('zai', { prompt: 'offline' }), signal(), {
    fetcher: async () => { posts++; return new Response(JSON.stringify({ error: { code: 1113, message: 'offline-secret-sentinel' } }), { status: 429 }) },
  }), error => code('IMAGE_QUOTA_UNAVAILABLE')(error) && error.message.includes('Coding Plan') && safe(error))
  assert.equal(posts, 1)
})

test('invalid successful results never replay generation and report possibly consumed quota', async () => {
  for (const raw of ['not-json', '{}', JSON.stringify({ data: [] }), JSON.stringify({ data: [{ b64_json: png.toString('base64') }, { b64_json: png.toString('base64') }] }), JSON.stringify({ data: [{ b64_json: 'Zh==' }] }), JSON.stringify({ data: [{ b64_json: Buffer.from('html').toString('base64') }] })]) {
    let posts = 0
    await assert.rejects(generateImageBytes({}, 'openai-codex', codexBody(), signal(), { codexAuth: auth, fetcher: async () => { posts++; return new Response(raw) } }), error => code('IMAGE_INVALID_RESULT')(error) && error.message.includes('consumed quota') && error.message.includes('do not automatically retry'))
    assert.equal(posts, 1)
  }
})

test('fetch/download transport failures redact secrets and do not regenerate', async () => {
  let posts = 0
  for (const failure of [new Error('offline-secret-sentinel'), new ImageError('offline-secret-sentinel')]) {
    posts = 0
    await assert.rejects(generateImageBytes({}, 'openai-codex', codexBody(), signal(), { codexAuth: auth, fetcher: async () => { posts++; throw failure } }), error => code('IMAGE_PROVIDER_ERROR')(error) && safe(error) && error.message.includes('uncertain'))
    assert.equal(posts, 1)
  }
  const mock = transport({ status: 503 })
  posts = 0
  await assert.rejects(generateImageBytes(regionalCtx({ ZAI_API_KEY: 'offline-key' }), 'zai', normalizeImageRequest('zai', { prompt: 'offline' }), signal(), {
    fetcher: async () => { posts++; return new Response(JSON.stringify({ data: [{ url: 'https://cdn.z.ai/offline' }] })) },
    download: (url, currentSignal, maxBytes) => downloadZaiImage(url, currentSignal, maxBytes, mock),
  }), code('IMAGE_DOWNLOAD_FAILED'))
  assert.equal(posts, 1); assert.equal(mock.requests.length, 1)
})

test('generation cancellation after one POST cancels the pending body and never retries', async () => {
  const controller = new AbortController(); let posts = 0, cancelled = 0, started
  const reading = new Promise(resolve => { started = resolve })
  const result = generateImageBytes({}, 'openai-codex', codexBody(), controller.signal, { codexAuth: auth, fetcher: async () => {
    posts++
    return new Response(new ReadableStream({ pull() { started() }, cancel() { cancelled++ } }))
  } })
  await reading
  controller.abort(new Error('offline abort'))
  await assert.rejects(result, /offline abort/)
  assert.equal(posts, 1); assert.equal(cancelled, 1)
})

test('invalid provider/byte budget and pre-cancellation submit no generation', async () => {
  let posts = 0
  const options = { codexAuth: auth, fetcher: async () => { posts++; throw new Error('must not submit') } }
  for (const maxBytes of [0, -1, 1.5, MAX_IMAGE_BYTES + 1]) await assert.rejects(generateImageBytes({}, 'openai-codex', codexBody(), signal(), { ...options, maxBytes }), code('IMAGE_CONFIG'))
  for (const provider of ['unknown', 'constructor']) await assert.rejects(generateImageBytes({}, provider, {}, signal(), options), code('IMAGE_CONFIG'))
  const controller = new AbortController(); controller.abort(new Error('offline abort'))
  await assert.rejects(generateImageBytes({}, 'openai-codex', codexBody(), controller.signal, options), /offline abort/)
  assert.equal(posts, 0)
})
