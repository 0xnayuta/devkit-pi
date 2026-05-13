---
status: implemented
audience: maintainer
last_verified: 2026-05-13
language: english
---

# `/toolkit` Direct console Output Corrupts TUI Interface

## Summary

When running `/toolkit` or `/toolkit help` in pi's interactive TUI, command output directly overwrites the input box, borders, project path, and footer area, causing UI misalignment or residual text.

Typical symptom:

```text
/too ... devkit-pi toolkit command────
= toolkit     [u] devkit-pi command center: doctor/modules/logs/agents/lsp/activity
Usage:s/devkit-pi (main)
  /toolkit doctor     Run unified diagnostics checks
  ...
```

Where:

- `devkit-pi toolkit command` is the first line of `/toolkit` help output.
- `Usage:` is the third line of the help output.
- `Usage:s/devkit-pi (main)` shows that new output overwrote the original project path/footer text without clearing old content.

## Scope of Impact

Primarily affects `/toolkit` commands in interactive TUI environments:

- `/toolkit`
- `/toolkit help`
- `/toolkit doctor`
- `/toolkit modules`
- `/toolkit logs`
- `/toolkit agents`
- `/toolkit lsp`

`/toolkit activity` already uses `ctx.ui.custom()` to open a custom TUI panel and is not currently a primary source of the problem, but may still be disrupted by other direct stdout/stderr output.

## Root Cause

The core issue is that `/toolkit` command handlers directly use `console.log()` to output multi-line reports, bypassing pi's TUI rendering system.

Related file:

```text
src/modules/commands/register.ts
```

Current main output paths:

```ts
console.log(output);
console.log(formatModulesOverview(config));
console.log(formatLogs(parseLogsOptions(rest)));
console.log(formatAgentList(report));
console.log(formatLspOverview(config));
console.log(formatHelp());
```

In a TUI application, writing directly to stdout/stderr writes from the current terminal cursor position without going through pi's layout, clearing, and redraw cycle, so it interleaves with the input box, command completion, footer, cwd/git status, and other UI regions.

## Secondary Risk Points

Beyond `/toolkit`, there are other direct console output paths in the codebase that could also corrupt the TUI in the future:

### Web debug logs

File:

```text
src/modules/web/observability.ts
```

Risky code:

```ts
console.log(formatted);
```

When `web.debug` is enabled, Web tool execution may write logs directly to stdout.

### Config load errors

File:

```text
src/config/load-config.ts
```

Risky code:

```ts
console.error(`Failed to load devkit-pi config from '${configPath}':`, error);
```

During extension loading or reload, config parse failures may write errors to stderr.

### LSP hook fallback

File:

```text
src/modules/lsp/hook.ts
```

Risky code:

```ts
else console.error(report.notification);
```

This path already has a `ctx.hasUI` check, so risk is lower in normal TUI, but it still counts as a direct stderr fallback.

### Subagents disabled log

File:

```text
src/modules/subagents/register.ts
```

Risky code:

```ts
console.log("Subagent extension is disabled in config");
```

If the subagent module is disabled, the registration phase may write a status log to stdout.

## Fix Goals

1. In interactive TUI, `/toolkit` no longer writes directly to stdout/stderr.
2. `/toolkit` user-visible reports are displayed through the pi TUI API.
3. Preserve visible output capability in non-TUI, non-protocol stdout scenarios, while avoiding RPC/JSON stdout pollution.
4. Keep existing formatters reusable to minimize changes.
5. Synchronously update tests and user-facing docs to avoid treating console output as a public contract.

## Fix Approach

### Overview

Add a unified read-only report display helper, for example:

```text
src/modules/commands/report-viewer.ts
```

Suggested exported interface:

```ts
async function showToolkitReport(
  ctx: ExtensionCommandContext,
  options: {
    title: string;
    content: string;
  }
): Promise<void>
```

The external return type can stay `Promise<void>`, but the internals should not treat `ctx.ui.custom<void>()` returning `undefined` as "user closed the panel". Use a sentinel value like `ctx.ui.custom<"closed">(...)` — only return of `"closed"` means the TUI panel was actually displayed and closed normally; `undefined` or other cases should be treated as unsupported/degraded fallback.

Responsibilities:

- In interactive TUI, prefer using `ctx.ui.custom()` to open a read-only report panel.
- Do not rely solely on `ctx.hasUI === true` to determine TUI panel availability: in pi's RPC mode `ctx.hasUI` may also be `true`, but `ctx.ui.custom()` may not be supported or may degrade to returning `undefined`.
- The implementation should detect `ctx.ui.custom()` unsupported/degraded cases, e.g. using a non-`void` sentinel return value to distinguish "user closed panel" from "custom UI did not actually display".
- Only fall back to `console.log(content)` when stdout is confirmed to be neither a TUI drawing surface nor an RPC/JSON protocol channel.
- RPC/JSON protocol mode must not output raw text to stdout; use protocol-supported UI/response mechanisms or return a clear unsupported/fallback message.
- Centralize scroll handling, close handling, width trimming, and empty content display.

### TUI Panel Interaction

Minimum interaction suggestions:

- `q` / `Esc`: Close panel
- `ArrowDown` / `j`: Scroll down
- `ArrowUp` / `k`: Scroll up
- `PageDown` / `Ctrl+F`: Page down
- `PageUp` / `Ctrl+B`: Page up
- `Home`: Jump to top
- `End`: Jump to bottom

Example footer hint:

```text
↑/↓ scroll · PgUp/PgDn page · q/Esc close
```

Component implementation must comply with pi TUI component contract: `render(width)` returns `string[]`, and every line's visible width must not exceed `width`. Long lines should be trimmed/wrapped using `truncateToWidth()` or equivalent logic, and scrolling should be based on the processed line array. Key matching should use `matchesKey()` / `Key` to avoid hand-writing incomplete escape sequence checks.

### Formatters Remain Unchanged

Do not change these formatters' output semantics in the near term:

- `formatHelp()`
- `formatModulesOverview()`
- `formatLspOverview()`
- `formatDoctorReport()`
- `formatLogs()`
- `formatAgentList()`

They only generate text; the problem is in the output channel, not the text format.

## `/toolkit` Command Replacement Plan

In `src/modules/commands/register.ts`, replace all TUI-path `console.log()` calls with `showToolkitReport()`.

### `/toolkit` / `/toolkit help`

Current:

```ts
console.log(formatHelp());
```

Target:

```ts
await showToolkitReport(ctx, {
  title: "Toolkit Help",
  content: formatHelp(),
});
```

### `/toolkit modules`

Current:

```ts
console.log(formatModulesOverview(config));
ctx.ui.notify("Module status printed to console", "info");
```

Target:

```ts
await showToolkitReport(ctx, {
  title: "Toolkit Modules",
  content: formatModulesOverview(config),
});
```

Notification copy should avoid continuing to use `printed to console`.

### `/toolkit logs`

Current:

```ts
console.log(formatLogs(parseLogsOptions(rest)));
ctx.ui.notify("Activity logs printed to console", "info");
```

Target:

```ts
await showToolkitReport(ctx, {
  title: "Toolkit Activity Logs",
  content: formatLogs(parseLogsOptions(rest)),
});
```

### `/toolkit agents`

Current:

```ts
const report = getAgentList(ctx.cwd);
console.log(formatAgentList(report));
ctx.ui.notify(`Found ${report.total} agents`, "info");
```

Target:

```ts
const report = getAgentList(ctx.cwd);
await showToolkitReport(ctx, {
  title: `Toolkit Agents (${report.total})`,
  content: formatAgentList(report),
});
```

### `/toolkit lsp`

Current:

```ts
console.log(formatLspOverview(config));
ctx.ui.notify("LSP module status printed to console", "info");
```

Target:

```ts
await showToolkitReport(ctx, {
  title: "Toolkit LSP",
  content: formatLspOverview(config),
});
```

### `/toolkit doctor`

Current:

```ts
const report = await runDoctorChecks(ctx.cwd, config);
const output = formatDoctorReport(report);
console.log(output);
ctx.ui.notify(
  `Doctor: ${report.summary.passed} passed, ${report.summary.warnings} warnings, ${report.summary.failed} failed`,
  "info"
);
```

Target:

```ts
const report = await runDoctorChecks(ctx.cwd, config);
const output = formatDoctorReport(report);
await showToolkitReport(ctx, {
  title: "Toolkit Doctor",
  content: output,
});
ctx.ui.notify(
  `Doctor: ${report.summary.passed} passed, ${report.summary.warnings} warnings, ${report.summary.failed} failed`,
  "info"
);
```

Optional improvement: notify `Running doctor checks...` before doctor starts, and show summary after the report closes.

## Test Plan

### Command Registration Behavior

Keep existing coverage:

- `/toolkit` is registered when `commands.enabled === true`.
- `/toolkit` is not registered when `commands.enabled === false`.
- `/toolkit` is not registered when `PI_SUBAGENT_CHILD === "1"`.

### `/toolkit` Output Behavior

Update `tests/commands/register.test.ts`:

- No longer mock `console.log` as the primary assertion target.
- Mock `ctx.ui.custom`, capture `factory` return component's `render(width)` output.
- Assert `/toolkit modules` panel content includes:
  - `devkit-pi modules`
  - `convert:`
  - `lsp:`
- Assert `/toolkit help` panel content includes:
  - `Usage:`
  - `/toolkit doctor`
- Assert `/toolkit lsp` panel content includes:
  - `LSP module`
  - `tool.actions:`
- Assert no `console.log` is called in TUI mode.

### Report Viewer Unit Tests

If `report-viewer.ts` is added, cover separately:

- Short text renders normally.
- Empty content shows a placeholder or at least does not crash.
- Long text is scrollable.
- `q` / `Esc` calls `done()` to close.
- `ArrowDown` / `ArrowUp` updates scroll offset.
- No exceptions thrown with small width.
- Falls back to stdout when `ctx.hasUI === false` and stdout is confirmed not to be a protocol channel.
- When `ctx.hasUI === true` but `ctx.ui.custom()` is unsupported/degraded (e.g. RPC mode returns `undefined`), the report is not silently lost, and raw text is not output to pollute RPC stdout.

## Documentation Update Plan

When fixing code, synchronize updates to:

```text
docs/reference/toolkit-commands.md
docs/zh/reference/toolkit-commands.md
```

Old phrasing to replace or remove:

- `output to console`
- `Console outputs ...`
- `printed to console`
- `Most subcommands print text reports via console.log()`

Suggested new phrasing:

- `open a read-only TUI report panel`
- `display report in TUI`
- `non-interactive, non-protocol stdout mode may print to stdout as fallback`
- `RPC/JSON mode must not emit raw report text to stdout`

## Implementation Order

### Step 1: Fix `/toolkit` Main Problem ✅ Done

Goal: resolve the currently reproducible TUI corruption.

Contents:

1. Add minimal `showToolkitReport()`. ✅
2. Replace `/toolkit`-related `console.log()` in `src/modules/commands/register.ts`. ✅
3. Update command tests. ✅
4. Update English and Chinese `/toolkit` command reference docs. ✅

### Step 2: Enhance Report Panel Experience ✅ Done

Goal: make report viewing more suitable for long content.

Contents:

1. Complete scroll keybindings. ✅ Supported: ↑↓/jk, PgUp/PgDn, Home/End, Ctrl+B/Ctrl+F
2. Add title, dividers, and footer help. ✅ Border title line, header/footer divider lines, status bar, compact footer shortcut hints
3. Handle ultra-narrow widths and over-long line truncation. ✅ Degraded rendering at width ≤ 2; `truncateToWidth()` trims each line; `wrapTextWithAnsi()` handles over-long content
4. Visual enhancements: ✅ Box-drawing borders (┌─┐├─┤└─┘), right-aligned status bar (current line / total lines), compact dot-separated footer help text

New additions:

- `statusLine(width, total, height)` — top-right scroll position status bar (e.g. `  5 / 30`)
- `headerLine` / `footerLine` — body top and bottom divider lines
- Trailing blank lines auto-fill at bottom to maintain fixed panel height
- Empty content shows `(empty report)` placeholder
- `dispose()` method (supports `ctx.ui.custom()` `dispose` lifecycle callback)
- Scroll reuses `cachedBodyLines` to avoid re-running `buildBodyLines()` on every scroll

### Step 3: Govern Other Direct console Output

Goal: reduce future TUI corruption risk.

Contents:

1. Route `webDebugLog()` into activity log, diagnostics, or a configurable debug sink.
   → Deferred: requires more architectural design; current debug log already has `web.debug` config gate and users in TUI environments won't enable it.
2. Make config load errors structured or defer to `/toolkit doctor`. ✅ Refactored
   - `loadConfig()` returns `{ config, errors }` instead of directly calling `console.error`
   - `registerExtension()` prints config load errors centrally at startup
3. Remove or refactor `Subagent extension is disabled in config` stdout log.
   → Deferred: a one-time registration-phase notification with limited impact; removal may hinder developer debugging.
4. Review LSP hook fallback stderr path. ✅ Fixed
   - Removed `else console.error(report.notification)` from `collectDiagnostics()`
   - No diagnostic notifications go to stderr when no UI is available, avoiding TUI corruption
5. Optional: add tests or lint rules to prevent interactive paths from reintroducing direct console output.
   → Deferred: can be part of a future lint rules effort.

## Risks and Notes

1. `ctx.ui.custom()` is an interactive, wait-for-close UI. Compared to the original `console.log()` which returned immediately, the command lifecycle becomes longer.
2. Notifications may obscure the report panel; consider reducing notifications for report commands, or notifying after the panel closes.
3. Non-TUI environments still need output fallback, otherwise `/toolkit` is invisible in print scenarios; but RPC/JSON protocol mode must not output raw text to stdout — use protocol-supported UI/response mechanisms or a clear unsupported message.
4. The initial viewer should stay lightweight — avoid expanding the TUI pollution fix into a complex UI refactor.

## Acceptance Criteria

1. Running `/toolkit` and subcommands in interactive pi TUI no longer overwrites the input box, borders, cwd/git footer, or command completion panel. ✅
2. `/toolkit` report content remains fully readable. ✅
3. Long reports are scrollable. ✅ Keybindings: ↑↓, PgUp/PgDn, Home, End
4. Non-TUI, non-protocol stdout scenarios still get text output; RPC/JSON protocol scenarios are not polluted by raw text stdout. ✅
5. Tests no longer require `/toolkit` to use `console.log()` in TUI path. ✅
6. Docs no longer describe console output as `/toolkit`'s primary user-visible behavior. ✅
7. Ultra-narrow widths (≤ 2) and over-long lines have appropriate degraded handling. ✅
8. Empty content reports show a clear placeholder. ✅