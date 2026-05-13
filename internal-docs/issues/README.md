---
status: current
audience: maintainer
last_verified: 2026-05-13
language: chinese
---

# 问题日志

## 最近修复

### v0.2.1

- 子代理引入双超时模型（`timeoutMs` 作为 hard cap，`idleTimeoutMs` 作为空闲超时）。`timeoutMs` 默认从 5 分钟提升至 15 分钟，`idleTimeoutMs` 默认为 3 分钟。有效活动事件（`message_end`、`tool_result_end`、`turn_end`）会重置 idle timer。该改动避免了子代理长任务在持续工作时被机械终止，同时保持空闲安全边界。详见 [子代理超时问题：双超时模型改造计划](./subagent-timeout-idle-model.md)。

### v0.2.0

- 第 1 项：LSP 文件访问被限制在活动工作区根目录。
- 第 2 项：`workspace-diagnostics` 输入和 LSP 结果输出被限制上限。
- 第 3 项：子代理可通过显式白名单选择使用只读 LSP 操作。
- 第 4 项：LSP hook 仅在主进程注册，默认为 `agent_end`，并可通过 `lsp.hook` 配置。
- 第 5 项：统一开发者命令为 `/toolkit`；移除旧版 `/subagents` 和 `/lsp` 命令。
- 第 6 项：LSP 工具现在使用结构化的 `LspError` 和正确的错误码，而非普通的 `Error` 对象。
- 第 7 项：`/toolkit` 报告型命令现通过 `ctx.ui.custom()` 在 TUI 自定义面板中展示，替代直接的 `console.log` 输出，消除 TUI 界面污染；JSON/RPC 协议模式受保护，免受 stdout 污染。