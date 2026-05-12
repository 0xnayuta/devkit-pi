---
status: current
audience: all
last_verified: 2026-05-12
language: english
---

# `fetch_content` Content Type Enhancement

This document records `fetch_content` tool enhancements for content type detection, handler architecture restructuring, security configuration changes, and Phase 6 `convert_content` handoff guidance. Current `fetch_content` public API, configuration, and error codes are defined in [Web tools reference](../reference/web-tools.md), [Configuration reference](../reference/configuration.md), and [Web tools error codes](../reference/web-tools-error-codes.md).

## Supported content types

### Content detection priority

`fetch_content` identifies content types in the following order:

1. **HTTP Content-Type header** — priority use of the MIME type returned by the server
2. **URL file extension** — when Content-Type is inaccurate (e.g., `application/octet-stream`), identify by URL extension
3. **Magic bytes** — detect if the first 8 bytes match known binary signatures (PDF/ZIP/image/audio/video, etc.)
4. **text/\* fallback** — unknown `text/*` subtypes are treated as plain text
5. **Generic fallback** — indeterminate types like `application/octet-stream` fall back to plain text

### Supported text-like types

| Type | Content-Type | URL extension | Processing |
|------|-------------|---------------|------------|
| **HTML** | `text/html` | `.html`, `.htm` | Extract body text, remove script/style, extract title |
| **Markdown** | `text/markdown`, `text/x-markdown` | `.md`, `.markdown` | Preserve original, normalize whitespace |
| **JSON** | `application/json`, `application/*+json` | `.json` | Pretty print; limit first 50 items for large arrays; extract key fields from JSON-LD |
| **CSV / TSV** | `text/csv`, `text/tab-separated-values` | `.csv`, `.tsv` | Parse as Markdown table, limited to 100 rows × 20 columns |
| **XML / RSS / Atom** | `application/xml`, `text/xml`, `application/rss+xml`, `application/atom+xml` | `.xml`, `.rss`, `.atom` | RSS/Atom extracts feed entries; regular XML preserves structure |
| **YAML** | `text/yaml`, `text/x-yaml`, `application/yaml` | `.yml`, `.yaml` | Normalize whitespace, return as text |
| **Plain text** | `text/plain` | `.txt`, `.log`, etc. | Normalize whitespace |
| **Source code** | `text/css`, `text/javascript`, `application/javascript`, `application/typescript` | `.js`, `.ts`, `.css`, `.py`, `.go`, `.rs`, etc. | Return as source text, no execution or formatting |

### Unsupported types

The following types are explicitly rejected with a friendly error message:

- **Document formats**: `.pdf`, `.doc`, `.docx`, `.xls`, `.xlsx`, `.ppt`, `.pptx`, `.odt`, `.ods`, `.odp`
- **Archives**: `.zip`, `.tar`, `.gz`, `.bz2`, `.xz`, `.rar`, `.7z`
- **Executables**: `.exe`, `.dll`, `.so`, `.dylib`, `.msi`, `.deb`, `.rpm`, `.apk`, `.class`, `.jar`
- **Images**: `image/*` (blocked via Content-Type)
- **Audio/Video**: `audio/*`, `video/*` (blocked via Content-Type)
- **Other binary**: PDF/ZIP/ELF/image/audio/video and 24 other signatures detected via magic bytes

When an unsupported type is encountered, `fetch_content` returns `CONTENT_FETCH_FAILED`. For likely document formats such as PDF and Office files, the error message may direct the agent to the implemented `convert_content` tool. This guidance is message-based only; `fetch_content` does not expose public `suggestion` / `nextAction` fields and does not auto-convert.

## Jina Reader Fallback

When an HTML page has too little content or is JS-rendered, `fetch_content` can use [Jina Reader](https://r.jina.ai/) to obtain readable content.

### Trigger conditions

| Trigger type | Description | Enabled by default |
|---|---|---|
| `short-html` | Extracted body < 200 characters | ✅ |
| `js-heavy-html` | Page has > 3 script tags and visible text < 200 characters | ✅ |
| `preferReader` | User explicitly sets `preferReader: true` in `fetch_content` parameters | Always effective |

### Configuration

```json
{
  "web": {
    "enableJinaFallback": false,
    "jinaTriggers": ["short-html", "js-heavy-html"],
    "jinaTimeoutMs": 8000
  }
}
```

- `enableJinaFallback` — master switch, default `false`
- `jinaTriggers` — auto-trigger condition list; set to `[]` to disable all auto-triggers (`preferReader` still works on public URLs)
- `jinaTimeoutMs` — Jina request timeout, default 8000ms

Jina Reader is an external service. Even with `allowPrivateNetwork: true`, `fetch_content` will not send localhost, private IP, `.local`, `.internal`, or other private network URLs to Jina to avoid leaking local/intranet addresses.

### `preferReader` parameter

The `fetch_content` tool supports a `preferReader: boolean` parameter. When set to `true` and `enableJinaFallback` is `true`, Jina Reader will be attempted regardless of page content.

```
fetch_content({ url: "https://example.com", preferReader: true })
```

This parameter takes priority over the `jinaTriggers` configuration; however, for security reasons, private network URLs are never sent to Jina.

## Security configuration

### Existing security measures

| Measure | Default | Description |
|---|---|---|
| Download size limit | 1 MB (`maxResponseBytes: 1048576`) | Streaming byte count, truncated on overflow; Jina Reader responses also subject to this limit |
| Output length limit | 30,000 characters (`maxContentChars: 30000`) | Returns `truncated: true` after truncation |
| Request timeout | 10s (`timeoutMs: 10000`) | AbortSignal timeout |
| Private network URL blocking | Blocked by default | localhost, 127/10/172.16-31/192.168/169.254, etc. |
| DNS resolution validation | Enabled | Secondary check after resolution for private IPs |
| Redirect limit | 5 (`MAX_REDIRECTS = 5`) | Prevent redirect loops |
| Binary detection | Enabled | 24 magic byte signatures, quickly reject known binary formats |

### `allowPrivateNetwork`

Default: `false`

When set to `true`, allows `fetch_content` to access localhost and private IP addresses. Suitable for personal local development tool scenarios (e.g., accessing `http://localhost:3000` dev servers).

```json
{
  "web": {
    "allowPrivateNetwork": true
  }
}
```

**Behavior changes when enabled**:

- ✅ Can access `localhost`, `127.0.0.1`, `10.x.x.x`, `192.168.x.x`, etc.
- ✅ Can access `.local`, `.internal`, and other private hostnames
- ⚠️ URL format validation still applies (invalid URLs are still rejected)
- ⚠️ Protocol restriction still applies (only `http:` / `https:` allowed)

**Security advice**: Enable only in trusted local environments. Keep the default `false` in shared or public environments.

## Handler architecture

`fetch_content` uses a pluggable handler system to process different content types. Each content type has a corresponding handler responsible for parsing and formatting.

### Handler list

| Handler | Responsibility |
|---|---|
| `HtmlHandler` | HTML → text extraction, extract title |
| `PlainTextHandler` | Plain text, Markdown, YAML, source code → whitespace normalization |
| `JsonHandler` | JSON → pretty print / JSON-LD extraction |
| `CsvTsvHandler` | CSV/TSV → Markdown table |
| `XmlHandler` | XML → RSS/Atom extraction or structured text |
| `YamlHandler` | YAML → whitespace normalization |
| `UnsupportedHandler` | Unsupported types → throw error |

### Parse failure degradation

When a handler's parsing process errors, it automatically degrades to returning the original content as plain text and annotates the result with a `parseWarning` field. For example, when the JSON handler receives invalid JSON, it returns as plain text and sets `parseWarning: "Invalid JSON, returned as plain text"`.

## Configuration reference

Complete `web` configuration (`~/.pi/agent/extensions/devkit-pi/config.json`):

```json
{
  "web": {
    "enabled": true,
    "provider": "ddgs",
    "timeoutMs": 10000,
    "maxResponseBytes": 1048576,
    "maxContentChars": 30000,
    "maxResults": 5,
    "enableJinaFallback": false,
    "jinaTriggers": ["short-html", "js-heavy-html"],
    "jinaTimeoutMs": 8000,
    "allowPrivateNetwork": false,
    "debug": false
  }
}
```

| Config | Type | Default | Description |
|---|---|---|---|
| `enabled` | `boolean` | `true` | Enable/disable web tools |
| `provider` | `string` | `"ddgs"` | Search engine provider |
| `timeoutMs` | `number` | `10000` | Request timeout (ms) |
| `maxResponseBytes` | `number` | `1048576` | Max download bytes |
| `maxContentChars` | `number` | `30000` | Max output characters |
| `maxResults` | `number` | `5` | Search result count |
| `enableJinaFallback` | `boolean` | `false` | Enable Jina Reader fallback |
| `jinaTriggers` | `string[]` | `["short-html", "js-heavy-html"]` | Auto-trigger Jina conditions |
| `jinaTimeoutMs` | `number` | `8000` | Jina request timeout |
| `allowPrivateNetwork` | `boolean` | `false` | Allow private network access |
| `debug` | `false \| "minimal" \| "verbose"` | `false` | Debug log level |
