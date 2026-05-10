---
status: current
audience: maintainer
last_verified: 2026-05-10
---

# Issue Log

## Open

### LSP structured error codes are placeholders

`src/shared/errors.ts` defines LSP-related error codes, but the Phase 3 LSP tool currently throws regular `Error` objects instead of returning structured errors that use those codes.

Decision needed:

1. remove the placeholder LSP codes until structured LSP errors are implemented, or
2. implement structured LSP tool errors for not-found, timeout, and action-not-allowed paths.

## Recently fixed

- Phase 3: LSP file access is bounded to the active workspace root.
- Phase 3: `workspace-diagnostics` input and LSP result output are capped.
- Phase 4: subagents can optionally use readonly LSP actions through an explicit whitelist.
- Phase 5: LSP hook is registered only in the main process, defaults to `agent_end`, and remains configurable under `lsp.hook`.
- Phase 6: unified developer commands under `/toolkit`; removed legacy `/subagents` and `/lsp` commands.
