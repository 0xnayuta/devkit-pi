---
status: partially-implemented
audience: maintainer
last_verified: 2026-05-18
language: chinese
---

# pi upstream compact JSON stream PR 草案

日期：2026-05-18

> **更新 (2026-05-18)**：本 PR 草案对应的实现已部署在私有 fork 中。
> 详见本文档末尾「私有 Fork 实现」章节。

关联文档：

- `internal-docs/issues/subagent-json-stream-o-n2-protocol-plan.md`
- 本仓库参考实现：
  - `src/modules/subagents/pi-json-stream.ts`
  - `src/modules/subagents/pi-json-stream-serializer.ts`
  - `src/modules/subagents/pi-json-stream-serializer.ts`
  - `src/modules/subagents/child-event-filter.ts`

---

## 私有 Fork 实现

本草案已在私有 fork 中实现并通过验证。

### 位置

```textn../pi                          # 与 devkit-pi 同级的私有 fork 仓库
└─ branch: patch/json-stream-compact
   ├─ 2 commits ahead of upstream main
   └─ 已推送至 origin/patch/json-stream-compact
```

### 已实现的文件

```text
packages/coding-agent/src/cli/args.ts       # 新增 --json-stream 解析
packages/coding-agent/src/main.ts            # 透传 jsonStream 到 print-mode
packages/coding-agent/src/modes/print-mode.ts       # 调用 serializer
packages/coding-agent/src/modes/json-event-filter.ts  # compact 序列化逻辑
packages/coding-agent/docs/json.md           # 文档更新
packages/coding-agent/test/args.test.ts      # CLI 参数测试
packages/coding-agent/test/json-event-filter.test.ts  # compact 行为测试
scripts/verify-json-stream-patch.ps1        # 本地验证脚本
```

### devkit-pi 对接状态

`devkit-pi` 已完成以下对接准备：

- `src/modules/subagents/pi-json-stream.ts`：compact/full 偏好管理与 fallback
- `src/modules/subagents/pi-json-stream-serializer.ts`：compact wire shape 的本地参考实现（用于测试）
- `src/modules/subagents/child-event-filter.ts`：旧版 pi full JSON fallback filter
- `src/modules/subagents/executor.ts`：优先使用 compact，失败时 fallback full

`devkit-pi/package.json` 的 `pi-*` 依赖已升级至 `>=0.75.1`，以对接 fork 中的 patch 版本。

### 验证结果

E2E 验证（2026-05-18）确认：

- compact 输出体积减少约 **63.9%**
- `message_update` 不再包含 `message` / `partial` 字段
- `collectOutput()` 能从 compact 输出正确提取最终结果（`final=true`）
- `message_end` / `turn_end` 事件完整保留
- devkit-pi unit tests 全部通过

### 后续计划

- 若 upstream 接受 PR 合并：删除私有 fork，改用官方版本
- 若 upstream 不接受：维护私有 fork，并考虑设置本地 version tag scheme（如 `v0.75.1-jsoncompact.1`）

### 本地验证命令

```powershell
cd ../pi
powershell -ExecutionPolicy Bypass -File scripts/verify-json-stream-patch.ps1
```

---

## 目标

为 pi upstream 增加一个 **可选** 的 compact JSON stdout transport profile：

```bash
pi --mode json --json-stream full
pi --mode json --json-stream compact
```

要求：

1. 默认行为保持不变，`full` 继续输出当前完整 `AgentSessionEvent`。
2. `compact` 仅改变 stdout JSONL serialization，不改变 in-process event 语义。
3. `message_update` 不再重复输出累计 `message` 与 `assistantMessageEvent.partial`。
4. `tool_execution_update` 第一版直接跳过。
5. `message_end` / `turn_end` / `agent_end` 等低频生命周期事件继续输出完整状态。

---

## 背景与依据

当前 pi `--mode json` 在 `print-mode` 中直接：

```ts
writeRawStdout(`${JSON.stringify(event)}\n`)
```

因此高频 `message_update` 会把累计快照重复写到 stdout，导致长回答场景出现 O(N²) 级别传输膨胀。

pi-agent-core 的 proxy transport 已有明确先例：

> The server strips the partial field from delta events to reduce bandwidth. We reconstruct the partial message client-side.

因此 upstream 最合理的修复方式不是改变 agent-core 的 in-process event，而是在 CLI JSON mode 的 transport 层引入 compact profile。

---

## 推荐 PR 范围

### 修改文件（上游仓库）

推荐目标（逻辑位置示意，实际 monorepo 源码路径以 upstream 仓库当前结构为准）：

```text
packages/coding-agent/src/
├─ cli/
│  └─ args.ts
├─ modes/
│  ├─ print-mode.ts
│  └─ json-event-filter.ts   # 新增
└─ docs/
   └─ json.md
```

当前已确认的构建产物入口包括：

```text
dist/cli/args.js
dist/modes/print-mode.js
docs/json.md
```

若 upstream 源码结构还有：

```text
packages/coding-agent/src/main.ts
```

则需要同步把 `parsed.jsonStream` 透传给 `runPrintMode()`。

---

## 设计草案

### 1. CLI 参数

新增参数：

```bash
--json-stream <profile>
```

可选值：

```ts
"full" | "compact"
```

规则：

- 仅在 `--mode json` 下生效；
- 缺省值为 `full`；
- `--json-stream` 缺失值时，应视为 CLI usage error 并返回非 0 exit code；
- `--json-stream <invalid>` 时，推荐视为 CLI usage error 并返回非 0 exit code；若 upstream 更偏好宽松行为，则至少必须在文档中明确是“warning + fallback to full”的有意设计；
- 若在非 json mode 下传入，推荐给出 warning 并忽略，而不是 hard error。

---

### 2. args.ts 建议变更

#### 2.1 类型

建议在 `args.ts` 增加：

```ts
export type JsonStreamProfile = "full" | "compact";
```

并扩展 `Args`：

```ts
export interface Args {
  // ...existing fields
  jsonStream?: JsonStreamProfile;
}
```

#### 2.2 parseArgs()

建议新增解析。推荐的严格版本：

```ts
else if (arg === "--json-stream") {
  const profile = args[++i];
  if (!profile) {
    throw new Error("Missing value for --json-stream. Valid values: full, compact");
  }
  if (profile === "full" || profile === "compact") {
    result.jsonStream = profile;
  } else {
    throw new Error(`Invalid value for --json-stream: ${profile}. Valid values: full, compact`);
  }
}
```

如果 upstream CLI 现有约定更偏好“记录 diagnostics 而非抛错”，也可以保留同风格实现；但需要明确：

- 缺失值如何处理；
- 非法值是 hard error 还是 warning；
- 默认是否回退到 `full`。

#### 2.3 帮助文案

在 `printHelp()` 的 `--mode` 附近增加：

```text
--json-stream <profile>       JSON stdout stream profile for --mode json: full (default), compact
```

---

### 3. main.ts 建议变更

当前 `runPrintMode()` 调用大致是：

```ts
await runPrintMode(runtime, {
  mode: toPrintOutputMode(appMode),
  messages: parsed.messages,
  initialMessage,
  initialImages,
});
```

建议改为：

```ts
await runPrintMode(runtime, {
  mode: toPrintOutputMode(appMode),
  jsonStream: parsed.jsonStream ?? "full",
  messages: parsed.messages,
  initialMessage,
  initialImages,
});
```

---

### 4. print-mode.ts 建议变更

#### 4.1 选项类型扩展

建议 `PrintModeOptions` 增加：

```ts
jsonStream?: "full" | "compact";
```

#### 4.2 引入 serializer

新增：

```ts
import { serializeJsonStreamEvent } from "./json-event-filter.js";
```

#### 4.3 订阅输出逻辑

当前：

```ts
unsubscribe = session.subscribe((event) => {
  if (mode === "json") {
    writeRawStdout(`${JSON.stringify(event)}\n`);
  }
});
```

建议改为：

```ts
const jsonStream = options.jsonStream ?? "full";

unsubscribe = session.subscribe((event) => {
  if (mode === "json") {
    const serialized = serializeJsonStreamEvent(event, jsonStream);
    if (serialized !== undefined) {
      writeRawStdout(`${JSON.stringify(serialized)}\n`);
    }
  }
});
```

说明：

- `undefined` 表示该事件在 compact transport 下不输出；
- 仅影响 stdout JSONL serialization；
- session 内部事件、extensions、UI 订阅者全部不受影响。

---

### 5. json-event-filter.ts 新文件草案

建议新增：

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

### 5.1 compactAgentSessionEvent()

核心逻辑：

```ts
function compactAgentSessionEvent(event: AgentSessionEvent): unknown | undefined {
  switch (event.type) {
    case "message_update":
      return {
        type: "message_update",
        assistantMessageEvent: compactAssistantMessageEvent(event.assistantMessageEvent),
      };

    case "tool_execution_update":
      return undefined;

    default:
      return event;
  }
}
```

兼容性原则：

- 明确列入 compact 裁剪规则的事件才裁剪；
- 未知或未来新增事件默认透传；
- compact profile 的主要目标是消除高频累计快照，而不是做激进的全局字段最小化。

### 5.2 compactAssistantMessageEvent()

建议：

- 对 `text_delta` / `thinking_delta` / `toolcall_delta`：

```ts
{ type, contentIndex, delta }
```

上面是第一版建议的最小集合，但不应在文档中把它写死为所有实现细节的最终答案。若某类 delta 事件（尤其 `toolcall_delta`）还需要额外标识字段才能被稳定消费，应按“最小必要字段集合”补充，而不是强行压缩到不完整。
- 对其他 assistantMessageEvent：
  - 去掉 `partial`
  - 去掉重复 transport 噪声字段：`provider`、`model`、`api`、`timestamp`
  - 若 `usage` 全为 0，则删除 `usage`

伪代码：

```ts
function compactAssistantMessageEvent(event: AssistantMessageEvent): unknown {
  switch (event.type) {
    case "text_delta":
    case "thinking_delta":
    case "toolcall_delta":
      return {
        type: event.type,
        contentIndex: event.contentIndex,
        delta: event.delta,
      };
    default:
      return stripNoise(event);
  }
}
```

---

## compact transport 规则

### A. `message_update`

#### full（现状）

```json
{
  "type": "message_update",
  "message": { "role": "assistant", "content": [...] },
  "assistantMessageEvent": {
    "type": "text_delta",
    "contentIndex": 0,
    "delta": "x",
    "partial": { "role": "assistant", "content": [...] }
  }
}
```

#### compact（目标）

```json
{
  "type": "message_update",
  "assistantMessageEvent": {
    "type": "text_delta",
    "contentIndex": 0,
    "delta": "x"
  }
}
```

不输出：

- event-level `message`
- `assistantMessageEvent.partial`
- 每 token 重复的 provider/model/api/timestamp
- 全 0 usage

---

### B. `tool_execution_update`

第一版建议：

```ts
return undefined;
```

理由：

- tool partial output 同样可能很大；
- 当前 upstream 尚无统一 partial tool transport schema；
- `tool_execution_end` 已足够为子进程消费者提供最终结果。

---

### C. lifecycle / milestone events

以下事件继续完整输出：

- `message_start`
- `message_end`
- `turn_start`
- `turn_end`
- `agent_start`
- `agent_end`
- `tool_execution_start`
- `tool_execution_end`
- `queue_update`
- `compaction_*`
- `auto_retry_*`

理由：

- 它们通常是低频 milestone event；
- 对调试与结果提取仍有价值；
- 不会产生 O(N²) 级别膨胀；
- `queue_update` 即使在某些运行中较频繁，也不携带累计 assistant message snapshot，因此不是本 PR 的首要压缩目标。

---

## Compatibility guarantees

- `pi --mode json` 在不传 `--json-stream` 时应与当前行为保持兼容；若 upstream 有 snapshot / golden tests，默认模式应保持不变。
- `--json-stream compact` 是 opt-in transport profile，只影响 JSON mode 的 stdout JSONL serialization。
- in-process session events、SDK `session.subscribe()`、RPC 行为都不应因此改变。
- `compact` 应被视为一个文档化的、可依赖的 transport profile，而不是临时内部格式；后续如需继续裁剪字段，应优先通过新增 profile 或保持向后兼容来演进。
- 未知或未来新增的事件类型，在 compact mode 下应默认透传，除非它们被明确分类为高频快照类事件。

---

## docs/json.md 建议改写

建议在 `docs/json.md` 中增加：

### 新增 CLI 示例

```bash
pi --mode json --json-stream full "Your prompt"
pi --mode json --json-stream compact "Your prompt"
```

### 新增说明段落

建议新增类似描述：

> `full` preserves the existing JSON event stream exactly as emitted by the session.
> `compact` keeps lifecycle events intact but compacts high-frequency streaming updates for lower transport overhead.

### 新增 compact 行为说明

建议明确：

- `message_update` in compact mode omits the cumulative `message`
- `assistantMessageEvent.partial` is stripped
- `tool_execution_update` may be omitted in compact mode
- consumers that need final assistant output should read `message_end`, `turn_end`, and `tool_execution_end`
- compact mode is not intended for reconstructing final full output from `message_update` alone

### 示例

```json
{"type":"message_update","assistantMessageEvent":{"type":"text_delta","contentIndex":0,"delta":"Hello"}}
```

---

## 测试建议（upstream）

建议 upstream PR 至少补以下测试：

### 1. args parse

- `--json-stream compact` 能正确解析
- `--json-stream` 缺失值时，行为符合文档约定（推荐 hard error）
- 非法值时，行为符合文档约定（推荐 hard error；若采用 warning + fallback，也必须显式测试）

### 2. print-mode full snapshot stability

- 不传 `--json-stream` 时，JSON 输出与现状一致
- `--json-stream full` 与默认一致

### 3. compact message_update

断言 compact 下：

- 存在 `message_update`
- 不包含 event-level `message`
- 不包含 `assistantMessageEvent.partial`
- `text_delta` / `thinking_delta` 保留最小必要字段集合（第一版建议为 `type/contentIndex/delta`）
- `toolcall_delta` 保留最小必要字段集合；若实现需要额外标识字段，应在测试中固定下来

### 4. compact tool_execution_update

- compact 下 `tool_execution_update` 被跳过
- `tool_execution_end` 仍然存在
- 文档和测试都应明确：这是第一版有意取舍，因为 partial tool transport 尚无稳定 compact schema，而最终消费者通常应依赖 `tool_execution_end`

### 5. lifecycle events preserved

- `message_end.message` 完整存在
- `turn_end.message` 与 `turn_end.toolResults` 完整存在
- `agent_end.messages` 完整存在

### 6. size-growth regression test

模拟长文本 streaming：

- `full` 输出大小显著大于 `compact`
- `compact` 的增长趋势应接近线性
- 不要求在测试中做严格大 O 数学证明，但应明确避免 cumulative snapshot growth

建议测试断言聚焦在“趋势和差距”，例如：

```text
size(compact, N=large) << size(full, N=large)
size(compact, N=large) grows roughly with emitted deltas, not cumulative snapshots
```

---

### 私有 Fork 实现

本草案对应的 patch 已实现并推送至私有 fork：

```
../pi
└─ branch: patch/json-stream-compact
```

devkit-pi 已完成对接验证，详见本文档末尾「私有 Fork 实现」章节。

---

## 附录：devkit-pi 对接说明

本仓库当前已经完成：

- `src/modules/subagents/pi-json-stream.ts`
  - compact/full 偏好与 fallback
- `src/modules/subagents/pi-json-stream-serializer.ts`
  - 对 upstream compact wire shape 的本地参考实现
- `src/modules/subagents/child-event-filter.ts`
  - 旧版 pi 的 full JSON fallback filter
- `src/modules/subagents/child-output-buffer.ts`
  - persisted/transient 分离与 hard limits

因此 upstream 一旦支持：

```bash
--json-stream compact
```

`devkit-pi` 可以直接优先使用；旧版 pi 仍由本地 fallback 兼容。

---

## 非目标

本 PR 不做：

1. 不改变 agent-core 的 event 语义。
2. 不改变 SDK `session.subscribe()` 行为。
3. 不引入新的 RPC protocol。
4. 不尝试在 compact mode 中重建 partial message。
5. 不压缩低频 lifecycle event 的完整 message。

---

## 可直接提交给 upstream 的 PR 描述草稿

### 标题

```text
feat(json-mode): add compact JSON stream profile for lower-overhead stdout transport
```

### 摘要

```text
This adds an optional compact JSON stream profile for `pi --mode json`.

The existing JSON mode continues to default to `full`, preserving the exact current
stdout event stream for backward compatibility.

When `--json-stream compact` is enabled, high-frequency streaming events are
serialized in a transport-friendly shape:
- `message_update` omits the cumulative `message`
- `assistantMessageEvent.partial` is stripped
- `tool_execution_update` is omitted in the first version
- lifecycle/final events such as `message_end`, `turn_end`, and `tool_execution_end`
  remain unchanged

This keeps in-process event semantics intact while reducing stdout bandwidth and
avoiding O(N²)-style growth for long streaming responses.
```

---

## 验收标准

1. `pi --mode json` 默认输出与当前完全兼容。
2. `pi --mode json --json-stream compact` 可以正常运行。
3. `compact` 下 `message_update` 不再包含累计 `message`。
4. `compact` 下 `assistantMessageEvent.partial` 被移除。
5. `compact` 下 `tool_execution_update` 被省略。
6. `message_end` / `turn_end` / `tool_execution_end` 等最终事件仍完整。
7. docs/json.md 与 CLI help 同步更新。

---

## 建议后续

1. 在 upstream PR 合并后，确认最低支持 pi 版本。
2. 在 `devkit-pi` README / CHANGELOG / peer dependency 中记录 compact mode 支持版本。
3. 保留本地 full JSON fallback 与 child stdout filter，作为旧版本兼容层与 defense-in-depth。
