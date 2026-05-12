---
status: current
audience: maintainer
last_verified: 2026-05-12
language: chinese
---

# 架构总览

本文档以当前 `src/` 目录结构为准，说明 devkit-pi 已实现的模块边界、注册流程和测试映射。历史 ADR 中出现的旧目录或旧项目名仅作为决策背景，不作为当前实现依据。

Public API、配置和命令契约请从 [Reference index](../reference/README.md) 进入；核心 reference 包括 [Configuration](../reference/configuration.md)、[Subagents](../reference/subagents.md)、[Web tools](../reference/web-tools.md)、[LSP tools](../reference/lsp-tools.md) 与 [Toolkit commands](../reference/toolkit-commands.md)。

## 架构一致性策略

`devkit-pi` 优先考虑结构一致性，而不是保留旧有布局。当旧项目结构、一次性目录命名或先前实现模式与当前模块化架构冲突时，不应为了兼容而保留。

当多个模块、工具、提供者、命令或功能区域承担类似角色时，优先使用统一结构与约定：

- 相同职责 → 相同源码 / 测试 / 文档结构
- 相同概念 → 相同命名模式
- 相同生命周期 → 相同注册 / 执行模式
- 相同提供者类型 → 相同 adapter interface 与 registry 模式
- 相同工具类别 → 相同 schema、配置、错误、测试和 reference 文档模式

例外应在实现附近或 ADR 中记录。

## 当前已实现的源码结构

```text
index.ts                         # package 根入口；re-export src/index.ts
src/
├─ index.ts                      # 扩展主入口；加载配置并组合注册模块
├─ config/
│  └─ load-config.ts             # 配置路径、默认值、merge/normalize
├─ modules/
│  ├─ commands/
│  │  └─ register.ts             # 统一 /toolkit 命令注册
│  ├─ subagents/                 # 子代理发现、执行、输出收集、诊断命令
│  │  ├─ commands/               # doctor/list/logs/activity 支撑逻辑
│  │  ├─ agents.ts               # builtin/user/project agent 发现与去重
│  │  ├─ executor.ts             # 子代理执行编排
│  │  ├─ collect-output.ts       # child session 输出收集
│  │  ├─ prompt-runtime.ts       # 子代理 prompt runtime 处理
│  │  ├─ pi-spawn.ts             # child pi 进程启动
│  │  ├─ sanitize.ts             # 输出清理
│  │  ├─ schemas.ts              # subagent tool 参数 schema
│  │  └─ register.ts             # subagent tool 与 delegation policy 注册
│  ├─ web/                       # web_search/fetch_content/get_search_content
│  │  ├─ providers/              # ddgs/brave/tavily/serper/openserp/searxng
│  │  ├─ cache.ts                # search cache
│  │  ├─ concurrency.ts          # 请求并发与队列限制
│  │  ├─ fetch.ts                # fetch_content 主流程
│  │  ├─ handlers.ts             # 内容类型 handler
│  │  ├─ security.ts             # URL/SSRF/私网访问校验
│  │  ├─ storage.ts              # responseId 结果存储与 session restore
│  │  ├─ errors.ts               # web 错误码与 recovery 建议
│  │  └─ register.ts             # web tools 注册与 session hooks
│  ├─ lsp/                       # LSP tool、hook、server 管理
│  │  ├─ core.ts                 # language server manager 与核心操作
│  │  ├─ hook.ts                 # 自动 diagnostics hook
│  │  ├─ schemas.ts              # lsp tool 参数 schema/actions
│  │  ├─ tool.ts                 # lsp tool 实现
│  │  └─ register.ts             # LSP 模块注册
│  └─ ...
└─ shared/
   ├─ types.ts                   # 共享类型、配置类型、subagent 错误码
   ├─ errors.ts                  # LSP/subagent 共享错误类型
   ├─ delegation-policy.ts       # 主代理 delegation policy 注入文本
   ├─ session-identity.ts        # session identity 辅助
   └─ post-exit-stdio-guard.ts   # child process stdio 防护

agents/                          # 5 个内置 markdown agent 定义
tests/                           # 单元测试，按模块镜像 src/modules
```

## 入口与注册流程

### `index.ts`

根目录 `index.ts` 只 re-export `src/index.ts`，用于 pi extension loading，并避免显示名从 `src` 推导。

### `src/index.ts`

`src/index.ts` 是实际主入口。当前已实现流程：

```text
loadConfig()
  → mergeConfig()
  → 如果 enabled=false，直接返回
  → registerWebTools(pi, config.web)
  → registerLspModule(pi, config.lsp)
  → registerSubagentsModule(pi, effectiveSubagentsConfig)
  → registerToolkitCommands(pi, config)
```

注册顺序的当前语义：

1. `web` tools 可在主代理和子代理进程注册。
2. `lsp` tool 可在主代理和子代理进程注册，但 privileged actions 在子代理进程中始终被阻止。
3. `subagents` 模块内部检查 `PI_SUBAGENT_CHILD`，子代理进程不会注册 `subagent` 工具。
4. `/toolkit` commands 只在主代理进程注册。
5. `subagents.allowLspTools` 会与 `lsp.enabled`、`lsp.tool.enabled` 合并后生效。

## 模块职责

### `src/config/`

当前已实现：

- 配置文件路径：`~/.pi/agent/extensions/devkit-pi/config.json`
- 默认配置：`DEFAULT_CONFIG`、`DEFAULT_SUBAGENTS_CONFIG`、`DEFAULT_WEB_CONFIG`
- 配置合并与 normalize：`mergeConfig()`
- 无效值回退：boolean、positive integer、non-negative integer、provider 名称、LSP hook mode、readonly LSP actions 等

配置文档的 canonical source 是 `src/config/load-config.ts`，类型定义辅助参考 `src/shared/types.ts`。

### `src/modules/subagents/`

当前已实现：

- 注册 `subagent` tool。
- 发现内置/user/project agents。
  - 内置：`agents/*.md`
  - 用户级：`~/.pi/agent/agents/`
  - 项目级：`.pi/agents/` 或 `.agents/`
- 解析简单 markdown frontmatter。
- 按 project > user > builtin 优先级对同名 agent 去重。
- 构造 delegated child prompt。
- 启动 foreground child pi session。
- 收集输出、usage、session 文件信息和 display items。
- sanitize 输出。
- 使用 `subagents.maxDepth` 和环境变量阻止 nested subagents。
- 在主代理进程注入 delegation policy（可通过配置关闭）。
- 提供 `/toolkit` 使用的 doctor/list/logs/activity 支撑逻辑。

当前边界：

- 主代理是唯一 orchestrator。
- 子代理不注册也不应调用 `subagent` 工具。
- 内置 agents 默认 readonly。
- `allowWrite` 虽在配置中存在，但当前内置 agent 仍按 readonly prompt 与工具列表设计；写能力风险需要人工确认后再扩大文档说明。
- 子代理可选使用 readonly LSP actions，受 `subagents.allowLspTools` 与 `subagents.allowedLspActions` 控制。

### `src/modules/web/`

当前已实现：

- 注册 readonly web tools：`web_search`、`fetch_content`、`get_search_content`。
- 搜索 provider：`ddgs`、`brave`、`tavily`、`serper`、`openserp`、`searxng`。
- `provider="auto"` 时按 `providerPriority` 与 provider availability 选择可用 provider。
- URL fetch 的安全限制：协议限制、私网/localhost 默认拦截、DNS 解析校验、重定向限制、超时、响应大小限制。
- 内容提取和 handler：HTML、纯文本、Markdown/源码文本、JSON、CSV/TSV、XML/RSS/Atom、YAML，以及不支持类型拒绝。
- Jina Reader fallback 配置：`enableJinaFallback`、`jinaTimeoutMs`、`jinaTriggers`、tool 参数 `preferReader`。
- search cache、请求并发限制、HTTP connection pool。
- responseId storage；支持通过 pi session custom entry append/restore。它不写项目文件，但已不只是"进程内内存"语义。
- observability/activity logs 与 renderers。

当前边界：

- Web 错误码 canonical source 是 `src/modules/web/errors.ts` 中的 `WEB_ERROR_CODES`；完整 active/reserved/deprecated 语义见 [Web tools error codes](../reference/web-tools-error-codes.md)。

### `src/modules/lsp/`

当前已实现：

- 注册 `lsp` tool。
- 支持 actions：`definition`、`references`、`hover`、`symbols`、`diagnostics`、`workspace-diagnostics`、`signature`、`rename`、`codeAction`、`restart`、`servers`。
- readonly-safe actions 可暴露给子代理：`definition`、`references`、`hover`、`signature`、`symbols`、`diagnostics`、`workspace-diagnostics`、`servers`。
- privileged actions：`rename`、`codeAction`、`restart`；默认禁用，且子代理进程中始终禁用。
- workspace 路径边界与结果截断。
- 自动 diagnostics hook：主代理进程注册，支持 `agent_end`、`edit_write`、`disabled` 模式。
- language server manager 和 session shutdown cleanup。

需人工确认：

- 文档可列出源码注释中的支持 language server，但实际可用性取决于本机是否安装对应 server。

### `src/modules/commands/`

当前已实现：

- 注册统一 slash command：`/toolkit`。
- 子命令：
  - `/toolkit doctor`
  - `/toolkit modules`
  - `/toolkit logs [--search|--fetch] [--limit N]`
  - `/toolkit agents`
  - `/toolkit lsp`
  - `/toolkit activity`
  - `/toolkit help`
- 子代理进程不注册 `/toolkit`。

### `src/shared/`

当前已实现：

- subagent result/config/session/usage 类型。
- subagent 错误码常量。
- LSP/subagent 共享错误类型。
- delegation policy 注入文本。
- session identity 与临时目录 scope。
- 输出截断工具。

需人工确认：

- `src/shared/errors.ts` 名称为 unified error codes，但当前没有纳入 web 错误码。

## 核心调用链

### Subagent 调用链

```text
主代理调用 subagent({ agent, task })
  → registerSubagentsModule 中的 tool handler
  → 校验 input/config/depth
  → discoverAgents(cwd, "both")
  → 选择 agent 定义并构造 child prompt
  → createSubagentExecutor / pi-spawn 启动 foreground child pi session
  → collect-output 收集 assistant 输出和 usage
  → sanitize + normalize result/details
  → 返回给主代理
```

### Web 调用链

```text
主代理或子代理调用 web_search / fetch_content / get_search_content
  → registerWebTools 注册的 tool handler
  → schema 约束 + 运行时校验
  → provider selection / URL security / cache / concurrency / storage
  → 返回 JSON details，并通过 renderer 压缩 UI 展示
```

### LSP 调用链

```text
主代理或子代理调用 lsp({ action, ... })
  → registerLspTool
  → action 权限检查（子代理禁用 privileged actions）
  → core manager 启动或复用 language server
  → 执行 definition/references/diagnostics 等 action
  → 限制结果大小并返回
```

### LSP diagnostics hook

```text
主代理 session_start / tool_call / tool_result / agent_start / agent_end
  → registerLspHook 维护本轮编辑文件状态
  → 按 hook.mode 在 agent_end 或 edit_write 后诊断
  → 输出 lsp-diagnostics message
```

hook 不在子代理进程注册。

## 测试结构如何镜像源码

当前测试主要是 unit tests，不依赖真实 pi 子进程或真实 language server。测试目录按模块镜像。该镜像结构是有意的架构策略，而不只是当前约定：新增模块或相似功能区域时，应在匹配路径下补充测试，除非存在已记录的例外：

```text
tests/
├─ subagents/                  # src/modules/subagents/*
│  └─ commands/                # src/modules/subagents/commands/*
├─ web/                        # src/modules/web/*
│  └─ providers/               # src/modules/web/providers/*
├─ lsp/                        # src/modules/lsp/*
├─ commands/                   # src/modules/commands/*
├─ shared/                     # src/shared/*
└─ package-manifest.test.ts    # package.json 发布入口/文件检查
```

映射示例：

| 测试 | 对应源码 | 覆盖重点 |
|---|---|---|
| `tests/subagents/agents.test.ts` | `src/modules/subagents/agents.ts` | agent 发现、优先级、路径处理 |
| `tests/subagents/config.test.ts` | `src/config/load-config.ts` | namespace 配置 merge/defaults |
| `tests/subagents/lsp-tools.test.ts` | `src/modules/subagents/*` + `src/modules/lsp/*` | 子代理 LSP actions 暴露边界 |
| `tests/web/*.test.ts` | `src/modules/web/*.ts` | fetch/search/security/storage/cache/concurrency/renderers |
| `tests/web/providers/*.test.ts` | `src/modules/web/providers/*.ts` | provider adapter 与 selection |
| `tests/lsp/tool.test.ts` | `src/modules/lsp/*` | tool 注册、权限 gating、hook 注册边界 |
| `tests/commands/register.test.ts` | `src/modules/commands/register.ts` | `/toolkit` 注册与子命令输出 |
| `tests/shared/path-handling.test.ts` | `src/shared/*` | 路径与 scope 处理 |

## 当前已实现 vs 设计方向

### 当前已实现

- 模块化单包入口。
- namespace 配置。
- `subagent` tool 与 5 个内置 readonly agents。
- user/project markdown agents。
- readonly web tools 与多 provider 搜索。
- `fetch_content` 的文本类 handler、安全限制与 Jina fallback。
- `lsp` tool 与主代理 diagnostics hook。
- `/toolkit` 命令中心。
- 模块级 unit tests。

### 设计方向 / 后续规划

以下内容出现在 roadmap、proposal 或 ADR 背景中，但当前不是已实现功能：

- VitePress 文档站。
- `convert_content` 工具。
- background/async jobs。
- chain/parallel workflow。
- intercom。
- worktree 管理。
- agent management actions（create/update/delete）。
- repo map / project context / git workflow / run_check 等 roadmap 能力。

这些内容应继续保留在 roadmap/proposal/historical 文档中，不应写入用户功能说明为当前能力。
