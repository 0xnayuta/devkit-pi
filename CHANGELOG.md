# Changelog

## Unreleased

### Documentation

- Added VitePress documentation site.
- Added GitHub Pages deployment workflow.
- Published documentation at https://devkit-pi.wangyan.life/.
- Added VitePress directory index pages for `/`, `/reference/`, and `/adr/`.
- Organized docs navigation for Guide / Reference / Development / ADRs.
- Kept `docs/reference/` as the canonical public contract source.

## 0.1.0 — 2026-05-10

### Initial Release

- Merged `pi-subagents` and `pi-lsp` into `devkit-pi`.
- Modular architecture: `src/modules/{subagents, web, lsp, commands}`.
- Thin entry point: `src/index.ts`.
- Tests mirror module structure: `tests/{subagents, web, lsp, commands}`.
- Namespace-based configuration: `ToolkitConfig`.
- Added optional readonly LSP access for subagents.
- Added LSP diagnostics hook with default `agent_end` mode.
- Unified developer commands under `/toolkit` (doctor/modules/logs/agents/lsp/activity).
- Removed legacy `/subagents` and `/lsp` developer commands.
