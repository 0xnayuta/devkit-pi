---
status: current
audience: user
last_verified: 2026-05-12
language: chinese
---

# Subagents 参考

本文档是 devkit-pi Subagents 模块的 public overview/reference。`subagent` tool 的参数与返回见 [`subagent-tool.md`](./subagent-tool.md)，agent 文件格式见 [`agent-definition.md`](./agent-definition.md)，结果结构见 [`result-schema.md`](./result-schema.md)。

## 概述

Subagents 模块让主代理把一个聚焦任务委派给一个专职 child pi session。它不是完整多代理框架；当前只支持 foreground、single subagent execution，主代理仍是唯一 orchestrator。

适合使用的场景：

- 代码探索：查找文件、符号、调用链和架构位置
- 文档/外部资料研究：交给带 Web/convert tools 的 researcher
- 实现建议：生成 implementation plan，而不是直接写代码
- Review：隔离代码审查输出和证据收集
- Testing：生成测试策略、边界用例和覆盖建议
- 大输出隔离：子代理的中间 tool calls 和上下文不会直接塞入主代理推理流
- 上下文压缩：子代理返回聚焦摘要，主代理接收整理后的结果

和其他能力的区别：

- 普通 prompt：仍在主代理上下文中完成；subagent 会启动独立 child session。
- Web/convert tools：`web_search` / `fetch_content` / `convert_content` 是工具；researcher subagent 会使用它们做研究和文档转换。
- LSP tools：`lsp` 是代码智能工具；部分内置 subagents 可使用 readonly LSP actions。
- `/toolkit` commands：用户手动诊断/查看状态；不会替代 `subagent` tool。

## Public surface

| Surface | 用途 | Usage | 输出 | 限制 | 源码 |
|---|---|---|---|---|---|
| `subagent` tool | 委派一个聚焦任务给指定 agent | `subagent({ agent, task })` | pi tool result，`content` + `details` | 只支持单 agent foreground 执行；不支持 chain/parallel/background | `src/modules/subagents/register.ts` |
| Built-in agents | 5 个预置 readonly 专职 agents | `explorer` / `researcher` / `reviewer` / `implementer` / `tester` | agent prompt 与工具白名单 | prompt 文本可迭代；能力取决于可用 tools | `agents/*.md` |
| Custom agent definitions | user/project markdown agents | `~/.pi/agent/agents/`、`.pi/agents/`、`.agents/` | 被 discovery 合并进 agent list | 只支持简单 frontmatter；project > user > builtin 去重 | `src/modules/subagents/agents.ts`, `frontmatter.ts` |
| Delegation policy injection | 给主代理提示何时委派 | 默认 `subagents.injectDelegationPolicy=true` | system prompt 追加 policy/examples | 是提示策略，不是强制调度器 | `src/shared/delegation-policy.ts` |
| `/toolkit agents` | 查看已发现 agents | 手动运行 command | TUI report panel | 不启动子代理 | `src/modules/subagents/commands/list.ts` |
| `/toolkit doctor` | 诊断配置、agents、providers、权限、LSP 等 | 手动运行 command | doctor report | report fail/warn 是诊断项，不是 command failure | `src/modules/subagents/commands/doctor.ts` |
| `/toolkit logs` / `/toolkit activity` | 查看 toolkit activity logs/stats | 手动运行 command | text log / TUI panel | 主要面向 Web/convert tool observability，不是 subagent execution log | `src/modules/subagents/commands/logs.ts`, `activity.ts` |
| Output collection | 从 child pi JSONL/stdout 收集最终结果、usage、错误 | 自动内部执行 | `details.results[]`、`content[0].text` | 内部 helper，高频 streaming events 作为 transient 不持久化 | `src/modules/subagents/collect-output.ts`, `execution.ts`, `child-event-filter.ts` |

## 内置 agents

内置 agents 来自仓库 `agents/` 目录。它们都声明 `readonly: true`，当前设计为只读分析/规划/研究，不写文件。

| Agent | 角色/用途 | 预期用例 | 声明的 Tools | 源码 |
|---|---|---|---|---|
| `explorer` | Read-only codebase navigator | 查找文件、模式、定义、引用、架构位置 | `read, grep, find, ls, lsp` | `agents/explorer.md` |
| `researcher` | Read-only web researcher | 外部文档/API/资料搜索、来源综合、文档转换 | `web_search, fetch_content, get_search_content, convert_content` | `agents/researcher.md` |
| `reviewer` | Read-only code reviewer | 审查代码、diff、方案、测试和文档 | `read, grep, find, ls, lsp` | `agents/reviewer.md` |
| `implementer` | Read-only implementation planner | 分析需求和代码结构，产出实现计划 | `read, grep, find, ls, lsp` | `agents/implementer.md` |
| `tester` | Read-only test planner | 设计测试策略、场景、边界和覆盖 | `read, grep, find, ls, lsp` | `agents/tester.md` |

注意：agent prompt 中的输出格式、工作规则和建议是行为引导，不应理解为强安全边界或协议保证。真实工具可用性还受配置、pi runtime、子代理进程环境和工具注册情况影响。

Routing hints 来自 delegation policy：

- `explorer`：定位、导航、搜索代码/文件
- `researcher`：外部资源/API/技术比较/资料综合
- `reviewer`：代码质量、风险、架构审查
- `implementer`：实现规划、方案设计
- `tester`：测试策略、边界用例、覆盖规划

## 自定义 agents

自定义 agent 使用 markdown frontmatter + prompt 正文。详细格式见 [`agent-definition.md`](./agent-definition.md)。

### Discovery paths

当前 discovery 会加载：

- 内置：仓库 `agents/`
- 用户：`~/.pi/agent/agents/`
- 项目：从当前 cwd 向上查找 `.pi/agents/` 或 `.agents/`

去重优先级：

```text
project > user > builtin
```

也就是说，project agent 可以覆盖同名 user/builtin agent，user agent 可以覆盖同名 builtin agent。

### 支持的 frontmatter 字段

当前 parser 是简单 `key: value` parser，不是完整 YAML parser。支持字段：

| 字段 | 必填 | 行为 |
|---|---:|---|
| `name` | 是 | agent 名称；缺失则该文件不会被加载 |
| `description` | 否 | 描述；缺失时为空字符串 |
| `readonly` | 否 | 只有字符串 `true` 或 `1` 会解析为 true；否则 false |
| `tools` | 否 | 逗号分隔工具名列表 |
| `model` | 否 | 传给 child pi 的 `--model` |

Prompt 正文作为 `systemPrompt`。若正文为空，使用 description；再为空则 child prompt 会回退到默认角色文本。

不支持或不会产生特殊行为的字段：

- `package`
- `inheritSkills`
- `defaultContext`
- `tags`
- `routingHints`
- `disabled`
- `permissions`
- `tools` 的 YAML list 语法

### 示例

```md
---
name: docs-researcher
description: Project documentation researcher
readonly: true
tools: web_search, fetch_content, get_search_content, convert_content
---

You research external documentation and return concise findings.
Focus only on the delegated task. Do not call other subagents.
```

推荐：

- 使用小写、短横线命名，例如 `api-reviewer`。
- 明确写出"只处理 delegated task"。
- 明确写出"不调用额外 subagents"。
- 明确不确定时如何报告 uncertainty。
- readonly agent 只声明只读 tools。

## Delegation 行为

当前调用链：

```text
主代理调用 subagent({ agent, task })
  → 校验 depth/config/input
  → discoverAgents(cwd, "both")
  → 选择 agent 定义
  → filterToolsForReadonly(agent, config)
  → buildChildPrompt(...)
  → buildSubagentChildArgs(...)
  → runSync() 启动 foreground child pi process
  → collectOutput() 收集 JSONL/stdout 最终 assistant 输出、usage、错误
  → sanitizeOutput() 脱敏
  → truncateOutput() 截断
  → 返回 content + details 给主代理
```

执行模式：

- foreground：父代理等待子代理完成。
- single：一次 tool call 只启动一个 child agent。
- depth guarded：默认 `maxDepth=1`，子代理进程不会注册 `subagent` tool，也被 prompt 要求不要再委派。
- child pi 使用 `--mode json`，写入独立 session file。
- 长 task 超过内部阈值时，会写入临时 task 文件并用 `@file` 传给 child pi。
- system prompt 会写入临时 prompt 文件，执行后 best-effort cleanup。

上下文继承：

- 当前 executor 调用 `buildChildPrompt()` 时 `parentMessages: []`，即不主动传递父会话消息列表。
- prompt-runtime 中存在用于 strip inherited context/skills 的内部逻辑，但这不是面向用户的 public API。
- 子代理接收的是 role prompt、tools 列表、delegated task 和边界指令。

输出隔离：

- 子代理中间 JSONL events、tool calls、usage 会被收集为 display/usage 信息。
- 主代理最终收到聚焦文本结果和 `details`，而不是完整 child session 上下文。
- session file 路径会记录在 result 中，便于调试。

## Readonly / write 边界

可写自定义 subagents 目前属于实验性能力。默认且推荐的模式是 readonly。`subagents.allowWrite=true` 只表示放宽委派策略，不代表已经具备完整权限沙箱、审计日志、自动回滚机制或稳定的写入能力契约。仅建议在可信仓库中使用，并且必须人工 review 所有变更。

当前边界以源码为准：

- 5 个内置 agents 都声明 `readonly: true`，且 prompt 明确要求不编辑、不写文件。
- `filterToolsForReadonly()` 会对 readonly agents 过滤工具，只保留只读工具集合：
  - `read`, `grep`, `find`, `ls`
  - `web_search`, `fetch_content`, `get_search_content`, `convert_content`
  - `lsp`（仅当 `subagents.allowLspTools=true` 且 `allowedLspActions` 非空）
- 对于 `readonly: false` 的自定义 agent：
  - 如果 `subagents.allowWrite=false`，仍会过滤到只读工具。
  - 如果 `subagents.allowWrite=true`，会保留 agent frontmatter 中声明的 tools。

重要说明：

- `subagents.allowWrite=true` 不意味着内置 agents 会自动写文件；内置 agents 仍是 readonly 定义，且不声明 `edit` / `write`。
- `allowWrite=true` 只影响非 readonly 自定义 agent 的工具过滤结果。
- 子代理的实际工具可用性取决于 child pi runtime、当前工具注册、执行环境和配置；不要假设未来所有工具都会自动继承给子代理。
- 主代理进程注册 `subagent` 和 `/toolkit`；子代理进程不注册 `subagent`，也不注册 `/toolkit`。
- LSP privileged actions 在子代理中始终禁用。
- Web 和 convert tools 可用于研究、读取信息，以及将受支持文档转换为 Markdown。
- 文件写入、命令执行、修改项目等 write-like 行为不应被视为默认安全能力。
- prompt/policy 是行为引导；真正的强约束主要来自工具过滤、子代理不注册 `subagent`、LSP privileged actions 在子代理中始终禁用等实现。

当前没有稳定的自动回滚保证。如果用户启用可写行为，应使用 Git 工作区、提交前 diff、人工 review 和测试命令兜底。

后续若要把 writable custom subagents 升级为正式支持，应至少补充：

1. `allowWrite=false` 时，write-like / privileged 能力被阻断或不暴露。
2. `allowWrite=true` 时，允许范围符合预期。
3. 子代理中 LSP privileged actions 仍然禁用。
4. 子代理不注册 `subagent`，避免递归委派。
5. 子代理不注册 `/toolkit`。
6. 自定义 agent 的 `readonly` frontmatter 与全局配置之间的优先级清晰。
7. 执行结果能记录足够信息供审计。
8. 失败时不会伪装为成功。

## Result schema 与输出收集

详细结构见 [`result-schema.md`](./result-schema.md)。当前 `subagent` tool 返回 pi tool result：

```ts
{
  content: Array<{ type: "text"; text: string }>;
  details: {
    mode: "single" | "management";
    runId?: string;
    results: Array<{
      agent: string;
      task: string;
      exitCode: number;
      usage: Usage;
      error?: string;
      sessionFile?: string;
      output?: string;
      displayItems?: Array<{ type: "text"; text: string } | { type: "toolCall"; name: string; args: Record<string, unknown> }>;
    }>;
    error?: {
      code: SubagentErrorCode;
      message: string;
    };
    streaming?: StreamingDisplay;
  };
}
```

语义：

- 成功执行：`exitCode === 0`，`details.results[0].output` 保存脱敏后的完整输出，`content[0].text` 可能是截断后的输出。
- 执行失败：`exitCode !== 0`，`details.error.code` 通常是 `SUBAGENT_FAILED` 或 `SUBAGENT_TIMEOUT`。
- 输出截断：执行可成功，但 `details.error.code` 可能是 `SUBAGENT_OUTPUT_TRUNCATED`。
- Streaming：执行中可能通过 `onUpdate` 返回 `details.streaming`，最终结果不保留 streaming 字段。
- `collectOutput()` 会从 child pi JSONL 中提取最终 assistant 文本、usage、provider/runtime error 和 partial output。
- `sanitizeOutput()` 会遮蔽常见 token、secret、用户路径和过长 stack trace。

日志/activity：

- `/toolkit logs` 与 `/toolkit activity` 当前展示 Web 与 convert 工具的 toolkit activity logs/stats，不是 subagent execution history。
- 子代理 session file 是调试线索，但不是稳定外部 API。

机器解析：

- `details` 的顶层形状可用于程序化判断，但人类可读 `content[0].text`、agent prompt 输出格式和 display rendering 可能变化。
- 外部脚本不应依赖完整自然语言输出格式。

## 与 Web / LSP / toolkit 的关系

### Web / convert tools

- Web 和 convert tools 在主代理和子代理进程中都可注册。
- 内置 `researcher` 默认声明 `web_search`、`fetch_content`、`get_search_content`、`convert_content`。
- 自定义 agent 也可以在 `tools` 中声明这些工具。
- Web tools 详情见 [`web-tools.md`](./web-tools.md)。convert tool 详情见 [`convert-tools.md`](./convert-tools.md)。

### LSP tools

- 内置 `explorer`、`reviewer`、`implementer`、`tester` 声明 `lsp`。
- 子代理能否使用 `lsp` 受 `subagents.allowLspTools` 和 `subagents.allowedLspActions` 影响。
- 子代理只允许 readonly-safe LSP actions；`rename`、`codeAction`、`restart` 在子代理进程中始终禁用。
- LSP 详情见 [`lsp-tools.md`](./lsp-tools.md)。

### `/toolkit` commands

- `/toolkit agents`：查看发现到的 agents。
- `/toolkit doctor`：诊断 agents、providers、权限、Web/LSP 状态。
- `/toolkit logs` / `/toolkit activity`：查看 toolkit activity logs/stats。
- `/toolkit` 只在主代理进程注册，子代理进程不注册。
- Commands 详情见 [`toolkit-commands.md`](./toolkit-commands.md)。

## 配置

完整配置见 [`configuration.md#subagents-配置`](./configuration.md#subagents-配置)。

默认配置摘要：

```json
{
  "subagents": {
    "enabled": true,
    "maxDepth": 1,
    "timeoutMs": 900000,
    "idleTimeoutMs": 180000,
    "allowWrite": false,
    "allowLspTools": true,
    "allowedLspActions": [
      "definition", "references", "hover", "signature",
      "symbols", "diagnostics", "workspace-diagnostics", "servers"
    ],
    "injectDelegationPolicy": true,
    "retry": {
      "enabled": true,
      "maxAttempts": 2
    }
  }
}
```

配置影响：

- `subagents.enabled=false`：`registerSubagentsModule()` 不注册 `subagent` tool。
- `subagents.maxDepth=1`：默认禁止 nested subagents。
- `subagents.timeoutMs`：单次 child execution 的最大总运行时长（hard cap），从子进程启动时开始计时，不会因子代理活动而重置。达到上限无论子代理是否活跃都会被终止。
- `subagents.idleTimeoutMs`：子代理自最后一次有效活动后的最大空闲时间。有效活动指结构化 JSONL 运行事件（如 `message_end`、`tool_result_end`、`turn_end`）；普通 stdout 文本和 `message_update` 等 transient streaming events 不会重置该计时器。超过上限但子代理仍有活跃输出则不会被终止。默认 180000ms。
- `subagents.allowWrite`：实验性/高级/不安全开关；只影响非 readonly 自定义 agent 的工具过滤，不改变内置 agents 的 readonly 定义，也不提供完整权限沙箱、审计日志、自动回滚或稳定写入能力契约。
- `subagents.allowLspTools` / `allowedLspActions`：控制子代理是否可用 readonly LSP actions。
- `subagents.injectDelegationPolicy`：控制是否向主代理 prompt 注入 delegation policy。
- `subagents.retry.*`：对子代理 transient failure 做有限重试。

Custom agents discovery 路径当前不是配置项，固定为 user/project 目录查找。

## 错误和失败语义

当前 subagent 错误码 canonical source 是 `src/shared/types.ts` 中的 `SUBAGENT_ERROR_CODES`。

| 错误码 | 当前语义 |
|---|---|
| `INVALID_INPUT` | 缺少 `agent` 或 `task` |
| `SUBAGENTS_DISABLED` | 子代理功能被配置禁用 |
| `UNKNOWN_AGENT` | 找不到指定 agent；返回可用 agent 名称 |
| `SUBAGENT_DISABLED` | 已定义但当前没有直接返回路径；保留给未来 per-agent disable 语义 |
| `SUBAGENT_DEPTH_EXCEEDED` | depth 超限；子代理不能继续调用子代理 |
| `SUBAGENT_TIMEOUT` | 执行超时；可能是 hard cap（`timeoutMs`）耗尽或 idle 超时（`idleTimeoutMs`）触发；可通过 `timeoutReason` 字段进一步区分 |
| `SUBAGENT_FAILED` | spawn、session directory、child process 或 provider/runtime failure 等未分类失败 |
| `SUBAGENT_OUTPUT_TRUNCATED` | 输出过长被截断；也用于 child stdout/stderr/JSONL 输出超过执行硬上限并被停止的情况 |

失败表现：

- invalid input / disabled / unknown agent / depth exceeded 通常以 `content[0].text` + `details.error` 返回，不一定抛出异常。
- spawn 失败会被包装为 `SUBAGENT_FAILED`。
- child 进程非 0 exit 会形成 failure summary，包含 exit code、error、partial output 和 session file。
- child stdout JSONL 处理不会持久化 `message_update`、`tool_execution_update` 等高频 streaming events；最终输出从 `message_end`、`turn_end` 以及 tool/error completion events 等生命周期/最终事件中收集。持久化 JSONL 和 transient/drop JSONL lines 使用分离的 hard limits。
- agent definition 解析失败或缺少 `name` 的文件会被静默跳过；`/toolkit doctor` 可能报告 user agents skipped。

## 稳定性说明

Public contract：

- Tool name：`subagent`
- Input fields：`agent`、`task`
- Built-in agent names：`explorer`、`researcher`、`reviewer`、`implementer`、`tester`
- Custom agent discovery paths 和简单 frontmatter 支持字段
- 默认 foreground single execution
- 子代理进程不注册 `subagent` tool，不注册 `/toolkit`
- 子代理 LSP privileged actions 始终禁用
- `details.mode`、`details.results[]`、`details.error` 的基本结构
- `SUBAGENT_ERROR_CODES` 字符串值

Internal implementation / 可能变化：

- 内置 agent prompt 文本和输出模板
- delegation policy 文案和 examples
- child prompt 具体拼接方式
- session file 目录布局
- streaming display item 格式细节
- retry transient error pattern
- sanitize/truncate 的具体规则
- renderer UI 展示格式

外部脚本不应强依赖自然语言输出、box/TUI 渲染或 session file 布局；若需要稳定机器接口，应优先读取 `details` 中的结构化字段。

## Source map

| 主题 | 源码 |
|---|---|
| Tool registration / renderer / session hooks | `src/modules/subagents/register.ts` |
| Agent discovery | `src/modules/subagents/agents.ts` |
| Foreground execution | `src/modules/subagents/execution.ts` |
| Executor / tool filtering / retry / result assembly | `src/modules/subagents/executor.ts` |
| Output collection | `src/modules/subagents/collect-output.ts` |
| Child JSONL event filtering | `src/modules/subagents/child-event-filter.ts` |
| Child stdout buffering / output limits | `src/modules/subagents/child-output-buffer.ts` |
| Agent frontmatter parser | `src/modules/subagents/frontmatter.ts` |
| Pi args / temp prompt/task files | `src/modules/subagents/pi-args.ts` |
| Pi spawn command resolution | `src/modules/subagents/pi-spawn.ts` |
| Runtime prompt helpers | `src/modules/subagents/prompt-runtime.ts` |
| Output sanitization | `src/modules/subagents/sanitize.ts` |
| Schemas | `src/modules/subagents/schemas.ts` |
| Subagent-related toolkit commands | `src/modules/subagents/commands/` |
| Delegation policy | `src/shared/delegation-policy.ts` |
| Session identity | `src/shared/session-identity.ts` |
| Shared result/error/config types | `src/shared/types.ts` |
| Built-in agent definitions | `agents/*.md` |
| Tests | `tests/subagents/`, `tests/subagents/commands/` |
