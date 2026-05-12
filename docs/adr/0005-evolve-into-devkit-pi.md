---
status: accepted
audience: maintainer
last_verified: 2026-05-12
language: english
---

# ADR 0005: Evolve from pi-subagents to devkit-pi

> Historical decision record: this document records the context and trade-offs at the time, and is not equivalent to current API reference; current behavior is defined by `docs/reference/`, `src/`, and `tests/`.

## Status

Accepted (implementation completed 2026-05-10)

## Context

`pi-subagents` was originally positioned as a lightweight subagent extension (1 main agent + 5 subagents + readonly + depth=1).
But the project has actually included capabilities beyond the original MVP: web tools, delegation policy injection, developer commands.

Meanwhile, `pi-lsp` provides LSP tool and LSP hook, and there is a natural need for the two to merge into a personal comprehensive pi coding toolkit.

## Decision

1. **Merge pi-subagents and pi-lsp** into a single modular project `devkit-pi`.
2. **Unified `dev` prefix naming**, consistent with personal projects like `devpiano`.
3. **Modular single package**, do not retain original project boundaries, split into modules by capability domain (subagents / web / lsp).
4. **Thin entry + module registration**, `src/index.ts` only does composite registration, each module is self-contained.
5. **Tests mirror modules**, `tests/subagents/`, `tests/web/`, `tests/lsp/` maintain 1:1 with `src/modules/`.

## Retained design boundaries

- Main agent is the sole orchestrator
- Subagents do not dispatch other subagents (maxDepth=1)
- Subagents default to readonly
- Each module can be independently enabled/disabled
- LSP mutating actions (rename / codeAction / restart) are restricted by default

## Concepts no longer retained

- `mvp/` development phase identifiers
- `pi-subagents` package name
- `extension/` directory (entry point changed to `src/index.ts`)
- Independent commands directory (belongs to respective module)

## Consequences

- New repository: `github.com/0xnayuta/devkit-pi`
- Old repositories `pi-subagents` and `pi-lsp` archived, no longer independently maintained
- Configuration format evolved from `ExtensionConfig` to namespace-based `ToolkitConfig`
