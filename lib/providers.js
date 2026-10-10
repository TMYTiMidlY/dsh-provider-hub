import { WebError } from '@deepseek-ai/dsh-web'
import { SearchError, codexSearch, googleZreadSearch, normalizeQuery, zaiSearch } from './search.js'

export const ROUTER_PROVIDER_ID = 'dsh-provider-hub'
export const PROVIDERS = ['deepseek-official', 'openai-codex', 'zai', 'google-zread']
export const SEARCH_PROVIDERS = ['openai-codex', 'zai']
export const DIRECT_PROVIDERS = PROVIDERS.filter(id => id !== 'deepseek-official')
const labels = { 'deepseek-official': '官方', 'openai-codex': 'OpenAI', zai: 'ZAI', 'google-zread': 'Google' }
const publicErrors = {
  WEB_PROVIDER_CONFIG: 'Search provider configuration is invalid',
  WEB_PROVIDER_CONFIGURED_MISSING: 'Search provider is not registered',
  WEB_PROVIDER_CONFIGURED_UNAVAILABLE: 'Search provider is unavailable',
  WEB_PROVIDER_CREDENTIAL_MISSING: 'Search credentials are missing, expired, or rejected; configure the provider in DSH',
  WEB_PROVIDER_ERROR: 'Search provider failed',
  WEB_PROVIDER_ALL_FAILED: 'All search providers failed',
  WEB_PROVIDER_TIMEOUT: 'Web search timed out',
  WEB_ABORTED: 'Web search aborted',
}

function snapshot(raw = {}) {
  const selected = raw.searchProviders === undefined ? ['openai-codex'] : raw.searchProviders
  if (!Array.isArray(selected) || selected.some(id => !SEARCH_PROVIDERS.includes(id))) throw new WebError('Search enhancements must contain only openai-codex and zai', 'WEB_PROVIDER_CONFIG')
  const config = {
    searchProviders: SEARCH_PROVIDERS.filter(id => selected.includes(id)),
    enabledProviders: Array.isArray(raw.enabledProviders) ? [...raw.enabledProviders] : [...PROVIDERS],
    timeoutMs: raw.timeoutMs ?? 60000,
    zreadEndpoint: raw.zreadEndpoint || undefined,
  }
  if (!Number.isInteger(config.timeoutMs) || config.timeoutMs < 1 || config.timeoutMs > 300000) throw new WebError('Search timeout must be an integer between 1 and 300000 ms', 'WEB_PROVIDER_CONFIG')
  return config
}

function selectedProvider(id, config) {
  if (!PROVIDERS.includes(id)) throw new WebError('Unknown search provider', 'WEB_PROVIDER_CONFIG')
  if (!config.enabledProviders.includes(id)) throw new WebError(`Search provider ${labels[id]} is disabled`, 'WEB_PROVIDER_CONFIGURED_UNAVAILABLE')
  return id
}

function mappedError(error, signal, timeoutSignal, trustedOfficial = false) {
  if (signal.aborted) {
    // AbortSignal.any retains the first reason, including when another input aborts later.
    const timedOut = timeoutSignal.aborted && signal.reason === timeoutSignal.reason
    return new WebError(timedOut ? publicErrors.WEB_PROVIDER_TIMEOUT : publicErrors.WEB_ABORTED, timedOut ? 'WEB_PROVIDER_TIMEOUT' : 'WEB_ABORTED', { cause: signal.reason })
  }
  let code = 'WEB_PROVIDER_ERROR'
  try {
    const rawCode = error?.code
    const typed = error instanceof WebError || trustedOfficial && error instanceof Error && error.name === 'WebError'
    if (typed && typeof rawCode === 'string' && Object.hasOwn(publicErrors, rawCode)) code = rawCode
    else if (error instanceof SearchError && rawCode === 'CREDENTIAL_MISSING') code = 'WEB_PROVIDER_CREDENTIAL_MISSING'
    else if (error instanceof SearchError && rawCode === 'PROVIDER_CONFIG') code = 'WEB_PROVIDER_CONFIG'
  } catch { /* Treat hostile accessors and prototypes as unknown local failures. */ }
  // Neither raw messages, raw causes nor unknown/key-shaped error codes enter tool history.
  return new WebError(publicErrors[code], code)
}

function shortText(value, limit) {
  return value.replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/gu, ' ').replace(/\s+/gu, ' ').trim().slice(0, limit)
}

function normalizedResult(value) {
  const invalid = () => { throw new WebError('Invalid search results', 'WEB_PROVIDER_ERROR') }
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid()
  const rawSources = value.sources, content = value.content, truncated = value.truncated
  if (!Array.isArray(rawSources)) invalid()
  if (content !== undefined && typeof content !== 'string') invalid()
  if (truncated !== undefined && typeof truncated !== 'boolean') invalid()
  const sources = Array.from(rawSources, source => {
    if (!source || typeof source !== 'object' || Array.isArray(source)) invalid()
    const rawUrl = source.url
    if (typeof rawUrl !== 'string') invalid()
    let url
    try { url = new URL(rawUrl) } catch { invalid() }
    if (!['http:', 'https:'].includes(url.protocol)) invalid()
    const result = { url: rawUrl }
    for (const [field, limit] of [['title', 240], ['snippet', 300], ['publishedAt', 100]]) {
      const rawText = source[field]
      if (rawText === undefined) continue
      if (typeof rawText !== 'string') invalid()
      const text = shortText(rawText, limit)
      if (text) result[field] = text
    }
    return result
  })
  // Backend prose is deliberately not projected. Native WebBlock would otherwise
  // render the entire Codex raw response as meta.answer ahead of the citation list.
  return { sources, truncated: Boolean(truncated) }
}

function abortable(operation, signal) {
  if (signal.aborted) {
    operation.then(() => {}, () => {})
    return Promise.reject(signal.reason)
  }
  return new Promise((resolve, reject) => {
    const stop = () => { signal.removeEventListener('abort', stop); reject(signal.reason) }
    signal.addEventListener('abort', stop, { once: true })
    operation.then(value => { signal.removeEventListener('abort', stop); resolve(value) }, error => { signal.removeEventListener('abort', stop); reject(error) })
  })
}

function urlKey(value) {
  const url = new URL(value)
  url.hash = ''
  if (url.pathname !== '/') url.pathname = url.pathname.replace(/\/+$/, '')
  return url.href
}

function mergeResults(outcomes, maxResults) {
  const successes = outcomes.filter(outcome => !outcome.error)
  const entries = new Map()
  const lists = successes.map(({ id, result }) => {
    const keys = []
    const local = new Set()
    for (const source of result.sources) {
      const key = urlKey(source.url)
      if (!local.has(key)) { local.add(key); keys.push(key) }
      const existing = entries.get(key)
      if (existing) {
        existing.providers.add(id)
        for (const field of ['title', 'snippet', 'publishedAt']) if (!existing.source[field] && source[field]) existing.source[field] = source[field]
      } else entries.set(key, { source: { ...source }, providers: new Set([id]) })
    }
    return { id, keys, cursor: 0 }
  })
  // Scan all lists before selecting so even a late duplicate can add its true
  // provenance to an early, capped-in URL. Never infer origins from backend text.
  const selected = []
  const seen = new Set()
  while (selected.length < maxResults && lists.some(list => list.cursor < list.keys.length)) {
    for (const list of lists) {
      while (list.cursor < list.keys.length) {
        const key = list.keys[list.cursor++]
        if (seen.has(key)) continue
        seen.add(key); selected.push(entries.get(key)); break
      }
      if (selected.length === maxResults) break
    }
  }
  const sources = selected.map(({ source, providers }) => {
    const origins = PROVIDERS.filter(id => providers.has(id)).map(id => labels[id]).join(' + ')
    const title = source.title || new URL(source.url).hostname
    return { ...source, title: `[${origins}] ${title}` }
  })
  const counts = new Map(lists.map(list => [list.id, list.keys.length]))
  const statuses = outcomes.map(({ id, error }) => error ? `${labels[id]}未成功（${error.code}）` : `${labels[id]} ${counts.get(id)} 条`)
  return {
    content: `搜索来源：${statuses.join('；')}。合并去重后展示 ${sources.length} 条。`,
    sources,
    truncated: entries.size > sources.length || successes.some(({ result }) => result.truncated),
  }
}

/** Shared Host augmentation; the official tool, renderer and durable result schema stay native. */
export function createSearchProvider(ctx, readConfig, adapters = {}, fixedProviderId) {
  const backends = { codexSearch, zaiSearch, googleZreadSearch, ...adapters }
  return {
    id: fixedProviderId ?? ROUTER_PROVIDER_ID,
    available: () => true,
    async search(request, callerSignal) {
      if (callerSignal?.aborted) throw new WebError(publicErrors.WEB_ABORTED, 'WEB_ABORTED', { cause: callerSignal.reason })
      const config = snapshot(readConfig())
      // User switches add searches; they never remove the official baseline.
      // A fixed native deployment override is an explicit separate operational route.
      const ids = (fixedProviderId ? [fixedProviderId] : ['deepseek-official', ...config.searchProviders]).map(id => selectedProvider(id, config))
      const query = normalizeQuery(request.query)
      const maxResults = request.maxResults ?? 8
      if (!Number.isInteger(maxResults) || maxResults < 0) throw new WebError('Search result limit must be a non-negative integer', 'WEB_PROVIDER_CONFIG')
      const timeout = AbortSignal.timeout(config.timeoutMs)
      const signal = callerSignal ? AbortSignal.any([callerSignal, timeout]) : timeout
      const dispatch = id => {
        if (signal.aborted) throw signal.reason
        const options = { maxResults }
        if (id === 'deepseek-official') {
          // Read-only guarded alpha seam; never mutate the registry or recurse.
          const registry = ctx.web.searchProviders
          if (!registry || typeof registry.get !== 'function') throw new WebError(publicErrors.WEB_PROVIDER_CONFIG, 'WEB_PROVIDER_CONFIG')
          const provider = registry.get('deepseek-official')
          if (!provider || typeof provider.search !== 'function') throw new WebError(publicErrors.WEB_PROVIDER_CONFIGURED_MISSING, 'WEB_PROVIDER_CONFIGURED_MISSING')
          if (typeof provider.available !== 'function' || !provider.available()) throw new WebError(publicErrors.WEB_PROVIDER_CONFIGURED_UNAVAILABLE, 'WEB_PROVIDER_CONFIGURED_UNAVAILABLE')
          return provider.search({ query, maxResults }, signal)
        }
        if (id === 'openai-codex') return backends.codexSearch(ctx, query, options, signal)
        if (id === 'zai') return backends.zaiSearch(ctx, query, options, signal)
        return backends.googleZreadSearch(ctx, query, { ...options, endpoint: config.zreadEndpoint }, signal)
      }
      try {
        const outcomes = await Promise.all(ids.map(async id => {
          try {
            const result = normalizedResult(await abortable(Promise.resolve().then(() => dispatch(id)), signal))
            return { id, result }
          } catch (error) { return { id, error: mappedError(error, signal, timeout, id === 'deepseek-official') } }
        }))
        if (signal.aborted) throw signal.reason
        if (outcomes.every(outcome => outcome.error)) {
          if (outcomes.length === 1) throw outcomes[0].error
          throw new WebError(`All search providers failed: ${outcomes.map(({ id, error }) => `${labels[id]} (${error.code})`).join(', ')}`, 'WEB_PROVIDER_ALL_FAILED')
        }
        return mergeResults(outcomes, maxResults)
      } catch (error) { throw mappedError(error, signal, timeout) }
    },
  }
}
