# dsh-web-search

[![CI](https://github.com/TMYTiMidlY/dsh-provider-hub/actions/workflows/ci.yml/badge.svg)](https://github.com/TMYTiMidlY/dsh-provider-hub/actions/workflows/ci.yml)

一个独立的 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 插件，在独立的 **Provider Hub · 搜索增强** Agent 模式中提供可选 provider 的 `web_search`，并在 Web Models 页面为 ChatGPT/Codex OAuth 登录流提供轻量登录卡片。

> 兼容修订版 `0.1.0-local.4`：Host 登录桥与 Agent 搜索工具分离，保留原有标准模式和已启动会话不变；采用原生 client 模块注册；修正凭据引用、登录取消所有权、异步 UI 状态和 RPC 入参校验。仅为 ChatGPT/Codex 添加 OAuth 登录按钮，Z.AI 继续使用 DSH 官方 API Key 配置入口。

当前首版 provider：

- `deepseek-official`：复用 DSH 已挂载的 `ctx.web`。
- `openai-codex`：使用 DSH/pi-ai 已保存的 ChatGPT Codex OAuth grant。
- `zai`：使用 `zai` 或 `zai-coding-cn` 的 API key，调用 Z.AI `web_search_prime` MCP。
- `google-zread`：读取 Google 搜索页面的 zread-compatible reader；通过 `DSH_ZREAD_GOOGLE_ENDPOINT` 或 Host 的 `zread` service 配置。

插件不复制 OAuth/PKCE 实现；登录由 DSH 的 `ctx.authorization` 和 `@deepseek-ai/dsh-llm-pi-ai` flow 完成。本仓只提供一个 Remote bridge，把通知、提示和取消动作交给 WebUI。

## 安装

在 DSH Web profile 上安装打包产物：

```sh
npm pack --pack-destination /tmp/dsh-web-search-pack
# 在已安装 dsh 的主机上：
dsh plugin --profile web add /tmp/dsh-web-search-pack/dsh-web-search-0.1.0-local.4.tgz
```

先在独立 `DSH_HOME` 安装并验收；确认后再安装到实际 profile，重启并完整刷新浏览器。在**新会话**选择 **Provider Hub · 搜索增强**，即可使用同名 `web_search` 的 `query` / `provider` 参数，默认 `openai-codex`，仍保留官方 `web_fetch`。其他模式和已启动会话不受影响。

不要在旧 DSH 进程仍运行时覆盖全局 DSH 安装目录；全局升级必须安排停止服务、升级、重新启动和验收。只安装这个无运行时 dependencies 的插件不需要再次升级 DSH。

## 配置

在该 Agent preset 的 `config.plugins` 中调整搜索工具条目（不是 Host 登录桥条目）：

```yaml
- id: provider-hub-search
  name: dsh-web-search/tool
  config:
    defaultProvider: openai-codex
    enabledProviders:
      - deepseek-official
      - openai-codex
      - zai
      - google-zread
    maxResults: 8
    timeoutMs: 60000
    # 可选：zread-compatible URL template；支持 {query} 或 {url}
    zreadEndpoint: https://reader.example/api/read?url={url}
```

也可以用环境变量配置 Google/zread reader：

```sh
export DSH_ZREAD_GOOGLE_ENDPOINT='https://reader.example/api/read?url={url}'
```

Z.AI 官方 zread MCP 的实际 tool 契约不保证支持通用网页 URL，不能仅凭设置 `Z_AI_API_KEY` 就认为 Google 搜索可用。必须以部署端的真实 reader 调用测试为准。`google-zread` 默认不会把 DSH 的 Codex/Z.AI chat 凭据发送到任意 reader；自定义 HTTP reader 只接收显式配置的 endpoint。未配置时会返回明确的 `PROVIDER_CONFIG` 错误。若部署自行挂载了 `ctx.zread.read(url, signal)` service，则优先使用该 service。

## 登录

Models 页面中只有 `llm-pi-ai` 的 ChatGPT/Codex provider 行会出现本插件的 OAuth 登录卡片。登录按钮启动 DSH authorization flow；浏览器回调、device code、手工 code 和刷新逻辑仍由 pi-ai/DSH 负责。

`zai` 和 `zai-coding-cn` 不添加登录按钮，直接使用 DSH 官方 provider 编辑器的 API Key 入口。搜索读取已有凭据记录或官方管理的 `ZAI_API_KEY` / `ZAI_CODING_CN_API_KEY` 引用，不要求重复配置。`zai-coding-cn` 是凭据来源，不是第二个搜索 provider。

远程 WebUI 的 OAuth callback 不能假定远程主机拥有浏览器的 `localhost`，因此应使用 pi-ai flow 自带的手工 URL/code fallback。搜索直接读取现存且未过期的 Codex grant；搜索本身不会主动刷新已过期的 grant。登录操作与取消按独立 attempt 的信号管理，不按账号 key 全局取消。导航离开后，重新打开卡片可恢复仍在运行的 attempt。

## 本地开发

本仓采用与 `dsh-public-web` 类似的独立 package + `cordis.patch.yml` 开发模式：

```sh
npm test
npm run check
npm pack --dry-run
```

开发与测试使用独立 Home；通过包名安装，才能由 DSH 自动发现 Typert 元数据与 client 模块。仅使用绝对路径 `--patch` 不能完成这两部分注册。

```sh
DSH_HOME=/absolute/path/to/isolated-home dsh plugin --profile web add /absolute/path/to/package.tgz
DSH_HOME=/absolute/path/to/isolated-home dsh web --no-open --port 3981
```

测试实例使用独立会话、签名密钥和端口；若要复用模型凭据，只复制必要记录到该 Home 的私有凭据文件（0600），不要输出密钥或复制主服务的 browser-session 签名记录。

## 安全边界

- Tool 结果统一标记为外部、不可信内容；插件不会执行搜索结果中的指令。
- Codex endpoint、Z.AI endpoint 固定为第一方地址；只有 `google-zread` 的 reader URL 可配置。
- Remote bridge 不返回 access token/API key，只返回 flow 状态、通知和 prompt。
- zread reader 只接收 Google 搜索 URL；部署者应使用 HTTPS、受控 endpoint，并审查 reader 的访问日志。

## 兼容范围

首版按 DSH `0.2.1-alpha.1` 的 `ctx.web`、`ctx.authorization`、Typert Remote 和 Models slot contract 开发。升级 DSH 后应重新运行本仓测试，并在干净 Web profile 验证：tool 替换、provider 选择、登录、取消、WebUI 刷新和卸载。
