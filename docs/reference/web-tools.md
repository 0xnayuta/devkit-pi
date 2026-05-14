---
status: current
audience: user
last_verified: 2026-05-12
language: english
---

# Web Tools Reference

This document is the public API reference for devkit-pi's built-in Web tools. Configuration defaults are defined in [`configuration.md`](./configuration.md); error codes are defined in [`web-tools-error-codes.md`](./web-tools-error-codes.md).

## Overview

The Web tools module provides the main agent and subagents with readonly web search, URL content fetching, readable text extraction, and result retrieval capabilities. Currently publicly registered tools come from `src/modules/web/register.ts`:

| Tool | Purpose | Primary source |
|---|---|---|
| `web_search` | Execute web search via configured search provider, optionally fetch search result content | `src/modules/web/search.ts` |
| `fetch_content` | Fetch HTTP/HTTPS URLs and extract readable text | `src/modules/web/fetch.ts` |
| `get_search_content` | Retrieve stored search or fetch results by `responseId` | `src/modules/web/storage.ts` |

The module also internally contains provider selection, search cache, URL security, content handlers, Jina Reader fallback, concurrency, connection pool, observability, and structured errors. These internal modules support the public tools but are not additional public tools.

## Tool list

### `web_search`

- Parameter schema: `WebSearchParams`
- Success result: `WebSearchSuccess`
- Error result: `WebToolError`
- Providers: `ddgs`, `brave`, `tavily`, `serper`, `openserp`, `searxng`, and `provider="auto"` auto-selection mode

### `fetch_content`

- Parameter schema: `FetchContentParams`
- Success result: `FetchContentSuccess`
- Error result: `WebToolError`
- Supports HTTP/HTTPS URLs; by default blocks localhost, private addresses, private hostnames, and DNS resolution to private addresses

### `get_search_content`

- Parameter schema: `GetSearchContentParams`
- Used to retrieve full or specified entries from `responseId` returned by `web_search` or `fetch_content`
- Storage follows session lifecycle restore/clear and is limited by `web.maxStoredResults` and `web.maxStoredContentChars`

## `web_search` reference

### Input schema

Source: `src/modules/web/schemas.ts`

```ts
{
  query?: string;
  queries?: string[];
  numResults?: number;
  includeContent?: boolean;
}
```

### Required fields

All fields are optional in the TypeBox schema, but at runtime at least one non-empty query is required:

- `query`: single query string
- `queries`: multiple query strings

`query` and `queries` are merged, trimmed, deduplicated, with a maximum of 5 queries retained. If no valid queries exist, returns `WEB_SEARCH_INVALID_QUERY`.

### Optional fields

| Field | Type | Behavior |
|---|---|---|
| `numResults` | number | Results requested per query; non-finite numbers use `web.maxResults`; valid values are floored and limited to `1..web.maxResults` |
| `includeContent` | boolean | When `true`, attempts to call `fetchUrlContent()` for each search result to attach `content`; single result fetch failures are ignored, the search result is still retained |

### Default behavior

- Default provider comes from `web.provider`, default value is `ddgs`.
- Search cache only takes effect when `web.cache.enabled=true`.
- Search requests are affected by `web.timeoutMs`, `web.concurrency.*`, and connection pool configuration.
- Successful results are stored in responseId storage, retrievable via `get_search_content`.

### Provider selection behavior

- `web.provider="ddgs"`: default zero-config DuckDuckGo Lite fallback provider.
- `web.provider` is an explicit provider: selection requires that provider to be enabled and technically available; only that provider is used, and provider failure does not fall back to other providers.
- `web.provider="auto"`: filters candidates by config enabled gates plus provider technical availability, then tries in tiered order: commercial (`tavily`, `serper`, `brave`) → self-host/open (`openserp`, `searxng`) → zero-config (`ddgs`). Within each tier, sorted by `web.providerPriority`.
- Provider configuration details: [`web-providers.md`](./web-providers.md).

### Success response shape

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

### Empty results semantics

No results is a success response, not an error. When the provider returns empty results, `web_search` returns:

```json
{
  "responseId": "...",
  "queries": [
    { "query": "...", "results": [] }
  ]
}
```

`WEB_SEARCH_NO_RESULTS` is a reserved code, not directly returned.

### Error response shape

```ts
{
  error: {
    code: WebErrorCode;
    message: string;
  }
}
```

Common active codes:

- `WEB_SEARCH_INVALID_QUERY`
- `WEB_SEARCH_FAILED`
- `WEB_SEARCH_TIMEOUT`
- `PROVIDER_AUTH_FAILED`
- `PROVIDER_RATE_LIMITED`
- `PROVIDER_UNAVAILABLE`
- `NETWORK_ERROR`
- `INVALID_INPUT` (provider configuration/selection error)

Provider JSON parse, response shape anomalies, or provider response bodies exceeding `web.maxResponseBytes` currently continue to be classified as `WEB_SEARCH_FAILED`, not directly returning reserved code `PARSE_ERROR`.

### Examples

Single query:

```json
{
  "query": "TypeScript 5.6 release notes",
  "numResults": 3
}
```

Multiple queries:

```json
{
  "queries": ["pi coding agent", "TypeBox schema"],
  "numResults": 5
}
```

With content fetching:

```json
{
  "query": "Node.js fetch AbortSignal timeout",
  "includeContent": true
}
```

## `fetch_content` reference

### Input schema

Source: `src/modules/web/schemas.ts`

```ts
{
  url?: string;
  urls?: string[];
  preferReader?: boolean;
}
```

### Required fields

All fields are optional in the TypeBox schema, but at runtime at least one non-empty URL is required:

- `url`: single URL
- `urls`: multiple URLs

`url` and `urls` are merged, trimmed, deduplicated. If no valid URLs exist, returns `INVALID_INPUT`.

### Optional fields

| Field | Type | Behavior |
|---|---|---|
| `preferReader` | boolean | When `web.enableJinaFallback=true` and content is HTML, requests preferentially try Jina Reader; private network URLs are not sent to Jina |

### Supported URL protocols

- Supported: `http:`, `https:`
- Non-HTTP/HTTPS protocols return `CONTENT_FETCH_INVALID_URL`

### Security boundary

Default `web.allowPrivateNetwork=false`. `fetch_content` will reject via `src/modules/web/security.ts`:

- localhost / `*.localhost`
- `.local` / `.internal`
- Private network, loopback, link-local, multicast IPv4/IPv6 addresses
- DNS resolution to private addresses
- URLs redirecting to the above targets

Security policy rejection is currently classified as `CONTENT_FETCH_FAILED`, not a new independent blocked error code. If local development server access is needed, set `web.allowPrivateNetwork=true` in configuration.

DNS rebinding / TOCTOU limitation: URL validation currently performs DNS checks before `fetch` and revalidates redirect targets, but it does not pin the checked IP address to the actual connection. Attacker-controlled DNS can still create a time-of-check/time-of-use gap. High-risk environments should disable remote fetching or keep private-network access disabled until connection-stage IP pinning is designed and implemented.

### Content extraction behavior

`fetch_content` downloads the response body and detects content type based on HTTP header, URL extension, magic bytes, and fallback rules. Currently supported readable content includes:

- HTML
- plain text
- Markdown
- JSON / `application/*+json`
- CSV / TSV
- XML / RSS / Atom
- YAML
- Common source code/config text extensions

Unsupported binary or document types include PDF, Office, ZIP, images, audio, video, executables, etc.; currently classified as `CONTENT_FETCH_FAILED`. For likely document formats such as PDF and Office files, the error message also suggests `convert_content` as an alternative. This guidance is intentionally message-based; the public error shape remains `error.code` + `error.message` without `suggestion` / `nextAction` fields.

Content handlers try to produce readable text. JSON/CSV/XML handler parse failures usually fall back to plain text with `parseWarning` set, not directly returning `PARSE_ERROR`.

### Jina fallback behavior

Jina Reader is `fetch_content`'s internal fallback, not a `web_search` provider.

Trigger conditions:

- `web.enableJinaFallback=true`
- Content detected as HTML
- AND either:
  - `preferReader=true`; or
  - Auto-trigger conditions match `web.jinaTriggers` (defaults: `short-html`, `js-heavy-html`)

Private network URLs are not sent to Jina. Jina returns non-2xx or empty content: tool falls back to original HTML extraction result. Jina timeout/abort may return `CONTENT_FETCH_TIMEOUT`; other Jina request anomalies may be classified as `CONTENT_FETCH_FAILED`. Currently no `JINA_*` error codes.

### Truncation / size behavior

- `web.maxResponseBytes` limits download response body bytes.
- `web.maxContentChars` limits tool return content character count.
- Storage also limited by `web.maxStoredContentChars`.
- When limits are exceeded, current "truncation success" semantics apply, result contains `truncated: true`.
- `CONTENT_FETCH_TOO_LARGE` is a reserved code, not directly returned for truncation.

### Success response shape

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

Multiple URLs currently return the same `responseId` in one call. If any URL throws an unrecoverable error in `fetchContent()` main flow, the entire tool call returns an error result.

### Error response shape

```ts
{
  error: {
    code: WebErrorCode;
    message: string;
  }
}
```

Common active codes:

- `INVALID_INPUT`
- `CONTENT_FETCH_INVALID_URL`
- `CONTENT_FETCH_TIMEOUT`
- `CONTENT_FETCH_FAILED`

### Examples

Single URL:

```json
{
  "url": "https://example.com/article"
}
```

Multiple URLs:

```json
{
  "urls": [
    "https://example.com/a",
    "https://example.com/b"
  ]
}
```

Request Jina Reader (requires configuration to enable):

```json
{
  "url": "https://example.com/js-heavy-page",
  "preferReader": true
}
```

## `get_search_content` reference

### Input schema

Source: `src/modules/web/schemas.ts`

```ts
{
  responseId: string;
  query?: string;
  queryIndex?: number;
  url?: string;
  urlIndex?: number;
}
```

### Required fields

- `responseId`: required, from `web_search` or `fetch_content` success response.

### Optional selectors

| Selector | Applicable result | Behavior |
|---|---|---|
| `urlIndex` | fetch result | Get by URL index |
| `url` | fetch result | Get by matching URL |
| `queryIndex` | search result | Get by query index |
| `query` | search result | Get by matching query |

Without selectors, returns the entire stored result. Invalid selectors or non-existent `responseId` returns `NOT_FOUND`.

### Success response shape

```ts
{
  responseId: string;
  result: StoredResult | ExtractedContent | QueryResultData;
}
```

### Common error codes

- `INVALID_INPUT`: `responseId` missing or empty after trim
- `NOT_FOUND`: `responseId` does not exist or selector not found

### Examples

Return entire stored result:

```json
{
  "responseId": "..."
}
```

Return single fetch result by URL index:

```json
{
  "responseId": "...",
  "urlIndex": 0
}
```

Return search result by query:

```json
{
  "responseId": "...",
  "query": "TypeScript 5.6 release notes"
}
```

## Error contract

Web tools error results are unified as:

```ts
{
  error: {
    code: WebErrorCode;
    message: string;
  }
}
```

- TypeScript type `WebToolError.error.code` is `WebErrorCode`.
- JSON return `code` is still a string value.
- Complete canonical error code list: [`web-tools-error-codes.md`](./web-tools-error-codes.md).
- `active` means currently has a direct return path.
- `reserved` means defined but currently not directly returned.
- `deprecated` means old name or historical documentation name, no longer returned as canonical code.

This document does not repeat the full error code table to avoid drift from canonical reference.

## Configuration links

Complete configuration: [`configuration.md`](./configuration.md):

- `web.*`: basic switches, timeout, result count, size limits, storage, security boundary, debug
- `web.provider` / `web.providerPriority`: search provider selection
- Provider sub-configs: `web.brave`, `web.openserp`, `web.searxng`, `web.tavily`, `web.serper`
- `web.cache.*`: search cache
- `web.concurrency.*`: request concurrency and queue
- `web.connectionPool.*`: HTTP/HTTPS keep-alive pool
- `web.enableJinaFallback`, `web.jinaTimeoutMs`, `web.jinaTriggers`: Jina Reader fallback

Provider-specific details: [`web-providers.md`](./web-providers.md).

## Stability notes

Public contract:

- Public tool names: `web_search`, `fetch_content`, `get_search_content`
- Parameter field names and basic types
- Success response top-level structures: `responseId`, `queries`, `results`, `result`
- Error response: `error.code` / `error.message`
- Canonical `WebErrorCode` string values

Internal implementation:

- Provider adapter internal parsing details
- Renderer UI display format
- Cache, concurrency, connection pool internal data structures
- Content handler specific formatting details
- Storage internal envelope and session custom entry structure

Boundary notes:

- Reserved error codes do not represent current direct returns.
- Provider behavior may vary due to third-party services, API keys, rate limits, HTML/JSON return format changes.
- Search provider response shape anomalies and provider response bodies exceeding `web.maxResponseBytes` currently continue to be classified as `WEB_SEARCH_FAILED`.
- Fetch truncation is currently success semantics, not returning `CONTENT_FETCH_TOO_LARGE`.
- Security policy rejection is currently classified as `CONTENT_FETCH_FAILED`.

## Source map

| Document topic | Source |
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
| Limited response readers | `src/modules/web/read-limited.ts` |
| Observability/activity | `src/modules/web/observability.ts` |
| Renderers | `src/modules/web/renderers.ts` |
| Errors | `src/modules/web/errors.ts` |
| Provider registry/adapters | `src/modules/web/providers/` |
