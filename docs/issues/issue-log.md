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

## Recently fixed in Phase 3 working tree

- LSP file access is bounded to the active workspace root.
- `workspace-diagnostics` input and LSP result output are capped.
- LSP hook configuration is normalized to disabled while hook support is not registered.
