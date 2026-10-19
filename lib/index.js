import { randomUUID } from 'node:crypto'
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import z from '@deepseek-ai/schemastery'
import * as toolWeb from '@deepseek-ai/dsh-tool-web'
import { QuotaService } from './quota.js'
import { KeyPool, KeyPoolService, keyPoolPath } from './key-pool.js'
import { CodexAccounts, CodexAccountsService } from './codex-accounts.js'
import { createSearchProvider, DIRECT_PROVIDERS, PROVIDERS, SEARCH_PROVIDERS } from './providers.js'
import * as imageTools from './images.js'
import { IMAGE_PROVIDERS } from './image-providers.js'

export const name = 'dsh-provider-hub'
export const inject = ['web', 'authorization', 'credentials']

export const Config = z.object({
  searchProviders: z.array(z.union(SEARCH_PROVIDERS.map(id => z.const(id)))).default(['openai-codex']).volatile(),
  enabledProviders: z.array(z.union(PROVIDERS.map(id => z.const(id)))).default(PROVIDERS),
  timeoutMs: z.number().step(1).min(1).max(300000).default(60000).volatile(),
  searchMaxResults: z.number().step(1).min(1).max(1000).default(200).volatile(),
  zreadEndpoint: z.string().volatile(),
  quotaRecord: z.boolean().default(true).volatile(),
  quotaIntervalMinutes: z.number().step(1).min(15).max(1440).default(60).volatile(),
  quotaHistoryDays: z.number().step(1).min(7).max(3650).default(180).volatile(),
  zaiTeamOrganization: z.string().volatile(),
  zaiTeamProject: z.string().volatile(),
  imageProviders: z.array(z.union(IMAGE_PROVIDERS.map(id => z.const(id)))).default(['openai-codex']).volatile(),
  imageTimeoutMs: z.number().step(1).min(1).max(600000).default(300000).volatile(),
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
    }, 'dsh-provider-hub: authorization attempts')
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

const TOOL_WEB_ENTRY_NAME = '@deepseek-ai/dsh-tool-web'

/** A fiber is the native tool-web composition when its plugin runtime or loader entry says so. */
function isToolWebFiber(fiber) {
  const runtime = fiber?.runtime
  if (runtime?.callback === toolWeb.apply || runtime?.Config === toolWeb.Config) return true
  return fiber?.entry?.options?.name === TOOL_WEB_ENTRY_NAME
}

/**
 * Uniform `searchMaxResults` override across every agent preset: intercept the
 * loader's official `internal/config` waterfall (the same hook the loader uses
 * for `!!js` interpolation) and inject the configured limit into each activated
 * tool-web instance. Only newly activated agents observe changes; running ones
 * keep their resolved config. Returns the hook disposer.
 */
export function installToolWebConfigHook(ctx, readConfig) {
  return ctx.on('internal/config', function (_raw, next) {
    const config = next()
    if (!isToolWebFiber(this)) return config
    const limit = readConfig().searchMaxResults
    if (!Number.isInteger(limit) || limit < 1) return config
    return { ...config, searchMaxResults: limit }
  }, { global: true })
}

/** Register backends at the shared Host seam; retain every preset and native tool schema. */
export function apply(ctx, config = {}) {
  const readConfig = () => ({
    searchProviders: current(config.searchProviders),
    enabledProviders: current(config.enabledProviders),
    timeoutMs: current(config.timeoutMs),
    searchMaxResults: current(config.searchMaxResults),
    zreadEndpoint: current(config.zreadEndpoint),
    quotaRecord: current(config.quotaRecord),
    quotaIntervalMinutes: current(config.quotaIntervalMinutes),
    quotaHistoryDays: current(config.quotaHistoryDays),
    zaiTeamOrganization: current(config.zaiTeamOrganization),
    zaiTeamProject: current(config.zaiTeamProject),
  })
  installToolWebConfigHook(ctx, readConfig)
  ctx.plugin(SearchLoginService)
  // One pool instance serves both the browser card and the quota recorder, so
  // switching a key changes what every consumer resolves.
  const keyPool = new KeyPool(keyPoolPath(), { credentials: ctx.credentials })
  ctx.plugin(KeyPoolService, { pool: keyPool })
  // The Codex account pool shares one instance with the quota service too, so
  // per-account quota previews read the same grant records the switcher writes.
  const codexAccounts = new CodexAccounts({ credentials: ctx.credentials })
  ctx.plugin(CodexAccountsService, { accounts: codexAccounts })
  ctx.plugin(QuotaService, {
    keyPool,
    codexAccounts,
    readConfig: () => ({
      quotaRecord: readConfig().quotaRecord,
      quotaIntervalMinutes: readConfig().quotaIntervalMinutes,
      quotaHistoryDays: readConfig().quotaHistoryDays,
      zaiTeamOrganization: readConfig().zaiTeamOrganization,
      zaiTeamProject: readConfig().zaiTeamProject,
    }),
  })
  ctx.web.registerSearchProvider(createSearchProvider(ctx, readConfig))
  for (const id of DIRECT_PROVIDERS) ctx.web.registerSearchProvider(createSearchProvider(ctx, readConfig, {}, id))
  // Image tools share this entry: the per-package settings card renders one
  // keyed form, so a separate loader entry would have no reachable page.
  // Passing the (possibly live-boxed) values keeps volatile updates flowing.
  ctx.plugin(imageTools, {
    imageProviders: config.imageProviders,
    imageTimeoutMs: config.imageTimeoutMs,
  })
}

export default { name, inject, Config, apply }
