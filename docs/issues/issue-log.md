---
status: current
audience: maintainer
last_verified: 2026-05-10
---

# Issue Log

## Recently fixed

- (1) `v0.3.1` — LSP file access is bounded to the active workspace root.
- (2) `v0.3.2` — `workspace-diagnostics` input and LSP result output are capped.
- (3) `v0.4.0` — subagents can optionally use readonly LSP actions through an explicit whitelist.
- (4) `v0.5.0` — LSP hook is registered only in the main process, defaults to `agent_end`, and remains configurable under `lsp.hook`.
- (5) `v0.6.0` — unified developer commands under `/toolkit`; removed legacy `/subagents` and `/lsp` commands.
- (6) `v0.6.1` — LSP tool now uses structured `LspError` with proper error codes instead of plain `Error` objects.
