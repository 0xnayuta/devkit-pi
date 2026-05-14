---
status: current
audience: user
last_verified: 2026-05-12
language: chinese
---

# Result Schema 参考

本文档描述 devkit-pi 当前公开结果结构中与 `subagent` tool 相关的部分。Subagents 总览见 [`subagents.md`](./subagents.md)，tool API 见 [`subagent-tool.md`](./subagent-tool.md)。

## 重要说明

当前 `subagent` tool 返回的是 pi tool result 结构：

```ts
{
  content: Array<{ type: "text"; text: string }>;
  details: Details;
}
```

历史文档中的：

```json
{ "ok": true, "output": "..." }
```

更接近内部/概念化成功结果，不是当前 `subagent` tool 的顶层返回结构。面向调用方请以 `content` + `details` 为准。

## 顶层 tool result

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

字段说明：

| 字段 | 说明 |
|---|---|
| `content[0].text` | 面向用户/主代理阅读的输出；可能被截断 |
| `details.mode` | 当前执行主要为 `single`；depth guard 等管理类结果可能为 `management` |
| `details.runId` | 单次执行 id，通常为 8 位 UUID 前缀 |
| `details.results` | 子代理执行结果数组；当前单次调用最多一个主要结果 |
| `details.error` | 结构化错误或截断提示 |
| `details.streaming` | 执行中的 streaming update 使用；最终结果通常不包含 |

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
  /** Present when exitCode === 124 (timeout). Distinguishes hard cap vs idle timeout. */
  timeoutReason?: "runtime" | "idle";
}
```

语义：

- `exitCode === 0`：child pi process 正常结束。
- `exitCode !== 0`：执行失败；`error` 和 `details.error` 通常存在。
- `usage`：从 child pi JSONL 中提取，缺失时回退为 0 值对象。
- `sessionFile`：child session JSONL 文件路径，用于调试；不建议作为稳定外部 API 强依赖。
- `output`：脱敏后的子代理输出。
- `displayItems`：从 assistant messages 提取的文本和 tool calls，用于 rich rendering；格式细节可能变化。
- `timeoutReason`：当 `exitCode === 124` 时存在，表示超时原因。`"runtime"` 表示达到 `timeoutMs`（最大总运行时间）上限；`"idle"` 表示超过 `idleTimeoutMs`（最大空闲时间）且无有效活动。重试场景下以最后一次执行为准。

## 成功示例

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

## 失败示例

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

## Streaming update 结构

执行过程中，renderer 可能收到 partial result：

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

这是执行期 UI 展示状态，不应作为最终业务结果依赖。

## Subagent 错误码

Canonical source：`src/shared/types.ts` 中的 `SUBAGENT_ERROR_CODES`。

| 错误码 | 说明 |
|------|------|
| `INVALID_INPUT` | 缺少必需参数 `agent` 或 `task` |
| `SUBAGENTS_DISABLED` | 子代理功能已禁用 |
| `UNKNOWN_AGENT` | 未知 agent 名称 |
| `SUBAGENT_DISABLED` | 已定义但当前没有直接返回路径；预留给未来 per-agent disable 语义 |
| `SUBAGENT_DEPTH_EXCEEDED` | 递归深度超限；子代理不能再调子代理 |
| `SUBAGENT_TIMEOUT` | 执行超时 |
| `SUBAGENT_FAILED` | 子代理执行失败，含 spawn/session/runtime/provider 等未分类失败 |
| `SUBAGENT_OUTPUT_TRUNCATED` | 输出被截断，或 child stdout/stderr/JSONL 输出超过执行硬上限并被停止 |

## 输出收集

`src/modules/subagents/collect-output.ts` 从 child pi JSONL/stdout 中提取：

- final assistant text
- usage
- provider/runtime error
- partial assistant output
- last event type

如果没有 final assistant text，会返回简短诊断，而不是暴露完整原始 JSONL。

## 脱敏和截断

返回前会执行：

- `sanitizeOutput()`：遮蔽常见 API key、token、Authorization header、GitHub token、用户路径和过长 stack trace。
- `src/modules/subagents/execution.ts` 中的 child 输出硬上限：在异常 child stdout/stderr/JSONL 输出无限增长前停止执行。
- `truncateOutput()`：按默认输出限制截断长输出。

因此：

- `details.results[0].output` 是脱敏后的输出。
- `content[0].text` 可能是截断后的文本。
- 截断或被 child 输出硬上限停止时，`details.error.code` 可能是 `SUBAGENT_OUTPUT_TRUNCATED`。

## 日志和 activity

- `/toolkit logs` 与 `/toolkit activity` 当前展示 Web 与 convert 工具的 toolkit activity logs/stats。
- 它们不是 subagent execution history 的稳定机器接口。
- 子代理调试主要依赖 tool result 的 `details` 与 `sessionFile`。

## 机器解析指导

相对稳定：

- `details.mode`
- `details.results[]`
- `details.error.code` / `details.error.message`
- `usage` 数值字段
- `exitCode`

不建议强依赖：

- `content[0].text` 的自然语言格式
- 内置 agent prompt 要求的 markdown 输出模板
- `displayItems` 的完整细节
- `sessionFile` 目录布局
- renderer 展示格式

## 相关 schemas

- Web tools 错误码：[`web-tools-error-codes.md`](./web-tools-error-codes.md)
- LSP tool 返回结构：[`lsp-tools.md`](./lsp-tools.md)
- `/toolkit` command 输出语义：[`toolkit-commands.md`](./toolkit-commands.md)
