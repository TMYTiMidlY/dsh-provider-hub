import { WebError } from '@deepseek-ai/dsh-web'
import { SearchError, codexSearch, googleZreadSearch, normalizeQuery, zaiSearch } from './search.js'

export const ROUTER_PROVIDER_ID = 'dsh-provider-hub'
export const PROVIDERS = ['deepseek-official', 'openai-codex', 'zai', 'google-zread']
export const SEARCH_PROVIDERS = ['openai-codex', 'zai']
export const DIRECT_PROVIDERS = PROVIDERS.filter(id => id !== 'deepseek-official')
const labels = { 'openai-codex': 'OpenAI / Codex', zai: 'Z.AI' }

function snapshot(raw = {}) {
  const selected = raw.searchProviders === undefined ? ['openai-codex'] : raw.searchProviders
  if (!Array.isArray(selected) || selected.some(id => !SEARCH_PROVIDERS.includes(id))) throw new WebError('Search providers must be an array containing only openai-codex and zai', 'WEB_PROVIDER_CONFIG')
  const config = {
    searchProviders: [...new Set(selected)],
    enabledProviders: Array.isArray(raw.enabledProviders) ? [...raw.enabledProviders] : [...PROVIDERS],
    timeoutMs: raw.timeoutMs ?? 60000,
    zreadEndpoint: raw.zreadEndpoint || undefined,
  }
  if (!Number.isInteger(config.timeoutMs) || config.timeoutMs < 1 || config.timeoutMs > 300000) throw new WebError('Search timeout must be an integer between 1 and 300000 ms', 'WEB_PROVIDER_CONFIG')
  return config
}

function selectedProvider(id, config) {
  if (!PROVIDERS.includes(id)) throw new WebError(`Unknown search provider "${id}"`, 'WEB_PROVIDER_CONFIG')
  if (!config.enabledProviders.includes(id)) throw new WebError(`Search provider "${id}" is disabled`, 'WEB_PROVIDER_CONFIGURED_UNAVAILABLE')
  return id
}

function mappedError(error, signal, timeoutSignal, trustedOfficial = false) {
  // AbortSignal.any keeps the first reason even if a later abort hits another input.
  if (signal.aborted) {
    const timedOut = timeoutSignal.aborted && signal.reason === timeoutSignal.reason
    return new WebError(timedOut ? 'Web search timed out' : 'Web search aborted', timedOut ? 'WEB_PROVIDER_TIMEOUT' : 'WEB_ABORTED', { cause: signal.reason })
  }
  // The official provider belongs to the Host and can use another peer-package copy.
  // Preserve only typed errors from that trusted route, not arbitrary backend payloads.
  if (error instanceof WebError || trustedOfficial && error instanceof Error && error.name === 'WebError' && typeof error.code === 'string' && /^[A-Z][A-Z0-9_]{0,63}$/.test(error.code)) return error
  const code = error instanceof SearchError && error.code === 'CREDENTIAL_MISSING' ? 'WEB_PROVIDER_CREDENTIAL_MISSING'
    : error instanceof SearchError && error.code === 'PROVIDER_CONFIG' ? 'WEB_PROVIDER_CONFIG'
    : 'WEB_PROVIDER_ERROR'
  const message = code === 'WEB_PROVIDER_CREDENTIAL_MISSING' ? 'Search credentials are missing, expired, or rejected; configure the provider in DSH Models'
    : code === 'WEB_PROVIDER_CONFIG' ? 'Search provider configuration is invalid'
    : 'Search provider failed'
  // Network/MCP messages can echo credentials. Keep only the stable public code.
  return new WebError(message, code)
}

function normalizedResult(value) {
  const invalid = () => { throw new WebError('Search provider returned invalid results', 'WEB_PROVIDER_ERROR') }
  if (!value || typeof value !== 'object' || Array.isArray(value) || !Array.isArray(value.sources)) invalid()
  if (value.content !== undefined && typeof value.content !== 'string') invalid()
  if (value.truncated !== undefined && typeof value.truncated !== 'boolean') invalid()
  const sources = value.sources.map(source => {
    if (!source || typeof source !== 'object' || Array.isArray(source)) invalid()
    if (typeof source.url !== 'string') invalid()
    let url
    try { url = new URL(source.url) } catch { invalid() }
    if (!['http:', 'https:'].includes(url.protocol)) invalid()
    const result = { url: source.url }
    for (const field of ['title', 'snippet', 'publishedAt']) {
      if (source[field] === undefined) continue
      if (typeof source[field] !== 'string') invalid()
      result[field] = source[field]
    }
    return result
  })
  return { ...(value.content ? { content: value.content } : {}), sources, truncated: Boolean(value.truncated) }
}

// Observe even an uncooperative provider after cancellation; never leak an unhandled rejection.
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
  try {
    const url = new URL(value)
    url.hash = ''
    if (url.pathname !== '/') url.pathname = url.pathname.replace(/\/+$/, '')
    return url.href
  } catch { return value }
}

function mergeResults(successes, failures, maxResults) {
  const lists = successes.map(({ result }) => ({ sources: result.sources ?? [], cursor: 0 }))
  const sources = []
  const seen = new Set()
  // Take one new URL from each backend per round, not all results from the first backend.
  while (lists.some(list => list.cursor < list.sources.length)) {
    for (const list of lists) {
      while (list.cursor < list.sources.length) {
        const source = list.sources[list.cursor++]
        if (!source || typeof source.url !== 'string') continue
        const key = urlKey(source.url)
        if (seen.has(key)) continue
        seen.add(key)
        sources.push(source)
        break
      }
    }
  }
  const content = successes.map(({ id, result }) => result.content ? successes.length === 1 && failures.length === 0 ? result.content : `[${labels[id] ?? id}]\n${result.content}` : '').filter(Boolean)
  // Do not copy backend error messages into a successful result: they can contain secrets.
  for (const { id, error } of failures) content.push(`Search provider ${labels[id] ?? id} failed (${error.code}); results include only the successful provider. 搜索提供方失败，已保留成功提供方的结果。`)
  return { ...(content.length ? { content: content.join('\n\n') } : {}), sources: sources.slice(0, maxResults), truncated: sources.length > maxResults || successes.some(({ result }) => result.truncated) }
}

/** A native Host provider shared by every official web_search consumer; never replaces a tool. */
export function createSearchProvider(ctx, readConfig, adapters = {}, fixedProviderId) {
  const backends = { codexSearch, zaiSearch, googleZreadSearch, ...adapters }
  return {
    id: fixedProviderId ?? ROUTER_PROVIDER_ID,
    // Credentials resolve asynchronously at execution. Missing credentials fail explicitly there.
    available: () => true,
    async search(request, callerSignal) {
      if (callerSignal?.aborted) throw new WebError('Web search aborted', 'WEB_ABORTED', { cause: callerSignal.reason })
      const config = snapshot(readConfig())
      const ids = (fixedProviderId ? [fixedProviderId] : config.searchProviders.length ? config.searchProviders : ['deepseek-official']).map(id => selectedProvider(id, config))
      const query = normalizeQuery(request.query)
      const maxResults = request.maxResults ?? 8
      if (!Number.isInteger(maxResults) || maxResults < 0) throw new WebError('Search result limit must be a non-negative integer', 'WEB_PROVIDER_CONFIG')
      const timeout = AbortSignal.timeout(config.timeoutMs)
      const signal = callerSignal ? AbortSignal.any([callerSignal, timeout]) : timeout
      const dispatch = id => {
        if (signal.aborted) throw signal.reason
        const options = { maxResults }
        if (id === 'deepseek-official') {
          // Guard the read-only alpha compatibility boundary; never mutate or recurse.
          const registry = ctx.web.searchProviders
          if (!registry || typeof registry.get !== 'function') throw new WebError('Unsupported DSH web provider registry; use the tested DSH 0.2.1-alpha.1 contract', 'WEB_PROVIDER_CONFIG')
          const provider = registry.get('deepseek-official')
          if (!provider || typeof provider.search !== 'function') throw new WebError('Official DeepSeek search provider is not registered', 'WEB_PROVIDER_CONFIGURED_MISSING')
          if (typeof provider.available !== 'function' || !provider.available()) throw new WebError('Official DeepSeek search provider is unavailable', 'WEB_PROVIDER_CONFIGURED_UNAVAILABLE')
          return provider.search({ query, maxResults }, signal)
        }
        if (id === 'openai-codex') return backends.codexSearch(ctx, query, options, signal)
        if (id === 'zai') return backends.zaiSearch(ctx, query, options, signal)
        return backends.googleZreadSearch(ctx, query, { ...options, endpoint: config.zreadEndpoint }, signal)
      }
      try {
        // Catch synchronous throws and observe every promise. A backend failure does not
        // cancel its sibling, but shared cancellation/timeout terminates the whole search.
        const outcomes = await Promise.all(ids.map(async id => {
          try {
            const result = normalizedResult(await abortable(Promise.resolve().then(() => dispatch(id)), signal))
            return { id, result }
          } catch (error) { return { id, error: mappedError(error, signal, timeout, id === 'deepseek-official') } }
        }))
        if (signal.aborted) throw signal.reason
        const successes = outcomes.filter(outcome => !outcome.error)
        const failures = outcomes.filter(outcome => outcome.error)
        if (!successes.length) {
          if (failures.length === 1) throw failures[0].error
          throw new WebError(`All selected search providers failed: ${failures.map(({ id, error }) => `${labels[id] ?? id} (${error.code})`).join(', ')}`, 'WEB_PROVIDER_ALL_FAILED')
        }
        return mergeResults(successes, failures, maxResults)
      } catch (error) { throw mappedError(error, signal, timeout, ids.length === 1 && ids[0] === 'deepseek-official') }
    },
  }
}
