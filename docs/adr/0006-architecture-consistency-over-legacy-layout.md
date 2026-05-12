---
status: accepted
audience: maintainer
last_verified: 2026-05-12
language: english
---

# ADR 0006: Architecture consistency over legacy layout

## Status

Accepted

## Context

`devkit-pi` combines several capability areas: subagents, web tools, LSP code intelligence, diagnostics hooks, and developer commands. As these areas grow, parallel modules may accidentally preserve historical layouts or one-off implementation patterns from earlier project phases.

Keeping those legacy differences makes the repository harder to navigate, test, configure, and document. The project benefits more from predictable structure than from compatibility with old internal layouts.

## Decision

`devkit-pi` prioritizes architecture consistency over retaining legacy structure.

When multiple modules, tools, providers, commands, or feature areas serve similar roles, they should follow the same or highly similar design structure unless a strong written reason justifies a difference.

The project does not need to retain old design patterns, legacy directory layouts, or previous implementation structures when they conflict with the current architecture.

Preferred rules:

- Same responsibility → same structure
- Same concept → same naming pattern
- Same lifecycle → same execution pattern
- Same provider type → same adapter interface
- Same tool category → same schema/configuration/test/documentation pattern

## Consequences

- Refactors may intentionally break old internal layouts when doing so improves consistency.
- New modules should mirror established patterns for configuration, tests, and documentation.
- Exceptions must be documented near the decision point or in a future ADR.
- Current reference docs, `src/`, and `tests/` remain the source of truth for behavior.
