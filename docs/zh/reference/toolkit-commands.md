---
status: current
audience: user
last_verified: 2026-05-12
---

# Toolkit Commands 参考

本文档是 devkit-pi `/toolkit` developer command 的 public reference。配置默认值以 [`configuration.md`](./configuration.md) 为准；Subagents 行为见 [`subagents.md`](./subagents.md)，Web tools 见 [`web-tools.md`](./web-tools.md)，LSP tools 见 [`lsp-tools.md`](./lsp-tools.md)；命令注册以 `src/modules/commands/register.ts` 为准。

## 概述

`/toolkit` 是 devkit-pi 注册给 pi 的统一 slash command，用于查看模块状态、运行诊断、列出 agents、查看 Web 活动日志、查看 LSP 配置以及打开活动面板。

它和 tools 的区别：

- tools（例如 `subagent`、`web_search`、`fetch_content`、`lsp`）主要供 agent 在任务执行中调用，并返回 tool result。
- `/toolkit` commands 主要供用户手动触发，输出到 console 或打开 TUI 面板，并通过 UI notification 提示执行结果。
- `/toolkit` commands 不替代 Web/LSP/subagent tools；它们是状态查看、调试和诊断入口。

典型使用者：

- 用户手动查看 devkit-pi 当前状态
- 开发者调试配置、agent 发现和 Web provider 可用性
- agent 工作流诊断，例如确认 LSP hook 是否启用
- release 前快速检查模块启用状态与基本环境

`/toolkit` 只在主代理进程注册；子代理进程不会注册该命令。

## 公开命令接口

当前真实注册的 root command 只有一个：

```text
/toolkit [subcommand] [args]
```

当前公开 subcommands：

```text
doctor, modules, logs, agents, lsp, activity, help
```

没有独立的 `/toolkit web`、`/toolkit config`、`/toolkit restart` 或 `/toolkit subagents` 命令。Web 能力主要通过 Web tools 暴露，LSP restart 通过 `lsp` tool 的 privileged `restart` action 暴露，而不是 `/toolkit lsp` 命令。

## 命令列表

| 命令 | 用途 | 主要输出 | 源码 |
|---|---|---|---|
| `/toolkit` | 无参数时显示 help | usage text | `src/modules/commands/register.ts` |
| `/toolkit help` | 显示 help | usage text | `src/modules/commands/register.ts` |
| `/toolkit doctor` | 运行统一诊断检查 | doctor report + UI notification | `src/modules/subagents/commands/doctor.ts` |
| `/toolkit modules` | 查看模块启用状态 | modules overview + UI notification | `src/modules/commands/register.ts` |
| `/toolkit logs [--search|--fetch] [--limit N]` | 查看近期 Web 活动日志 | activity log + stats + UI notification | `src/modules/subagents/commands/logs.ts` |
| `/toolkit agents` | 列出 builtin/user/project agents | agent list + UI notification | `src/modules/subagents/commands/list.ts` |
| `/toolkit lsp` | 查看 LSP tool/hook 配置 | LSP overview + UI notification | `src/modules/commands/register.ts` |
| `/toolkit activity` | 打开 Web activity TUI 面板 | interactive panel + close notification | `src/modules/subagents/commands/activity.ts` |

未知 subcommand 当前会显示 help，不会抛出命令错误。

## 通用命令

### `/toolkit` / `/toolkit help`

| 项 | 说明 |
|---|---|
| Syntax | `/toolkit` 或 `/toolkit help` |
| Arguments / flags | 无 |
| 用途 | 查看当前支持的 `/toolkit` subcommands |
| 输出 | console 输出 usage text |
| 成功语义 | 打印 help 文本 |
| 失败语义 | 当前无专门失败分支；未知 subcommand 也回落到 help |
| 相关配置 | `commands.enabled` |
| 相关源码 | `src/modules/commands/register.ts` |

示例：

```text
/toolkit help
```

输出包含：

```text
devkit-pi toolkit command
=
Usage:
  /toolkit doctor     Run unified diagnostics checks
  /toolkit modules    Show module enablement status
  /toolkit logs       Show recent web activity logs
  /toolkit agents     List builtin/user/project agents
  /toolkit lsp        Show LSP tool/hook configuration
  /toolkit activity   Open activity panel
  /toolkit help       Show this help
```

### `/toolkit modules`

| 项 | 说明 |
|---|---|
| Syntax | `/toolkit modules` |
| Arguments / flags | 无 |
| 用途 | 查看 devkit-pi 各模块是否启用 |
| 输出 | console 输出模块概览，UI notification 显示 `Module status printed to console` |
| 成功语义 | 打印当前 resolved config 中的模块状态 |
| 失败语义 | handler 捕获异常并通过 UI notification 显示 `Toolkit command failed: ...` |
| 相关配置 | `enabled`、`subagents.enabled`、`web.enabled`、`lsp.*`、`commands.enabled` |
| 相关源码 | `src/modules/commands/register.ts` |

示例：

```text
/toolkit modules
```

输出形状：

```text
devkit-pi modules
=
subagents: enabled
web:       enabled
lsp:       enabled (tool=on, hook=agent_end)
commands:  enabled
```

## Subagents 命令

本节的命令实现位于 `src/modules/subagents/commands/`，但它们当前不是 `/subagents ...` root command，而是由统一 `/toolkit` 命令调用。

### `/toolkit doctor`

| 项 | 说明 |
|---|---|
| Syntax | `/toolkit doctor` |
| Arguments / flags | 无 |
| 用途 | 运行统一诊断检查 |
| 输出 | console 输出 box-drawing doctor report；UI notification 显示 pass/warn/fail summary |
| 成功语义 | 完成检查并打印 report；report item 可为 `pass`、`warn`、`fail`、`info` |
| 失败语义 | 单项检查失败通常记录为 report item；handler 外层异常通过 UI notification 显示 `Toolkit command failed: ...` |
| 相关配置 | 全局 config、web provider config、LSP config |
| 相关源码 | `src/modules/subagents/commands/doctor.ts` |

检查类别以源码为准，当前包括：

- `config`：配置文件是否存在、是否可解析
- `agents`：builtin/user/project agent 发现情况
- `provider`：Web search providers 的启用、API key 与 availability
- `permissions`：结果目录是否可写
- `web-tools`：Web tools 是否启用，以及 provider/debug 摘要
- `lsp`：LSP 模块、tool、hook 状态

是否读写文件：

- 会读取配置文件和 agent 定义目录。
- 会在 results 目录创建并删除一个临时测试文件以检查写权限。
- 不会启动子代理。
- 不会调用 Web search tool 执行真实搜索；provider availability 由 config enabled gate 和 provider adapter 的 `isAvailable()` 技术检查共同决定。
- 不直接启动 LSP tool action。

什么时候使用：

- 安装后检查 devkit-pi 基本状态
- 修改配置后确认模块启用状态
- release 或本地开发前做 smoke check

示例：

```text
/toolkit doctor
```

### `/toolkit agents`

| 项 | 说明 |
|---|---|
| Syntax | `/toolkit agents` |
| Arguments / flags | 无 |
| 用途 | 列出当前发现的 builtin/user/project agents |
| 输出 | console 输出 agent list；UI notification 显示 `Found N agents` |
| 成功语义 | 按 source 分组打印 agents |
| 失败语义 | agent discovery 异常由外层 handler 捕获并通知 |
| 相关配置 | `subagents.enabled` 不影响此命令注册；命令读取当前 cwd 下的 project agents 与用户 agents |
| 相关源码 | `src/modules/subagents/commands/list.ts` |

输出包含：

- 总数：`Available Agents (N)`
- `[builtin]`、`[user]`、`[project]` 分组
- 每个 agent 的 name、description 摘要、`readonly` / `read/write` 标记
- `subagent({ agent: "explorer", task: "..." })` 使用提示

是否读写文件：

- 会读取 builtin/user/project agent markdown 文件。
- 不写文件。
- 不启动子代理。
- 只是诊断/查看命令。

示例：

```text
/toolkit agents
```

内部存在 `formatAgentListJson()` helper，但当前 `/toolkit agents` 命令没有公开 `--json` flag；不要把它当作 public command 输出格式。

### `/toolkit logs`

| 项 | 说明 |
|---|---|
| Syntax | `/toolkit logs [--search|--fetch] [--limit N]` |
| Arguments / flags | `--search`、`--fetch`、`--limit N` |
| 用途 | 查看近期 Web activity log 和统计信息 |
| 输出 | console 输出 recent activity 与 statistics；UI notification 显示 `Activity logs printed to console` |
| 成功语义 | 打印当前进程内 Web activity log；无日志时显示 `(no recent activity)` |
| 失败语义 | handler 捕获异常并通过 UI notification 显示失败 |
| 相关配置 | Web tools 是否启用会影响是否产生日志；命令本身受 `commands.enabled` 控制 |
| 相关源码 | `src/modules/subagents/commands/logs.ts`, `src/modules/web/observability.ts` |

参数行为：

- `--search`：只显示 `type === "search"` 的 activity entries。
- `--fetch`：只显示 `type === "fetch"` 的 activity entries。
- 同时出现时，源码优先处理 `--search`。
- `--limit N`：读取匹配正则 `--limit\s+(\d+)` 的正整数；未提供时默认 20。

输出包含：

- Recent Activity 列表
- timestamp
- activity type：`web_search`、`fetch`、`get_content`
- provider（如存在）
- status：success / rate_limited / error / pending
- duration（如存在）
- Statistics：total、success、errors、rate limited、average latency、provider stats

是否读写文件：

- 读取内存中的 Web observability log/stats。
- 不写文件。
- 不发起 Web 请求。
- 不启动子代理。

示例：

```text
/toolkit logs
/toolkit logs --search --limit 10
/toolkit logs --fetch
```

内部存在 `formatLogsJson()` helper，但当前 `/toolkit logs` 命令没有公开 `--json` flag；不要把它当作 public command 输出格式。

### `/toolkit activity`

| 项 | 说明 |
|---|---|
| Syntax | `/toolkit activity` |
| Arguments / flags | 无 |
| 用途 | 打开交互式 Web Tool Activity TUI 面板 |
| 输出 | TUI custom panel；关闭后 UI notification 显示 `Activity panel closed` |
| 成功语义 | 打开面板，用户关闭后返回 |
| 失败语义 | TUI custom panel 抛错时由外层 handler 捕获并通知 |
| 相关配置 | Web observability 数据来自 Web tools；命令本身受 `commands.enabled` 控制 |
| 相关源码 | `src/modules/subagents/commands/activity.ts` |

面板内容：

- Web tool activity entries
- total/success/errors/rate/avg stats
- selected entry 摘要
- help bar

键盘操作以源码为准：

- `↑` / `↓`：移动选择
- page up / page down：翻页
- home / end：跳转
- `r`：刷新
- `c`：清空 activity log
- `s`：重置 stats
- escape / ctrl+c：关闭面板

是否读写文件：

- 读取和修改内存中的 Web activity log/stats。
- 不写项目文件。
- 不发起 Web 请求。
- 不启动子代理。

示例：

```text
/toolkit activity
```

## LSP 命令

### `/toolkit lsp`

| 项 | 说明 |
|---|---|
| Syntax | `/toolkit lsp` |
| Arguments / flags | 无 |
| 用途 | 查看当前 LSP 模块配置摘要 |
| 输出 | console 输出 LSP overview；UI notification 显示 `LSP module status printed to console` |
| 成功语义 | 打印 resolved config 中 LSP tool/hook 状态与 action 列表 |
| 失败语义 | handler 捕获异常并通过 UI notification 显示失败 |
| 相关配置 | `lsp.enabled`、`lsp.tool.enabled`、`lsp.tool.allowMutatingActions`、`lsp.hook.*`、默认子代理 readonly LSP actions |
| 相关源码 | `src/modules/commands/register.ts`, `src/modules/lsp/schemas.ts` |

`/toolkit lsp` 和 `lsp` tool 的区别：

- `/toolkit lsp` 只查看配置和 action 列表。
- `lsp` tool 才执行 definition、references、diagnostics、restart 等 LSP actions。
- `/toolkit lsp` 不启动 language server，不执行 diagnostics，不管理 server lifecycle。
- `/toolkit lsp` 不支持 restart；restart 是 `lsp` tool 的 privileged action，且默认禁用。
- `/toolkit lsp` 会显示 diagnostics hook 配置，但不会触发 hook。

更多 LSP tool 行为见 [`lsp-tools.md`](./lsp-tools.md)。

示例：

```text
/toolkit lsp
```

输出形状：

```text
LSP module
=
enabled: true
tool.enabled: true
tool.allowMutatingActions: false
hook.enabled: true
hook.mode: agent_end
tool.actions: definition, references, hover, symbols, diagnostics, workspace-diagnostics, signature, rename, codeAction, restart, servers
subagent.readonlyActions(default): definition, references, hover, signature, symbols, diagnostics, workspace-diagnostics, servers
```

## Web 命令

当前不存在独立 `/toolkit web` 命令，也不存在 `/toolkit providers` 命令。

Web 相关公开能力主要通过 tools 暴露：

- `web_search`
- `fetch_content`
- `get_search_content`

`/toolkit` 中和 Web 相关的命令是：

- `/toolkit logs`：查看 Web observability activity log 和 stats
- `/toolkit activity`：打开 Web Tool Activity 面板
- `/toolkit doctor`：检查 Web tools enabled 状态和 provider availability
- `/toolkit modules`：显示 web module enabled/disabled

Web tools API 见 [`web-tools.md`](./web-tools.md)，provider 见 [`web-providers.md`](./web-providers.md)，错误码见 [`web-tools-error-codes.md`](./web-tools-error-codes.md)。

## 输出与错误语义

### 输出

`/toolkit` commands 的输出主要面向人读：

- 大多数 subcommands 通过 `console.log()` 打印文本报告。
- 同时通过 `ctx.ui.notify()` 给出简短通知。
- `/toolkit activity` 打开 TUI custom panel。
- 当前公开命令没有 `--json` flag。

源码中存在某些 JSON formatter helper，例如 `formatAgentListJson()` 和 `formatLogsJson()`，但当前没有通过 `/toolkit` command 暴露为 public CLI 参数。

### 错误

`/toolkit` 命令当前没有独立统一错误码体系。handler 外层捕获异常后通过 UI notification 显示：

```text
Toolkit command failed: <message>
```

命令内部的诊断状态不等于命令失败：

- `/toolkit doctor` report 中的 `warn` / `fail` 是诊断结果，不是 slash command 失败。
- `/toolkit logs` 中的 Web activity error 是历史 Web tool activity，不是命令失败。
- `/toolkit lsp` 只显示配置，不返回 LSP diagnostics，也不代表 LSP tool 调用成功/失败。

不要把 `/toolkit` failure 误写成 `WebToolError`，也不要把 LSP diagnostics 误写成命令失败。

## 配置链接

完整配置见 [`configuration.md`](./configuration.md)。相关配置：

| 配置 | 影响 |
|---|---|
| `commands.enabled` | 是否注册 `/toolkit` 命令；子代理进程始终不注册 |
| `subagents.*` | `/toolkit doctor` 和 `/toolkit agents` 展示/诊断 subagent 相关状态 |
| `web.*` | `/toolkit doctor` provider/web checks、`logs`/`activity` 的数据来源 |
| `lsp.*` | `/toolkit modules`、`/toolkit lsp`、`/toolkit doctor` 的 LSP 状态 |

相关 reference：

- [Configuration reference](./configuration.md)
- [Subagents reference](./subagents.md)
- [LSP tools reference](./lsp-tools.md)
- [Web tools reference](./web-tools.md)
- [Web providers reference](./web-providers.md)
- [Web tools error codes](./web-tools-error-codes.md)

## 稳定性说明

Public contract：

- Root command：`/toolkit`
- 当前 subcommands：`doctor`、`modules`、`logs`、`agents`、`lsp`、`activity`、`help`
- `logs` 当前公开 flags：`--search`、`--fetch`、`--limit N`
- `commands.enabled` 配置开关
- 子代理进程不注册 `/toolkit`

Developer convenience / 可能调整：

- 人类可读文本格式、box drawing、列宽、通知文案
- activity panel 的 UI 布局和快捷键细节
- doctor report 的具体检查项和提示文本
- logs 的展示列和 status 文案

不建议外部脚本强依赖 `/toolkit` 的人类可读输出格式。若未来需要稳定机器可解析输出，应先在源码中正式暴露相应参数并补充测试。

## Source map

| 主题 | 源码 |
|---|---|
| Root command registration | `src/modules/commands/register.ts` |
| Modules overview / LSP overview / help | `src/modules/commands/register.ts` |
| Subagent command helpers | `src/modules/subagents/commands/` |
| Doctor checks | `src/modules/subagents/commands/doctor.ts` |
| Agent list | `src/modules/subagents/commands/list.ts` |
| Activity logs formatting | `src/modules/subagents/commands/logs.ts` |
| Activity panel | `src/modules/subagents/commands/activity.ts` |
| Subagent registration/tool | `src/modules/subagents/register.ts` |
| LSP registration/tool/hook | `src/modules/lsp/register.ts`, `src/modules/lsp/tool.ts`, `src/modules/lsp/hook.ts` |
| LSP schemas/actions | `src/modules/lsp/schemas.ts` |
| Web registration/tools | `src/modules/web/register.ts` |
| Web schemas | `src/modules/web/schemas.ts` |
| Web observability logs/stats | `src/modules/web/observability.ts` |
| Command tests | `tests/commands/` |
| Subagent command tests | `tests/subagents/commands/` |
| LSP tests | `tests/lsp/` |
| Web tests | `tests/web/` |
