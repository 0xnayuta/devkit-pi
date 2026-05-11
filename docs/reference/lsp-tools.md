---
status: current
audience: user
last_verified: 2026-05-12
---

# LSP Tools Reference

This document is the public API reference for devkit-pi's built-in LSP module. Configuration defaults are defined in [`configuration.md`](./configuration.md); `/toolkit lsp` diagnostic entry is in [`toolkit-commands.md`](./toolkit-commands.md); source code is in `src/modules/lsp/*`.

## Overview

The LSP module exposes Language Server Protocol capabilities to pi agents for language-server-based code understanding and diagnostics. It is suitable for:

- Finding definitions and references
- Viewing hover / signature help
- Listing document symbols
- Getting single-file or multi-file diagnostics
- Assisting subagents in more accurate code navigation, review, and test planning

Difference from regular text search:

- `read` / `grep` / `find` / `rg` target text and file systems.
- `lsp` tool targets semantic information returned by language servers, such as symbols, definition locations, references, diagnostics.
- Web tools target external web search and content fetching, not local language servers.
- Subagents can use readonly LSP actions, but subagents are still not LSP server managers and should not depend on internal implementation details.

The LSP module contains two public integration surfaces:

1. Explicit tool: `lsp`
2. Automatic diagnostics hook: registered in the main agent process per configuration, used to provide diagnostics feedback after agent turns or edit/write

`src/modules/lsp/core.ts` is the internal language server manager and core implementation, not an additional public tool.

## Public surface

| Surface | Is public | Description | Primary source |
|---|---:|---|---|
| `lsp` tool | Yes | Only public LSP tool, uses `action` field to distinguish operations | `src/modules/lsp/tool.ts` |
| LSP diagnostics hook | Yes, as configurable integration point | Automatic diagnostics, not a tool agents can directly call | `src/modules/lsp/hook.ts` |
| `/toolkit lsp` | Yes, developer command | Shows LSP tool/hook configuration and action list | `src/modules/commands/register.ts` |
| `LSPManager` / helpers | No | Internal server lifecycle, path, format, diagnostics implementation | `src/modules/lsp/core.ts` |

## Public tool list

Currently only one LSP tool is actually registered: `lsp`.

### `lsp`

- Tool name: `lsp`
- Parameter schema: `LspParams`
- Success result: pi tool result with `content` and `details`
- Failure result: usually throws `LspError` or regular `Error`, displayed by pi runtime as tool failure
- Internal dispatch field: `action`

### Input schema

Source: `src/modules/lsp/schemas.ts`

```ts
{
  action: "definition" | "references" | "hover" | "symbols" |
    "diagnostics" | "workspace-diagnostics" | "signature" |
    "rename" | "codeAction" | "restart" | "servers";
  file?: string;
  files?: string[];
  line?: number;
  column?: number;
  endLine?: number;
  endColumn?: number;
  query?: string;
  newName?: string;
  severity?: "all" | "error" | "warning" | "info" | "hint";
  server?: string;
}
```

### Required fields

| Field | Required conditions |
|---|---|
| `action` | Always required |
| `file` | Required for most actions except `workspace-diagnostics`, `restart`, `servers` |
| `files` | Required for `workspace-diagnostics`, maximum 64 |
| `line` / `column` | Required for `definition`, `references`, `hover`, `signature`, `rename`, `codeAction`; can be omitted if `query` is provided and resolves to a symbol |
| `newName` | Required for `rename` |
| `server` | Optional for `restart`; defaults to `all` |

Line and column numbers are 1-indexed. Converted to 0-indexed when sent to LSP server internally.

### Optional fields

| Field | Purpose |
|---|---|
| `query` | For `symbols` as symbol name filter; for position-based actions can first resolve symbol position |
| `endLine` / `endColumn` | Range end position for `codeAction`; uses start position when not provided |
| `severity` | Filter diagnostics: `all`, `error`, `warning`, `info`, `hint`; default `all` |
| `server` | Target server id for `restart`, e.g., `clangd`; or `all` |

### Output shape

All successful actions return pi tool result:

```ts
{
  content: Array<{ type: "text"; text: string }>;
  details: unknown;
}
```

`content[0].text` is text for agent/user to read, usually starting with `action: ...`. `details` is structured result, shape varies by action.

Cancelled returns:

```ts
{
  content: [{ type: "text", text: "Cancelled" }],
  details: { cancelled: true }
}
```

### Success semantics

- No definitions, references, hover, signature, symbols, or code actions found is usually a success result, with text showing `No ... found/available`, not a tool failure.
- `diagnostics` returning `No diagnostics.` means the language server responded successfully with no matching diagnostics.
- `diagnostics` `Unsupported: ...` or `Timeout: ...` are action-level success return text/detail semantics, not equivalent to tool failure.
- Results are truncated: text maximum ~60,000 characters, list results maximum 200 items.

### Failure semantics

The following are usually tool failures:

- Missing action-required fields, e.g., missing `file`, `files`, `line/column`, or `newName`
- `workspace-diagnostics.files` exceeds 64
- File path resolves outside workspace
- Privileged action called when not allowed
- Subagent calling action not allowed by allowlist
- `restart` specifying unknown server id

The LSP module currently has no independent canonical error-code reference like Web. Source code has shared `ERROR_CODES` / `LspError`; current LSP-related codes include:

```text
INVALID_INPUT, LSP_SERVER_NOT_FOUND, LSP_TIMEOUT, LSP_ACTION_NOT_ALLOWED
```

Actual tool failure is based on pi runtime displayed error messages and `LspError.code`; do not assume existence of an `LSP_ERROR_CODES` constant table.

## Supported operations

Current `LSP_ACTIONS` from `src/modules/lsp/schemas.ts`:

```text
definition, references, hover, symbols, diagnostics, workspace-diagnostics,
signature, rename, codeAction, restart, servers
```

### `servers`

| Item | Description |
|---|---|
| Required input | `action: "servers"` |
| Output | `details.servers: string[]`; text lists server ids |
| Typical use case | View current built-in server adapter ids |
| Limitation | Does not start language servers; only lists adapter ids defined in source |

Example:

```json
{ "action": "servers" }
```

### `definition`

| Item | Description |
|---|---|
| Required input | `file` + `line`/`column`; or `file` + `query` |
| Output | `details.results` as LSP locations; `total` and `truncated` mark count |
| Typical use case | Jump to symbol definition |
| Limitation | Depends on language server availability, project root recognition, server returning definition |

Example:

```json
{ "action": "definition", "file": "src/index.ts", "line": 12, "column": 8 }
```

Using symbol query to resolve position:

```json
{ "action": "definition", "file": "src/index.ts", "query": "registerWebTools" }
```

### `references`

| Item | Description |
|---|---|
| Required input | `file` + `line`/`column`; or `file` + `query` |
| Output | `details.results` as LSP locations; `total` and `truncated` mark count |
| Typical use case | Find reference locations |
| Limitation | Results depend on server index state and project configuration |

Example:

```json
{ "action": "references", "file": "src/modules/lsp/tool.ts", "query": "registerLspTool" }
```

### `hover`

| Item | Description |
|---|---|
| Required input | `file` + `line`/`column`; or `file` + `query` |
| Output | `details` as LSP Hover or `null`; text is formatted hover content |
| Typical use case | View type, documentation, or symbol description |
| Limitation | Not all servers provide hover content |

Example:

```json
{ "action": "hover", "file": "src/modules/lsp/tool.ts", "line": 85, "column": 10 }
```

### `signature`

| Item | Description |
|---|---|
| Required input | `file` + `line`/`column`; or `file` + `query` |
| Output | `details` as LSP SignatureHelp or `null`; text is formatted signature |
| Typical use case | View function call signature |
| Limitation | Depends on current position and server support |

Example:

```json
{ "action": "signature", "file": "src/index.ts", "line": 20, "column": 16 }
```

### `symbols`

| Item | Description |
|---|---|
| Required input | `file` |
| Optional input | `query` to filter symbol name |
| Output | `details.lines: string[]`, and `total` / `truncated` |
| Typical use case | View document symbols like functions, classes, variables in a file |
| Limitation | Only queries a single document; not workspace symbol search |

Example:

```json
{ "action": "symbols", "file": "src/modules/lsp/tool.ts" }
```

Filtering:

```json
{ "action": "symbols", "file": "src/modules/lsp/tool.ts", "query": "diagnostics" }
```

### `diagnostics`

| Item | Description |
|---|---|
| Required input | `file` |
| Optional input | `severity` |
| Output | `details.diagnostics`, `diagnosticsTotal`, `diagnosticsTruncated`, and internal response status fields retained |
| Typical use case | Get LSP diagnostics for a single file |
| Limitation | If no corresponding LSP, file does not exist, or server timeout, will be reflected in success result text/details, not necessarily tool failure |

Example:

```json
{ "action": "diagnostics", "file": "src/modules/lsp/tool.ts" }
```

Only error/warning and above:

```json
{ "action": "diagnostics", "file": "src/modules/lsp/tool.ts", "severity": "warning" }
```

### `workspace-diagnostics`

| Item | Description |
|---|---|
| Required input | `files: string[]` |
| Optional input | `severity` |
| Output | `details.items`, each item contains file, diagnostics, status, error fields |
| Typical use case | Batch get diagnostics for a known set of files |
| Limitation | Not scanning entire workspace; caller must pass file array; maximum 64 files |

Example:

```json
{
  "action": "workspace-diagnostics",
  "files": ["src/index.ts", "src/modules/lsp/tool.ts"],
  "severity": "error"
}
```

### `rename`

| Item | Description |
|---|---|
| Required input | `file` + `line`/`column` or `query`, and `newName` |
| Output | `details` as LSP WorkspaceEdit or `null`; text shows edit summary |
| Typical use case | Preview language server suggested rename edits |
| Limitation | Privileged action; disabled by default; always disabled in subagent processes; currently tool returns edit, does not directly modify files |

Example (requires configuration to allow main agent mutating actions):

```json
{ "action": "rename", "file": "src/index.ts", "query": "main", "newName": "run" }
```

### `codeAction`

| Item | Description |
|---|---|
| Required input | `file` + `line`/`column` or `query` |
| Optional input | `endLine` / `endColumn` |
| Output | `details.actions`, and `total` / `truncated` |
| Typical use case | View quick fix / refactor / source actions |
| Limitation | Privileged action; disabled by default; always disabled in subagent processes; currently tool returns action list, does not execute action |

Example (requires configuration to allow main agent mutating actions):

```json
{ "action": "codeAction", "file": "src/main.cpp", "line": 10, "column": 5 }
```

### `restart`

| Item | Description |
|---|---|
| Required input | `action: "restart"` |
| Optional input | `server`, defaults to `all`; can be server id like `clangd` |
| Output | `details.restarted`, `server`, single server restart also includes `restartedCount` |
| Typical use case | Restart LSP manager or specified server client |
| Limitation | Privileged action; disabled by default; always disabled in subagent processes |

Example (requires configuration to allow main agent mutating actions):

```json
{ "action": "restart", "server": "all" }
```

## Path and workspace behavior

- `file` and `files` accept relative or absolute paths.
- Relative paths resolve based on current pi execution context's `ctx.cwd`.
- `LSPManager` performs `path.resolve()` and realpath normalize on paths.
- Resolved paths must be within current workspace root (cwd at manager creation); paths outside workspace throw: `LSP file access outside workspace is not allowed`.
- Non-existent files:
  - `diagnostics` usually returns success result with `details.unsupported=true`, `error="File not found"`.
  - `workspace-diagnostics` has corresponding item `status="error"`, `error="File not found"`.
  - Other actions usually return empty result or `No ... found/available`.
- URI to path conversion uses Node `fileURLToPath()`, including Windows file URI fallback handling.
- `tests/shared/path-handling.test.ts` mainly covers general cross-platform path handling principles, such as `path.isAbsolute()` and `path.join()`; LSP's own workspace boundary is covered by `tests/lsp/tool.test.ts`.

Do not interpret the above implementation as a complete cross-platform promise; actual behavior is still subject to Node.js, runtime platform, language server URI output format, and file system differences.

## Language server behavior

devkit-pi does not embed complete language servers, nor guarantees automatic installation of all servers. The LSP module selects source-defined server adapters based on file extension and project root markers, and attempts to start corresponding server binaries from the user environment.

### Server lifecycle

- `getOrCreateManager(cwd)` creates or reuses a singleton manager for current cwd.
- Manager reuses language server client by `(server id, root)`.
- Server initialization timeout approximately 30 seconds.
- Opened files close after idle; server client closes on session shutdown or restart.
- Diagnostics hook activation manages shutdown within main agent session lifecycle; when hook is not active, module registers standalone `session_shutdown` cleanup.

### Known server adapters

Current `LSP_SERVERS` defined adapters:

| Server id | Extension/language scope | Expected binary / startup | Root marker summary |
|---|---|---|---|
| `dart` | `.dart` | `dart language-server --protocol=lsp`, Flutter projects may use Dart SDK from Flutter cache | `pubspec.yaml`, `analysis_options.yaml` |
| `typescript` | `.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, `.cjs`, `.mts`, `.cts` | Local `node_modules/.bin/typescript-language-server` or PATH `typescript-language-server` | `package.json`, `tsconfig.json`, `jsconfig.json`; Deno projects skipped |
| `vue` | `.vue` | `vue-language-server --stdio` | `package.json`, `vite.config.ts`, `vite.config.js` |
| `svelte` | `.svelte` | `svelteserver --stdio` | `package.json`, `svelte.config.js` |
| `pyright` | `.py`, `.pyi` | `pyright-langserver --stdio` | `pyproject.toml`, `setup.py`, `requirements.txt`, `pyrightconfig.json` |
| `gopls` | `.go` | `gopls` | `go.work` or `go.mod` |
| `kotlin` | `.kt`, `.kts` | `kotlin-lsp` / `kotlin-lsp.sh` / `kotlin-lsp.cmd`; `PI_LSP_KOTLIN_LSP_PATH` customizable; fallback `kotlin-language-server` | Gradle/Maven markers |
| `swift` | `.swift` | `sourcekit-lsp`, or `xcrun sourcekit-lsp` | `Package.swift`, `*.xcodeproj`, `*.xcworkspace` |
| `rust-analyzer` | `.rs` | `rust-analyzer` | `Cargo.toml` |
| `clangd` | C/C++ extensions | `clangd` | `compile_commands.json`, `CMakeLists.txt`, `Makefile`, `.git`, etc. |

This table describes adapters existing in source code; does not guarantee availability on current machine. Actual availability depends on:

- Whether the corresponding binary is installed and in the search path
- Whether project root markers exist
- Whether the language server can successfully initialize
- Whether project configuration is complete, e.g., TypeScript dependencies, Python env, C/C++ compile database

Kotlin adapter additionally supports optional auto-download JetBrains Kotlin LSP: only triggered when environment variable `PI_LSP_AUTO_DOWNLOAD_KOTLIN_LSP=1` or `true`; default does not trigger network download.

## Diagnostics hook

Automatic diagnostics hook is LSP module's public integration behavior, but not an independent tool.

Configuration:

- `lsp.hook.enabled=true`
- `lsp.hook.mode="agent_end" | "edit_write" | "disabled"`

Behavior summary:

- Only registered in main agent process; subagent processes do not register hook.
- Registers `lsp-diagnostics` message renderer.
- Monitors session/tool/agent lifecycle events.
- `agent_end` mode: records files touched by write/edit this turn, sends follow-up diagnostics message when agent turn ends and is idle.
- `edit_write` mode: appends diagnostics text to tool result after write/edit tool result.
- Output maximum ~60,000 characters, maximum 16 touched files per turn.
- Diagnostics are language server's diagnosis of code, not equivalent to LSP tool failure.

## Configuration

Complete configuration: [`configuration.md#lsp-configuration`](./configuration.md#lsp-configuration).

Default configuration:

```json
{
  "lsp": {
    "enabled": true,
    "tool": {
      "enabled": true,
      "allowMutatingActions": false
    },
    "hook": {
      "enabled": true,
      "mode": "agent_end"
    }
  }
}
```

Common configuration:

| Config | Default | Purpose |
|---|---:|---|
| `lsp.enabled` | `true` | Whether to enable entire LSP module |
| `lsp.tool.enabled` | `true` | Whether to register `lsp` tool |
| `lsp.tool.allowMutatingActions` | `false` | Whether to allow main agent to call `rename`, `codeAction`, `restart` |
| `lsp.hook.enabled` | `true` | Whether to enable automatic diagnostics hook |
| `lsp.hook.mode` | `agent_end` | Hook trigger mode |

Subagent LSP exposure is also controlled by subagents configuration:

- `subagents.allowLspTools`
- `subagents.allowedLspActions`

Default allows subagents to use readonly-safe actions:

```text
definition, references, hover, signature, symbols, diagnostics, workspace-diagnostics, servers
```

Privileged actions:

```text
rename, codeAction, restart
```

These actions are disabled by default; even if main agent configuration allows, always disabled in subagent processes.

## Error and diagnostic semantics

### Tool failure

LSP tool failure usually comes from input, permission, or workspace boundary errors, such as:

- `Action "..." requires a file path.`
- `Action "..." requires line/column or a query matching a symbol.`
- `Action "workspace-diagnostics" accepts at most 64 files.`
- `LSP file access outside workspace is not allowed: ...`
- `Action "restart" is disabled: lsp.tool.allowMutatingActions is false.`
- `LSP action "..." is not allowed for this subagent process.`
- `Unknown server "...".`

These failures are thrown via `LspError` or regular `Error`, displayed by pi runtime.

### Diagnostics are not tool failure

LSP diagnostics are diagnostic data from language servers on code. Having diagnostics, no diagnostics, unsupported, timeout are all action-level semantics:

- `No diagnostics.`: server responded with no matching diagnostics.
- `Unsupported: ...`: no corresponding LSP, project root not recognized, server binary not found, file not readable, etc.
- `Timeout: LSP server did not respond. Try again.`: server did not return diagnostics within wait time.
- `workspace-diagnostics` individual files may be `ok`, `timeout`, `error`, `unsupported`.

These should not be mischaracterized as devkit-pi tool failures.

### Error codes

Source code LSP uses shared error definitions from `src/shared/errors.ts`, not an independent LSP error code system. Current LSP-related codes:

| Code | Current use |
|---|---|
| `INVALID_INPUT` | Missing required parameters, array limits exceeded, etc. |
| `LSP_ACTION_NOT_ALLOWED` | Privileged action not enabled, subagent not authorized to call action |
| `LSP_SERVER_NOT_FOUND` | `restart` specifying unknown server id |
| `LSP_TIMEOUT` | Defined; current main timeout semantics expressed via response text/details |

Do not assume a `WEB_ERROR_CODES`-style LSP canonical source exists.

## Stability notes

Public contract:

- `lsp` tool name
- `LspParams` public fields
- `LSP_ACTIONS` action names
- Readonly-safe vs privileged action boundary
- Privileged actions always disabled in subagent processes
- `content` + `details` pi tool result top-level shape
- Diagnostics hook configuration entry and `agent_end` / `edit_write` / `disabled` modes

Internal implementation:

- `LSPManager` class and client cache structure
- Root marker lookup details
- Server spawn fallback details
- Diagnostics wait time, open file LRU, idle cleanup
- Format/render helpers
- Hook internal touched-files tracking and status UI implementation

Boundary notes:

- Language server behavior may vary by language, server version, project configuration, dependency installation, index state, and platform.
- `servers` lists built-in adapter ids, not server binary installed or current project availability.
- `rename` and `codeAction` currently return LSP suggestions, not directly modifying project files.
- Subagents can use configuration-allowed readonly LSP actions, but should not depend on internal manager, hook, or server lifecycle details.

## Source map

| Topic | Source |
|---|---|
| Module registration | `src/modules/lsp/register.ts` |
| Tool implementation | `src/modules/lsp/tool.ts` |
| Input schema / actions | `src/modules/lsp/schemas.ts` |
| Core LSP logic / server manager | `src/modules/lsp/core.ts` |
| Hook integration | `src/modules/lsp/hook.ts` |
| Shared LSP errors | `src/shared/errors.ts` |
| Config loading/defaults | `src/config/load-config.ts` |
| Config types / subagent LSP env | `src/shared/types.ts` |
| Toolkit command surface | `src/modules/commands/register.ts` |
| LSP tests | `tests/lsp/tool.test.ts` |
| Subagent LSP exposure tests | `tests/subagents/lsp-tools.test.ts` |
| Path handling tests | `tests/shared/path-handling.test.ts` |
