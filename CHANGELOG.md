# Changelog

## 0.1.0 — 2026-05-10

### Initial Release

- Merged `pi-subagents` and `pi-lsp` into `devkit-pi`.
- Modular architecture: `src/modules/{subagents, web, lsp}`.
- Thin entry point: `src/index.ts`.
- Tests mirror module structure: `tests/{subagents, web, lsp}`.
- Namespace-based configuration: `ToolkitConfig`.
- Added optional readonly LSP access for subagents.
- Added LSP diagnostics hook with default `agent_end` mode.
