---
status: current
audience: all
last_verified: 2026-05-20
language: english
---

# Goals and Scope

Current public API and configuration details are defined in [Reference index](../reference/README.md), [Configuration reference](../reference/configuration.md), [Subagents reference](../reference/subagents.md), [Web tools reference](../reference/web-tools.md), [LSP tools reference](../reference/lsp-tools.md), and [Toolkit commands reference](../reference/toolkit-commands.md).

## Project goals

`devkit-pi` is a comprehensive pi coding toolkit for personal workflows:

```text
subagents + web tools + convert_content + LSP tool + LSP diagnostics hook + developer commands + lightweight guards
```

The goal is not a full multi-agent framework, but to modularly integrate high-frequency coding assistance capabilities into a single pi extension.

## Architecture consistency strategy

`devkit-pi` prioritizes structural consistency over preserving legacy layouts.

When multiple modules, tools, providers, commands, or feature areas serve similar roles, they must follow the same or highly similar design structure unless there is a strong written reason not to.

When older design patterns, legacy directory layouts, or previous implementation structures conflict with the current architecture, the project is not required to retain them.

Prefer:

- Same responsibility → same structure
- Same concept → same naming pattern
- Same lifecycle → same execution pattern
- Same provider type → same adapter interface
- Same tool category → same schema/configuration/test/documentation pattern

## Currently included

- `subagent` tool with 5 built-in readonly agents: `explorer`, `researcher`, `reviewer`, `implementer`, `tester`
- User/project markdown agent definitions (simple frontmatter)
- Foreground single-shot subagent execution
- Subagent recursion guard: `subagents.maxDepth = 1`
- Bundled readonly web tools: `web_search`, `fetch_content`, `get_search_content`
- `convert_content` tool for local files or safely downloaded remote HTTP(S) files, using the optional external MarkItDown CLI provider
- LSP tool: definitions, references, hover, signature, symbols, diagnostics, workspace diagnostics, servers
- LSP diagnostics hook: auto-diagnoses files modified in the current turn after `agent_end` by default; configurable to `edit_write` or disabled
- Optional subagent readonly LSP: controlled via `subagents.allowLspTools` and `subagents.allowedLspActions`
- Unified developer command: `/toolkit` (doctor, modules, logs, agents, lsp, activity)
- Lightweight guards for git context, first-write, and verification-status reminders; these are soft reminders, not hard workflow gates
- Namespace-based configuration: `subagents` / `web` / `convertContent` / `lsp` / `commands` / `guards`

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
7. `convert_content` relies on an optional external CLI provider; heavy document conversion stacks are not bundled into the core package.
8. Guards provide workflow reminders only and do not block tool calls or force follow-up agent turns.
9. Parallel modules with similar responsibilities should converge on shared structure, naming, configuration, tests, and documentation patterns instead of preserving legacy layouts.

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
