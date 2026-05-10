---
status: accepted
audience: maintainer
last_verified: 2026-05-08
---

# ADR 0002：MVP 边界决策

## 状态

Accepted

## 背景

在开始简化改造前，需要明确 MVP 的边界决策，避免改造过程中反复讨论范围。

## 决策

### 1. user/project 自定义 agents

**保留简单 markdown agents，不保留 management/overrides/chains。**

自定义 agents 是轻量 subagents 的核心扩展点，值得保留。但 management（create/update/delete）、settings overrides、chains、packaged agents 太复杂，MVP 不保留。

### 2. `/subagents` 命令

**第一版不保留。**

主入口是 LLM tool `subagent({ agent, task })`。slash 命令会牵出 slash bridge、live state、TUI 渲染等复杂能力，与简化目标冲突。后续如需恢复，只加一个极简命令用于列出 agents。

### 3. `bash` 在 readonly agents 中

**默认不允许。**

readonly agents 只允许安全工具：`read, grep, find, ls`。researcher 可额外允许 `web_search, fetch_content, get_search_content`。

`bash` 无法技术上保证只读。即使 prompt 写了 "read-only inspection commands"，模型仍可能执行写文件或修改系统的命令。因此 MVP 不在 readonly agents 中开放 `bash`。如未来需要恢复该能力，必须新增 ADR 并引入显式配置。

### 4. `skills` 目录

**第一版不保留或不注册。**

当前 `skills/pi-subagents` 包含旧复杂编排能力说明，会把模型引向多代理 workflow、slash、chain、parallel、子代理调度，与简化目标冲突。package.json 中移除 `pi.skills` 和 `skills/**/*`。

### 5. session 文件

**保留最小 child session file，不做复杂管理。**

session 文件对调试和失败排查有帮助，保留。但不做 artifact tree、metadata、progress file、async result file、session sharing、resume、watcher、cleanup manager。

### 6. `implementer` / `tester` 写文件

**第一版不允许，两者均 readonly。**

- `implementer`：返回 patch plan / implementation plan / exact files to change
- `tester`：返回 test plan / suggested tests / test commands / optional test code snippets

避免主代理和子代理同时写文件导致责任不清。MVP 不做 worktree 隔离、diff 合并、冲突处理、rollback。后续可通过 `allowWriteSubagents: true` 显式开启。

## 影响

这些决策确保 MVP 形态为：

```text
一个 subagent 工具
+ 5 个内置 readonly agents
+ 简单 markdown 自定义 agents
+ foreground single execution
+ depth = 1
+ 最小 child session file
+ 简单 config / result schema
```

后续恢复任何能力，必须新增 ADR 并说明收益大于复杂度成本。
