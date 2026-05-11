---
status: current
audience: user
last_verified: 2026-05-12
---

# Agent Definition Reference

Agents are defined using markdown frontmatter + prompt body. For the Subagents overview, see [`subagents.md`](./subagents.md); for the calling interface, see [`subagent-tool.md`](./subagent-tool.md); for execution result structure, see [`result-schema.md`](./result-schema.md).

## Discovery paths

Currently three types of agents are discovered:

| Source | Path | Description |
|---|---|---|
| builtin | Repository `agents/` | devkit-pi built-in 5 agents |
| user | `~/.pi/agent/agents/` | User-level custom agents |
| project | Search upward from cwd for `.pi/agents/` or `.agents/` | Project-level custom agents |

Same-name deduplication priority:

```text
project > user > builtin
```

## File format

Supports `.md` and `.markdown` files.

The current parser only supports simple frontmatter, not a full YAML parser:

- Files must start with `---` to parse frontmatter.
- The closing marker is the next `---`.
- Each line matches `key: value`.
- Keys support word/hyphen: `[\w-]+`.
- Values are trimmed; paired single or double quotes are stripped.
- Does not support YAML lists, nested objects, multi-line strings, or complex types.

## Supported frontmatter fields

| Field | Required | Type in file | Behavior |
|---|---:|---|---|
| `name` | Yes | string | Agent name; if missing, the file is not loaded |
| `description` | No | string | Agent description; defaults to empty string |
| `readonly` | No | string | Only `true` or `1` parse as true; otherwise false |
| `tools` | No | comma-separated string | Comma-separated tool names, trimmed and deduplicated |
| `model` | No | string | Passed to child pi as `--model` |

Prompt body becomes the agent's `systemPrompt`. If the body is empty, execution falls back to the description or default role text.

## Unsupported fields

The following fields currently have no special semantics and should not be written into public documentation as implemented features:

```text
package, inheritSkills, defaultContext, tags, routingHints, disabled,
permissions, temperature, maxTokens, provider, tools as YAML list
```

Among these, `disabled` is currently not parsed; there is no per-agent disable public config.

## Built-in agents

| Agent | Description | Readonly | Tools | Source |
|---|---|---:|---|---|
| `explorer` | Read-only codebase navigator — finds files, patterns, and architecture | true | `read, grep, find, ls, lsp` | `agents/explorer.md` |
| `researcher` | Read-only web researcher — searches and synthesizes information | true | `web_search, fetch_content, get_search_content` | `agents/researcher.md` |
| `reviewer` | Read-only code reviewer — inspects diffs, plans, and codebase health | true | `read, grep, find, ls, lsp` | `agents/reviewer.md` |
| `implementer` | Read-only implementation planner — creates detailed, actionable implementation plans | true | `read, grep, find, ls, lsp` | `agents/implementer.md` |
| `tester` | Read-only test planner — analyzes requirements and designs comprehensive test strategies | true | `read, grep, find, ls, lsp` | `agents/tester.md` |

## Custom agent example

```md
---
name: api-reviewer
description: Project-specific API reviewer
readonly: true
tools: read, grep, find, ls, lsp
---

You are a project-specific API review subagent.

Only handle the delegated task. Do not call other subagents.
Use the available readonly tools to inspect API code and report findings with file paths.
If evidence is insufficient, report uncertainty.
```

Web researcher example:

```md
---
name: docs-researcher
description: External documentation researcher
readonly: true
tools: web_search, fetch_content, get_search_content
---

You research external documentation and return concise findings with source URLs.
Do not write files. Do not call other subagents.
```

## Naming recommendations

- Use lowercase with hyphens: `api-reviewer`, `docs-researcher`.
- Avoid overriding builtin agent names unless you truly want to replace it at the project/user scope.
- Keep descriptions short to explain purpose, useful for `/toolkit agents` display.
- Readonly agents should only declare readonly tools.
- Prompts should clearly state task boundaries, no subagent invocation allowed, and how to report uncertainty.

## Tool filtering and readonly behavior

During execution, `filterToolsForReadonly()` filters tools based on the agent's `readonly` and `subagents.allowWrite`:

- Readonly agent: only readonly tools are retained.
- Non-readonly agent with `subagents.allowWrite=false`: still only readonly tools retained.
- Non-readonly agent with `subagents.allowWrite=true`: agent-declared tools are retained.

Readonly tools currently include:

```text
read, grep, find, ls, web_search, fetch_content, get_search_content
```

`lsp` is only retained when `subagents.allowLspTools=true` and `subagents.allowedLspActions` is non-empty. LSP privileged actions are always disabled in subagent processes.

Writable custom subagents are currently an experimental capability. The default and recommended mode is readonly. `subagents.allowWrite=true` only indicates relaxed delegation policy; it does not imply a complete permission sandbox, audit logging, automatic rollback mechanism, or stable write-capability contract. Use only in trusted repositories, and all changes must be human-reviewed.

For custom agents:

- Subagent's actual tool availability depends on child pi runtime, current tool registration, execution environment, and configuration.
- Do not interpret `readonly: false` or `allowWrite=true` as a stable, controllable, auditable tool permission model.
- File writing, command execution, project modification, and other write-like behaviors should not be treated as default-safe capabilities.
- There is currently no stable automatic rollback guarantee; when enabling writable behavior, use Git diffs, human review, and test commands as safety nets.

## Invalid definitions

The following cases cause agent files to be skipped or have capabilities not match expectations:

- Missing `name`: file is not loaded.
- Frontmatter is not simple `key: value`: cannot parse into expected fields.
- `tools` uses YAML list syntax: not parsed as a list.
- Declaring non-existent tools: tool names are passed to child pi, but availability depends on pi runtime; devkit-pi does not verify each tool's existence at discovery time.
- `readonly` written as `yes` / `True`: does not parse as true; only `true` or `1` take effect.

## Source map

| Topic | Source |
|---|---|
| Agent discovery | `src/modules/subagents/agents.ts` |
| Frontmatter parser | `src/modules/subagents/frontmatter.ts` |
| Tool filtering | `src/modules/subagents/executor.ts` |
| Built-in agents | `agents/*.md` |
| Tests | `tests/subagents/agents.test.ts`, `tests/subagents/frontmatter.test.ts` |
