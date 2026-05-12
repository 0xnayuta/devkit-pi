---
status: current
audience: user
last_verified: 2026-05-12
language: chinese
---

# Web Tools 参考

本文档是 devkit-pi 内置 Web tools 的 public API reference。配置默认值以 [`configuration.md`](./configuration.md) 为准，错误码以 [`web-tools-error-codes.md`](./web-tools-error-codes.md) 为准。

## 概述

Web tools 模块为主代理和子代理提供 readonly 的网页搜索、URL 内容抓取、可读文本提取与结果检索能力。当前公开注册的工具来自 `src/modules/web/register.ts`：

| 工具 | 作用 | 主要源码 |
|---|---|---|
| `web_search` | 调用配置的 search provider 执行 Web 搜索，可选抓取搜索结果内容 | `src/modules/web/search.ts` |
| `fetch_content` | 抓取 HTTP/HTTPS URL 并提取可读文本 | `src/modules/web/fetch.ts` |
| `get_search_content` | 通过 `responseId` 检索已存储的搜索或抓取结果 | `src/modules/web/storage.ts` |

模块内部还包含 provider selection、search cache、URL security、content handlers、Jina Reader fallback、concurrency、connection pool、observability 和 structured errors。这些内部模块支撑公开工具，但不是额外公开 tool。

## 工具列表

### `web_search`

- 参数 schema：`WebSearchParams`
- 成功结果：`WebSearchSuccess`
- 错误结果：`WebToolError`
- provider：`ddgs`、`brave`、`tavily`、`serper`、`openserp`、`searxng`，以及 `provider="auto"` 的自动选择模式

### `fetch_content`

- 参数 schema：`FetchContentParams`
- 成功结果：`FetchContentSuccess`
- 错误结果：`WebToolError`
- 支持 HTTP/HTTPS URL；默认阻止 localhost、私网地址、私有 hostname 与 DNS 解析到私网地址的目标

### `get_search_content`

- 参数 schema：`GetSearchContentParams`
- 用于从 `web_search` 或 `fetch_content` 返回的 `responseId` 中取回完整或指定条目
- storage 会随 session lifecycle restore/clear，并受 `web.maxStoredResults` 与 `web.maxStoredContentChars` 限制

## `web_search` 参考

### Input schema

源码：`src/modules/web/schemas.ts`

```ts
{
  query?: string;
  queries?: string[];
  numResults?: number;
  includeContent?: boolean;
}
```

### 必填字段

TypeBox schema 中字段均为 optional，但运行时要求至少提供一个非空 query：

- `query`：单个查询字符串
- `queries`：多个查询字符串

`query` 和 `queries` 会合并、trim、去空值、去重，最多保留 5 个查询。若没有任何有效查询，返回 `WEB_SEARCH_INVALID_QUERY`。

### 可选字段

| 字段 | 类型 | 行为 |
|---|---|---|
| `numResults` | number | 每个 query 请求的结果数；非有限数使用 `web.maxResults`；有效值会 floor 后限制在 `1..web.maxResults` |
| `includeContent` | boolean | 为 `true` 时，对每个搜索结果尝试调用 `fetchUrlContent()` 附加 `content`；单个结果抓取失败会被忽略，该搜索结果仍保留 |

### 默认行为

- 默认 provider 来自 `web.provider`，默认值是 `ddgs`。
- search cache 仅在 `web.cache.enabled=true` 时生效。
- 搜索请求受 `web.timeoutMs`、`web.concurrency.*` 与 connection pool 配置影响。
- 成功结果会存入 responseId storage，可用 `get_search_content` 检索。

### Provider selection 行为

- `web.provider="ddgs"`：默认零配置 DuckDuckGo Lite fallback provider。
- `web.provider` 为显式 provider 时：selection 要求该 provider 已启用且技术上可用；只使用该 provider，provider 失败不会 fallback 到其他 provider。
- `web.provider="auto"`：按 config enabled gate 和 provider 技术可用性过滤候选 provider，并按分层顺序尝试：commercial（`tavily`、`serper`、`brave`）→ self-host/open（`openserp`、`searxng`）→ zero-config（`ddgs`）。每层内部按 `web.providerPriority` 排序。
- provider 详细配置见 [`web-providers.md`](./web-providers.md)。

### 成功响应结构

```ts
{
  responseId: string;
  queries: Array<{
    query: string;
    results: Array<{
      title: string;
      url: string;
      snippet?: string;
      source?: string;
      content?: {
        url: string;
        title?: string;
        content: string;
        truncated: boolean;
        contentType?: string;
        parseWarning?: string;
      };
    }>;
  }>;
}
```

### 空结果语义

无结果是成功响应，不是错误。provider 返回空结果时，`web_search` 返回：

```json
{
  "responseId": "...",
  "queries": [
    { "query": "...", "results": [] }
  ]
}
```

`WEB_SEARCH_NO_RESULTS` 是 reserved code，当前不会直接返回。

### 错误响应结构

```ts
{
  error: {
    code: WebErrorCode;
    message: string;
  }
}
```

常见 active code：

- `WEB_SEARCH_INVALID_QUERY`
- `WEB_SEARCH_FAILED`
- `WEB_SEARCH_TIMEOUT`
- `PROVIDER_AUTH_FAILED`
- `PROVIDER_RATE_LIMITED`
- `PROVIDER_UNAVAILABLE`
- `NETWORK_ERROR`
- `INVALID_INPUT`（provider 配置/选择错误）

provider JSON parse 或 response shape 异常当前继续归入 `WEB_SEARCH_FAILED`，不直接返回 reserved code `PARSE_ERROR`。

### 示例

单 query：

```json
{
  "query": "TypeScript 5.6 release notes",
  "numResults": 3
}
```

多 query：

```json
{
  "queries": ["pi coding agent", "TypeBox schema"],
  "numResults": 5
}
```

附加抓取内容：

```json
{
  "query": "Node.js fetch AbortSignal timeout",
  "includeContent": true
}
```

## `fetch_content` 参考

### Input schema

源码：`src/modules/web/schemas.ts`

```ts
{
  url?: string;
  urls?: string[];
  preferReader?: boolean;
}
```

### 必填字段

TypeBox schema 中字段均为 optional，但运行时要求至少提供一个非空 URL：

- `url`：单个 URL
- `urls`：多个 URL

`url` 和 `urls` 会合并、trim、去空值、去重。若没有任何有效 URL，返回 `INVALID_INPUT`。

### 可选字段

| 字段 | 类型 | 行为 |
|---|---|---|
| `preferReader` | boolean | 当 `web.enableJinaFallback=true` 且内容为 HTML 时，请求优先尝试 Jina Reader；私网 URL 不会发送给 Jina |

### 支持的 URL 协议

- 支持：`http:`、`https:`
- 非 HTTP/HTTPS 协议会返回 `CONTENT_FETCH_INVALID_URL`

### 安全边界

默认 `web.allowPrivateNetwork=false`。`fetch_content` 会通过 `src/modules/web/security.ts` 拒绝：

- localhost / `*.localhost`
- `.local` / `.internal`
- 私网、loopback、link-local、multicast 等 IPv4/IPv6 地址
- DNS 解析到私网地址的 hostname
- 重定向到上述目标的 URL

安全策略拒绝当前归入 `CONTENT_FETCH_FAILED`，不会新增独立 blocked 错误码。若确需抓取本地开发服务，可在配置中设置 `web.allowPrivateNetwork=true`。

### 内容提取行为

`fetch_content` 下载响应体后，根据 HTTP header、URL extension、magic bytes 与 fallback 规则检测内容类型。当前支持的可读内容包括：

- HTML
- 纯文本
- Markdown
- JSON / `application/*+json`
- CSV / TSV
- XML / RSS / Atom
- YAML
- 常见源码/配置文本扩展名

不支持的二进制或文档类型包括 PDF、Office、ZIP、图片、音频、视频、可执行文件等；当前归入 `CONTENT_FETCH_FAILED`。对于 PDF、Office 等疑似文档格式，错误信息会提示可改用 `convert_content`。该引导有意保持 message-based；公共错误形状仍为 `error.code` + `error.message`，不新增 `suggestion` / `nextAction` 字段。

content handlers 会尽量产生可读文本。JSON/CSV/XML 等 handler 解析失败时通常 fallback 为纯文本并设置 `parseWarning`，不直接返回 `PARSE_ERROR`。

### Jina fallback 行为

Jina Reader 是 `fetch_content` 内部 fallback，不是 `web_search` provider。

触发条件：

- `web.enableJinaFallback=true`
- 内容检测为 HTML
- 并且：
  - `preferReader=true`；或
  - 自动触发条件命中 `web.jinaTriggers`（默认 `short-html`、`js-heavy-html`）

私网 URL 不会发送给 Jina。Jina 返回非 2xx 或空内容时，工具回退到原始 HTML 提取结果。Jina timeout/abort 可能返回 `CONTENT_FETCH_TIMEOUT`；其他 Jina 请求异常可能归入 `CONTENT_FETCH_FAILED`。当前没有 `JINA_*` 错误码。

### 截断/大小行为

- `web.maxResponseBytes` 限制下载响应体字节数。
- `web.maxContentChars` 限制 tool 返回内容字符数。
- storage 还受 `web.maxStoredContentChars` 限制。
- 超过限制时当前采用"截断成功"的语义，结果中 `truncated: true`。
- `CONTENT_FETCH_TOO_LARGE` 是 reserved code，当前不会因截断直接返回。

### 成功响应结构

```ts
{
  responseId: string;
  results: Array<{
    url: string;
    title?: string;
    content: string;
    truncated: boolean;
    contentType?: string;
    parseWarning?: string;
  }>;
}
```

多个 URL 当前在同一次调用中返回同一个 `responseId`。若任一 URL 在 `fetchContent()` 主流程中抛出未恢复错误，整个 tool 调用返回错误结果。

### 错误响应结构

```ts
{
  error: {
    code: WebErrorCode;
    message: string;
  }
}
```

常见 active code：

- `INVALID_INPUT`
- `CONTENT_FETCH_INVALID_URL`
- `CONTENT_FETCH_TIMEOUT`
- `CONTENT_FETCH_FAILED`

### 示例

单 URL：

```json
{
  "url": "https://example.com/article"
}
```

多个 URL：

```json
{
  "urls": [
    "https://example.com/a",
    "https://example.com/b"
  ]
}
```

请求 Jina Reader（需要配置启用）：

```json
{
  "url": "https://example.com/js-heavy-page",
  "preferReader": true
}
```

## `get_search_content` 参考

### Input schema

源码：`src/modules/web/schemas.ts`

```ts
{
  responseId: string;
  query?: string;
  queryIndex?: number;
  url?: string;
  urlIndex?: number;
}
```

### 必填字段

- `responseId`：必填，来自 `web_search` 或 `fetch_content` 的成功响应。

### 可选 selectors

| Selector | 适用结果 | 行为 |
|---|---|---|
| `urlIndex` | fetch result | 取指定 URL index |
| `url` | fetch result | 取匹配 URL |
| `queryIndex` | search result | 取指定 query index |
| `query` | search result | 取匹配 query |

没有 selector 时返回整个 stored result。selector 无效或 `responseId` 不存在时返回 `NOT_FOUND`。

### 成功响应结构

```ts
{
  responseId: string;
  result: StoredResult | ExtractedContent | QueryResultData;
}
```

### 常见错误码

- `INVALID_INPUT`：`responseId` 缺失或 trim 后为空
- `NOT_FOUND`：`responseId` 不存在或 selector 未命中

### 示例

返回整个 stored result：

```json
{
  "responseId": "..."
}
```

按 URL index 返回单条抓取结果：

```json
{
  "responseId": "...",
  "urlIndex": 0
}
```

按 query 返回搜索结果：

```json
{
  "responseId": "...",
  "query": "TypeScript 5.6 release notes"
}
```

## 错误契约

Web tools 的错误结果统一为：

```ts
{
  error: {
    code: WebErrorCode;
    message: string;
  }
}
```

- TypeScript 类型中 `WebToolError.error.code` 是 `WebErrorCode`。
- JSON 返回中 `code` 仍是字符串值。
- 完整 canonical 错误码清单见 [`web-tools-error-codes.md`](./web-tools-error-codes.md)。
- `active` 表示当前有直接返回路径。
- `reserved` 表示已定义但当前不会直接返回。
- `deprecated` 表示旧名称或历史文档名称，不再作为 canonical code 返回。

本文不重复完整错误码表，避免与 canonical reference 漂移。

## 配置链接

完整配置见 [`configuration.md`](./configuration.md)：

- `web.*`：基础开关、超时、结果数、大小限制、storage、安全边界、debug
- `web.provider` / `web.providerPriority`：search provider 选择
- provider 子配置：`web.brave`、`web.openserp`、`web.searxng`、`web.tavily`、`web.serper`
- `web.cache.*`：search cache
- `web.concurrency.*`：请求并发与队列
- `web.connectionPool.*`：HTTP/HTTPS keep-alive pool
- `web.enableJinaFallback`、`web.jinaTimeoutMs`、`web.jinaTriggers`：Jina Reader fallback

Provider 专项说明见 [`web-providers.md`](./web-providers.md)。

## 稳定性说明

Public contract：

- 公开 tool 名称：`web_search`、`fetch_content`、`get_search_content`
- 参数字段名与基本类型
- 成功响应中的 `responseId`、`queries`、`results`、`result` 等顶层结构
- 错误响应中的 `error.code` / `error.message`
- canonical `WebErrorCode` 字符串值

Internal implementation：

- provider adapter 内部解析细节
- renderer UI 展示格式
- cache、concurrency、connection pool 的内部数据结构
- content handler 的具体格式化细节
- storage 的内部 envelope 与 session custom entry 结构

边界说明：

- reserved error codes 不代表当前会直接返回。
- provider 行为可能因第三方服务、API key、rate limit、HTML/JSON 返回格式变化而异。
- search provider response shape 异常当前继续归入 `WEB_SEARCH_FAILED`。
- fetch truncation 当前是成功语义，不返回 `CONTENT_FETCH_TOO_LARGE`。
- 安全策略拒绝当前归入 `CONTENT_FETCH_FAILED`。

## Source map

| 文档主题 | 对应源码 |
|---|---|
| Tool registration / session hooks | `src/modules/web/register.ts` |
| Schemas | `src/modules/web/schemas.ts` |
| Public result/input types | `src/modules/web/types.ts` |
| Search flow | `src/modules/web/search.ts` |
| Fetch flow | `src/modules/web/fetch.ts` |
| Content extraction helpers | `src/modules/web/extract.ts` |
| Content handlers | `src/modules/web/handlers.ts` |
| URL security | `src/modules/web/security.ts` |
| responseId storage | `src/modules/web/storage.ts` |
| Search cache | `src/modules/web/cache.ts` |
| Concurrency throttling | `src/modules/web/concurrency.ts` |
| HTTP connection pool | `src/modules/web/http-pool.ts` |
| Observability/activity | `src/modules/web/observability.ts` |
| Renderers | `src/modules/web/renderers.ts` |
| Errors | `src/modules/web/errors.ts` |
| Provider registry/adapters | `src/modules/web/providers/` |
