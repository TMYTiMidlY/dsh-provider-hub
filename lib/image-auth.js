// Reuse Pi OAuth over DSH's existing credential record. Never owns a login/file.
// The tool boundary projects this dependency-light error into HarnessError.
export class ImageError extends Error {
  constructor(message, code = 'IMAGE_PROVIDER_ERROR') { super(message); this.name = 'ImageError'; this.code = code }
}
const liveCredentials = ctx => typeof ctx.get === 'function' ? ctx.get('credentials') : ctx.credentials
const CODEX_RECORD = 'llm-pi-ai/openai-codex'
const grant = record => record?.kind === 'grant' && record.payload?.type === 'oauth' ? record.payload : undefined

/** Pi refreshes inside modify: DSH supplies the same cross-process lock as chat. */
export function codexCredentialStore(credentials) {
  const check = id => { if (id !== 'openai-codex') throw new ImageError('Unknown image credential provider', 'IMAGE_CONFIG') }
  // Resolve a replacement service per operation, but keep a single selected
  // store for the complete atomic modify/refresh/commit transaction.
  const store = () => {
    const selected = typeof credentials === 'function' ? credentials() : credentials
    if (!selected) throw new ImageError('The DSH credential service is unavailable', 'IMAGE_CONFIG')
    return selected
  }
  return {
    async read(id, options = {}) {
      check(id); options.signal?.throwIfAborted()
      return grant(await store().readRecord(CODEX_RECORD))
    },
    async list() { return grant(await store().readRecord(CODEX_RECORD)) ? [{ providerId: 'openai-codex', type: 'oauth' }] : [] },
    async modify(id, mutate, options = {}) {
      check(id); options.signal?.throwIfAborted()
      const record = await store().modifyRecord(CODEX_RECORD, async current => {
        options.signal?.throwIfAborted()
        const next = await mutate(grant(current))
        // Once OAuth has rotated, commit the new token even if cancellation wins
        // immediately afterwards. Dropping that commit could destroy chat login.
        return next === undefined ? undefined : { kind: 'grant', payload: JSON.parse(JSON.stringify(next)) }
      })
      return grant(record)
    },
    async delete() { throw new ImageError('Image tools cannot remove account authorization', 'IMAGE_CONFIG') },
  }
}

const loadPi = async () => {
  const [api, provider] = await Promise.all([import('@earendil-works/pi-ai'), import('@earendil-works/pi-ai/providers/openai-codex')])
  return { createModels: api.createModels, openaiCodexProvider: provider.openaiCodexProvider }
}

export function accountIdFromAccess(access) {
  try {
    const parts = access.split('.')
    if (parts.length !== 3) throw new Error('JWT')
    const id = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'))?.['https://api.openai.com/auth']?.chatgpt_account_id
    if (typeof id !== 'string' || !id.trim()) throw new Error('account')
    return id
  } catch { throw new ImageError('ChatGPT authorization has no account identity; sign in again in Models', 'IMAGE_CREDENTIAL_MISSING') }
}

/** Lazy: merely enabling image tools neither refreshes credentials nor networks. */
export function createCodexImageAuth(ctx, { load = loadPi } = {}) {
  let models
  return async signal => {
    signal?.throwIfAborted()
    try {
      models ??= load().then(({ createModels, openaiCodexProvider }) => {
        const collection = createModels({ credentials: codexCredentialStore(() => liveCredentials(ctx)), authContext: { env: async () => undefined, fileExists: async () => false } })
        collection.setProvider(openaiCodexProvider())
        return collection
      }).catch(() => { models = undefined; throw new ImageError('Compatible Pi OAuth support is unavailable', 'IMAGE_CONFIG') })
      const auth = await (await models).getAuth('openai-codex', { signal })
      signal?.throwIfAborted()
      const access = auth?.auth.apiKey
      if (typeof access !== 'string' || !access) throw new ImageError('Sign in with ChatGPT in DSH Models before generating images', 'IMAGE_CREDENTIAL_MISSING')
      return { access, accountId: accountIdFromAccess(access) }
    } catch (error) {
      if (signal?.aborted) throw signal.reason
      if (error instanceof ImageError) throw error
      // Pi/store errors may contain tokens. Do not attach their message or cause.
      throw new ImageError('ChatGPT image authorization could not be refreshed; check Models login', 'IMAGE_CREDENTIAL_MISSING')
    }
  }
}

/** Each regional image route reads only its own record/reference; no key fallback. */
export async function resolveZaiImageKey(ctx, provider, signal) {
  signal?.throwIfAborted()
  const id = provider === 'zai-cn' ? 'zai-coding-cn' : provider === 'zai' ? 'zai' : undefined
  if (!id) throw new ImageError('Unknown image credential provider', 'IMAGE_CONFIG')
  let key
  try {
    const credentials = liveCredentials(ctx)
    const record = await credentials.readRecord(`llm-pi-ai/${id}`)
    signal?.throwIfAborted()
    // record.env contains provider environment VALUES, not credential reference
    // pointers. Never scan it or let one regional route select the other key.
    if (record !== undefined && record.kind !== 'api-key') throw new Error('Unsupported credential kind')
    key = typeof record?.key === 'string' ? record.key : undefined
    if (!key) key = (await credentials.resolve(provider === 'zai-cn' ? 'ZAI_CODING_CN_API_KEY' : 'ZAI_API_KEY'))?.value
    signal?.throwIfAborted()
  } catch {
    if (signal?.aborted) throw signal.reason
    // The service's message/cause (including an ImageError) is untrusted.
    throw new ImageError('The selected Z.AI image credential could not be resolved', 'IMAGE_CREDENTIAL_MISSING')
  }
  if (typeof key !== 'string' || !key.trim()) throw new ImageError(`Configure the ${provider === 'zai-cn' ? 'domestic Z.AI' : 'international Z.AI'} API key in Models; standard image API quota is separate`, 'IMAGE_CREDENTIAL_MISSING')
  return key
}
