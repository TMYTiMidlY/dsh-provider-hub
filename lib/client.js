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
      const { SettingsForm, SettingsFormModel } = require('@deepseek-ai/dsh-client-ui-primitives')
      const searchNamespace = 'dsh-web-search'
      const uiCss = `
        .provider-hub-ui { color:var(--dsw-alias-label-primary); font-size:13px; line-height:1.6; min-width:0 }
        .provider-hub-ui * { box-sizing:border-box }
        .provider-hub-ui .ph-muted { margin:0; color:var(--dsw-alias-label-tertiary); font-size:12px }
        .provider-hub-ui .ph-heading { margin:0; font-size:14px; font-weight:600; line-height:1.5 }
        .provider-hub-ui .ph-actions { display:flex; align-items:center; flex-wrap:wrap; gap:8px }
        .provider-hub-ui .ph-button { display:inline-flex; align-items:center; justify-content:center; min-height:34px; padding:5px 12px; border:.5px solid var(--dsw-alias-border-l3); border-radius:var(--dsw-radius-md,8px); background:transparent; color:inherit; font:inherit; font-weight:500; cursor:pointer; text-decoration:none; transition:background 120ms ease,border-color 120ms ease }
        .provider-hub-ui .ph-button:hover:not(:disabled) { background:var(--dsw-alias-interactive-bg-hover) }
        .provider-hub-ui .ph-button.ph-primary { border-color:transparent; background:var(--dsw-alias-button-primary-fill); color:var(--dsw-alias-label-primary-foreground) }
        .provider-hub-ui .ph-button.ph-primary:hover:not(:disabled) { background:var(--dsw-alias-button-primary-hover) }
        .provider-hub-ui .ph-button:disabled { opacity:.45; cursor:not-allowed }
        .provider-hub-ui :is(button,a,input,select):focus-visible { outline:var(--dsw-focus-ring-width,2px) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary)); outline-offset:3px }
        .provider-hub-ui .ph-switches { margin:0; padding:0; border:0 }
        .provider-hub-ui .ph-switch-row { display:flex; align-items:center; justify-content:space-between; gap:20px; padding:14px 0; border-bottom:.5px solid var(--dsw-alias-border-l3); cursor:pointer }
        .provider-hub-ui .ph-switch-copy { display:flex; flex-direction:column; gap:2px; min-width:0 }
        .provider-hub-ui .ph-switch-title { font-size:14px; font-weight:600 }
        .provider-hub-ui .ph-switch { appearance:none; -webkit-appearance:none; position:relative; flex:0 0 36px; width:36px; height:20px; margin:0; border:0; border-radius:999px; corner-shape:round; background:var(--dsw-alias-border-l3); cursor:pointer; transition:background 120ms ease }
        .provider-hub-ui .ph-switch:before { content:''; display:block; position:absolute; width:16px; height:16px; top:2px; left:2px; border-radius:50%; corner-shape:round; background:var(--dsw-alias-switch-thumb,var(--dsw-alias-label-primary-foreground)); transition:transform 120ms ease }
        .provider-hub-ui .ph-switch:checked { background:var(--dsw-alias-brand-primary) }
        .provider-hub-ui .ph-switch:checked:before { transform:translateX(16px); background:var(--dsw-alias-label-primary-foreground) }
        .provider-hub-ui .ph-switch:disabled { opacity:.45; cursor:not-allowed }
        .provider-hub-ui .ph-selection { padding:12px 0; display:flex; flex-direction:column; gap:3px }
        .provider-hub-ui .ph-selection-title { margin:0; font-weight:500 }
        .provider-hub-ui .ph-settings-foot { display:flex; flex-direction:column; gap:12px }
        .provider-hub-ui.ph-login { margin-top:16px; padding-top:16px; border-top:.5px solid var(--dsw-alias-border-l3); display:flex; flex-direction:column; gap:14px }
        .provider-hub-ui .ph-login-head { display:flex; align-items:flex-start; justify-content:space-between; flex-wrap:wrap; gap:12px }
        .provider-hub-ui .ph-login-identity { display:flex; flex-direction:column; gap:4px }
        .provider-hub-ui .ph-status { display:inline-flex; align-items:center; gap:6px; color:var(--dsw-alias-label-tertiary); font-size:12px }
        .provider-hub-ui .ph-status:before { content:''; width:6px; height:6px; flex:0 0 6px; border-radius:50%; background:currentColor }
        .provider-hub-ui .ph-status[data-tone=success] { color:var(--dsw-alias-state-success-primary) }
        .provider-hub-ui .ph-status[data-tone=error] { color:var(--dsw-alias-state-error-primary) }
        .provider-hub-ui .ph-notice { display:flex; flex-direction:column; align-items:flex-start; gap:10px; padding-left:12px; border-left:2px solid var(--dsw-alias-border-l3); overflow-wrap:anywhere }
        .provider-hub-ui .ph-notice p { margin:0 }
        .provider-hub-ui .ph-code { padding:4px 8px; border:.5px solid var(--dsw-alias-border-l3); border-radius:var(--dsw-radius-sm,6px); color:var(--dsw-alias-label-primary); font:600 13px/1.6 ui-monospace,SFMono-Regular,monospace; letter-spacing:.04em; overflow-wrap:anywhere }
        .provider-hub-ui .ph-answer { display:flex; align-items:flex-end; flex-wrap:wrap; gap:10px }
        .provider-hub-ui .ph-answer-label { display:flex; flex:1 1 220px; flex-direction:column; gap:6px; min-width:0 }
        .provider-hub-ui .ph-answer-control { width:100%; min-width:0; min-height:36px; padding:6px 10px; border:.5px solid var(--dsw-alias-border-l4,var(--dsw-alias-border-l3)); border-radius:var(--dsw-radius-md,8px); color:inherit; background:var(--dsw-alias-bg-layer-1); font:inherit }
        .provider-hub-ui .ph-error { padding-left:12px; border-left:2px solid var(--dsw-alias-state-error-primary); color:var(--dsw-alias-state-error-primary); overflow-wrap:anywhere }
        .provider-hub-ui .ph-error p { margin:0 }
        @media (max-width:480px) { .provider-hub-ui .ph-login-head { flex-direction:column; align-items:stretch } .provider-hub-ui .ph-login-head>.ph-actions { width:100% } .provider-hub-ui .ph-login-head>.ph-actions>.ph-primary { flex:1 } .provider-hub-ui .ph-answer>.ph-button { width:100% } }
        @media (prefers-reduced-motion:reduce) { .provider-hub-ui .ph-button,.provider-hub-ui .ph-switch,.provider-hub-ui .ph-switch:before { transition:none } }
      `
      const searchProviders = [
        { id: 'openai-codex', label: 'ChatGPT / Codex', hint: '使用 Models 页面保存的 ChatGPT 账号授权。' },
        { id: 'zai', label: 'Z.AI', hint: '使用已有 Z.AI API Key，无需另行登录。' },
      ]
      const searchSummary = '官方搜索始终保留；可独立附加 Codex 与 Z.AI 搜索增强。'
      const readSelection = text => {
        try {
          const value = JSON.parse(text)
          if (!Array.isArray(value) || value.some(id => !searchProviders.some(provider => provider.id === id))) return undefined
          return searchProviders.filter(provider => value.includes(provider.id)).map(provider => provider.id)
        } catch { return undefined }
      }
      const providerField = {
        field: 'searchProviders',
        format: value => JSON.stringify(Array.isArray(value) ? value : []),
        parse: text => { const value = readSelection(text); return value === undefined ? undefined : { kind: 'set', value } },
      }
      function SearchProviderCard(props) {
        const state = props.useSearchProviderCard(snapshot => snapshot)
        if (props.view === 'summary') return searchSummary
        const disabled = !state.writable || state.saving
        const field = state.searchProviders
        const selected = readSelection(field.text) ?? []
        const toggle = (id, checked) => props.edit('searchProviders', JSON.stringify(searchProviders.filter(provider => provider.id === id ? checked : selected.includes(provider.id)).map(provider => provider.id)))
        const selectionTitle = selected.length === 2 ? '官方 + Codex + Z.AI · 并行搜索' : selected.length === 1 ? `官方 + ${selected[0] === 'openai-codex' ? 'Codex' : 'Z.AI'} · 并行搜索` : '仅官方搜索'
        const selectionHint = selected.length > 0 ? '官方与已开启的增强同时查询，结果按 URL 去重、共用总上限。普通单路失败会明确提示并保留成功结果。' : '关闭全部增强只移除 Codex/Z.AI；官方搜索与原有鉴权保持不变。'
        return e(SettingsForm, {
          state,
          labels: {
            unavailable: '搜索路由插件当前未加载，暂时无法配置。',
            readOnly: '当前连接不允许保存 Host 设置，请在本机 WebUI 或部署配置中修改。',
            saveFailed: '保存未被接受，已保留草稿；请检查其他页面或运维配置是否已修改设置。',
            save: '保存',
            saving: '保存中…',
          },
          onSave: props.save,
          onDiscard: props.discard,
        },
        e('div', { 'data-provider-hub-settings': true, className: 'provider-hub-ui' },
          e('div', { className: 'ph-selection', 'data-search-baseline': 'deepseek-official' },
            e('p', { className: 'ph-selection-title' }, '官方搜索 · 始终保留'),
            e('p', { className: 'ph-muted' }, '默认增强路由中，每条查询都尝试原生 DeepSeek 搜索。仍需原有 API Key 或账号授权；缺凭据会真实报错，不代表已可用。'),
          ),
          e('fieldset', { className: 'ph-switches', disabled, 'aria-describedby': 'provider-hub-selection-hint' },
            e('legend', { className: 'ph-heading' }, '附加搜索增强'),
            ...searchProviders.map(provider => e('label', { key: provider.id, className: 'ph-switch-row', htmlFor: `provider-hub-${provider.id}` },
              e('span', { className: 'ph-switch-copy' }, e('span', { className: 'ph-switch-title' }, provider.label), e('span', { className: 'ph-muted' }, provider.hint)),
              e('input', {
                id: `provider-hub-${provider.id}`,
                className: 'ph-switch',
                type: 'checkbox',
                role: 'switch',
                'data-search-provider': provider.id,
                'aria-label': `启用 ${provider.label} 搜索增强`,
                'aria-checked': selected.includes(provider.id),
                'aria-invalid': field.invalid || undefined,
                checked: selected.includes(provider.id),
                disabled,
                onChange: event => toggle(provider.id, event.target.checked),
              }),
            )),
          ),
          e('div', { className: 'ph-selection', 'data-search-selection': selected.join(',') || 'deepseek-official', 'aria-live': 'polite' },
            e('p', { className: 'ph-selection-title' }, selectionTitle),
            e('p', { id: 'provider-hub-selection-hint', className: 'ph-muted' }, selectionHint),
          ),
          e('div', { className: 'ph-settings-foot' },
            e('p', { className: 'ph-muted' }, '一次保存，对所有已有 web_search 的模式和现有会话后续搜索全局生效。取消、超时或全部后端失败时不返回部分结果。'),
            e('p', { className: 'ph-muted' }, '完成后在原生搜索调用栏展开带来源标记的链接；不显示后端原始长摘要，也不模拟逐条来源流。'),
            e('p', { className: 'ph-muted' }, 'DSH_WEB_SEARCH_PROVIDER 或显式 web.searchProvider 运维配置可能覆盖以上开关。'),
            e('div', { className: 'ph-actions' },
              field.overridden ? e('button', { className: 'ph-button', type: 'button', disabled, 'data-search-action': 'reset', onClick: () => props.resetField('searchProviders') }, '恢复默认') : null,
              e('button', { className: 'ph-button', type: 'button', disabled: !state.dirty || state.saving, 'data-search-action': 'discard', onClick: props.discard }, '放弃修改'),
            ),
          ),
        ))
      }
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
        const statusLabel = otherSurface ? '其他页面正在授权' : cancelling ? '正在取消' : busy ? prompt ? '等待你的确认' : '等待授权完成' : attempt?.status === 'failed' ? '授权失败' : attempt?.status === 'cancelled' ? '已取消授权' : entry?.authorized ? '已登录' : '未登录'
        const statusTone = attempt?.status === 'failed' ? 'error' : !busy && !otherSurface && entry?.authorized ? 'success' : 'neutral'
        const loginError = attempt?.status === 'failed' ? attempt.error || error || '登录失败' : error
        const noticeUrl = typeof notice?.url === 'string' && /^https?:\/\/\S+$/iu.test(notice.url) ? notice.url : undefined
        return e('section', { 'data-provider-hub-login': providerId, 'data-login-state': attempt?.status || (entry?.authorized ? 'authorized' : 'signed-out'), className: 'provider-hub-ui ph-login', 'aria-label': 'ChatGPT / Codex 账号授权' },
          e('div', { className: 'ph-login-head' },
            e('div', { className: 'ph-login-identity' },
              e('h4', { className: 'ph-heading' }, labels[providerId] || provider?.displayName || providerId),
              e('span', { className: 'ph-status', 'data-tone': statusTone, role: 'status', 'aria-live': 'polite' }, statusLabel),
            ),
            e('div', { className: 'ph-actions' },
              e('button', { className: 'ph-button ph-primary', type: 'button', 'data-login-action': 'start', disabled: busy || otherSurface, onClick: start }, busy ? '授权进行中…' : entry?.authorized ? '重新登录' : '使用 ChatGPT 登录'),
              canCancel ? e('button', { className: 'ph-button', type: 'button', 'data-login-action': 'cancel', disabled: cancelling, onClick: cancel }, cancelling ? '正在取消…' : '取消授权') : null,
            ),
          ),
          e('p', { className: 'ph-muted' }, '沿用 DSH 已保存的账号授权，搜索不需要另外填写凭据。'),
          otherSurface ? e('p', { className: 'ph-muted', role: 'status' }, '其他页面正在登录。请先在那里完成或取消授权。') : null,
          notice ? e('div', { className: 'ph-notice', 'data-login-notice': true, role: 'status', 'aria-live': 'polite' },
            e('p', null, notice.message),
            noticeUrl ? e('a', { className: 'ph-button', href: noticeUrl, target: '_blank', rel: 'noopener noreferrer', 'data-login-action': 'open' }, '打开授权页面 ↗') : null,
            notice.code ? e('div', null, e('span', { className: 'ph-muted' }, '授权代码 '), e('code', { className: 'ph-code' }, notice.code)) : null,
          ) : null,
          prompt ? e('form', { onSubmit: answer, className: 'ph-answer', 'aria-label': '确认 ChatGPT 授权' },
            e('label', { className: 'ph-answer-label' },
              e('span', null, prompt.message),
              prompt.kind === 'select'
                ? e('select', { className: 'ph-answer-control', name: 'answer', 'aria-label': prompt.message, disabled: cancelling }, ...(prompt.options ?? []).map(option => e('option', { key: option.id, value: option.id }, option.label)))
                : e('input', { className: 'ph-answer-control', name: 'answer', type: prompt.kind === 'secret' ? 'password' : 'text', placeholder: prompt.placeholder || prompt.message, 'aria-label': prompt.message, autoComplete: prompt.kind === 'secret' ? 'new-password' : 'off', disabled: cancelling, autoFocus: true }),
            ),
            e('button', { className: 'ph-button ph-primary', type: 'submit', 'data-login-action': 'submit', disabled: cancelling }, '提交确认'),
          ) : null,
          loginError ? e('div', { className: 'ph-error', role: 'alert' }, e('p', null, loginError)) : null,
        )
      }
      return {
        inject: ['remote', 'slots', 'configForms'],
        async apply(ctx) {
          ctx.effect(() => {
            if (typeof document === 'undefined') return
            const style = document.createElement('style')
            style.dataset.providerHub = 'ui'
            style.textContent = uiCss
            document.head.appendChild(style)
            return () => style.remove()
          }, 'dsh-web-search: scoped interface styles')
          ctx.effect(() => {
            // The shared scope belongs to configForms; only this staged model is ours.
            const form = new SettingsFormModel(ctx.configForms.get(searchNamespace), [providerField])
            try {
              const store = form.bind(() => ({ ...form.shell(), searchProviders: form.field('searchProviders') }))
              const stop = ctx.configForms.whileServed([searchNamespace], () => ctx.slots.inject('plugins.item', () => ctx.slots.register({
                name: 'plugins.item',
                id: 'search-provider',
                order: 39,
                label: '搜索提供方',
                inject: () => ({ hooks: { searchProviderCard: store }, ...form.actions() }),
              }, SearchProviderCard)))
              return () => { try { stop() } finally { form.dispose() } }
            } catch (error) { form.dispose(); throw error }
          }, 'dsh-web-search: global search settings')
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
