---
status: accepted
audience: maintainer
last_verified: 2026-05-12
---

# ADR 0006: 架构一致性优先于 legacy layout

## 状态

Accepted

## 背景

`devkit-pi` 组合了多个能力区域：subagents、web tools、LSP code intelligence、diagnostics hooks 和 developer commands。随着这些区域增长，平行模块可能无意中保留早期项目阶段遗留的布局或一次性实现模式。

保留这些 legacy 差异会让仓库更难导航、测试、配置和维护文档。相比兼容旧的内部布局，本项目更需要可预测的结构。

## 决策

`devkit-pi` 优先考虑架构一致性，而不是保留 legacy structure。

当多个模块、工具、提供者、命令或功能区域承担类似角色时，除非有强有力的书面理由，否则应遵循相同或高度相似的设计结构。

当旧设计模式、遗留目录布局或先前实现结构与当前架构冲突时，本项目不要求保留它们。

优先规则：

- 相同职责 → 相同结构
- 相同概念 → 相同命名模式
- 相同生命周期 → 相同执行模式
- 相同提供者类型 → 相同 adapter interface
- 相同工具类别 → 相同 schema / 配置 / 测试 / 文档模式

## 影响

- 当 refactor 能提升一致性时，可以有意打破旧的内部布局。
- 新模块应镜像既有的配置、测试和文档模式。
- 例外必须记录在决策点附近或后续 ADR 中。
- 当前 reference docs、`src/` 和 `tests/` 仍是行为的 source of truth。
