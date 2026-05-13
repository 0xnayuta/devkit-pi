---
status: implemented
audience: maintainer
last_verified: 2026-05-13
language: chinese
---

# 子代理超时问题：双超时模型改造计划

> **状态**：本文档记录改造计划，代码实现已完成（见各改动文件的 git log）。本文档保留作为历史参考和背景说明。

## 摘要

当前子代理（subagent）的超时机制是从子代理进程启动时开始计算的绝对 wall-clock timeout，无法区分子代理是否正处于活跃工作状态。这导致子代理在执行长任务时，即使仍在持续产出、调用工具或传递消息，仍可能在达到固定时间限制后被机械地判定为超时并终止。这种设计对长任务极不友好，也降低了子代理在实际工作流中的可用性。

## 问题描述

### 当前行为

子代理的超时由 `subagents.timeoutMs` 配置控制，默认值为 `300000`（5 分钟）。

相关实现位于：

- **配置层**：`src/config/load-config.ts:100`
  - 默认值 `timeoutMs: 300000`
- **执行层**：`src/modules/subagents/execution.ts:119-124`
  - 子进程启动后立即启动 `setTimeout`，计时开始后不会因任何活动而重置
- **执行器层**：`src/modules/subagents/executor.ts:308, 340, 370-371`
  - executor 将超时映射为 `SUBAGENT_TIMEOUT` 错误码和固定错误消息 `"Subagent timed out after ${timeoutMs}ms."`

当前代码在 `processLine()` 中已解析子代理的 JSONL 事件（`message_end`、`tool_result_end`），并在这些事件上向主代理推送 streaming update，但这些活跃信号没有与超时机制关联。

### 核心问题

5 分钟的超时计时与子代理的实际工作状态无关。子代理可能处于以下场景：

1. **正在执行一个需要 20 分钟的分析任务**——进程持续活跃，但 5 分钟后被终止。
2. **正在调用一个耗时工具**（如 Web 搜索、长时 LSP 操作）——工具调用期间无输出，5 分钟后子代理连带被终止。
3. **已完成主要工作，正在向主代理传递结果**——结果传递前超时，所有工作成果丢失。

这些都是合理的用户场景，但当前设计会导致子代理在 5 分钟后无条件终止，无论其是否正在工作。

## 解决方案：双超时模型

引入两个独立的超时机制：

```json
{
  "subagents": {
    "timeoutMs": 900000,
    "idleTimeoutMs": 180000
  }
}
```

语义：

| 配置字段 | 值 | 含义 |
|---|---|---|
| `timeoutMs` | 900000（15 分钟） | 子代理单次执行的**最大总运行时长**，hard cap，进程启动时开始计时，不会因子代理活动而重置。达到此上限无论子代理是否活跃都会被终止。 |
| `idleTimeoutMs` | 180000（3 分钟） | 子代理自最后一次**有效活动**后允许的**最大空闲时长**。每次出现有效活动事件时重置。超过此上限但子代理仍在活跃，则不会被终止。 |

### 行为矩阵

| 场景 | 当前行为 | 改造后行为 |
|---|---|---|
| 子代理活跃执行 10 分钟 | 5 分钟后被终止 | 正常完成（10 分钟 < 15 分钟 hard timeout） |
| 子代理 3 分钟无任何输出 | 3 分钟后被终止 | 3 分钟后 idle timeout 终止 |
| 子代理每分钟输出一次 assistant message | 5 分钟后被终止 | 持续运行至 15 分钟 hard timeout |
| 子代理持续打印无意义日志 | 5 分钟后被终止 | 3 分钟后 idle timeout 终止 |
| 子代理调用耗时 8 分钟的工具 | 5 分钟后被终止 | 3 分钟后 idle timeout 终止（若工具执行期间无中间事件） |
| 子代理完成工作正常退出 | 正常退出 | 正常退出 |

### 有效活动的定义

有效活动**不是**任意 stdout 文本，而是子代理进程输出的结构化 JSONL 运行事件。推荐第一版将以下事件视为有效活动：

- `message_end`：assistant 或 user message 完成
- `tool_result_end`：工具执行结果完成
- `turn_end`：对话轮次结束

> **未来扩展**：如果 pi runtime 后续输出 `tool_call_start` / `tool_call_end` 等工具调用生命周期事件，可以将其加入 `ACTIVITY_EVENT_TYPES` 集合。当前代码中未处理这些事件。

任意 stdout raw chunk、stderr 内容、无效 JSON 或非活动类型 JSONL 事件**不会**重置 idle timeout。

这样设计是为了防止子代理通过持续输出无意义日志绕过 idle timeout。

### 为什么需要保留 hard timeout

如果只实现 idle timeout 而不保留 hard timeout，会有以下风险：

- 子代理可以通过持续输出有效活动事件无限延长运行时间（通过死循环+不断发 `message_end` 事件）
- 子代理可能在无 bug 但极慢的推理过程中持续活跃，直到用户主动终止

因此，hard timeout 是不可移除的安全边界。

## 实施计划

### Step 1：扩展类型和默认配置

**涉及文件**：`src/shared/types.ts`、`src/config/load-config.ts`

**修改内容**：

- 在 `SubagentsConfig` 中新增 `idleTimeoutMs?: number`
- 在 `ResolvedSubagentsConfig` 中该字段会被自动要求存在
- 将 `DEFAULT_SUBAGENTS_CONFIG.timeoutMs` 从 `300000` 改为 `900000`
- 新增 `DEFAULT_SUBAGENTS_CONFIG.idleTimeoutMs = 180000`
- 在 `normalizeSubagentsConfig()` 中使用 `positiveInteger()` 归一化

**边界**：配置边界继续使用现有 `positiveInteger()` 规则，不允许关闭 idle timeout（`idleTimeoutMs` 必须是正整数）。

### Step 2：扩展 `runSync()` 参数和结果

**涉及文件**：`src/modules/subagents/execution.ts`

**修改内容**：

- 在 `RunSyncOptions` 中新增 `idleTimeoutMs?: number`
- 在 `RunSyncResult` 中新增 `timeoutReason?: "runtime" | "idle"`

### Step 3：实现双 timer

**涉及文件**：`src/modules/subagents/execution.ts`

**修改内容**：

- 保留原有的 hard timeout timer（重命名为 `runtimeTimeoutHandle`）
- 新增 idle timeout timer（`idleTimeoutHandle`）
- 抽象 `markTimedOut(reason: "runtime" | "idle")` 函数，避免两个 timer 同时触发时互相覆盖
- 抽象 `resetIdleTimeout()` 函数，在子进程启动后调用一次，然后在每次有效活动事件上再次调用
- 定义有效活动事件常量 `ACTIVITY_EVENT_TYPES`
- 在 `processLine()` 的 `message_end` 和 `tool_result_end` 处理中调用 `resetIdleTimeout()`
- 在 `close` 和 `error` 分支中清理两个 timer

**关键注意事项**：

- 不应将任意 stdout chunk 视为活动，只能将成功解析的结构化 JSONL 事件视为活动
- hard timeout 不可被活动重置
- `cancelled` 和 `timedOut` 应互不干扰

### Step 4：executor 层传参和错误信息

**涉及文件**：`src/modules/subagents/executor.ts`

**修改内容**：

- 读取 `deps.config.idleTimeoutMs` 并传给 `runSync()`
- 保存 `result.timeoutReason`
- 根据 `timeoutReason` 生成不同错误消息：
  - hard timeout：`"Subagent exceeded maximum runtime after 900000ms."`
  - idle timeout：`"Subagent timed out after 180000ms without activity."`
- 继续使用 `SUBAGENT_ERROR_CODES.SUBAGENT_TIMEOUT` 作为错误码
- 在 `SingleResult` 中新增 `timeoutReason?: "runtime" | "idle"` 字段

### Step 5：测试补充

**涉及文件**：`tests/subagents/execution.test.ts` 或新建专门测试文件

**新增测试用例**：

1. **hard timeout 仍然生效**：子进程持续输出有效活动，但 `timeoutMs` 较短，最终应被 runtime timeout 终止，断言 `result.timedOut === true` 且 `result.timeoutReason === "runtime"`
2. **idle timeout 在无活动时触发**：子进程不输出有效 JSONL，`idleTimeoutMs` 较短，应触发 idle timeout，断言 `result.timeoutReason === "idle"`
3. **有效活动会重置 idle timeout**：子进程每隔短时间输出合法 JSONL 事件，总时长超过 `idleTimeoutMs` 但不超过 `timeoutMs`，不应被 idle timeout 杀掉
4. **无效 stdout 不应重置 idle timeout**：子进程输出非 JSONL 文本，`idleTimeoutMs` 较短，应触发 idle timeout
5. **executor 层 idle timeout 错误消息**：通过 `createSubagentExecutor()` 触发 idle timeout，断言错误消息包含 `without activity`
6. **配置默认值**：确认默认 `timeoutMs === 900000`，`idleTimeoutMs === 180000`

### Step 6：文档更新

**涉及文件**：

- `docs/zh/reference/subagents.md`（配置字段说明）
- `docs/zh/reference/result-schema.md`（`SingleResult` 新增字段）
- `docs/reference/configuration.md`（如果存在英文配置文档）

**更新内容**：

- 说明 `subagents.timeoutMs` 为最大总运行时间 / 硬超时
- 新增 `subagents.idleTimeoutMs` 字段说明
- 解释“有效活动”的定义和范围
- 更新 `SUBAGENT_TIMEOUT` 错误码说明，指出可能由 runtime 或 idle 超时触发
- 更新 `SingleResult` 类型说明，标注 `timeoutReason` 字段

### Step 7：完整验证

**验证命令**：

```bash
pnpm typecheck
pnpm lint
pnpm test
# 如涉及文档检查
pnpm docs:check
```

## 风险与注意事项

### 1. 长时间工具调用期间可能触发 idle timeout

如果 pi runtime 在工具执行期间不输出中间事件（如 `tool_call_start`），则长时间工具调用（如 8 分钟的 Web 搜索或 LSP 操作）期间可能没有任何事件可重置 idle timeout，导致 idle timeout 在 3 分钟后触发。

缓解方式：

- 将 `idleTimeoutMs` 设置为更高值（如 300000）
- 推动 pi runtime 在工具执行开始时输出 `tool_call_start` 事件
- 后续可考虑增加“工具调用期间 idle timeout 暂停”机制

第一版建议保持 3 分钟默认值，不做过早优化。

### 2. Windows 平台 signal 行为不稳定

当前测试中部分用例使用 `itPosix` 跳过 Windows 平台，因为 shell script 和 signal 在 Windows 上行为不同。

新增的 timeout 测试如果依赖 bash script，应使用 `itPosix` 或改用跨平台 Node 脚本。

### 3. 错误码不新增

第一版继续使用 `SUBAGENT_ERROR_CODES.SUBAGENT_TIMEOUT`，详细原因通过错误消息和 `timeoutReason` 字段暴露。

### 4. 默认行为变化

从“最多运行 5 分钟”变为“最多运行 15 分钟，但如果 3 分钟无有效活动则提前超时”。这是用户可见行为变化，需要在 changelog 或 release notes 中说明。

### 5. 错误消息变化

原来的固定消息 `"Subagent timed out after ${timeoutMs}ms."` 将根据 `timeoutReason` 产生不同输出。现有的测试断言需要同步更新。

## 配置最终值

```json
{
  "subagents": {
    "enabled": true,
    "maxDepth": 1,
    "timeoutMs": 900000,
    "idleTimeoutMs": 180000,
    "allowWrite": false,
    "allowLspTools": true,
    "allowedLspActions": [...],
    "injectDelegationPolicy": true,
    "retry": {
      "enabled": true,
      "maxAttempts": 2
    }
  }
}
```

| 字段 | 默认值 | 说明 |
|---|---|---|
| `timeoutMs` | 900000（15 分钟） | 最大总运行时间，hard cap |
| `idleTimeoutMs` | 180000（3 分钟） | 最大空闲时间，从最后一次有效活动开始计算 |

## 相关文件清单

| 文件 | 改动类型 | 说明 |
|---|---|---|
| `src/shared/types.ts` | 类型扩展 | `SubagentsConfig` 新增 `idleTimeoutMs`，`SingleResult` 新增 `timeoutReason` |
| `src/config/load-config.ts` | 配置扩展 | 默认值调整，`normalizeSubagentsConfig` 归一化 |
| `src/modules/subagents/execution.ts` | 核心逻辑 | 双 timer 实现，`RunSyncOptions`/`RunSyncResult` 扩展 |
| `src/modules/subagents/executor.ts` | 适配层 | 传参、错误消息、schema 扩展 |
| `tests/subagents/execution.test.ts` | 测试 | 新增 idle timeout 和 hard timeout 测试用例 |
| `docs/zh/reference/subagents.md` | 文档 | 配置字段说明更新 |
| `docs/zh/reference/result-schema.md` | 文档 | `SingleResult` schema 更新 |

## 参考实现细节

### 双 timer 状态管理

```ts
let runtimeTimeoutHandle: NodeJS.Timeout | undefined;
let idleTimeoutHandle: NodeJS.Timeout | undefined;
let timedOut = false;
let timeoutReason: "runtime" | "idle" | undefined;

const markTimedOut = (reason: "runtime" | "idle") => {
  if (timedOut || cancelled) return;
  timedOut = true;
  timeoutReason = reason;
  terminateChild();
};

const resetIdleTimeout = () => {
  if (idleTimeoutMs === undefined) return;
  if (idleTimeoutHandle) clearTimeout(idleTimeoutHandle);
  idleTimeoutHandle = setTimeout(() => {
    markTimedOut("idle");
  }, idleTimeoutMs);
};
```

### 有效活动事件集合

```ts
const ACTIVITY_EVENT_TYPES = new Set([
  "message_end",
  "tool_result_end",
  "turn_end",
  // NOTE: tool_call_start / tool_call_end are not currently emitted by pi runtime.
  // Add them here if pi adds support for tool-call lifecycle events.
]);
```

### 错误消息语义

| 原因 | 错误消息示例 |
|---|---|
| hard timeout | `Subagent exceeded maximum runtime after 900000ms.` |
| idle timeout | `Subagent timed out after 180000ms without activity.` |
| 用户取消 | `Subagent execution was cancelled by user.` |