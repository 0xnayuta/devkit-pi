---
status: current
audience: all
last_verified: 2026-05-12
language: english
---

# Security Model

This document describes devkit-pi's current security boundaries. It is not a formal security proof. Current public API and configuration details are defined in [Configuration reference](../reference/configuration.md), [Subagents reference](../reference/subagents.md), [Agent definition reference](../reference/agent-definition.md), [Web tools reference](../reference/web-tools.md), [Web tools error codes](../reference/web-tools-error-codes.md), and [LSP tools reference](../reference/lsp-tools.md).

## Default policies

- Readonly by default
- Default `subagents.maxDepth = 1`
- Subagents do not inherit the `subagent` tool
- Subagents only handle delegated tasks
- Subagents should not expand the task scope
- LSP privileged actions disabled by default
- Subagents can only use readonly LSP actions from `subagents.allowedLspActions`
- LSP hook is registered only in the main agent process, not in subagent processes

## Output sanitization

Results should not expose:

- API keys
- npm tokens
- Authorization headers
- Environment variable values
- Full stack traces
- Full system prompts

## Web tools security boundaries

Built-in `web_search`, `fetch_content`, `get_search_content` remain readonly. Tool parameters, return structures, and error semantics are defined in [Web tools reference](../reference/web-tools.md) and [Web tools error codes](../reference/web-tools-error-codes.md):

- Only `http:` / `https:` allowed
- Block `localhost`, loopback, link-local, private IP
- Block `file:` and other local protocols
- Request timeout configured
- Max response body size and max output character count
- Does not write project files; responseId storage follows session lifecycle restore/clear, subject to configuration limits

Current provider, Jina fallback, storage, and URL security boundaries are defined in [Web tools reference](../reference/web-tools.md), [Web providers reference](../reference/web-providers.md), and [Configuration reference](../reference/configuration.md). Historical design background is kept in `internal-docs/adr/0004-bundled-readonly-web-tools.md`.

## LSP security boundaries

LSP tool/action, hook, and failure semantics are defined in [LSP tools reference](../reference/lsp-tools.md).

Readonly-safe actions:

```text
definition, references, hover, signature, symbols, diagnostics, workspace-diagnostics, servers
```

Privileged actions:

```text
rename, codeAction, restart
```

`lsp.tool.allowMutatingActions` defaults to `false`. Even when explicitly enabled, privileged actions remain blocked in subagent processes.

LSP hook defaults to `agent_end` mode, auto-diagnosing only files modified in the current turn by the main agent process. It can be disabled via `lsp.hook.enabled: false` or `lsp.hook.mode: "disabled"`. Hook output limits file count and max characters.

Subagent LSP is controlled by the subagents namespace:

```json
{
  "subagents": {
    "allowLspTools": true,
    "allowedLspActions": ["definition", "references", "hover", "signature", "symbols", "diagnostics", "workspace-diagnostics", "servers"]
  }
}
```

## Write capability

Subagent readonly/write behavior is defined in [Subagents reference](../reference/subagents.md) and [Agent definition reference](../reference/agent-definition.md). Subagent write capability is disabled by default:

```json
{
  "subagents": {
    "allowWrite": false
  }
}
```

Writable custom subagents are currently an experimental capability. The default and recommended mode is readonly. `subagents.allowWrite=true` only indicates relaxed delegation policy; it does not imply a complete permission sandbox, audit logging, automatic rollback mechanism, or stable write-capability contract. Use only in trusted repositories, and all changes must be human-reviewed.

Current boundaries:

- Built-in agents are still designed with readonly-first principles.
- Actual tool availability in subagents depends on child pi runtime, current tool registration, execution environment, and configuration.
- Main agent process registers `subagent` and `/toolkit`; subagent processes do not register `subagent` or `/toolkit`.
- LSP privileged actions are always disabled in subagents.
- Web tools are available for research and reading information.
- File writing, command execution, project modification, and other write-like behavior should not be treated as default-safe capabilities.
- `allowWrite=true` only relaxes the policy entry; it does not imply a complete security sandbox.

There is currently no stable automatic rollback guarantee. If users enable writable behavior, they should use Git workspaces, pre-commit diffs, human review, and test commands as safety nets.

To formally support writable custom subagents in the future, a separate "Writable Subagents Safety Hardening" effort should be undertaken, covering at minimum: permission model, tool allowlist/denylist, readonly vs write-like action classification, write action logging, modified files summary, before/after diff guidance, rollback recommendation, failure recovery notes, test coverage, and experimental/breaking status in release notes.
