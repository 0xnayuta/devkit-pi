---
status: current
audience: maintainer
last_verified: 2026-05-18
language: chinese
---

# 问题日志

## 后续维护设计记录

- [基于 Node 原生 V8 Coverage 的轻量可见性实施方案](./v8-coverage-visibility-plan.md)：以 `NODE_V8_COVERAGE` + 项目内聚合脚本建立 coverage 可见性，不引入额外复杂工具链。
- [LSP core 拆分边界设计记录](./lsp-core-split-boundaries.md)：拆分计划已执行完成，当前保留为边界与历史参考；实现下沉 go/no-go 结论见 [ADR 0007](../adr/0007-lsp-load-sync-no-go.md)。

## 最近修复

### v0.2.3

- LSP core 拆分（Phase 0~5）已完成：`formatters/source-files/server-registry/client-lifecycle/client-manager/diagnostics/actions/edits` 等模块已落地，`core.ts` 对外 facade 边界保持稳定。
- request-orchestrator 收口已完成（Slice A/B/C/D）：diagnostics、readonly actions、mutating actions 的文件准备与同步入口已统一。
- `loadFile/openOrUpdate` 已形成当前阶段 NO-GO 决策：暂不下沉具体实现，先维持“调用面统一、实现保留 core”边界。详见：
  - [LSP core 拆分边界设计记录](./lsp-core-split-boundaries.md)
  - [ADR 0007: LSP load/sync 实现迁移 NO-GO（当前阶段）](../adr/0007-lsp-load-sync-no-go.md)

### v0.2.2

- 子代理 JSON stream O(N²) stdout 膨胀改造方案与 upstream compact JSON stream PR 草案已完成，并在 fork 分支完成 patch 验证：<https://github.com/0xnayuta/pi/tree/patch/json-stream-compact>。
- `devkit-pi` 已完成 compact/full 偏好与 fallback 对接，子代理最终结果提取继续依赖生命周期事件（`message_end` / `turn_end` 等）。详见：
  - [子代理 JSON streaming stdout O(N²) 膨胀问题改造方案](./subagent-json-stream-o-n2-protocol-plan.md)
  - [pi upstream compact JSON stream PR 草案](./subagent-json-stream-o-n2-upstream-pr-draft.md)

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