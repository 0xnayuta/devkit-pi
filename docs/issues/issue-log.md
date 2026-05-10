---
status: current
audience: maintainer
last_verified: 2026-05-10
---

# Issue Log

## Recently fixed

- Phase 3: LSP file access is bounded to the active workspace root.
- Phase 3: `workspace-diagnostics` input and LSP result output are capped.
- Phase 4: subagents can optionally use readonly LSP actions through an explicit whitelist.
- Phase 5: LSP hook is registered only in the main process, defaults to `agent_end`, and remains configurable under `lsp.hook`.
- Phase 6: unified developer commands under `/toolkit`; removed legacy `/subagents` and `/lsp` commands.
- Phase 6: LSP tool now uses structured `LspError` with proper error codes instead of plain `Error` objects.
