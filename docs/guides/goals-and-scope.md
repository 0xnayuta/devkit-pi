---
status: current
audience: all
last_verified: 2026-05-12
---

# Goals and Scope

Current public API and configuration details are defined in [Reference index](../reference/README.md), [Configuration reference](../reference/configuration.md), [Subagents reference](../reference/subagents.md), [Web tools reference](../reference/web-tools.md), [LSP tools reference](../reference/lsp-tools.md), and [Toolkit commands reference](../reference/toolkit-commands.md).

## Project goals

`devkit-pi` is a comprehensive pi coding toolkit for personal workflows:

```text
subagents + web tools + LSP tool + LSP diagnostics hook + developer commands
```

The goal is not a full multi-agent framework, but to modularly integrate high-frequency coding assistance capabilities into a single pi extension.

## Currently included

- `subagent` tool with 5 built-in readonly agents: `explorer`, `researcher`, `reviewer`, `implementer`, `tester`
- User/project markdown agent definitions (simple frontmatter)
- Foreground single-shot subagent execution
- Subagent recursion guard: `subagents.maxDepth = 1`
- Bundled readonly web tools: `web_search`, `fetch_content`, `get_search_content`
- LSP tool: definitions, references, hover, signature, symbols, diagnostics, workspace diagnostics, servers
- LSP diagnostics hook: auto-diagnoses files modified in the current turn after `agent_end` by default; configurable to `edit_write` or disabled
- Optional subagent readonly LSP: controlled via `subagents.allowLspTools` and `subagents.allowedLspActions`
- Unified developer command: `/toolkit` (doctor, modules, logs, agents, lsp, activity)
- Namespace-based configuration: `subagents` / `web` / `lsp` / `commands`

## Currently excluded

- Background/async jobs
- Chain workflow
- Parallel execution
- Intercom
- Worktree management
- Complex artifact system
- Fallback model chain
- Multi-agent orchestration engine
- Agent management actions (create/update/delete)
- LSP hook / auto-diagnostics in subagents
- Privileged LSP actions in subagents: `rename`, `codeAction`, `restart`

## Design boundaries

1. The main agent is the sole orchestrator.
2. Subagents cannot dispatch other subagents.
3. Readonly by default; write capability must be explicitly configured.
4. LSP readonly actions can serve as a progressive enhancement over read/grep/find.
5. `rename`, `codeAction`, `restart` are disabled by default and always disabled in subagent processes.
6. Each module must be independently enabled/disabled.

## Custom agent example

```md
---
name: custom-reviewer
description: Project-specific reviewer.
readonly: true
tools: read, grep, find, ls
---

You are a custom review subagent.
```
