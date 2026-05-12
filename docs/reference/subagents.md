---
status: current
audience: user
last_verified: 2026-05-12
language: english
---

# Subagents Reference

This document is devkit-pi Subagents module's public overview/reference. For `subagent` tool parameters and return values, see [`subagent-tool.md`](./subagent-tool.md); for agent file format, see [`agent-definition.md`](./agent-definition.md); for result structure, see [`result-schema.md`](./result-schema.md).

## Overview

The Subagents module lets the main agent delegate a focused task to a dedicated child pi session. It is not a full multi-agent framework; currently only supports foreground, single subagent execution, with the main agent remaining the sole orchestrator.

Suitable use cases:

- Code exploration: find files, symbols, call chains, and architecture locations
- Documentation/external research: hand off to researcher with Web/convert tools
- Implementation suggestions: generate implementation plans, not write code directly
- Review: isolate code review output and evidence collection
- Testing: generate test strategies, edge cases, and coverage suggestions
- Large output isolation: subagent's intermediate tool calls and context won't directly fill the main agent's reasoning flow
- Context compression: subagent returns focused summaries, main agent receives organized results

Differences from other capabilities:

- Regular prompt: still completed in main agent context; subagent starts an independent child session.
- Web/convert tools: `web_search` / `fetch_content` / `convert_content` are tools; researcher subagent uses them for research and document conversion.
- LSP tools: `lsp` is a code intelligence tool; some built-in subagents can use readonly LSP actions.
- `/toolkit` commands: user manual diagnostics/status viewing; does not replace `subagent` tool.

## Public surface

| Surface | Purpose | Usage | Output | Limitations | Source |
|---|---|---|---|---|---|
| `subagent` tool | Delegate a focused task to specified agent | `subagent({ agent, task })` | pi tool result, `content` + `details` | Only single agent foreground execution; no chain/parallel/background | `src/modules/subagents/register.ts` |
| Built-in agents | 5 preset readonly dedicated agents | `explorer` / `researcher` / `reviewer` / `implementer` / `tester` | agent prompt and tool allowlist | Prompt text may iterate; capabilities depend on available tools | `agents/*.md` |
| Custom agent definitions | user/project markdown agents | `~/.pi/agent/agents/`, `.pi/agents/`, `.agents/` | Merged into agent list by discovery | Only simple frontmatter supported; project > user > builtin dedup | `src/modules/subagents/agents.ts`, `frontmatter.ts` |
| Delegation policy injection | Hints to main agent when to delegate | Default `subagents.injectDelegationPolicy=true` | system prompt appended with policy/examples | Is a hint strategy, not a forced dispatcher | `src/shared/delegation-policy.ts` |
| `/toolkit agents` | View discovered agents | Manual command | console agent list | Does not start subagents | `src/modules/subagents/commands/list.ts` |
| `/toolkit doctor` | Diagnose config, agents, providers, permissions, LSP, etc. | Manual command | doctor report | report fail/warn are diagnostic items, not command failure | `src/modules/subagents/commands/doctor.ts` |
| `/toolkit logs` / `/toolkit activity` | View toolkit activity logs/stats | Manual command | text log / TUI panel | Primarily for Web/convert tool observability, not subagent execution log | `src/modules/subagents/commands/logs.ts`, `activity.ts` |
| Output collection | Collect final result, usage, errors from child pi JSONL/stdout | Automatic internal execution | `details.results[]`, `content[0].text` | Internal helper, not public tool | `src/modules/subagents/collect-output.ts`, `execution.ts` |

## Built-in agents

Built-in agents come from the repository's `agents/` directory. They all declare `readonly: true`, designed for read-only analysis/planning/research without writing files.

| Agent | Role / purpose | Expected use cases | Tools declared | Source |
|---|---|---|---|---|
| `explorer` | Read-only codebase navigator | Find files, patterns, definitions, references, architecture locations | `read, grep, find, ls, lsp` | `agents/explorer.md` |
| `researcher` | Read-only web researcher | External documentation/API/resource search, source synthesis, document conversion | `web_search, fetch_content, get_search_content, convert_content` | `agents/researcher.md` |
| `reviewer` | Read-only code reviewer | Review code, diffs, plans, tests, and documentation | `read, grep, find, ls, lsp` | `agents/reviewer.md` |
| `implementer` | Read-only implementation planner | Analyze requirements and code structure, produce implementation plans | `read, grep, find, ls, lsp` | `agents/implementer.md` |
| `tester` | Read-only test planner | Design test strategies, scenarios, edge cases, and coverage | `read, grep, find, ls, lsp` | `agents/tester.md` |

Note: Output format, work rules, and suggestions in agent prompts are behavioral guidance and should not be understood as strong security boundaries or protocol guarantees. Actual tool availability is also affected by configuration, pi runtime, subagent process environment, and tool registration.

Routing hints from delegation policy:

- `explorer`: locate, navigate, search code/files
- `researcher`: external resources/API/technology comparison/resource synthesis
- `reviewer`: code quality, risk, architecture review
- `implementer`: implementation planning, solution design
- `tester`: test strategies, edge cases, coverage planning

## Custom agents

Custom agents use markdown frontmatter + prompt body. Detailed format: [`agent-definition.md`](./agent-definition.md).

### Discovery paths

Current discovery loads:

- Built-in: repository `agents/`
- User: `~/.pi/agent/agents/`
- Project: search upward from cwd for `.pi/agents/` or `.agents/`

Deduplication priority:

```text
project > user > builtin
```

That is, a project agent can override same-named user/builtin agents; user agent can override same-named builtin agents.

### Supported frontmatter fields

The current parser is a simple `key: value` parser, not a full YAML parser. Supported fields:

| Field | Required | Behavior |
|---|---:|---|
| `name` | Yes | Agent name; if missing, the file is not loaded |
| `description` | No | Description; defaults to empty string |
| `readonly` | No | Only string `true` or `1` parses as true; otherwise false |
| `tools` | No | Comma-separated tool name list |
| `model` | No | Passed to child pi as `--model` |

Prompt body becomes `systemPrompt`. If body is empty, uses description; if also empty, child prompt falls back to default role text.

Fields with no special behavior currently:

- `package`
- `inheritSkills`
- `defaultContext`
- `tags`
- `routingHints`
- `disabled`
- `permissions`
- `tools` YAML list syntax

### Example

```md
---
name: docs-researcher
description: Project documentation researcher
readonly: true
tools: web_search, fetch_content, get_search_content, convert_content
---

You research external documentation and return concise findings.
Focus only on the delegated task. Do not call other subagents.
```

Recommendations:

- Use lowercase, hyphen-separated naming, e.g., `api-reviewer`.
- Explicitly write "only handle delegated task".
- Explicitly write "do not call additional subagents".
- Explicitly state how to report uncertainty.
- Readonly agents should only declare readonly tools.

## Delegation behavior

Current call chain:

```text
Main agent calls subagent({ agent, task })
  → Validate depth/config/input
  → discoverAgents(cwd, "both")
  → Select agent definition
  → filterToolsForReadonly(agent, config)
  → buildChildPrompt(...)
  → buildSubagentChildArgs(...)
  → runSync() starts foreground child pi process
  → collectOutput() collects JSONL/stdout final assistant output, usage, errors
  → sanitizeOutput() sanitizes
  → truncateOutput() truncates
  → Returns content + details to main agent
```

Execution mode:

- Foreground: parent agent waits for subagent to complete.
- Single: one tool call starts only one child agent.
- Depth guarded: default `maxDepth=1`, subagent process does not register `subagent` tool, prompt also requires not delegating further.
- Child pi uses `--mode json`, writes to independent session file.
- Long tasks exceeding internal threshold write to temporary task file and pass to child pi via `@file`.
- System prompt writes to temporary prompt file, best-effort cleanup after execution.

Context inheritance:

- Current executor calls `buildChildPrompt()` with `parentMessages: []`, i.e., does not actively pass parent message list.
- prompt-runtime has internal logic for stripping inherited context/skills, but this is not a public-facing API.
- Subagent receives role prompt, tools list, delegated task, and boundary instructions.

Output isolation:

- Subagent intermediate JSONL events, tool calls, usage are collected as display/usage information.
- Main agent ultimately receives focused text result and `details`, not the full child session context.
- Session file path is recorded in result for debugging.

## Readonly / write boundary

Writable custom subagents are currently an experimental capability. The default and recommended mode is readonly. `subagents.allowWrite=true` only indicates relaxed delegation policy; it does not imply a complete permission sandbox, audit logging, automatic rollback mechanism, or stable write-capability contract. Use only in trusted repositories, and all changes must be human-reviewed.

Current boundary based on source code:

- All 5 built-in agents declare `readonly: true`, and prompts explicitly require no editing or file writing.
- `filterToolsForReadonly()` filters tools for readonly agents, retaining only readonly tool sets:
  - `read`, `grep`, `find`, `ls`
  - `web_search`, `fetch_content`, `get_search_content`, `convert_content`
  - `lsp` (only when `subagents.allowLspTools=true` and `allowedLspActions` is non-empty)
- For custom agents with `readonly: false`:
  - If `subagents.allowWrite=false`, still filters to readonly tools.
  - If `subagents.allowWrite=true`, retains tools declared in agent frontmatter.

Important notes:

- `subagents.allowWrite=true` does not mean built-in agents will automatically write files; built-in agents remain readonly definitions and do not declare `edit` / `write`.
- `allowWrite=true` only affects tool filtering for non-readonly custom agents.
- Subagent's actual tool availability depends on child pi runtime, current tool registration, execution environment, and configuration; do not assume all tools will automatically be inherited by subagents in the future.
- Main agent process registers `subagent` and `/toolkit`; subagent process does not register `subagent` or `/toolkit`.
- LSP privileged actions are always disabled in subagents.
- Web and convert tools can be used for research, reading information, and converting supported documents to Markdown.
- File writing, command execution, project modification, and other write-like behaviors should not be understood as default-safe capabilities.
- Prompt/policy is behavioral guidance; real strong constraints mainly come from tool filtering, subagent not registering `subagent`, LSP privileged actions always disabled in subagents, etc.

There is currently no stable automatic rollback guarantee. If users enable writable behavior, they should use Git workspaces, pre-commit diffs, human review, and test commands as safety nets.

To formally support writable custom subagents in the future, at least the following should be supplemented:

1. When `allowWrite=false`, write-like / privileged capabilities are blocked or not exposed.
2. When `allowWrite=true`, allowed scope matches expectations.
3. LSP privileged actions remain disabled in subagents.
4. Subagents do not register `subagent`, preventing recursive delegation.
5. Subagents do not register `/toolkit`.
6. Custom agent `readonly` frontmatter and global config priority are clear.
7. Execution results record sufficient information for auditing.
8. Failures do not masquerade as success.

## Result schema and output collection

Detailed structure: [`result-schema.md`](./result-schema.md). Current `subagent` tool returns pi tool result:

```ts
{
  content: Array<{ type: "text"; text: string }>;
  details: {
    mode: "single" | "management";
    runId?: string;
    results: Array<{
      agent: string;
      task: string;
      exitCode: number;
      usage: Usage;
      error?: string;
      sessionFile?: string;
      output?: string;
      displayItems?: Array<{ type: "text"; text: string } | { type: "toolCall"; name: string; args: Record<string, unknown> }>;
    }>;
    error?: {
      code: SubagentErrorCode;
      message: string;
    };
    streaming?: StreamingDisplay;
  };
}
```

Semantics:

- Successful execution: `exitCode === 0`, `details.results[0].output` holds sanitized full output, `content[0].text` may be truncated version.
- Execution failure: `exitCode !== 0`, `details.error.code` is usually `SUBAGENT_FAILED` or `SUBAGENT_TIMEOUT`.
- Output truncation: execution may succeed, but `details.error.code` may be `SUBAGENT_OUTPUT_TRUNCATED`.
- Streaming: during execution, `details.streaming` may be returned via `onUpdate`; final results typically do not retain streaming fields.
- `collectOutput()` extracts final assistant text, usage, provider/runtime error, and partial output from child pi JSONL.
- `sanitizeOutput()` masks common tokens, secrets, user paths, and overly long stack traces.

Logs/activity:

- `/toolkit logs` and `/toolkit activity` currently display toolkit activity logs/stats for Web and convert tools, not subagent execution history.
- Subagent session file is a debugging clue, but not a stable external API.

Machine parsing:

- `details` top-level shape can be used for programmatic judgment, but human-readable `content[0].text`, agent prompt output format, and display rendering may change.
- External scripts should not depend on complete natural language output format.

## Relationship with Web / LSP / toolkit

### Web / convert tools

- Web and convert tools can be registered in both main agent and subagent processes.
- Built-in `researcher` declares `web_search`, `fetch_content`, `get_search_content`, `convert_content`.
- Custom agents can also declare these tools in `tools`.
- Web tools details: [`web-tools.md`](./web-tools.md). Convert tool details: [`convert-tools.md`](./convert-tools.md).

### LSP tools

- Built-in `explorer`, `reviewer`, `implementer`, `tester` declare `lsp`.
- Whether subagents can use `lsp` is affected by `subagents.allowLspTools` and `subagents.allowedLspActions`.
- Subagents only allow readonly-safe LSP actions; `rename`, `codeAction`, `restart` are always disabled in subagent processes.
- LSP details: [`lsp-tools.md`](./lsp-tools.md).

### `/toolkit` commands

- `/toolkit agents`: view discovered agents.
- `/toolkit doctor`: diagnose agents, providers, permissions, Web/LSP status.
- `/toolkit logs` / `/toolkit activity`: view toolkit activity logs/stats.
- `/toolkit` is only registered in main agent process, not in subagent processes.
- Commands details: [`toolkit-commands.md`](./toolkit-commands.md).

## Configuration

Complete configuration: [`configuration.md#subagents-configuration`](./configuration.md#subagents-configuration).

Default configuration summary:

```json
{
  "subagents": {
    "enabled": true,
    "maxDepth": 1,
    "timeoutMs": 300000,
    "allowWrite": false,
    "allowLspTools": true,
    "allowedLspActions": [
      "definition", "references", "hover", "signature",
      "symbols", "diagnostics", "workspace-diagnostics", "servers"
    ],
    "injectDelegationPolicy": true,
    "retry": {
      "enabled": true,
      "maxAttempts": 2
    }
  }
}
```

Configuration effects:

- `subagents.enabled=false`: `registerSubagentsModule()` does not register `subagent` tool.
- `subagents.maxDepth=1`: default prohibits nested subagents.
- `subagents.timeoutMs`: single child execution timeout.
- `subagents.allowWrite`: experimental/advanced/unsafe switch; only affects tool filtering for non-readonly custom agents, does not change built-in agents' readonly definition, does not provide complete permission sandbox, audit log, automatic rollback, or stable write-capability contract.
- `subagents.allowLspTools` / `allowedLspActions`: controls whether subagents can use readonly LSP actions.
- `subagents.injectDelegationPolicy`: controls whether to inject delegation policy into main agent prompt.
- `subagents.retry.*`: limited retry for subagent transient failures.

Custom agents discovery paths are currently not configurable, fixed to user/project directory lookup.

## Error and failure semantics

Current subagent error code canonical source is `SUBAGENT_ERROR_CODES` in `src/shared/types.ts`.

| Code | Current semantics |
|---|---|
| `INVALID_INPUT` | Missing `agent` or `task` |
| `SUBAGENTS_DISABLED` | Subagent feature disabled by configuration |
| `UNKNOWN_AGENT` | Cannot find specified agent; returns available agent names |
| `SUBAGENT_DISABLED` | Defined but currently has no direct return path; reserved for future per-agent disable semantics |
| `SUBAGENT_DEPTH_EXCEEDED` | Depth exceeded; subagents cannot continue calling subagents |
| `SUBAGENT_TIMEOUT` | Child execution timed out |
| `SUBAGENT_FAILED` | spawn, session directory, child process, or provider/runtime failure, uncategorized failures |
| `SUBAGENT_OUTPUT_TRUNCATED` | Output too long, truncated; can co-occur with successful execution |

Failure behavior:

- Invalid input / disabled / unknown agent / depth exceeded usually returns as `content[0].text` + `details.error`, not necessarily throwing exception.
- Spawn failure is wrapped as `SUBAGENT_FAILED`.
- Child process non-0 exit forms failure summary including exit code, error, partial output, and session file.
- Agent definition parse failure or files missing `name` are silently skipped; `/toolkit doctor` may report user agents skipped.

## Stability notes

Public contract:

- Tool name: `subagent`
- Input fields: `agent`, `task`
- Built-in agent names: `explorer`, `researcher`, `reviewer`, `implementer`, `tester`
- Custom agent discovery paths and simple frontmatter supported fields
- Default foreground single execution
- Subagent process does not register `subagent` tool or `/toolkit`
- Subagent LSP privileged actions always disabled
- `details.mode`, `details.results[]`, `details.error` basic structure
- `SUBAGENT_ERROR_CODES` string values

Internal implementation / may change:

- Built-in agent prompt text and output templates
- Delegation policy text and examples
- Child prompt specific concatenation method
- Session file directory layout
- Streaming display item format details
- Retry transient error pattern
- Sanitize/truncate specific rules
- Renderer UI display format

External scripts should not strongly depend on natural language output, box/TUI rendering, or session file layout; if a stable machine interface is needed, prefer reading structured fields from `details`.

## Source map

| Topic | Source |
|---|---|
| Tool registration / renderer / session hooks | `src/modules/subagents/register.ts` |
| Agent discovery | `src/modules/subagents/agents.ts` |
| Foreground execution | `src/modules/subagents/execution.ts` |
| Executor / tool filtering / retry / result assembly | `src/modules/subagents/executor.ts` |
| Output collection | `src/modules/subagents/collect-output.ts` |
| Agent frontmatter parser | `src/modules/subagents/frontmatter.ts` |
| Pi args / temp prompt/task files | `src/modules/subagents/pi-args.ts` |
| Pi spawn command resolution | `src/modules/subagents/pi-spawn.ts` |
| Runtime prompt helpers | `src/modules/subagents/prompt-runtime.ts` |
| Output sanitization | `src/modules/subagents/sanitize.ts` |
| Schemas | `src/modules/subagents/schemas.ts` |
| Subagent-related toolkit commands | `src/modules/subagents/commands/` |
| Delegation policy | `src/shared/delegation-policy.ts` |
| Session identity | `src/shared/session-identity.ts` |
| Shared result/error/config types | `src/shared/types.ts` |
| Built-in agent definitions | `agents/*.md` |
| Tests | `tests/subagents/`, `tests/subagents/commands/` |
