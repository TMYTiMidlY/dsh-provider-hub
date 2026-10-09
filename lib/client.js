/* Declared DSH client module: loaded and disposed by the browser plugin roster. */
(function installDshWebSearch(window) {
  const record = value => value !== null && typeof value === 'object' && !Array.isArray(value)
  const stringCodec = name => ({ mode: 'strict', typeSymbol: `dsh-web-search#${name}`, create: () => ({ parse: value => { if (typeof value !== 'string') throw new Error('Expected text'); return value } }) })
  const objectCodec = name => ({ mode: 'strict', typeSymbol: `dsh-web-search#${name}`, create: () => ({ parse: value => { if (!record(value) || typeof value.key !== 'string' || (value.method !== undefined && typeof value.method !== 'string')) throw new Error('Invalid authorization request'); return value } }) })
  const resultCodec = name => ({ mode: 'strict', typeSymbol: `dsh-web-search#${name}:result`, create: () => ({ parse: value => { if (!record(value)) throw new Error('Invalid authorization response'); return value } }) })
  const remote = {
    package: 'dsh-web-search',
    descriptors: [
      { id: 'dsh-web-search#searchLogin/list', service: 'searchLogin', namespace: 'searchLogin', method: 'list', invocation: { kind: 'direct' }, parameters: [], result: resultCodec('list') },
      { id: 'dsh-web-search#searchLogin/start', service: 'searchLogin', namespace: 'searchLogin', method: 'start', invocation: { kind: 'direct' }, parameters: [{ name: 'request', wire: 'request', source: 'json', codec: objectCodec('start-request') }], result: resultCodec('start') },
      { id: 'dsh-web-search#searchLogin/status', service: 'searchLogin', namespace: 'searchLogin', method: 'status', invocation: { kind: 'direct' }, parameters: [{ name: 'attemptId', wire: 'attemptId', source: 'json', codec: stringCodec('attemptId') }], result: resultCodec('status') },
      { id: 'dsh-web-search#searchLogin/answer', service: 'searchLogin', namespace: 'searchLogin', method: 'answer', invocation: { kind: 'direct' }, parameters: [{ name: 'attemptId', wire: 'attemptId', source: 'json', codec: stringCodec('attemptId') }, { name: 'value', wire: 'value', source: 'json', codec: stringCodec('value') }], result: resultCodec('answer') },
      { id: 'dsh-web-search#searchLogin/cancel', service: 'searchLogin', namespace: 'searchLogin', method: 'cancel', invocation: { kind: 'direct' }, parameters: [{ name: 'attemptId', wire: 'attemptId', source: 'json', codec: stringCodec('attemptId') }], result: resultCodec('cancel') },
    ],
  }
  const loader = window.__ModuleLoader__
  if (!loader || typeof loader.load !== 'function') return
  loader.load({
    id: 'dsh-web-search',
    factory: require => {
      const React = require('react')
      const e = React.createElement
      // API-key providers already have native DSH editors; only add the missing OAuth UI.
      const allowed = new Set(['openai-codex'])
      const labels = { 'openai-codex': 'ChatGPT / Codex' }
      const terminal = status => ['authorized', 'cancelled', 'failed', 'missing'].includes(status)
      const unwrap = result => { if (!result?.ok) throw new Error(result?.error?.message || 'Login connection failed'); return result.value }
      function LoginCard({ provider, remote: login }) {
        const providerId = provider?.provider
        if (!allowed.has(providerId)) return null
        const key = `llm-pi-ai/${providerId}`
        const [entry, setEntry] = React.useState()
        const [attempt, setAttempt] = React.useState()
        const [busy, setBusy] = React.useState(false)
        const [cancelling, setCancelling] = React.useState(false)
        const [error, setError] = React.useState()
        const mounted = React.useRef(true)
        const generation = React.useRef(0)
        const attemptId = React.useRef()
        React.useEffect(() => { mounted.current = true; return () => { mounted.current = false; generation.current++ } }, [])
        const applyView = React.useCallback(view => {
          if (!mounted.current || (attemptId.current && view.id && attemptId.current !== view.id)) return
          attemptId.current = view.id || undefined
          setAttempt(view)
          setBusy(!terminal(view.status))
          if (terminal(view.status)) setCancelling(false)
        }, [])
        const refresh = React.useCallback(async () => {
          try {
            const result = unwrap(await login.list())
            if (!mounted.current) return
            const found = result.entries.find(item => item.key === key)
            setEntry(found)
            // Navigation/remount resumes the exact bridge-owned attempt, never a key-global one.
            if (found?.activeAttempt && (!attemptId.current || attemptId.current === found.activeAttempt.id)) applyView(found.activeAttempt)
          } catch (error) { if (mounted.current) setError(error?.message || 'Unable to read login state') }
        }, [login, key, applyView])
        React.useEffect(() => { void refresh() }, [refresh])
        React.useEffect(() => {
          if (!attempt?.id || terminal(attempt.status)) return undefined
          let active = true
          let timer
          const id = attempt.id
          const revision = generation.current
          const poll = async () => {
            if (!active) return
            try {
              const view = unwrap(await login.status(id))
              if (!active || !mounted.current || generation.current !== revision || attemptId.current !== id) return
              applyView(view)
              if (terminal(view.status)) { await refresh(); return }
              timer = setTimeout(poll, 700)
            } catch (error) {
              if (!active || !mounted.current || generation.current !== revision) return
              setError(error?.message || 'Unable to read login status')
              timer = setTimeout(poll, 1400)
            }
          }
          timer = setTimeout(poll, 700)
          return () => { active = false; clearTimeout(timer) }
        }, [attempt?.id, attempt?.status, login, refresh, applyView])
        const start = async () => {
          const revision = ++generation.current
          attemptId.current = undefined
          setAttempt(undefined); setBusy(true); setCancelling(false); setError(undefined)
          try {
            const view = unwrap(await login.start({ key }))
            if (!mounted.current || generation.current !== revision) return
            applyView(view)
            if (terminal(view.status)) await refresh()
          } catch (error) {
            if (mounted.current && generation.current === revision) { setBusy(false); setError(error?.message || 'Login failed') }
          }
        }
        const answer = async event => {
          event.preventDefault()
          const id = attemptId.current
          if (!id) return
          const value = event.currentTarget.elements.answer.value
          try {
            const view = unwrap(await login.answer(id, value))
            if (attemptId.current === id) applyView(view)
          } catch (error) { if (mounted.current) setError(error?.message || 'Unable to send answer') }
        }
        const cancel = async () => {
          const id = attemptId.current
          if (!id) return
          setCancelling(true); setError(undefined)
          try {
            const view = unwrap(await login.cancel(id))
            if (attemptId.current === id) applyView(view)
          } catch (error) { if (mounted.current) { setCancelling(false); setError(error?.message || 'Unable to cancel login') } }
        }
        const notice = attempt?.notice
        const prompt = attempt?.prompt
        const otherSurface = entry?.inFlight && !entry?.activeAttempt && !attempt?.id
        const canCancel = busy && attempt?.id && !terminal(attempt.status)
        return e('div', { 'data-provider-hub-login': providerId, style: { marginTop: 8, padding: 10, border: '1px solid var(--dsw-alias-border-l3, #ddd)', borderRadius: 8 } },
          e('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
            e('strong', null, labels[providerId] || provider?.displayName || providerId),
            entry?.authorized ? e('span', { style: { color: 'var(--dsw-alias-state-success-primary, #16803c)', fontSize: 12 } }, '已登录') : null,
            e('button', { type: 'button', disabled: busy || otherSurface, onClick: start }, entry?.authorized ? '重新登录' : '登录'),
            canCancel ? e('button', { type: 'button', disabled: cancelling, onClick: cancel }, cancelling ? '正在取消' : '取消') : null,
          ),
          otherSurface ? e('p', null, '其他页面正在登录，请先完成或取消该请求。') : null,
          notice ? e('p', null, notice.message, notice.url ? e('a', { href: notice.url, target: '_blank', rel: 'noreferrer', style: { marginLeft: 6 } }, '打开登录页面') : null, notice.code ? ` 代码：${notice.code}` : null) : null,
          prompt ? e('form', { onSubmit: answer, style: { display: 'flex', gap: 6 } },
            prompt.kind === 'select'
              ? e('select', { name: 'answer', 'aria-label': prompt.message }, ...(prompt.options ?? []).map(option => e('option', { key: option.id, value: option.id }, option.label)))
              : e('input', { name: 'answer', type: prompt.kind === 'secret' ? 'password' : 'text', placeholder: prompt.placeholder || prompt.message, 'aria-label': prompt.message, autoFocus: true }),
            e('button', { type: 'submit', disabled: cancelling }, '提交')) : null,
          error ? e('p', { role: 'alert', style: { color: '#b42318' } }, error) : null,
          attempt?.status === 'failed' ? e('p', { role: 'alert', style: { color: '#b42318' } }, attempt.error || '登录失败') : null,
        )
      }
      return {
        inject: ['remote', 'slots'],
        async apply(ctx) {
          const disposeRemote = await ctx.remote.$mount(remote)
          const ui = ctx.inject(['remote.searchLogin', 'slots'], scoped => {
            scoped.slots.inject('settings.models.provider-card', () => scoped.slots.register({ name: 'settings.models.provider-card', key: 'llm-pi-ai' }, props => e(LoginCard, { ...props, remote: scoped.remote.searchLogin })))
          })
          try { await ui; return async () => { await ui.dispose(); await disposeRemote() } } catch (error) { await ui.dispose(); await disposeRemote(); throw error }
        },
      }
    },
  })
})(window)
