---
status: deprecated
audience: maintainer
last_verified: 2026-05-12
language: english
---

# Plan: Extend / Enhance `fetch_content` Tool

> Historical content: This is an archived plan. It may contain implemented, adjusted, or abandoned designs. For current behavior, refer to `docs/reference/`, `src/`, and `tests/`.

## Positioning

The Phase 1 enhancement goal for `fetch_content` is not "support all file types", but to upgrade it from:

```text
Only supports text/html + text/plain
```

to:

```text
Lightweight URL content fetcher, supporting common text-based web content types, and providing clear recommendations for complex types
```

It should serve the following workflow:

```text
web_search → fetch_content → subagent reads webpage/document fragments → summarize/research/code assistance
```

## Phase 1 Minimum Viable Scope

Phase 1 should only cover **text-based content expansion + handler registry + user-friendly unsupported type handling**.

> **Current Status Note**: Security limits (download size, output truncation, timeout, private network blocking) and Jina fallback core logic are already implemented in the current codebase. This plan marks phases with existing implementations, only outlining incremental work.

### Phase 1 Newly Supported Types

Built-in support:

```text
text/html                                    (existing)
text/plain                                   (existing)
text/markdown
text/x-markdown
application/json
application/*+json
text/csv
text/tab-separated-values
application/xml
text/xml
application/rss+xml
application/atom+xml
text/yaml
text/x-yaml
application/yaml
text/css
text/javascript
application/javascript
application/typescript
Other text/* fallback
```

Phase 1 does not support local PDF/DOCX/XLSX/PPTX parsing. When encountering these types, `fetch_content` should return a friendly error explaining that the type is not supported.

> **Note**: The `convert_content` tool is also in the planning stage (see `add-convert_content-tool-plan.md`) and has not been implemented yet. Before `convert_content` is live, error messages should not guide agents to call a tool that doesn't exist. Update error prompts to "suggest using convert_content" only after `convert_content` is implemented.

---

## Recommended Phase Breakdown

## Phase 1: Content-Type Detection Enhancement and URL Extension Fallback

### Goal

Solve the problem of many servers returning incorrect MIME types. **This phase is a prerequisite for correctly identifying subsequent new types**, so it takes priority over content type expansion.

Common real-world scenarios:

```text
.md files return text/plain
.json returns text/plain
GitHub raw content MIME is unstable
```

### Existing Foundation

Current `isSupportedContentType()` only judges by Content-Type header, returning `"html"` | `"text"` | `null` (`src/modules/web/fetch.ts`). No URL extension fallback capability.

### Main Content

Detection order recommendation:

```text
1. HTTP Content-Type header
2. URL pathname extension
3. Buffer magic bytes (lightweight, only for distinguishing binary/text)
4. text/* fallback (catch-all for unknown text/* subtypes as plain text)
```

Implementation rules:

```text
.md/.markdown  → markdown
.json         → json
.csv/.tsv     → csv/tsv
.xml/.rss/.atom → xml/feed
.yml/.yaml    → yaml
.js/.ts/.css  → source text
.pdf          → unsupported (don't parse, just identify extension and give clear hint)
.docx/.pptx/.xlsx → unsupported (same as above)
```

For generic types like `application/octet-stream` that cannot be determined, if the URL extension is also unrecognizable, fallback to plain text parsing attempt instead of directly rejecting.

### Execution Boundary

Do not parse PDF/Office inside `fetch_content`. Only identify them and provide clear unsupported hints.

### Acceptance Criteria

- When Content-Type is inaccurate, the tool can still select the correct handler based on URL extension
- `application/octet-stream` + `.json` extension → correctly identified as JSON
- `text/plain` + `.md` extension → correctly identified as Markdown
- `.pdf` extension → returns clear "unsupported type" error

---

## Phase 2: Refactor to Content Handler Registry

### Goal

Replace the current hardcoded if/else dispatch with a pluggable handler system, laying out the architecture for future extensions.

Change from:

```text
isSupportedContentType → "html" | "text" | null
```

to:

```text
Content-Type + URL extension → handler
```

### Existing Foundation

Current `fetchUrlContent()` uses `isSupportedContentType` return value for `if (html) / else (text)` branching (`src/modules/web/fetch.ts`). The structure is simple but not extensible.

### Main Content

Establish a unified handler interface, divided by responsibility into **6 handlers** (consolidate similar items, avoid over-splitting):

```text
HtmlHandler          — text/html
PlainTextHandler     — text/plain, text/markdown, text/x-markdown,
                       text/css, text/javascript, application/javascript,
                       application/typescript, other text/* fallback
JsonHandler          — application/json, application/*+json
CsvTsvHandler        — text/csv, text/tab-separated-values
XmlHandler           — application/xml, text/xml,
                       application/rss+xml, application/atom+xml
YamlHandler          — text/yaml, text/x-yaml, application/yaml
UnsupportedHandler   — types that cannot be handled, returns friendly error
```

**Design Note**: Markdown and source text (CSS/JS/TS) are essentially plain text, handled the same way as `text/plain` (preserve original, truncate, don't execute, don't format), so they are consolidated into `PlainTextHandler`. RSS/Atom are subsets of XML, `XmlHandler` can handle internal schema branching.

Each handler is responsible for:

```text
isMatch(contentType, urlExtension) — whether it matches
parse(raw) → parsed content         — how to parse
format(parsed) → string             — what format to output
truncate(formatted, limit) → result — how to truncate
metadata() → object                 — what metadata to return
```

Each handler **must** implement parse failure fallback strategy:

```text
When parse() throws an exception → fallback to plain text returning original content + annotate parseWarning in metadata
```

For example: JSON handler receives invalid JSON → returns original content as plain text, metadata contains `{ parseWarning: "Invalid JSON, returned as plain text" }`. CSV column count inconsistency, XML format errors follow the same pattern.

### Main Flow

```text
fetch URL
  → detect content type (Phase 1 detection logic)
  → select handler from registry
  → handler.parse(raw)
    → if failed, fallback to plain text
  → handler.format(parsed)
  → handler.truncate(formatted)
  → return with metadata
```

### Execution Boundary

This phase only changes architecture, reusing existing parsing logic (HTML extraction, plain text normalization, etc.). Focus on setting up the extension points.

### Acceptance Criteria

- `fetch_content` main flow no longer has large if/else blocks
- Existing HTML and plain text behavior unchanged (regression tests pass)
- Each handler's parse failure can fallback to plain text
- New content types only need to implement handler interface and register, without modifying main flow

---

## Phase 3: Extend Lightweight Text-based Content Support

### Goal

Enable agents to read more common content types found on the real web.

### Main Content

#### Markdown

Support:

```text
text/markdown
text/x-markdown
.md
.markdown
```

Handling (belongs to PlainTextHandler, consistent with other plain text types):

```text
Preserve Markdown as-is
Apply basic whitespace normalization
Limit maximum output length
```

#### JSON

Support:

```text
application/json
application/*+json
.json
```

Handling:

```text
Small JSON: pretty print
Large JSON: truncate
Arrays: can display only first N items
JSON-LD: prefer extracting headline/name/description/articleBody fields
Parse failure: fallback to plain text + parseWarning
```

#### CSV / TSV

Support:

```text
text/csv
text/tab-separated-values
.csv
.tsv
```

Handling:

```text
Read only first ~100 rows
Limit maximum column count
Output Markdown table or clear text table
Return truncated/sample metadata
Parse failure: fallback to plain text + parseWarning
```

#### XML / RSS / Atom

Support:

```text
application/xml
text/xml
application/rss+xml
application/atom+xml
.xml
.rss
.atom
```

Handling:

```text
RSS/Atom: extract feed title, entry title, link, published, summary
Plain XML: format or simplify to readable text
Parse failure: fallback to plain text + parseWarning
```

#### YAML

Support:

```text
text/yaml
text/x-yaml
application/yaml
.yml
.yaml
```

Handling:

```text
Return as text
Basic whitespace normalization
Truncate
```

#### Source text

Support common source code/style types (belongs to PlainTextHandler):

```text
text/css
text/javascript
application/javascript
application/typescript
.js
.ts
.css
```

Handling:

```text
Return as source text
Don't try to execute
Don't format
Only truncate and add metadata
```

### Execution Boundary

Do not introduce heavyweight dependencies. If CSV/XML need dependencies, choose lightweight libraries; if the project prefers zero dependencies, do simple parsing first.

### Acceptance Criteria

These types will no longer throw unsupported content type errors, but can return agent-readable content.

---

## Phase 4: Security and Stability Audit with Incremental Additions

### Goal

Audit whether existing security limits are complete, and add missing configurable capabilities.

### Existing Foundation (Implemented)

Current code has implemented the following security/stability measures:

| Capability | Implementation Location | Current Default |
|------------|------------------------|-----------------|
| Download size limit | `fetch.ts` → `readLimitedBody()` streaming byte count | `maxResponseBytes: 1MB` (1048576) |
| Output length limit | `extract.ts` → `truncateContent()` | `maxContentChars: 30000` |
| Request timeout | `abort.ts` → `withTimeoutSignal()` | `timeoutMs: 10000` |
| Private network URL blocking | `security.ts` → `validatePublicHttpUrl()` + `isPrivateIPv4()` + `isPrivateIPv6()` | Hard block, not configurable |
| Blocked range | localhost, 127.0.0.1, 0.0.0.0, ::1, 169.254.x.x, 10.x.x.x, 172.16-31.x.x, 192.168.x.x, 100.64-127.x.x, multicast, file:// | — |
| DNS resolution secondary verification | `security.ts` → After DNS lookup, check if resolved IP is private | — |
| Redirect limit | `fetch.ts` → `fetchWithRedirects()` | `MAX_REDIRECTS = 5` |
| Concurrent rate limiting | `concurrency.ts` → `withThrottle()` | Configurable |
| Connection pool | `http-pool.ts` → `pooledFetch()` | Configurable |
| Truncation metadata | `truncateContent()` returns `{ content, truncated, originalLength }` | — |
| Structured error codes | `errors.ts` → `CONTENT_FETCH_TIMEOUT`, `CONTENT_FETCH_TOO_LARGE`, etc. | — |

### Incremental Additions

#### 1. `allowPrivateNetwork` Configuration Switch

Current private network blocking is hardcoded. For personal local tool scenarios, users may need to access local services (e.g., localhost:3000 development server).

Suggested new config item:

```text
web.allowPrivateNetwork: false  (default off, keep conservative)
```

When set to `true`, skip private address check in `validatePublicHttpUrl`.

#### 2. Binary Detection for Unknown Content-Type

For unrecognized Content-Types, add lightweight magic bytes detection:

```text
First 16 bytes match common binary signatures (PDF: %PDF, ZIP: PK, Office: PK/ÐÏ) → directly reject, don't try text decoding
Otherwise → fallback to plain text
```

### Execution Boundary

This phase is incremental addition, not restructuring existing security architecture.

### Acceptance Criteria

- Large files, slow responses, binary file scenarios won't hang or pollute context (existing, regression verify)
- `allowPrivateNetwork: true` allows localhost access (new)
- Known binary formats are quickly rejected without wasting download bandwidth (new)

---

## Phase 5: Jina Reader Fallback Strategy Extension

### Goal

Extend trigger conditions on existing Jina fallback basis and make strategy configurable.

### Existing Foundation (Implemented)

| Capability | Implementation Location | Current Status |
|------------|------------------------|----------------|
| Jina Reader request logic | `fetch.ts` → `fetchFromJinaReader()` | Implemented, fetches content via `r.jina.ai/` |
| Trigger condition detection | `extract.ts` → `shouldTryJinaFallback()` | Implemented: body text < 200 chars and script tags > 3 |
| Enable config | `ResolvedWebConfig.enableJinaFallback` | Default `false` |
| Timeout config | `ResolvedWebConfig.jinaTimeoutMs` | Default `8000` |

### Incremental Extensions

#### 1. Extend Trigger Conditions

On existing `short-html + js-heavy` basis, add optional trigger conditions:

```text
"short-html"    — HTML body too short (existing, body < 200 chars + script > 3)
"js-heavy-html"  — JS-heavy page detection (existing, included in above logic)
"user-request"   — user explicitly specified preferReader: true in tool parameter
"unsupported-type" — unsupported but URL looks like webpage (e.g., .html returned octet-stream)
```

Phase 1 does not recommend automatically routing all unsupported types through Jina to avoid uncontrollable external requests.

#### 2. Make Trigger Strategy Configurable

Change trigger conditions from hardcoded to configurable:

```json
{
  "web": {
    "enableJinaFallback": true,
    "jinaTriggers": ["short-html", "js-heavy-html"],
    "jinaTimeoutMs": 8000
  }
}
```

#### 3. Tool Parameter Support

Add optional field in `fetch_content` parameter schema:

```text
preferReader?: boolean  — user explicitly requests Jina Reader
```

### Execution Boundary

Jina Reader is an external service and should not be a mandatory path for devkit-pi. Users must be able to turn it off. Trigger condition extension should progress incrementally to avoid introducing unpredictable external requests.

### Acceptance Criteria

- Existing Jina fallback behavior unchanged (regression tests pass)
- `preferReader: true` parameter can trigger Jina
- Trigger conditions can be trimmed via config

---

## Phase 6: Testing and Documentation

### Testing Scope

#### Reuse Existing Tests (Regression Verification)

The following capabilities have complete test coverage (12+ test files under `tests/web/`), ensuring refactoring doesn't break:

```text
HTML text extraction (extract.test.ts)
Plain text normalization (extract.test.ts)
Jina fallback trigger logic (extract.test.ts)
Content truncation (extract.test.ts)
Download byte limit (fetch.test.ts)
Content-Type limit (fetch.test.ts)
Private network URL blocking (security.test.ts)
DNS resolution verification (security.test.ts)
Timeout/abort handling (abort.test.ts)
Concurrent rate limiting (concurrency.test.ts)
Connection pool reuse (http-pool.test.ts)
Structured error codes (errors.test.ts)
Result storage and retrieval (storage.test.ts)
Observability recording (observability.test.ts)
Schema validation (schemas.test.ts)
Tool registration (register.test.ts)
Renderers (renderers.test.ts)
```

#### New Tests

```text
Phase 1: URL extension fallback detection (various Content-Type + extension combinations)
Phase 1: application/octet-stream + known extension recognition
Phase 1: Binary magic bytes quick rejection
Phase 2: Each Handler's parse success path
Phase 2: Each Handler's parse failure fallback (fallback to plain text + parseWarning)
Phase 3: markdown / json / csv / tsv / xml / rss / atom / yaml / source text for each type
Phase 3: application/*+json with parameters in Content-Type
Phase 3: text/* fallback for unknown subtypes
Phase 4: allowPrivateNetwork config takes effect
Phase 5: preferReader parameter triggers Jina
Phase 5: jinaTriggers config trimming
```

### Documentation Needs

Clearly document:

```text
What types fetch_content supports (existing + new)
What types are not supported (PDF/DOCX/XLSX/PPTX/audio/video, etc.)
How to handle currently unsupported types (don't guide to unimplemented convert_content)
Jina fallback trigger conditions and configuration
Security limits and config items (including existing defaults)
allowPrivateNetwork use cases and risks
```

---

## `fetch_content` Phase 1 Boundary Summary

### Do

```text
Content-Type detection enhancement + URL extension fallback (Phase 1)
Handler registry architecture refactor (Phase 2)
Markdown/JSON/CSV/XML/YAML/source text support (Phase 3)
Each Handler's parse failure fallback (Phase 2-3)
Security limits audit + allowPrivateNetwork config (Phase 4)
Jina fallback trigger strategy extension + configurability (Phase 5)
```

### Already Done (No Need to Re-implement)

```text
URL fetching + redirect handling
HTML/plain text extraction and normalization
Download size limit (1MB) + streaming byte count
Output length limit (30000 chars) + truncation metadata
Request timeout (10s)
Private network URL blocking (including DNS resolution verification)
Concurrent rate limiting + connection pool
Structured error codes + recovery suggestions
Jina Reader fallback core logic (default off)
Result storage and retrieval
Observability recording
```

### Don't Do

```text
Don't parse PDF
Don't parse DOCX/PPTX/XLSX
Don't do OCR
Don't do audio transcription
Don't do charset auto-detection/conversion (hardcoded UTF-8, non-UTF-8 content may garble but won't error)
Don't introduce Playwright
Don't introduce Firecrawl/Crawl4AI
Don't auto-install external tools
Don't cram MarkItDown into fetch_content core
Don't guide agents to use unimplemented convert_content in fetch_content
```
