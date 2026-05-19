---
status: current
audience: all
last_verified: 2026-05-20
language: english
---

<p align="center">
  <img src="/logo.png" alt="devkit-pi logo" width="80" height="80" />
</p>

# devkit-pi

`devkit-pi` is a personal all-in-one pi coding toolkit for agentic coding workflows. It combines subagents, Web research tools, content conversion, LSP code intelligence, automatic diagnostics hooks, developer commands, and lightweight workflow reminders/guards into a modular pi extension.

The public documentation site is intentionally split into guides and reference. Internal maintainer documents live in the repository's `internal-docs/` directory and are not part of the public website navigation.

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

- [Guide](./README.md): documentation overview, reading paths, and content policy.
- [Reference](./reference/): current public contract / API reference.
- [GitHub](https://github.com/0xnayuta/devkit-pi): source repository.

## Start here

- [Goals and scope](./guides/goals-and-scope.md): project goals and current capability boundaries.
- [Security model](./guides/security-model.md): security boundaries for subagents, Web tools, convert, LSP, guards, and write capability.
- [Agent workflow guide](./guides/agent-workflow.md): practical lightweight workflow patterns for planning, debug, review, and verification reporting.
- [Subagents reference](./reference/subagents.md): subagent module surface and execution boundaries.
- [Web tools reference](./reference/web-tools.md): `web_search`, `fetch_content`, and `get_search_content`.
- [LSP tools reference](./reference/lsp-tools.md): LSP tool actions and diagnostics hook behavior.
- [Convert tools reference](./reference/convert-tools.md): `convert_content` behavior and MarkItDown provider boundary.
- [Toolkit commands reference](./reference/toolkit-commands.md): `/toolkit` command surface.
