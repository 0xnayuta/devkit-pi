---
status: current
audience: user
last_verified: 2026-05-12
---

# Toolkit Commands Reference

This document is the public reference for devkit-pi's `/toolkit` developer command. Configuration defaults are defined in [`configuration.md`](./configuration.md); Subagents behavior in [`subagents.md`](./subagents.md); Web tools in [`web-tools.md`](./web-tools.md); LSP tools in [`lsp-tools.md`](./lsp-tools.md); command registration in `src/modules/commands/register.ts`.

## Overview

`/toolkit` is devkit-pi's registered unified slash command for pi, used to view module status, run diagnostics, list agents, view Web activity logs, view LSP configuration, and open activity panels.

Difference from tools:

- Tools (e.g., `subagent`, `web_search`, `fetch_content`, `lsp`) are mainly called by agents during task execution and return tool results.
- `/toolkit` commands are mainly triggered manually by users, output to console or open TUI panels, and notify execution results via UI notification.
- `/toolkit` commands do not replace Web/LSP/subagent tools; they are status viewing, debugging, and diagnostic entries.

Typical users:

- Users manually viewing devkit-pi current status
- Developers debugging configuration, agent discovery, and Web provider availability
- Agent workflow diagnostics, e.g., confirming whether LSP hook is enabled
- Quick pre-release checks of module enablement status and basic environment

`/toolkit` is only registered in the main agent process; subagent processes do not register this command.

## Public command surface

Currently only one root command is registered:

```text
/toolkit [subcommand] [args]
```

Current public subcommands:

```text
doctor, modules, logs, agents, lsp, activity, help
```

There are no independent `/toolkit web`, `/toolkit config`, `/toolkit restart`, or `/toolkit subagents` commands. Web capabilities are mainly exposed through Web tools; LSP restart is exposed through the `lsp` tool's privileged `restart` action, not the `/toolkit lsp` command.

## Command list

| Command | Purpose | Primary output | Source |
|---|---|---|---|
| `/toolkit` | Without arguments shows help | usage text | `src/modules/commands/register.ts` |
| `/toolkit help` | Show help | usage text | `src/modules/commands/register.ts` |
| `/toolkit doctor` | Run unified diagnostic checks | doctor report + UI notification | `src/modules/subagents/commands/doctor.ts` |
| `/toolkit modules` | View module enablement status | modules overview + UI notification | `src/modules/commands/register.ts` |
| `/toolkit logs [--search|--fetch] [--limit N]` | View recent Web activity logs | activity log + stats + UI notification | `src/modules/subagents/commands/logs.ts` |
| `/toolkit agents` | List builtin/user/project agents | agent list + UI notification | `src/modules/subagents/commands/list.ts` |
| `/toolkit lsp` | View LSP tool/hook configuration | LSP overview + UI notification | `src/modules/commands/register.ts` |
| `/toolkit activity` | Open Web activity TUI panel | interactive panel + close notification | `src/modules/subagents/commands/activity.ts` |

Unknown subcommands currently show help, not a command error.

## General commands

### `/toolkit` / `/toolkit help`

| Item | Description |
|---|---|
| Syntax | `/toolkit` or `/toolkit help` |
| Arguments / flags | None |
| Purpose | View currently supported `/toolkit` subcommands |
| Output | Console outputs usage text |
| Success semantics | Prints help text |
| Failure semantics | Currently no dedicated failure branch; unknown subcommands also fall back to help |
| Related config | `commands.enabled` |
| Related source | `src/modules/commands/register.ts` |

Example:

```text
/toolkit help
```

Output includes:

```text
devkit-pi toolkit command
=
Usage:
  /toolkit doctor     Run unified diagnostics checks
  /toolkit modules    Show module enablement status
  /toolkit logs       Show recent web activity logs
  /toolkit agents     List builtin/user/project agents
  /toolkit lsp        Show LSP tool/hook configuration
  /toolkit activity   Open activity panel
  /toolkit help       Show this help
```

### `/toolkit modules`

| Item | Description |
|---|---|
| Syntax | `/toolkit modules` |
| Arguments / flags | None |
| Purpose | View devkit-pi module enablement status |
| Output | Console outputs module overview; UI notification shows `Module status printed to console` |
| Success semantics | Prints module status from current resolved config |
| Failure semantics | Handler catches exceptions and shows `Toolkit command failed: ...` via UI notification |
| Related config | `enabled`, `subagents.enabled`, `web.enabled`, `lsp.*`, `commands.enabled` |
| Related source | `src/modules/commands/register.ts` |

Example:

```text
/toolkit modules
```

Output shape:

```text
devkit-pi modules
=
subagents: enabled
web:       enabled
lsp:       enabled (tool=on, hook=agent_end)
commands:  enabled
```

## Subagents commands

The commands in this section are implemented in `src/modules/subagents/commands/`, but they are currently not `/subagents ...` root commands but called by the unified `/toolkit` command.

### `/toolkit doctor`

| Item | Description |
|---|---|
| Syntax | `/toolkit doctor` |
| Arguments / flags | None |
| Purpose | Run unified diagnostic checks |
| Output | Console outputs box-drawing doctor report; UI notification shows pass/warn/fail summary |
| Success semantics | Completes checks and prints report; report items can be `pass`, `warn`, `fail`, `info` |
| Failure semantics | Individual check failures are usually recorded as report items; handler outer exceptions shown via UI notification as `Toolkit command failed: ...` |
| Related config | Global config, web provider config, LSP config |
| Related source | `src/modules/subagents/commands/doctor.ts` |

Check categories are based on source code, currently including:

- `config`: Config file existence and parseability
- `agents`: Builtin/user/project agent discovery results
- `provider`: Web search providers' enablement, API key, and availability
- `permissions`: Results directory writability
- `web-tools`: Web tools enablement, and provider/debug summary
- `lsp`: LSP module, tool, hook status

File read/write behavior:

- Reads config file and agent definition directories.
- Creates and deletes a temporary test file in results directory to check write permissions.
- Does not start subagents.
- Does not call Web search tool for real searches; provider availability combines config enabled gates with provider adapter `isAvailable()` technical checks.
- Does not directly start LSP tool actions.

When to use:

- Post-installation check of devkit-pi basic status
- Post-config-change confirmation of module enablement status
- Pre-release or local development smoke check

Example:

```text
/toolkit doctor
```

### `/toolkit agents`

| Item | Description |
|---|---|
| Syntax | `/toolkit agents` |
| Arguments / flags | None |
| Purpose | List currently discovered builtin/user/project agents |
| Output | Console outputs agent list; UI notification shows `Found N agents` |
| Success semantics | Prints agents grouped by source |
| Failure semantics | Agent discovery exceptions caught by outer handler and notified |
| Related config | `subagents.enabled` does not affect command registration; command reads current cwd's project agents and user agents |
| Related source | `src/modules/subagents/commands/list.ts` |

Output includes:

- Total: `Available Agents (N)`
- `[builtin]`, `[user]`, `[project]` groups
- Each agent's name, description summary, `readonly` / `read/write` marker
- `subagent({ agent: "explorer", task: "..." })` usage hint

File read/write behavior:

- Reads builtin/user/project agent markdown files.
- Does not write files.
- Does not start subagents.
- Diagnostic/view command only.

Example:

```text
/toolkit agents
```

Internally has `formatAgentListJson()` helper, but current `/toolkit agents` command does not expose `--json` flag; do not treat it as public command output format.

### `/toolkit logs`

| Item | Description |
|---|---|
| Syntax | `/toolkit logs [--search|--fetch] [--limit N]` |
| Arguments / flags | `--search`, `--fetch`, `--limit N` |
| Purpose | View recent Web activity log and statistics |
| Output | Console outputs recent activity and statistics; UI notification shows `Activity logs printed to console` |
| Success semantics | Prints current process Web activity log; shows `(no recent activity)` when empty |
| Failure semantics | Handler catches exceptions and shows failure via UI notification |
| Related config | Web tools enablement affects whether logs are generated; command itself controlled by `commands.enabled` |
| Related source | `src/modules/subagents/commands/logs.ts`, `src/modules/web/observability.ts` |

Parameter behavior:

- `--search`: Only show `type === "search"` activity entries.
- `--fetch`: Only show `type === "fetch"` activity entries.
- When both present, source prioritizes `--search`.
- `--limit N`: Reads positive integer matching regex `--limit\s+(\d+)`; defaults to 20 when not provided.

Output includes:

- Recent Activity list
- timestamp
- activity type: `web_search`, `fetch`, `get_content`
- provider (if present)
- status: success / rate_limited / error / pending
- duration (if present)
- Statistics: total, success, errors, rate limited, average latency, provider stats

File read/write behavior:

- Reads in-memory Web observability log/stats.
- Does not write files.
- Does not make Web requests.
- Does not start subagents.

Example:

```text
/toolkit logs
/toolkit logs --search --limit 10
/toolkit logs --fetch
```

Internally has `formatLogsJson()` helper, but current `/toolkit logs` command does not expose `--json` flag; do not treat it as public command output format.

### `/toolkit activity`

| Item | Description |
|---|---|
| Syntax | `/toolkit activity` |
| Arguments / flags | None |
| Purpose | Open interactive Web Tool Activity TUI panel |
| Output | TUI custom panel; after closing, UI notification shows `Activity panel closed` |
| Success semantics | Opens panel, returns after user closes |
| Failure semantics | TUI custom panel errors caught by outer handler and notified |
| Related config | Web observability data from Web tools; command itself controlled by `commands.enabled` |
| Related source | `src/modules/subagents/commands/activity.ts` |

Panel content:

- Web tool activity entries
- total/success/errors/rate/avg stats
- Selected entry summary
- Help bar

Keyboard operations based on source code:

- `↑` / `↓`: Move selection
- page up / page down: Page
- home / end: Jump
- `r`: Refresh
- `c`: Clear activity log
- `s`: Reset stats
- escape / ctrl+c: Close panel

File read/write behavior:

- Reads and modifies in-memory Web activity log/stats.
- Does not write project files.
- Does not make Web requests.
- Does not start subagents.

Example:

```text
/toolkit activity
```

## LSP command

### `/toolkit lsp`

| Item | Description |
|---|---|
| Syntax | `/toolkit lsp` |
| Arguments / flags | None |
| Purpose | View current LSP module configuration summary |
| Output | Console outputs LSP overview; UI notification shows `LSP module status printed to console` |
| Success semantics | Prints LSP tool/hook status and action list from resolved config |
| Failure semantics | Handler catches exceptions and shows failure via UI notification |
| Related config | `lsp.enabled`, `lsp.tool.enabled`, `lsp.tool.allowMutatingActions`, `lsp.hook.*`, default subagent readonly LSP actions |
| Related source | `src/modules/commands/register.ts`, `src/modules/lsp/schemas.ts` |

Difference between `/toolkit lsp` and `lsp` tool:

- `/toolkit lsp` only views configuration and action list.
- `lsp` tool actually executes definition, references, diagnostics, restart and other LSP actions.
- `/toolkit lsp` does not start language servers, does not execute diagnostics, does not manage server lifecycle.
- `/toolkit lsp` does not support restart; restart is the `lsp` tool's privileged action, and is disabled by default.
- `/toolkit lsp` shows diagnostics hook configuration but does not trigger the hook.

More LSP tool behavior: [`lsp-tools.md`](./lsp-tools.md).

Example:

```text
/toolkit lsp
```

Output shape:

```text
LSP module
=
enabled: true
tool.enabled: true
tool.allowMutatingActions: false
hook.enabled: true
hook.mode: agent_end
tool.actions: definition, references, hover, symbols, diagnostics, workspace-diagnostics, signature, rename, codeAction, restart, servers
subagent.readonlyActions(default): definition, references, hover, signature, symbols, diagnostics, workspace-diagnostics, servers
```

## Web commands

Currently there is no independent `/toolkit web` command or `/toolkit providers` command.

Web-related public capabilities are mainly exposed through tools:

- `web_search`
- `fetch_content`
- `get_search_content`

Web-related commands in `/toolkit`:

- `/toolkit logs`: View Web observability activity log and stats
- `/toolkit activity`: Open Web Tool Activity panel
- `/toolkit doctor`: Check Web tools enabled status and provider availability
- `/toolkit modules`: Show web module enabled/disabled

Web tools API: [`web-tools.md`](./web-tools.md); providers: [`web-providers.md`](./web-providers.md); error codes: [`web-tools-error-codes.md`](./web-tools-error-codes.md).

## Output and error semantics

### Output

`/toolkit` commands output is mainly human-readable:

- Most subcommands print text reports via `console.log()`.
- Simultaneously provide short notifications via `ctx.ui.notify()`.
- `/toolkit activity` opens TUI custom panel.
- Currently no `--json` flag on public commands.

Source code has certain JSON formatter helpers like `formatAgentListJson()` and `formatLogsJson()`, but currently not exposed as public CLI parameters via `/toolkit` commands.

### Errors

`/toolkit` commands currently have no independent unified error code system. Handler outer exceptions are caught and shown via UI notification:

```text
Toolkit command failed: <message>
```

Diagnostic states inside commands do not equal command failure:

- `/toolkit doctor` report's `warn` / `fail` are diagnostic results, not slash command failure.
- `/toolkit logs` Web activity errors are historical Web tool activity, not command failure.
- `/toolkit lsp` only shows configuration, does not return LSP diagnostics, and does not represent LSP tool call success/failure.

Do not mistake `/toolkit` failure for `WebToolError`, and do not mistake LSP diagnostics for command failure.

## Configuration links

Complete configuration: [`configuration.md`](./configuration.md). Related configuration:

| Config | Effect |
|---|---|
| `commands.enabled` | Whether to register `/toolkit` command; subagent processes never register |
| `subagents.*` | `/toolkit doctor` and `/toolkit agents` display/diagnose subagent-related status |
| `web.*` | `/toolkit doctor` provider/web checks, `logs`/`activity` data source |
| `lsp.*` | `/toolkit modules`, `/toolkit lsp`, `/toolkit doctor` LSP status |

Related references:

- [Configuration reference](./configuration.md)
- [Subagents reference](./subagents.md)
- [LSP tools reference](./lsp-tools.md)
- [Web tools reference](./web-tools.md)
- [Web providers reference](./web-providers.md)
- [Web tools error codes](./web-tools-error-codes.md)

## Stability notes

Public contract:

- Root command: `/toolkit`
- Current subcommands: `doctor`, `modules`, `logs`, `agents`, `lsp`, `activity`, `help`
- `logs` current public flags: `--search`, `--fetch`, `--limit N`
- `commands.enabled` configuration switch
- Subagent processes do not register `/toolkit`

Developer convenience / may adjust:

- Human-readable text format, box drawing, column width, notification text
- Activity panel UI layout and keyboard shortcut details
- Doctor report's specific check items and hint text
- Logs display columns and status text

Not recommended for external scripts to strongly depend on `/toolkit`'s human-readable output format. If stable machine-parseable output is needed in the future, corresponding parameters should be formally exposed in source code and tests supplemented.

## Source map

| Topic | Source |
|---|---|
| Root command registration | `src/modules/commands/register.ts` |
| Modules overview / LSP overview / help | `src/modules/commands/register.ts` |
| Subagent command helpers | `src/modules/subagents/commands/` |
| Doctor checks | `src/modules/subagents/commands/doctor.ts` |
| Agent list | `src/modules/subagents/commands/list.ts` |
| Activity logs formatting | `src/modules/subagents/commands/logs.ts` |
| Activity panel | `src/modules/subagents/commands/activity.ts` |
| Subagent registration/tool | `src/modules/subagents/register.ts` |
| LSP registration/tool/hook | `src/modules/lsp/register.ts`, `src/modules/lsp/tool.ts`, `src/modules/lsp/hook.ts` |
| LSP schemas/actions | `src/modules/lsp/schemas.ts` |
| Web registration/tools | `src/modules/web/register.ts` |
| Web schemas | `src/modules/web/schemas.ts` |
| Web observability logs/stats | `src/modules/web/observability.ts` |
| Command tests | `tests/commands/` |
| Subagent command tests | `tests/subagents/commands/` |
| LSP tests | `tests/lsp/` |
| Web tests | `tests/web/` |
