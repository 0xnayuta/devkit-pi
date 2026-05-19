# Changelog

## Unreleased

> Package manifest version is currently `0.1.0`; the entries below describe repository changes that have not yet been cut as a package release.

### Code-quality audit follow-up completion

- Completed all tracked items from `internal-docs/audit/code-quality-audit-2026-05-13.md`; the audit status is now `implemented` with Open=0.
- Restored secure HTTPS defaults in the shared HTTP pool and added regression coverage.
- Added hard stdout/stderr caps for external commands and subagent child-process output, including JSONL stream limits and abort-listener cleanup.
- Standardized finite response reading for web providers through shared limited-read helpers.
- Added DNS pinning and redirect revalidation for web fetches and safe remote downloads, preserving private-network protection by default.
- Split LSP internals into focused lifecycle, manager, diagnostics, edits, formatting, request orchestration, source-file, and server-registry modules while keeping `core.ts` as the public facade/orchestrator.
- Added lightweight guards for git-context, first-write, and verification-status reminders.
- Added shared logger/sink utilities to reduce ad hoc stdout/stderr logging in tests and runtime fallbacks.
- Added lightweight Node V8 coverage visibility scripts (`pnpm test:coverage`) without introducing a coverage threshold gate.
- Aligned public configuration docs and docs checks with current defaults, including `subagents.timeoutMs`, `idleTimeoutMs`, `convertContent`, and `guards`.
- Updated runtime and host expectations to Node.js `>=22.19.0` and pi peer dependencies `>=0.75.1`.

### Subagent JSON stream compact patch alignment

- Completed the subagent JSON streaming O(N²) stdout growth mitigation plan and upstream PR draft documentation.
- Verified and aligned with the fork patch branch: <https://github.com/0xnayuta/pi/tree/patch/json-stream-compact>.
- `devkit-pi` subagent integration now documents compact/full preference handling with fallback behavior and lifecycle-event-based final output extraction.
- Synced internal issue records for implementation status and maintenance tracking.

## 0.1.0 — 2026-05-11

### Initial Release

- Initial npm release of `devkit-pi` as a pi extension package.
- Subagents support: delegate tasks to 5 specialized readonly agents (explorer, researcher, reviewer, implementer, tester); custom agents via markdown frontmatter.
- Web tools support: `web_search`, `fetch_content`, `get_search_content` with multi-provider auto-fallback (ddgs, brave, tavily, serper, openserp, searxng).
- Convert content support: `convert_content` for local files or safe remote downloads through the optional external MarkItDown CLI provider.
- LSP code intelligence support: `definition`, `references`, `hover`, `signature`, `symbols`, `diagnostics`, `workspace-diagnostics`, `servers`; mutating actions disabled by default and blocked in subagent processes.
- LSP diagnostics hook with configurable mode (`agent_end` | `edit_write` | `disabled`).
- `/toolkit` developer commands: doctor, modules, logs, agents, lsp, activity, help.
- VitePress documentation site deployed at https://devkit-pi.wangyan.life/.
- GitHub Pages documentation deployment workflow.
- CI workflow with docs:check, test, and docs:build.
- Modular architecture: `src/modules/{subagents, web, convert, lsp, commands}` with independent enable/disable.
- Namespace-based configuration: `ToolkitConfig`.
- Experimental writable custom subagents (not stable; see security model docs).
