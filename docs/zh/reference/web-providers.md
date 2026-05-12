---
status: current
audience: user
last_verified: 2026-05-12
---

# Web Providers 参考

本文档说明 `web_search` 当前支持的 search providers、provider selection 行为、配置与错误边界。Web tools 的参数和返回结构见 [`web-tools.md`](./web-tools.md)，完整配置见 [`configuration.md`](./configuration.md)。

## Provider 概述

Provider 是 `web_search` 的搜索后端 adapter。当前 provider registry 位于 `src/modules/web/providers/registry.ts`，provider selection 位于 `src/modules/web/providers/select-provider.ts`。

当前 provider：

```text
ddgs, brave, tavily, serper, openserp, searxng
```

Provider 只用于 `web_search`。`fetch_content` 的 Jina Reader fallback 不是普通 search provider，见下方 [Jina fallback](#jina-fallback)。

Provider 实现遵循架构一致性策略：每个 search provider 应使用共享 provider adapter interface、provider registry、selection flow、配置命名模式和 provider-focused tests，除非存在已记录的例外。

## Provider 矩阵

| Provider | API key | 配置 key | 环境变量 | Selection availability | 主要用途 | 限制说明 |
|---|---|---|---|---|---|---|
| `ddgs` | 不需要 | 无 provider 子配置 | 无 | 始终启用；adapter `isAvailable()` 始终为 true | 零配置 DuckDuckGo Lite fallback | 每次最多返回 5 条；依赖 DuckDuckGo Lite HTML 结构 |
| `brave` | 需要 | `web.brave.*` | 默认 `BRAVE_SEARCH_API_KEY`，可由 `web.brave.apiKeyEnv` 修改 | 需要 `web.brave.enabled=true`、有效 baseUrl 和 key | Brave Search API | 第三方 rate limit/API 行为可能变化 |
| `tavily` | 需要 | `web.tavily.*` | 默认 `TAVILY_API_KEY`，可由 `web.tavily.apiKeyEnv` 修改 | 需要 `web.tavily.enabled=true`、有效 baseUrl 和 key | Tavily Search API | 第三方 rate limit/API 行为可能变化 |
| `serper` | 需要 | `web.serper.*` | 默认 `SERPER_API_KEY`，可由 `web.serper.apiKeyEnv` 修改 | 需要 `web.serper.enabled=true`、有效 baseUrl 和 key | Serper Google Search API | 第三方 rate limit/API 行为可能变化 |
| `openserp` | 需要 | `web.openserp.*` | 默认 `OPENSERP_API_KEY`，可由 `web.openserp.apiKeyEnv` 修改 | 需要 `web.openserp.enabled=true`、有效 baseUrl 和 key | OpenSERP-compatible API | 响应字段支持 `organic_results` 或 `results` |
| `searxng` | 不需要 | `web.searxng.*` | 无 | 需要 `web.searxng.enabled=true` 和有效 HTTP/HTTPS baseUrl | 自托管 SearXNG JSON search | 需要可访问的 SearXNG instance；请求固定 `format=json` |

## Provider 配置概要

### `ddgs`

零配置 provider。默认 `web.provider` 是 `ddgs`。

```json
{
  "web": {
    "provider": "ddgs"
  }
}
```

实现限制：`src/modules/web/providers/ddgs.ts` 中将结果数限制为最多 5 条。

### `brave`

```json
{
  "web": {
    "provider": "brave",
    "brave": {
      "enabled": true,
      "baseUrl": "https://api.search.brave.com/res/v1/web/search",
      "apiKeyEnv": "BRAVE_SEARCH_API_KEY"
    }
  }
}
```

显式选择 `brave` 时，`web.brave.enabled` 必须为 `true`；key 缺失会在 provider 请求阶段归类为 `PROVIDER_AUTH_FAILED`。

### `tavily`

```json
{
  "web": {
    "provider": "tavily",
    "tavily": {
      "enabled": true,
      "baseUrl": "https://api.tavily.com/search",
      "apiKeyEnv": "TAVILY_API_KEY"
    }
  }
}
```

显式选择 `tavily` 时，`web.tavily.enabled` 必须为 `true`；key 缺失会在 provider 请求阶段归类为 `PROVIDER_AUTH_FAILED`。

### `serper`

```json
{
  "web": {
    "provider": "serper",
    "serper": {
      "enabled": true,
      "baseUrl": "https://google.serper.dev/search",
      "apiKeyEnv": "SERPER_API_KEY"
    }
  }
}
```

显式选择 `serper` 时，`web.serper.enabled` 必须为 `true`；key 缺失会在 provider 请求阶段归类为 `PROVIDER_AUTH_FAILED`。

### `openserp`

```json
{
  "web": {
    "provider": "openserp",
    "openserp": {
      "enabled": true,
      "baseUrl": "https://api.openserp.com/search",
      "apiKeyEnv": "OPENSERP_API_KEY"
    }
  }
}
```

显式选择 `openserp` 时，`web.openserp.enabled` 必须为 `true`。provider 会从 `web.openserp.apiKeyEnv` 指定的环境变量读取 key。

### `searxng`

```json
{
  "web": {
    "provider": "searxng",
    "searxng": {
      "enabled": true,
      "baseUrl": "https://searx.example.com",
      "defaultEngine": "google"
    }
  }
}
```

显式选择 `searxng` 时，`web.searxng.enabled` 必须为 `true`，并且 `web.searxng.baseUrl` 必须是有效 HTTP/HTTPS URL。若 base URL pathname 是 `/`，源码会请求 `/search`；否则保留原 pathname。

## Provider selection

### Explicit mode

当 `web.provider` 是具体 provider 名称时，selection 进入 explicit mode：

- 只使用该 provider。
- provider 失败不会 fallback 到其他 provider。
- 不支持的 provider 名称返回 `INVALID_INPUT`。
- `brave`、`openserp`、`searxng`、`tavily`、`serper` 显式使用前必须在对应配置中启用。
- 所有 explicit provider 都会在 selection 阶段执行相同的技术可用性检查。
- keyed provider 缺少 API key 时返回 `PROVIDER_AUTH_FAILED`；endpoint 无效时返回 `INVALID_INPUT`。

### Auto mode

当 `web.provider="auto"` 时，selection 会从已启用且技术上可用的 provider 构造候选列表。源码将 provider 分三层：

1. commercial：`tavily`、`serper`、`brave`
2. self-host-or-open：`openserp`、`searxng`
3. zero-config：`ddgs`

每层内部按 `web.providerPriority` 排序，然后拼接。默认 priority：

```text
tavily → serper → brave → openserp → searxng → ddgs
```

selection availability 由 config enabled gate 和各 provider adapter 的技术性 `isAvailable()` 检查共同决定：

- `ddgs`：始终启用且技术上可用。
- `brave` / `tavily` / `serper` / `openserp`：需要 `enabled=true`、有效 baseUrl 和 API key。
- `searxng`：需要 `enabled=true` 和有效 HTTP/HTTPS baseUrl。

Provider adapter 的 `isAvailable()` 实现有意不检查 `enabled`；enabled gate 统一由 `selectSearchProvider` 负责。

Auto mode 下，某个 provider 失败时 `web_search` 会尝试下一个候选 provider；所有候选失败后返回最后一个错误，或返回 `WEB_SEARCH_FAILED`。

### 默认行为

默认配置为：

```json
{
  "web": {
    "provider": "ddgs"
  }
}
```

因此默认不是 `auto`，而是显式使用 `ddgs`。

## Provider 错误行为

Provider 错误最终由 `src/modules/web/search.ts` 分类为 `WebToolError`。

| 场景 | 当前错误行为 |
|---|---|
| 显式 provider 不支持 | `INVALID_INPUT` |
| 显式 provider 未启用或 endpoint 配置无效 | `INVALID_INPUT` |
| API key 缺失或 HTTP 401/403 | `PROVIDER_AUTH_FAILED` |
| HTTP 429 | `PROVIDER_RATE_LIMITED` |
| HTTP 5xx | `PROVIDER_UNAVAILABLE` |
| fetch failed / DNS `ENOTFOUND` / `ECONN*` | `NETWORK_ERROR` |
| timeout / abort | `WEB_SEARCH_TIMEOUT` |
| provider request failed 或未分类异常 | `WEB_SEARCH_FAILED` |
| provider JSON parse / response shape 异常 | 当前继续归入 `WEB_SEARCH_FAILED`；不直接返回 reserved code `PARSE_ERROR` |
| provider 返回空结果 | 成功响应，`results = []`；不返回 `WEB_SEARCH_NO_RESULTS` |

完整错误码状态见 [`web-tools-error-codes.md`](./web-tools-error-codes.md)。

## Jina fallback

Jina Reader fallback 属于 `fetch_content` 内部内容提取补救机制，不是 `web_search` provider：

- 不参与 `web.provider` / `web.providerPriority`。
- 不在 `src/modules/web/providers/registry.ts` 中注册。
- 只在 `fetch_content` 处理 HTML 且 `web.enableJinaFallback=true` 时可能触发。
- `preferReader=true` 是单次 `fetch_content` tool 参数，不是 provider selection。
- 私网 URL 不会发送给 Jina。
- Jina 失败当前不会新增 `JINA_*` 错误码；timeout/abort 可能返回 `CONTENT_FETCH_TIMEOUT`，其他异常可能归入 `CONTENT_FETCH_FAILED`，非 2xx 或空内容则回退原始 HTML 提取结果。

相关配置见 [`configuration.md#jina-reader-配置`](./configuration.md#jina-reader-配置)。

## Source map

| 文档主题 | 对应源码 |
|---|---|
| Provider registry | `src/modules/web/providers/registry.ts` |
| Provider adapter interface | `src/modules/web/providers/types.ts` |
| Provider selection | `src/modules/web/providers/select-provider.ts` |
| ddgs | `src/modules/web/providers/ddgs.ts` |
| brave | `src/modules/web/providers/brave.ts` |
| tavily | `src/modules/web/providers/tavily.ts` |
| serper | `src/modules/web/providers/serper.ts` |
| openserp | `src/modules/web/providers/openserp.ts` |
| searxng | `src/modules/web/providers/searxng.ts` |
| Search error classification | `src/modules/web/search.ts` |
| Provider config types | `src/shared/types.ts` |
| Provider config defaults/normalize | `src/config/load-config.ts` |
