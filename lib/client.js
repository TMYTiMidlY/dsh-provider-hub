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
      { id: 'dsh-provider-hub#keyPool/list', service: 'keyPool', namespace: 'keyPool', method: 'list', invocation: { kind: 'direct' }, parameters: [{ name: 'request', wire: 'request', source: 'json', codec: recordCodec('keyPool-list-request') }], result: resultCodec('keyPool-list') },
      { id: 'dsh-provider-hub#keyPool/add', service: 'keyPool', namespace: 'keyPool', method: 'add', invocation: { kind: 'direct' }, parameters: [{ name: 'request', wire: 'request', source: 'json', codec: recordCodec('keyPool-add-request') }], result: resultCodec('keyPool-add') },
      { id: 'dsh-provider-hub#keyPool/drop', service: 'keyPool', namespace: 'keyPool', method: 'drop', invocation: { kind: 'direct' }, parameters: [{ name: 'request', wire: 'request', source: 'json', codec: recordCodec('keyPool-drop-request') }], result: resultCodec('keyPool-drop') },
      { id: 'dsh-provider-hub#keyPool/rename', service: 'keyPool', namespace: 'keyPool', method: 'rename', invocation: { kind: 'direct' }, parameters: [{ name: 'request', wire: 'request', source: 'json', codec: recordCodec('keyPool-rename-request') }], result: resultCodec('keyPool-rename') },
      { id: 'dsh-provider-hub#keyPool/setActive', service: 'keyPool', namespace: 'keyPool', method: 'setActive', invocation: { kind: 'direct' }, parameters: [{ name: 'request', wire: 'request', source: 'json', codec: recordCodec('keyPool-setActive-request') }], result: resultCodec('keyPool-setActive') },
      { id: 'dsh-provider-hub#codexAccounts/list', service: 'codexAccounts', namespace: 'codexAccounts', method: 'list', invocation: { kind: 'direct' }, parameters: [], result: resultCodec('codexAccounts-list') },
      { id: 'dsh-provider-hub#codexAccounts/sources', service: 'codexAccounts', namespace: 'codexAccounts', method: 'sources', invocation: { kind: 'direct' }, parameters: [], result: resultCodec('codexAccounts-sources') },
      { id: 'dsh-provider-hub#codexAccounts/import', service: 'codexAccounts', namespace: 'codexAccounts', method: 'import', invocation: { kind: 'direct' }, parameters: [{ name: 'request', wire: 'request', source: 'json', codec: recordCodec('codexAccounts-import-request') }], result: resultCodec('codexAccounts-import') },
      { id: 'dsh-provider-hub#codexAccounts/drop', service: 'codexAccounts', namespace: 'codexAccounts', method: 'drop', invocation: { kind: 'direct' }, parameters: [{ name: 'request', wire: 'request', source: 'json', codec: recordCodec('codexAccounts-drop-request') }], result: resultCodec('codexAccounts-drop') },
      { id: 'dsh-provider-hub#codexAccounts/rename', service: 'codexAccounts', namespace: 'codexAccounts', method: 'rename', invocation: { kind: 'direct' }, parameters: [{ name: 'request', wire: 'request', source: 'json', codec: recordCodec('codexAccounts-rename-request') }], result: resultCodec('codexAccounts-rename') },
      { id: 'dsh-provider-hub#codexAccounts/setActive', service: 'codexAccounts', namespace: 'codexAccounts', method: 'setActive', invocation: { kind: 'direct' }, parameters: [{ name: 'request', wire: 'request', source: 'json', codec: recordCodec('codexAccounts-setActive-request') }], result: resultCodec('codexAccounts-setActive') },
    ],
  }
  const loader = window.__ModuleLoader__
  if (!loader || typeof loader.load !== 'function') return
  loader.load({
    id: 'dsh-provider-hub',
    factory: require => {
      const React = require('react')
      const e = React.createElement
      const { SettingsForm, SettingsFormModel, SettingsValueField, Switch } = require('@deepseek-ai/dsh-client-ui-primitives')
      const searchNamespace = 'dsh-provider-hub'
      // Dictionary namespace owned by this plugin (official locale pattern).
      const NS = 'settings.providerHub'
      const zh = {
        summary: '官方搜索始终保留；可独立附加 Codex 与 Z.AI 搜索增强，勾选 Codex / Z.AI 生图工具，并在登录卡查看 Codex 账号额度与用量历史。',
        enhancementsGroup: '附加搜索增强',
        providerOpenaiLabel: 'ChatGPT / Codex',
        providerOpenaiHint: '使用 Models 页面保存的 ChatGPT 账号授权。',
        providerZaiLabel: 'Z.AI',
        providerZaiHint: '使用已有 Z.AI API Key，无需另行登录。',
        enableProvider: '启用 {name} 搜索增强',
        baselineTitle: '官方搜索 · 始终保留',
        baselineHint: '默认增强路由中，每条查询都尝试原生 DeepSeek 搜索。仍需原有 API Key 或账号授权；缺凭据会真实报错，不代表已可用。',
        selectionAll: '官方 + Codex + Z.AI · 并行搜索',
        selectionOne: '官方 + {name} · 并行搜索',
        selectionNone: '仅官方搜索',
        selectionHintActive: '官方与已开启的增强同时查询，结果按 URL 去重、共用总上限。普通单路失败会明确提示并保留成功结果。',
        selectionHintIdle: '关闭全部增强只移除 Codex/Z.AI；官方搜索与原有鉴权保持不变。',
        limitLabel: '返回来源上限',
        limitHint: '一次搜索合并去重后最多返回多少条来源，对所有预设统一生效（官方默认 8）。200 即“搜到多少给多少”；新会话生效。',
        limitInvalid: '请填 1–1000 的整数；留空恢复默认 200。',
        quotaGroup: 'Codex 额度记录',
        imageGroup: '生图工具',
        imageCodexLabel: 'ChatGPT / Codex',
        imageCodexHint: '沿用 Models 页面保存的账号授权；是否可用由实际账号权限决定。默认开启。',
        imageZaiLabel: 'Z.AI（国际）',
        imageZaiHint: '使用已有国际 API Key；标准生图 API 独立计费，不属于 Coding Plan 搜索/视觉额度。',
        imageCnLabel: '智谱（国内）',
        imageCnHint: '使用已有国内 API Key；标准生图 API 独立计费，不属于 Coding Plan 搜索/视觉额度。',
        enableImageProvider: '启用 {name} 生图工具',
        imageSelectionAll: '已启用生图：{names}',
        imageSelectionNone: '已关闭全部生图工具',
        imageHintActive: '多个开关只是可选工具，一次调用只用一个；仅当你要求多提供方结果时才分别调用，不会自动群发。',
        imageHintIdle: '不提供生图工具，不自动回退到未启用的后端。',
        noteImage: '生图仅文生图；比例只是提示——端点按固定像素预算出图、可能按内容改写比例（明显偏离会在结果中警告），无法指定分辨率与质量。取消或超时可能已消耗额度，不自动重试。',
        quotaRecordTitle: '每小时自动记录',
        quotaRecordHint: 'DSH 运行期间在后台只读查询 Codex 账号额度并保存历史；登录卡打开或点刷新时也会即时查询。',
        quotaRecordEnable: '启用每小时额度记录',
        intervalLabel: '记录间隔（分钟）',
        intervalHint: '两次后台查询的间隔，15–1440。',
        intervalInvalid: '请填 15–1440 的整数；留空恢复默认 60。',
        retentionLabel: '历史保留（天）',
        retentionHint: '超过保留期的记录点会在整理时删除，7–3650。',
        retentionInvalid: '请填 7–3650 的整数；留空恢复默认 180。',
        overridden: '已覆盖',
        reset: '恢复默认',
        noteEffect: '一次保存，对所有已有 web_search 的模式和现有会话后续搜索全局生效；取消、超时或全部后端失败时不返回部分结果。完成后在原生搜索调用栏展开带来源标记的链接，不显示后端原始长摘要。',
        noteOverride: 'DSH_WEB_SEARCH_PROVIDER 或显式 web.searchProvider 运维配置可能覆盖以上开关。',
        discard: '放弃修改',
        unavailable: '搜索路由插件当前未加载，暂时无法配置。',
        readOnly: '当前连接不允许保存 Host 设置，请在本机 WebUI 或部署配置中修改。',
        saveFailed: '保存未被接受，已保留草稿；请检查其他页面或运维配置是否已修改设置。',
        save: '保存',
        saving: '保存中…',
        quotaAria: 'Codex 账号额度',
        quotaTitle: '账号额度',
        quotaLoading: '查询中…',
        quotaRefresh: '刷新',
        quotaWindow: '额度窗口',
        quotaWindowWeekly: '周窗口',
        quotaWindowShort: '短窗口',
        quotaWindowDays: '{n} 天窗口',
        quotaWindowHours: '{n} 小时窗口',
        ageNow: '刚刚更新',
        ageMinutes: '{n} 分钟前更新',
        ageHours: '{n} 小时前更新',
        ageDays: '{n} 天前更新',
        resetStamp: '重置 {stamp}',
        resetStampSoon: '重置 {stamp}（{span}后）',
        expiresStamp: '{stamp} 到期（{span}后）',
        expiredStamp: '{stamp} 已过期',
        spanDays: '{n} 天',
        spanHours: '{n} 小时',
        spanMinutes: '{n} 分钟',
        windowUsage: '已用 {used}% · 剩余 {left}%',
        windowUsageAria: '{window}已用百分比',
        creditsBalance: '积分 {n}',
        creditsUnlimited: '积分不限量',
        resetCredits: '可重置 {n} 次',
        resetCreditTitle: '额度重置',
        noticeExpired: '令牌可能已过期——在 DSH 发送一次对话即可自动刷新，随后点刷新重试。',
        noticeUnsupported: '上游额度响应格式已变化，暂无法解析；请关注插件更新。',
        noticeNetwork: '额度查询失败，请检查网络连接。',
        noticeEmpty: '暂无额度数据。',
        historyTitle: '用量历史（每小时记录一次）',
        historyRange: '历史范围',
        range24: '24 小时',
        range168: '7 天',
        range720: '30 天',
        historyEmpty: '暂无历史记录；开启每小时记录后，下一个记录点起可查看曲线。',
        sparkAria: '用量趋势',
        loginAria: 'ChatGPT / Codex 账号授权',
        statusOtherSurface: '其他页面正在授权',
        statusCancelling: '正在取消',
        statusConfirming: '等待你的确认',
        statusWaiting: '等待授权完成',
        statusFailed: '授权失败',
        statusCancelled: '已取消授权',
        statusAuthorized: '已登录',
        statusSignedOut: '未登录',
        loginFailed: '登录失败',
        actionBusy: '授权进行中…',
        actionRelogin: '重新登录',
        actionLogin: '使用 ChatGPT 登录',
        actionCancelling: '正在取消…',
        actionCancel: '取消授权',
        loginHint: '沿用 DSH 已保存的账号授权，搜索不需要另外填写凭据。',
        otherSurfaceNote: '其他页面正在登录。请先在那里完成或取消授权。',
        openAuthPage: '打开授权页面 ↗',
        openConsole: '打开控制台 ↗',
        authCode: '授权代码 ',
        confirmAria: '确认 ChatGPT 授权',
        submit: '提交确认',
        errorReadState: '无法读取登录状态',
        errorReadStatus: '无法读取授权进度',
        errorAnswer: '无法发送确认',
        errorCancel: '无法取消授权',
        quotaActiveKey: '当前生效 Key',
        quotaKeyHint: '额度与历史按 Key 分别记录；切换生效 Key 后，对话、搜索与额度查询立即使用新的凭据。',
        poolGroup: 'Key 池',
        poolHint: '为该 provider 存放多把命名 API Key（秘密只保存在 DSH 凭据库），随时切换实际生效的那把。',
        poolEntryActive: '当前生效',
        poolActionUse: '设为当前',
        poolActionRemove: '删除',
        poolActionDetails: '额度详情',
        poolNameLabel: 'Key 名称',
        poolNamePlaceholder: '例如 zai-gsj',
        poolValueLabel: 'API Key',
        poolValuePlaceholder: '粘贴 API Key',
        poolAdd: '添加到 Key 池',
        poolAdding: '添加中…',
        poolEmpty: 'Key 池为空；添加后可统预览每把 Key 的额度并随时切换。',
        poolErrorAdd: '添加失败',
        poolErrorRemove: '删除失败',
        poolErrorSwitch: '切换失败',
        poolSwitched: '已切换生效 Key',
        poolAdded: '已添加到 Key 池',
        poolSelectLabel: '选择 Key',
        poolSelectActive: '{name}（当前生效）',
        poolActionRename: '重命名',
        poolRenameLabel: '新名称',
        poolRenameSave: '保存名称',
        poolRenameCancel: '取消',
        poolErrorRename: '重命名失败',
        poolRenamed: '已重命名 Key',
        poolRemoved: '已删除 Key',
        foldQuotaPool: '{name} · 额度与 Key 池',
        foldCodexAccounts: '账号额度与 Codex 账号池',
        codexAccountsGroup: 'Codex 账号',
        codexAccountsCurrent: '当前账号：{email}',
        codexAccountsCurrentNone: '当前账号：未登录',
        codexAccountsNone: '账号池为空；从下面的 Codex CLI 目录导入登录态即可。',
        codexAccountsSelectLabel: '选择账号',
        codexAccountsImportEntry: '＋ 从 Codex CLI 导入…',
        codexAccountActionUse: '设为当前账号',
        codexAccountActionDetails: '额度详情',
        codexAccountActionRemove: '删除账号',
        codexAccountErrorSwitch: '切换账号失败',
        codexAccountErrorRemove: '删除账号失败',
        codexAccountErrorRename: '重命名失败',
        codexAccountRenamed: '已重命名账号',
        codexAccountSwitched: '已切换当前账号',
        codexAccountRemoved: '已删除账号',
        codexImportSourceLabel: 'CLI 目录',
        codexImportSourceCodex: 'codex（全局 ~/.codex）',
        codexImportSourceGth: 'codex-gth（cc-switch 启动目录）',
        codexImportNameLabel: '账号名称（可留空，默认用邮箱）',
        codexImportNamePlaceholder: '例如 vickie',
        codexImportSubmit: '导入登录态',
        codexImportHint: '不点登录，直接把 Codex CLI 已有的登录态搬进账号池；切换账号即改写 DSH 的 openai-codex 凭据。',
        codexImportUnavailable: '该目录暂无可用登录态',
        codexImportBusy: '导入中…',
        codexImportError: '导入失败',
        sparkTip: '{stamp} · 已用 {used}%',
        planChangeTitle: '订阅变化：{from} → {to}',
        teamGroup: 'Z.AI 团队版额度查询',
        teamOrgLabel: '组织 ID（Bigmodel-Organization）',
        teamOrgHint: '团队版 key 查询额度需要；个人版留空。',
        teamProjectLabel: '项目 ID（Bigmodel-Project）',
        teamProjectHint: '与组织 ID 配对填写，缺一不生效。',
        teamInvalid: '可选文本；填写时组织与项目需成对。',
      }
      const en = {
        summary: 'Official search is always on; add Codex and Z.AI enhancements independently, toggle the Codex / Z.AI image tools, and review the Codex account quota and usage history on the login card.',
        enhancementsGroup: 'Search enhancements',
        providerOpenaiLabel: 'ChatGPT / Codex',
        providerOpenaiHint: 'Uses the ChatGPT account saved on the Models page.',
        providerZaiLabel: 'Z.AI',
        providerZaiHint: 'Uses an existing Z.AI API key; no extra sign-in.',
        enableProvider: 'Enable the {name} search enhancement',
        baselineTitle: 'Official search · always on',
        baselineHint: 'Every query also tries native DeepSeek search. It still needs the original API key or account authorization; missing credentials fail loudly and do not imply availability.',
        selectionAll: 'Official + Codex + Z.AI · parallel search',
        selectionOne: 'Official + {name} · parallel search',
        selectionNone: 'Official search only',
        selectionHintActive: 'Official search runs together with the enabled enhancements; results are deduplicated by URL and share one cap. A single failing route is reported while successful results are kept.',
        selectionHintIdle: 'Turning off every enhancement removes only Codex/Z.AI; official search and its authorization stay unchanged.',
        limitLabel: 'Source limit',
        limitHint: 'How many merged, deduplicated sources one search may return, uniformly across every preset (official default 8). 200 means “return whatever was found”; new sessions pick it up.',
        limitInvalid: 'Enter a whole number 1–1000; leave blank for the default 200.',
        quotaGroup: 'Codex quota recording',
        imageGroup: 'Image tools',
        imageCodexLabel: 'ChatGPT / Codex',
        imageCodexHint: 'Reuses the account saved on the Models page; availability depends on the actual account. On by default.',
        imageZaiLabel: 'Z.AI (international)',
        imageZaiHint: 'Uses the existing international API key; the standard image API bills separately and is not covered by Coding Plan search/vision quota.',
        imageCnLabel: 'Zhipu (domestic)',
        imageCnHint: 'Uses the existing domestic API key; the standard image API bills separately and is not covered by Coding Plan search/vision quota.',
        enableImageProvider: 'Enable the {name} image tool',
        imageSelectionAll: 'Image tools on: {names}',
        imageSelectionNone: 'All image tools are off',
        imageHintActive: 'Enabled tools are alternatives: one call uses one tool. They are invoked separately only when you ask for multiple providers; never an automatic batch.',
        imageHintIdle: 'No image tool is provided; there is no fallback to an unselected backend.',
        noteImage: 'Image tools are text-to-image only; the aspect ratio is a hint — the endpoint generates within a fixed pixel budget and may rewrite the ratio by content (visible drift is warned in the result). Resolution and quality cannot be selected. Cancel or timeout may already have consumed quota; nothing is retried automatically.',
        quotaRecordTitle: 'Record hourly',
        quotaRecordHint: 'While DSH runs, the background queries the Codex account quota read-only and keeps history; opening the login card or refreshing also queries on demand.',
        quotaRecordEnable: 'Enable hourly quota recording',
        intervalLabel: 'Interval (minutes)',
        intervalHint: 'Gap between background queries, 15–1440.',
        intervalInvalid: 'Enter a whole number 15–1440; leave blank for the default 60.',
        retentionLabel: 'History retention (days)',
        retentionHint: 'Record points past the retention window are pruned, 7–3650.',
        retentionInvalid: 'Enter a whole number 7–3650; leave blank for the default 180.',
        overridden: 'Overridden',
        reset: 'Reset to default',
        noteEffect: 'One save applies to every mode with web_search and to later searches in running sessions; cancellation, timeout, or all routes failing returns no partial results. Links with source tags expand in the native search call row; long raw backend snippets are not shown.',
        noteOverride: 'DSH_WEB_SEARCH_PROVIDER or an explicit web.searchProvider deployment setting may override these switches.',
        discard: 'Discard changes',
        unavailable: 'The search router plugin is not loaded, so it cannot be configured right now.',
        readOnly: 'This connection cannot save Host settings; change them in the local WebUI or deployment configuration.',
        saveFailed: 'The save was not accepted and the draft was kept; check whether another page or operations config changed these settings.',
        save: 'Save',
        saving: 'Saving…',
        quotaAria: 'Codex account quota',
        quotaTitle: 'Account quota',
        quotaLoading: 'Loading…',
        quotaRefresh: 'Refresh',
        quotaWindow: 'Quota window',
        quotaWindowWeekly: 'Weekly window',
        quotaWindowShort: 'Short window',
        quotaWindowDays: '{n}-day window',
        quotaWindowHours: '{n}-hour window',
        ageNow: 'Just updated',
        ageMinutes: 'Updated {n} min ago',
        ageHours: 'Updated {n} h ago',
        ageDays: 'Updated {n} d ago',
        resetStamp: 'Resets {stamp}',
        resetStampSoon: 'Resets {stamp} (in {span})',
        expiresStamp: 'Expires {stamp} (in {span})',
        expiredStamp: 'Expired {stamp}',
        spanDays: '{n}d',
        spanHours: '{n}h',
        spanMinutes: '{n}m',
        windowUsage: 'Used {used}% · {left}% left',
        windowUsageAria: '{window} usage percent',
        creditsBalance: 'Credits {n}',
        creditsUnlimited: 'Unlimited credits',
        resetCredits: '{n} resets available',
        resetCreditTitle: 'Quota reset',
        noticeExpired: 'The token may have expired — send one conversation in DSH to refresh it automatically, then retry.',
        noticeUnsupported: 'The upstream quota response changed shape and cannot be parsed yet; watch for plugin updates.',
        noticeNetwork: 'Quota query failed. Check your network connection.',
        noticeEmpty: 'No quota data yet.',
        historyTitle: 'Usage history (hourly samples)',
        historyRange: 'History range',
        range24: '24 hours',
        range168: '7 days',
        range720: '30 days',
        historyEmpty: 'No history yet; once hourly recording is on, the curve appears from the next sample.',
        sparkAria: 'Usage trend',
        loginAria: 'ChatGPT / Codex account authorization',
        statusOtherSurface: 'Authorizing on another page',
        statusCancelling: 'Cancelling',
        statusConfirming: 'Waiting for your confirmation',
        statusWaiting: 'Waiting for authorization',
        statusFailed: 'Authorization failed',
        statusCancelled: 'Authorization cancelled',
        statusAuthorized: 'Signed in',
        statusSignedOut: 'Not signed in',
        loginFailed: 'Login failed',
        actionBusy: 'Authorizing…',
        actionRelogin: 'Sign in again',
        actionLogin: 'Sign in with ChatGPT',
        actionCancelling: 'Cancelling…',
        actionCancel: 'Cancel authorization',
        loginHint: 'Reuses the account authorization saved in DSH; search needs no extra credentials.',
        otherSurfaceNote: 'Another page is signing in. Finish or cancel the authorization there first.',
        openAuthPage: 'Open the authorization page ↗',
        openConsole: 'Open the console ↗',
        authCode: 'Authorization code ',
        confirmAria: 'Confirm ChatGPT authorization',
        submit: 'Submit',
        errorReadState: 'Unable to read login state',
        errorReadStatus: 'Unable to read authorization progress',
        errorAnswer: 'Unable to send the answer',
        errorCancel: 'Unable to cancel the authorization',
        quotaActiveKey: 'Active key',
        quotaKeyHint: 'Quota and history are recorded per key; switching the active key changes what conversations, search and quota queries use.',
        poolGroup: 'Key pool',
        poolHint: 'Keep several named API keys for this provider (secrets stay in the DSH credential store) and switch the one in effect anytime.',
        poolEntryActive: 'Active',
        poolActionUse: 'Make active',
        poolActionRemove: 'Remove',
        poolActionDetails: 'Quota details',
        poolNameLabel: 'Key name',
        poolNamePlaceholder: 'e.g. zai-gsj',
        poolValueLabel: 'API key',
        poolValuePlaceholder: 'Paste an API key',
        poolAdd: 'Add to key pool',
        poolAdding: 'Adding…',
        poolEmpty: 'The key pool is empty; add keys to preview every key’s quota and switch anytime.',
        poolErrorAdd: 'Unable to add the key',
        poolErrorRemove: 'Unable to remove the key',
        poolErrorSwitch: 'Unable to switch the key',
        poolSwitched: 'Active key switched',
        poolAdded: 'Added to the key pool',
        poolSelectLabel: 'Select key',
        poolSelectActive: '{name} (active)',
        poolActionRename: 'Rename',
        poolRenameLabel: 'New name',
        poolRenameSave: 'Save name',
        poolRenameCancel: 'Cancel',
        poolErrorRename: 'Unable to rename the key',
        poolRenamed: 'Key renamed',
        poolRemoved: 'Key removed',
        foldQuotaPool: '{name} · quota & key pool',
        foldCodexAccounts: 'Account quota & Codex account pool',
        codexAccountsGroup: 'Codex accounts',
        codexAccountsCurrent: 'Current account: {email}',
        codexAccountsCurrentNone: 'Current account: not signed in',
        codexAccountsNone: 'The account pool is empty; import a Codex CLI login state below.',
        codexAccountsSelectLabel: 'Select account',
        codexAccountsImportEntry: '+ Import from Codex CLI…',
        codexAccountActionUse: 'Make current',
        codexAccountActionDetails: 'Quota details',
        codexAccountActionRemove: 'Remove account',
        codexAccountErrorSwitch: 'Unable to switch the account',
        codexAccountErrorRemove: 'Unable to remove the account',
        codexAccountErrorRename: 'Unable to rename the account',
        codexAccountRenamed: 'Account renamed',
        codexAccountSwitched: 'Current account switched',
        codexAccountRemoved: 'Account removed',
        codexImportSourceLabel: 'CLI directory',
        codexImportSourceCodex: 'codex (global ~/.codex)',
        codexImportSourceGth: 'codex-gth (cc-switch launch dir)',
        codexImportNameLabel: 'Account name (optional, defaults to the email)',
        codexImportNamePlaceholder: 'e.g. vickie',
        codexImportSubmit: 'Import login state',
        codexImportHint: 'No sign-in click: carry an existing Codex CLI login state into the pool; switching an account rewrites the DSH openai-codex credential.',
        codexImportUnavailable: 'no usable login state in this directory',
        codexImportBusy: 'Importing…',
        codexImportError: 'Unable to import',
        sparkTip: '{stamp} · {used}% used',
        planChangeTitle: 'Plan change: {from} → {to}',
        teamGroup: 'Z.AI team quota query',
        teamOrgLabel: 'Organization ID (Bigmodel-Organization)',
        teamOrgHint: 'Needed for team-key quota queries; leave blank for personal keys.',
        teamProjectLabel: 'Project ID (Bigmodel-Project)',
        teamProjectHint: 'Pairs with the organization ID; one without the other is ignored.',
        teamInvalid: 'Optional text; when filled, organization and project must pair.',
      }
      // Locale reader, rebound to the registered bundle when the plugin mounts.
      let t = key => key
      const uiCss = `
        .provider-hub-ui { color:var(--dsw-alias-label-primary); font-size:13px; line-height:1.6; min-width:0 }
        .provider-hub-ui * { box-sizing:border-box }
        .provider-hub-ui .ph-muted { margin:0; color:var(--dsw-alias-label-tertiary); font-size:12px }
        .provider-hub-ui .ph-heading { margin:0; font-size:13px; font-weight:600; line-height:1.5; color:var(--dsw-alias-label-secondary) }
        .provider-hub-ui .ph-actions { display:flex; align-items:center; flex-wrap:wrap; gap:8px }
        .provider-hub-ui .ph-button { display:inline-flex; align-items:center; justify-content:center; min-height:34px; padding:5px 12px; border:.5px solid var(--dsw-alias-border-l3); border-radius:var(--dsw-radius-md,8px); background:transparent; color:inherit; font:inherit; font-weight:500; cursor:pointer; text-decoration:none; transition:background 120ms ease,border-color 120ms ease }
        .provider-hub-ui .ph-button:hover:not(:disabled) { background:var(--dsw-alias-interactive-bg-hover) }
        .provider-hub-ui .ph-button.ph-primary { border-color:transparent; background:var(--dsw-alias-button-primary-fill); color:var(--dsw-alias-label-primary-foreground) }
        .provider-hub-ui .ph-button.ph-primary:hover:not(:disabled) { background:var(--dsw-alias-button-primary-hover) }
        .provider-hub-ui .ph-button:disabled { opacity:.45; cursor:not-allowed }
        .provider-hub-ui :is(button,a,input,select):focus-visible { outline:var(--dsw-focus-ring-width,2px) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary)); outline-offset:3px }
        .provider-hub-ui .ph-switches { margin:0; padding:0; border:0; display:flex; flex-direction:column }
        .provider-hub-ui .ph-switches > legend { padding:0; margin-bottom:2px }
        .provider-hub-ui .ph-row { display:flex; align-items:center; justify-content:space-between; gap:20px; padding:10px 0; border-bottom:.5px solid var(--dsw-alias-border-l3) }
        .provider-hub-ui .ph-row:last-of-type { border-bottom:0 }
        .provider-hub-ui .ph-row-copy { display:flex; flex-direction:column; gap:2px; min-width:0 }
        .provider-hub-ui .ph-row-title { font-size:13px; font-weight:500 }
        .provider-hub-ui .ph-selection { padding:12px 0; display:flex; flex-direction:column; gap:3px }
        .provider-hub-ui .ph-selection-title { margin:0; font-weight:500 }
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
        .provider-hub-ui .ph-credit-list { display:flex; flex-direction:column; gap:2px }
        .provider-hub-ui .ph-credit-row { display:flex; align-items:baseline; justify-content:space-between; gap:12px; color:var(--dsw-alias-label-tertiary); font-size:12px }
        .provider-hub-ui .ph-spark-block { display:flex; flex-direction:column; gap:3px }
        .provider-hub-ui .ph-spark-wrap { display:flex; align-items:center; gap:8px }
        .provider-hub-ui .ph-spark-chart { position:relative; flex:1; min-width:0; height:36px }
        .provider-hub-ui .ph-spark { width:100%; height:36px; color:var(--dsw-alias-label-secondary) }
        .provider-hub-ui .ph-spark-fill { fill:currentColor; opacity:.14 }
        .provider-hub-ui .ph-spark-hit { fill:transparent }
        .provider-hub-ui .ph-spark-plan { stroke:currentColor; opacity:.45 }
        .provider-hub-ui .ph-spark-tip { position:absolute; bottom:calc(100% + 6px); transform:translateX(-50%); padding:3px 8px; border:.5px solid var(--dsw-alias-border-l3); border-radius:var(--dsw-radius-sm,6px); background:var(--dsw-alias-bg-layer-2,var(--dsw-alias-bg-layer-1)); color:var(--dsw-alias-label-primary); font-size:11px; font-variant-numeric:tabular-nums; white-space:nowrap; pointer-events:none; z-index:1 }
        .provider-hub-ui .ph-spark-cap { flex:none; width:34px; color:var(--dsw-alias-label-secondary); font-size:11px; font-variant-numeric:tabular-nums }
        .provider-hub-ui .ph-spark-cap[data-quota-spark-cap="end"] { text-align:right }
        .provider-hub-ui .ph-spark-axis { display:flex; margin:0 42px; padding-top:4px; border-top:1px solid var(--dsw-alias-border, rgba(128,128,128,.3)); color:var(--dsw-alias-label-tertiary); font-size:10px; font-variant-numeric:tabular-nums }
        .provider-hub-ui .ph-spark-axis > span { flex:1; white-space:nowrap }
        .provider-hub-ui .ph-spark-axis > span:nth-child(2) { text-align:center }
        .provider-hub-ui .ph-spark-axis > span:nth-child(3) { text-align:right }
        .provider-hub-ui .ph-fold { border:.5px solid var(--dsw-alias-border-l3); border-radius:var(--dsw-radius-md,8px); background:var(--dsw-alias-bg-layer-1) }
        .provider-hub-ui .ph-fold > summary { display:flex; align-items:center; gap:8px; padding:10px 12px; cursor:pointer; font-weight:600; font-size:13px; list-style:none; user-select:none }
        .provider-hub-ui .ph-fold > summary::-webkit-details-marker { display:none }
        .provider-hub-ui .ph-fold > summary:before { content:'▸'; flex:none; color:var(--dsw-alias-label-tertiary); font-size:11px; transition:transform 120ms ease }
        .provider-hub-ui .ph-fold[data-fold-open="true"] > summary:before { transform:rotate(90deg) }
        .provider-hub-ui .ph-fold[open] > summary { border-bottom:.5px solid var(--dsw-alias-border-l3) }
        .provider-hub-ui .ph-fold-body { display:flex; flex-direction:column; gap:10px; padding:10px 12px 12px }
        .provider-hub-ui .ph-pool-bar { display:flex; align-items:center; flex-wrap:wrap; gap:8px }
        .provider-hub-ui .ph-pool-bar > select { flex:1 1 200px }
        .provider-hub-ui .ph-pool-rename { display:flex; align-items:flex-end; flex-wrap:wrap; gap:8px }
        .provider-hub-ui .ph-pool-rename > .ph-answer-label { flex:1 1 160px }
        .provider-hub-ui .ph-ranges { display:flex; gap:4px }
        .provider-hub-ui .ph-range { min-height:26px; padding:2px 10px; font-size:12px }
        .provider-hub-ui .ph-range[aria-pressed="true"] { border-color:var(--dsw-alias-brand-primary); color:var(--dsw-alias-brand-primary) }
        .provider-hub-ui .ph-quota-notice { margin:0; padding-left:12px; border-left:2px solid var(--dsw-alias-border-l3); color:var(--dsw-alias-label-tertiary); font-size:12px; overflow-wrap:anywhere; display:flex; flex-direction:column; align-items:flex-start; gap:8px }
        .provider-hub-ui .ph-quota-notice p { margin:0 }
        .provider-hub-ui .ph-quota-notice[data-tone=warn] { border-left-color:var(--dsw-alias-state-warning-primary,var(--dsw-alias-state-business-primary)); color:var(--dsw-alias-label-primary) }
        .provider-hub-ui .ph-notes { display:flex; flex-direction:column; gap:4px; margin:12px 0 0; padding-left:12px; border-left:2px solid var(--dsw-alias-border-l3) }
        @media (max-width:480px) { .provider-hub-ui .ph-login-head { flex-direction:column; align-items:stretch } .provider-hub-ui .ph-login-head>.ph-actions { width:100% } .provider-hub-ui .ph-login-head>.ph-actions>.ph-primary { flex:1 } .provider-hub-ui .ph-answer>.ph-button { width:100% } }
        @media (prefers-reduced-motion:reduce) { .provider-hub-ui .ph-button { transition:none } }
      `
      const searchProviders = [
        { id: 'openai-codex', labelKey: 'providerOpenaiLabel', hintKey: 'providerOpenaiHint', short: 'Codex' },
        { id: 'zai', labelKey: 'providerZaiLabel', hintKey: 'providerZaiHint', short: 'Z.AI' },
      ]
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
      const imageToolProviders = [
        { id: 'openai-codex', labelKey: 'imageCodexLabel', hintKey: 'imageCodexHint', short: 'Codex' },
        { id: 'zai', labelKey: 'imageZaiLabel', hintKey: 'imageZaiHint', short: 'Z.AI' },
        { id: 'zai-cn', labelKey: 'imageCnLabel', hintKey: 'imageCnHint', short: 'Zhipu' },
      ]
      const readImageSelection = text => {
        try {
          const value = JSON.parse(text)
          if (!Array.isArray(value) || value.some(id => !imageToolProviders.some(provider => provider.id === id))) return undefined
          return imageToolProviders.filter(provider => value.includes(provider.id)).map(provider => provider.id)
        } catch { return undefined }
      }
      const imageProviderField = {
        field: 'imageProviders',
        // A missing composition field inherits the schema default (Codex only);
        // [] is an explicit all-off choice, never silently re-enabled.
        format: value => JSON.stringify(value === undefined ? ['openai-codex'] : Array.isArray(value) ? value : []),
        parse: text => { const value = readImageSelection(text); return value === undefined ? undefined : { kind: 'set', value } },
      }
      const booleanField = field => ({
        field,
        format: value => (value === false ? 'false' : 'true'),
        parse: text => (text === 'true' || text === 'false' ? { kind: 'set', value: text === 'true' } : undefined),
      })
      const integerField = (field, min, max, fallback) => ({
        field,
        format: value => { const n = Number(value); return Number.isInteger(n) && n >= min && n <= max ? String(n) : String(fallback) },
        // Official staged semantics: an empty draft clears the override back to
        // the composition value; out-of-range drafts stage as invalid.
        parse: text => {
          const trimmed = text.trim()
          if (trimmed === '') return { kind: 'clear' }
          const n = Number(trimmed)
          return Number.isInteger(n) && n >= min && n <= max ? { kind: 'set', value: n } : undefined
        },
      })
      const textField = field => ({
        field,
        format: value => (typeof value === 'string' ? value : ''),
        // Official staged semantics: an empty draft clears the override back to
        // the composition value; any trimmed text stages as the new value.
        parse: text => (text.trim() === '' ? { kind: 'clear' } : { kind: 'set', value: text.trim().slice(0, 128) }),
      })
      const quotaFields = [booleanField('quotaRecord'), integerField('quotaIntervalMinutes', 15, 1440, 60), integerField('quotaHistoryDays', 7, 3650, 180), textField('zaiTeamOrganization'), textField('zaiTeamProject')]
      const resultLimitField = integerField('searchMaxResults', 1, 1000, 200)
      function SearchProviderCard(props) {
        const state = props.useSearchProviderCard(snapshot => snapshot)
        if (props.view === 'summary') return t('summary')
        const disabled = !state.writable || state.saving
        const field = state.searchProviders
        const selected = readSelection(field.text) ?? []
        const recordSelected = state.quotaRecord?.text !== 'false'
        const toggle = (id, checked) => props.edit('searchProviders', JSON.stringify(searchProviders.filter(provider => provider.id === id ? checked : selected.includes(provider.id)).map(provider => provider.id)))
        const imageSelected = readImageSelection(state.imageProviders?.text) ?? []
        const toggleImage = (id, checked) => props.edit('imageProviders', JSON.stringify(imageToolProviders.filter(provider => provider.id === id ? checked : imageSelected.includes(provider.id)).map(provider => provider.id)))
        const imageSelectionTitle = imageSelected.length ? t('imageSelectionAll', { names: imageToolProviders.filter(provider => imageSelected.includes(provider.id)).map(provider => provider.short).join('、') }) : t('imageSelectionNone')
        const imageSelectionHint = imageSelected.length ? t('imageHintActive') : t('imageHintIdle')
        const selectionTitle = selected.length === 2 ? t('selectionAll') : selected.length === 1 ? t('selectionOne', { name: searchProviders.find(provider => provider.id === selected[0]).short }) : t('selectionNone')
        const selectionHint = selected.length > 0 ? t('selectionHintActive') : t('selectionHintIdle')
        return e(SettingsForm, {
          state,
          labels: {
            unavailable: t('unavailable'),
            readOnly: t('readOnly'),
            saveFailed: t('saveFailed'),
            save: t('save'),
            saving: t('saving'),
          },
          onSave: props.save,
          onDiscard: props.discard,
        },
        e('div', { 'data-provider-hub-settings': true, className: 'provider-hub-ui' },
          e('div', { className: 'ph-selection', 'data-search-baseline': 'deepseek-official' },
            e('p', { className: 'ph-selection-title' }, t('baselineTitle')),
            e('p', { className: 'ph-muted' }, t('baselineHint')),
          ),
          e('fieldset', { className: 'ph-switches', disabled, 'aria-describedby': 'provider-hub-selection-hint' },
            e('legend', { className: 'ph-heading' }, t('enhancementsGroup')),
            ...searchProviders.map(provider => e('div', { key: provider.id, className: 'ph-row', 'data-search-provider': provider.id },
              e('span', { className: 'ph-row-copy' }, e('span', { className: 'ph-row-title' }, t(provider.labelKey)), e('span', { className: 'ph-muted' }, t(provider.hintKey))),
              e(Switch, {
                checked: selected.includes(provider.id),
                disabled,
                label: t('enableProvider', { name: t(provider.labelKey) }),
                onChange: checked => toggle(provider.id, checked),
              }),
            )),
            e('p', { id: 'provider-hub-selection-hint', className: 'ph-muted' }, selectionHint),
          ),
          e(SettingsValueField, {
            id: 'provider-hub-result-limit',
            label: t('limitLabel'),
            hint: t('limitHint'),
            overriddenLabel: t('overridden'),
            resetLabel: t('reset'),
            invalidLabel: t('limitInvalid'),
            numeric: true,
            disabled,
            ...state.searchMaxResults,
            onEdit: text => props.edit('searchMaxResults', text),
            onReset: () => props.resetField('searchMaxResults'),
          }),
          e('fieldset', { className: 'ph-switches', disabled },
            e('legend', { className: 'ph-heading' }, t('quotaGroup')),
            e('div', { className: 'ph-row', 'data-quota-record': true },
              e('span', { className: 'ph-row-copy' }, e('span', { className: 'ph-row-title' }, t('quotaRecordTitle')), e('span', { className: 'ph-muted' }, t('quotaRecordHint'))),
              e(Switch, {
                checked: recordSelected,
                disabled,
                label: t('quotaRecordEnable'),
                onChange: checked => props.edit('quotaRecord', String(checked)),
              }),
            ),
            e(SettingsValueField, {
              id: 'provider-hub-quota-interval',
              label: t('intervalLabel'),
              hint: t('intervalHint'),
              overriddenLabel: t('overridden'),
              resetLabel: t('reset'),
              invalidLabel: t('intervalInvalid'),
              numeric: true,
              disabled,
              ...state.quotaIntervalMinutes,
              onEdit: text => props.edit('quotaIntervalMinutes', text),
              onReset: () => props.resetField('quotaIntervalMinutes'),
            }),
            e(SettingsValueField, {
              id: 'provider-hub-quota-retention',
              label: t('retentionLabel'),
              hint: t('retentionHint'),
              overriddenLabel: t('overridden'),
              resetLabel: t('reset'),
              invalidLabel: t('retentionInvalid'),
              numeric: true,
              disabled,
              ...state.quotaHistoryDays,
              onEdit: text => props.edit('quotaHistoryDays', text),
              onReset: () => props.resetField('quotaHistoryDays'),
            }),
          ),
          e('fieldset', { className: 'ph-switches', disabled },
            e('legend', { className: 'ph-heading' }, t('teamGroup')),
            e(SettingsValueField, {
              id: 'provider-hub-zai-team-org',
              label: t('teamOrgLabel'),
              hint: t('teamOrgHint'),
              overriddenLabel: t('overridden'),
              resetLabel: t('reset'),
              invalidLabel: t('teamInvalid'),
              disabled,
              ...state.zaiTeamOrganization,
              onEdit: text => props.edit('zaiTeamOrganization', text),
              onReset: () => props.resetField('zaiTeamOrganization'),
            }),
            e(SettingsValueField, {
              id: 'provider-hub-zai-team-project',
              label: t('teamProjectLabel'),
              hint: t('teamProjectHint'),
              overriddenLabel: t('overridden'),
              resetLabel: t('reset'),
              invalidLabel: t('teamInvalid'),
              disabled,
              ...state.zaiTeamProject,
              onEdit: text => props.edit('zaiTeamProject', text),
              onReset: () => props.resetField('zaiTeamProject'),
            }),
          ),
          e('fieldset', { className: 'ph-switches', disabled, 'aria-describedby': 'provider-hub-image-hint' },
            e('legend', { className: 'ph-heading' }, t('imageGroup')),
            ...imageToolProviders.map(provider => e('div', { key: provider.id, className: 'ph-row', 'data-image-provider': provider.id },
              e('span', { className: 'ph-row-copy' }, e('span', { className: 'ph-row-title' }, t(provider.labelKey)), e('span', { className: 'ph-muted' }, t(provider.hintKey))),
              e(Switch, {
                checked: imageSelected.includes(provider.id),
                disabled,
                label: t('enableImageProvider', { name: t(provider.labelKey) }),
                onChange: checked => toggleImage(provider.id, checked),
              }),
            )),
            e('p', { id: 'provider-hub-image-hint', className: 'ph-muted' }, imageSelectionHint),
          ),
          e('div', { className: 'ph-selection', 'data-image-selection': imageSelected.join(',') || 'none', 'aria-live': 'polite' },
            e('p', { className: 'ph-selection-title' }, imageSelectionTitle),
            state.imageProviders?.overridden ? e('button', { className: 'ph-button', type: 'button', disabled, 'data-image-action': 'reset', onClick: () => props.resetField('imageProviders') }, t('reset')) : null,
          ),
          e('div', { className: 'ph-selection', 'data-search-selection': selected.join(',') || 'deepseek-official', 'aria-live': 'polite' },
            e('p', { className: 'ph-selection-title' }, selectionTitle),
          ),
          e('div', { className: 'ph-notes' },
            e('p', { className: 'ph-muted' }, t('noteEffect')),
            e('p', { className: 'ph-muted' }, t('noteOverride')),
            e('p', { className: 'ph-muted' }, t('noteImage')),
          ),
          e('div', { className: 'ph-actions' },
            field.overridden ? e('button', { className: 'ph-button', type: 'button', disabled, 'data-search-action': 'reset', onClick: () => props.resetField('searchProviders') }, t('reset')) : null,
            e('button', { className: 'ph-button', type: 'button', disabled: !state.dirty || state.saving, 'data-search-action': 'discard', onClick: props.discard }, t('discard')),
          ),
        ))
      }
      // API-key providers already have native DSH editors; only add the missing OAuth UI.
      const allowed = new Set(['openai-codex'])
      const labels = { 'openai-codex': 'ChatGPT / Codex' }
      const terminal = status => ['authorized', 'cancelled', 'failed', 'missing'].includes(status)
      const unwrap = result => { if (!result?.ok) throw new Error(result?.error?.message || 'Login connection failed'); return result.value }
      const quotaWindowLabel = window => {
        if (!window) return t('quotaWindow')
        if (window.kind === 'weekly') return t('quotaWindowWeekly')
        const seconds = window.windowSeconds
        if (typeof seconds === 'number' && Number.isFinite(seconds) && seconds > 0) {
          return seconds % 86400 === 0 ? t('quotaWindowDays', { n: seconds / 86400 }) : t('quotaWindowHours', { n: Math.round(seconds / 3600) })
        }
        return t('quotaWindowShort')
      }
      const quotaAgeLabel = fetchedAt => {
        if (typeof fetchedAt !== 'number') return ''
        const seconds = Math.max(0, Math.floor(Date.now() / 1000) - fetchedAt)
        if (seconds < 60) return t('ageNow')
        if (seconds < 3600) return t('ageMinutes', { n: Math.floor(seconds / 60) })
        if (seconds < 86400) return t('ageHours', { n: Math.floor(seconds / 3600) })
        return t('ageDays', { n: Math.floor(seconds / 86400) })
      }
      const stampOf = at => {
        const date = new Date(at * 1000)
        return `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
      }
      const spanOf = left => {
        const days = Math.floor(left / 86400)
        const hours = Math.floor((left % 86400) / 3600)
        const minutes = Math.floor((left % 3600) / 60)
        const pieces = days > 0 ? [t('spanDays', { n: days }), ...(hours > 0 ? [t('spanHours', { n: hours })] : [])]
          : hours > 0 ? [t('spanHours', { n: hours }), ...(minutes > 0 ? [t('spanMinutes', { n: minutes })] : [])]
            : [t('spanMinutes', { n: minutes })]
        return pieces.join(' ')
      }
      const quotaResetLabel = resetAt => {
        if (typeof resetAt !== 'number') return ''
        const stamp = stampOf(resetAt)
        const left = resetAt - Math.floor(Date.now() / 1000)
        return left <= 0 ? t('resetStamp', { stamp }) : t('resetStampSoon', { stamp, span: spanOf(left) })
      }
      const quotaExpiryLabel = expiresAt => {
        if (typeof expiresAt !== 'number') return ''
        const date = new Date(expiresAt * 1000)
        const stamp = `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
        const left = expiresAt - Math.floor(Date.now() / 1000)
        if (left <= 0) return t('expiredStamp', { stamp })
        const hours = Math.floor((left % 86400) / 3600)
        const span = left >= 86400 ? spanOf(left) : t('spanHours', { n: Math.max(1, hours) })
        return t('expiresStamp', { stamp, span })
      }
      // Axis tick label: hour precision for short windows, day precision once
      // the series spans more than two days so ticks stay readable.
      const quotaAxisStamp = (ts, span) => {
        const date = new Date(ts * 1000)
        const day = `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
        if (span > 2 * 86400) return day
        return `${day} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
      }
      // Native collapsible block: default collapsed, and the body mounts only
      // after the first expand. The body arrives as a render-prop on purpose —
      // real React evaluates children lazily on mount, and deferring the call
      // keeps quota panels (and their snapshot probes) unmounted until opened.
      function Fold({ title, render }) {
        const [open, setOpen] = React.useState(false)
        const [revealed, setRevealed] = React.useState(false)
        return e('details', {
          className: 'ph-fold',
          'data-fold': 'true',
          'data-fold-open': open ? 'true' : 'false',
          open,
          onToggle: event => {
            const next = event?.currentTarget?.open === true
            if (next) setRevealed(true)
            setOpen(next)
          },
        },
        e('summary', null, title),
        revealed ? e('div', { className: 'ph-fold-body' }, render()) : null)
      }
      // Fixed 0–100% vertical axis: usage percentages compare against the
      // whole window, so the curve height is meaningful without per-series
      // rescaling. Hover (or the native <title> fallback) names each sample.
      function QuotaSpark({ points, kind }) {
        const [hover, setHover] = React.useState(null)
        const pairs = points.map(point => ({ ts: point?.ts, value: point?.used?.[kind], plan: typeof point?.plan === 'string' && point.plan ? point.plan : undefined })).filter(pair => typeof pair.value === 'number' && Number.isFinite(pair.value))
        if (pairs.length < 2) return null
        const yOf = value => (22 - (Math.min(Math.max(value, 0), 100) / 100) * 20).toFixed(2)
        const coords = pairs.map((pair, index) => `${((index / (pairs.length - 1)) * 100).toFixed(2)},${yOf(pair.value)}`).join(' ')
        const firstTs = pairs[0].ts
        const midTs = pairs[Math.floor((pairs.length - 1) / 2)].ts
        const lastTs = pairs[pairs.length - 1].ts
        const span = typeof firstTs === 'number' && typeof lastTs === 'number' ? lastTs - firstTs : 0
        const tickOf = ts => (typeof ts === 'number' ? quotaAxisStamp(ts, span) : '')
        const xOf = index => (index / (pairs.length - 1)) * 100
        const tipOf = pair => {
          const base = t('sparkTip', { stamp: tickOf(pair.ts), used: Math.round(pair.value) })
          return pair.plan ? `${base} · ${pair.plan}` : base
        }
        // Subscription-plan changes draw a dashed separator between the samples.
        const planMarks = []
        for (let index = 1; index < pairs.length; index++) {
          if (pairs[index].plan && pairs[index - 1].plan && pairs[index].plan !== pairs[index - 1].plan) planMarks.push(index)
        }
        const hitWidth = Math.min(100 / (pairs.length - 1), 6)
        return e('div', { className: 'ph-spark-block', 'data-quota-spark-wrap': kind },
          e('div', { className: 'ph-spark-wrap' },
            e('span', { className: 'ph-spark-cap', 'data-quota-spark-cap': 'start' }, `${Math.round(pairs[0].value)}%`),
            e('div', { className: 'ph-spark-chart' },
              e('svg', { className: 'ph-spark', viewBox: '0 0 100 24', preserveAspectRatio: 'none', role: 'img', 'aria-label': t('sparkAria'), 'data-quota-spark': kind },
                e('polygon', { className: 'ph-spark-fill', points: `0,24 ${coords} 100,24` }),
                ...planMarks.map(index => e('line', { key: `plan-${index}`, className: 'ph-spark-plan', 'data-quota-spark-plan': String(index), x1: xOf(index).toFixed(2), x2: xOf(index).toFixed(2), y1: 2, y2: 22, strokeWidth: 1, vectorEffect: 'non-scaling-stroke' }, e('title', null, t('planChangeTitle', { from: pairs[index - 1].plan, to: pairs[index].plan })))),
                e('polyline', { points: coords, fill: 'none', stroke: 'currentColor', strokeWidth: 2, vectorEffect: 'non-scaling-stroke' }),
                ...pairs.map((pair, index) => e('rect', { key: `hit-${index}`, className: 'ph-spark-hit', 'data-quota-spark-hit': String(index), x: Math.max(0, xOf(index) - hitWidth / 2).toFixed(2), y: 0, width: hitWidth.toFixed(2), height: 24, onMouseEnter: () => setHover(index), onMouseLeave: () => setHover(null) }, e('title', null, tipOf(pair)))),
              ),
              hover !== null && pairs[hover] ? e('span', { className: 'ph-spark-tip', 'data-quota-spark-tip': String(hover), style: { left: `${Math.min(96, Math.max(4, xOf(hover)))}%` } }, tipOf(pairs[hover])) : null),
            e('span', { className: 'ph-spark-cap', 'data-quota-spark-cap': 'end' }, `${Math.round(pairs[pairs.length - 1].value)}%`)),
          e('div', { className: 'ph-spark-axis', 'data-quota-spark-axis': true },
            e('span', { 'data-quota-spark-tick': 'start' }, tickOf(firstTs)),
            e('span', { 'data-quota-spark-tick': 'mid' }, tickOf(midTs)),
            e('span', { 'data-quota-spark-tick': 'end' }, tickOf(lastTs))))
      }
      function QuotaPanel({ quota, provider, keyId, grantId, title }) {
        const [view, setView] = React.useState()
        const [points, setPoints] = React.useState([])
        const [range, setRange] = React.useState(168)
        const [busy, setBusy] = React.useState(false)
        const mounted = React.useRef(true)
        const busyRef = React.useRef(false)
        const rangeRef = React.useRef(range)
        rangeRef.current = range
        React.useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
        const quotaUnwrap = result => { if (!result?.ok) throw new Error(result?.error?.message || t('noticeNetwork')); return result.value }
        const loadHistory = React.useCallback(async () => {
          try {
            const value = quotaUnwrap(await quota.history({ provider, keyId, grantId, hours: rangeRef.current }))
            if (mounted.current) setPoints(Array.isArray(value?.points) ? value.points : [])
          } catch { /* history stays best-effort; the panel keeps its empty state */ }
        }, [quota, provider, keyId, grantId])
        const load = React.useCallback(async maxAgeMs => {
          if (busyRef.current) return
          busyRef.current = true
          setBusy(true)
          try {
            const value = quotaUnwrap(await quota.snapshot({ provider, keyId, grantId, maxAgeMs }))
            if (mounted.current) setView(value)
            await loadHistory()
          } catch (error) {
            if (mounted.current) setView({ status: 'network', message: error?.message || t('noticeNetwork') })
          } finally {
            busyRef.current = false
            if (mounted.current) setBusy(false)
          }
        }, [quota, provider, keyId, grantId, loadHistory])
        React.useEffect(() => { void load(300000) }, [load])
        // The recorder appends hourly while the panel stays open; keep the
        // curve current without asking the user to revisit or refresh.
        React.useEffect(() => {
          const timer = setInterval(() => { void loadHistory() }, 60_000)
          return () => clearInterval(timer)
        }, [loadHistory])
        const snapshot = view?.status === 'ok' ? view.snapshot : view?.lastSnapshot
        const windows = Array.isArray(snapshot?.windows) ? snapshot.windows : []
        const age = quotaAgeLabel(view?.status === 'ok' ? view.fetchedAt : view?.lastFetchAt)
        return e('div', { className: 'ph-quota', 'data-quota-section': true, 'data-quota-state': view?.status ?? 'loading', 'aria-label': t('quotaAria') },
          e('div', { className: 'ph-quota-head' },
            e('h5', { className: 'ph-quota-title' }, title ?? t('quotaTitle'),
              e('span', { className: 'ph-quota-age' }, busy ? t('quotaLoading') : age)),
            e('button', { className: 'ph-button', type: 'button', 'data-quota-refresh': true, disabled: busy, onClick: () => { void load(0) } }, t('quotaRefresh')),
          ),
          snapshot ? e(React.Fragment, null,
            snapshot.email || snapshot.plan ? e('p', { className: 'ph-quota-identity' },
              snapshot.email ? e('span', { 'data-quota-email': true }, snapshot.email) : null,
              snapshot.plan ? e('span', { className: 'ph-plan' }, snapshot.plan) : null) : null,
            ...windows.map(window => e('div', { className: 'ph-window', key: window.kind, 'data-quota-window': window.kind },
              e('div', { className: 'ph-window-row' },
                e('span', { className: 'ph-window-label' }, quotaWindowLabel(window)),
                e('span', null, t('windowUsage', { used: window.usedPercent, left: 100 - window.usedPercent })),
              ),
              e('div', { className: 'ph-bar', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': window.usedPercent, 'aria-label': t('windowUsageAria', { window: quotaWindowLabel(window) }) },
                e('div', { className: 'ph-bar-fill', style: { width: `${window.usedPercent}%` } })),
              e('div', { className: 'ph-window-row' },
                e('span', null, quotaResetLabel(window.resetAt))),
            )),
            snapshot.credits || snapshot.resetCredits ? e('p', { className: 'ph-meta' },
              typeof snapshot.credits?.balance === 'number' && Number.isFinite(snapshot.credits.balance) ? e('span', { 'data-quota-credits': true }, t('creditsBalance', { n: snapshot.credits.balance.toLocaleString() })) : null,
              snapshot.credits?.unlimited === true ? e('span', null, t('creditsUnlimited')) : null,
              typeof snapshot.resetCredits?.available === 'number' ? e('span', null, t('resetCredits', { n: snapshot.resetCredits.available })) : null) : null,
            Array.isArray(snapshot.resetCredits?.credits) && snapshot.resetCredits.credits.length ? e('div', { className: 'ph-credit-list', 'data-quota-credit-list': true },
              ...snapshot.resetCredits.credits.map((credit, index) => e('div', { className: 'ph-credit-row', key: index, 'data-quota-credit': true },
                e('span', null, credit.title || t('resetCreditTitle')),
                e('span', null, quotaExpiryLabel(credit.expiresAt)),
              ))) : null,
          ) : null,
          view && view.status !== 'ok' ? e('div', { className: 'ph-quota-notice', 'data-tone': view.status === 'expired' ? 'warn' : undefined, 'data-quota-notice': view.status, role: 'status' },
            e('p', null,
              view.status === 'expired' ? t('noticeExpired')
                : view.status === 'unsupported' ? (view.message || t('noticeUnsupported'))
                  : view.status === 'network' ? (view.message || t('noticeNetwork'))
                    : t('noticeEmpty')),
            typeof view.helpUrl === 'string' && /^https?:\/\/\S+$/iu.test(view.helpUrl)
              ? e('a', { className: 'ph-button', href: view.helpUrl, target: '_blank', rel: 'noopener noreferrer', 'data-quota-help': true }, t('openConsole'))
              : null) : null,
          e('div', { className: 'ph-quota-head' },
            e('span', { className: 'ph-muted' }, t('historyTitle')),
            e('div', { className: 'ph-ranges', role: 'group', 'aria-label': t('historyRange') },
              e('button', { className: 'ph-button ph-range', type: 'button', 'aria-pressed': range === 24, 'data-quota-range': '24', onClick: () => { setRange(24); rangeRef.current = 24; void loadHistory() } }, t('range24')),
              e('button', { className: 'ph-button ph-range', type: 'button', 'aria-pressed': range === 168, 'data-quota-range': '168', onClick: () => { setRange(168); rangeRef.current = 168; void loadHistory() } }, t('range168')),
              e('button', { className: 'ph-button ph-range', type: 'button', 'aria-pressed': range === 720, 'data-quota-range': '720', onClick: () => { setRange(720); rangeRef.current = 720; void loadHistory() } }, t('range720')),
            ),
          ),
          points.some(point => Number.isFinite(point?.used?.weekly)) ? e(QuotaSpark, { key: 'spark-weekly', points, kind: 'weekly' })
            : points.some(point => Number.isFinite(point?.used?.short)) ? e(QuotaSpark, { key: 'spark-short', points, kind: 'short' })
              : e('p', { className: 'ph-muted' }, t('historyEmpty')),
        )
      }
      function LoginCard({ provider, remote: login, quota, accounts }) {
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
          } catch (error) { if (mounted.current) setError(error?.message || t('errorReadState')) }
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
              setError(error?.message || t('errorReadStatus'))
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
            if (mounted.current && generation.current === revision) { setBusy(false); setError(error?.message || t('loginFailed')) }
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
          } catch (error) { if (mounted.current) setError(error?.message || t('errorAnswer')) }
        }
        const cancel = async () => {
          const id = attemptId.current
          if (!id) return
          setCancelling(true); setError(undefined)
          try {
            const view = unwrap(await login.cancel(id))
            if (attemptId.current === id) applyView(view)
          } catch (error) { if (mounted.current) { setCancelling(false); setError(error?.message || t('errorCancel')) } }
        }
        const notice = attempt?.notice
        const prompt = attempt?.prompt
        const otherSurface = entry?.inFlight && !entry?.activeAttempt && !attempt?.id
        const canCancel = busy && attempt?.id && !terminal(attempt.status)
        const statusLabel = otherSurface ? t('statusOtherSurface') : cancelling ? t('statusCancelling') : busy ? prompt ? t('statusConfirming') : t('statusWaiting') : attempt?.status === 'failed' ? t('statusFailed') : attempt?.status === 'cancelled' ? t('statusCancelled') : entry?.authorized ? t('statusAuthorized') : t('statusSignedOut')
        const statusTone = attempt?.status === 'failed' ? 'error' : !busy && !otherSurface && entry?.authorized ? 'success' : 'neutral'
        const loginError = attempt?.status === 'failed' ? attempt.error || error || t('loginFailed') : error
        const noticeUrl = typeof notice?.url === 'string' && /^https?:\/\/\S+$/iu.test(notice.url) ? notice.url : undefined
        return e('section', { 'data-provider-hub-login': providerId, 'data-login-state': attempt?.status || (entry?.authorized ? 'authorized' : 'signed-out'), className: 'provider-hub-ui ph-login', 'aria-label': t('loginAria') },
          e('div', { className: 'ph-login-head' },
            e('div', { className: 'ph-login-identity' },
              e('h4', { className: 'ph-heading' }, labels[providerId] || provider?.displayName || providerId),
              e('span', { className: 'ph-status', 'data-tone': statusTone, role: 'status', 'aria-live': 'polite' }, statusLabel),
            ),
            e('div', { className: 'ph-actions' },
              e('button', { className: 'ph-button ph-primary', type: 'button', 'data-login-action': 'start', disabled: busy || otherSurface, onClick: start }, busy ? t('actionBusy') : entry?.authorized ? t('actionRelogin') : t('actionLogin')),
              canCancel ? e('button', { className: 'ph-button', type: 'button', 'data-login-action': 'cancel', disabled: cancelling, onClick: cancel }, cancelling ? t('actionCancelling') : t('actionCancel')) : null,
            ),
          ),
          e('p', { className: 'ph-muted' }, t('loginHint')),
          // Quota and the account pool live behind one native fold: collapsed
          // by default, and the body (with its snapshot probe) only mounts on
          // first expand. The OAuth button above stays the first login method;
          // importing a Codex CLI login state is the second.
          quota || accounts ? e(Fold, {
            title: t('foldCodexAccounts'),
            render: () => e(React.Fragment, null,
              entry?.authorized && quota ? e(QuotaPanel, { quota, provider: 'openai-codex' }) : null,
              accounts ? e(CodexAccountsCard, { accounts, quota }) : null,
            ),
          }) : null,
          otherSurface ? e('p', { className: 'ph-muted', role: 'status' }, t('otherSurfaceNote')) : null,
          notice ? e('div', { className: 'ph-notice', 'data-login-notice': true, role: 'status', 'aria-live': 'polite' },
            e('p', null, notice.message),
            noticeUrl ? e('a', { className: 'ph-button', href: noticeUrl, target: '_blank', rel: 'noopener noreferrer', 'data-login-action': 'open' }, t('openAuthPage')) : null,
            notice.code ? e('div', null, e('span', { className: 'ph-muted' }, t('authCode')), e('code', { className: 'ph-code' }, notice.code)) : null,
          ) : null,
          prompt ? e('form', { onSubmit: answer, className: 'ph-answer', 'aria-label': t('confirmAria') },
            e('label', { className: 'ph-answer-label' },
              e('span', null, prompt.message),
              prompt.kind === 'select'
                ? e('select', { className: 'ph-answer-control', name: 'answer', 'aria-label': prompt.message, disabled: cancelling }, ...(prompt.options ?? []).map(option => e('option', { key: option.id, value: option.id }, option.label)))
                : e('input', { className: 'ph-answer-control', name: 'answer', type: prompt.kind === 'secret' ? 'password' : 'text', placeholder: prompt.placeholder || prompt.message, 'aria-label': prompt.message, autoComplete: prompt.kind === 'secret' ? 'new-password' : 'off', disabled: cancelling, autoFocus: true }),
            ),
            e('button', { className: 'ph-button ph-primary', type: 'submit', 'data-login-action': 'submit', disabled: cancelling }, t('submit')),
          ) : null,
          loginError ? e('div', { className: 'ph-error', role: 'alert' }, e('p', null, loginError)) : null,
        )
      }
      // API-key providers get the same quota surface plus their key pool: the
      // active key is the official credential reference, pool entries are extra
      // named keys whose secrets live only in the DSH credential store.
      const keyPoolProviders = new Set(['xiaomi-token-plan-cn', 'zai', 'zai-coding-cn', 'kimi-coding'])
      const keyPoolLabels = { 'xiaomi-token-plan-cn': 'Xiaomi Token Plan CN', zai: 'Z.AI', 'zai-coding-cn': 'Z.AI Coding CN', 'kimi-coding': 'Kimi For Coding' }
      function KeyPoolCard({ provider, pool, quota }) {
        const [entries, setEntries] = React.useState([])
        const [selectedId, setSelectedId] = React.useState('')
        const [renaming, setRenaming] = React.useState(false)
        const [details, setDetails] = React.useState(false)
        const [busy, setBusy] = React.useState(false)
        const [adding, setAdding] = React.useState(false)
        const [error, setError] = React.useState()
        const [notice, setNotice] = React.useState()
        const mounted = React.useRef(true)
        React.useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
        const poolUnwrap = result => { if (!result?.ok) throw new Error(result?.error?.message || t('errorReadState')); return result.value }
        const refresh = React.useCallback(async () => {
          try {
            const value = poolUnwrap(await pool.list({ provider }))
            if (mounted.current) setEntries(Array.isArray(value?.entries) ? value.entries : [])
          } catch (error) { if (mounted.current) setError(error?.message || t('errorReadState')) }
        }, [pool, provider])
        React.useEffect(() => { void refresh() }, [refresh])
        const run = async (action, failureKey, noticeKey) => {
          setBusy(true); setError(undefined); setNotice(undefined)
          try { await poolUnwrap(action()); if (noticeKey) setNotice(t(noticeKey)); await refresh() } catch (error) { if (mounted.current) setError(error?.message || t(failureKey)) } finally { if (mounted.current) setBusy(false) }
        }
        const add = async event => {
          event.preventDefault()
          const form = event.currentTarget
          const name = form.elements.name.value
          const value = form.elements.value.value
          setAdding(true); setError(undefined); setNotice(undefined)
          try {
            await poolUnwrap(pool.add({ provider, name, value }))
            form.reset?.()
            setNotice(t('poolAdded'))
            await refresh()
          } catch (error) { if (mounted.current) setError(error?.message || t('poolErrorAdd')) } finally { if (mounted.current) setAdding(false) }
        }
        const submitRename = async event => {
          event.preventDefault()
          if (!selected) return
          const name = event.currentTarget.elements.name.value
          await run(() => pool.rename({ id: selected.id, name }), 'poolErrorRename', 'poolRenamed')
          if (mounted.current) setRenaming(false)
        }
        // Dropdown selection falls back to the active entry (then the first).
        const selected = entries.find(entry => entry.id === selectedId) ?? entries.find(entry => entry.active) ?? entries[0]
        return e('fieldset', { className: 'ph-switches', 'data-key-pool': provider },
          e('legend', { className: 'ph-heading' }, t('poolGroup')),
          e('p', { className: 'ph-muted' }, t('poolHint')),
          entries.length === 0 ? e('p', { className: 'ph-muted', 'data-pool-empty': true }, t('poolEmpty')) : e('div', { className: 'ph-pool-bar', 'data-pool-bar': true },
            e('label', { className: 'ph-answer-label' },
              e('span', { className: 'ph-muted' }, t('poolSelectLabel')),
              e('select', {
                className: 'ph-answer-control',
                'data-pool-select': true,
                'aria-label': t('poolSelectLabel'),
                value: selected?.id ?? '',
                onChange: event => { setSelectedId(event.target.value); setRenaming(false); setDetails(false) },
              },
              ...entries.map(entry => e('option', { key: entry.id, value: entry.id, 'data-pool-option': entry.id }, entry.active ? t('poolSelectActive', { name: entry.name }) : entry.name)))),
            e('div', { className: 'ph-actions' },
              selected && !selected.active ? e('button', { className: 'ph-button', type: 'button', 'data-pool-action': 'use', disabled: busy, onClick: () => run(() => pool.setActive({ id: selected.id }), 'poolErrorSwitch', 'poolSwitched') }, t('poolActionUse')) : null,
              selected ? e('button', { className: 'ph-button', type: 'button', 'data-pool-action': 'details', 'aria-pressed': details, onClick: () => setDetails(current => !current) }, t('poolActionDetails')) : null,
              selected ? e('button', { className: 'ph-button', type: 'button', 'data-pool-action': 'rename', disabled: busy, onClick: () => { setRenaming(current => !current); setNotice(undefined) } }, t('poolActionRename')) : null,
              selected ? e('button', { className: 'ph-button', type: 'button', 'data-pool-action': 'remove', disabled: busy, onClick: () => run(() => pool.drop({ id: selected.id }), 'poolErrorRemove', 'poolRemoved') }, t('poolActionRemove')) : null,
            )),
          selected && renaming ? e('form', { onSubmit: submitRename, className: 'ph-pool-rename', 'data-pool-rename': true },
            e('label', { className: 'ph-answer-label' },
              e('span', { className: 'ph-muted' }, t('poolRenameLabel')),
              e('input', { className: 'ph-answer-control', name: 'name', defaultValue: selected.name, placeholder: t('poolNamePlaceholder'), 'aria-label': t('poolRenameLabel'), autoComplete: 'off' })),
            e('button', { className: 'ph-button ph-primary', type: 'submit', 'data-pool-action': 'rename-save', disabled: busy }, t('poolRenameSave')),
            e('button', { className: 'ph-button', type: 'button', 'data-pool-action': 'rename-cancel', onClick: () => setRenaming(false) }, t('poolRenameCancel')),
          ) : null,
          selected && details ? e(QuotaPanel, { key: `quota-${selected.id}`, quota, provider, keyId: selected.id, title: selected.name }) : null,
          notice ? e('p', { className: 'ph-muted', role: 'status', 'data-pool-notice': true }, notice) : null,
          e('form', { onSubmit: add, className: 'ph-answer', 'data-pool-add': true },
            e('label', { className: 'ph-answer-label' },
              e('span', null, t('poolNameLabel')),
              e('input', { className: 'ph-answer-control', name: 'name', placeholder: t('poolNamePlaceholder'), 'aria-label': t('poolNameLabel'), autoComplete: 'off' })),
            e('label', { className: 'ph-answer-label' },
              e('span', null, t('poolValueLabel')),
              e('input', { className: 'ph-answer-control', name: 'value', type: 'password', placeholder: t('poolValuePlaceholder'), 'aria-label': t('poolValueLabel'), autoComplete: 'new-password' })),
            e('button', { className: 'ph-button ph-primary', type: 'submit', 'data-pool-action': 'add', disabled: adding }, adding ? t('poolAdding') : t('poolAdd')),
          ),
          error ? e('div', { className: 'ph-error', role: 'alert' }, e('p', null, error)) : null,
        )
      }
      function ApiKeyProviderCard({ provider, quota, pool, keyConfigured }) {
        return e('section', { className: 'provider-hub-ui ph-login', 'data-provider-hub-quota': provider, 'aria-label': keyPoolLabels[provider] || provider },
          e(Fold, {
            title: t('foldQuotaPool', { name: keyPoolLabels[provider] || provider }),
            render: () => e(React.Fragment, null,
              keyConfigured !== false ? e(QuotaPanel, { key: `active-${provider}`, quota, provider, title: t('quotaActiveKey') }) : null,
              e('p', { className: 'ph-muted' }, t('quotaKeyHint')),
              e(KeyPoolCard, { provider, pool, quota }),
            ),
          }),
        )
      }
      // Codex account pool: named OAuth grants imported from Codex CLI
      // directories (a second login method beside the browser OAuth flow).
      // Switching an account rewrites the official openai-codex credential.
      function CodexAccountsCard({ accounts, quota }) {
        const [entries, setEntries] = React.useState([])
        const [sources, setSources] = React.useState([])
        const [selectedId, setSelectedId] = React.useState('')
        const [importing, setImporting] = React.useState(false)
        const [renaming, setRenaming] = React.useState(false)
        const [details, setDetails] = React.useState(false)
        const [busy, setBusy] = React.useState(false)
        const [error, setError] = React.useState()
        const [notice, setNotice] = React.useState()
        const mounted = React.useRef(true)
        React.useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
        const unwrapView = result => { if (!result?.ok) throw new Error(result?.error?.message || t('errorReadState')); return result.value }
        const refresh = React.useCallback(async () => {
          try {
            const [list, available] = await Promise.all([accounts.list(), accounts.sources()])
            if (!mounted.current) return
            const listView = unwrapView(list)
            const sourcesView = unwrapView(available)
            setEntries(Array.isArray(listView?.entries) ? listView.entries : [])
            setSources(Array.isArray(sourcesView?.sources) ? sourcesView.sources : [])
          } catch (error) { if (mounted.current) setError(error?.message || t('errorReadState')) }
        }, [accounts])
        React.useEffect(() => { void refresh() }, [refresh])
        const run = async (action, failureKey, noticeKey) => {
          setBusy(true); setError(undefined); setNotice(undefined)
          try { await unwrapView(action()); if (noticeKey) setNotice(t(noticeKey)); await refresh() } catch (error) { if (mounted.current) setError(error?.message || t(failureKey)) } finally { if (mounted.current) setBusy(false) }
        }
        const selected = entries.find(entry => entry.id === selectedId) ?? entries.find(entry => entry.active) ?? entries[0]
        const importSubmit = async event => {
          event.preventDefault()
          const form = event.currentTarget
          const source = form.elements.source.value
          const name = form.elements.name.value
          setImporting(true); setError(undefined); setNotice(undefined)
          try {
            const view = unwrapView(await accounts.import({ source, name }))
            if (mounted.current) { setNotice(t('poolAdded')); setSelectedId(view?.entry?.id ?? ''); setRenaming(false); setDetails(false) }
            await refresh()
          } catch (error) { if (mounted.current) setError(error?.message || t('codexImportError')) } finally { if (mounted.current) setImporting(false) }        }
        const renameSubmit = async event => {
          event.preventDefault()
          if (!selected) return
          const name = event.currentTarget.elements.name.value
          await run(() => accounts.rename({ id: selected.id, name }), 'codexAccountErrorRename', 'codexAccountRenamed')
          if (mounted.current) setRenaming(false)
        }
        const sourceLabel = source => (source?.id === 'codex' ? t('codexImportSourceCodex') : source?.id === 'codex-gth' ? t('codexImportSourceGth') : source?.id)
        const sourceDetail = source => [source?.email, typeof source?.expires === 'number' ? quotaExpiryLabel(source.expires) : undefined].filter(Boolean).join(' · ') || (source?.available ? undefined : t('codexImportUnavailable'))
        return e('fieldset', { className: 'ph-switches', 'data-codex-accounts': true },
          e('legend', { className: 'ph-heading' }, t('codexAccountsGroup')),
          entries.some(entry => entry.active)
            ? e('p', { className: 'ph-muted', 'data-codex-current': true }, t('codexAccountsCurrent', { email: entries.find(entry => entry.active).email || entries.find(entry => entry.active).accountId || '—' }))
            : e('p', { className: 'ph-muted', 'data-codex-current': true }, t('codexAccountsCurrentNone')),
          entries.length === 0 ? e('p', { className: 'ph-muted', 'data-codex-empty': true }, t('codexAccountsNone')) : e('div', { className: 'ph-pool-bar', 'data-codex-bar': true },
            e('label', { className: 'ph-answer-label' },
              e('span', { className: 'ph-muted' }, t('codexAccountsSelectLabel')),
              e('select', {
                className: 'ph-answer-control',
                'data-codex-select': true,
                'aria-label': t('codexAccountsSelectLabel'),
                value: selected?.id ?? '',
                onChange: event => { setSelectedId(event.target.value); setRenaming(false); setDetails(false) },
              },
              ...entries.map(entry => e('option', { key: entry.id, value: entry.id, 'data-codex-option': entry.id }, entry.active ? t('poolSelectActive', { name: entry.name }) : entry.name)))),
            e('div', { className: 'ph-actions' },
              selected && !selected.active ? e('button', { className: 'ph-button', type: 'button', 'data-codex-action': 'use', disabled: busy, onClick: () => run(() => accounts.setActive({ id: selected.id }), 'codexAccountErrorSwitch', 'codexAccountSwitched') }, t('codexAccountActionUse')) : null,
              selected ? e('button', { className: 'ph-button', type: 'button', 'data-codex-action': 'details', 'aria-pressed': details, onClick: () => setDetails(current => !current) }, t('codexAccountActionDetails')) : null,
              selected ? e('button', { className: 'ph-button', type: 'button', 'data-codex-action': 'rename', disabled: busy, onClick: () => { setRenaming(current => !current); setNotice(undefined) } }, t('poolActionRename')) : null,
              selected ? e('button', { className: 'ph-button', type: 'button', 'data-codex-action': 'remove', disabled: busy, onClick: () => run(() => accounts.drop({ id: selected.id }), 'codexAccountErrorRemove', 'codexAccountRemoved') }, t('codexAccountActionRemove')) : null,
            )),
          selected && renaming ? e('form', { onSubmit: renameSubmit, className: 'ph-pool-rename', 'data-codex-rename': true },
            e('label', { className: 'ph-answer-label' },
              e('span', { className: 'ph-muted' }, t('poolRenameLabel')),
              e('input', { className: 'ph-answer-control', name: 'name', defaultValue: selected.name, placeholder: t('codexImportNamePlaceholder'), 'aria-label': t('poolRenameLabel'), autoComplete: 'off' })),
            e('button', { className: 'ph-button ph-primary', type: 'submit', 'data-codex-action': 'rename-save', disabled: busy }, t('poolRenameSave')),
            e('button', { className: 'ph-button', type: 'button', 'data-codex-action': 'rename-cancel', onClick: () => setRenaming(false) }, t('poolRenameCancel')),
          ) : null,
          selected && details ? e(QuotaPanel, { key: `quota-${selected.id}`, quota, provider: 'openai-codex', grantId: selected.id, title: selected.name }) : null,
          notice ? e('p', { className: 'ph-muted', role: 'status', 'data-codex-notice': true }, notice) : null,
          e('p', { className: 'ph-muted' }, t('codexImportHint')),
          e('form', { onSubmit: importSubmit, className: 'ph-answer', 'data-codex-import': true },
            e('label', { className: 'ph-answer-label' },
              e('span', null, t('codexImportSourceLabel')),
              e('select', { className: 'ph-answer-control', name: 'source', 'aria-label': t('codexImportSourceLabel'), defaultValue: sources.find(source => source.available)?.id ?? sources[0]?.id ?? '' },
                ...sources.map(source => e('option', { key: source.id, value: source.id, 'data-codex-source': source.id }, [sourceLabel(source), sourceDetail(source)].filter(Boolean).join(' — '))))),
            e('label', { className: 'ph-answer-label' },
              e('span', null, t('codexImportNameLabel')),
              e('input', { className: 'ph-answer-control', name: 'name', placeholder: t('codexImportNamePlaceholder'), 'aria-label': t('codexImportNameLabel'), autoComplete: 'off' })),
            e('button', { className: 'ph-button ph-primary', type: 'submit', 'data-codex-action': 'import', disabled: importing || !sources.some(source => source.available) }, importing ? t('codexImportBusy') : t('codexImportSubmit')),
          ),
          error ? e('div', { className: 'ph-error', role: 'alert' }, e('p', null, error)) : null,
        )
      }
      function ProviderCard(props) {
        const providerId = props.provider?.provider
        if (providerId === 'openai-codex') return e(LoginCard, props)
        if (keyPoolProviders.has(providerId)) return e(ApiKeyProviderCard, { provider: providerId, quota: props.quota, pool: props.pool, keyConfigured: props.keyConfigured })
        return null
      }
      return {
        inject: ['remote', 'slots', 'configForms', 'locale'],
        async apply(ctx) {
          t = ctx.locale.bind(NS)
          ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-provider-hub: dictionaries')
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
            const form = new SettingsFormModel(ctx.configForms.get(searchNamespace), [providerField, imageProviderField, resultLimitField, ...quotaFields])
            try {
              const store = form.bind(() => ({ ...form.shell(), searchProviders: form.field('searchProviders'), imageProviders: form.field('imageProviders'), searchMaxResults: form.field('searchMaxResults'), quotaRecord: form.field('quotaRecord'), quotaIntervalMinutes: form.field('quotaIntervalMinutes'), quotaHistoryDays: form.field('quotaHistoryDays'), zaiTeamOrganization: form.field('zaiTeamOrganization'), zaiTeamProject: form.field('zaiTeamProject') }))
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
          const ui = ctx.inject(['remote.searchLogin', 'remote.quota', 'remote.keyPool', 'remote.codexAccounts', 'slots'], scoped => {
            scoped.slots.inject('settings.models.provider-card', () => scoped.slots.register({ name: 'settings.models.provider-card', key: 'llm-pi-ai' }, props => e(ProviderCard, { ...props, remote: scoped.remote.searchLogin, quota: scoped.remote.quota, pool: scoped.remote.keyPool, accounts: scoped.remote.codexAccounts })))
          })
          try { await ui; return async () => { await ui.dispose(); await disposeRemote() } } catch (error) { await ui.dispose(); await disposeRemote(); throw error }
        },
      }
    },
  })
})(window)
