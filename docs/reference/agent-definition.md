---
status: current
audience: user
last_verified: 2026-05-11
---

# Agent Definition Reference

Agent 使用 markdown frontmatter + prompt 正文定义。Subagents 总览见 [`subagents.md`](./subagents.md)，调用入口见 [`subagent-tool.md`](./subagent-tool.md)，执行结果结构见 [`result-schema.md`](./result-schema.md)。

## Discovery paths

当前会发现三类 agents：

| Source | Path | 说明 |
|---|---|---|
| builtin | 仓库 `agents/` | devkit-pi 内置 5 个 agents |
| user | `~/.pi/agent/agents/` | 用户级自定义 agents |
| project | 从 cwd 向上查找 `.pi/agents/` 或 `.agents/` | 项目级自定义 agents |

同名去重优先级：

```text
project > user > builtin
```

## File format

支持 `.md` 和 `.markdown` 文件。

当前 parser 只支持简单 frontmatter，不是完整 YAML parser：

- 文件必须以 `---` 开头才会解析 frontmatter。
- 结束标记是下一段 `---`。
- 每行匹配 `key: value`。
- key 支持 word/hyphen：`[\w-]+`。
- value 会 trim；成对单引号或双引号会被去掉。
- 不支持 YAML list、嵌套对象、多行字符串或复杂类型。

## Supported frontmatter fields

| Field | Required | Type in file | Behavior |
|---|---:|---|---|
| `name` | 是 | string | agent 名称；缺失则该文件不会被加载 |
| `description` | 否 | string | agent 描述；缺失时为空字符串 |
| `readonly` | 否 | string | 只有 `true` 或 `1` 会解析为 true；否则 false |
| `tools` | 否 | comma-separated string | 逗号分隔工具名，trim 后去空 |
| `model` | 否 | string | 传给 child pi 的 `--model` |

Prompt 正文作为 agent 的 `systemPrompt`。如果正文为空，执行时会回退使用 description 或默认角色文本。

## Unsupported fields

以下字段当前没有特殊语义，不应写入 public 文档为已实现功能：

```text
package, inheritSkills, defaultContext, tags, routingHints, disabled,
permissions, temperature, maxTokens, provider, tools as YAML list
```

其中 `disabled` 当前不被解析；没有 per-agent disable public config。

## Built-in agents

| Agent | Description | Readonly | Tools | Source |
|---|---|---:|---|---|
| `explorer` | Read-only codebase navigator — finds files, patterns, and architecture | true | `read, grep, find, ls, lsp` | `agents/explorer.md` |
| `researcher` | Read-only web researcher — searches and synthesizes information | true | `web_search, fetch_content, get_search_content` | `agents/researcher.md` |
| `reviewer` | Read-only code reviewer — inspects diffs, plans, and codebase health | true | `read, grep, find, ls, lsp` | `agents/reviewer.md` |
| `implementer` | Read-only implementation planner — creates detailed, actionable implementation plans | true | `read, grep, find, ls, lsp` | `agents/implementer.md` |
| `tester` | Read-only test planner — analyzes requirements and designs comprehensive test strategies | true | `read, grep, find, ls, lsp` | `agents/tester.md` |

## Custom agent example

```md
---
name: api-reviewer
description: Project-specific API reviewer
readonly: true
tools: read, grep, find, ls, lsp
---

You are a project-specific API review subagent.

Only handle the delegated task. Do not call other subagents.
Use the available readonly tools to inspect API code and report findings with file paths.
If evidence is insufficient, report uncertainty.
```

Web researcher example：

```md
---
name: docs-researcher
description: External documentation researcher
readonly: true
tools: web_search, fetch_content, get_search_content
---

You research external documentation and return concise findings with source URLs.
Do not write files. Do not call other subagents.
```

## Naming recommendations

推荐：

- 使用小写短横线：`api-reviewer`、`docs-researcher`。
- 避免覆盖 builtin agent 名称，除非确实想在 project/user scope 替换它。
- description 简短说明用途，方便 `/toolkit agents` 展示。
- readonly agent 只声明只读 tools。
- prompt 中明确任务边界、不可调用 subagents、不确定时如何汇报。

## Tool filtering and readonly behavior

执行时，`filterToolsForReadonly()` 会基于 agent 的 `readonly` 与 `subagents.allowWrite` 过滤 tools：

- readonly agent：只保留 readonly tools。
- non-readonly agent 且 `subagents.allowWrite=false`：仍只保留 readonly tools。
- non-readonly agent 且 `subagents.allowWrite=true`：保留 agent 声明的 tools。

Readonly tools 当前包括：

```text
read, grep, find, ls, web_search, fetch_content, get_search_content
```

`lsp` 只有在 `subagents.allowLspTools=true` 且 `subagents.allowedLspActions` 非空时保留。子代理中 LSP privileged actions 始终禁用。

可写自定义 subagents 目前属于实验性能力。默认且推荐的模式是 readonly。`subagents.allowWrite=true` 只表示放宽委派策略，不代表已经具备完整权限沙箱、审计日志、自动回滚机制或稳定的写入能力契约。仅建议在可信仓库中使用，并且必须人工 review 所有变更。

对于自定义 agent：

- 子代理的实际工具可用性取决于 child pi runtime、当前工具注册、执行环境和配置。
- 不要把 `readonly: false` 或 `allowWrite=true` 理解为稳定、可控、可审计的工具权限模型。
- 文件写入、命令执行、修改项目等 write-like 行为不应被视为默认安全能力。
- 当前没有稳定的自动回滚保证；启用可写行为时应使用 Git diff、人工 review 和测试命令兜底。

## Invalid definitions

以下情况会导致 agent 文件被跳过或能力不符合预期：

- 缺少 `name`：文件不会被加载。
- frontmatter 不是简单 `key: value`：无法解析为预期字段。
- `tools` 使用 YAML list：不会按列表解析。
- 声明不存在的工具：工具名会被传入 child pi，但是否可用取决于 pi runtime；devkit-pi 不会在 discovery 阶段校验每个工具是否存在。
- `readonly` 写成 `yes` / `True`：不会解析为 true；只有 `true` 或 `1` 生效。

## Source map

| Topic | Source |
|---|---|
| Agent discovery | `src/modules/subagents/agents.ts` |
| Frontmatter parser | `src/modules/subagents/frontmatter.ts` |
| Tool filtering | `src/modules/subagents/executor.ts` |
| Built-in agents | `agents/*.md` |
| Tests | `tests/subagents/agents.test.ts`, `tests/subagents/frontmatter.test.ts` |
