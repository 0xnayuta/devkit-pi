---
status: current
audience: all
last_verified: 2026-05-11
---

# devkit-pi

`devkit-pi` is a personal all-in-one pi coding toolkit for agentic coding workflows. It combines subagents, Web research tools, LSP code intelligence, automatic diagnostics hooks, and developer commands into a modular pi extension.

The canonical current public contract / API reference lives in [`docs/reference/`](./reference/). Proposal, roadmap, archive, and ADR content should not be read as current behavior unless it is also reflected in reference docs, source, and tests.

## Documentation site

Online documentation site: https://devkit-pi.wangyan.life/

npm package: https://www.npmjs.com/package/devkit-pi

Local preview commands:

```bash
pnpm docs:dev
pnpm docs:build
pnpm docs:preview
```

## Main entry points

- [Guide](./README.md): documentation overview, reading paths, current guides, and content policy.
- [Reference](./reference/): current public contract / API reference.
- [ADRs](./adr/): historical decision records, not current API reference.
- [GitHub](https://github.com/0xnayuta/devkit-pi): source repository.

## Start here

- [Architecture](./guides/architecture.md): current source structure and module responsibilities.
- [Security model](./guides/security-model.md): security boundaries for subagents, Web tools, LSP, and write capability.
- [Subagents reference](./reference/subagents.md): subagent module surface and execution boundaries.
- [Web tools reference](./reference/web-tools.md): `web_search`, `fetch_content`, and `get_search_content`.
- [LSP tools reference](./reference/lsp-tools.md): LSP tool actions and diagnostics hook behavior.
- [Toolkit commands reference](./reference/toolkit-commands.md): `/toolkit` command surface.
