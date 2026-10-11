/* Declared DSH client module: loaded and disposed by the browser plugin roster. */
(function installDshProviderHub(window) {
  const record = value => value !== null && typeof value === 'object' && !Array.isArray(value)
  const stringCodec = name => ({ mode: 'strict', typeSymbol: `dsh-provider-hub#${name}`, create: () => ({ parse: value => { if (typeof value !== 'string') throw new Error('Expected text'); return value } }) })
  const objectCodec = name => ({ mode: 'strict', typeSymbol: `dsh-provider-hub#${name}`, create: () => ({ parse: value => { if (!record(value) || typeof value.key !== 'string' || (value.method !== undefined && typeof value.method !== 'string')) throw new Error('Invalid authorization request'); return value } }) })
  const recordCodec = name => ({ mode: 'strict', typeSymbol: `dsh-provider-hub#${name}`, create: () => ({ parse: value => { if (!record(value)) throw new Error('Invalid quota request'); return value } }) })
  const resultCodec = name => ({ mode: 'strict', typeSymbol: `dsh-provider-hub#${name}:result`, create: () => ({ parse: value => { if (!record(value)) throw new Error('Invalid authorization response'); return value } }) })
  const remote = {
    package: 'dsh-provider-hub',
    descriptors: [
      { id: 'dsh-provider-hub#searchLogin/list', service: 'searchLogin', namespace: 'searchLogin', method: 'list', invocation: { kind: 'direct' }, parameters: [], result: resultCodec('list') },
      { id: 'dsh-provider-hub#searchLogin/start', service: 'searchLogin', namespace: 'searchLogin', method: 'start', invocation: { kind: 'direct' }, parameters: [{ name: 'request', wire: 'request', source: 'json', codec: objectCodec('start-request') }], result: resultCodec('start') },
      { id: 'dsh-provider-hub#searchLogin/status', service: 'searchLogin', namespace: 'searchLogin', method: 'status', invocation: { kind: 'direct' }, parameters: [{ name: 'attemptId', wire: 'attemptId', source: 'json', codec: stringCodec('attemptId') }], result: resultCodec('status') },
      { id: 'dsh-provider-hub#searchLogin/answer', service: 'searchLogin', namespace: 'searchLogin', method: 'answer', invocation: { kind: 'direct' }, parameters: [{ name: 'attemptId', wire: 'attemptId', source: 'json', codec: stringCodec('attemptId') }, { name: 'value', wire: 'value', source: 'json', codec: stringCodec('value') }], result: resultCodec('answer') },
      { id: 'dsh-provider-hub#searchLogin/cancel', service: 'searchLogin', namespace: 'searchLogin', method: 'cancel', invocation: { kind: 'direct' }, parameters: [{ name: 'attemptId', wire: 'attemptId', source: 'json', codec: stringCodec('attemptId') }], result: resultCodec('cancel') },
      { id: 'dsh-provider-hub#quota/snapshot', service: 'quota', namespace: 'quota', method: 'snapshot', invocation: { kind: 'direct' }, parameters: [{ name: 'request', wire: 'request', source: 'json', codec: recordCodec('snapshot-request') }], result: resultCodec('snapshot') },
      { id: 'dsh-provider-hub#quota/history', service: 'quota', namespace: 'quota', method: 'history', invocation: { kind: 'direct' }, parameters: [{ name: 'request', wire: 'request', source: 'json', codec: recordCodec('history-request') }], result: resultCodec('history') },
    ],
  }
  const loader = window.__ModuleLoader__
  if (!loader || typeof loader.load !== 'function') return
  loader.load({
    id: 'dsh-provider-hub',
    factory: require => {
      const React = require('react')
      const e = React.createElement
      const { SettingsForm, SettingsFormModel } = require('@deepseek-ai/dsh-client-ui-primitives')
      const searchNamespace = 'dsh-provider-hub'
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
        .provider-hub-ui .ph-quota { display:flex; flex-direction:column; gap:10px; padding:12px; border:.5px solid var(--dsw-alias-border-l3); border-radius:var(--dsw-radius-md,8px); background:var(--dsw-alias-bg-layer-1) }
        .provider-hub-ui .ph-quota-head { display:flex; align-items:center; justify-content:space-between; gap:8px; flex-wrap:wrap }
        .provider-hub-ui .ph-quota-title { display:flex; align-items:baseline; gap:8px; margin:0; font-size:13px; font-weight:600 }
        .provider-hub-ui .ph-quota-age { color:var(--dsw-alias-label-tertiary); font-size:12px; font-weight:400 }
        .provider-hub-ui .ph-quota-identity { display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin:0; font-size:12px; color:var(--dsw-alias-label-tertiary); overflow-wrap:anywhere }
        .provider-hub-ui .ph-plan { display:inline-flex; align-items:center; padding:1px 8px; border:.5px solid var(--dsw-alias-border-l3); border-radius:999px; font-size:11px; font-weight:600; letter-spacing:.04em; text-transform:uppercase; color:var(--dsw-alias-label-tertiary) }
        .provider-hub-ui .ph-window { display:flex; flex-direction:column; gap:4px }
        .provider-hub-ui .ph-window-row { display:flex; align-items:baseline; justify-content:space-between; gap:12px; font-size:12px; color:var(--dsw-alias-label-tertiary) }
        .provider-hub-ui .ph-window-label { font-weight:500 }
        .provider-hub-ui .ph-bar { height:6px; border-radius:999px; background:var(--dsw-alias-border-l3); overflow:hidden }
        .provider-hub-ui .ph-bar-fill { height:100%; border-radius:999px; background:var(--dsw-alias-brand-primary); transition:width 200ms ease }
        .provider-hub-ui .ph-meta { display:flex; flex-wrap:wrap; gap:4px 16px; margin:0; color:var(--dsw-alias-label-tertiary); font-size:12px }
        .provider-hub-ui .ph-spark { width:100%; height:28px; color:var(--dsw-alias-label-tertiary) }
        .provider-hub-ui .ph-ranges { display:flex; gap:4px }
        .provider-hub-ui .ph-range { min-height:26px; padding:2px 10px; font-size:12px }
        .provider-hub-ui .ph-range[aria-pressed="true"] { border-color:var(--dsw-alias-brand-primary); color:var(--dsw-alias-brand-primary) }
        .provider-hub-ui .ph-quota-notice { margin:0; padding-left:12px; border-left:2px solid var(--dsw-alias-border-l3); color:var(--dsw-alias-label-tertiary); font-size:12px; overflow-wrap:anywhere }
        .provider-hub-ui .ph-quota-notice[data-tone=warn] { border-left-color:var(--dsw-alias-state-warning-primary,var(--dsw-alias-state-business-primary)); color:var(--dsw-alias-label-primary) }
        .provider-hub-ui .ph-number-row { display:flex; align-items:center; justify-content:space-between; gap:20px; padding:14px 0; border-bottom:.5px solid var(--dsw-alias-border-l3) }
        .provider-hub-ui .ph-number-row:last-child { border-bottom:0 }
        .provider-hub-ui .ph-number { width:96px; min-height:30px; padding:4px 8px; border:.5px solid var(--dsw-alias-border-l4,var(--dsw-alias-border-l3)); border-radius:var(--dsw-radius-sm,6px); background:var(--dsw-alias-bg-layer-1); color:inherit; font:inherit }
        .provider-hub-ui .ph-number:disabled { opacity:.45 }
        @media (max-width:480px) { .provider-hub-ui .ph-login-head { flex-direction:column; align-items:stretch } .provider-hub-ui .ph-login-head>.ph-actions { width:100% } .provider-hub-ui .ph-login-head>.ph-actions>.ph-primary { flex:1 } .provider-hub-ui .ph-answer>.ph-button { width:100% } }
        @media (prefers-reduced-motion:reduce) { .provider-hub-ui .ph-button,.provider-hub-ui .ph-switch,.provider-hub-ui .ph-switch:before { transition:none } }
      `
      const searchProviders = [
        { id: 'openai-codex', label: 'ChatGPT / Codex', hint: '使用 Models 页面保存的 ChatGPT 账号授权。' },
        { id: 'zai', label: 'Z.AI', hint: '使用已有 Z.AI API Key，无需另行登录。' },
      ]
      const searchSummary = '官方搜索始终保留；可独立附加 Codex 与 Z.AI 搜索增强，并在登录卡查看 Codex 账号额度与用量历史。'
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
      const booleanField = field => ({
        field,
        format: value => (value === false ? 'false' : 'true'),
        parse: text => (text === 'true' || text === 'false' ? { kind: 'set', value: text === 'true' } : undefined),
      })
      const integerField = (field, min, max, fallback) => ({
        field,
        format: value => { const n = Number(value); return Number.isInteger(n) && n >= min && n <= max ? String(n) : String(fallback) },
        parse: text => { const n = Number(text); return Number.isInteger(n) && n >= min && n <= max ? { kind: 'set', value: n } : undefined },
      })
      const quotaFields = [booleanField('quotaRecord'), integerField('quotaIntervalMinutes', 15, 1440, 60), integerField('quotaHistoryDays', 7, 3650, 180)]
      function SearchProviderCard(props) {
        const state = props.useSearchProviderCard(snapshot => snapshot)
        if (props.view === 'summary') return searchSummary
        const disabled = !state.writable || state.saving
        const field = state.searchProviders
        const selected = readSelection(field.text) ?? []
        const recordSelected = state.quotaRecord?.text !== 'false'
        const intervalText = state.quotaIntervalMinutes?.text ?? '60'
        const retentionText = state.quotaHistoryDays?.text ?? '180'
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
          e('h4', { className: 'ph-heading' }, '搜索与额度'),
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
          e('fieldset', { className: 'ph-switches', disabled },
            e('legend', { className: 'ph-heading' }, 'Codex 额度记录'),
            e('label', { className: 'ph-switch-row', htmlFor: 'provider-hub-quota-record' },
              e('span', { className: 'ph-switch-copy' }, e('span', { className: 'ph-switch-title' }, '每小时自动记录'), e('span', { className: 'ph-muted' }, 'DSH 运行期间在后台只读查询 Codex 账号额度并保存历史；登录卡打开或点刷新时也会即时查询。')),
              e('input', {
                id: 'provider-hub-quota-record',
                className: 'ph-switch',
                type: 'checkbox',
                role: 'switch',
                'data-quota-record': true,
                'aria-label': '启用每小时额度记录',
                'aria-checked': recordSelected,
                checked: recordSelected,
                disabled,
                onChange: event => props.edit('quotaRecord', String(event.target.checked)),
              }),
            ),
            e('div', { className: 'ph-number-row' },
              e('label', { className: 'ph-switch-copy', htmlFor: 'provider-hub-quota-interval' },
                e('span', { className: 'ph-switch-title' }, '记录间隔（分钟）'),
                e('span', { className: 'ph-muted' }, '两次后台查询的间隔，15–1440。'),
              ),
              e('input', {
                id: 'provider-hub-quota-interval',
                className: 'ph-number',
                type: 'number',
                min: 15,
                max: 1440,
                step: 1,
                'data-quota-interval': true,
                'aria-label': '额度记录间隔分钟',
                disabled,
                value: intervalText,
                onChange: event => props.edit('quotaIntervalMinutes', event.target.value),
              }),
            ),
            e('div', { className: 'ph-number-row' },
              e('label', { className: 'ph-switch-copy', htmlFor: 'provider-hub-quota-retention' },
                e('span', { className: 'ph-switch-title' }, '历史保留（天）'),
                e('span', { className: 'ph-muted' }, '超过保留期的记录点会在整理时删除，7–3650。'),
              ),
              e('input', {
                id: 'provider-hub-quota-retention',
                className: 'ph-number',
                type: 'number',
                min: 7,
                max: 3650,
                step: 1,
                'data-quota-retention': true,
                'aria-label': '额度历史保留天数',
                disabled,
                value: retentionText,
                onChange: event => props.edit('quotaHistoryDays', event.target.value),
              }),
            ),
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
      const quotaWindowLabel = window => {
        if (!window) return '额度窗口'
        if (window.kind === 'weekly') return '周窗口'
        const seconds = window.windowSeconds
        if (typeof seconds === 'number' && Number.isFinite(seconds) && seconds > 0) {
          if (seconds === 18000) return '5 小时窗口'
          return seconds % 86400 === 0 ? `${seconds / 86400} 天窗口` : `${Math.round(seconds / 3600)} 小时窗口`
        }
        return '短窗口'
      }
      const quotaAgeLabel = fetchedAt => {
        if (typeof fetchedAt !== 'number') return ''
        const seconds = Math.max(0, Math.floor(Date.now() / 1000) - fetchedAt)
        if (seconds < 60) return '刚刚更新'
        if (seconds < 3600) return `${Math.floor(seconds / 60)} 分钟前更新`
        if (seconds < 86400) return `${Math.floor(seconds / 3600)} 小时前更新`
        return `${Math.floor(seconds / 86400)} 天前更新`
      }
      const quotaResetLabel = resetAt => {
        if (typeof resetAt !== 'number') return ''
        const date = new Date(resetAt * 1000)
        const stamp = `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
        const left = resetAt - Math.floor(Date.now() / 1000)
        if (left <= 0) return `重置 ${stamp}`
        const days = Math.floor(left / 86400)
        const hours = Math.floor((left % 86400) / 3600)
        const minutes = Math.floor((left % 3600) / 60)
        const span = days > 0 ? `${days} 天${hours > 0 ? ` ${hours} 小时` : ''}` : hours > 0 ? `${hours} 小时${minutes > 0 ? ` ${minutes} 分` : ''}` : `${minutes} 分钟`
        return `重置 ${stamp}（${span}后）`
      }
      const quotaSpark = (points, kind) => {
        const values = points.map(point => point?.used?.[kind]).filter(value => typeof value === 'number' && Number.isFinite(value))
        if (values.length < 2) return null
        const coords = values.map((value, index) => `${((index / (values.length - 1)) * 100).toFixed(2)},${(23 - (value / 100) * 22).toFixed(2)}`).join(' ')
        return e('svg', { className: 'ph-spark', viewBox: '0 0 100 24', preserveAspectRatio: 'none', role: 'img', 'aria-label': '用量趋势', 'data-quota-spark': kind },
          e('polyline', { points: coords, fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, vectorEffect: 'non-scaling-stroke' }))
      }
      function QuotaPanel({ quota }) {
        const [view, setView] = React.useState()
        const [points, setPoints] = React.useState([])
        const [range, setRange] = React.useState(168)
        const [busy, setBusy] = React.useState(false)
        const mounted = React.useRef(true)
        const busyRef = React.useRef(false)
        const rangeRef = React.useRef(range)
        rangeRef.current = range
        React.useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
        const quotaUnwrap = result => { if (!result?.ok) throw new Error(result?.error?.message || 'Quota query failed'); return result.value }
        const loadHistory = React.useCallback(async () => {
          try {
            const value = quotaUnwrap(await quota.history({ hours: rangeRef.current }))
            if (mounted.current) setPoints(Array.isArray(value?.points) ? value.points : [])
          } catch { /* history stays best-effort; the panel keeps its empty state */ }
        }, [quota])
        const load = React.useCallback(async maxAgeMs => {
          if (busyRef.current) return
          busyRef.current = true
          setBusy(true)
          try {
            const value = quotaUnwrap(await quota.snapshot({ maxAgeMs }))
            if (mounted.current) setView(value)
            await loadHistory()
          } catch (error) {
            if (mounted.current) setView({ status: 'network', message: error?.message || 'Quota query failed' })
          } finally {
            busyRef.current = false
            if (mounted.current) setBusy(false)
          }
        }, [quota, loadHistory])
        React.useEffect(() => { void load(300000) }, [load])
        const snapshot = view?.status === 'ok' ? view.snapshot : view?.lastSnapshot
        const windows = Array.isArray(snapshot?.windows) ? snapshot.windows : []
        const age = quotaAgeLabel(view?.status === 'ok' ? view.fetchedAt : view?.lastFetchAt)
        return e('div', { className: 'ph-quota', 'data-quota-section': true, 'data-quota-state': view?.status ?? 'loading', 'aria-label': 'Codex 账号额度' },
          e('div', { className: 'ph-quota-head' },
            e('h5', { className: 'ph-quota-title' }, '账号额度',
              e('span', { className: 'ph-quota-age' }, busy ? '查询中…' : age)),
            e('button', { className: 'ph-button', type: 'button', 'data-quota-refresh': true, disabled: busy, onClick: () => { void load(0) } }, '刷新'),
          ),
          snapshot ? e(React.Fragment, null,
            snapshot.email || snapshot.plan ? e('p', { className: 'ph-quota-identity' },
              snapshot.email ? e('span', { 'data-quota-email': true }, snapshot.email) : null,
              snapshot.plan ? e('span', { className: 'ph-plan' }, snapshot.plan) : null) : null,
            ...windows.map(window => e('div', { className: 'ph-window', key: window.kind, 'data-quota-window': window.kind },
              e('div', { className: 'ph-window-row' },
                e('span', { className: 'ph-window-label' }, quotaWindowLabel(window)),
                e('span', null, `已用 ${window.usedPercent}% · 剩余 ${100 - window.usedPercent}%`),
              ),
              e('div', { className: 'ph-bar', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': window.usedPercent, 'aria-label': `${quotaWindowLabel(window)}已用百分比` },
                e('div', { className: 'ph-bar-fill', style: { width: `${window.usedPercent}%` } })),
              e('div', { className: 'ph-window-row' },
                e('span', null, quotaResetLabel(window.resetAt))),
            )),
            snapshot.credits || snapshot.resetCredits ? e('p', { className: 'ph-meta' },
              typeof snapshot.credits?.balance === 'number' && Number.isFinite(snapshot.credits.balance) ? e('span', { 'data-quota-credits': true }, `积分 ${snapshot.credits.balance.toLocaleString()}`) : null,
              snapshot.credits?.unlimited === true ? e('span', null, '积分不限量') : null,
              typeof snapshot.resetCredits?.available === 'number' ? e('span', null, `可重置 ${snapshot.resetCredits.available} 次`) : null) : null,
          ) : null,
          view && view.status !== 'ok' ? e('p', { className: 'ph-quota-notice', 'data-tone': view.status === 'expired' ? 'warn' : undefined, 'data-quota-notice': view.status, role: 'status' },
            view.status === 'expired' ? '令牌可能已过期——在 DSH 发送一次对话即可自动刷新，随后点刷新重试。'
              : view.status === 'unsupported' ? '上游额度响应格式已变化，暂无法解析；请关注插件更新。'
                : view.status === 'network' ? (view.message || '额度查询失败，请检查网络连接。')
                  : '暂无额度数据。') : null,
          e('div', { className: 'ph-quota-head' },
            e('span', { className: 'ph-muted' }, '用量历史（每小时记录一次）'),
            e('div', { className: 'ph-ranges', role: 'group', 'aria-label': '历史范围' },
              e('button', { className: 'ph-button ph-range', type: 'button', 'aria-pressed': range === 24, 'data-quota-range': '24', onClick: () => { setRange(24); rangeRef.current = 24; void loadHistory() } }, '24 小时'),
              e('button', { className: 'ph-button ph-range', type: 'button', 'aria-pressed': range === 168, 'data-quota-range': '168', onClick: () => { setRange(168); rangeRef.current = 168; void loadHistory() } }, '7 天'),
              e('button', { className: 'ph-button ph-range', type: 'button', 'aria-pressed': range === 720, 'data-quota-range': '720', onClick: () => { setRange(720); rangeRef.current = 720; void loadHistory() } }, '30 天'),
            ),
          ),
          quotaSpark(points, 'weekly') ?? quotaSpark(points, 'short') ?? e('p', { className: 'ph-muted' }, '暂无历史记录；开启每小时记录后，下一个记录点起可查看曲线。'),
        )
      }
      function LoginCard({ provider, remote: login, quota }) {
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
          entry?.authorized && quota ? e(QuotaPanel, { quota }) : null,
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
          }, 'dsh-provider-hub: scoped interface styles')
          ctx.effect(() => {
            // The shared scope belongs to configForms; only this staged model is ours.
            const form = new SettingsFormModel(ctx.configForms.get(searchNamespace), [providerField, ...quotaFields])
            try {
              const store = form.bind(() => ({ ...form.shell(), searchProviders: form.field('searchProviders'), quotaRecord: form.field('quotaRecord'), quotaIntervalMinutes: form.field('quotaIntervalMinutes'), quotaHistoryDays: form.field('quotaHistoryDays') }))
              // A community bundle owns its detail-page form, never an Official item.
              const stop = ctx.configForms.whileServed([searchNamespace], () => ctx.slots.inject('plugins.bundle.config', () => ctx.slots.register({
                name: 'plugins.bundle.config',
                key: 'dsh-provider-hub',
                inject: () => ({ hooks: { searchProviderCard: store }, ...form.actions() }),
              }, SearchProviderCard)))
              return () => { try { stop() } finally { form.dispose() } }
            } catch (error) { form.dispose(); throw error }
          }, 'dsh-provider-hub: global search settings')
          const disposeRemote = await ctx.remote.$mount(remote)
          const ui = ctx.inject(['remote.searchLogin', 'remote.quota', 'slots'], scoped => {
            scoped.slots.inject('settings.models.provider-card', () => scoped.slots.register({ name: 'settings.models.provider-card', key: 'llm-pi-ai' }, props => e(LoginCard, { ...props, remote: scoped.remote.searchLogin, quota: scoped.remote.quota })))
          })
          try { await ui; return async () => { await ui.dispose(); await disposeRemote() } } catch (error) { await ui.dispose(); await disposeRemote(); throw error }
        },
      }
    },
  })
})(window)
