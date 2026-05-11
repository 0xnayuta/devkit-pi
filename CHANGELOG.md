# Changelog

## Unreleased

## 0.1.0 — 2026-05-11

### Initial Release

- Initial npm release of `devkit-pi` as a pi extension package.
- Subagents support: delegate tasks to 5 specialized readonly agents (explorer, researcher, reviewer, implementer, tester); custom agents via markdown frontmatter.
- Web tools support: `web_search`, `fetch_content`, `get_search_content` with multi-provider auto-fallback (ddgs, brave, tavily, serper, openserp, searxng).
- LSP code intelligence support: `definition`, `references`, `hover`, `signature`, `symbols`, `diagnostics`, `workspace-diagnostics`, `servers`; mutating actions disabled by default and blocked in subagent processes.
- LSP diagnostics hook with configurable mode (`agent_end` | `edit_write` | `disabled`).
- `/toolkit` developer commands: doctor, modules, logs, agents, lsp, activity, help.
- VitePress documentation site deployed at https://devkit-pi.wangyan.life/.
- GitHub Pages documentation deployment workflow.
- CI workflow with docs:check, test, and docs:build.
- Modular architecture: `src/modules/{subagents, web, lsp, commands}` with independent enable/disable.
- Namespace-based configuration: `ToolkitConfig`.
- Experimental writable custom subagents (not stable; see security model docs).
