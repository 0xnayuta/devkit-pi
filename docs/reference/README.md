---
status: current
audience: all
last_verified: 2026-05-12
---

# Reference Index

## Reference overview

`docs/reference/` is devkit-pi's lookup-table, contract-oriented documentation directory. It records the currently implemented public surface, configuration, tool parameters, return structures, error/failure semantics, and stability boundaries.

Reference documents are not tutorials and do not record roadmaps. If proposals, ADRs, or archives conflict with reference documents, the canonical sources are the current `src/`, `tests/`, and this reference directory.

## Related guides

- [Architecture](../guides/architecture.md): Current source structure and module responsibilities.
- [Security model](../guides/security-model.md): Security boundaries and risk notes.
- [Testing](../guides/testing.md): Test organization and documentation checks.
- [Release checklist](../guides/release-checklist.md): Pre-release synchronization checks.

## Core references

### Configuration

`subagents.allowWrite` is experimental and not a stable write-capability contract; it does not provide a complete sandbox, audit trail, or rollback guarantee. Details are in [configuration.md](./configuration.md), [subagents.md](./subagents.md), and [Security model](../guides/security-model.md).

| Document | When to read | Canonical source |
|---|---|---|
| [configuration.md](./configuration.md) | Configure devkit-pi, verify defaults and normalize rules | `src/config/load-config.ts`, `src/shared/types.ts` |

### Subagents

| Document | When to read | Canonical source |
|---|---|---|
| [subagents.md](./subagents.md) | Understand Subagents module public surface, execution model, and boundaries | `src/modules/subagents/`, `agents/`, `src/shared/delegation-policy.ts` |
| [subagent-tool.md](./subagent-tool.md) | Call `subagent` tool, review input/output/failure semantics | `src/modules/subagents/register.ts`, `schemas.ts`, `executor.ts` |
| [agent-definition.md](./agent-definition.md) | Write built-in/user/project agent markdown definitions | `src/modules/subagents/agents.ts`, `frontmatter.ts`, `agents/*.md` |
| [result-schema.md](./result-schema.md) | Programmatically understand `subagent` tool result and error codes | `src/modules/subagents/executor.ts`, `collect-output.ts`, `src/shared/types.ts` |

### Web tools

| Document | When to read | Canonical source |
|---|---|---|
| [web-tools.md](./web-tools.md) | Call `web_search`, `fetch_content`, `get_search_content` | `src/modules/web/register.ts`, `schemas.ts`, `types.ts`, `search.ts`, `fetch.ts`, `storage.ts` |
| [web-providers.md](./web-providers.md) | Configure/select ddgs, brave, tavily, serper, openserp, searxng | `src/modules/web/providers/`, `src/modules/web/providers/select-provider.ts` |
| [web-tools-error-codes.md](./web-tools-error-codes.md) | Determine Web tool structured errors and reserved/deprecated code boundaries | `src/modules/web/errors.ts`, `src/modules/web/types.ts` |

### LSP tools

| Document | When to read | Canonical source |
|---|---|---|
| [lsp-tools.md](./lsp-tools.md) | Call `lsp` tool, understand diagnostics hook and action permissions | `src/modules/lsp/register.ts`, `tool.ts`, `schemas.ts`, `hook.ts` |

### Toolkit commands

| Document | When to read | Canonical source |
|---|---|---|
| [toolkit-commands.md](./toolkit-commands.md) | Use `/toolkit` for diagnostics, view modules/agents/logs/LSP status | `src/modules/commands/register.ts`, `src/modules/subagents/commands/` |

### Schemas and contracts

| Document | When to read | Canonical source |
|---|---|---|
| [result-schema.md](./result-schema.md) | View `subagent` tool result structured fields | `src/shared/types.ts`, `src/modules/subagents/executor.ts` |
| [web-tools-error-codes.md](./web-tools-error-codes.md) | View Web canonical error code, active/reserved/deprecated status | `src/modules/web/errors.ts` |
| [configuration.md](./configuration.md) | View configuration schema-like defaults and normalize behavior | `src/config/load-config.ts` |

## Canonical source policy

- [`configuration.md`](./configuration.md) uses `src/config/load-config.ts` as canonical.
- [`web-tools-error-codes.md`](./web-tools-error-codes.md) uses `WEB_ERROR_CODES` in `src/modules/web/errors.ts` as canonical.
- [`web-tools.md`](./web-tools.md) uses `src/modules/web/register.ts`, `handlers.ts`, `schemas.ts`, `types.ts` as canonical.
- [`web-providers.md`](./web-providers.md) uses `src/modules/web/providers/*`, `registry.ts`, `select-provider.ts` as canonical.
- [`lsp-tools.md`](./lsp-tools.md) uses `src/modules/lsp/register.ts`, `tool.ts`, `schemas.ts` as canonical.
- [`toolkit-commands.md`](./toolkit-commands.md) uses `src/modules/commands/register.ts` and module `register`/`commands` implementations as canonical.
- [`subagents.md`](./subagents.md), [`subagent-tool.md`](./subagent-tool.md), [`agent-definition.md`](./agent-definition.md), [`result-schema.md`](./result-schema.md) use `src/modules/subagents/`, `agents/`, `src/shared/delegation-policy.ts`, and `src/shared/types.ts` as canonical.

## Stability policy

`subagents.allowWrite` is not a stable write-capability contract; it is currently recorded only as an experimental/advanced/unsafe configuration entry in [configuration.md](./configuration.md) and [subagents.md](./subagents.md).

Relatively stable:

- Public tool names: `subagent`, `web_search`, `fetch_content`, `get_search_content`, `lsp`
- Public command root/subcommands: `/toolkit`, `doctor`, `modules`, `logs`, `agents`, `lsp`, `activity`, `help`
- Input schema fields explicitly listed in documentation
- Output contracts / structured error codes explicitly listed in documentation
- Current canonical error code string values

May change:

- Internal helpers, formatters, manager classes, and provider parser implementation details
- Human-readable logs, console output, TUI rendering, and notification text
- Agent prompt wording, delegation policy examples, and markdown output templates
- Session file layout, streaming display item details, sanitize/truncate rules
- Reserved error code activation timing and proposed behavior

Reserved error codes / proposed behavior do not represent current direct return or execution. If proposed capabilities need to become public reference, they must first be implemented in source and tests before updating reference.
