---
status: current
audience: maintainer
last_verified: 2026-05-08
---

# Pi Extension API 最小用法参考

本文档记录 MVP 简化过程中需要的 pi 扩展 API 最小子集。

## 核心类型

### AgentToolResult<TDetails>
```typescript
interface AgentToolResult<TDetails = any> {
  /** Text or image content returned to the model */
  content: (TextContent | ImageContent)[];
  /** Arbitrary structured details for logs or UI rendering */
  details: TDetails;
}

// TextContent
interface TextContent {
  type: "text";
  text: string;
}
```

### ToolDefinition<TParams, TDetails, TState>
```typescript
interface ToolDefinition<TParams extends TSchema = TSchema, TDetails = unknown, TState = any> {
  /** Tool name (used in LLM tool calls) */
  name: string;
  /** Human-readable label for UI */
  label: string;
  /** Description for LLM */
  description: string;
  /** Parameter schema (TypeBox) */
  parameters: TParams;
  /** Execute the tool */
  execute(
    toolCallId: string,
    params: Static<TParams>,
    signal: AbortSignal | undefined,
    onUpdate: AgentToolUpdateCallback<TDetails> | undefined,
    ctx: ExtensionContext
  ): Promise<AgentToolResult<TDetails>>;
  /** Optional: custom rendering for tool call display */
  renderCall?: (args: Static<TParams>, theme: Theme, context: ToolRenderContext) => Component;
  /** Optional: custom rendering for tool result display */
  renderResult?: (result: AgentToolResult<TDetails>, options: ToolRenderResultOptions, theme: Theme, context: ToolRenderContext) => Component;
}
```

### ExtensionContext
```typescript
interface ExtensionContext {
  ui: ExtensionUIContext;         // UI methods
  hasUI: boolean;                 // false in print/RPC mode
  cwd: string;                    // Current working directory
  sessionManager: SessionManager; // Read-only
  modelRegistry: ModelRegistry;
  model: Model<any> | undefined;
  signal: AbortSignal | undefined;
  isIdle(): boolean;
  abort(): void;
  shutdown(): void;
}
```

### AgentToolUpdateCallback
```typescript
type AgentToolUpdateCallback<T = any> = (partialResult: AgentToolResult<T>) => void;
```

## 最小注册模式

```typescript
import type { ExtensionAPI, ExtensionContext, ToolDefinition } from "@mariozechner/pi-coding-agent";
import type { AgentToolResult } from "@mariozechner/pi-agent-core";
import { Type } from "typebox";

interface Details {
  mode: "single";
  results: SingleResult[];
  progress: AgentProgress[];
}

const MyParams = Type.Object({
  agent: Type.Optional(Type.String()),
  task: Type.Optional(Type.String()),
});

export default function registerMyExtension(pi: ExtensionAPI): void {
  const tool: ToolDefinition<typeof MyParams, Details> = {
    name: "subagent",
    label: "Subagent",
    description: "Delegate to a subagent",
    parameters: MyParams,
    
    async execute(
      toolCallId: string,
      params: Static<typeof MyParams>,
      signal: AbortSignal | undefined,
      onUpdate: ((result: AgentToolResult<Details>) => void) | undefined,
      ctx: ExtensionContext
    ): Promise<AgentToolResult<Details>> {
      // ... implementation
      return {
        content: [{ type: "text", text: result }],
        details: { mode: "single", results: [...], progress: [...] }
      };
    },
    
    renderCall(args, theme) {
      return new Text(`subagent ${args.agent ?? "?"}`, 0, 0);
    },
    
    renderResult(result, options, theme) {
      return new Text(result.content[0]?.text ?? "", 0, 0);
    },
  };
  
  pi.registerTool(tool);
}
```

## 扩展入口点

```typescript
// package.json
{
  "pi": {
    "extensions": ["./src/extension/index.ts"]
  }
}

// Export default function
export default function registerMyExtension(pi: ExtensionAPI): void {
  // 初始化代码
}
```

## 事件监听（可选）

```typescript
pi.on("session_start", (event) => {
  // event.type === "session_start"
  // event.reason: "startup" | "reload" | "new" | "resume" | "fork"
});

pi.on("session_shutdown", () => {
  // 清理资源
});

pi.on("tool_result", (event, ctx) => {
  if (event.toolName !== "subagent") return;
  // 处理工具结果
});
```

## 消息渲染器（可选）

```typescript
pi.registerMessageRenderer<MyDetails>("my-result-type", (message, options, theme) => {
  return new Text(message.content as string, 0, 0);
});
```

## 注意事项

### 1. 扩展入口
- 必须导出 `default function registerExtension(pi: ExtensionAPI): void`
- 或在 package.json 指定入口点

### 2. registerTool 调用
- 必须在 `registerExtension` 内部同步调用
- tool 定义中的 execute 是异步的

### 3. 工具名称
- 必须是有效的标识符（小写字母、数字、下划线）
- 会作为 LLM 调用工具的名称

### 4. 参数验证
- TypeBox schema 用于验证 LLM 传递的参数
- 不符合 schema 的参数会导致工具调用失败

### 5. AbortSignal 处理
- 允许用户中断长时间运行的工具
- 应该检查 signal.aborted 并相应处理

### 6. onUpdate 回调
- 用于流式更新 UI
- 可以在执行过程中多次调用
- 最后一次调用应包含完整结果

### 7. 渲染器
- renderCall: 工具调用时显示
- renderResult: 工具完成后显示
- 可选，不提供则使用默认文本渲染