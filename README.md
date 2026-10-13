# dsh-provider-hub

[![CI](https://github.com/TMYTiMidlY/dsh-provider-hub/actions/workflows/ci.yml/badge.svg)](https://github.com/TMYTiMidlY/dsh-provider-hub/actions/workflows/ci.yml)

一个独立的 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 插件，**始终保留官方搜索，再为所有已有 `web_search` 附加 Codex / Z.AI 搜索增强**，并在 Web Models 页面提供 ChatGPT/Codex OAuth 登录入口与 **多 Provider 账号额度查询 / 小时记录 / 多 Key 池**。

> `0.5.0` 保留官方工具、现有 preset、原生调用栏和 `web_fetch`，不新增 Agent 模式或专属结果渲染器。默认每条查询调用 **官方 + Codex**；Z.AI 可独立附加。两个开关只控制增强，不能关掉官方基线。只有 ChatGPT/Codex 有 OAuth 登录按钮，Z.AI 使用 DSH 官方 API Key 配置入口。模型页每个 provider 卡片展示各自的账号额度（窗口用量、重置时间、积分）与小时用量曲线；API Key 类 provider 额外提供 **Key 池**：存多把命名 Key、一键切换实际生效的那把，并按 Key 分别预览额度与历史。

## 官方基线与搜索增强

打开 WebUI **插件 → 已安装 → dsh-provider-hub**，在详情页的 **搜索与额度** 区统一配置搜索增强及额度记录。原生 **官方 → 网页搜索** 保持原样，用于官方搜索自己的凭据与设置；本插件不冒充官方项目，也不替换它的卡片。官方基线提示不代表凭据已可用；两个增强开关与额度记录设置共同暂存，由一次 **保存** 提交：

| Codex 增强 | Z.AI 增强 | 后续每条查询的默认调用 |
|---|---|---|
| 开 | 关 | 官方 + ChatGPT / Codex（默认） |
| 关 | 开 | 官方 + Z.AI |
| 开 | 开 | 官方 + ChatGPT / Codex + Z.AI |
| 关 | 关 | 仅 DSH 官方 DeepSeek 搜索 |

- 官方调用保留原有 endpoint、API Key/账号鉴权与请求记录；不会因开启增强而被替代。仍需可用的 DeepSeek API Key 或账号授权，缺凭据是实际失败，不会伪标成功、创建新 Key 或偷偷开启未选中的增强。
- Codex 使用 DSH/pi-ai 保存的 ChatGPT OAuth grant；Z.AI 使用 `zai` 或 `zai-coding-cn` API Key，调用 `web_search_prime` MCP。
- 官方与所选增强并行调用。结果按官方、OpenAI、ZAI 的顺序轮流取一个尚未出现的 URL，去重后再轮到下一路，最终只保留工具请求的**总体结果上限**，不是每路各占一份上限。
- 去重键忽略 URL fragment 与非根路径末尾斜杠，引用保留提供方原始 URL。默认工具上限为 8，显式请求的 `maxResults` 仍由原生工具/搜索服务约束。
- 任一路普通失败时，只要另一路成功，就保留成功结果并公开失败后端与安全错误代码。官方缺凭据也遵循这条规则：增强仍可返回部分结果，但官方不会被算作成功。
- 所有计划调用的后端都失败时整个请求报错。共享超时或调用者取消是**整体失败**，即使已有一路成功，也不返回部分结果。

开关只暂存草稿，保存前可以 **放弃修改**；离开页面也会丢弃未保存草稿。**恢复默认**重新继承部署层默认增强，本包默认仅开启 Codex 增强，官方始终保留。

## 原生展开、来源标记与动态状态

完成后展开原生搜索调用栏，查看原生编号来源列表、可点击链接、短摘录与日期。不修改官方工具 schema、调用栏 DisclosureRow 或来源列表组件。

- 每条来源在已有 `title` 中携带短标签，例如 `[官方] 原标题`、`[OpenAI] 原标题`、`[ZAI] 原标题`；同一条查询的同 URL 来源可合并为 `[官方 + OpenAI + ZAI] 原标题`。标签只表示实际返回该 URL 的后端，不把失败后端算入来源。
- 仍只返回原生四个来源字段 `url`、`title`、`snippet`、`publishedAt`，不添加依赖插件渲染的 `source.provider` 字段。URL 保持可点击，缺标题时以 hostname 补足标注标题。
- 所有后端的原始长 `content` / Codex raw output 都不转发。最终 `content` 仅为 router 自己生成的一行提供方结果计数与失败代码；不复制后端原始摘要、wire 数据或错误消息。
- 来源并集只覆盖**同一条查询**。多条 `queries[]` 由原生工具继续去重，重复 URL 保留原生 first winner；不能宣称穷尽合并了所有跨查询来源。
- 动态展示沿用原生 preparing/running → 最终 `tool/result`，完成结果自然更新并可展开。DSH `0.2.1-alpha.1` 没有该搜索契约的公开逐来源 stream writer；本版本**不模拟逐条增量来源、不追加假 tool/result、不承诺流式搜索来源**。
- 在当前主 Host DSH `0.2.1-alpha.1` 上，PTC 嵌套调用没有根调用同款 presentation metadata，使用原生通用文本/value fallback 并保留短标签与安全内容，不能将此限制泛化到其他 Host。上游 `@deepseek-ai/dsh-tools@0.2.1-alpha.2` 已扩展 nested presentationMeta 并将其保存到 `tool/ptc-dispatch`；本插件遵循宿主原生契约保留合法 metadata，不强行删除，也不承诺所有版本的 PTC 子调用必有根调用同款 WebBlock。

新结果的来源标签随原生 `tool/result.meta.sources` 和模型可见文本持久化，不依赖本插件客户端解释。已在独立 Home、DSH `0.2.1-alpha.1` 中通过真实 AgentLoop 与 Codex/Z.AI 搜索生成标准、PTC、创造模式会话，再移除插件包和 bundle、关闭进程并冷启动：标准/创造模式的原生链接卡、PTC 的原生文本 fallback 均可读取，结果内容保持一致，读历史没有重新搜索。该环境没有官方凭据，官方每次都实际尝试并如实显示失败，没有伪标官方来源；这不代表主部署的鉴权状态。旧历史若没有来源事实，不追溯猜测标记或改写日志。

## 安装

先在独立 `DSH_HOME` 验收，再安装到目标 Web profile。打包 `0.4.4` 使用新的目录，不覆盖之前的产物：

```sh
PACK_DIR="$(mktemp -d /tmp/dsh-provider-hub-pack.XXXXXX)"
npm pack --pack-destination "${PACK_DIR:?}"
# 在已安装 dsh 的主机上：
npm_config_auto_install_peers=false dsh plugin --profile web add "${PACK_DIR:?}/dsh-provider-hub-0.4.4.tgz"
```

从 `dsh-web-search` 0.3.x 升级：先 `dsh plugin --profile web remove dsh-web-search`，再按上面安装新包，并把 profile patch 中 `- id: dsh-web-search` 条目改名为 `dsh-provider-hub`（配置字段名不变，废弃的 `tool` 兼容字段可删除）。entry id 变更意味着旧配置不会自动迁移；额度三项缺省时使用默认值。

安装命令仅对这一次 `dsh plugin add` 设置 `npm_config_auto_install_peers=false`：DSH peer 包由正在运行的 Host 提供，避免在 profile 中自动安装第二份 DSH 类库而造成跨副本类型身份不一致。不修改全局 npm/pnpm 配置；CI 或独立源码开发中的普通 `npm install` 仍正常安装所需 peers。

插件仅将私有 schema-builder `@deepseek-ai/schemastery@3.18.5-alpha.1` 固定为精确直接依赖，避免旧 profile validator 遮蔽支持 `.volatile()` 的构建器；它不是第二套 DSH runtime。不删除或升级 profile 中供其他插件使用的旧 schema 包，也不升级 Host。

根据插件管理器返回的应用状态处理：已应用的配置可直接验收；需要重启的安装或更新应安排目标 profile 重启，然后完整刷新浏览器加载 client 模块。不要在旧 DSH 进程仍运行时覆盖全局 DSH 安装目录；安装本插件不要求升级 DSH。

**无需新建会话或切换 Agent 模式。** 安装生效后，已有标准模式、PTC 模式、创造模式和其他原本提供 `web_search` 的模式统一经过全局路由。原本没有搜索工具的极简模式不会被强行增加工具。

官方工具参数保持不变，例如：

```json
{"queries":["DeepSeek Harness latest release","Codex web search"]}
```

仍使用原生 `queries[]`，不添加 `query` 或 `provider` 参数，也不改变工具 schema、展示、结果限制或 `web_fetch` 后端。组合由用户通过全局设置选择，而不是由模型逐次改变提供方参数。

## 全局配置与持久化

- 保存通过 DSH 原生 `configForms` / settings 服务写入当前 profile patch，namespace 为 Host entry id `dsh-provider-hub`。
- 保存成功后，所有现有会话的**后续搜索**读取新配置，不需要重建 Agent；执行中的一次搜索保持启动时的选择与超时快照。
- 原生修订号校验防止覆盖其他页面的新配置；被拒绝的保存会保留草稿供修改或重试。
- 只读或远程 memory 连接遵从 DSH 的写入权限，不另造 RPC 绕过限制；可以在本机 WebUI 或部署配置中修改。

也可在当前 profile patch 中覆盖 Host 配置：

```yaml
- id: dsh-provider-hub
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
    quotaRecord: true
    quotaIntervalMinutes: 60
    quotaHistoryDays: 180
    zaiTeamOrganization: ''
    zaiTeamProject: ''
```

`searchProviders` 只描述附加增强，接受 `openai-codex`、`zai`：单元素为官方加一路增强，双元素为官方加两路增强，显式 `[]` 仅保留官方。省略时继承默认 `['openai-codex']`，实际调用官方 + Codex。它取代旧单选字段 `defaultProvider`；先前的孤立验收配置应移除旧字段并使用新数组。

`searchProviders`、`timeoutMs` 和遗留 reader 的 `zreadEndpoint` 是实时 Config 字段。`enabledProviders` 是普通部署 allowlist，不是用户的增强开关，改变它遵循 Loader 重载生命周期。应保留 `deepseek-official` 基线；运维禁用或缺凭据会公开相应失败，不会伪装成功或调用未选中的增强。覆盖整项 `config` 时应保留仍需使用的字段。

`quotaRecord`、`quotaIntervalMinutes`（15–1440，默认 60）和 `quotaHistoryDays`（7–3650，默认 180）同样使用原生实时 Config 字段，经同一个 configForms 表单保存，控制所有 provider 的额度记录：DSH 运行期间每间隔分钟在后台只读查询一次各额度接口并落盘；历史点保存在 `$DSH_HOME/dsh-provider-hub/quota-history.jsonl`（0600，按 provider/账号标记，超期整理删除）。`zaiTeamOrganization` / `zaiTeamProject`（均为实时字符串字段）填写 BigModel 团队的组织与项目 ID，供团队版 key 的 `type=2` 额度查询使用；留空时只查个人 scope，团队 key 会在面板里得到明确的补配置提示。

### 运维覆盖

本包将原生 `web.searchProvider` 默认配置为 `dsh-provider-hub`；hub 每条查询保留官方并读取 `searchProviders` 追加增强。Codex/Z.AI 同时以各自 id 注册为原生提供方，DeepSeek 由官方插件注册。

Bundle 默认采用：

```yaml
- id: web
  config:
    searchProvider: !!js "process.env.DSH_WEB_SEARCH_PROVIDER ?? 'dsh-provider-hub'"
    fetchProvider: http
```

启动环境的 `DSH_WEB_SEARCH_PROVIDER=openai-codex`、`zai` 或 `deepseek-official` 可直接固定原生提供方。profile/home patch 中显式配置其他 `web.searchProvider` 也可能覆盖 bundle；**这是独立的运维路由，绕过默认 hub 的“官方 + 所选增强”，设置卡保存的组合开关不决定实际后端**。例如显式固定 `openai-codex` 时只调用该固定路由，不应与 UI 增强开关混为一谈；卡片会提示这一部署边界。沿用原生 `config.searchProvider ?? env` 选择机制，不在 hub 内再建立隐藏的环境变量优先级。缺少显式指定的提供方会明确报错。`web.fetchProvider` 不受组合开关影响。

### 遗留 Google / zread 路由

Google reader 不属于 Codex/Z.AI 组合开关。为保留已有显式部署，`google-zread` 仍可作为原生运维固定路由使用，例如 `DSH_WEB_SEARCH_PROVIDER=google-zread`，并通过 Host `zreadEndpoint` 或启动环境指定 reader：

```sh
export DSH_ZREAD_GOOGLE_ENDPOINT='https://reader.example/api/read?url={url}'
```

URL template 支持 `{query}` 或 `{url}`。若部署挂载 `ctx.zread.read(url, signal)` service，则优先使用该 service。

Z.AI 官方 zread MCP 的 tool 契约不保证支持通用网页 URL，不能仅凭设置 `Z_AI_API_KEY` 就认为 Google 搜索可用。必须以部署端真实 reader 测试为准。reader 不会收到 DSH 的 Codex/Z.AI chat 凭据；未配置时明确报错。

## 登录

Models 页面中只有 `llm-pi-ai` 的 ChatGPT/Codex provider 行显示本插件的账号授权区。按钮启动 DSH authorization flow；授权状态、外部页面、device code 与手工确认分层展示。等待授权时不能重复启动；可以取消本页面拥有的 attempt。

本插件不修改 Settings 私有父布局；窄屏可用性仍取决于原生壳，不能仅凭无横向溢出认为通过移动端验收。

插件不复制 OAuth/PKCE 实现。浏览器回调、device code、手工 code 和刷新逻辑仍由 `ctx.authorization` / pi-ai 负责。Remote bridge 只把通知、提示和取消动作交给 WebUI。

`zai` 和 `zai-coding-cn` 不添加 OAuth 按钮，直接使用官方 provider 编辑器的 API Key 入口。搜索读取已有凭据记录或官方管理的 `ZAI_API_KEY` / `ZAI_CODING_CN_API_KEY` 引用，不要求重复配置。`zai-coding-cn` 是凭据来源，不是第二个搜索开关。

远程 WebUI 的 OAuth callback 不能假定远程主机拥有浏览器的 `localhost`，因此应使用 pi-ai flow 自带的手工 URL/code fallback。搜索读取现存且未过期的 Codex grant，本身不会主动刷新过期 grant。取消按独立 attempt 信号管理，不按账号 key 全局取消；导航离开后，重新打开授权区可恢复仍在运行的 attempt。

### 账号额度展示与记录

模型页每个 provider 卡片都有各自的 **账号额度** 区：Codex 在登录卡下方（邮箱、计划、窗口用量进度条、重置倒计时、积分余额与可重置次数，每张可重置额度单独列出标题与**到期日期**）；API Key 类 provider（`zai`、`zai-coding-cn`、`kimi-coding`、`xiaomi-token-plan-cn`）直接在卡片内展示当前生效 Key 的额度，并按 Key 分别提供 24 小时 / 7 天 / 30 天用量曲线（纵轴按数据范围自动缩放并留边距、两端标注首尾数值，横轴带时间刻度），面板打开期间每 60 秒自动重读历史，无需手动刷新。

额度查询全部是**只读**第一方接口，凭据只读不刷新、不记录、不返回浏览器：

| Provider | 额度接口 | 说明 |
|---|---|---|
| `openai-codex` | `GET https://chatgpt.com/backend-api/wham/usage` | 与 Codex CLI `/status` 同源；重置额度明细走 `GET /wham/rate-limit-reset-credits`（有可用额度时附加读取，失败不影响主视图） |
| `zai` | `GET https://api.z.ai/api/monitor/usage/quota/limit` | 个人版 GLM Coding Plan：5 小时 / 周 token 窗口 + 每月工具调用（含 search-prime / web-reader / zread 明细） |
| `zai-coding-cn` | `GET https://open.bigmodel.cn/api/monitor/usage/quota/limit` | 同上；**团队版 key** 需 `?type=2` 并携带 `Bigmodel-Organization` / `Bigmodel-Project` 头，在 profile 配置 `zaiTeamOrganization` / `zaiTeamProject` 后自动走团队 scope，缺配置时面板明确提示去哪补 |
| `kimi-coding` | `GET https://api.kimi.com/coding/v1/usages` | Kimi For Coding：5 小时 / 7 天用量池（ratio pools 优先，兼容旧计数响应） |
| `xiaomi-token-plan-cn` | — | Xiaomi Token Plan 暂无官方额度 API（MiMo-Code #2495 仍未实现），面板如实提示并给出控制台链接，不伪造数值、不记录历史 |

查询触发时机（每个 provider、每把 Key 各自缓存与记录）：

| 触发 | 行为 |
|---|---|
| 后台定时 | DSH 运行期间每 `quotaIntervalMinutes`（默认 60）对当前生效 Key 与 Key 池中每把 Key 各查询一次并记录历史；页面关闭不影响 |
| 打开额度区 | 缓存 5 分钟内直接复用，超过才发起一次真实查询 |
| 面板打开期间 | 每 60 秒自动重读用量历史（本地读盘，不发上游请求），曲线随记录点持续更新 |
| 点击刷新 | 立即查询；同一 provider/Key 60 秒内重复点击会节流返回缓存 |
| 换号或切 Key 后 | 检测到账号（API Key 为稳定哈希 `key-…`）变化时绕过节流立即查询 |

历史点保存在 `$DSH_HOME/dsh-provider-hub/quota-history.jsonl`（0600，按 `provider` + 账号标记，超期整理删除；旧数据无 provider 字段按 Codex 账号读取）。查询失败时保留并标注上次成功数据；令牌被拒（401/403）或距过期不足 5 分钟时显示恢复提示——在 DSH 发送一次对话让官方链路自动刷新后，下一个查询即自愈。凭据、邮箱与历史仅保存在本机 DSH Home，不随 remote bridge 返回 token 或 API Key。

### Key 池（多 API Key 管理）

模型页 API Key 类 provider 卡片内有 **Key 池**：为一个 provider 存放多把命名 API Key（名字 + 短 ID），随时把其中一把设为**当前生效**，并可展开每把 Key 的额度与历史（统一预览所有 Key 的额度信息）。

- **秘密只进官方凭据库**：每把池内 Key 以 `KEY_POOL_<PROVIDER>_<ID>` 引用写入 `$DSH_HOME/.credentials.yaml`（0600），由 `dsh-credentials` 的 `set/unset` 写接口（模型页编辑器同一入口）维护；插件自己的 `key-pool.json`（0600）只保存名字、ID、provider 与引用名，**不含任何秘密**，remote 桥也从不返回 Key 值。
- **切换 = 改写官方引用**：设为当前会把该 Key 的值写入 provider 的官方引用（`KIMI_API_KEY` / `ZAI_API_KEY` / `ZAI_CODING_CN_API_KEY` / `XIAOMI_TOKEN_PLAN_CN_API_KEY`），对话、搜索增强与额度查询在下一次操作立即使用新凭据，无需重启或改配置。当前生效以“值与官方引用一致”判定，从模型页编辑器改过 Key 也不会标错。
- **历史按 Key 记录**：每把 Key 的用量曲线独立（账号标识为 `key-<sha256 前缀>`，不可逆），互不串线。
- 移除池内 Key 会同时清掉它的凭据引用；当前生效的官方引用不受影响。

## 停用、卸载与旧模式迁移

- **卸载或停用整个 bundle**并应用新的组合配置后，移除本包对原生 Web 的覆盖，默认回到官方 DeepSeek；用户另写的 profile/home/CLI 覆盖仍需检查。
- **只停用 Host 插件，但保留 `web.searchProvider: dsh-provider-hub`**，会留下明确的 `WEB_PROVIDER_CONFIGURED_MISSING`，不会自动恢复。应停用整个 bundle，或同时改回 `deepseek-official`。
- 提供方注册、设置订阅、页面和 scoped 样式随 Cordis fiber 回收；设置卡不销毁共享 `configForms` scope。
- 新安装不发布、插入或修改专用 Provider Hub preset。`dsh-provider-hub/tool` 只保留模块导入兼容桥，遵循官方 `queries[]` 契约；它不会注册或恢复 `provider-hub` preset id，**不能保证已移除该 id 的旧会话自动冷恢复（cold resume）**。旧的 `query` / `provider` 调用仍需迁移。
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
- Key 池的秘密只写进官方凭据库引用（`KEY_POOL_*`，0600）；插件元数据文件与 remote 桥都只暴露名字、ID 与状态，不含 Key 值。切换生效 Key 只改写 provider 的官方引用。
- 自定义 Google reader 只接收搜索 URL；部署者应使用 HTTPS、受控 endpoint 并审查访问日志。
- 原生注册使用公开 `ctx.web.registerSearchProvider`。官方 DeepSeek 委托在 DSH `0.2.1-alpha.1` 读取内部 `searchProviders` registry，这是 **alpha 私有兼容边界**：仅有结构 guard，并按该版本契约测试，没有运行时 version gate；结构不兼容时 fail closed，不覆盖官方 `search` 或写入私有 `searchProviderId`。

升级 DSH 后应重新测试原生 `queries[]`、旧会话、多模式与 PTC、开关暂存与保存、组合公平合并/URL 去重/总体上限、单路和全路失败、整体取消/超时、运维覆盖、OAuth 状态与取消、窄屏及键盘操作，以及停用/卸载恢复。此文描述契约与预期行为，不代替目标部署验收。
