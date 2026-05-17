# 子代理 JSON streaming stdout O(N²) 膨胀问题改造方案

日期：2026-05-18

## 摘要

`devkit-pi` 当前通过 `pi --mode json` 启动子代理进程，并把 child stdout 中的 pi JSONL 事件流作为内部 subagent IPC 和最终结果采集来源。当子代理进行长文本输出（代码审查、深度思考等）时，pi 原版 JSON event stream 的 `message_update` 事件会在每个 token/delta 上携带当前累计 `message`，底层 `assistantMessageEvent` 还可能携带累计 `partial`。这会使 stdout 传输量从线性增长退化为 O(N²)，最终触发本仓库 `src/modules/subagents/execution.ts` 中的 child stdout hard limit：

```text
Subagent child output exceeded stdout hard limit (8388608 bytes) and was stopped.
```

本文档给出根因、pi 原版相关结构、`devkit-pi` 当前耦合点，以及与 pi 原版功能结构保持一致的分层改造方案。

---

## 目标与非目标

### 目标

1. 从协议源头识别并避免高频 streaming 事件携带累计全量状态导致的 O(N²) stdout 膨胀。
2. 保持 `devkit-pi` 子代理模块边界清晰：`subagents` 负责子代理执行、收集和渲染，不把 pi 原版 JSON event stream 私有细节散落到多个模块。
3. 与 pi 原版结构保持一致：
   - pi agent-core 的事件模型仍保留 `message_update` 作为 UI streaming 事件。
   - pi CLI `--mode json` 仍保留通用完整 event stream 能力。
   - 新增 compact/filtered JSON 输出或 devkit-pi 子代理 IPC 时，应以 adapter/filter 方式实现，不破坏现有默认语义。
4. 保证最终子代理结果仍可从低频生命周期事件提取：`message_end` / `turn_end` / `agent_end` / error events。
5. 增加测试覆盖，证明长文本 streaming 不再触发 stdout hard limit。

### 非目标

1. 不通过简单调大 `DEFAULT_SUBAGENT_MAX_STDOUT_BYTES` 掩盖问题。
2. 不把所有 `message_update` raw event 持久化后再截断作为最终方案。
3. 不在 `collect-output.ts` 中依赖高频 delta 重建最终答案；最终答案应来自生命周期完成事件。
4. 不强制引入重型依赖或改变 Web/convert/LSP 模块边界。

---

## 现状链路

### devkit-pi 链路

关键文件：

- `src/modules/subagents/executor.ts`
  - 构造子代理 prompt、session、tools、model。
  - 调用 `buildSubagentChildArgs({ mode: "json", ... })`。
  - 调用 `runSync()` 执行 child pi。

- `src/modules/subagents/pi-args.ts`
  - 当 `mode === "json"` 时添加：

    ```ts
    args.push("--mode", "json");
    ```

- `src/modules/subagents/execution.ts`
  - `spawn(command, spawnArgs, { stdio: ["ignore", "pipe", "pipe"] })`。
  - 读取 `child.stdout`，目前以 byte buffer + line buffer 方式处理。
  - 对 stdout/stderr/JSONL line 数量设置 hard limits。
  - 将完整 stdout 解码后交给 `collectOutput(output)`。

- `src/modules/subagents/collect-output.ts`
  - 解析 JSONL。
  - 从 `message_end` / `turn_end` / `message` / `result` 等事件提取最终 assistant 文本、usage、provider error、partial output。

### pi 原版 JSON mode 链路

pi 包位置（当前工作区 pnpm store）：

- `@earendil-works/pi-coding-agent/dist/modes/print-mode.js`
- `@earendil-works/pi-coding-agent/docs/json.md`
- `@earendil-works/pi-coding-agent/docs/sdk.md`
- `@earendil-works/pi-coding-agent/dist/core/agent-session.js`
- `@earendil-works/pi-agent-core/dist/proxy.js`
- `@earendil-works/pi-agent-core/README.md`

`dist/modes/print-mode.js` 中 JSON mode 的核心输出逻辑：

```js
unsubscribe = session.subscribe((event) => {
  if (mode === "json") {
    writeRawStdout(`${JSON.stringify(event)}\n`);
  }
});
```

这表示 `--mode json` 会把 `AgentSessionEvent` 原样 `JSON.stringify()` 到 stdout。

`docs/json.md` 说明 `message_update` 结构：

```ts
| { type: "message_update"; message: AgentMessage; assistantMessageEvent: AssistantMessageEvent }
```

示例：

```json
{"type":"message_update","message":{...},"assistantMessageEvent":{"type":"text_delta","delta":"Hello",...}}
```

`dist/core/agent-session.js` 中 session 对 agent event 的转发逻辑保留完整 message：

```js
else if (event.type === "message_update") {
  const extensionEvent = {
    type: "message_update",
    message: event.message,
    assistantMessageEvent: event.assistantMessageEvent,
  };
  await this._extensionRunner.emit(extensionEvent);
}
```

随后 `_emit(event)` 会把同一个完整 event 发给 `session.subscribe()` 监听者，`print-mode.js` 再原样输出。

`@earendil-works/pi-agent-core/README.md` 明确将 `message_update { message: partial... }` 定义为 streaming chunks。也就是说，对 UI/event subscriber 来说，`message_update.message` 是当前累计 partial message，这是 pi 原版 agent event 的既有语义。

### pi 原版已有的“delta-only over transport”先例

`@earendil-works/pi-agent-core/dist/proxy.js` 有重要注释：

```js
/**
 * The server strips the partial field from delta events to reduce bandwidth.
 * We reconstruct the partial message client-side.
 */
```

这说明 pi 原版生态已经承认：跨进程/跨网络 transport 中不应在高频 delta 事件里反复发送 `partial` 全量状态；合理做法是在传输层发送 delta-only，接收端按需重建 partial。

这为本问题的标准化改造提供了结构参考：

- 内部 UI/Agent event 可以保留 `message_update { message: partial }`。
- 进程边界/网络边界的 transport protocol 应使用 compact delta event。
- 完整状态只在 start/end/milestone 事件发送，或者由接收端重建。

---

## 根因分析

### 直接根因

`pi --mode json` 会原样输出所有 `AgentSessionEvent`：

```text
session.subscribe(event => stdout.write(JSON.stringify(event)))
```

其中 `message_update` 在每个 delta 上携带：

1. `message`: 当前累计 assistant message。
2. `assistantMessageEvent`: 底层 assistant message stream event。
3. `assistantMessageEvent.partial`: 某些 provider/proxy stream event 中也包含当前累计 assistant message。

当模型输出长度为 N 时，每个 delta 事件的 serialized size 近似随当前累计文本长度增长：

```text
1 + 2 + 3 + ... + N = O(N²)
```

### devkit-pi 放大点

`devkit-pi` 把 `pi --mode json` 的通用完整 event stream 直接作为 subagent IPC，并完整收集到 stdout buffer 中，用于后续 `collectOutput()`。但 `collectOutput()` 实际主要需要最终生命周期事件：

- `message_end`
- `turn_end`
- legacy/mock `result`
- error-like events

它不需要每个 token 的完整 `message_update`。

因此问题本质是：

> devkit-pi 在子代理进程边界使用了“面向完整调试/外部集成的 pi JSON event stream”，而不是“面向子代理 IPC 的 compact transport protocol”。

---

## 设计原则

1. **保留 pi 原版 Agent event 语义**  
   不应要求 pi agent-core 删除 `message_update.message`，因为交互式 UI 和 extension hooks 可能依赖 partial message 快照。

2. **transport 与 in-process event 分层**  
   in-process event 可以是 rich snapshot；跨 stdout/RPC/network 的 transport 应是 compact/delta-first。

3. **低频最终状态负责结果提取**  
   `collectOutput()` 应依赖 `message_end` / `turn_end`，而不是高频 delta。

4. **高频实时状态不持久化**  
   若需要 live UI，delta 可以走 transient `onStreamingUpdate`/`onStreamingDelta`，但不应进入最终 stdout collection buffer。

5. **兼容优先但不扩大旧结构**  
   对旧版本 pi CLI 需要 fallback filter；长期应使用 pi compact JSON mode 或 devkit-pi child runner。

6. **结构与测试镜像现有模块**  
   新增逻辑应位于 `src/modules/subagents/` 内，与 execution/collect-output 分工一致；测试放在 `tests/subagents/`。

---

## 推荐总体方案

分两阶段推进：

1. **短期 devkit-pi 内部稳定修复**：在 `subagents` 模块增加子代理 stdout JSONL event filter/collector，丢弃或非持久化高频 `message_update` / `tool_execution_update`，仅保留最终结果所需 lifecycle events。该方案不修改 pi upstream，但能防止 devkit-pi 内部 hard limit 被 raw update 撑爆。
2. **长期 pi upstream 标准修复**：为 pi `--mode json` 增加 compact/filtered event stream 模式，或在 devkit-pi 中实现 SDK-based child runner，确保 O(N²) 数据在 child stdout 写出前消失。

---

## 阶段 1：devkit-pi 子代理 stdout event filter

### 设计目标

当前 `execution.ts` 同时承担：

- spawn child pi
- stdout/stderr hard limit
- JSONL line parsing
- streaming state update
- final raw output collection

建议在 `subagents` 模块内拆出小型 helper，使职责更清晰：

```text
src/modules/subagents/
├─ execution.ts                  # spawn/lifecycle/timeout/orchestration
├─ collect-output.ts             # final result extraction from persisted JSONL
├─ child-event-filter.ts          # decide which child JSONL events are persisted/active
└─ child-output-buffer.ts         # optional: bounded line/stdout collector helper
```

第一版也可以只新增 `child-event-filter.ts`，避免过度拆分。

### Event 分类

新增内部类型：

```ts
type ChildEventPersistence =
  | "persist"       // 写入 final stdout buffer，供 collectOutput 使用
  | "transient"     // 可用于 live streaming/idle activity，但不持久化
  | "drop";         // 完全忽略
```

推荐分类：

| Event type | 分类 | 原因 |
|---|---:|---|
| `message_update` | `transient` | 高频，包含累计 `message` / `partial`，不能持久化 |
| `tool_execution_update` | `transient` | 高频 partial tool result，可能巨大 |
| `message_start` | `drop` 或 `persist` | 通常不需要；若用于诊断可保留但不应包含大 content |
| `message_end` | `persist` | 最终 assistant/user/toolResult message，结果提取需要 |
| `turn_end` | `persist` | usage/toolResults/final turn state |
| `tool_execution_start` | `persist` | 小型，displayItems/debug 可用 |
| `tool_execution_end` | `persist` | 工具最终结果/错误需要 |
| `tool_result_end` | `persist` | 兼容当前 `execution.ts` streaming 逻辑 |
| `agent_start` / `turn_start` | `persist` 或 `drop` | 小型；可保留诊断 |
| `agent_end` | `persist` | 完成边界；注意可能包含完整 messages，但低频一次 |
| `queue_update` | `drop` | 子代理非交互场景通常不需要 |
| `compaction_*` / `auto_retry_*` | `persist` | 低频诊断有价值 |
| non-JSON line | `persist` | 兼容 stderr/stdout 文本，继续受 hard limit 保护 |

### 为什么不是“压缩保存 message_update”

`message_update` 对最终结果提取不是必须。保存 compact delta 虽可将 O(N²) 降到 O(N)，但仍增加：

- JSONL 行数压力；
- JSON parse/stringify 开销；
- collector 与 final output 的耦合；
- 后续协议兼容成本。

更合理的架构是：

```text
高频实时通道：transient delta / streaming update，不持久化
低频结果通道：message_end / turn_end / error，持久化给 collectOutput
```

### execution.ts 改造方向

当前实现是按 chunk append stdout，再 split line 并 `processLine()`。建议改为：

1. child stdout data 到达时只追加到 `lineBuffer`。
2. 按行处理完整 JSONL。
3. 对每行：
   - parse JSON；
   - 调用 `classifyChildJsonlEvent(event)`；
   - `persist` 时写入 bounded `stdoutBuffer`；
   - `transient` 时只用于 `processLine()` 或未来 `onStreamingDelta`，不写入 final buffer；
   - `drop` 时忽略；
   - non-JSON line 按原文本写入 bounded buffer。
4. close 时 flush 剩余 line buffer。
5. hard limit 只统计 persisted stdout buffer + abnormal non-JSON/unterminated data，不用 raw `message_update` 触发 final stdout hard limit。

伪代码：

```ts
for (const line of completeLines) {
  const parsed = tryParseJsonRecord(line);

  if (!parsed) {
    appendPersistedStdoutLine(line);
    continue;
  }

  const classification = classifyChildJsonlEvent(parsed);

  if (classification === "persist") {
    appendPersistedStdoutLine(line);
  }

  if (classification !== "drop") {
    processLine(line); // 或 processEvent(parsed)，避免二次 JSON.parse
  }
}
```

### processLine/processEvent 优化

当前 `processLine()` 内部再次 `JSON.parse()`，并只处理：

- `message_end`
- `tool_result_end`

可改造为：

```ts
const processEvent = (event: Record<string, unknown>) => { ... }
```

stdout collector parse 一次即可完成 filter 与 streaming update。

但第一版为降低风险，也可保留 `processLine()`，只在 filter 层 parse 一次。后续再重构。

### idle timeout 语义

当前 `ACTIVITY_EVENT_TYPES` 只有：

- `message_end`
- `tool_result_end`
- `turn_end`

内部文档也强调普通 stdout/raw chunk 不 reset idle timeout。

阶段 1 不应改变 idle semantics。`message_update` 即使 transient，也不应默认 reset idle timeout，否则长时间只吐 token 但没有完成生命周期事件时会改变现有超时语义。若未来要把 delta 也作为 activity，应另起配置或 ADR。

### 测试要求

新增/更新：`tests/subagents/execution.test.ts`

1. **高频 message_update 不触发 stdout hard limit**  
   - fake child pi 输出大量 `message_update`，每条带不断增长的 `message.content[].text` 与 `assistantMessageEvent.partial`。
   - 设置较小 `maxStdoutBytes`。
   - 最后输出 `message_end`。
   - 断言：未触发 `outputLimitExceeded`，最终 output 正常。

2. **message_end 仍被持久化并可提取最终答案**

3. **non-JSON stdout 仍触发 hard limit**  
   - 保留现有 raw stdout 超限测试，证明不是绕过保护。

4. **tool_execution_update 不持久化**  
   - 模拟大 partialResult update + 小 final tool_execution_end。
   - 断言 final buffer 不爆。

5. **JSONL line hard limit 语义确认**
   - 明确是 raw complete JSONL line count 还是 persisted line count。
   - 推荐 `maxJsonlLines` 统计 raw complete JSONL line，以防 child 无限刷 transient event；但这可能导致超长回答 token 数较多时仍触发。若统计 persisted line，则需另设 transient event cap。
   - 推荐新增 `maxTransientJsonlLines` 或把现有 `maxJsonlLines` 定义为所有 valid JSONL line 的安全阈值，默认值需足够大。

---

## 阶段 2A：pi upstream compact JSON mode（推荐长期方案）

### 背景

pi 原版 `print-mode.js` 当前：

```js
writeRawStdout(`${JSON.stringify(event)}\n`);
```

这使 `--mode json` 成为完整 event dump。该模式对调试和外部完整集成有价值，不能直接改为 compact，否则会破坏现有使用者。

建议在 pi upstream 增加可选输出 profile，而不是改变默认 JSON mode。

### CLI 设计

推荐新增参数之一：

```bash
pi --mode json --json-stream full      # 默认，现有行为
pi --mode json --json-stream compact   # 新增 compact transport profile
```

或：

```bash
pi --mode json --json-events full
pi --mode json --json-events compact
```

命名建议选择 `json-stream`，因为它描述 stdout JSONL stream 的 shape，而不是 agent event 本身。

### pi 代码结构建议

保持 pi 原版结构：

```text
packages/coding-agent/src/
├─ modes/
│  ├─ print-mode.ts
│  └─ json-event-filter.ts     # 新增：JSON mode event serialization/filter
├─ cli/
│  └─ args.ts                  # 新增参数解析
└─ docs/
   └─ json.md                  # 文档新增 compact mode
```

在 dist 对应：

- `dist/modes/print-mode.js`
- `dist/cli/args.js`

### serializer/filter 接口

```ts
export type JsonStreamProfile = "full" | "compact";

export function serializeJsonStreamEvent(
  event: AgentSessionEvent,
  profile: JsonStreamProfile
): unknown | undefined {
  if (profile === "full") return event;
  return compactAgentSessionEvent(event);
}
```

`print-mode.ts`：

```ts
const serialized = serializeJsonStreamEvent(event, jsonStreamProfile);
if (serialized !== undefined) {
  writeRawStdout(`${JSON.stringify(serialized)}\n`);
}
```

### compact profile 规则

`compact` 不改变 in-process `AgentSessionEvent`，只改变 stdout serialization。

推荐规则：

#### 高频 message_update

Full event：

```ts
{
  type: "message_update",
  message: AgentMessage,
  assistantMessageEvent: AssistantMessageEvent
}
```

Compact event：

```ts
{
  type: "message_update",
  assistantMessageEvent: compactAssistantMessageEvent(event.assistantMessageEvent)
}
```

对 `text_delta`：

```json
{
  "type": "message_update",
  "assistantMessageEvent": {
    "type": "text_delta",
    "contentIndex": 0,
    "delta": "..."
  }
}
```

对 `thinking_delta`：

```json
{
  "type": "message_update",
  "assistantMessageEvent": {
    "type": "thinking_delta",
    "contentIndex": 0,
    "delta": "..."
  }
}
```

对 `toolcall_delta`：

```json
{
  "type": "message_update",
  "assistantMessageEvent": {
    "type": "toolcall_delta",
    "contentIndex": 0,
    "delta": "..."
  }
}
```

不输出：

- event-level `message`
- `assistantMessageEvent.partial`
- 恒为 0 的 usage
- 每 token 重复的 model/provider/api/timestamp 等 partial 元数据

#### start/end/milestone events

保留完整状态：

- `message_end.message`
- `turn_end.message`
- `turn_end.toolResults`
- `agent_end.messages`（可考虑单独 compact-agent-end，但默认保留低频完整状态）

#### tool_execution_update

如果 tool partialResult 可能大，也应 compact：

- full mode 保持原样；
- compact mode 可输出小型 summary 或直接跳过 update，保留 `tool_execution_end`。

建议第一版：compact mode 直接跳过 `tool_execution_update`，除非未来有工具 partial transport schema。

### 与 pi-agent-core proxy 先例对齐

`pi-agent-core/dist/proxy.js` 已有跨 transport strip partial + client reconstruct 的设计。本 compact JSON mode 应复用同一思想：

- server/child stdout 只传 delta；
- consumer 若需要 partial，自行重建；
- final message 由 done/message_end/turn_end 提供。

### devkit-pi 使用方式

在 `src/modules/subagents/pi-args.ts` 中，当检测 pi 支持 compact mode 后使用：

```ts
args.push("--mode", "json", "--json-stream", "compact");
```

兼容策略：

1. 若依赖 pi version >= 支持版本，则直接使用 compact。
2. 若需要兼容旧版本：
   - 默认仍传 compact；
   - 若 child 因 unknown option 退出，fallback 一次到 full + devkit-pi event filter；
   - 或通过 config/feature detection 禁用 compact。

更简洁的策略：因为 `package.json` peer dependency 是 `^0.74.0`，新增 compact 需要提升最低支持版本，并在 CHANGELOG/docs 明确说明。

---

## 阶段 2B：devkit-pi SDK child runner（备选长期方案）

如果 pi upstream 短期无法支持 compact JSON mode，可由 `devkit-pi` 实现自己的 child runner。

### 结构

```text
src/modules/subagents/
├─ child-runner/
│  ├─ main.ts                  # child process entry
│  ├─ protocol.ts              # devkit-pi subagent IPC schema
│  ├─ serializer.ts            # AgentSessionEvent -> SubagentChildEvent
│  └─ runtime.ts               # create pi runtime/session with same settings
├─ pi-args.ts                  # spawn node child-runner instead of pi --mode json
└─ execution.ts                # consume SubagentChildEvent JSONL
```

### 风险

该方案实现成本明显更高，因为需要复现 pi CLI 的：

- runtime host/session 构造；
- model registry/auth/settings；
- extension loading；
- tools 激活与过滤；
- system prompt 与 prompt file；
- session persistence；
- signal/cancellation；
- cwd、settings、project config 语义。

因此除非 upstream compact mode 不可行，否则不建议优先采用。

---

## 推荐实施顺序

### P0：文档与设计确认

- 本文档作为 issue design doc。
- 确认短期阶段 1 是否接受“高频 update 不持久化”。
- 确认长期阶段 2A 是否计划向 pi upstream 提 PR。

### P1：devkit-pi 阶段 1 修复

1. 新增 `src/modules/subagents/child-event-filter.ts`。
2. 在 `execution.ts` 中将 stdout raw chunk append 改为 JSONL line event filter 后 append persisted lines。
3. 保持 non-JSON stdout/stderr hard limits。
4. 保持 idle timeout 语义不变。
5. 添加 tests：
   - message_update O(N²) 输入不触发 stdout hard limit；
   - final message_end 可提取；
   - non-JSON stdout 仍触发 hard limit；
   - tool_execution_update 大 partial 不触发 persisted stdout hard limit。
6. 更新 `docs/reference/subagents.md` 与 `docs/zh/reference/subagents.md`。

### P2：pi upstream compact JSON mode 提案/实现

1. 在 pi `modes/print-mode` 周边增加 JSON stream serializer/filter。
2. 在 CLI args 增加 `--json-stream full|compact`。
3. 默认 `full` 保持兼容。
4. docs/json.md 增加 compact profile。
5. 增加 pi upstream tests：
   - full mode snapshot 不变；
   - compact mode `message_update` 不含 `message` 和 `partial`；
   - `message_end` 保留完整 message；
   - 长文本 compact stdout size 线性增长。

### P3：devkit-pi 使用 compact mode

1. 在 `pi-args.ts` 添加 compact args。
2. 若需要兼容旧 pi，增加 feature detection/fallback。
3. 保留阶段 1 filter 作为 defense-in-depth 与旧版本兼容层。
4. 增加 integration-like test，模拟 compact event stream。

---

## 验收标准

1. 长文本子代理输出不再触发 `DEFAULT_SUBAGENT_MAX_STDOUT_BYTES = 8 * 1024 * 1024`。
2. 相同回答长度下，持久化 stdout buffer 大小接近 O(final lifecycle events)，不随 token 数 O(N²) 增长。
3. 若使用 pi compact mode，child stdout 总传输量应接近 O(N)。
4. `collectOutput()` 能从 `message_end` / `turn_end` 正常提取：
   - final assistant output
   - usage
   - provider/runtime error
   - partial output fallback
5. raw non-JSON stdout/stderr 仍受 hard limit 保护。
6. idle timeout 行为与现有文档一致。
7. 子代理不引入 recursive subagent 调度，不改变 Web/convert/LSP 模块边界。

---

## 风险与取舍

### 阶段 1 风险

- 仍不能减少 child pi 已经写出的 raw stdout 体积；只能减少 devkit-pi 内部持久化/解析压力。
- 若某些未来功能依赖 `message_update` 进行最终结果提取，需要改为独立 transient streaming channel。
- JSONL line count hard limit 对 transient events 的语义需要明确，避免长输出因 token 行数过多被误杀。

### 阶段 2A 风险

- 需要 pi upstream 接受 CLI 参数与 serialization profile。
- devkit-pi 需要提升 pi peer/dev dependency 或实现 fallback。
- compact mode 是新协议，需要文档与测试稳定。

### 阶段 2B 风险

- SDK child runner 容易复制 pi CLI 初始化逻辑，长期维护成本高。
- 与 pi 原版功能结构可能逐渐分叉，不优先推荐。

---

## 结论

本问题的根因不是 stdout hard limit 太小，而是子代理进程边界使用了 pi `--mode json` 的完整 event dump，其中 `message_update` 将 delta 与累计 full snapshot 混在同一个高频事件中，导致 stdout 体积 O(N²) 增长。

工程化修复应分层：

1. `devkit-pi` 先在 subagents 模块内建立 child JSONL event filter，确保高频 update 不进入最终 stdout collection buffer。
2. pi upstream 增加 compact JSON stream profile，使跨进程 stdout transport 本身变成 delta-only/milestone-full，与 pi-agent-core proxy 中“strip partial to reduce bandwidth, reconstruct client-side”的既有设计保持一致。
3. `devkit-pi` 最终优先使用 compact mode，并保留 filter 作为兼容旧 pi 与 defense-in-depth 的安全层。
