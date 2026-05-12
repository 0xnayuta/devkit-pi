---
status: current
audience: user
last_verified: 2026-05-12
language: english
---

# Web Tools Error Codes

This document defines the structured error codes for built-in web tools (`web_search` / `fetch_content` / `get_search_content`). For tool API, see [`web-tools.md`](./web-tools.md); for provider behavior, see [`web-providers.md`](./web-providers.md); for configuration, see [`configuration.md`](./configuration.md).

Canonical source:

- Complete error code list: `WEB_ERROR_CODES` in `src/modules/web/errors.ts`.
- Actual return structure: `WebToolError` in `src/modules/web/types.ts`.
- Specific return paths: `src/modules/web/search.ts`, `src/modules/web/fetch.ts`, `src/modules/web/storage.ts`, `src/modules/web/providers/select-provider.ts`.
- If README / README.zh conflicts with this document, this document and source code take precedence. README only retains common error descriptions, not as a complete error code list.

Error return structure:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message"
  }
}
```

`message` is an actionable hint for the caller, may be optimized across versions; automation logic should prefer `code`.

## Status definitions

| Status | Meaning |
|---|---|
| active | Currently has a direct return path |
| reserved | Defined in `WEB_ERROR_CODES` but currently has no direct return path; reserved for future stable refinement |
| deprecated | Old name or historical documentation name, no longer returned as canonical code |

## Current canonical error code list

The table below covers all error codes currently defined in `WEB_ERROR_CODES`.

| Error code | Status | Meaning | Typical cause | Returned by | Retryable | Related source |
|---|---|---|---|---|---|---|
| `INVALID_INPUT` | active | General input or provider configuration invalid | Missing `url`/`responseId`; unsupported provider; explicit provider not enabled or missing endpoint | `fetch_content`, `get_search_content`, provider selection | No | `fetch.ts`, `storage.ts`, `providers/select-provider.ts` |
| `NOT_FOUND` | active | Stored result or selector not found | `responseId` does not exist; `urlIndex`/`queryIndex` out of bounds; specified url/query does not exist | `get_search_content` | No | `storage.ts` |
| `WEB_SEARCH_FAILED` | active | Search failure fallback error | Provider threw uncategorized error; provider response parse failure; auto mode had no successful provider | `web_search`, provider selection | Depends; source recovery suggestion is fallback | `errors.ts`, `search.ts`, `providers/select-provider.ts` |
| `WEB_SEARCH_TIMEOUT` | active | Search timed out or aborted | Provider request timed out; call aborted by AbortSignal | `web_search` | Yes | `errors.ts`, `search.ts`, `abort.ts` |
| `WEB_SEARCH_NO_RESULTS` | reserved | Reserved: search returned no results | In current design "no results" is a success response: `results = []`, not an error | Not directly returned | No | `errors.ts`, providers |
| `WEB_SEARCH_INVALID_QUERY` | active | Query empty or no valid content | `query` missing, or `query`/`queries` empty after trim | `web_search` | No | `search.ts` |
| `CONTENT_FETCH_FAILED` | active | Content fetch/extraction failure fallback error | URL security policy rejection; HTTP non-2xx; unsupported content type; binary content; redirect anomaly; Jina request anomaly; queue full; other uncategorized fetch errors | `fetch_content` | Usually no; depends on message | `fetch.ts`, `security.ts`, `handlers.ts`, `concurrency.ts` |
| `CONTENT_FETCH_TIMEOUT` | active | Content fetch timed out or aborted | Main fetch request or Jina request timed out/aborted | `fetch_content` | Yes | `errors.ts`, `fetch.ts`, `abort.ts` |
| `CONTENT_FETCH_INVALID_URL` | active | URL format or protocol invalid | URL cannot be parsed by `new URL()`; protocol is not HTTP/HTTPS | `fetch_content` | No | `fetch.ts`, `security.ts` |
| `CONTENT_FETCH_TOO_LARGE` | reserved | Reserved: response body too large | Current implementation uses `maxResponseBytes` / `maxContentChars` truncation, does not treat truncation as error | Not directly returned | No | `errors.ts`, `fetch.ts` |
| `PROVIDER_RATE_LIMITED` | active | Provider rate limited | Provider returned HTTP 429 | `web_search` | Yes | `errors.ts`, `search.ts`, providers |
| `PROVIDER_UNAVAILABLE` | active | Provider temporarily unavailable | Provider returned HTTP 5xx | `web_search` | Yes | `errors.ts`, `search.ts`, providers |
| `PROVIDER_AUTH_FAILED` | active | Provider authentication failed | API key missing or invalid; HTTP 401/403 | `web_search` | No | `errors.ts`, `search.ts`, providers |
| `NETWORK_ERROR` | active | Search provider network connection error | `fetch failed`, DNS `ENOTFOUND`, `ECONN*`, etc. | `web_search` | Yes | `errors.ts`, `search.ts` |
| `PARSE_ERROR` | reserved | Reserved: parse failure | Current provider JSON parse/response shape anomaly usually classified as `WEB_SEARCH_FAILED`; content handler parse failure usually falls back with `parseWarning` | Not directly returned | No | `errors.ts`, providers, `handlers.ts` |
| `CACHE_ERROR` | reserved | Reserved: cache operation failure | Current search cache is best-effort; local cache/storage over-limit handled via eviction or truncation | Not directly returned | No | `errors.ts`, `cache.ts`, `storage.ts` |

## Conclusions for six reserved/boundary error codes

| Error code | Current conclusion | Directly returned | Description |
|---|---|---|---|
| `WEB_SEARCH_NO_RESULTS` | Retained as reserved | No | Current semantics stable as success empty result; should not change `results = []` to error. |
| `WEB_SEARCH_INVALID_QUERY` | Retained and enabled | Yes | Empty query is a stable, testable input error, directly returns this code. |
| `CONTENT_FETCH_INVALID_URL` | Retained and enabled | Yes | URL parse failure and non-HTTP/HTTPS protocol can be stably distinguished, directly returns this code. |
| `CONTENT_FETCH_TOO_LARGE` | Retained as reserved | No | Current implementation truncates read/output; does not treat "too large but truncated" as failure. |
| `PARSE_ERROR` | Retained as reserved | No | Current parse failures are mostly fallback or provider catch-all errors; no cross-provider parse layer introduced yet. |
| `CACHE_ERROR` | Retained as reserved | No | Current cache/storage does not expose as user-perceivable failure path. |

## Scenario-based explanations

### `web_search` input and no results

- Empty query or no valid query after trim: returns `WEB_SEARCH_INVALID_QUERY`.
- Provider returns empty results: tool returns success, result is `results = []`, does not return `WEB_SEARCH_NO_RESULTS`.
- `WEB_SEARCH_NO_RESULTS` only serves as a reserved code for possible future changes to no-result semantics.

### Provider configuration, authentication, and request failures

- Explicit unsupported, not enabled, or endpoint config invalid: `INVALID_INPUT`.
- API key missing, HTTP 401/403: `PROVIDER_AUTH_FAILED`.
- HTTP 429: `PROVIDER_RATE_LIMITED`.
- HTTP 5xx: `PROVIDER_UNAVAILABLE`.
- Network connection error: `NETWORK_ERROR`.
- Provider JSON parse or response shape anomaly: currently continues to be classified as `WEB_SEARCH_FAILED`, not directly returning `PARSE_ERROR`. For current users, such exceptions and regular provider failures have essentially the same handling action; if structured parser, `convert_content`, or strong schema validation becomes complex in the future, `PARSE_ERROR` will be enabled.

### `fetch_content` URL and security policy

- Missing `url`/`urls`: `INVALID_INPUT`.
- URL format invalid or protocol not HTTP/HTTPS: `CONTENT_FETCH_INVALID_URL`.
- `fetch_content`'s URL validation/security boundaries may reject localhost, private addresses, private hostnames, DNS resolution to private addresses, non-allowed protocols, etc.
- Localhost/private IP, private hostname, DNS resolution to private addresses, etc. security policy rejections: continue to be classified as `CONTENT_FETCH_FAILED`. These failures are not "URL format invalid" but security boundary rejection; currently no new independent error code is added. If callers need to distinguish regular fetch failures from security policy rejections in the future, a code like CONTENT_FETCH_BLOCKED_BY_SECURITY_POLICY or CONTENT_FETCH_BLOCKED may be considered.

### `fetch_content` content type and size limits

- PDF, Office, ZIP, images, audio/video, executables, magic bytes detecting binary content: currently classified as `CONTENT_FETCH_FAILED`. For document-like formats such as PDF and Office, the error message may suggest `convert_content` as a follow-up action.
- `maxResponseBytes` and `maxContentChars` currently used for truncating read/output; truncation results indicated by `truncated: true`, not returning `CONTENT_FETCH_TOO_LARGE`.
- Currently maintains "truncation success" semantics: `fetch_content` is for agent reading; truncated content is usually more useful than direct failure.
- If strict/full mode or `allowTruncate=false` is added in the future, reserved code `CONTENT_FETCH_TOO_LARGE` may be enabled.

### Extraction / handler failure

- Content handler parse failures prefer falling back to plain text, setting `parseWarning`.
- Uncategorized exceptions are summarized by `fetch_content` as `CONTENT_FETCH_FAILED`.
- Currently does not directly return `PARSE_ERROR`, avoiding converting recoverable parse fallbacks into user-visible errors.

### Cache / storage

- `get_search_content` miss: `NOT_FOUND`.
- Search cache is currently best-effort; disabling cache is normal configuration, not an error.
- Storage over-limit handled via eviction or truncation, not returning `CACHE_ERROR` or `STORAGE_FULL`.

### Concurrency / connection pool

- Queue full currently continues to be classified as `CONTENT_FETCH_FAILED` or `WEB_SEARCH_FAILED`, no new `QUEUE_FULL` / `CONCURRENCY_LIMITED`.
- Connection pool / fetch bottom-layer exceptions will be classified by call path into `CONTENT_FETCH_FAILED`, `WEB_SEARCH_FAILED`, or `NETWORK_ERROR`.

### Jina fallback

- Jina fallback is `fetch_content`'s internal recovery mechanism, not a user-selectable independent provider.
- Jina returns non-2xx or empty content: falls back to original HTML result, does not return error.
- Jina timeout/abort: may return `CONTENT_FETCH_TIMEOUT`.
- Jina other request exceptions: may be classified as `CONTENT_FETCH_FAILED`.
- Currently no new `JINA_*` error codes; if Jina becomes user-selectable/observable provider in the future, refinement may be considered.

## HTTP status code mapping

Current `mapHttpStatusToError()` is used for search provider error classification:

| Status | Maps to | Retryable |
|---|---|---|
| 401 | `PROVIDER_AUTH_FAILED` | No |
| 403 | `PROVIDER_AUTH_FAILED` | No |
| 429 | `PROVIDER_RATE_LIMITED` | Yes |
| 500 | `PROVIDER_UNAVAILABLE` | Yes |
| 502 | `PROVIDER_UNAVAILABLE` | Yes |
| 503 | `PROVIDER_UNAVAILABLE` | Yes |
| 504 | `PROVIDER_UNAVAILABLE` | Yes |
| Other | `WEB_SEARCH_FAILED` | Depends on specific recovery |

## Recovery action descriptions

`src/modules/web/errors.ts` defines recovery suggestions for some error codes:

| Action | Meaning |
|---|---|
| `retry` | Retry the current request later |
| `fallback` | Try another provider or Jina fallback |
| `skip` | Skip current content |
| `abort` | Configuration or input error, usually should not auto-retry |

Not all actual returned `WebToolError` carry a recovery field; current tool return structure only guarantees `error.code` and `error.message`.

Phase 6 web/convert integration deliberately keeps follow-up guidance message-based. `fetch_content` may mention `convert_content` in `error.message` for likely document formats, but it does not expose public `suggestion`, `nextAction`, or `suggestedTool` fields. Add such fields only if multiple modules need a shared structured suggestion schema.

## Deprecated / not canonical names

The following names are not current canonical codes and should not be written in README or user documentation as implemented dedicated codes:

- `FETCH_CONTENT_FAILED`: deprecated old name; current canonical code is `CONTENT_FETCH_FAILED`.
- `CONTENT_TOO_LARGE`: deprecated/old documentation name; current canonical reserved code is `CONTENT_FETCH_TOO_LARGE`.
- `STORAGE_FULL`: not implemented; current storage uses entry limit eviction and content truncation.
- `CACHE_DISABLED`: not implemented; disabling cache is normal configuration.
- `JINA_TIMEOUT` / `JINA_FAILED`: not implemented; currently no independent Jina error codes.
- `QUEUE_FULL` / `CONCURRENCY_LIMITED`: not implemented; queue full not exposed as independent web error code.

## Future hardening

- For stronger type constraints, `WebToolError.error.code` is already alignable with `WebErrorCode`; external JSON structure still maintains string compatibility.
- If future providers uniformly throw identifiable parse/shape errors, or structured parser / `convert_content` / strong schema validation becomes complex, such errors may be refined from `WEB_SEARCH_FAILED` to `PARSE_ERROR`.
- If `fetch_content` adds strict/full mode or `allowTruncate=false` in the future, `CONTENT_FETCH_TOO_LARGE` may be enabled.
- If callers need to distinguish regular fetch failures from security policy rejections in the future, a code like CONTENT_FETCH_BLOCKED_BY_SECURITY_POLICY or CONTENT_FETCH_BLOCKED may be added.
- If cache/storage failures become user-perceivable errors in the future, `CACHE_ERROR` may be enabled.
