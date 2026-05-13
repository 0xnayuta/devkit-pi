---
status: current
audience: maintainer
last_verified: 2026-05-13
language: chinese
---

# 问题日志

## 最近修复

### v0.2.0

- 第 1 项：LSP 文件访问被限制在活动工作区根目录。
- 第 2 项：`workspace-diagnostics` 输入和 LSP 结果输出被限制上限。
- 第 3 项：子代理可通过显式白名单选择使用只读 LSP 操作。
- 第 4 项：LSP hook 仅在主进程注册，默认为 `agent_end`，并可通过 `lsp.hook` 配置。
- 第 5 项：统一开发者命令为 `/toolkit`；移除旧版 `/subagents` 和 `/lsp` 命令。
- 第 6 项：LSP 工具现在使用结构化的 `LspError` 和正确的错误码，而非普通的 `Error` 对象。
- 第 7 项：`/toolkit` 报告型命令现通过 `ctx.ui.custom()` 在 TUI 自定义面板中展示，替代直接的 `console.log` 输出，消除 TUI 界面污染；JSON/RPC 协议模式受保护，免受 stdout 污染。