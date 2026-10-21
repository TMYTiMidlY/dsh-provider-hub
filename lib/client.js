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
      { id: 'dsh-provider-hub#codexAccounts/sources', service: 'codexAccounts', namespace: 'codexAccounts', method: 'sources', invocation: { kind: 'direct' }, parameters: [{ name: 'request', wire: 'request', source: 'json', codec: recordCodec('codexAccounts-sources-request') }], result: resultCodec('codexAccounts-sources') },
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
        historyTitle: '用量历史',
        historyRange: '历史范围',
        range24: '24 小时',
        range168: '7 天',
        range720: '30 天',
        historyEmpty: '尚无历史记录；首次成功采样后显示曲线。',
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
        actionRelogin: '添加 / 登录另一个账号',
        webLoginTitle: '方式一 · 网页授权登录',
        webLoginName: '新账号名称（可选）',
        actionLogin: '使用 ChatGPT 登录',
        actionCancelling: '正在取消…',
        actionCancel: '取消授权',
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
        quotaKeyHint: '选择账号只预览额度与历史；设为当前后，模型请求才使用该账号。',
        poolGroup: '账号池',
        poolRenameAccount: '重命名 {name}',
        poolChooseAccount: '选择 {name}',
        poolRemoveAccount: '删除 {name}',
        poolAccountType: '账号类型',
        poolAccountPersonal: '普通账号',
        poolAccountTeam: '团队账号',
        poolScopeRequired: '团队账号需要填写 Organization ID 和 Project ID。',
        poolHint: '为该 provider 存放多把命名 API Key（秘密只保存在 DSH 凭据库），随时切换实际生效的那把。',
        poolEntryActive: '当前生效',
        poolActionUse: '设为当前',
        poolActionRemove: '删除',
        poolActionDetails: '额度详情',
        poolNameLabel: 'Key 名称',
        poolNamePlaceholder: '例如：工作账号',
        poolValueLabel: 'API Key',
        poolValuePlaceholder: '粘贴 API Key',
        poolAdd: '添加账号',
        poolAdding: '添加中…',
        poolEmpty: '账号池为空；添加 API Key 后可预览额度并随时切换。',
        poolErrorAdd: '添加失败',
        poolErrorRemove: '删除失败',
        poolErrorSwitch: '切换失败',
        poolSwitched: '已切换生效 Key',
        poolAdded: '已添加账号',
        poolSelectLabel: '选择 Key',
        poolSelectActive: '{name}（当前生效）',
        poolActionRename: '重命名',
        poolRenameLabel: '新名称',
        poolRenameSave: '保存名称',
        poolRenameCancel: '取消',
        poolErrorRename: '重命名失败',
        poolRenamed: '已重命名 Key',
        poolRemoved: '已删除 Key',
        foldQuotaPool: '账号池与额度',
        foldCodexAccounts: '账号池与额度',
        codexAccountsGroup: 'Codex 账号',
        codexAccountsCurrent: '当前账号：{email}',
        codexAccountsCurrentNone: '当前账号：未登录',
        codexAccountsNone: '暂无账号，点击“添加账号”开始。',
        codexAccountsCurrentKnown: '当前账号：已登录（未提供邮箱）',
        codexAccountsLoading: '正在加载当前账号与账号池…',
        codexAccountsLoadError: '加载账号池失败',
        codexAccountSourceWeb: '网页授权',
        codexAccountSourceExisting: '已有 DSH 登录',
        codexAccountSourceCli: 'CLI 导入',
        codexAccountExpired: '登录态已过期',
        codexImportTitle: '导入 CLI',
        codexImportDirectory: '服务器目录',
        codexImportDirectoryPlaceholder: 'Windows / Linux / ~/ 路径',
        codexImportRefresh: '检查登录态',
        codexManualDirectory: '手动输入路径',
        codexSourceDefault: '默认',
        codexAddAccount: '添加账号',
        codexAddWeb: '网页登录',
        codexAddCli: '导入 CLI',
        codexAddWebContinue: '继续网页登录',
        codexAddName: '账号名称（可选）',
        codexBrowseDirectory: '选择目录…',
        codexBrowseSelect: '选择此目录',
        codexBrowseCancel: '取消选择',
        codexBrowseError: '无法浏览 Host 目录',
        codexBrowseTruncated: '目录较多，仅显示部分结果。',
        codexSourcePolicy: '发现规则',
        codexImportLoading: '正在加载目录…',
        codexImportLoadError: '加载 CLI 来源失败',
        codexImportDirectoryInvalid: '请输入服务器绝对路径、Windows 盘符路径或 ~/目录。',
        codexImportNoSources: '未发现登录态；可选择其他目录。',
        codexImportAvailable: '可导入',
        codexImportExpired: '已过期，仍可导入；使用时可能需要刷新授权',
        codexImportAdded: '已导入账号池；当前账号未切换',
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
        codexImportNameLabel: '账号名称（可留空，默认用邮箱）',
        codexImportNamePlaceholder: '例如：工作账号',
        codexImportSubmit: '导入登录态',
        codexImportHint: '读取 DSH 所在机器的目录；默认路径见下方。只导入，不切换当前账号。',
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
        historyTitle: 'Usage history',
        historyRange: 'History range',
        range24: '24 hours',
        range168: '7 days',
        range720: '30 days',
        historyEmpty: 'No history yet. The chart appears after a successful sample.',
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
        actionRelogin: 'Add / sign in to another account',
        webLoginTitle: 'Method 1 · Browser authorization',
        webLoginName: 'New account name (optional)',
        actionLogin: 'Sign in with ChatGPT',
        actionCancelling: 'Cancelling…',
        actionCancel: 'Cancel authorization',
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
        quotaKeyHint: 'Selecting an account only previews its quota and history. Model requests change only after making it current.',
        poolGroup: 'Account pool',
        poolRenameAccount: 'Rename {name}',
        poolChooseAccount: 'Select {name}',
        poolRemoveAccount: 'Remove {name}',
        poolAccountType: 'Account type',
        poolAccountPersonal: 'Personal account',
        poolAccountTeam: 'Team account',
        poolScopeRequired: 'Team accounts require both Organization ID and Project ID.',
        poolHint: 'Keep several named API keys for this provider (secrets stay in the DSH credential store) and switch the one in effect anytime.',
        poolEntryActive: 'Active',
        poolActionUse: 'Make active',
        poolActionRemove: 'Remove',
        poolActionDetails: 'Quota details',
        poolNameLabel: 'Key name',
        poolNamePlaceholder: 'e.g. Work account',
        poolValueLabel: 'API key',
        poolValuePlaceholder: 'Paste an API key',
        poolAdd: 'Add account',
        poolAdding: 'Adding…',
        poolEmpty: 'The account pool is empty; add API keys to preview quotas and switch anytime.',
        poolErrorAdd: 'Unable to add the key',
        poolErrorRemove: 'Unable to remove the key',
        poolErrorSwitch: 'Unable to switch the key',
        poolSwitched: 'Active key switched',
        poolAdded: 'Added to the account pool',
        poolSelectLabel: 'Select key',
        poolSelectActive: '{name} (active)',
        poolActionRename: 'Rename',
        poolRenameLabel: 'New name',
        poolRenameSave: 'Save name',
        poolRenameCancel: 'Cancel',
        poolErrorRename: 'Unable to rename the key',
        poolRenamed: 'Key renamed',
        poolRemoved: 'Key removed',
        foldQuotaPool: 'Account pool & quota',
        foldCodexAccounts: 'Account pool & quota',
        codexAccountsGroup: 'Codex accounts',
        codexAccountsCurrent: 'Current account: {email}',
        codexAccountsCurrentNone: 'Current account: not signed in',
        codexAccountsNone: 'No accounts yet. Choose “Add account” to begin.',
        codexAccountsCurrentKnown: 'Current account: signed in (email unavailable)',
        codexAccountsLoading: 'Loading the current account and pool…',
        codexAccountsLoadError: 'Unable to load the account pool',
        codexAccountSourceWeb: 'Browser authorization',
        codexAccountSourceExisting: 'Existing DSH login',
        codexAccountSourceCli: 'CLI import',
        codexAccountExpired: 'Login state expired',
        codexImportTitle: 'Import CLI',
        codexImportDirectory: 'Server directory',
        codexImportDirectoryPlaceholder: 'Windows / Linux / ~/ path',
        codexImportRefresh: 'Check login state',
        codexManualDirectory: 'Enter path manually',
        codexSourceDefault: 'Default',
        codexAddAccount: 'Add account',
        codexAddWeb: 'Browser sign-in',
        codexAddCli: 'Import CLI',
        codexAddWebContinue: 'Continue in browser',
        codexAddName: 'Account name (optional)',
        codexBrowseDirectory: 'Choose directory…',
        codexBrowseSelect: 'Choose this directory',
        codexBrowseCancel: 'Cancel selection',
        codexBrowseError: 'Unable to browse Host directories',
        codexBrowseTruncated: 'Only some directories are shown.',
        codexSourcePolicy: 'Discovery rules',
        codexImportLoading: 'Loading directories…',
        codexImportLoadError: 'Unable to load CLI sources',
        codexImportDirectoryInvalid: 'Enter an absolute server path, a Windows drive path, or ~/.',
        codexImportNoSources: 'No login state found. Choose another directory.',
        codexImportAvailable: 'Ready to import',
        codexImportExpired: 'Expired; import is allowed but authorization may need refreshing',
        codexImportAdded: 'Imported into the pool; the current account was not changed',
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
        codexImportNameLabel: 'Account name (optional, defaults to the email)',
        codexImportNamePlaceholder: 'e.g. Work account',
        codexImportSubmit: 'Import login state',
        codexImportHint: 'Directories are on the DSH host; its default path is shown below. Import does not switch the current account.',
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
        .provider-hub-pool-action { color:var(--dsw-alias-label-secondary); font:inherit; font-size:12px; line-height:18px; background:transparent; border:1px solid var(--dsw-alias-border-l3); border-radius:6px; padding:2px 8px; cursor:pointer }
        .provider-hub-pool-action:hover { background:var(--dsw-alias-interactive-bg-hover) }
        .provider-hub-pool-action:focus-visible { outline:2px solid var(--dsw-focus-ring-color,var(--dsw-alias-brand-primary)); outline-offset:2px }
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
        .provider-hub-ui .ph-spark-chart { position:relative; flex:1; min-width:0; height:72px }
        .provider-hub-ui .ph-spark { display:block; width:100%; height:72px; color:var(--dsw-alias-label-secondary) }
        .provider-hub-ui .ph-spark-y-axis { position:relative; flex:none; width:32px; height:72px; color:var(--dsw-alias-label-tertiary); font:10px/12px ui-monospace,SFMono-Regular,monospace; text-align:right }
        .provider-hub-ui .ph-spark-y-axis > span { position:absolute; right:0; transform:translateY(-50%) }
        .provider-hub-ui .ph-spark-grid { stroke:currentColor; opacity:.12 }
        .provider-hub-ui .ph-spark-leader { stroke:currentColor; opacity:.45 }
        .provider-hub-ui .ph-spark-value { position:absolute; height:16px; padding:1px 4px; border-radius:3px; color:var(--dsw-alias-label-primary); background:var(--dsw-alias-bg-layer-1); font:600 11px/14px ui-monospace,SFMono-Regular,monospace; font-variant-numeric:tabular-nums; text-align:center; white-space:nowrap; pointer-events:none }
        .provider-hub-ui .ph-spark-fill { fill:currentColor; opacity:.14 }
        .provider-hub-ui .ph-spark-hit { fill:transparent }
        .provider-hub-ui .ph-spark-plan { stroke:currentColor; opacity:.45 }
        .provider-hub-ui .ph-spark-tip { position:absolute; bottom:calc(100% + 6px); transform:translateX(-50%); padding:3px 8px; border:.5px solid var(--dsw-alias-border-l3); border-radius:var(--dsw-radius-sm,6px); background:var(--dsw-alias-bg-layer-2,var(--dsw-alias-bg-layer-1)); color:var(--dsw-alias-label-primary); font-size:11px; font-variant-numeric:tabular-nums; white-space:nowrap; pointer-events:none; z-index:1 }
        .provider-hub-ui .ph-spark-axis { display:flex; margin:0 0 0 40px; padding-top:4px; border-top:1px solid var(--dsw-alias-border, rgba(128,128,128,.3)); color:var(--dsw-alias-label-tertiary); font-size:10px; font-variant-numeric:tabular-nums }
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
        .provider-hub-ui .ph-pool-bar { display:grid; grid-template-columns:minmax(0,1fr) auto; align-items:start; gap:8px; min-width:0 }
        .provider-hub-ui .ph-pool-bar .ph-account-picker > .ph-muted { display:none }
        .provider-hub-ui .ph-pool-toolbar { display:flex; width:112px; min-width:112px; min-height:34px; align-items:flex-start }
        .provider-hub-ui .ph-pool-toolbar > .ph-button { width:100%; min-width:0; padding-inline:6px; white-space:nowrap }
        .provider-hub-ui .ph-account-picker { min-width:0; display:flex; flex-direction:column; gap:6px }
        .provider-hub-ui .ph-picker-trigger { width:100%; display:flex; justify-content:space-between; gap:8px; text-align:left }
        .provider-hub-ui .ph-account-name { min-width:0; flex:1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; text-align:left }
        .provider-hub-ui .ph-account-state { flex:none; font-size:11px; color:var(--dsw-alias-label-tertiary) }
        .provider-hub-ui .ph-account-list { list-style:none; margin:0; padding:4px; max-height:320px; overflow:auto; border:.5px solid var(--dsw-alias-border-l3); border-radius:8px }
        .provider-hub-ui .ph-account-row { display:flex; align-items:center; gap:4px; min-width:0; padding:2px }
        .provider-hub-ui .ph-account-row[data-selected=true] { background:var(--dsw-alias-interactive-bg-hover); border-radius:6px }
        .provider-hub-ui .ph-account-choice { border:0; flex:1; min-width:0; display:flex; gap:8px; justify-content:flex-start }
        .provider-hub-ui .ph-icon-button { flex:none; width:34px; padding:4px }
        .provider-hub-ui .ph-pool-rename { display:flex; align-items:center; flex-wrap:wrap; flex:1; min-width:0; gap:6px }
        .provider-hub-ui .ph-pool-rename > input { flex:1 1 120px; width:0; min-width:0 }
        @media (max-width:380px) { .provider-hub-ui .ph-pool-toolbar { gap:4px } .provider-hub-ui .ph-pool-toolbar > .ph-button { font-size:12px; padding-inline:3px } }
        .provider-hub-ui .ph-account-meta { display:flex; flex-direction:column; gap:3px; margin:6px 0 10px; min-width:0; overflow-wrap:anywhere }
        .provider-hub-ui .ph-import { display:flex; flex-direction:column; gap:10px; margin-top:12px; padding-top:12px; border-top:.5px solid var(--dsw-alias-border-l3); min-width:0 }
        .provider-hub-ui .ph-source-details { margin:0; display:flex; flex-direction:column; gap:3px; overflow-wrap:anywhere; word-break:break-word }
        .provider-hub-ui .ph-source-path { font:12px/1.6 ui-monospace,SFMono-Regular,monospace; white-space:pre-wrap }
        .provider-hub-ui .ph-import .ph-answer-label { flex-basis:260px }
        .provider-hub-ui .ph-import select { max-width:100% }
        .provider-hub-ui .ph-directory-browser { min-width:0; padding:10px; display:flex; flex-direction:column; gap:8px; border:.5px solid var(--dsw-alias-border-l3); border-radius:8px }
        .provider-hub-ui .ph-directory-list { list-style:none; margin:0; padding:0; max-height:260px; overflow:auto }
        .provider-hub-ui .ph-directory-entry { width:100%; justify-content:flex-start; gap:8px; border:0 }
        .provider-hub-ui .ph-add-methods { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:4px }
        .provider-hub-ui .ph-add-methods [aria-pressed=true] { background:var(--dsw-alias-interactive-bg-hover); border-color:var(--dsw-alias-brand-primary) }
        .provider-hub-ui .ph-web-login { display:flex; flex:1 1 260px; flex-direction:column; gap:8px; min-width:0 }
        .provider-hub-ui .ph-web-login > .ph-answer-label { flex:none }
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
      // Fixed 0–100% vertical axis: usage percentages compare against the
      // whole window, so the curve height is meaningful without per-series
      // rescaling. Hover (or the native <title> fallback) names each sample.
      function QuotaSpark({ points, kind, hours, windowEnd, sampleIntervalSeconds = 3600 }) {
        const [hover, setHover] = React.useState(null)
        const chart = React.useRef()
        const [chartWidth, setChartWidth] = React.useState(240)
        React.useEffect(() => {
          const measure = () => {
            const width = chart.current?.getBoundingClientRect?.().width
            if (Number.isFinite(width) && width > 0) setChartWidth(width)
          }
          measure()
          if (typeof ResizeObserver !== 'function' || !chart.current) return
          const observer = new ResizeObserver(measure)
          observer.observe(chart.current)
          return () => observer.disconnect()
        }, [])
        const span = hours * 3600
        const start = windowEnd - span
        const valid = points.map(point => ({ ts: point?.ts, value: point?.used?.[kind], sampleIntervalSeconds: Number.isFinite(point?.sampleIntervalSeconds) && point.sampleIntervalSeconds > 0 ? point.sampleIntervalSeconds : 3600, plan: typeof point?.plan === 'string' && point.plan ? point.plan : undefined }))
          .filter(pair => Number.isFinite(pair.ts) && pair.ts >= start && pair.ts <= windowEnd && Number.isFinite(pair.value))
        const pairs = Array.from(new Map(valid.map(pair => [pair.ts, pair])).values()).sort((a, b) => a.ts - b.ts)
        const xOf = pair => ((pair.ts - start) / span) * 100
        const yOf = value => (22 - (Math.min(Math.max(value, 0), 100) / 100) * 20).toFixed(2)
        const coord = pair => `${xOf(pair).toFixed(3)},${yOf(pair.value)}`
        // The store dedupes hourly, but sample timestamps need not sit on the
        // hour. Allow normal cadence jitter without bridging real long gaps.
        const segments = []
        for (const pair of pairs) {
          const previous = segments.at(-1)?.at(-1)
          if (!previous || pair.ts - previous.ts > Math.max(3600, previous.sampleIntervalSeconds, pair.sampleIntervalSeconds) * 1.5) segments.push([])
          segments.at(-1).push(pair)
        }
        const tipOf = pair => {
          const base = t('sparkTip', { stamp: quotaAxisStamp(pair.ts, 0), used: Math.round(pair.value) })
          return pair.plan ? `${base} · ${pair.plan}` : base
        }
        const planMarks = []
        for (let index = 1; index < pairs.length; index++) {
          if (pairs[index].plan && pairs[index - 1].plan && pairs[index].plan !== pairs[index - 1].plan) planMarks.push(index)
        }
        // Label a bounded set of real observations, never the empty domain
        // boundaries. Endpoints win, then extrema, the largest drop and a plan
        // change. Short histories in a 30d domain can cluster at one edge, so
        // labels use measured pixel boxes and up to four non-overlapping lanes.
        const candidates = []
        const nominate = (index, reason) => { if (index >= 0 && !candidates.some(candidate => candidate.index === index)) candidates.push({ index, reason }) }
        if (pairs.length) {
          nominate(0, 'first'); nominate(pairs.length - 1, 'last')
          nominate(pairs.reduce((best, pair, index) => pair.value < pairs[best].value ? index : best, 0), 'min')
          nominate(pairs.reduce((best, pair, index) => pair.value > pairs[best].value ? index : best, 0), 'max')
          let reset = -1
          let drop = 0
          for (let index = 1; index < pairs.length; index++) {
            const delta = pairs[index - 1].value - pairs[index].value
            if (delta > drop) { reset = index; drop = delta }
          }
          nominate(reset, 'reset')
          if (planMarks.length) nominate(planMarks.at(-1), 'plan')
        }
        const labels = []
        for (const candidate of candidates.slice(0, 6)) {
          const pair = pairs[candidate.index]
          const text = `${Math.round(pair.value)}%`
          const width = Math.min(chartWidth, text.length * 7 + 8)
          const x = xOf(pair)
          const pixelX = x * chartWidth / 100
          const left = Math.max(0, Math.min(chartWidth - width, pixelX - width / 2))
          const pointY = Number(yOf(pair.value)) * 3 // 24 SVG units = 72px.
          const lanes = [0, 18, 36, 54].filter(lane => pointY < lane - 3 || pointY > lane + 19)
            .sort((a, b) => Math.abs(a + 8 - (pointY - 12)) - Math.abs(b + 8 - (pointY - 12)))
          const top = lanes.find(lane => !labels.some(label => left < label.left + label.width + 4 && left + width + 4 > label.left && lane < label.top + 18 && lane + 18 > label.top))
          if (top === undefined) continue
          labels.push({ ...candidate, pair, text, width, left, x, pixelX, top })
        }
        return e('div', { className: 'ph-spark-block', 'data-quota-spark-wrap': kind, 'data-quota-window-start': start, 'data-quota-window-end': windowEnd, 'data-quota-sample-interval': sampleIntervalSeconds },
          e('div', { className: 'ph-spark-wrap' },
            e('div', { className: 'ph-spark-y-axis', 'data-quota-spark-y-axis': true }, ...[100, 50, 0].map(value => e('span', { key: value, 'data-quota-spark-y-tick': String(value), style: { top: `${Number(yOf(value)) / 24 * 100}%` } }, `${value}%`))),
            e('div', { ref: chart, className: 'ph-spark-chart' },
              e('svg', { className: 'ph-spark', viewBox: '0 0 100 24', preserveAspectRatio: 'none', role: 'img', 'aria-label': t('sparkAria'), 'data-quota-spark': kind },
                ...[100, 50, 0].map(value => e('line', { key: `grid-${value}`, className: 'ph-spark-grid', x1: 0, x2: 100, y1: yOf(value), y2: yOf(value), strokeWidth: 1, vectorEffect: 'non-scaling-stroke' })),
                ...segments.map((segment, index) => segment.length === 1
                  ? e('circle', { key: `segment-${index}`, cx: xOf(segment[0]).toFixed(3), cy: yOf(segment[0].value), r: .7, fill: 'currentColor', 'data-quota-spark-point': true })
                  : e('g', { key: `segment-${index}`, 'data-quota-spark-segment': true },
                    e('polygon', { className: 'ph-spark-fill', points: `${xOf(segment[0]).toFixed(3)},24 ${segment.map(coord).join(' ')} ${xOf(segment.at(-1)).toFixed(3)},24` }),
                    e('polyline', { points: segment.map(coord).join(' '), fill: 'none', stroke: 'currentColor', strokeWidth: 2, vectorEffect: 'non-scaling-stroke' }))),
                ...planMarks.map(index => e('line', { key: `plan-${index}`, className: 'ph-spark-plan', 'data-quota-spark-plan': String(index), x1: xOf(pairs[index]).toFixed(3), x2: xOf(pairs[index]).toFixed(3), y1: 2, y2: 22, strokeWidth: 1, vectorEffect: 'non-scaling-stroke' }, e('title', null, t('planChangeTitle', { from: pairs[index - 1].plan, to: pairs[index].plan })))),
                ...labels.map(label => e('g', { key: `value-${label.pair.ts}` },
                  e('line', { className: 'ph-spark-leader', 'data-quota-spark-label-leader': label.pair.ts, x1: label.x.toFixed(3), x2: label.x.toFixed(3), y1: yOf(label.pair.value), y2: ((label.top + 8) / 3).toFixed(3), strokeWidth: 1, vectorEffect: 'non-scaling-stroke' }),
                  e('circle', { cx: label.x.toFixed(3), cy: yOf(label.pair.value), r: .6, fill: 'currentColor', 'data-quota-spark-label-point': label.pair.ts }))),
                ...pairs.map((pair, index) => {
                  const x = xOf(pair)
                  const left = Math.max(0, x - 1, index ? (xOf(pairs[index - 1]) + x) / 2 : 0)
                  const right = Math.min(100, x + 1, index + 1 < pairs.length ? (x + xOf(pairs[index + 1])) / 2 : 100)
                  return e('rect', { key: `hit-${index}`, className: 'ph-spark-hit', 'data-quota-spark-hit': String(index), 'data-quota-spark-ts': pair.ts, x: left.toFixed(3), y: 0, width: Math.max(0, right - left).toFixed(3), height: 24, onMouseEnter: () => setHover(pair.ts), onMouseLeave: () => setHover(null) }, e('title', null, tipOf(pair)))
                }),
              ),
              ...labels.map(label => e('span', { key: `label-${label.pair.ts}`, className: 'ph-spark-value', 'data-quota-spark-value': label.pair.ts, 'data-quota-spark-value-reason': label.reason, 'data-quota-spark-value-x': label.x, style: { left: `${label.x}%`, marginLeft: `${label.left - label.pixelX}px`, top: `${label.top}px`, width: `${label.width}px` } }, label.text)),
              pairs.some(pair => pair.ts === hover) ? e('span', { className: 'ph-spark-tip', 'data-quota-spark-tip': String(pairs.findIndex(pair => pair.ts === hover)), style: { left: `${Math.min(96, Math.max(4, xOf(pairs.find(pair => pair.ts === hover))))}%` } }, tipOf(pairs.find(pair => pair.ts === hover))) : null)),
          !pairs.length ? e('p', { className: 'ph-muted', 'data-quota-spark-empty': true }, t('historyEmpty')) : null,
          e('div', { className: 'ph-spark-axis', 'data-quota-spark-axis': true },
            ...[['start', start], ['mid', start + span / 2], ['end', windowEnd]].map(([position, ts]) => e('span', { key: position, 'data-quota-spark-tick': position, 'data-quota-spark-tick-ts': ts }, quotaAxisStamp(ts, span)))))
      }
      function QuotaPanel({ quota, provider, keyId, grantId, title, initialMaxAgeMs = 300000 }) {
        const [view, setView] = React.useState()
        const [history, setHistory] = React.useState(() => ({ points: [], hours: 168, end: Math.floor(Date.now() / 1000), sampleIntervalSeconds: 3600 }))
        const [range, setRange] = React.useState(168)
        const points = history.hours === range ? history.points : []
        const historyRequest = React.useRef(0)
        const [busy, setBusy] = React.useState(false)
        const mounted = React.useRef(true)
        const busyRef = React.useRef(false)
        const historyEnabled = React.useRef(false)
        const unsupported = provider === 'xiaomi-token-plan-cn' || view?.status === 'unsupported'
        const rangeRef = React.useRef(range)
        rangeRef.current = range
        React.useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
        const quotaUnwrap = result => { if (!result?.ok) throw new Error(result?.error?.message || t('noticeNetwork')); return result.value }
        const loadHistory = React.useCallback(async () => {
          if (!historyEnabled.current) return
          const generation = ++historyRequest.current
          const hours = rangeRef.current
          const end = Math.floor(Date.now() / 1000)
          // Domain and data travel together; a new range never borrows the last
          // range's samples, even if an older request for the same hours arrives.
          setHistory(previous => previous.hours === hours ? previous : { points: [], hours, end, sampleIntervalSeconds: previous.sampleIntervalSeconds })
          try {
            const value = quotaUnwrap(await quota.history({ provider, keyId, grantId, hours }))
            if (mounted.current && generation === historyRequest.current) setHistory({ points: Array.isArray(value?.points) ? value.points : [], hours, end, sampleIntervalSeconds: Number.isFinite(value?.sampleIntervalSeconds) && value.sampleIntervalSeconds > 0 ? value.sampleIntervalSeconds : 3600 })
          } catch { /* Keep only this range's previous data; stale failures do nothing. */ }
        }, [quota, provider, keyId, grantId])
        const load = React.useCallback(async maxAgeMs => {
          if (busyRef.current) return
          busyRef.current = true
          setBusy(true)
          try {
            const value = quotaUnwrap(await quota.snapshot({ provider, keyId, grantId, maxAgeMs }))
            if (!mounted.current) return
            setView(value)
            historyEnabled.current = provider !== 'xiaomi-token-plan-cn' && value?.status !== 'unsupported'
            if (historyEnabled.current) await loadHistory()
            else historyRequest.current++
          } catch (error) {
            if (mounted.current) {
              setView({ status: 'network', message: error?.message || t('noticeNetwork') })
              historyEnabled.current = provider !== 'xiaomi-token-plan-cn'
              if (historyEnabled.current) await loadHistory()
            }
          } finally {
            busyRef.current = false
            if (mounted.current) setBusy(false)
          }
        }, [quota, provider, keyId, grantId, loadHistory])
        React.useEffect(() => { void load(initialMaxAgeMs) }, [load, initialMaxAgeMs])
        // The recorder appends hourly while the panel stays open; keep the
        // curve current without asking the user to revisit or refresh.
        React.useEffect(() => {
          if (unsupported || !view) return
          const timer = setInterval(() => { void loadHistory() }, 60_000)
          return () => clearInterval(timer)
        }, [loadHistory, unsupported, !!view])
        const snapshot = unsupported ? undefined : view?.status === 'ok' ? view.snapshot : view?.lastSnapshot
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
          view && !unsupported ? e(React.Fragment, null,
          e('div', { className: 'ph-quota-head' },
            e('span', { className: 'ph-muted' }, t('historyTitle')),
            e('div', { className: 'ph-ranges', role: 'group', 'aria-label': t('historyRange') },
              e('button', { className: 'ph-button ph-range', type: 'button', 'aria-pressed': range === 24, 'data-quota-range': '24', onClick: () => { setRange(24); rangeRef.current = 24; void loadHistory() } }, t('range24')),
              e('button', { className: 'ph-button ph-range', type: 'button', 'aria-pressed': range === 168, 'data-quota-range': '168', onClick: () => { setRange(168); rangeRef.current = 168; void loadHistory() } }, t('range168')),
              e('button', { className: 'ph-button ph-range', type: 'button', 'aria-pressed': range === 720, 'data-quota-range': '720', onClick: () => { setRange(720); rangeRef.current = 720; void loadHistory() } }, t('range720')),
            ),
          ),
          e(QuotaSpark, { key: 'spark-history', points, kind: points.some(point => Number.isFinite(point?.used?.weekly)) || !points.some(point => Number.isFinite(point?.used?.short)) ? 'weekly' : 'short', hours: range, windowEnd: history.end, sampleIntervalSeconds: history.sampleIntervalSeconds })) : null,
        )
      }
      function LoginCard({ provider, remote: login, quota, accounts, workspace }) {
        const providerId = provider?.provider
        if (!allowed.has(providerId)) return null
        const key = `llm-pi-ai/${providerId}`
        const [entry, setEntry] = React.useState()
        const [attempt, setAttempt] = React.useState()
        const [busy, setBusy] = React.useState(false)
        const [cancelling, setCancelling] = React.useState(false)
        const [answering, setAnswering] = React.useState(false)
        const commandPending = React.useRef(false)
        const [error, setError] = React.useState()
        const mounted = React.useRef(true)
        const generation = React.useRef(0)
        const attemptId = React.useRef()
        const startPending = React.useRef(false)
        const authorizedAttempt = React.useRef()
        const [accountName, setAccountName] = React.useState('')
        const [accountGeneration, setAccountGeneration] = React.useState(0)
        const [quotaGeneration, setQuotaGeneration] = React.useState(0)
        const [accountsBusy, setAccountsBusy] = React.useState(false)
        const accountLock = React.useRef(false)
        React.useEffect(() => { mounted.current = true; return () => { mounted.current = false; generation.current++ } }, [])
        const applyView = React.useCallback(view => {
          if (!mounted.current || (attemptId.current && view.id && attemptId.current !== view.id)) return
          attemptId.current = view.id || undefined
          setAttempt(view)
          setBusy(!terminal(view.status))
          if (terminal(view.status)) { setCancelling(false); startPending.current = false; accountLock.current = false }
          if (view.status === 'authorized' && authorizedAttempt.current !== (view.id || generation.current)) {
            authorizedAttempt.current = view.id || generation.current
            setAccountGeneration(value => value + 1)
            setQuotaGeneration(value => value + 1)
          }
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
        const accountsChanged = async () => {
          if (!mounted.current) return
          setQuotaGeneration(value => value + 1)
          await refresh()
        }
        const start = async () => {
          if (startPending.current || accountLock.current || busy || entry?.inFlight) return
          startPending.current = true
          accountLock.current = true
          const revision = ++generation.current
          attemptId.current = undefined
          setAttempt(undefined); setBusy(true); setCancelling(false); setError(undefined)
          try {
            const view = unwrap(await login.start({ key, ...(accountName.trim() ? { accountName: accountName.trim() } : {}) }))
            if (!mounted.current || generation.current !== revision) return
            applyView(view)
            if (terminal(view.status)) await refresh()
          } catch (error) {
            if (mounted.current && generation.current === revision) { startPending.current = false; accountLock.current = false; setBusy(false); setError(error?.message || t('loginFailed')) }
          }
        }
        const answer = async event => {
          event.preventDefault()
          const id = attemptId.current
          if (!id || commandPending.current) return
          const value = event.currentTarget.elements.answer.value
          commandPending.current = true
          setAnswering(true); setError(undefined)
          try {
            const view = unwrap(await login.answer(id, value))
            if (attemptId.current === id) {
              applyView(view)
              if (terminal(view.status)) await refresh()
            }
          } catch (error) { if (mounted.current) setError(error?.message || t('errorAnswer')) }
          finally { commandPending.current = false; if (mounted.current) setAnswering(false) }
        }
        const cancel = async () => {
          const id = attemptId.current
          if (!id || commandPending.current) return
          commandPending.current = true
          setCancelling(true); setError(undefined)
          try {
            const view = unwrap(await login.cancel(id))
            if (attemptId.current === id) applyView(view)
          } catch (error) { if (mounted.current) { setCancelling(false); setError(error?.message || t('errorCancel')) } }
          finally { commandPending.current = false }
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
          ),
          // The provider action owns lazy mounting. Both account-add methods
          // share one form inside this revealed management surface.
          quota || accounts ? e(React.Fragment, null,
            accounts ? e(CodexAccountsCard, { accounts, quota, workspace, quotaGeneration, reloadToken: accountGeneration, onChanged: accountsChanged, disabled: !!(busy || otherSurface), operationLock: accountLock, onBusyChange: setAccountsBusy, authorized: entry?.authorized, accountName, setAccountName, onWebLogin: start }) : null,
          ) : null,
          canCancel ? e('button', { className: 'ph-button', type: 'button', 'data-login-action': 'cancel', disabled: cancelling || answering, onClick: cancel }, cancelling ? t('actionCancelling') : t('actionCancel')) : null,
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
                ? e('select', { className: 'ph-answer-control', name: 'answer', 'aria-label': prompt.message, disabled: cancelling || answering }, ...(prompt.options ?? []).map(option => e('option', { key: option.id, value: option.id }, option.label)))
                : e('input', { className: 'ph-answer-control', name: 'answer', type: prompt.kind === 'secret' ? 'password' : 'text', placeholder: prompt.placeholder || prompt.message, 'aria-label': prompt.message, autoComplete: prompt.kind === 'secret' ? 'new-password' : 'off', disabled: cancelling || answering, autoFocus: true }),
            ),
            e('button', { className: 'ph-button ph-primary', type: 'submit', 'data-login-action': 'submit', disabled: cancelling || answering }, t('submit')),
          ) : null,
          loginError ? e('div', { className: 'ph-error', role: 'alert' }, e('p', null, loginError)) : null,
        )
      }
      // API-key providers get the same quota surface plus their key pool: the
      // active key is the official credential reference, pool entries are extra
      // named keys whose secrets live only in the DSH credential store.
      const keyPoolProviders = new Set(['xiaomi-token-plan-cn', 'zai', 'zai-coding-cn', 'kimi-coding'])
      const keyPoolLabels = { 'xiaomi-token-plan-cn': 'Xiaomi Token Plan CN', zai: 'Z.AI', 'zai-coding-cn': 'Z.AI Coding CN', 'kimi-coding': 'Kimi For Coding' }
      // Disclosure with ordinary buttons, not a listbox: each row also owns an
      // inline editor, which must not be nested inside an option or a button.
      function HostDirectoryBrowser({ workspace, onSelect, onCancel }) {
        const [view, setView] = React.useState()
        const [busy, setBusy] = React.useState(false)
        const [error, setError] = React.useState()
        const generation = React.useRef(0)
        const mounted = React.useRef(true)
        const request = React.useRef()
        const browse = async path => {
          const revision = ++generation.current
          request.current?.abort()
          const controller = typeof AbortController === 'function' ? new AbortController() : undefined
          request.current = controller
          setBusy(true); setError(undefined)
          try {
            const result = await workspace.listDirectory(path, controller?.signal)
            if (mounted.current && revision === generation.current) setView(result)
          } catch (failure) {
            if (!mounted.current || revision !== generation.current) return
            if (failure?.rpcError?.code === 'directory-picker/unavailable' && failure?.rpcError?.details?.capability === 'native') {
              try {
                const selected = await workspace.pickDirectory()
                if (mounted.current && revision === generation.current && selected) onSelect(typeof selected === 'string' ? selected : selected.path)
              } catch (nativeFailure) { if (mounted.current && revision === generation.current) setError(`${t('codexBrowseError')}：${nativeFailure?.message || ''}`) }
            } else setError(`${t('codexBrowseError')}：${failure?.message || ''}`)
          } finally { if (mounted.current && revision === generation.current) setBusy(false) }
        }
        React.useEffect(() => { mounted.current = true; void browse(); return () => { mounted.current = false; generation.current++; request.current?.abort() } }, [workspace])
        return e('section', { className: 'ph-directory-browser', 'data-directory-browser': true, 'aria-label': t('codexBrowseDirectory'), 'aria-busy': busy },
          view ? e(React.Fragment, null,
            e('nav', { className: 'ph-actions', 'aria-label': t('codexImportDirectory') }, ...(view.crumbs || []).map(crumb => e('button', { type: 'button', key: crumb.path, className: 'ph-button ph-range', disabled: busy, onClick: () => browse(crumb.path), title: crumb.path }, crumb.name))),
            e('p', { className: 'ph-source-path', 'data-directory-path': true }, view.path),
            e('ul', { className: 'ph-directory-list' }, ...(view.entries || []).map(entry => e('li', { key: entry.path }, e('button', { type: 'button', className: 'ph-button ph-directory-entry', disabled: busy, title: entry.path, onClick: () => browse(entry.path), 'data-directory-entry': entry.path }, e('span', { 'aria-hidden': true }, '▸'), e('span', { className: 'ph-account-name' }, entry.name))))),
            view.truncated ? e('p', { className: 'ph-muted' }, t('codexBrowseTruncated')) : null) : null,
          error ? e('p', { className: 'ph-error', role: 'alert', 'data-directory-error': true }, error) : null,
          e('div', { className: 'ph-actions' },
            e('button', { type: 'button', className: 'ph-button ph-primary', disabled: busy || !view?.path, 'data-directory-action': 'select', onClick: () => onSelect(view.path) }, t('codexBrowseSelect')),
            error ? e('button', { type: 'button', className: 'ph-button', disabled: busy, onClick: () => browse(view?.path) }, t('quotaRefresh')) : null,
            e('button', { type: 'button', className: 'ph-button', 'data-directory-action': 'cancel', onClick: onCancel }, t('codexBrowseCancel'))),
        )
      }
      function AccountPicker({ entries, selected, onSelect, onRename, onDrop, canDrop = () => true, disabled, kind, label }) {
        const [open, setOpen] = React.useState(false)
        const [editing, setEditing] = React.useState('')
        const [draft, setDraft] = React.useState('')
        const pending = React.useRef(false)
        const trigger = React.useRef()
        const list = React.useRef()
        const focusEdge = React.useRef()
        const editingRef = React.useRef()
        const restoreFocus = React.useRef(false)
        const [focusTicket, setFocusTicket] = React.useState(0)
        React.useEffect(() => { if (restoreFocus.current && !disabled && !editing) { restoreFocus.current = false; trigger.current?.focus() } }, [disabled, editing, focusTicket])
        const nameOf = entry => entry.name || entry.email || entry.id
        const close = () => { if (disabled || pending.current) return; setOpen(false); setEditing(''); trigger.current?.focus() }
        React.useEffect(() => {
          if (open && focusEdge.current) {
            const buttons = list.current?.querySelectorAll('[data-account-choice]')
            const target = focusEdge.current === 'last' ? buttons?.[buttons.length - 1] : buttons?.[0]
            target?.focus(); focusEdge.current = undefined
          }
        }, [open])
        React.useEffect(() => { if (editing) editingRef.current?.focus() }, [editing])
        const keyDown = event => {
          if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); if (editing && !disabled && !pending.current) { setEditing(''); trigger.current?.focus() } else close(); return }
          if (disabled || editing || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
          event.preventDefault()
          const buttons = Array.from(list.current?.querySelectorAll('[data-account-choice]') || [])
          const index = buttons.indexOf(event.target)
          const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length
          buttons[next]?.focus()
        }
        const save = async (event, entry) => {
          event.preventDefault(); event.stopPropagation()
          if (disabled || pending.current || !draft.trim()) return
          pending.current = true
          try { if (await onRename(entry, draft.trim())) { restoreFocus.current = true; setEditing('') } }
          finally { pending.current = false }
        }
        const drop = async (event, entry) => {
          event.stopPropagation()
          if (disabled || pending.current || !canDrop(entry)) return
          pending.current = true
          try { if (await onDrop(entry)) { restoreFocus.current = true; setFocusTicket(value => value + 1) } }
          finally { pending.current = false }
        }
        return e('div', { className: 'ph-account-picker', 'data-account-picker': kind,
          onBlur: event => { if (!event.currentTarget.contains(event.relatedTarget) && !pending.current) { setOpen(false); setEditing('') } } },
          e('span', { className: 'ph-muted' }, label),
          e('button', { ref: trigger, type: 'button', className: 'ph-button ph-picker-trigger', disabled, 'aria-expanded': open, 'aria-label': `${label}: ${selected ? nameOf(selected) : '—'}`, [`data-${kind}-select`]: true, 'data-selected-id': selected?.id || '',
            onClick: () => { if (!disabled) { setOpen(value => !value); setEditing('') } },
            onKeyDown: event => { if (!disabled && ['ArrowDown', 'ArrowUp'].includes(event.key)) { event.preventDefault(); const edge = event.key === 'ArrowUp' ? 'last' : 'first'; if (open) { const choices = list.current?.querySelectorAll('[data-account-choice]'); (edge === 'last' ? choices?.[choices.length - 1] : choices?.[0])?.focus() } else { focusEdge.current = edge; setOpen(true) } } else if (event.key === 'Escape') close() } },
            e('span', { className: 'ph-account-name', title: selected ? nameOf(selected) : '' }, selected ? nameOf(selected) : '—'),
            selected?.active ? e('span', { className: 'ph-account-state' }, t('poolEntryActive')) : null,
            e('span', { 'aria-hidden': true }, open ? '▴' : '▾')),
          open ? e('ul', { ref: list, className: 'ph-account-list', 'aria-label': label, onKeyDown: keyDown, 'data-account-list': kind },
            ...entries.map(entry => e('li', { key: entry.id, className: 'ph-account-row', 'data-account-row': entry.id, 'data-selected': selected?.id === entry.id ? 'true' : 'false' },
              editing === entry.id ? e('form', { className: 'ph-pool-rename', [`data-${kind}-rename`]: entry.id, onSubmit: event => save(event, entry) },
                e('input', { ref: editingRef, className: 'ph-answer-control', name: 'name', value: draft, disabled, 'aria-label': t('poolRenameLabel'), autoComplete: 'off', onChange: event => setDraft(event.target.value) }),
                e('button', { type: 'submit', className: 'ph-button ph-icon-button', disabled: disabled || !draft.trim(), title: t('poolRenameSave'), 'aria-label': t('poolRenameSave'), 'data-account-edit': 'save' }, '✓'),
                e('button', { type: 'button', className: 'ph-button ph-icon-button', disabled, title: t('poolRenameCancel'), 'aria-label': t('poolRenameCancel'), 'data-account-edit': 'cancel', onClick: event => { event.stopPropagation(); if (!disabled && !pending.current) { setEditing(''); trigger.current?.focus() } } }, '×'))
                : e(React.Fragment, null,
                  e('button', { type: 'button', className: 'ph-button ph-account-choice', disabled, 'aria-pressed': selected?.id === entry.id, 'aria-label': t('poolChooseAccount', { name: nameOf(entry) }), title: nameOf(entry), 'data-account-choice': entry.id, [`data-${kind}-option`]: entry.id,
                    onClick: () => { if (!disabled && !pending.current) { onSelect(entry.id); setOpen(false); trigger.current?.focus() } } },
                    e('span', { className: 'ph-account-name' }, nameOf(entry)), entry.accountType === 'team' ? e('span', { className: 'ph-account-state', 'data-account-team': true }, t('poolAccountTeam')) : null, entry.active ? e('span', { className: 'ph-account-state' }, t('poolEntryActive')) : null),
                  onRename ? e('button', { type: 'button', className: 'ph-button ph-icon-button', disabled, title: t('poolRenameAccount', { name: nameOf(entry) }), 'aria-label': t('poolRenameAccount', { name: nameOf(entry) }), 'data-account-rename': entry.id,
                    onClick: event => { event.stopPropagation(); if (!disabled && !pending.current) { setEditing(entry.id); setDraft(nameOf(entry)) } } }, e('svg', { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, 'aria-hidden': true }, e('path', { d: 'm15 5 4 4M4 20l4-1L20 7a2.8 2.8 0 0 0-4-4L4 15v5Z' }))) : null,
                  onDrop ? e('button', { type: 'button', className: 'ph-button ph-icon-button', disabled: disabled || !canDrop(entry), title: t('poolRemoveAccount', { name: nameOf(entry) }), 'aria-label': t('poolRemoveAccount', { name: nameOf(entry) }), 'data-account-drop': entry.id, onClick: event => drop(event, entry) }, e('svg', { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, 'aria-hidden': true }, e('path', { d: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 10v7m4-7v7' }))) : null)))) : null,
        )
      }
      function KeyPoolCard({ provider, pool, quota, keyConfigured }) {
        const [entries, setEntries] = React.useState([])
        const [loaded, setLoaded] = React.useState(false)
        const [quotaGeneration, setQuotaGeneration] = React.useState(0)
        const [selectedId, setSelectedId] = React.useState('')
        const [busy, setBusy] = React.useState(false)
        const [adding, setAdding] = React.useState(false)
        const [accountType, setAccountType] = React.useState('personal')
        const supportsTeam = provider === 'zai' || provider === 'zai-coding-cn'
        const [error, setError] = React.useState()
        const [notice, setNotice] = React.useState()
        const mounted = React.useRef(true)
        React.useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
        const operation = React.useRef(false)
        const poolUnwrap = result => { if (!result?.ok) throw new Error(result?.error?.message || t('errorReadState')); return result.value }
        const refresh = React.useCallback(async () => {
          try {
            const value = poolUnwrap(await pool.list({ provider }))
            if (mounted.current) { setEntries(Array.isArray(value?.entries) ? value.entries : []); setLoaded(true) }
          } catch (error) { if (mounted.current) setError(error?.message || t('errorReadState')) }
        }, [pool, provider])
        React.useEffect(() => { void refresh() }, [refresh])
        const run = async (action, failureKey, noticeKey) => {
          if (operation.current) return false
          operation.current = true
          setBusy(true); setError(undefined); setNotice(undefined)
          try {
            poolUnwrap(await action())
            if (mounted.current && noticeKey) setNotice(t(noticeKey))
            await refresh()
            if (mounted.current) setQuotaGeneration(value => value + 1)
            return true
          } catch (error) { if (mounted.current) setError(`${t(failureKey)}${error?.message ? `：${error.message}` : ''}`); return false }
          finally { operation.current = false; if (mounted.current) setBusy(false) }
        }
        const add = async event => {
          event.preventDefault()
          const form = event.currentTarget
          const name = form.elements.name.value
          const value = form.elements.value.value
          if (operation.current) return
          const request = { provider, name, value }
          if (supportsTeam) {
            request.accountType = accountType
            if (accountType === 'team') {
              request.organization = form.elements.organization?.value.trim() || ''
              request.project = form.elements.project?.value.trim() || ''
              if (!request.organization || !request.project) { setError(`${t('poolErrorAdd')}：${t('poolScopeRequired')}`); return }
            }
          }
          setAdding(true)
          try {
            if (await run(() => pool.add(request), 'poolErrorAdd', 'poolAdded')) form.reset?.()
          } finally { if (mounted.current) setAdding(false) }
        }
        const submitRename = (entry, name) => run(() => pool.rename({ id: entry.id, name }), 'poolErrorRename', 'poolRenamed')
        // Dropdown selection falls back to the active entry (then the first).
        const selected = entries.find(entry => entry.id === selectedId) ?? entries.find(entry => entry.active) ?? entries[0]
        return e('fieldset', { className: 'ph-switches', 'data-key-pool': provider },
          e('legend', { className: 'ph-heading' }, t('poolGroup')),
          e('p', { className: 'ph-muted' }, t('poolHint')),
          entries.length === 0 ? e('p', { className: 'ph-muted', 'data-pool-empty': true }, t('poolEmpty')) : e('div', { className: 'ph-pool-bar', 'data-pool-bar': true },
            e(AccountPicker, { entries, selected, kind: 'pool', label: t('poolSelectLabel'), disabled: busy, onSelect: setSelectedId, onRename: submitRename, onDrop: entry => run(() => pool.drop({ id: entry.id }), 'poolErrorRemove', 'poolRemoved') }),
            e('div', { className: 'ph-pool-toolbar', 'data-pool-toolbar': true },
              e('button', { className: 'ph-button', type: 'button', 'data-pool-action': 'use', disabled: busy || !selected || selected.active, onClick: () => { if (selected && !selected.active) return run(() => pool.setActive({ id: selected.id }), 'poolErrorSwitch', 'poolSwitched') } }, selected?.active ? t('poolEntryActive') : t('poolActionUse')),
            )),
          quota && loaded && (selected || keyConfigured !== false) ? e(QuotaPanel, { key: `preview-${selected?.id || 'official'}-${quotaGeneration}`, quota, provider, keyId: selected?.id, title: selected?.name || t('quotaActiveKey'), initialMaxAgeMs: quotaGeneration ? 0 : 300000 }) : null,
          notice ? e('p', { className: 'ph-muted', role: 'status', 'data-pool-notice': true }, notice) : null,
          e('form', { onSubmit: add, className: 'ph-answer', 'data-pool-add': true },
            supportsTeam ? e('div', { className: 'ph-add-methods', role: 'group', 'aria-label': t('poolAccountType'), 'data-pool-account-type': true }, ...['personal', 'team'].map(type => e('button', { type: 'button', key: type, className: 'ph-button', 'data-pool-type': type, 'aria-pressed': accountType === type, disabled: busy, onClick: () => { if (!operation.current) setAccountType(type) } }, t(type === 'team' ? 'poolAccountTeam' : 'poolAccountPersonal')))) : null,
            e('label', { className: 'ph-answer-label' },
              e('span', null, t('poolNameLabel')),
              e('input', { className: 'ph-answer-control', name: 'name', placeholder: t('poolNamePlaceholder'), 'aria-label': t('poolNameLabel'), autoComplete: 'off' })),
            e('label', { className: 'ph-answer-label' },
              e('span', null, t('poolValueLabel')),
              e('input', { className: 'ph-answer-control', name: 'value', type: 'password', placeholder: t('poolValuePlaceholder'), 'aria-label': t('poolValueLabel'), autoComplete: 'new-password' })),
            supportsTeam && accountType === 'team' ? e(React.Fragment, null,
              e('label', { className: 'ph-answer-label' }, e('span', null, 'Organization ID'), e('input', { className: 'ph-answer-control', name: 'organization', 'aria-label': 'Organization ID', required: true, disabled: busy, autoComplete: 'off' })),
              e('label', { className: 'ph-answer-label' }, e('span', null, 'Project ID'), e('input', { className: 'ph-answer-control', name: 'project', 'aria-label': 'Project ID', required: true, disabled: busy, autoComplete: 'off' }))) : null,
            e('button', { className: 'ph-button ph-primary', type: 'submit', 'data-pool-action': 'add', disabled: adding || busy }, adding ? t('poolAdding') : t('poolAdd')),
          ),
          error ? e('div', { className: 'ph-error', role: 'alert' }, e('p', null, error)) : null,
        )
      }
      function ApiKeyProviderCard({ provider, quota, pool, keyConfigured }) {
        return e('section', { className: 'provider-hub-ui ph-login', 'data-provider-hub-quota': provider, 'aria-label': keyPoolLabels[provider] || provider },
          e('p', { className: 'ph-muted' }, t('quotaKeyHint')),
          e(KeyPoolCard, { provider, pool, quota, keyConfigured }),
        )
      }
      // Codex account pool: named OAuth grants imported from Codex CLI
      // directories (a second login method beside the browser OAuth flow).
      // Switching an account rewrites the official openai-codex credential.
      function CodexAccountsCard({ accounts, quota, workspace, quotaGeneration, reloadToken, onChanged, disabled, operationLock, onBusyChange, authorized, accountName, setAccountName, onWebLogin }) {
        const [entries, setEntries] = React.useState([])
        const [current, setCurrent] = React.useState()
        const [loaded, setLoaded] = React.useState(false)
        const [sources, setSources] = React.useState([])
        const [policy, setPolicy] = React.useState('')
        const [directory, setDirectory] = React.useState('')
        const [browsing, setBrowsing] = React.useState(false)
        const [sourceId, setSourceId] = React.useState('')
        const [addingAccount, setAddingAccount] = React.useState(false)
        const [addMethod, setAddMethod] = React.useState('web')
        const [selectedId, setSelectedId] = React.useState('')
        const [busy, setBusy] = React.useState(false)
        const [sourcesLoading, setSourcesLoading] = React.useState(true)
        const [listError, setListError] = React.useState()
        const [sourceError, setSourceError] = React.useState()
        const [error, setError] = React.useState()
        const [notice, setNotice] = React.useState()
        const mounted = React.useRef(true)
        const sourcePending = React.useRef(false)
        const localLock = React.useRef(false)
        const lock = operationLock || localLock
        React.useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
        const errorText = (key, error) => `${t(key)}${error?.message ? `：${error.message}` : ''}`
        const unwrapView = result => { if (!result?.ok) throw new Error(result?.error?.message || ''); return result.value }
        const refresh = React.useCallback(async () => {
          try {
            const view = unwrapView(await accounts.list())
            if (!mounted.current) return
            setEntries(Array.isArray(view?.entries) ? view.entries : [])
            setCurrent(view?.current)
            setLoaded(true)
            setListError(undefined)
          } catch (error) { if (mounted.current) setListError(errorText('codexAccountsLoadError', error)) }
        }, [accounts])
        const canImport = source => !!source && (source.available === true || source.status === 'expired')
        const refreshSources = async (requestedDirectory = '') => {
          if (sourcePending.current || lock.current || disabled) return
          const path = requestedDirectory.trim()
          if (path && !path.startsWith('/') && !/^~[\\/]/u.test(path) && !/^[a-z]:[\\/]/iu.test(path) && !/^\\\\[^\\]+\\[^\\]+/u.test(path)) {
            setSourceError(t('codexImportDirectoryInvalid'))
            return
          }
          sourcePending.current = true
          setSourcesLoading(true)
          setSourceError(undefined)
          try {
            const view = unwrapView(await accounts.sources(path ? { directory: path } : {}))
            if (!mounted.current) return
            const available = Array.isArray(view?.sources) ? view.sources : []
            setSources(available)
            setPolicy(typeof view?.policy === 'string' ? view.policy : '')
            setSourceId(previous => (path ? available.find(source => source.id === 'directory' || source.path === path || (path.startsWith('~/') && source.path?.endsWith(path.slice(1))))?.id : undefined) || (available.some(source => source.id === previous) ? previous : view.defaultSourceId || available.find(source => source.default || source.id === 'codex-home' || source.id === 'codex')?.id || available[0]?.id || ''))
          } catch (error) { if (mounted.current) setSourceError(errorText('codexImportLoadError', error)) }
          finally { sourcePending.current = false; if (mounted.current) setSourcesLoading(false) }
        }
        React.useEffect(() => { void refresh() }, [refresh, reloadToken])
        React.useEffect(() => { if (!disabled) void refreshSources(directory) }, [accounts, disabled])
        const run = async (action, failureKey, noticeKey, after) => {
          if (lock.current || disabled) return false
          lock.current = true
          setBusy(true); onBusyChange?.(true); setError(undefined); setNotice(undefined)
          try {
            // Remote calls return promises; unwrap only after the result arrives.
            const view = unwrapView(await action())
            if (!mounted.current) return false
            after?.(view)
            if (noticeKey) setNotice(t(noticeKey))
            await Promise.all([refresh(), onChanged?.()])
            return true
          } catch (error) { if (mounted.current) setError(errorText(failureKey, error)); return false }
          finally { lock.current = false; onBusyChange?.(false); if (mounted.current) setBusy(false) }
        }
        const selected = entries.find(entry => entry.id === selectedId) ?? entries.find(entry => entry.active) ?? entries[0]
        const selectedSource = sources.find(source => source.id === sourceId)
        const active = current || entries.find(entry => entry.active)
        const blocked = busy || disabled
        const importSubmit = async event => {
          event.preventDefault()
          if (sourcesLoading || sourceError || !canImport(selectedSource)) return
          const name = accountName.trim()
          const request = selectedSource.id === 'directory' ? { directory: selectedSource.path } : { source: selectedSource.id }
          if (name) request.name = name
          await run(() => accounts.import(request), 'codexImportError', 'codexImportAdded', view => {
            setSelectedId(view?.entry?.id ?? '')
          })
        }
        const renameSubmit = (entry, name) => run(() => accounts.rename({ id: entry.id, name }), 'codexAccountErrorRename', 'codexAccountRenamed')
        const sourceKind = entry => t(entry?.source === 'web' ? 'codexAccountSourceWeb' : entry?.source === 'existing' ? 'codexAccountSourceExisting' : 'codexAccountSourceCli')
        const sourceExpired = source => source?.status === 'expired' || source?.expired === true || (typeof source?.expires === 'number' && source.expires < Date.now() / 1000)
        const sourceStatus = source => !canImport(source) ? t('codexImportUnavailable') : sourceExpired(source) ? t('codexImportExpired') : t('codexImportAvailable')
        const sourceName = source => [source.label || source.id, source.default ? t('codexSourceDefault') : undefined, sourceExpired(source) ? t('codexAccountExpired') : !canImport(source) ? t('codexImportUnavailable') : undefined].filter(Boolean).join(' · ')
        const currentLabel = active ? t('codexAccountsCurrent', { email: active.email || active.name || active.accountId || t('statusAuthorized') }) : authorized ? t('codexAccountsCurrentKnown') : loaded ? t('codexAccountsCurrentNone') : t('codexAccountsLoading')
        return e('fieldset', { className: 'ph-switches', 'data-codex-accounts': true },
          e('legend', { className: 'ph-heading' }, t('codexAccountsGroup')),
          e('p', { className: 'ph-muted', 'data-codex-current': true }, currentLabel),
          listError ? e('div', { className: 'ph-error', role: 'alert', 'data-codex-list-error': true }, e('p', null, listError), e('button', { type: 'button', className: 'ph-button', disabled: blocked, onClick: refresh }, t('quotaRefresh'))) : null,
          loaded && entries.length === 0 ? e('p', { className: 'ph-muted', 'data-codex-empty': true }, t('codexAccountsNone')) : null,
          entries.length ? e('div', { className: 'ph-pool-bar', 'data-codex-bar': true },
            e(AccountPicker, { entries, selected, kind: 'codex', label: t('codexAccountsSelectLabel'), disabled: blocked, onSelect: setSelectedId, onRename: renameSubmit, canDrop: entry => !entry.active, onDrop: entry => run(() => accounts.drop({ id: entry.id }), 'codexAccountErrorRemove', 'codexAccountRemoved') }),
            e('div', { className: 'ph-pool-toolbar', 'data-codex-toolbar': true },
              e('button', { className: 'ph-button', type: 'button', 'data-codex-action': 'use', disabled: blocked || !selected || selected.active || !!selected.expired, onClick: () => { if (selected && !selected.active && !selected.expired) return run(() => accounts.setActive({ id: selected.id }), 'codexAccountErrorSwitch', 'codexAccountSwitched') } }, selected?.active ? t('poolEntryActive') : t('codexAccountActionUse')),
            )) : null,
          selected ? e('div', { className: 'ph-account-meta ph-muted', 'data-codex-account-meta': true },
            e('span', null, [sourceKind(selected), selected.email, selected.expired ? t('codexAccountExpired') : undefined].filter(Boolean).join(' · ')),
            selected.sourcePath ? e('span', { className: 'ph-source-path' }, selected.sourcePath) : null) : null,
          quota && loaded && (selected || authorized || current) ? e(QuotaPanel, { key: `preview-${selected?.id || 'official'}-${quotaGeneration}`, quota, provider: 'openai-codex', grantId: selected?.id, title: selected?.name, initialMaxAgeMs: quotaGeneration ? 0 : 300000 }) : null,
          notice ? e('p', { className: 'ph-muted', role: 'status', 'data-codex-notice': true }, notice) : null,
          e('button', { type: 'button', className: 'ph-button', 'data-codex-add': true, 'aria-expanded': addingAccount, disabled: blocked, onClick: () => setAddingAccount(value => !value) }, t('codexAddAccount')),
          addingAccount ? e('section', { className: 'ph-import', 'data-codex-add-panel': true },
            e('div', { className: 'ph-add-methods', role: 'group', 'aria-label': t('codexAddAccount') },
              ...['web', 'cli'].map(method => e('button', { key: method, type: 'button', className: 'ph-button', disabled: blocked, 'aria-pressed': addMethod === method, 'data-codex-add-method': method, onClick: () => setAddMethod(method) }, t(method === 'web' ? 'codexAddWeb' : 'codexAddCli')))),
            e('label', { className: 'ph-answer-label' }, e('span', null, t('codexAddName')), e('input', { className: 'ph-answer-control', name: 'accountName', value: accountName, placeholder: t('codexImportNamePlaceholder'), disabled: blocked, autoComplete: 'off', onChange: event => setAccountName(event.target.value), 'aria-label': t('codexAddName') })),
            addMethod === 'web' ? e('div', { 'data-web-login': true }, e('button', { type: 'button', className: 'ph-button ph-primary', disabled: blocked, 'data-login-action': 'start', onClick: onWebLogin }, t('codexAddWebContinue'))) : e('div', { className: 'ph-import', 'data-codex-cli-login': true },
            e('p', { className: 'ph-muted' }, t('codexImportHint')),
            sources.length ? e(AccountPicker, { entries: sources.map(source => ({ ...source, name: sourceName(source) })), selected: selectedSource && { ...selectedSource, name: sourceName(selectedSource) }, kind: 'codex-source', label: t('codexImportSourceLabel'), disabled: blocked || sourcesLoading, onSelect: id => { setSourceId(id); setSourceError(undefined) } }) : null,
            selectedSource ? e('div', { className: 'ph-source-details ph-muted', 'data-codex-source-details': true, 'aria-live': 'polite' },
              e('span', { className: 'ph-source-path', 'data-codex-source-path': true }, selectedSource.path),
              e('span', { 'data-codex-source-status': true }, [selectedSource.email, sourceStatus(selectedSource), typeof selectedSource.expires === 'number' ? quotaExpiryLabel(selectedSource.expires) : undefined].filter(Boolean).join(' · '))) : null,
            sourcesLoading ? e('p', { className: 'ph-muted', role: 'status' }, t('codexImportLoading')) : null,
            sourceError ? e('div', { className: 'ph-error', role: 'alert', 'data-codex-source-error': true }, e('p', null, sourceError)) : null,
            !sourcesLoading && !sources.length ? e('p', { className: 'ph-muted' }, t('codexImportNoSources')) : null,
            e('form', { onSubmit: importSubmit, className: 'ph-answer', 'data-codex-import': true },
              e('button', { type: 'button', className: 'ph-button', disabled: !workspace || blocked || sourcesLoading, 'data-codex-action': 'browse', onClick: () => setBrowsing(true) }, t('codexBrowseDirectory')),
              e('button', { className: 'ph-button ph-primary', type: 'submit', 'data-codex-action': 'import', disabled: blocked || sourcesLoading || !!sourceError || !canImport(selectedSource) }, busy ? t('codexImportBusy') : t('codexImportSubmit'))),
            browsing && workspace ? e(HostDirectoryBrowser, { workspace, onCancel: () => setBrowsing(false), onSelect: path => { setBrowsing(false); if (path) { setDirectory(path); void refreshSources(path) } } }) : null,
            e('details', { className: 'ph-muted', 'data-codex-manual-path': true }, e('summary', null, t('codexManualDirectory')),
              e('form', { className: 'ph-answer', 'data-codex-directory': true, onSubmit: event => { event.preventDefault(); return refreshSources(directory) } },
                e('label', { className: 'ph-answer-label' }, e('span', null, t('codexImportDirectory')),
                  e('input', { className: 'ph-answer-control', name: 'directory', value: directory, disabled: blocked || sourcesLoading, placeholder: t('codexImportDirectoryPlaceholder'), 'aria-label': t('codexImportDirectory'), autoComplete: 'off', onChange: event => setDirectory(event.target.value) })),
                e('button', { className: 'ph-button', type: 'submit', 'data-codex-action': 'sources', disabled: blocked || sourcesLoading }, sourcesLoading ? t('codexImportLoading') : t('codexImportRefresh')))),
            policy ? e('details', { className: 'ph-muted', 'data-codex-source-policy': true }, e('summary', null, t('codexSourcePolicy')), e('p', null, policy)) : null,
          )) : null,
          error ? e('div', { className: 'ph-error', role: 'alert', 'data-codex-operation-error': true }, e('p', null, error)) : null,
        )
      }
      const panels = new Map()
      let workspaceService
      const panelFor = id => {
        if (!panels.has(id)) panels.set(id, { open: false, revealed: false, actions: 0, listeners: new Set() })
        return panels.get(id)
      }
      const panelKey = provider => `${provider?.settingsNs || 'llm-pi-ai'}:${provider?.provider}`
      const panelId = provider => `provider-hub-pool-${encodeURIComponent(panelKey(provider))}`
      const notifyPanel = state => { for (const listener of state.listeners) listener(value => value + 1) }
      const togglePanel = state => { state.open = !state.open; state.revealed = true; notifyPanel(state) }
      function usePanel(id) {
        const state = panelFor(id)
        const [, update] = React.useState(0)
        React.useEffect(() => { state.listeners.add(update); update(value => value + 1); return () => state.listeners.delete(update) }, [state])
        return state
      }
      const supportsPool = id => id === 'openai-codex' || keyPoolProviders.has(id)
      function ProviderActions({ provider, buttonClassName }) {
        const id = provider?.provider
        const state = usePanel(panelKey(provider))
        React.useEffect(() => {
          if (!supportsPool(id)) return
          state.actions++; notifyPanel(state)
          return () => { state.actions--; notifyPanel(state) }
        }, [state, id])
        return supportsPool(id) ? e('button', { type: 'button', className: buttonClassName || 'provider-hub-pool-action', 'data-provider-pool-action': id, 'aria-label': `${t('foldQuotaPool')} · ${provider?.displayName || id}`, title: t('foldQuotaPool'), 'aria-expanded': state.open, 'aria-controls': panelId(provider), onClick: () => togglePanel(state) }, t('foldQuotaPool')) : null
      }
      function ProviderCard(props) {
        const id = props.provider?.provider
        const state = usePanel(panelKey(props.provider))
        if (!supportsPool(id)) return null
        return e(React.Fragment, null,
          !state.actions ? e('button', { type: 'button', className: 'provider-hub-pool-action', 'data-provider-pool-fallback': id, 'aria-expanded': state.open, 'aria-controls': panelId(props.provider), onClick: () => togglePanel(state) }, t('foldQuotaPool')) : null,
          state.revealed ? e('div', { id: panelId(props.provider), hidden: !state.open, style: { display: state.open ? undefined : 'none' }, 'data-provider-pool-panel': id },
            id === 'openai-codex' ? e(LoginCard, { ...props, workspace: workspaceService }) : e(ApiKeyProviderCard, { provider: id, quota: props.quota, pool: props.pool, keyConfigured: props.keyConfigured })) : null)
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
          // Optional service: never wait for directory browsing before mounting
          // account management on Hosts which do not expose uiWorkspace.
          const workspace = ctx.inject(['uiWorkspace'], scoped => {
            workspaceService = scoped.uiWorkspace
            for (const state of panels.values()) notifyPanel(state)
          })
          const ui = ctx.inject(['remote.searchLogin', 'remote.quota', 'remote.keyPool', 'remote.codexAccounts', 'slots'], scoped => {
            scoped.slots.inject('settings.models.provider-card', () => scoped.slots.register({ name: 'settings.models.provider-card', key: 'llm-pi-ai' }, props => e(ProviderCard, { ...props, remote: scoped.remote.searchLogin, quota: scoped.remote.quota, pool: scoped.remote.keyPool, accounts: scoped.remote.codexAccounts })))
            scoped.slots.inject('settings.models.provider-actions', () => scoped.slots.register({ name: 'settings.models.provider-actions', key: 'llm-pi-ai' }, ProviderActions))
          })
          const dispose = async () => { await workspace.dispose(); workspaceService = undefined; await ui.dispose(); await disposeRemote() }
          try { await ui; return dispose } catch (error) { await dispose(); throw error }
        },
      }
    },
  })
})(window)
