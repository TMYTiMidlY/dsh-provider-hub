# dsh-web-search

[![CI](https://github.com/TMYTiMidlY/dsh-web-search/actions/workflows/ci.yml/badge.svg)](https://github.com/TMYTiMidlY/dsh-web-search/actions/workflows/ci.yml)

一个独立的 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 插件，用可选 provider 替换默认的 `web_search`，并在 Web Models 页面为 pi-ai 登录流提供轻量登录卡片。

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
dsh plugin --profile web add /tmp/dsh-web-search-pack/dsh-web-search-0.1.0.tgz
```

重启 profile 并完整刷新浏览器。Bundle patch 会停用官方 `web_search`、保留官方 `web_fetch`，并注册本插件的同名 `web_search`。

## 配置

在 profile 的 `cordis.patch.yml` 中覆盖插件行（配置整段替换时保留需要的字段）：

```yaml
- id: dsh-web-search
  config:
    defaultProvider: deepseek-official
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

如果使用 Z.AI 官方 zread MCP，可直接提供 `Z_AI_API_KEY`；插件会通过 `tools/list` 找到 reader tool，再读取 Google 搜索页面。`google-zread` 默认不会把 DSH 的 Codex/Z.AI chat 凭据发送到任意 reader；自定义 HTTP reader 只接收显式配置的 endpoint。未配置时会返回明确的 `PROVIDER_CONFIG` 错误。若部署自行挂载了 `ctx.zread.read(url, signal)` service，则优先使用该 service。

## 登录

Models 页面中 `llm-pi-ai` provider 行会出现 ChatGPT/Codex 与 Z.AI 登录卡片。登录按钮启动 DSH authorization flow；浏览器回调、device code、手工 code 和刷新逻辑仍由 pi-ai/DSH 负责。Z.AI 的 `zai-coding-cn` 是凭据来源，不是第二个搜索 provider。

远程 WebUI 的 OAuth callback 不能假定远程主机拥有浏览器的 `localhost`，因此应使用 pi-ai flow 自带的手工 URL/code fallback。

## 本地开发

本仓采用与 `dsh-public-web` 类似的独立 package + `cordis.patch.yml` 开发模式：

```sh
npm test
npm run check
npm pack --dry-run
```

通过源码目录开发时，可先使用 `--patch`：

```yaml
- insert:
    - id: dsh-web-search-dev
      name: /absolute/path/to/dsh-web-search/lib/index.js
      config:
        defaultProvider: deepseek-official
        enabledProviders: [deepseek-official, openai-codex, zai, google-zread]
```

然后：

```sh
dsh web --patch ./dev.cordis.patch.yml
```

## 安全边界

- Tool 结果统一标记为外部、不可信内容；插件不会执行搜索结果中的指令。
- Codex endpoint、Z.AI endpoint 固定为第一方地址；只有 `google-zread` 的 reader URL 可配置。
- Remote bridge 不返回 access token/API key，只返回 flow 状态、通知和 prompt。
- zread reader 只接收 Google 搜索 URL；部署者应使用 HTTPS、受控 endpoint，并审查 reader 的访问日志。

## 兼容范围

首版按 DSH `0.2.1-alpha.1` 的 `ctx.web`、`ctx.authorization`、Typert Remote 和 Models slot contract 开发。升级 DSH 后应重新运行本仓测试，并在干净 Web profile 验证：tool 替换、provider 选择、登录、取消、WebUI 刷新和卸载。
