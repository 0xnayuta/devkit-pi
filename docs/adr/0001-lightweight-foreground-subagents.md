---
status: accepted
audience: maintainer
last_verified: 2026-05-12
language: english
---

# ADR 0001: Lightweight Foreground Subagent Design

> Historical decision record: this document records the context and trade-offs at the time, and is not equivalent to current API reference; current behavior is defined by `docs/reference/`, `src/`, and `tests/`.

## Status

Accepted

## Context

The original project had advanced capabilities such as background, parallel, chain, intercom, worktree, and TUI, but the current goal is to provide simple, realistic, and controllable subagents capability for pi.

## Decision

First version only implements:

- One `subagent` tool
- Five built-in subagents
- Foreground synchronous execution
- `maxSubagentDepth = 1`
- Default readonly

Does not implement complex multi-agent orchestration capabilities.

## Consequences

Advantages:

- Easy to maintain
- Easy to test
- Low user mental overhead
- Safer by default

Trade-offs:

- No background tasks
- No parallel and chain workflows
- No subagent-to-main-agent communication during execution

These capabilities can be re-evaluated on demand after MVP stabilization.
