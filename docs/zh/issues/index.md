---
status: current
audience: maintainer
last_verified: 2026-05-12
language: chinese
---

# 问题日志

最近修复的问题及其版本。

完整的问题日志见 [issue-log.md](./issue-log.md)。

## 最近修复

- (1) `v0.3.1` — LSP 文件访问被限制在活动工作区根目录。
- (2) `v0.3.2` — `workspace-diagnostics` 输入和 LSP 结果输出被限制上限。
- (3) `v0.4.0` — 子代理可通过显式白名单选择使用只读 LSP 操作。
- (4) `v0.5.0` — LSP hook 仅在主进程注册，默认为 `agent_end`，并可通过 `lsp.hook` 配置。
- (5) `v0.6.0` — 统一开发者命令为 `/toolkit`；移除旧版 `/subagents` 和 `/lsp` 命令。
- (6) `v0.6.1` — LSP 工具现在使用结构化的 `LspError` 和正确的错误码，而非普通的 `Error` 对象。