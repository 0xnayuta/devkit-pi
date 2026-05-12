---
status: current
audience: maintainer
last_verified: 2026-05-12
language: english
---

# Architecture Decision Records

This directory records important design decisions to help future maintainers understand why certain simplifications were made.

ADRs record decision context at a point in time and are not equivalent to current API reference; when ADRs conflict with current implementation, `docs/reference/`, `src/`, and `tests/` take precedence.

| ADR | Title |
|-----|------|
| [0001](./0001-lightweight-foreground-subagents.md) | Lightweight Foreground Subagent Design |
| [0002](./0002-mvp-boundary-decisions.md) | MVP Boundary Decisions |
| [0003](./0003-autonomous-subagent-triggering.md) | Autonomous Subagent Triggering |
| [0004](./0004-bundled-readonly-web-tools.md) | Bundled Readonly Web Tools |
| [0005](./0005-evolve-into-devkit-pi.md) | Evolve from pi-subagents to devkit-pi |
| [0006](./0006-architecture-consistency-over-legacy-layout.md) | Architecture consistency over legacy layout |

Naming format:

```text
0001-short-title.md
0002-short-title.md
```
