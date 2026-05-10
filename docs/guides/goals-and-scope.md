---
status: current
audience: all
last_verified: 2026-05-08
---

# 目标与范围

## 项目目标

将 `pi-subagents` 简化为一个面向 pi 的轻量扩展：

```text
1 个主代理
+ 1 个 subagent 工具
+ 5 个内置子代理
+ foreground 单次执行
+ max depth = 1
```

目标不是完整多代理框架，而是让主代理可以在需要时委托一个专职子代理完成聚焦任务。

## MVP 包含

- 注册 `subagent` 工具
- 支持参数：`agent`、`task`
- 支持 5 个内置 agents：`explorer`、`researcher`、`reviewer`、`implementer`、`tester`
- 支持 markdown frontmatter agent 定义（简单 `key: value` 格式，逗号分隔 tools）
- 支持 user/project 自定义 markdown agents（仅保留简单 frontmatter，不含 management/overrides/chains）
- foreground 同步执行
- 递归保护：子代理不能再调子代理（`maxSubagentDepth = 1`）
- 所有 agents 默认 readonly
- 最小 child session file（用于调试和排查，不做复杂 artifact/session 管理）
- 简单配置、简单错误处理、简单结果返回

## MVP 不包含

- background/async jobs
- chain workflow
- parallel execution
- intercom
- worktree 管理
- TUI widget
- slash bridge（`/subagents` 命令）
- skills 目录 / skills 注入
- complex artifact system
- fallback model chain
- 多代理编排引擎
- agent management actions（create/update/delete）
- bash 工具在 readonly agents 中
- implementer / tester 写文件能力

## MVP 边界决策

### 1. user/project 自定义 agents

保留简单 markdown agents，但不保留 management/overrides/chains/packaged agents。

自定义 agent 示例：

```md
---
name: custom-reviewer
description: Project-specific reviewer.
readonly: true
tools: read, grep, find, ls
---

You are a custom review subagent.
```

### 2. `/subagents` 命令

第一版不保留。主入口是 LLM tool `subagent({ agent, task })`。slash 命令会牵出 slash bridge、live state、TUI 渲染等复杂能力，与简化目标冲突。

### 3. `bash` 在 readonly agents 中

默认不允许。readonly agents 只允许安全工具：`read, grep, find, ls`。researcher 可额外允许：`web_search, fetch_content, get_search_content`。

`bash` 无法技术上保证只读，模型仍可能执行写文件或修改系统的命令。因此 readonly agents 中不开放 `bash`。如未来需要恢复该能力，必须新增 ADR 并引入显式配置。

### 4. `skills` 目录

第一版不保留或不注册。当前 `skills/pi-subagents` 包含旧复杂编排能力说明，会把模型引向多代理 workflow。package.json 中移除 `pi.skills` 和 `skills/**/*`。

### 5. session 文件

保留最小 child session file，但不做复杂管理。不保留 artifact tree、metadata、progress file、async result file、session sharing、resume、watcher、cleanup manager。

### 6. `implementer` / `tester` 写文件

第一版不允许。两者均 readonly。

- `implementer`：返回 patch plan / implementation plan / exact files to change
- `tester`：返回 test plan / suggested tests / test commands / optional test code snippets

后续可通过 `allowWriteSubagents: true` 显式开启。
