---
status: current
audience: all
last_verified: 2026-05-11
---

# Reference

`docs/reference/` is the current public contract / API reference for devkit-pi. It records the implemented public surface, configuration, tool parameters, result shapes, error semantics, and stability boundaries.

For the full reference directory policy, see [Reference README](./README.md).

## Core references

- [Configuration](./configuration.md)
- [Subagents](./subagents.md)
- [Subagent tool](./subagent-tool.md)
- [Agent definition](./agent-definition.md)
- [Result schema](./result-schema.md)
- [Web tools](./web-tools.md)
- [Web providers](./web-providers.md)
- [Web tools error codes](./web-tools-error-codes.md)
- [LSP tools](./lsp-tools.md)
- [Toolkit commands](./toolkit-commands.md)

Proposal, roadmap, archive, and ADR documents are intentionally not included in this reference entry. If non-reference material differs from current reference docs, source, or tests, treat `docs/reference/`, `src/`, and `tests/` as authoritative.

Reference contracts should remain structurally consistent across similar modules, tools, providers, commands, configuration namespaces, tests, and documentation pages. Legacy layouts are not retained when they conflict with the current modular architecture.
