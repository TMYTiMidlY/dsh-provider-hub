# dsh-web-search

[![CI](https://github.com/TMYTiMidlY/dsh-provider-hub/actions/workflows/ci.yml/badge.svg)](https://github.com/TMYTiMidlY/dsh-provider-hub/actions/workflows/ci.yml)

一个独立的 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 插件，为**所有已有 `web_search` 配置 Codex / Z.AI 单路或组合搜索**，并在 Web Models 页面提供 ChatGPT/Codex OAuth 登录入口。

> `0.2.0` 不添加、复制或要求切换「Provider Hub」Agent 模式。保留官方搜索工具、现有 preset 和 `web_fetch`，默认只开启 Codex。Codex 与 Z.AI 是两个独立开关：可以开一个、同时开启，或全部关闭以使用 DSH 官方搜索。只有 ChatGPT/Codex 有 OAuth 登录按钮，Z.AI 使用 DSH 官方 API Key 配置入口。

## 单路、组合与官方搜索

打开 WebUI **插件 → 搜索提供方**，调整两个开关后点击 **保存**：

| Codex | Z.AI | 后续搜索行为 |
|---|---|---|
| 开 | 关 | 只调用 ChatGPT / Codex（默认） |
| 关 | 开 | 只调用 Z.AI |
| 开 | 开 | 两路并行查询，合并结果 |
| 关 | 关 | 使用 DSH 已注册的官方 DeepSeek 搜索 |

- Codex 使用 DSH/pi-ai 保存的 ChatGPT OAuth grant；Z.AI 使用 `zai` 或 `zai-coding-cn` API Key，调用 `web_search_prime` MCP。
- 同时开启时，同一条查询并行调用两路，不以先完成的后端独占结果。按 Codex、Z.AI 的顺序轮流取一个尚未出现的 URL，去重后再轮到下一路，最终只保留工具请求的**总体结果上限**，不是每路各占一份上限。
- 去重键忽略 URL fragment 与非根路径末尾斜杠；返回的引用保留提供方原始 URL。默认工具上限为 8，显式请求的 `maxResults` 仍由原生工具/搜索服务约束。
- 一路发生普通错误时，保留另一路成功结果，并在结果 `content` 中明确提示失败后端及错误代码；提示不复制可能含敏感信息的原始错误消息。
- 所有已开启后端都失败时，整个请求报错。共享超时或调用者取消是**整体失败**，即使某一路已经成功，也不返回部分结果。
- 两个开关关闭时走原生官方提供方，保留其 endpoint、API Key/账号鉴权与请求记录。这是明确的用户配置，不是错误后的静默降级。仍需已有可用的 DeepSeek API Key 或账号授权；未配置可用鉴权时明确报告官方缺凭据错误，不会创建新 Key，也不会偷偷回退到 Codex/Z.AI。

开关只暂存草稿，保存前可以 **放弃修改**；离开页面也会丢弃未保存草稿。**恢复默认**重新继承部署层默认值，本包默认只开 Codex。

## 安装

先在独立 `DSH_HOME` 验收，再安装到目标 Web profile。重新打包使用新的目录，不覆盖之前的 `0.2.0` 产物：

```sh
PACK_DIR="$(mktemp -d /tmp/dsh-web-search-pack.XXXXXX)"
npm pack --pack-destination "${PACK_DIR:?}"
# 在已安装 dsh 的主机上：
npm_config_auto_install_peers=false dsh plugin --profile web add "${PACK_DIR:?}/dsh-web-search-0.2.0.tgz"
```

安装命令仅对这一次 `dsh plugin add` 设置 `npm_config_auto_install_peers=false`：DSH peer 包由正在运行的 Host 提供，避免在 profile 中自动安装第二份 DSH 类库而造成跨副本类型身份不一致。不修改全局 npm/pnpm 配置；CI 或独立源码开发中的普通 `npm install` 仍正常安装所需 peers。

根据插件管理器返回的应用状态处理：已应用的配置可直接验收；需要重启的安装或更新应安排目标 profile 重启，然后完整刷新浏览器加载 client 模块。不要在旧 DSH 进程仍运行时覆盖全局 DSH 安装目录；安装本插件不要求升级 DSH。

**无需新建会话或切换 Agent 模式。** 安装生效后，已有标准模式、PTC 模式、创造模式和其他原本提供 `web_search` 的模式统一经过全局路由。原本没有搜索工具的极简模式不会被强行增加工具。

官方工具参数保持不变，例如：

```json
{"queries":["DeepSeek Harness latest release","Codex web search"]}
```

仍使用原生 `queries[]`，不添加 `query` 或 `provider` 参数，也不改变工具 schema、展示、结果限制或 `web_fetch` 后端。组合由用户通过全局设置选择，而不是由模型逐次改变提供方参数。

## 全局配置与持久化

- 保存通过 DSH 原生 `configForms` / settings 服务写入当前 profile patch，namespace 为 Host entry id `dsh-web-search`。
- 保存成功后，所有现有会话的**后续搜索**读取新配置，不需要重建 Agent；执行中的一次搜索保持启动时的选择与超时快照。
- 原生修订号校验防止覆盖其他页面的新配置；被拒绝的保存会保留草稿供修改或重试。
- 只读或远程 memory 连接遵从 DSH 的写入权限，不另造 RPC 绕过限制；可以在本机 WebUI 或部署配置中修改。

也可在当前 profile patch 中覆盖 Host 配置：

```yaml
- id: dsh-web-search
  config:
    searchProviders:
      - openai-codex
      - zai
    enabledProviders:
      - deepseek-official
      - openai-codex
      - zai
      - google-zread
    timeoutMs: 60000
```

`searchProviders` 只接受 `openai-codex`、`zai`：单元素开启一路，双元素组合，显式 `[]` 使用官方搜索。省略该字段时继承默认 `['openai-codex']`。它取代原来的单选字段 `defaultProvider`；修改先前的孤立验收配置时，应移除旧字段并使用新数组。

`searchProviders`、`timeoutMs` 和遗留 reader 的 `zreadEndpoint` 是实时 Config 字段。`enabledProviders` 是普通部署 allowlist，不是用户的组合开关，改变它遵循 Loader 重载生命周期。覆盖整项 `config` 时应保留仍需使用的字段。禁用的后端、缺少凭据或错误配置不会触发未选中后端。

### 运维覆盖

本包将原生 `web.searchProvider` 默认配置为 `dsh-provider-hub`；hub 每次搜索读取 `searchProviders`。Codex/Z.AI 同时以各自 id 注册为原生提供方，DeepSeek 由官方插件注册。

Bundle 默认采用：

```yaml
- id: web
  config:
    searchProvider: !!js "process.env.DSH_WEB_SEARCH_PROVIDER ?? 'dsh-provider-hub'"
    fetchProvider: http
```

启动环境的 `DSH_WEB_SEARCH_PROVIDER=openai-codex`、`zai` 或 `deepseek-official` 可直接固定原生提供方。profile/home patch 中显式配置其他 `web.searchProvider` 也可能覆盖 bundle；**此时设置卡保存的组合开关不决定实际后端**，卡片会提示这一部署边界。沿用原生 `config.searchProvider ?? env` 选择机制，不在 hub 内再建立隐藏的环境变量优先级。缺少显式指定的提供方会明确报错。`web.fetchProvider` 不受组合开关影响。

### 遗留 Google / zread 路由

Google reader 不属于 Codex/Z.AI 组合开关。为保留已有显式部署，`google-zread` 仍可作为原生运维固定路由使用，例如 `DSH_WEB_SEARCH_PROVIDER=google-zread`，并通过 Host `zreadEndpoint` 或启动环境指定 reader：

```sh
export DSH_ZREAD_GOOGLE_ENDPOINT='https://reader.example/api/read?url={url}'
```

URL template 支持 `{query}` 或 `{url}`。若部署挂载 `ctx.zread.read(url, signal)` service，则优先使用该 service。

Z.AI 官方 zread MCP 的 tool 契约不保证支持通用网页 URL，不能仅凭设置 `Z_AI_API_KEY` 就认为 Google 搜索可用。必须以部署端真实 reader 测试为准。reader 不会收到 DSH 的 Codex/Z.AI chat 凭据；未配置时明确报错。

## 登录

Models 页面中只有 `llm-pi-ai` 的 ChatGPT/Codex provider 行显示本插件的账号授权区。按钮启动 DSH authorization flow；授权状态、外部页面、device code 与手工确认分层展示。等待授权时不能重复启动；可以取消本页面拥有的 attempt。

插件不复制 OAuth/PKCE 实现。浏览器回调、device code、手工 code 和刷新逻辑仍由 `ctx.authorization` / pi-ai 负责。Remote bridge 只把通知、提示和取消动作交给 WebUI。

`zai` 和 `zai-coding-cn` 不添加 OAuth 按钮，直接使用官方 provider 编辑器的 API Key 入口。搜索读取已有凭据记录或官方管理的 `ZAI_API_KEY` / `ZAI_CODING_CN_API_KEY` 引用，不要求重复配置。`zai-coding-cn` 是凭据来源，不是第二个搜索开关。

远程 WebUI 的 OAuth callback 不能假定远程主机拥有浏览器的 `localhost`，因此应使用 pi-ai flow 自带的手工 URL/code fallback。搜索读取现存且未过期的 Codex grant，本身不会主动刷新过期 grant。取消按独立 attempt 信号管理，不按账号 key 全局取消；导航离开后，重新打开授权区可恢复仍在运行的 attempt。

## 停用、卸载与旧模式迁移

- **卸载或停用整个 bundle**并应用新的组合配置后，移除本包对原生 Web 的覆盖，默认回到官方 DeepSeek；用户另写的 profile/home/CLI 覆盖仍需检查。
- **只停用 Host 插件，但保留 `web.searchProvider: dsh-provider-hub`**，会留下明确的 `WEB_PROVIDER_CONFIGURED_MISSING`，不会自动恢复。应停用整个 bundle，或同时改回 `deepseek-official`。
- 提供方注册、设置订阅、页面和 scoped 样式随 Cordis fiber 回收；设置卡不销毁共享 `configForms` scope。
- 新安装不发布、插入或修改专用 Provider Hub preset。`dsh-web-search/tool` 只保留模块导入兼容桥，遵循官方 `queries[]` 契约；它不会注册或恢复 `provider-hub` preset id，**不能保证已移除该 id 的旧会话自动冷恢复（cold resume）**。旧的 `query` / `provider` 调用仍需迁移。
- 升级前检查旧 `provider-hub` 会话和默认预设选择。仍允许原生预设选择的会话及默认设置，应在移除旧 id 前改回标准模式；**已有内容的会话可能被原生选择器锁定，不能假定可以直接切换模式**。此时应先备份，再针对会话 projection identity 制定并验证迁移，或暂时保留可解析的旧预设兼容配置；本插件不自动执行这些迁移。移除该 id 后，`agentPresets.resolve('provider-hub')` 会因预设不存在而失败，仅保留工具模块不足以恢复。确认没有此 id 的会话且默认选择已是原生模式时，无需迁移会话。

## 本地开发

```sh
npm test
npm run check
npm pack --dry-run
```

开发与测试使用独立 Home；通过包名安装才能自动发现 Typert 元数据与 client 模块。仅使用绝对路径 `--patch` 不能完成这两部分注册。

```sh
DSH_HOME=/absolute/path/to/isolated-home npm_config_auto_install_peers=false dsh plugin --profile web add /absolute/path/to/package.tgz
DSH_HOME=/absolute/path/to/isolated-home dsh web --no-open --port 3981
```

测试实例使用独立会话、签名密钥和端口；若复用模型凭据，只复制必要记录到该 Home 的私有凭据文件（0600），不要输出密钥或复制主服务的 browser-session 签名记录。验收组合、单路失败、全部失败、取消与超时应先用离线 adapter/mock，真实 OAuth 和真实设置变更只在明确授权的隔离环境执行。

## 安全与兼容边界

- 搜索结果是外部、不可信内容；不执行结果中的指令。
- Codex、Z.AI endpoint 固定为第一方地址，组合失败提示仅公开后端 id 与错误代码。
- Remote bridge 不返回 access token/API key，只返回 flow 状态、通知和 prompt。
- 自定义 Google reader 只接收搜索 URL；部署者应使用 HTTPS、受控 endpoint 并审查访问日志。
- 原生注册使用公开 `ctx.web.registerSearchProvider`。官方 DeepSeek 委托在 DSH `0.2.1-alpha.1` 读取内部 `searchProviders` registry，这是 **alpha 私有兼容边界**：仅有结构 guard，并按该版本契约测试，没有运行时 version gate；结构不兼容时 fail closed，不覆盖官方 `search` 或写入私有 `searchProviderId`。

升级 DSH 后应重新测试原生 `queries[]`、旧会话、多模式与 PTC、开关暂存与保存、组合公平合并/URL 去重/总体上限、单路和全路失败、整体取消/超时、运维覆盖、OAuth 状态与取消、窄屏及键盘操作，以及停用/卸载恢复。此文描述契约与预期行为，不代替目标部署验收。
