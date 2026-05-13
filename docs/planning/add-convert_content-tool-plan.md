---
status: implemented
audience: maintainer
last_verified: 2026-05-12
language: english
---

# Plan: Add `convert_content` Tool

## Positioning

`convert_content` is a new independent agent tool responsible for:

```text
Complex files / local files / downloaded remote files → Markdown
```

Its positioning is not web fetch, but **document conversion**.

The tool system becomes:

```text
web_search       — search the web
fetch_content    — lightweight URL content fetching
convert_content  — complex file to Markdown conversion
```

Phase 1 of `convert_content` only integrates the **MarkItDown CLI provider**.

---

## Module Structure

### Source Path

Independent module `src/modules/convert/`, parallel to `web/`, `lsp/`, `subagents/`, `commands/`:

```text
src/modules/convert/
├─ index.ts          # module entry + registerConvertTools()
├─ provider.ts       # ConvertProvider interface + MarkItDownProvider
├─ tool.ts           # convert_content tool implementation
├─ schemas.ts        # ConvertContentParams TypeBox schema
├─ types.ts          # ConvertContentInput, ConvertContentResult, etc.
├─ errors.ts         # CONVERT_ERROR_CODES
├─ renderers.ts      # TUI rendering (renderCall / renderResult)
├─ observability.ts  # activity recording
└─ security.ts       # file path validation (URL security reuses web/security.ts)
```

Test path mirrors source:

```text
tests/convert/
├─ provider.test.ts
├─ tool.test.ts
├─ security.test.ts
├─ config.test.ts
└─ renderers.test.ts
```

Test script synchronization requirement: after adding `tests/convert/*.test.ts`, update the `test:unit` script in `package.json` in the same change so convert tests are included in the default `pnpm test` scope. The current script explicitly includes only `tests/subagents`, `tests/commands`, `tests/web`, `tests/lsp`, and the package manifest test; without updating it, convert tests will not run.

### Registration Entry

Add registration call in `src/index.ts`:

```ts
import { registerConvertTools } from "./modules/convert/index.ts";

export default function registerExtension(pi: ExtensionAPI): void {
  // ... existing registrations ...
  registerConvertTools(pi, effectiveConfig.convertContent);
}
```

### Config Namespace

Top-level namespace `convertContent`, parallel to existing `web`, `lsp`, `subagents`, `commands`.

---

## Reuse of Existing Infrastructure

| Infrastructure | Approach | Notes |
|----------------|----------|-------|
| `web/security.ts` `validatePublicHttpUrl()` | **Direct import** | SSRF protection logic is identical; no reimplementation |
| `web/security.ts` `isPrivateNetworkHostname()` | **Direct import** | Same as above |
| `web/http-pool.ts` `pooledFetch()` | **Direct import** | URL download reuses connection pool |
| `web/abort.ts` `withTimeoutSignal()` | **Direct import** | Timeout logic is generic |
| `shared/types.ts` `TEMP_ROOT_DIR` | **Direct import** | Temp file directory infrastructure already exists |
| `web/concurrency.ts` `withThrottle()` | **Not used in v1** | convert_content typically handles one file at a time; no throttling needed |
| `web/storage.ts` `storeResult()` | **Not reused** | v1 does not store convert results (see rationale below) |

These are inter-module public API imports, not deep private implementation dependencies, conforming to AGENTS.md boundary rules.

---

## Rationale for Not Storing Convert Results

- convert_content output is a full Markdown document, much larger than search snippets.
- Storage would rapidly consume the `web.maxStoredContentChars` quota.
- Agents can re-invoke convert_content when needed.
- If storage is needed in the future, it can be added independently without affecting the v1 tool contract.

---

## Phase 1 Boundary Summary

### Do

```text
Add new independent module src/modules/convert/
Add new independent agent tool convert_content
Integrate MarkItDown CLI (optional provider, user self-installs)
Support local path input
Support remote url input, securely download to temp file before conversion
Output Markdown
Support timeout, maxResponseBytes, maxContentChars
Support command missing friendly error
Support config (top-level convertContent namespace)
TUI renderer (renderCall / renderResult)
Activity recording (observability, integrated with /toolkit activity)
Complete error code system
Synchronized test and documentation updates
```

### Don't Do

```text
Don't put MarkItDown into fetch_content
Don't auto-install MarkItDown
Don't directly call Python API
Don't store convert results in responseId storage
Don't implement allowOutsideWorkspace file sandbox (pi runtime already has permission boundaries)
Don't add outputFormat multi-format option (v1 only supports Markdown)
Don't do OCR config
Don't do audio transcription
Don't do image understanding
Don't do ZIP recursive parsing
Don't do multiple providers (v1 only markitdown)
Don't do complex chunking
Don't do structured element models
Don't introduce Docling / Marker / Tika / Pandoc
Don't implement fetch_content autoConvert
Don't change WebToolError interface structure (no suggestedTool structured field)
```

---

## Recommended Phase Breakdown

---

## Phase 0: Pre-implementation Consistency Decisions (Clarified)

This phase only aligns the plan; it does not implement code. Later phases must follow these decisions:

1. **Use `path` consistently for local file input**: all local file input, schemas, tests, error messages, and docs use `path`; do not use `file_path`.
2. **Oversized output truncates successfully by default**: when `content` exceeds `maxContentChars`, return truncated Markdown with `truncated=true`; v1 does not keep an `OUTPUT_TOO_LARGE` error code unless a future independently non-truncatable failure mode appears.
3. **Test scripts must be updated together with tests**: the same change that adds `tests/convert/*.test.ts` must update `package.json` `test:unit` so `pnpm test` runs convert tests.
4. **URL download must defend against redirect SSRF**: validating only the initial URL is not enough. Every HTTP 30x redirect target must go through `validatePublicHttpUrl({ allowPrivateNetwork })`, with a maximum redirect count. Before Phase 4 implementation, prefer extracting or reusing the existing `fetch_content` safe-download pattern to avoid inconsistent network security logic.
5. **Observability must abstract activity sources first**: `/toolkit activity` currently mainly consumes web activity. Phase 5 should not record logs only inside the convert module; the activity panel must display `search` / `fetch` / `get_content` / `convert` through a unified interface. Viable approaches include a shared toolkit-level activity registry or normalizing the existing web activity model into toolkit-level activity.

---

## Phase 1: Module Skeleton + Config System + Schema + Error Codes

### Goal

Establish the complete module skeleton so that typecheck passes and the config system can load the empty module.

### Input Design

Flat schema, consistent with existing web tools' `url?/urls?` style:

```ts
{
  path?: string,
  url?: string,
  maxContentChars?: number,
  timeoutMs?: number
}
```

The `source.type/value` nested approach is not used because existing tools have no nested precedent.

Execution layer validates `path` and `url` are mutually exclusive: providing both returns `INVALID_INPUT`; providing neither also returns `INVALID_INPUT`.

The `outputFormat` field is not retained — v1 only supports Markdown, making it premature abstraction. Add it later when multi-format support is needed.

### Output Design

```ts
{
  source: string,              // file path or URL
  provider: string,            // provider name, e.g. "markitdown"
  content: string,             // Markdown content
  truncated: boolean,          // whether truncated
  metadata?: {
    contentType?: string,      // original content type
    fileName?: string,         // file name
    fileSize?: number,         // original file size (bytes)
    durationMs?: number        // conversion duration
  }
}
```

### Error Codes

New `src/modules/convert/errors.ts`:

```ts
export const CONVERT_ERROR_CODES = {
  INVALID_INPUT: "INVALID_INPUT",                 // neither path nor url provided, or both provided
  FILE_NOT_FOUND: "FILE_NOT_FOUND",               // file pointed to by path does not exist
  FILE_TOO_LARGE: "FILE_TOO_LARGE",               // file exceeds maxResponseBytes
  UNSUPPORTED_PROTOCOL: "UNSUPPORTED_PROTOCOL",   // not file/http/https
  COMMAND_NOT_FOUND: "COMMAND_NOT_FOUND",         // markitdown not installed
  CONVERT_TIMEOUT: "CONVERT_TIMEOUT",             // conversion timeout
  CONVERT_FAILED: "CONVERT_FAILED",               // markitdown returned non-zero exit code
  NETWORK_ERROR: "NETWORK_ERROR",                 // URL download failure
  PRIVATE_NETWORK_BLOCKED: "PRIVATE_NETWORK_BLOCKED", // SSRF block
} as const;

export type ConvertErrorCode = (typeof CONVERT_ERROR_CODES)[keyof typeof CONVERT_ERROR_CODES];
```

Error structure consistent with the web module:

```ts
{
  error: {
    code: ConvertErrorCode;
    message: string;
  }
}
```

### Config System Integration

#### Add to `src/shared/types.ts`

```ts
export interface ConvertContentConfig {
  enabled?: boolean;
  provider?: "markitdown";
  command?: string;
  timeoutMs?: number;
  maxResponseBytes?: number;
  maxContentChars?: number;
  allowPrivateNetwork?: boolean;
}

export type ResolvedConvertContentConfig = Required<ConvertContentConfig>;
```

Modify `ToolkitConfig` and `ResolvedToolkitConfig` to add the `convertContent` field.

#### Add to `src/config/load-config.ts`

```ts
export const DEFAULT_CONVERT_CONTENT_CONFIG: ResolvedConvertContentConfig = {
  enabled: true,
  provider: "markitdown",
  command: "markitdown",
  timeoutMs: 30000,
  maxResponseBytes: 10485760,    // 10 MB
  maxContentChars: 50000,
  allowPrivateNetwork: false,
};

function normalizeConvertContentConfig(
  base: ConvertContentConfig | undefined
): ResolvedConvertContentConfig {
  return {
    enabled: booleanValue(base?.enabled, DEFAULT_CONVERT_CONTENT_CONFIG.enabled),
    provider: "markitdown",  // v1 only supports markitdown
    command: nonEmptyString(base?.command, DEFAULT_CONVERT_CONTENT_CONFIG.command),
    timeoutMs: positiveInteger(base?.timeoutMs, DEFAULT_CONVERT_CONTENT_CONFIG.timeoutMs),
    maxResponseBytes: positiveInteger(
      base?.maxResponseBytes, DEFAULT_CONVERT_CONTENT_CONFIG.maxResponseBytes
    ),
    maxContentChars: positiveInteger(
      base?.maxContentChars, DEFAULT_CONVERT_CONTENT_CONFIG.maxContentChars
    ),
    allowPrivateNetwork: booleanValue(
      base?.allowPrivateNetwork, DEFAULT_CONVERT_CONTENT_CONFIG.allowPrivateNetwork
    ),
  };
}
```

Integrate into `mergeConfig()`.

#### Config Field Naming Reference

| Config field | Purpose | Aligned with |
|-------------|---------|-------------|
| `enabled` | Whether enabled | All modules |
| `provider` | Provider name | `web.provider` |
| `command` | External command path | New field, no precedent |
| `timeoutMs` | Timeout in milliseconds | `web.timeoutMs` |
| `maxResponseBytes` | Max download/read bytes | `web.maxResponseBytes` (⚠️ do NOT use `maxDownloadBytes`) |
| `maxContentChars` | Max tool return characters | `web.maxContentChars` (⚠️ do NOT use `maxOutputChars`) |
| `allowPrivateNetwork` | Allow private network access | `web.allowPrivateNetwork` |

Default behavior:

```text
Tool registration exists by default
If markitdown is not installed at execution time, return COMMAND_NOT_FOUND friendly error
Do not force users to install
```

### Empty Module Registration

- `src/modules/convert/index.ts`: exports `registerConvertTools(pi, config)`, checks `config.enabled` internally, registers a stub tool.
- `src/index.ts`: call `registerConvertTools(pi, effectiveConfig.convertContent)` at the end of the existing registration chain.

### Acceptance Criteria

- `pnpm typecheck` passes
- Config system can load the `convertContent` namespace, normalization works correctly
- Tool can be registered (stub implementation), TUI does not crash
- `convertContent.enabled=false` does not register the tool

### Synchronized Updates

- `docs/reference/configuration.md`: add `## Convert content configuration` section
- `docs/guides/architecture.md`: add `convert` to module list

---

## Phase 2: Implement MarkItDown CLI Provider

### Goal

Invoke MarkItDown via external command, without forcing Python dependencies into devkit-pi's Node dependency chain.

### Provider Interface

```ts
export interface ConvertProvider {
  readonly name: string;
  /** Check if provider is available (command exists, etc.) */
  isAvailable(): Promise<boolean>;
  /** Convert a local file to Markdown */
  convertFile(filePath: string, options: ConvertOptions): Promise<ConvertResult>;
}

export interface ConvertOptions {
  maxResponseBytes: number;
  timeoutMs: number;
  maxContentChars: number;
}

export interface ConvertResult {
  content: string;
  truncated: boolean;
  metadata?: {
    contentType?: string;
    fileName?: string;
    fileSize?: number;
    durationMs?: number;
  };
}
```

### MarkItDownProvider Implementation

Responsibilities:

```text
Check if markitdown command exists
Call markitdown <input-file>
Capture stdout/stderr
Handle exit code
Handle timeout (using withTimeoutSignal)
Handle output truncation
Return Markdown
```

Command existence check: probe with `which markitdown` or `markitdown --version`, cache result to avoid repeated checks.

### Why CLI?

Because devkit-pi is a pi coding extension package, it should not force all users to install Python packages into the Node dependency chain.

CLI approach is more suitable for:

```text
Optional capability
Local toolchain
User self-installs
Cross-provider extension
```

### Execution Boundary

- Do not auto-install MarkItDown. Only suggest how to install in `COMMAND_NOT_FOUND` error messages.
- V1 only supports one provider, but the interface reserves extension points.
- Do not rely on MarkItDown's URL handling capability. Always download to a local temp file first to ensure security controls (SSRF, size limits, timeout) are fully in devkit-pi's hands. If MarkItDown's URL handling is confirmed safe in the future, skipping the download step can be considered as an optimization.

### Acceptance Criteria

- Unit tests cover: success / command missing / timeout / truncation / stderr summary
- Tests use mock commands, no dependency on actual markitdown installation

---

## Phase 3: Support Local path Input

### Goal

First get the most stable input path working.

### Main Content

For local files:

```text
Check if file exists (→ FILE_NOT_FOUND)
Check if it is a file (not a directory)
Check file size (→ FILE_TOO_LARGE)
Call provider.convertFile()
Limit output length (maxContentChars truncation, truncated=true)
```

### Security Boundary

V1 does not implement `allowOutsideWorkspace` file sandbox. Rationale:

- pi runtime already has a file access permission model; devkit-pi as an extension package should not reimplement file sandboxing.
- If finer-grained control is needed in the future, it can be added independently without blocking v1.
- The file path parameter's access scope depends on pi runtime's tool permission model.

### Acceptance Criteria

Local PDF, DOCX, PPTX, XLSX, HTML, Markdown and other files can be converted to Markdown via MarkItDown.

### Synchronized Updates

- Tests: `tests/convert/tool.test.ts` covers success / file not found / file too large / truncation

---

## Phase 4: Support URL Input, Must First Download Safely

### Goal

Allow agents to call `convert_content({ url })` for remote files, always downloading to a local temp file first.

### Recommended Flow

```text
1. Reuse web/security.ts validatePublicHttpUrl() to validate the initial URL
   — SSRF protection and private network blocking
2. Reuse web/http-pool.ts pooledFetch() + web/abort.ts withTimeoutSignal()
   to download to temp file (under TEMP_ROOT_DIR); fetch must use manual redirect handling
3. Re-run validatePublicHttpUrl({ allowPrivateNetwork }) for every 30x redirect Location
   — enforce a maximum redirect count; exceeding it returns NETWORK_ERROR
   — redirecting to a private network target returns PRIVATE_NETWORK_BLOCKED
4. Apply maxResponseBytes to limit download size
5. Apply timeoutMs to limit download time
6. Record contentType / fileName / fileSize
7. Call provider.convertFile() to convert temp file
8. Delete temp file (cleanup in finally block, ensuring cleanup on exceptions)
9. Return Markdown
```

### Why Not Directly Give MarkItDown URL?

Because directly handing to external tools weakens control over:

```text
Download size
Download timeout
SSRF protection
Private network access restriction
Temp file cleanup
Error format
metadata
```

Even if MarkItDown CLI supports URLs natively, devkit-pi's download flow should always be used. If MarkItDown's URL handling is confirmed safe in the future, skipping the download step can be considered as an optimization.

### Security Configuration

- `allowPrivateNetwork`: reuse `web/security.ts` `validatePublicHttpUrl({ allowPrivateNetwork })` logic.
- `maxResponseBytes`: controls download size; returns `FILE_TOO_LARGE` when exceeded.
- `timeoutMs`: applies to both download and conversion phases.

### Execution Boundary

- V1 URL download does not need to support complex cookies, login, or browser rendering.
- Non-HTTP/HTTPS protocols are not supported (returns `UNSUPPORTED_PROTOCOL`).

### Acceptance Criteria

- Remote PDF conversion succeeds
- SSRF blocking works (private network URLs are rejected)
- Temp files are cleaned up on both success and exception paths
- Download timeout and size limits work
- Every hop in a redirect chain is SSRF-checked; redirects to private network targets are blocked

### Synchronized Updates

- Tests: cover URL success / SSRF blocked / download timeout / file too large / temp file cleanup

---

## Phase 5: TUI Renderer + Observability

### Goal

Complete the presentation layer and observability for the tool, consistent with other tools.

### TUI Renderer

New `src/modules/convert/renderers.ts`, mirroring `src/modules/web/renderers.ts` structure:

```ts
export function renderConvertContentCall(args: ConvertContentInput, theme: ThemeLike): Text {
  // Display: convert_content <filename or URL> [provider]
}

export function renderConvertContentResult(
  result: AgentToolResult<any>,
  options: { expanded: boolean; isPartial: boolean },
  theme: ThemeLike
): Text {
  // Collapsed: content preview + truncated flag + metadata
  // Expanded: full JSON
  // Error: error code + message
  // Partial: "Converting..."
}
```

Pass `renderCall` / `renderResult` in `defineTool()` during registration.

### Observability

New `src/modules/convert/observability.ts`:

```ts
export type ConvertActivityType = "convert";

export function recordConvertActivity(
  status: "success" | "error",
  provider?: string,
  errorCode?: string,
  durationMs?: number
): void;
```

Activity type is `"convert"`, parallel to web's `"search"` / `"fetch"` / `"get_content"`.

The `/toolkit activity` command needs to display convert activity. Do not only modify the activity subcommand in `src/modules/commands/register.ts`; also handle the activity data-source boundary. The current activity panel depends on web observability. Phase 5 should first extract activity recording/reading into a toolkit-level or shared-level API, or equivalently normalize existing web activity so convert and web activity enter the panel through the same interface.

### Acceptance Criteria

- TUI collapsed/expanded display is correct
- Error display shows error code and message
- `/toolkit activity` can record and display convert activity

---

## Phase 6: Integration with `fetch_content`

### Goal

Let the two tools collaborate, but don't couple them.

### Recommended Approach

Modify the error message in `src/modules/web/fetch.ts` when `detectSupportedContent` returns `unsupported` for likely document formats, adding an actionable suggestion:

```ts
// Current code
if (detected.type === "unsupported") {
  throw new Error(detected.unsupportedReason ?? `Unsupported content type for ${finalUrl}`);
}

// Change to
if (detected.type === "unsupported") {
  const reason = detected.unsupportedReason ?? `Unsupported content type for ${finalUrl}`;
  throw new Error(
    `${reason} This file type requires document conversion — consider using convert_content instead.`
  );
}
```

### Phase 6 Decision: Message Hint Only

Do **not** add public `suggestion`, `nextAction`, `suggestedTool`, or similar fields for Phase 6. Keep the public web error shape stable:

```ts
{
  error: {
    code: string;
    message: string;
  };
}
```

Rationale:

- Current `WebToolError` is a public API contract (`error.code` + `error.message`); expanding it for one web/convert integration point would create a new public schema before there is a cross-module need.
- Existing code already includes actionable suggestions in `message` (e.g., timeout errors suggest "Try fewer URLs or increase web.timeoutMs").
- Agent models can understand "use convert_content" from natural language messages; no structured field is needed for this phase.
- A one-off `suggestion` / `nextAction` field would be inconsistent with other tool errors unless introduced as a shared cross-module pattern.
- If multiple modules later need structured recovery suggestions, design a dedicated shared error suggestion schema in a separate phase and update web / convert / lsp / subagent consistently.

### Whether to Support `fetch_content.autoConvert`

V1 does not support auto-conversion. Maintain the explicit two-step flow:

```text
fetch_content fails and suggests convert_content
→ Agent explicitly calls convert_content
```

This is more controllable and easier to debug.

### Acceptance Criteria

- fetch_content error message for unsupported types includes convert_content suggestion
- No impact on existing CONTENT_FETCH_FAILED error code semantics

### Synchronized Updates

- `docs/reference/web-tools.md`: update unsupported type description in fetch_content's Content extraction behavior section

---

## Phase 7: Test Wrap-up + Documentation

### Complete Test Scope

Supplementary test cases beyond what each phase already covers:

```text
[Phase 1] Config default normalization (convertContent: {} all defaults, type errors fall back to defaults)
[Phase 1] convertContent.enabled=false does not register tool
[Phase 2] markitdown command missing → COMMAND_NOT_FOUND
[Phase 2] markitdown returns non-zero exit code → CONVERT_FAILED
[Phase 2] markitdown stderr summary included in error message
[Phase 3] Local path successful conversion, using mock command
[Phase 3] file pointed to by path does not exist → FILE_NOT_FOUND
[Phase 3] File exceeds maxResponseBytes → FILE_TOO_LARGE
[Phase 3] Output exceeds maxContentChars → truncated=true (truncation success, not an error)
[Phase 4] url download to temp file then convert
[Phase 4] SSRF block (initial private network URL) → PRIVATE_NETWORK_BLOCKED
[Phase 4] redirect to private network URL → PRIVATE_NETWORK_BLOCKED
[Phase 4] Download timeout → CONVERT_TIMEOUT
[Phase 4] Non http/https protocol → UNSUPPORTED_PROTOCOL
[Phase 4] Temp file cleanup on both success and exception paths
[Phase 5] renderCall / renderResult display correct
[Phase 5] /toolkit activity records convert activity
[Phase 6] fetch_content unsupported message includes convert_content suggestion
[General] Provider interface extensibility (mock provider injection test)
[General] path and url both provided → INVALID_INPUT
[General] path and url both missing → INVALID_INPUT
```

### Documentation Update Checklist

| Document | Change |
|----------|--------|
| `docs/reference/configuration.md` | Add `## Convert content configuration` section |
| `docs/reference/convert-tools.md` | **New file**: full convert_content reference |
| `docs/reference/web-tools.md` | Update fetch_content unsupported type description |
| `docs/reference/web-tools-error-codes.md` | Add convert_content error code cross-reference |
| `docs/guides/architecture.md` | Add `convert` to module list |
| `AGENTS.md` | Mark convert_content as implemented |

### `docs/reference/convert-tools.md` Content Should Cover

```text
convert_content is an optional tool
Requires users to self-install MarkItDown CLI
Difference from fetch_content
Supported inputs (path / url)
Advanced capabilities v1 does not support
Config reference (command / timeoutMs / maxResponseBytes / maxContentChars / allowPrivateNetwork)
Remote URL processing flow
Error code reference
Provider interface extensibility
```

---

## Configuration Examples

### Full Default Config

```json
{
  "convertContent": {
    "enabled": true,
    "provider": "markitdown",
    "command": "markitdown",
    "timeoutMs": 30000,
    "maxResponseBytes": 10485760,
    "maxContentChars": 50000,
    "allowPrivateNetwork": false
  }
}
```

### Minimal Config (All Defaults)

```json
{
  "convertContent": {}
}
```

### Disabled

```json
{
  "convertContent": {
    "enabled": false
  }
}
```

### Custom Command Path

```json
{
  "convertContent": {
    "command": "/usr/local/bin/markitdown"
  }
}
```
