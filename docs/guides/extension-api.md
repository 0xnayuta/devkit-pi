---
status: current
audience: maintainer
last_verified: 2026-05-12
language: english
---

# Pi Extension API Usage Reference

This document records the pi extension API subset currently used by devkit-pi. Current public API, configuration, and command behavior are defined in [Reference index](../reference/README.md), [Configuration reference](../reference/configuration.md), [Subagents reference](../reference/subagents.md), [Subagent tool reference](../reference/subagent-tool.md), [Web tools reference](../reference/web-tools.md), [LSP tools reference](../reference/lsp-tools.md), and [Toolkit commands reference](../reference/toolkit-commands.md).

## Tool registration

Modules register tools via `defineTool()` + `pi.registerTool()`:

```ts
import { defineTool, type ExtensionAPI } from "@earendil-works/pi-coding-agent";

export function registerModule(pi: ExtensionAPI): void {
  pi.registerTool(
    defineTool({
      name: "tool_name",
      label: "Tool Name",
      description: "Tool description",
      parameters: Params,
      async execute(toolCallId, params, signal, onUpdate, ctx) {
        return {
          content: [{ type: "text", text: "ok" }],
          details: { status: "ok" },
        };
      },
    })
  );
}
```

The current entry point is `src/index.ts`, which only loads configuration and composes module registration:

```ts
registerWebTools(pi, config.web);
registerLspModule(pi, config.lsp);
registerSubagentsModule(pi, config.subagents);
registerToolkitCommands(pi, config);
```

## Event listeners

Events currently used:

| Event | Purpose |
|---|---|
| `before_agent_start` | Inject delegation policy; subagent prompt runtime rewriting |
| `session_start` | Web storage restore / stats reset; LSP hook status/warmup |
| `tool_call` | LSP hook pre-warms related file clients |
| `tool_result` | LSP hook records or runs diagnostics |
| `agent_start` | LSP hook clears current turn state |
| `agent_end` | LSP hook `agent_end` mode auto-diagnostics |
| `session_shutdown` | Web cleanup; LSP manager shutdown |

## Rendering

Web and LSP tools can provide `renderCall` / `renderResult` to compress UI output and avoid overly long default JSON. The LSP hook also registers an `lsp-diagnostics` message renderer to fold automatic diagnostics output.

## Compatibility boundary

devkit-pi uses new namespace configuration and does not implement a legacy configuration migration layer. Configuration defaults and normalize rules are defined in [Configuration reference](../reference/configuration.md).
