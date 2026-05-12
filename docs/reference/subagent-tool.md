---
status: current
audience: user
last_verified: 2026-05-12
language: english
---

# Subagent Tool Reference

This document only describes the `subagent` tool's public API. For the Subagents module overview, see [`subagents.md`](./subagents.md); for agent file format, see [`agent-definition.md`](./agent-definition.md); for result structure, see [`result-schema.md`](./result-schema.md).

## Tool name

```text
subagent
```

## Purpose

Delegate a focused task to a specified agent, executed in a foreground child pi session. Currently only supports single agent, synchronous foreground execution.

## Input schema

Source: `src/modules/subagents/schemas.ts`

```ts
{
  agent: string;
  task: string;
}
```

TypeBox schema:

- `agent`: required, `minLength: 1`
- `task`: required, `minLength: 1`
- `additionalProperties: false`

Unsupported legacy/planned fields:

```text
chain, tasks, async, share, worktree, action, id, sessionDir, control, model, skills
```

## Examples

```ts
subagent({
  agent: "explorer",
  task: "Find where authentication middleware is implemented"
})
```

```ts
subagent({
  agent: "reviewer",
  task: "Review the LSP tool error handling and report risks only"
})
```

```ts
subagent({
  agent: "researcher",
  task: "Find the current official API docs for TypeBox schema options"
})
```

## Output shape

Success or failure usually returns a pi tool result:

```ts
{
  content: Array<{ type: "text"; text: string }>;
  details: {
    mode: "single" | "management";
    runId?: string;
    results: SingleResult[];
    error?: {
      code: SubagentErrorCode;
      message: string;
    };
    streaming?: StreamingDisplay;
  };
}
```

Single execution's `results[0]`:

```ts
{
  agent: string;
  task: string;
  exitCode: number;
  usage: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    cost: number;
    turns: number;
  };
  error?: string;
  sessionFile?: string;
  output?: string;
  displayItems?: Array<
    | { type: "text"; text: string }
    | { type: "toolCall"; name: string; args: Record<string, unknown> }
  >;
}
```

`content[0].text` is text for the main agent/user to read, possibly truncated. For more complete structured information, see `details`.

## Success semantics

- `exitCode === 0` indicates the child pi process exited normally.
- `details.results[0].output` holds the sanitized output.
- `content[0].text` may be a truncated version of the same output.
- If output is truncated, execution may still be considered successful, but `details.error.code` may be `SUBAGENT_OUTPUT_TRUNCATED`.

## Failure semantics

Common failures are expressed via `details.error`:

| Code | Scenario |
|---|---|
| `INVALID_INPUT` | Missing `agent` or `task` |
| `SUBAGENTS_DISABLED` | Subagents feature disabled by configuration |
| `UNKNOWN_AGENT` | Specified agent does not exist |
| `SUBAGENT_DEPTH_EXCEEDED` | Depth exceeded, nested subagents prohibited |
| `SUBAGENT_TIMEOUT` | Subagent execution timed out |
| `SUBAGENT_FAILED` | Child process/spawn/session/provider runtime failure |
| `SUBAGENT_OUTPUT_TRUNCATED` | Output too long, truncated |

`SUBAGENT_DISABLED` is defined but currently has no direct return path.

On failure, a tool result is usually still returned rather than throwing an exception. The returned text may include exit code, error, partial output, and session file path.

## Execution notes

- The subagent process sets `PI_SUBAGENT_CHILD=1`.
- The subagent process does not register the `subagent` tool, so it cannot further delegate to subagents.
- Default `subagents.maxDepth=1`.
- Built-in agents are all readonly.
- LSP privileged actions (`rename`, `codeAction`, `restart`) are always disabled in subagent processes.
- Web tools can be used by subagents that declare the corresponding tools.
- Subagent's actual tool availability depends on child pi runtime, current tool registration, execution environment, and configuration.
- `subagents.allowWrite=true` is only an experimental/advanced/unsafe policy relaxation entry point, not a complete permission sandbox, audit log, automatic rollback mechanism, or stable write-capability contract.

## Writable custom subagents boundary

Writable custom subagents are currently an experimental capability. The default and recommended mode is readonly. `subagents.allowWrite=true` only indicates relaxed delegation policy; it does not imply a complete permission sandbox, audit logging, automatic rollback mechanism, or stable write-capability contract. Use only in trusted repositories, and all changes must be human-reviewed.

There is currently no stable automatic rollback guarantee. If users enable writable behavior, they should use Git workspaces, pre-commit diffs, human review, and test commands as safety nets.

## Source map

| Topic | Source |
|---|---|
| Tool registration | `src/modules/subagents/register.ts` |
| Input schema | `src/modules/subagents/schemas.ts` |
| Execution/result assembly | `src/modules/subagents/executor.ts` |
| Child process execution | `src/modules/subagents/execution.ts` |
| Output collection | `src/modules/subagents/collect-output.ts` |
| Shared result/error types | `src/shared/types.ts` |
