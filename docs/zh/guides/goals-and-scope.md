---
status: current
audience: all
last_verified: 2026-05-12
---

# 目标与范围

当前 public API 与配置细节以 [Reference index](../reference/README.md)、[Configuration reference](../reference/configuration.md)、[Subagents reference](../reference/subagents.md)、[Web tools reference](../reference/web-tools.md)、[LSP tools reference](../reference/lsp-tools.md) 和 [Toolkit commands reference](../reference/toolkit-commands.md) 为准。

## 项目目标

`devkit-pi` 是面向个人工作流的综合 pi coding toolkit：

```text
subagents + web tools + LSP tool + LSP diagnostics hook + developer commands
```

目标不是完整多代理框架，而是把高频 coding 辅助能力模块化地合入一个 pi extension。

## 架构一致性策略

devkit-pi 优先考虑结构一致性，而不是保留旧有布局。

当多个模块、工具、提供者、命令或功能区域承担类似角色时，除非有强有力的书面理由，否则必须遵循相同或高度相似的设计结构。

当旧的设计模式、遗留目录布局或先前实现结构与当前架构冲突时，本项目不要求保留它们。

优先考虑：

- 相同职责 → 相同结构
- 相同概念 → 相同命名模式
- 相同生命周期 → 相同执行模式
- 相同提供者类型 → 相同适配器接口
- 相同工具类别 → 相同 schema / 配置 / 测试 / 文档模式

## 当前包含

- `subagent` 工具与 5 个内置 readonly agents：`explorer`、`researcher`、`reviewer`、`implementer`、`tester`
- user/project markdown agent 定义（简单 frontmatter）
- foreground 单次子代理执行
- 子代理递归保护：`subagents.maxDepth = 1`
- bundled readonly web tools：`web_search`、`fetch_content`、`get_search_content`
- LSP tool：definitions、references、hover、signature、symbols、diagnostics、workspace diagnostics、servers
- LSP diagnostics hook：默认在 `agent_end` 后对本轮修改文件自动诊断，可配置为 `edit_write` 或关闭
- 可选的子代理 readonly LSP：通过 `subagents.allowLspTools` 和 `subagents.allowedLspActions` 控制
- unified developer command：`/toolkit`（doctor、modules、logs、agents、lsp、activity）
- namespace 化配置：`subagents` / `web` / `lsp` / `commands`

## 当前不包含

- background/async jobs
- chain workflow
- parallel execution
- intercom
- worktree 管理
- complex artifact system
- fallback model chain
- 多代理编排引擎
- agent management actions（create/update/delete）
- 子代理中的 LSP hook / 自动 diagnostics
- 子代理中的 privileged LSP actions：`rename`、`codeAction`、`restart`

## 设计边界

1. 主代理是唯一 orchestrator。
2. 子代理不能调度其他子代理。
3. 默认 readonly；写能力必须显式配置。
4. LSP readonly actions 可作为 read/grep/find 的渐进增强。
5. `rename`、`codeAction`、`restart` 默认禁用，且在子代理进程中始终禁用。
6. 各模块必须可独立启停。
7. 职责相近的平行模块应收敛到统一的结构、命名、配置、测试和文档模式，而不是保留旧有布局。

## 自定义 agent 示例

```md
---
name: custom-reviewer
description: Project-specific reviewer.
readonly: true
tools: read, grep, find, ls
---

You are a custom review subagent.
```
