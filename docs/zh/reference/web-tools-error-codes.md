---
status: current
audience: user
last_verified: 2026-05-12
---

# Web Tools 错误码

本文定义内置 web tools（`web_search` / `fetch_content` / `get_search_content`）的结构化错误码。工具 API 见 [`web-tools.md`](./web-tools.md)，provider 行为见 [`web-providers.md`](./web-providers.md)，配置见 [`configuration.md`](./configuration.md)。

Canonical source：

- 完整错误码清单以 `src/modules/web/errors.ts` 中的 `WEB_ERROR_CODES` 为准。
- 实际返回结构参考 `src/modules/web/types.ts` 的 `WebToolError`。
- 具体返回路径参考 `src/modules/web/search.ts`、`src/modules/web/fetch.ts`、`src/modules/web/storage.ts`、`src/modules/web/providers/select-provider.ts`。
- 如果 README / README.zh 与本文档不一致，以本文档和源码为准。README 只保留常见错误说明，不作为完整错误码清单。

错误返回结构：

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message"
  }
}
```

`message` 是面向调用方的可操作提示，可能随版本优化；自动化逻辑应优先使用 `code`。

## 状态定义

| Status | 含义 |
|---|---|
| active | 当前有直接返回路径 |
| reserved | 已在 `WEB_ERROR_CODES` 中定义，但当前没有直接返回路径；保留给未来稳定细化 |
| deprecated | 旧名称或历史文档名称，不再作为 canonical code 返回 |

## 当前 canonical 错误码清单

下表覆盖 `WEB_ERROR_CODES` 中当前定义的全部错误码。

| Error code | Status | Meaning | Typical cause | Returned by | Retryable | Related source |
|---|---|---|---|---|---|---|
| `INVALID_INPUT` | active | 通用输入或 provider 配置无效 | 缺少 `url`/`responseId`；不支持的 provider；显式 provider 未启用或缺少 endpoint | `fetch_content`、`get_search_content`、provider selection | 否 | `fetch.ts`、`storage.ts`、`providers/select-provider.ts` |
| `NOT_FOUND` | active | 已存储结果或 selector 未命中 | `responseId` 不存在；`urlIndex`/`queryIndex` 越界；指定 url/query 不存在 | `get_search_content` | 否 | `storage.ts` |
| `WEB_SEARCH_FAILED` | active | 搜索失败的兜底错误 | provider 抛出未分类错误；provider 响应解析失败；auto mode 没有 provider 成功完成 | `web_search`、provider selection | 视情况；源码 recovery 建议为 fallback | `errors.ts`、`search.ts`、`providers/select-provider.ts` |
| `WEB_SEARCH_TIMEOUT` | active | 搜索超时或被 abort | provider 请求超时；调用被 AbortSignal 中止 | `web_search` | 是 | `errors.ts`、`search.ts`、`abort.ts` |
| `WEB_SEARCH_NO_RESULTS` | reserved | 预留：搜索无结果 | 当前设计中"无结果"是成功响应：`results = []`，不是错误 | 当前不直接返回 | 否 | `errors.ts`、providers |
| `WEB_SEARCH_INVALID_QUERY` | active | 查询为空或无有效内容 | `query` 缺失，或 `query`/`queries` trim 后为空 | `web_search` | 否 | `search.ts` |
| `CONTENT_FETCH_FAILED` | active | 内容抓取/提取失败的兜底错误 | URL 安全策略拒绝；HTTP 非 2xx；不支持内容类型；二进制内容；重定向异常；Jina 请求异常；queue full 等未分类 fetch 错误 | `fetch_content` | 通常否；取决于 message | `fetch.ts`、`security.ts`、`handlers.ts`、`concurrency.ts` |
| `CONTENT_FETCH_TIMEOUT` | active | 内容抓取超时或被 abort | 主 fetch 请求或 Jina 请求超时/被中止 | `fetch_content` | 是 | `errors.ts`、`fetch.ts`、`abort.ts` |
| `CONTENT_FETCH_INVALID_URL` | active | URL 格式或协议无效 | URL 无法被 `new URL()` 解析；协议不是 HTTP/HTTPS | `fetch_content` | 否 | `fetch.ts`、`security.ts` |
| `CONTENT_FETCH_TOO_LARGE` | reserved | 预留：响应体过大 | 当前实现使用 `maxResponseBytes` / `maxContentChars` 截断，不把截断视为错误 | 当前不直接返回 | 否 | `errors.ts`、`fetch.ts` |
| `PROVIDER_RATE_LIMITED` | active | provider 限流 | provider 返回 HTTP 429 | `web_search` | 是 | `errors.ts`、`search.ts`、providers |
| `PROVIDER_UNAVAILABLE` | active | provider 临时不可用 | provider 返回 HTTP 5xx | `web_search` | 是 | `errors.ts`、`search.ts`、providers |
| `PROVIDER_AUTH_FAILED` | active | provider 认证失败 | API key 缺失或无效；HTTP 401/403 | `web_search` | 否 | `errors.ts`、`search.ts`、providers |
| `NETWORK_ERROR` | active | 搜索 provider 网络连接错误 | `fetch failed`、DNS `ENOTFOUND`、`ECONN*` 等 | `web_search` | 是 | `errors.ts`、`search.ts` |
| `PARSE_ERROR` | reserved | 预留：解析失败 | 当前 provider JSON parse/response shape 异常通常归入 `WEB_SEARCH_FAILED`；content handler 解析失败通常 fallback 并设置 `parseWarning` | 当前不直接返回 | 否 | `errors.ts`、providers、`handlers.ts` |
| `CACHE_ERROR` | reserved | 预留：cache 操作失败 | 当前 search cache 是 best-effort，本地 cache/storage 超限通过淘汰或截断处理 | 当前不直接返回 | 否 | `errors.ts`、`cache.ts`、`storage.ts` |

## 六个预留/边界错误码的处理结论

| Error code | 当前结论 | 是否直接返回 | 说明 |
|---|---|---|---|
| `WEB_SEARCH_NO_RESULTS` | 保留为 reserved | 否 | 当前语义稳定为成功空结果，不应把 `results = []` 改成错误。 |
| `WEB_SEARCH_INVALID_QUERY` | 保留并启用 | 是 | 空 query 是稳定、可测试的输入错误，直接返回该 code。 |
| `CONTENT_FETCH_INVALID_URL` | 保留并启用 | 是 | URL 解析失败和非 HTTP/HTTPS 协议可稳定区分，直接返回该 code。 |
| `CONTENT_FETCH_TOO_LARGE` | 保留为 reserved | 否 | 当前实现截断读取/输出，不把"过大但已截断"视为失败。 |
| `PARSE_ERROR` | 保留为 reserved | 否 | 当前解析失败多为 fallback 或 provider 兜底错误，暂不引入跨 provider 解析层级。 |
| `CACHE_ERROR` | 保留为 reserved | 否 | 当前 cache/storage 不作为用户可感知失败路径暴露。 |

## 按场景说明

### `web_search` 输入与无结果

- 空 query 或 trim 后无有效 query：返回 `WEB_SEARCH_INVALID_QUERY`。
- provider 返回空结果：工具成功返回，结果为 `results = []`，不返回 `WEB_SEARCH_NO_RESULTS`。
- `WEB_SEARCH_NO_RESULTS` 仅作为未来可能改变无结果语义时的 reserved code。

### Provider 配置、认证与请求失败

- 显式 provider 不支持、未启用或 endpoint 配置无效：`INVALID_INPUT`。
- API key 缺失、HTTP 401/403：`PROVIDER_AUTH_FAILED`。
- HTTP 429：`PROVIDER_RATE_LIMITED`。
- HTTP 5xx：`PROVIDER_UNAVAILABLE`。
- 网络连接错误：`NETWORK_ERROR`。
- provider JSON parse 或响应 shape 异常：当前继续归入 `WEB_SEARCH_FAILED`，暂不直接返回 `PARSE_ERROR`。对当前用户来说，这类异常与普通 provider 失败的处理动作基本一致；未来如果 structured parser、`convert_content` 或强 schema 校验变复杂，再启用 `PARSE_ERROR`。

### `fetch_content` URL 与安全策略

- 缺少 `url`/`urls`：`INVALID_INPUT`。
- URL 格式非法，或协议不是 HTTP/HTTPS：`CONTENT_FETCH_INVALID_URL`。
- `fetch_content` 的 URL 校验/安全边界可能拒绝 localhost、私网地址、私有 hostname、DNS 解析到私网地址、非允许协议等 URL。
- localhost/private IP、私有 hostname、DNS 解析到私网地址等安全策略拒绝：继续归入 `CONTENT_FETCH_FAILED`。这类失败不是"URL 格式无效"，而是安全边界拒绝；当前不新增独立错误码。未来如果调用方需要区分普通 fetch 失败和安全策略拒绝，再考虑新增类似 CONTENT_FETCH_BLOCKED_BY_SECURITY_POLICY 或 CONTENT_FETCH_BLOCKED 的 canonical code。

### `fetch_content` 内容类型与大小限制

- PDF、Office、ZIP、图片、音视频、可执行文件、magic bytes 检测到二进制内容：当前归入 `CONTENT_FETCH_FAILED`。
- `maxResponseBytes` 和 `maxContentChars` 当前用于截断读取/输出；截断结果通过 `truncated: true` 表示，不返回 `CONTENT_FETCH_TOO_LARGE`。
- 当前保持"截断成功"的语义：`fetch_content` 面向 agent 阅读，截断内容通常比直接失败更有用。
- 如果未来增加 strict/full mode 或 `allowTruncate=false`，可启用 reserved code `CONTENT_FETCH_TOO_LARGE`。

### Extraction / handler failure

- content handler 解析失败时优先 fallback 为纯文本，并设置 `parseWarning`。
- 未分类异常由 `fetch_content` 汇总为 `CONTENT_FETCH_FAILED`。
- 当前不直接返回 `PARSE_ERROR`，避免把可恢复的解析 fallback 变成用户可见错误。

### Cache / storage

- `get_search_content` 未命中：`NOT_FOUND`。
- search cache 当前是 best-effort；关闭 cache 是正常配置，不是错误。
- storage 超出限制通过淘汰或截断处理，不返回 `CACHE_ERROR` 或 `STORAGE_FULL`。

### Concurrency / connection pool

- queue full 当前继续归入 `CONTENT_FETCH_FAILED` 或 `WEB_SEARCH_FAILED`，不新增 `QUEUE_FULL` / `CONCURRENCY_LIMITED`。
- connection pool / fetch 底层异常会按调用路径归入 `CONTENT_FETCH_FAILED`、`WEB_SEARCH_FAILED` 或 `NETWORK_ERROR`。

### Jina fallback

- Jina fallback 是 `fetch_content` 内部补救机制，不是用户直接选择的独立 provider。
- Jina 返回非 2xx 或空内容：fallback 为原始 HTML 结果，不返回错误。
- Jina timeout/abort：可能返回 `CONTENT_FETCH_TIMEOUT`。
- Jina 其他请求异常：可能归入 `CONTENT_FETCH_FAILED`。
- 当前不新增 `JINA_*` 错误码；如未来 Jina 成为用户可显式选择/观测的 provider，再考虑细化。

## HTTP 状态码映射

当前 `mapHttpStatusToError()` 用于 search provider 错误分类：

| Status | 映射到 | Retryable |
|---|---|---|
| 401 | `PROVIDER_AUTH_FAILED` | 否 |
| 403 | `PROVIDER_AUTH_FAILED` | 否 |
| 429 | `PROVIDER_RATE_LIMITED` | 是 |
| 500 | `PROVIDER_UNAVAILABLE` | 是 |
| 502 | `PROVIDER_UNAVAILABLE` | 是 |
| 503 | `PROVIDER_UNAVAILABLE` | 是 |
| 504 | `PROVIDER_UNAVAILABLE` | 是 |
| 其他 | `WEB_SEARCH_FAILED` | 依具体 recovery |

## Recovery 动作说明

`src/modules/web/errors.ts` 为部分错误码定义了 recovery 建议：

| Action | 含义 |
|---|---|
| `retry` | 稍后重试当前请求 |
| `fallback` | 尝试其他 provider 或 Jina fallback |
| `skip` | 跳过当前内容 |
| `abort` | 配置或输入错误，通常不应自动重试 |

并非所有实际返回的 `WebToolError` 都携带 recovery 字段；当前 tool 返回结构只保证 `error.code` 和 `error.message`。

## Deprecated / not canonical names

以下名称不是当前 canonical code，不应在 README 或用户文档中写成已实现专用 code：

- `FETCH_CONTENT_FAILED`：deprecated 旧名称；当前 canonical code 是 `CONTENT_FETCH_FAILED`。
- `CONTENT_TOO_LARGE`：deprecated/旧文档名称；当前 canonical reserved code 是 `CONTENT_FETCH_TOO_LARGE`。
- `STORAGE_FULL`：未实现；当前 storage 使用条目上限淘汰和内容截断。
- `CACHE_DISABLED`：未实现；关闭 cache 是正常配置。
- `JINA_TIMEOUT` / `JINA_FAILED`：未实现；当前没有独立 Jina 错误码。
- `QUEUE_FULL` / `CONCURRENCY_LIMITED`：未实现；queue full 不作为独立 web error code 暴露。

## Future hardening

- 如需更强类型约束，`WebToolError.error.code` 已可与 `WebErrorCode` 对齐；外部 JSON 结构仍保持字符串兼容。
- 如果未来 provider 统一抛出可识别的 parse/shape 错误，或 structured parser / `convert_content` / 强 schema 校验变复杂，可将该类错误从 `WEB_SEARCH_FAILED` 细化为 `PARSE_ERROR`。
- 如果未来 `fetch_content` 增加 strict/full mode 或 `allowTruncate=false`，可启用 `CONTENT_FETCH_TOO_LARGE`。
- 如果未来调用方需要区分普通 fetch 失败和安全策略拒绝，可新增类似 CONTENT_FETCH_BLOCKED_BY_SECURITY_POLICY 或 CONTENT_FETCH_BLOCKED 的 canonical code。
- 如果未来 cache/storage 失败成为用户可感知错误，可启用 `CACHE_ERROR`。
