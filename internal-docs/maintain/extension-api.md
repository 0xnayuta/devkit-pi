---
status: current
audience: maintainer
last_verified: 2026-05-12
language: chinese
---

# Pi Extension API 用法参考

本文档记录 devkit-pi 当前使用的 pi extension API 子集。当前 public API、配置和命令行为以 [Reference index](../../docs/reference/README.md)、[Configuration reference](../../docs/reference/configuration.md)、[Subagents reference](../../docs/reference/subagents.md)、[Subagent tool reference](../../docs/reference/subagent-tool.md)、[Web tools reference](../../docs/reference/web-tools.md)、[LSP tools reference](../../docs/reference/lsp-tools.md) 与 [Toolkit commands reference](../../docs/reference/toolkit-commands.md) 为准。

## 工具注册

模块通过 `defineTool()` + `pi.registerTool()` 注册工具：

```ts
import { defineTool, type ExtensionAPI } from "@earendil-works/pi-coding-agent";

export function registerModule(pi: ExtensionAPI): void {
  pi.registerTool(
    defineTool({
      name: "tool_name",
      label: "Tool Name",
      description: "Tool description",
      parameters: Params,
      async execute(toolCallId, params, signal, onUpdate, ctx) {
        return {
          content: [{ type: "text", text: "ok" }],
          details: { status: "ok" },
        };
      },
    })
  );
}
```

当前入口是 `src/index.ts`，只负责加载配置并组合注册模块：

```ts
registerWebTools(pi, config.web);
registerLspModule(pi, config.lsp);
registerSubagentsModule(pi, config.subagents);
registerToolkitCommands(pi, config);
```

## 事件监听

当前使用的事件：

| Event | 用途 |
|---|---|
| `before_agent_start` | 注入 delegation policy；子代理 prompt runtime 重写 |
| `session_start` | web storage restore / stats reset；LSP hook status/warmup |
| `tool_call` | LSP hook 预热相关文件 clients |
| `tool_result` | LSP hook 记录或执行 diagnostics |
| `agent_start` | LSP hook 清理本轮状态 |
| `agent_end` | LSP hook `agent_end` 模式自动 diagnostics |
| `session_shutdown` | web cleanup；LSP manager shutdown |

## 渲染

web 与 lsp tools 可以提供 `renderCall` / `renderResult`，用于压缩 UI 输出并避免默认 JSON 过长。LSP hook 还注册 `lsp-diagnostics` message renderer，用于折叠自动 diagnostics 输出。

## 兼容边界

devkit-pi 使用新 namespace 配置，不实现旧配置迁移层。配置默认值和 normalize 规则见 [Configuration reference](../../docs/reference/configuration.md)。
