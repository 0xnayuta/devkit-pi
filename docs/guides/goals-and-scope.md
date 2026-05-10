---
status: current
audience: all
last_verified: 2026-05-10
---

# 目标与范围

## 项目目标

`devkit-pi` 是面向个人工作流的综合 pi coding toolkit：

```text
subagents + web tools + LSP tool + developer commands
```

目标不是完整多代理框架，而是把高频 coding 辅助能力模块化地合入一个 pi extension。

## 当前包含

- `subagent` 工具与 5 个内置 readonly agents：`explorer`、`researcher`、`reviewer`、`implementer`、`tester`
- user/project markdown agent 定义（简单 frontmatter）
- foreground 单次子代理执行
- 子代理递归保护：`subagents.maxDepth = 1`
- bundled readonly web tools：`web_search`、`fetch_content`、`get_search_content`
- LSP tool：definitions、references、hover、signature、symbols、diagnostics、workspace diagnostics、servers
- 可选的子代理 readonly LSP：通过 `subagents.allowLspTools` 和 `subagents.allowedLspActions` 控制
- developer commands：doctor、list、logs、activity
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
- LSP hook / 自动 diagnostics（Phase 3 暂不启用）
- 子代理中的 privileged LSP actions：`rename`、`codeAction`、`restart`

## 设计边界

1. 主代理是唯一 orchestrator。
2. 子代理不能调度其他子代理。
3. 默认 readonly；写能力必须显式配置。
4. LSP readonly actions 可作为 read/grep/find 的渐进增强。
5. `rename`、`codeAction`、`restart` 默认禁用，且在子代理进程中始终禁用。
6. 各模块必须可独立启停。

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
