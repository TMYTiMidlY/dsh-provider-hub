import { randomUUID } from 'node:crypto'
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import z from '@deepseek-ai/schemastery'
import { createSearchProvider, DIRECT_PROVIDERS, PROVIDERS, SEARCH_PROVIDERS } from './providers.js'

export const name = 'dsh-web-search'
export const inject = ['web', 'authorization', 'credentials']

export const Config = z.object({
  searchProviders: z.array(z.union(SEARCH_PROVIDERS.map(id => z.const(id)))).default(['openai-codex']).volatile(),
  enabledProviders: z.array(z.union(PROVIDERS.map(id => z.const(id)))).default(PROVIDERS),
  timeoutMs: z.number().step(1).min(1).max(300000).default(60000).volatile(),
  zreadEndpoint: z.string().volatile(),
})

function safeError() {
  // OAuth implementations can embed token responses in errors, including partial grants.
  // Never return raw flow errors through the browser bridge.
  return 'Account authorization failed; retry and check the authorization page or network connection'
}

function requireText(value, name) {
  if (typeof value !== 'string' || value.trim().length === 0) throw new Error(`${name} must be a non-empty string`)
  return value.trim()
}

/** Host-side bridge for the neutral DSH authorization seam. */
export class SearchLoginService extends TypertRemoteService {
  static inject = ['authorization', 'credentials']

  constructor(ctx) {
    super(ctx, 'searchLogin')
    this.attempts = new Map()
    ctx.effect(() => () => {
      for (const attempt of this.attempts.values()) {
        if (attempt.status !== 'running') continue
        attempt.controller.abort(new Error('plugin disposed'))
        attempt.pending?.reject(new Error('plugin disposed'))
      }
      this.attempts.clear()
    }, 'dsh-web-search: authorization attempts')
  }

  async list() {
    const entries = []
    for (const entry of this.ctx.authorization.list()) {
      const record = await this.ctx.credentials.describeRecord(entry.key)
      let authorized = record.configured === true
      const keyRef = { 'llm-pi-ai/zai': 'ZAI_API_KEY', 'llm-pi-ai/zai-coding-cn': 'ZAI_CODING_CN_API_KEY' }[String(entry.key)]
      if (!authorized && keyRef) authorized = (await this.ctx.credentials.describe?.(keyRef))?.configured === true
      entries.push({
        key: String(entry.key),
        label: entry.label,
        methods: entry.methods.map(method => ({ id: method.id, label: method.label })),
        inFlight: entry.inFlight,
        authorized,
        ...(() => {
          const active = [...this.attempts.values()].find(attempt => attempt.key === entry.key && attempt.status === 'running')
          return active ? { activeAttempt: this.view(active) } : {}
        })(),
      })
    }
    return { entries }
  }

  start(request) {
    const key = requireText(request?.key, 'authorization key')
    const method = request?.method === undefined ? undefined : requireText(request.method, 'authorization method')
    const entry = this.ctx.authorization.describe(key)
    if (entry === undefined) throw new Error(`no authorization flow is registered for ${key}`)
    const active = [...this.attempts.values()].find(attempt => attempt.key === key && attempt.status === 'running')
    if (active) return this.view(active)
    // Keep terminal attempt history bounded without evicting a live attempt.
    for (const [oldId, old] of this.attempts) {
      if (this.attempts.size < 64) break
      if (old.status !== 'running') this.attempts.delete(oldId)
    }
    const id = randomUUID()
    const state = {
      id,
      key,
      status: 'running',
      notice: undefined,
      prompt: undefined,
      error: undefined,
      updatedAt: Date.now(),
      pending: undefined,
      controller: new AbortController(),
    }
    this.attempts.set(id, state)
    const interaction = {
      notify: notice => {
        if (state.status !== 'running' || state.controller.signal.aborted) return
        state.notice = { message: String(notice.message), ...(notice.url ? { url: String(notice.url) } : {}), ...(notice.code ? { code: String(notice.code) } : {}) }
        state.updatedAt = Date.now()
      },
      prompt: prompt => new Promise((resolve, reject) => {
        if (state.status !== 'running' || state.controller.signal.aborted) { reject(new Error('authorization prompt cancelled')); return }
        const signal = prompt.signal ? AbortSignal.any([prompt.signal, state.controller.signal]) : state.controller.signal
        let settled = false
        const finish = (callback, value) => {
          if (settled) return
          settled = true
          signal.removeEventListener('abort', stop)
          if (state.pending === pending) { state.pending = undefined; state.prompt = undefined }
          callback(value)
        }
        const pending = { resolve: value => finish(resolve, value), reject: error => finish(reject, error) }
        const stop = () => pending.reject(new Error('authorization prompt cancelled'))
        state.prompt = { kind: prompt.kind, message: prompt.message, ...(prompt.placeholder ? { placeholder: prompt.placeholder } : {}), ...(prompt.kind === 'select' ? { options: prompt.options } : {}) }
        state.pending = pending
        state.updatedAt = Date.now()
        if (signal.aborted) stop()
        else signal.addEventListener('abort', stop, { once: true })
      }),
    }
    void this.ctx.authorization.begin({ key, method, interaction, signal: state.controller.signal }).then(outcome => {
      state.status = outcome.status
      state.prompt = undefined
      state.pending = undefined
      state.updatedAt = Date.now()
    }).catch(error => {
      state.status = 'failed'
      state.error = safeError(error)
      state.prompt = undefined
      state.pending = undefined
      state.updatedAt = Date.now()
    })
    return this.view(state)
  }

  status(id) {
    return this.view(this.attempts.get(requireText(id, 'attempt id')))
  }

  answer(id, value) {
    const state = this.attempts.get(requireText(id, 'attempt id'))
    if (!state) throw new Error('authorization attempt not found')
    if (!state.pending) throw new Error('authorization attempt is not waiting for an answer')
    if (typeof value !== 'string') throw new Error('authorization answer must be text')
    if (state.prompt?.kind === 'select' && !state.prompt.options.some(option => option.id === value)) throw new Error('authorization selection is invalid')
    const answer = value
    const pending = state.pending
    state.pending = undefined
    state.prompt = undefined
    state.updatedAt = Date.now()
    pending.resolve(answer)
    return this.view(state)
  }

  cancel(id) {
    const state = this.attempts.get(requireText(id, 'attempt id'))
    if (!state) return { status: 'missing' }
    if (state.status !== 'running') return this.view(state)
    state.controller.abort(new Error('authorization cancelled'))
    state.pending?.reject(new Error('authorization cancelled'))
    state.pending = undefined
    state.prompt = undefined
    // The authorization seam owns terminal status: an admitted commit may win.
    state.updatedAt = Date.now()
    return this.view(state)
  }

  view(state) {
    if (!state) return { id: '', status: 'missing' }
    return {
      id: state.id,
      key: state.key,
      status: state.status,
      ...(state.notice ? { notice: state.notice } : {}),
      ...(state.prompt ? { prompt: state.prompt } : {}),
      ...(state.error ? { error: state.error } : {}),
      updatedAt: state.updatedAt,
    }
  }
}

const current = value => value && typeof value.get === 'function' ? value.get() : value

/** Register backends at the shared Host seam; retain every preset and native tool schema. */
export function apply(ctx, config = {}) {
  const readConfig = () => ({
    searchProviders: current(config.searchProviders),
    enabledProviders: current(config.enabledProviders),
    timeoutMs: current(config.timeoutMs),
    zreadEndpoint: current(config.zreadEndpoint),
  })
  ctx.plugin(SearchLoginService)
  ctx.web.registerSearchProvider(createSearchProvider(ctx, readConfig))
  for (const id of DIRECT_PROVIDERS) ctx.web.registerSearchProvider(createSearchProvider(ctx, readConfig, {}, id))
}

export default { name, inject, Config, apply }
