---
status: current
audience: user
last_verified: 2026-05-08
---

# Agent 定义格式

Agent 使用 markdown frontmatter + prompt 正文定义。

## frontmatter 格式

当前 parser 只支持简单 `key: value`，不是完整 YAML parser。列表字段使用逗号分隔。

## 示例

```md
---
name: explorer
description: Read-only codebase navigator.
readonly: true
tools: read, grep, find, ls
---

You are the explorer subagent.

Your job:
- Find relevant files.
- Trace code paths.
- Summarize where logic lives.
- Do not modify files.
```

## 必需字段

- `name`：agent 名称，必须唯一
- `description`：agent 描述

## 可选字段

- `readonly`：是否只读（第一版所有 agents 默认 `true`）
- `tools`：允许使用的工具，逗号分隔

## 5 个内置 agents

| Agent | 职责 | 默认工具 |
|---|---|---|
| `explorer` | 搜索代码、定位文件、梳理调用链 | `read, grep, find, ls` |
| `researcher` | 文档/API/外部资料研究 | `web_search, fetch_content, get_search_content` |
| `reviewer` | 架构、代码、方案审查 | `read, grep, find, ls` |
| `implementer` | 返回 patch plan 或 implementation plan（不直接写文件） | `read, grep, find, ls` |
| `tester` | 返回 test plan 或测试建议（不直接写文件） | `read, grep, find, ls` |

## 自定义 agents

支持 user/project 自定义 markdown agents。放在以下目录即可被发现：

- 用户级：`~/.pi/agent/agents/`
- 项目级：`.agents/` 或 `.pi/agents/`

自定义 agents 同样使用简单 frontmatter，支持 `name`、`description`、`readonly`、`tools`。

### Web tools

`web_search`、`fetch_content`、`get_search_content` 是本扩展内置的极简 readonly web tools。它们会在主代理进程和子代理进程中注册；子代理进程不会注册 `subagent` 工具。

内置 `researcher` 默认使用这些工具。自定义 readonly agent 也可以在 `tools` 中显式声明它们，例如：

```md
---
name: docs-researcher
description: Project documentation researcher.
readonly: true
tools: web_search, fetch_content, get_search_content
---

You research external documentation and report concise findings.
```

注意：这些工具只覆盖基础网页搜索和 HTTP/HTTPS HTML/text 抓取，不包含完整 `pi-web-access` 的视频、PDF、GitHub clone、browser cookie 或 curator UI 能力。

不支持：chains、overrides、management actions、packaged agents。

## 子代理边界

每个 agent prompt 都应说明：

- 自己是 child subagent，不是主代理
- 只处理被委托任务
- 不调用或建议额外 subagents
- 不扩大任务范围
- 信息不足时明确说明 uncertainty 或 blocked reason
