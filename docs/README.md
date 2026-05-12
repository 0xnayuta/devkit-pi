---
status: current
audience: all
last_verified: 2026-05-12
language: english
---

# devkit-pi Documentation

## Documentation overview

`devkit-pi` documentation is organized by purpose:

- `docs/guides/` — guides for understanding, maintenance, and development workflows.
- `docs/reference/` — reference for public API, configuration, and error semantics.
- `docs/adr/` — historical architecture decision records.
- `docs/planning/` — proposals, roadmaps, and future plans (not current behavior).
- `docs/archive/` — historical plans and archived content.

Current behavior should be determined by `src/`, `tests/`, and the reference docs marked as `current` in `docs/reference/`.

## Local documentation site

Online documentation site: https://devkit-pi.wangyan.life/

npm package: https://www.npmjs.com/package/devkit-pi

Local preview commands:

```bash
pnpm docs:dev
pnpm docs:build
pnpm docs:preview
```

## Recommended reading path

### New users

1. [Architecture](./guides/architecture.md)
2. [Configuration reference](./reference/configuration.md)
3. [Toolkit commands reference](./reference/toolkit-commands.md)

### Using Subagents

Readonly subagents are recommended by default. Writable custom subagents are experimental — `subagents.allowWrite=true` does not imply sandbox, audit, or rollback guarantees. See [Subagents reference](./reference/subagents.md) and [Security model](./guides/security-model.md).

1. [Subagents reference](./reference/subagents.md)
2. [Subagent tool reference](./reference/subagent-tool.md)
3. [Agent definition reference](./reference/agent-definition.md)
4. [Result schema reference](./reference/result-schema.md)
5. [Toolkit commands reference](./reference/toolkit-commands.md)

### Using Web tools

1. [Web tools reference](./reference/web-tools.md)
2. [Web providers reference](./reference/web-providers.md)
3. [Web tools error codes](./reference/web-tools-error-codes.md)
4. [Configuration reference](./reference/configuration.md)

### Using LSP

1. [LSP tools reference](./reference/lsp-tools.md)
2. [Configuration reference](./reference/configuration.md)
3. [Toolkit commands reference](./reference/toolkit-commands.md)

### Contributors / Maintainers

1. [Architecture](./guides/architecture.md)
2. [Configuration reference](./reference/configuration.md)
3. [ADR index](./adr/README.md)
4. [Testing](./guides/testing.md)
5. [Release checklist](./guides/release-checklist.md)

## Documentation sections

### `guides/`

Guides for design understanding, development workflows, security model, testing, and release processes.

Current guides:

- [Goals and scope](./guides/goals-and-scope.md): project goals, current included/excluded capabilities, and design boundaries.
- [Architecture](./guides/architecture.md): current `src/` structure, module responsibilities, registration flow, and test mapping.
- [Extension API](./guides/extension-api.md): devkit-pi's current pi extension API integration.
- [Security model](./guides/security-model.md): security boundaries for subagents, Web tools, LSP, and write capability.
- [Testing](./guides/testing.md): test directory structure, unit test strategy, and `docs:check` explanation.
- [Release checklist](./guides/release-checklist.md): pre-release checks for code, docs, security boundaries, and package metadata.
- [fetch_content enhancement](./guides/fetch_content-enhancement.md): `fetch_content` content type handling and security configuration enhancements.

Proposed / roadmap guides:

- [Add convert_content tool plan](./planning/add-convert_content-tool-plan.md)
- [Personal toolkit feature roadmap](./planning/personal-toolkit-feature-roadmap.md)

Proposed / roadmap docs do not represent current capabilities and are not part of the public reference path.

### `reference/`

Reference-style, contract-oriented docs covering current public surface, configuration, tool parameters, return structures, error semantics, and stability boundaries.

- [Reference index](./reference/README.md)
- [Configuration reference](./reference/configuration.md)
- [Subagents reference](./reference/subagents.md)
- [Subagent tool reference](./reference/subagent-tool.md)
- [Agent definition reference](./reference/agent-definition.md)
- [Result schema reference](./reference/result-schema.md)
- [Web tools reference](./reference/web-tools.md)
- [Web providers reference](./reference/web-providers.md)
- [Web tools error codes](./reference/web-tools-error-codes.md)
- [LSP tools reference](./reference/lsp-tools.md)
- [Toolkit commands reference](./reference/toolkit-commands.md)

### `adr/`

Architecture decision records explaining key trade-offs and historical context.

- [ADR index](./adr/README.md)

ADRs record design decisions at a specific point in time and are not equivalent to the current full API reference. When an ADR conflicts with current reference, the current source, tests, and reference docs take precedence.

### `planning/`

Future plans, proposals, and roadmap documents. These do not represent current behavior.

- [Planning index](./planning/README.md)
- [Add convert_content tool plan](./planning/add-convert_content-tool-plan.md)
- [Personal toolkit feature roadmap](./planning/personal-toolkit-feature-roadmap.md)

Proposed / roadmap docs do not represent current capabilities and are not part of the public reference path.

### `archive/`

Archived deprecated plans.

- [tests-simplification-plan](./archive/tests-simplification-plan.md)
- [enhancement-of-fetch_content-tool-plan](./archive/enhancement-of-fetch_content-tool-plan.md)

Archive content preserves context only and does not represent current implementation or commitments.

## Current public reference

Current public reference docs are in `docs/reference/`:

| Document | Purpose |
|---|---|
| [README](./reference/README.md) | Reference directory index, canonical source policy, and stability notes |
| [configuration.md](./reference/configuration.md) | Configuration file, defaults, normalize rules, and config boundaries |
| [subagents.md](./reference/subagents.md) | Subagents module public overview |
| [subagent-tool.md](./reference/subagent-tool.md) | `subagent` tool parameters, return values, and failure semantics |
| [agent-definition.md](./reference/agent-definition.md) | built-in/custom agent markdown definition format |
| [result-schema.md](./reference/result-schema.md) | `subagent` tool result schema and error codes |
| [web-tools.md](./reference/web-tools.md) | `web_search` / `fetch_content` / `get_search_content` public API |
| [web-providers.md](./reference/web-providers.md) | Web provider selection, configuration, and provider boundaries |
| [web-tools-error-codes.md](./reference/web-tools-error-codes.md) | Web tools canonical error codes |
| [lsp-tools.md](./reference/lsp-tools.md) | `lsp` tool, diagnostics hook, and LSP action semantics |
| [toolkit-commands.md](./reference/toolkit-commands.md) | `/toolkit` command surface and output/failure semantics |

## Deprecated / proposed content policy

- `docs/planning/` contains proposed / roadmap docs and does not represent current behavior.
- `docs/archive/` contains deprecated content and does not represent current behavior.
- `proposed`, `roadmap`, and `plan` docs represent design discussions or future directions only and should not be treated as current feature documentation.
- Current behavior is determined by `src/`, `tests/`, and `docs/reference/`.
- Commands, fields, tools, or error codes from planning/archive/proposal/roadmap docs should not be written into current public reference unless the source and tests have already implemented and verified them.
