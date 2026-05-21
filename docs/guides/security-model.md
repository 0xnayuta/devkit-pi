---
status: current
audience: all
last_verified: 2026-05-21
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
- `web_search` provider endpoint requests use the same private-network blocking and pinned-connection flow as other web URL requests
- Does not write project files; responseId storage follows session lifecycle restore/clear, subject to configuration limits

### DNS rebinding / TOCTOU boundary

URL safety checks validate protocol, hostname/IP, DNS resolution results, and redirect targets before each fetch/download hop. In addition, web/convert URL requests now use connection-stage DNS pinning: the resolved and validated address set is bound into the request dispatcher lookup path for the actual connection.

This reduces the DNS rebinding / TOCTOU gap compared to validation-only flows. Redirects are still handled in `manual` mode and every hop is revalidated and repinned.

Boundary notes:

- This is a hardening measure, not a formal proof against all network-layer attacks.
- It does not claim to defend against every upstream DNS poisoning scenario, malicious CA chain, or transparent proxy behavior.
- `allowPrivateNetwork=true` relaxes private-network blocking, but requests still use the same pinned-connection flow.
- Internal callers of the pinned fetch helper must fully read or explicitly cancel response bodies so per-request dispatchers can be closed; built-in web and convert tools do this internally.

Current provider, Jina fallback, storage, and URL security boundaries are defined in [Web tools reference](../reference/web-tools.md), [Web providers reference](../reference/web-providers.md), and [Configuration reference](../reference/configuration.md). Historical design background is kept in `internal-docs/adr/0004-bundled-readonly-web-tools.md`.

## Convert content security boundaries

`convert_content` can convert local files or safely downloaded remote HTTP(S) files through the configured MarkItDown CLI provider. Its public behavior is defined in [Convert content tool reference](../reference/convert-tools.md) and [Configuration reference](../reference/configuration.md).

Current boundaries:

- Local `path` conversion is restricted to files inside the active workspace from the tool execution context (`ctx.cwd`).
- Remote `url` conversion only supports `http:` and `https:`.
- Private-network targets are blocked by default via `convertContent.allowPrivateNetwork=false`.
- Redirect hops are revalidated with the same private-network policy and repinned before follow.
- Downloads are bounded by `convertContent.maxResponseBytes`.
- Returned Markdown is bounded by `convertContent.maxContentChars`.
- Provider execution is bounded by `convertContent.timeoutMs` and shared external-command stdout/stderr hard limits.
- Non-zero-exit stderr summaries are redacted before entering user-visible errors or logs.
- MarkItDown is an external optional CLI dependency; devkit-pi does not bundle heavy PDF/Office/OCR/browser/Tika/Pandoc conversion stacks in the core package.
- The configured CLI is executed through shared external-command infrastructure with structured arguments and without shell interpolation.

## Guards boundaries

Guards provide lightweight workflow reminders, not security enforcement:

- Guards are registered only in the main agent process, not in subagent processes.
- They do not block tool calls, rewrite turns, or force follow-up agent turns.
- Git context, first-write, and verification reminders degrade silently when git, cwd context, or UI facilities are unavailable.
- Guard notices are soft guidance and should not be treated as a permission model, audit log, or policy engine.

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
