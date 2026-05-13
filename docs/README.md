---
status: current
audience: all
last_verified: 2026-05-13
language: english
---

# devkit-pi Documentation

`docs/` contains the public VitePress documentation site. It is intentionally limited to user-facing guides and API/reference material.

Internal maintainer material such as architecture notes, testing strategy, release checklists, ADRs, planning, issue logs, archive notes, and audits lives outside the website in `internal-docs/`.

Current behavior should be determined by `src/`, `tests/`, and the current reference docs in `docs/reference/`.

## Documentation site

Online documentation site: https://devkit-pi.wangyan.life/

npm package: https://www.npmjs.com/package/devkit-pi

Local preview commands:

```bash
pnpm docs:dev
pnpm docs:build
pnpm docs:preview
```

## Public sections

### Guides

- [Goals and scope](./guides/goals-and-scope.md): project goals, included/excluded capabilities, and design boundaries.
- [Security model](./guides/security-model.md): security boundaries for subagents, Web tools, LSP, convert, and write capability.

### Reference

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
- [Convert tools reference](./reference/convert-tools.md)
- [Toolkit commands reference](./reference/toolkit-commands.md)

## Recommended reading path

### New users

1. [Goals and scope](./guides/goals-and-scope.md)
2. [Security model](./guides/security-model.md)
3. [Configuration reference](./reference/configuration.md)
4. [Toolkit commands reference](./reference/toolkit-commands.md)

### Using Subagents

Readonly subagents are recommended by default. Writable custom subagents are experimental — `subagents.allowWrite=true` does not imply sandbox, audit, or rollback guarantees.

1. [Subagents reference](./reference/subagents.md)
2. [Subagent tool reference](./reference/subagent-tool.md)
3. [Agent definition reference](./reference/agent-definition.md)
4. [Result schema reference](./reference/result-schema.md)

### Using Web / LSP / Convert tools

- [Web tools reference](./reference/web-tools.md)
- [LSP tools reference](./reference/lsp-tools.md)
- [Convert tools reference](./reference/convert-tools.md)

## Content policy

- `docs/` is the public website surface.
- `internal-docs/` is the internal maintainer knowledge base.
- Planning, archive, ADR, issue, audit, and release-process documents are not part of the public website navigation.
- Proposed/roadmap/archive material does not represent current behavior unless it is also reflected in source, tests, and current reference docs.
