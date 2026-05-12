---
status: current
audience: user
last_verified: 2026-05-12
language: english
---

# Result Schema Reference

This document describes the publicly exposed result structure related to the `subagent` tool in devkit-pi. For the Subagents overview, see [`subagents.md`](./subagents.md); for tool API, see [`subagent-tool.md`](./subagent-tool.md).

## Important note

The current `subagent` tool returns a pi tool result structure:

```ts
{
  content: Array<{ type: "text"; text: string }>;
  details: Details;
}
```

Historical documentation showing:

```json
{ "ok": true, "output": "..." }
```

is closer to an internal/conceptual success result, not the current `subagent` tool's top-level return structure. For callers, use `content` + `details` as the reference.

## Top-level tool result

```ts
{
  content: Array<{
    type: "text";
    text: string;
  }>;
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

Field descriptions:

| Field | Description |
|---|---|
| `content[0].text` | Output for user/main agent to read; may be truncated |
| `details.mode` | Current execution is mainly `single`; management results like depth guard may be `management` |
| `details.runId` | Single execution id, usually an 8-character UUID prefix |
| `details.results` | Subagent execution result array; current single call has at most one primary result |
| `details.error` | Structured error or truncation indicator |
| `details.streaming` | Used for streaming updates during execution; final results usually do not include this |

## `SingleResult`

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

Semantics:

- `exitCode === 0`: child pi process exited normally.
- `exitCode !== 0`: execution failed; `error` and `details.error` usually present.
- `usage`: extracted from child pi JSONL; falls back to zero-value object when missing.
- `sessionFile`: child session JSONL file path for debugging; not recommended as a stable external API dependency.
- `output`: sanitized subagent output.
- `displayItems`: text and tool calls extracted from assistant messages for rich rendering; format details may change.

## Success example

```json
{
  "content": [
    {
      "type": "text",
      "text": "## Findings\n- src/server/auth.ts contains the middleware."
    }
  ],
  "details": {
    "mode": "single",
    "runId": "abc12345",
    "results": [
      {
        "agent": "explorer",
        "task": "Find auth code",
        "exitCode": 0,
        "usage": {
          "input": 1000,
          "output": 500,
          "cacheRead": 0,
          "cacheWrite": 0,
          "cost": 0.01,
          "turns": 3
        },
        "sessionFile": "/path/to/session.jsonl",
        "output": "## Findings\n- src/server/auth.ts contains the middleware."
      }
    ]
  }
}
```

## Failure example

```json
{
  "content": [
    {
      "type": "text",
      "text": "Unknown agent: invalid-agent. Available agents: explorer, researcher, reviewer, implementer, tester"
    }
  ],
  "details": {
    "mode": "single",
    "results": [],
    "error": {
      "code": "UNKNOWN_AGENT",
      "message": "Unknown agent: invalid-agent. Available agents: explorer, researcher, reviewer, implementer, tester"
    }
  }
}
```

## Streaming update shape

During execution, the renderer may receive partial results:

```ts
{
  content: [{ type: "text", text: string }];
  details: {
    mode: "single";
    results: [];
    streaming: {
      displayItems: Array<
        | { type: "text"; text: string }
        | { type: "toolCall"; name: string; args: Record<string, unknown> }
      >;
      usage: Usage;
      turnCount: number;
    };
  };
}
```

This is execution-period UI display state and should not be relied upon as a final business result.

## Subagent error codes

Canonical source: `SUBAGENT_ERROR_CODES` in `src/shared/types.ts`.

| Code | Description |
|------|------|
| `INVALID_INPUT` | Missing required parameter `agent` or `task` |
| `SUBAGENTS_DISABLED` | Subagents feature is disabled |
| `UNKNOWN_AGENT` | Unknown agent name |
| `SUBAGENT_DISABLED` | Defined but currently has no direct return path; reserved for future per-agent disable semantics |
| `SUBAGENT_DEPTH_EXCEEDED` | Recursion depth exceeded; subagents cannot call further subagents |
| `SUBAGENT_TIMEOUT` | Execution timed out |
| `SUBAGENT_FAILED` | Subagent execution failed, including spawn/session/runtime/provider uncategorized failures |
| `SUBAGENT_OUTPUT_TRUNCATED` | Output was truncated |

## Output collection

`src/modules/subagents/collect-output.ts` extracts from child pi JSONL/stdout:

- final assistant text
- usage
- provider/runtime error
- partial assistant output
- last event type

If there is no final assistant text, a short diagnostic is returned instead of exposing the full raw JSONL.

## Sanitization and truncation

Before returning, the following are executed:

- `sanitizeOutput()`: masks common API keys, tokens, Authorization headers, GitHub tokens, user paths, and overly long stack traces.
- `truncateOutput()`: truncates long output per default output limits.

Therefore:

- `details.results[0].output` is the sanitized output.
- `content[0].text` may be the truncated text.
- When truncated, `details.error.code` may be `SUBAGENT_OUTPUT_TRUNCATED`.

## Logs and activity

- `/toolkit logs` and `/toolkit activity` currently display toolkit activity logs/stats for Web and convert tools.
- They are not a stable machine interface for subagent execution history.
- Subagent debugging mainly relies on the tool result's `details` and `sessionFile`.

## Machine parsing guidance

Relatively stable:

- `details.mode`
- `details.results[]`
- `details.error.code` / `details.error.message`
- `usage` numeric fields
- `exitCode`

Not recommended for strong dependency:

- `content[0].text` natural language format
- Built-in agent prompt-required markdown output templates
- `displayItems` full details
- `sessionFile` directory layout
- Renderer display format

## Related schemas

- Web tools error codes: [`web-tools-error-codes.md`](./web-tools-error-codes.md)
- LSP tool return structure: [`lsp-tools.md`](./lsp-tools.md)
- `/toolkit` command output semantics: [`toolkit-commands.md`](./toolkit-commands.md)
