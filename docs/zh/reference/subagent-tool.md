---
status: current
audience: user
last_verified: 2026-05-12
language: chinese
---

# Subagent 工具参考

本文档仅描述 `subagent` tool 的 public API。Subagents 模块总览见 [`subagents.md`](./subagents.md)，agent 文件格式见 [`agent-definition.md`](./agent-definition.md)，结果结构见 [`result-schema.md`](./result-schema.md)。

## 工具名称

```text
subagent
```

## 用途

把一个聚焦任务委派给指定 agent，并在 foreground child pi session 中执行。当前只支持单 agent、同步 foreground 执行。

## Input schema

源码：`src/modules/subagents/schemas.ts`

```ts
{
  agent: string;
  task: string;
}
```

TypeBox schema：

- `agent`：required，`minLength: 1`
- `task`：required，`minLength: 1`
- `additionalProperties: false`

不支持的旧/规划字段：

```text
chain, tasks, async, share, worktree, action, id, sessionDir, control, model, skills
```

## 示例

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

## 输出结构

成功或失败都通常以 pi tool result 返回：

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

单次执行的 `results[0]`：

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

`content[0].text` 是给主代理/用户阅读的文本，可能已截断。更完整的结构化信息见 `details`。

## 成功语义

- `exitCode === 0` 表示 child pi process 正常结束。
- `details.results[0].output` 保存脱敏后的输出。
- `content[0].text` 可能是同一输出的截断版本。
- 如果输出被截断，执行仍可视为成功，但 `details.error.code` 可能为 `SUBAGENT_OUTPUT_TRUNCATED`。

## 失败语义

常见失败以 `details.error` 表示：

| 错误码 | 场景 |
|---|---|
| `INVALID_INPUT` | 缺少 `agent` 或 `task` |
| `SUBAGENTS_DISABLED` | subagents 配置禁用 |
| `UNKNOWN_AGENT` | 指定 agent 不存在 |
| `SUBAGENT_DEPTH_EXCEEDED` | depth 超限，禁止 nested subagents |
| `SUBAGENT_TIMEOUT` | 子代理执行超时 |
| `SUBAGENT_FAILED` | child process/spawn/session/provider runtime 等失败 |
| `SUBAGENT_OUTPUT_TRUNCATED` | 输出过长被截断 |

`SUBAGENT_DISABLED` 已定义但当前没有直接返回路径。

失败时通常仍返回 tool result，而不是抛出异常。返回文本可能包含 exit code、error、partial output 和 session file 路径。

## 执行说明

- 子代理进程会设置 `PI_SUBAGENT_CHILD=1`。
- 子代理进程不注册 `subagent` tool，因此不能继续委派子代理。
- 默认 `subagents.maxDepth=1`。
- 内置 agents 都是 readonly。
- LSP privileged actions（`rename`、`codeAction`、`restart`）在子代理进程中始终禁用。
- Web tools 可被声明了相应 tools 的子代理使用。
- 子代理实际可用工具以 child pi runtime、当前工具注册、执行环境和配置为准。
- `subagents.allowWrite=true` 只是实验性/高级/不安全的策略放宽入口，不代表完整权限沙箱、审计日志、自动回滚机制或稳定写入能力契约。

## 可写自定义 subagents 边界

可写自定义 subagents 目前属于实验性能力。默认且推荐的模式是 readonly。`subagents.allowWrite=true` 只表示放宽委派策略，不代表已经具备完整权限沙箱、审计日志、自动回滚机制或稳定的写入能力契约。仅建议在可信仓库中使用，并且必须人工 review 所有变更。

当前没有稳定的自动回滚保证。如果用户启用可写行为，应使用 Git 工作区、提交前 diff、人工 review 和测试命令兜底。

## Source map

| 主题 | 源码 |
|---|---|
| Tool registration | `src/modules/subagents/register.ts` |
| Input schema | `src/modules/subagents/schemas.ts` |
| Execution/result assembly | `src/modules/subagents/executor.ts` |
| Child process execution | `src/modules/subagents/execution.ts` |
| Output collection | `src/modules/subagents/collect-output.ts` |
| Shared result/error types | `src/shared/types.ts` |
