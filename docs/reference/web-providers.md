---
status: current
audience: user
last_verified: 2026-05-12
---

# Web Providers Reference

This document describes `web_search`'s currently supported search providers, provider selection behavior, configuration, and error boundaries. For Web tools parameters and return structures, see [`web-tools.md`](./web-tools.md); for complete configuration, see [`configuration.md`](./configuration.md).

## Provider overview

Providers are the search backend adapters for `web_search`. The current provider registry is at `src/modules/web/providers/registry.ts`, and provider selection is at `src/modules/web/providers/select-provider.ts`.

Current providers:

```text
ddgs, brave, tavily, serper, openserp, searxng
```

Providers are only used for `web_search`. `fetch_content`'s Jina Reader fallback is not a regular search provider; see [Jina fallback](#jina-fallback) below.

Provider implementations follow the architecture consistency policy: each search provider should use the shared provider adapter interface, provider registry, selection flow, configuration naming pattern, and provider-focused tests unless a documented exception exists.

## Provider matrix

| Provider | API key | Config key | Environment variable | Selection availability | Primary use | Limitations |
|---|---|---|---|---|---|---|
| `ddgs` | Not needed | No provider sub-config | None | Always enabled; adapter `isAvailable()` always returns true | Zero-config DuckDuckGo Lite fallback | Max 5 results per request; depends on DuckDuckGo Lite HTML structure |
| `brave` | Required | `web.brave.*` | Default `BRAVE_SEARCH_API_KEY`, customizable via `web.brave.apiKeyEnv` | Requires `web.brave.enabled=true`, valid baseUrl, and key | Brave Search API | Third-party rate limit/API behavior may change |
| `tavily` | Required | `web.tavily.*` | Default `TAVILY_API_KEY`, customizable via `web.tavily.apiKeyEnv` | Requires `web.tavily.enabled=true`, valid baseUrl, and key | Tavily Search API | Third-party rate limit/API behavior may change |
| `serper` | Required | `web.serper.*` | Default `SERPER_API_KEY`, customizable via `web.serper.apiKeyEnv` | Requires `web.serper.enabled=true`, valid baseUrl, and key | Serper Google Search API | Third-party rate limit/API behavior may change |
| `openserp` | Required | `web.openserp.*` | Default `OPENSERP_API_KEY`, customizable via `web.openserp.apiKeyEnv` | Requires `web.openserp.enabled=true`, valid baseUrl, and key | OpenSERP-compatible API | Response fields support `organic_results` or `results` |
| `searxng` | Not needed | `web.searxng.*` | None | Requires `web.searxng.enabled=true` and valid HTTP/HTTPS baseUrl | Self-hosted SearXNG JSON search | Requires accessible SearXNG instance; requests use fixed `format=json` |

## Provider configuration summary

### `ddgs`

Zero-config provider. Default `web.provider` is `ddgs`.

```json
{
  "web": {
    "provider": "ddgs"
  }
}
```

Implementation limit: `src/modules/web/providers/ddgs.ts` limits results to a maximum of 5.

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

When explicitly selecting `brave`, `web.brave.enabled` must be `true`; missing key will be classified as `PROVIDER_AUTH_FAILED` during the provider request phase.

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

When explicitly selecting `tavily`, `web.tavily.enabled` must be `true`; missing key will be classified as `PROVIDER_AUTH_FAILED` during the provider request phase.

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

When explicitly selecting `serper`, `web.serper.enabled` must be `true`; missing key will be classified as `PROVIDER_AUTH_FAILED` during the provider request phase.

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

When explicitly selecting `openserp`, `web.openserp.enabled` must be `true`. The provider reads the key from the environment variable specified by `web.openserp.apiKeyEnv`.

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

When explicitly selecting `searxng`, `web.searxng.enabled` must be `true`, and `web.searxng.baseUrl` must be a valid HTTP/HTTPS URL. If the base URL pathname is `/`, source code will request `/search`; otherwise the original pathname is preserved.

## Provider selection

### Explicit mode

When `web.provider` is a specific provider name, selection enters explicit mode:

- Only that provider is used.
- Provider failure does not fall back to other providers.
- Unsupported provider name returns `INVALID_INPUT`.
- `brave`, `openserp`, `searxng`, `tavily`, `serper` must be enabled in their corresponding config before explicit use.
- All explicit providers run the same technical availability check during selection.
- Missing API keys for keyed providers return `PROVIDER_AUTH_FAILED`; invalid endpoints return `INVALID_INPUT`.

### Auto mode

When `web.provider="auto"`, selection constructs a candidate list from providers that are enabled and technically available. Source code divides providers into three tiers:

1. commercial: `tavily`, `serper`, `brave`
2. self-host-or-open: `openserp`, `searxng`
3. zero-config: `ddgs`

Within each tier, providers are sorted by `web.providerPriority`, then concatenated. Default priority:

```text
tavily → serper → brave → openserp → searxng → ddgs
```

Selection availability combines a config enabled gate with each provider adapter's technical `isAvailable()` check:

- `ddgs`: always enabled and technically available.
- `brave` / `tavily` / `serper` / `openserp`: requires `enabled=true`, valid baseUrl, and API key.
- `searxng`: requires `enabled=true` and valid HTTP/HTTPS baseUrl.

Provider adapter `isAvailable()` implementations intentionally do not check `enabled`; `selectSearchProvider` owns the enabled gate.

In auto mode, when one provider fails, `web_search` will try the next candidate provider; when all candidates fail, it returns the last error or `WEB_SEARCH_FAILED`.

### Default behavior

Default configuration is:

```json
{
  "web": {
    "provider": "ddgs"
  }
}
```

Therefore default is not `auto`, but explicitly using `ddgs`.

## Provider error behavior

Provider errors are ultimately classified by `src/modules/web/search.ts` into `WebToolError`.

| Scenario | Current error behavior |
|---|---|
| Explicit unsupported provider | `INVALID_INPUT` |
| Explicit provider not enabled or endpoint config invalid | `INVALID_INPUT` |
| API key missing or HTTP 401/403 | `PROVIDER_AUTH_FAILED` |
| HTTP 429 | `PROVIDER_RATE_LIMITED` |
| HTTP 5xx | `PROVIDER_UNAVAILABLE` |
| fetch failed / DNS `ENOTFOUND` / `ECONN*` | `NETWORK_ERROR` |
| timeout / abort | `WEB_SEARCH_TIMEOUT` |
| Provider request failed or uncategorized exception | `WEB_SEARCH_FAILED` |
| Provider JSON parse / response shape anomaly | Currently continues to be classified as `WEB_SEARCH_FAILED`; does not directly return reserved code `PARSE_ERROR` |
| Provider returns empty results | Success response, `results = []`; does not return `WEB_SEARCH_NO_RESULTS` |

For complete error code status, see [`web-tools-error-codes.md`](./web-tools-error-codes.md).

## Jina fallback

Jina Reader fallback is an internal content extraction recovery mechanism within `fetch_content`, not a `web_search` provider:

- Does not participate in `web.provider` / `web.providerPriority`.
- Not registered in `src/modules/web/providers/registry.ts`.
- May only trigger when `fetch_content` processes HTML and `web.enableJinaFallback=true`.
- `preferReader=true` is a single `fetch_content` tool parameter, not provider selection.
- Private network URLs are not sent to Jina.
- Jina failure currently does not introduce new `JINA_*` error codes; timeout/abort may return `CONTENT_FETCH_TIMEOUT`, other exceptions may be classified as `CONTENT_FETCH_FAILED`, and non-2xx or empty content falls back to original HTML extraction result.

Related configuration: [`configuration.md#jina-reader-configuration`](./configuration.md#jina-reader-configuration).

## Source map

| Document topic | Source |
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
