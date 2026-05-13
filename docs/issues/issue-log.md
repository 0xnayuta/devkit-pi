---
status: current
audience: maintainer
last_verified: 2026-05-13
language: english
---

# Issue Log

## Recently Fixed

### v0.2.1

- Subagents now support a dual-timeout model (`timeoutMs` as hard cap, `idleTimeoutMs` as idle timeout). `timeoutMs` defaults to 15 minutes (up from 5 minutes), and `idleTimeoutMs` defaults to 3 minutes. Valid activity events (`message_end`, `tool_result_end`, `turn_end`) reset the idle timer. See [Subagent Timeout: Dual-Timeout Model](./subagent-timeout-idle-model.md) for details.

### v0.2.0

- Item 1: LSP file access is bounded to the active workspace root.
- Item 2: `workspace-diagnostics` input and LSP result output are capped.
- Item 3: subagents can optionally use readonly LSP actions through an explicit whitelist.
- Item 4: LSP hook is registered only in the main process, defaults to `agent_end`, and remains configurable under `lsp.hook`.
- Item 5: unified developer commands under `/toolkit`; removed legacy `/subagents` and `/lsp` commands.
- Item 6: LSP tool now uses structured `LspError` with proper error codes instead of plain `Error` objects.
- Item 7: `/toolkit` report commands now display in a TUI custom panel via `ctx.ui.custom()` instead of directly writing `console.log`, eliminating TUI corruption; JSON/RPC protocol mode is protected from stdout pollution.