---
status: current
audience: maintainer
last_verified: 2026-05-12
---

# Testing Strategy

This document describes devkit-pi's current test organization. Public API and configuration contracts are defined in [Reference index](../reference/README.md), [Configuration reference](../reference/configuration.md), [Subagents reference](../reference/subagents.md), [LSP tools reference](../reference/lsp-tools.md), [Web tools error codes](../reference/web-tools-error-codes.md), and [Toolkit commands reference](../reference/toolkit-commands.md).

## Core test coverage

- subagents: tool registration, schema, agent loading, recursion guard, output collection, prompt runtime
- web: provider selection, fetch security limits, caching, concurrency, observability, storage, renderers
- lsp: module registration, `servers` action, privileged action gating, hook registration/disabling/child process isolation
- shared/config: namespace config merge, path handling, error codes, package manifest

## Test directory

Test directory mirrors `src/modules/` and `src/shared/` structure:

```text
tests/subagents/          # subagents module
tests/subagents/commands/ # doctor/list/logs formatters & checks
tests/commands/           # unified toolkit command registration
tests/web/                # web module
tests/lsp/                # lsp module
tests/shared/             # shared utilities
tests/package-manifest.test.ts
```

## Current strategy

Current tests are primarily unit tests, not depending on real pi child processes or real language servers.

Documentation contracts are checked via `pnpm docs:check`, covering frontmatter, relative links, built-in agent tool lists, subagent/web error codes, and key reference navigation. When adding or modifying public API, update `docs/reference/` accordingly and ensure related tests cover current behavior.

If LSP smoke/integration tests are needed later, use small fixture projects and clearly mark them as optional integration tests to avoid CI failures due to missing local language server installations.

## Regression tests for excluded capabilities

The following capabilities should not be silently restored; if restoration is needed, a new ADR must be added:

- Background/async jobs
- Chain execution
- Parallel execution
- Intercom
- Worktree
- Nested subagents
- Subagent privileged LSP actions
- Subagent LSP hook
