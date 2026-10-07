/* Browser half injected by the Host plugin. It uses only stable DSH client seams. */
(function installDshWebSearch(window) {
  const passthrough = () => ({ parse: value => value })
  const stringCodec = name => ({ mode: 'strict', typeSymbol: `dsh-web-search#${name}`, create: passthrough })
  const objectCodec = name => ({ mode: 'strict', typeSymbol: `dsh-web-search#${name}`, create: passthrough })
  const resultCodec = name => ({ mode: 'strict', typeSymbol: `dsh-web-search#${name}:result`, create: passthrough })
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
      const allowed = new Set(['openai-codex', 'zai', 'zai-coding-cn'])
      const labels = { 'openai-codex': 'ChatGPT / Codex', zai: 'Z.AI', 'zai-coding-cn': 'Z.AI Coding CN' }
      function LoginCard({ provider, remote: login }) {
        const providerId = provider?.provider
        if (!allowed.has(providerId)) return null
        const key = `llm-pi-ai/${providerId}`
        const [entry, setEntry] = React.useState()
        const [attempt, setAttempt] = React.useState()
        const [busy, setBusy] = React.useState(false)
        const [error, setError] = React.useState()
        const refresh = React.useCallback(async () => {
          const result = await login.list()
          if (result?.ok) setEntry(result.value.entries.find(item => item.key === key))
        }, [login, key])
        React.useEffect(() => { void refresh() }, [refresh])
        React.useEffect(() => {
          if (!attempt || ['authorized', 'cancelled', 'failed', 'missing'].includes(attempt.status)) return undefined
          const timer = setInterval(async () => {
            const result = await login.status(attempt.id)
            if (result?.ok) setAttempt(result.value)
            if (result?.ok && ['authorized', 'cancelled', 'failed'].includes(result.value.status)) {
              setBusy(false); await refresh()
            }
          }, 700)
          return () => clearInterval(timer)
        }, [attempt, login, refresh])
        const start = async () => {
          setBusy(true); setError(undefined)
          const result = await login.start({ key })
          if (!result?.ok) { setBusy(false); setError(result?.error?.message || 'Login failed'); return }
          setAttempt(result.value); setBusy(true)
        }
        const answer = async event => {
          event.preventDefault()
          const value = event.currentTarget.elements.answer.value
          const result = await login.answer(attempt.id, value)
          if (!result?.ok) setError(result?.error?.message || 'Unable to send answer')
        }
        const cancel = async () => { await login.cancel(attempt.id); setBusy(false) }
        const notice = attempt?.notice
        const prompt = attempt?.prompt
        return e('div', { style: { marginTop: 8, padding: 10, border: '1px solid var(--dsw-alias-border-l3, #ddd)', borderRadius: 8 } },
          e('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
            e('strong', null, labels[providerId] || provider?.displayName || providerId),
            entry?.authorized ? e('span', { style: { color: 'var(--dsw-alias-state-success-primary, #16803c)', fontSize: 12 } }, '已登录') : null,
            e('button', { type: 'button', disabled: busy, onClick: start }, entry?.authorized ? '重新登录' : '登录'),
            busy ? e('button', { type: 'button', onClick: cancel }, '取消') : null,
          ),
          notice?.url ? e('p', null, e('a', { href: notice.url, target: '_blank', rel: 'noreferrer' }, notice.url), notice.code ? ` 代码：${notice.code}` : null) : null,
          notice && !notice.url ? e('p', null, notice.message) : null,
          prompt ? e('form', { onSubmit: answer, style: { display: 'flex', gap: 6 } }, e('input', { name: 'answer', type: prompt.kind === 'secret' ? 'password' : 'text', placeholder: prompt.message, autoFocus: true }), e('button', { type: 'submit' }, '提交')) : null,
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
