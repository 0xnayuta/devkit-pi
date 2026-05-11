---
status: current
audience: maintainer
last_verified: 2026-05-12
---

# Release Checklist

Before release, check [Documentation index](../README.md), [Reference index](../reference/README.md), [Configuration reference](../reference/configuration.md), [Web tools error codes](../reference/web-tools-error-codes.md), [Toolkit commands reference](../reference/toolkit-commands.md), and [CHANGELOG.md](../../CHANGELOG.md).

## Code verification

- [ ] `pnpm typecheck` passes
- [ ] `pnpm lint` passes
- [ ] `pnpm test` passes
- [ ] `pnpm test:unit` passes

## Documentation sync

- [ ] `pnpm docs:check` passes
- [ ] `README.md` / `README.zh.md` / `docs/README.md` / `docs/reference/README.md` navigation is in sync
- [ ] `README.md` and `agents/*.md` built-in agent tool lists are consistent
- [ ] `docs/reference/agent-definition.md` and `agents/*.md` frontmatter are consistent
- [ ] `docs/reference/result-schema.md` covers all subagent error codes in `src/shared/types.ts`
- [ ] `docs/reference/configuration.md` is consistent with namespace config defaults
- [ ] `docs/reference/web-tools-error-codes.md` is consistent with `WEB_ERROR_CODES` in `src/modules/web/errors.ts`
- [ ] `/toolkit` docs are consistent with actual subcommands in `src/modules/commands/register.ts`
- [ ] New ADR added when adding or restoring capabilities beyond current boundaries

## Security boundaries

- [ ] Readonly agents do not expose `bash`, `edit`, `write`
- [ ] Subagents still cannot register or call the `subagent` tool
- [ ] Subagents still cannot call privileged LSP actions
- [ ] LSP hook is only registered in the main agent process and can be disabled via configuration
- [ ] Sanitize rules cover tokens, Authorization headers, absolute paths, and stack traces

## Package metadata

- [ ] `package.json` `files` matches actual publish content
- [ ] `package.json` `pi.extensions` points to current extension entry
- [ ] `CHANGELOG.md` is updated
