---
status: accepted
audience: maintainer
last_verified: 2026-05-12
language: chinese
---

# ADR 0001：采用轻量 foreground subagent 设计

> Historical decision record：本文记录当时的背景和取舍，不等同于当前 API reference；当前行为以 `docs/reference/`、`src/` 和 `tests/` 为准。

## 状态

Accepted

## 背景

原项目具备 background、parallel、chain、intercom、worktree、TUI 等高级能力，但当前目标是为 pi 提供简单、真实、可控的 subagents 能力。

## 决策

第一版只实现：

- 一个 `subagent` 工具
- 五个内置子代理
- foreground 同步执行
- `maxSubagentDepth = 1`
- 默认 readonly

不实现复杂多代理编排能力。

## 影响

优点：

- 易维护
- 易测试
- 用户心智负担低
- 默认更安全

代价：

- 不支持后台任务
- 不支持并行和链式流程
- 不支持子代理运行中联系主代理

这些能力可在 MVP 稳定后按需重新评估。
