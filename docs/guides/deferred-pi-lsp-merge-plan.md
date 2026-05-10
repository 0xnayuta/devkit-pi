---
status: proposed
audience: maintainer
last_verified: 2026-05-10
---

# 将 pi-lsp 合入个人综合 pi 扩展包的计划

## 结论

在“`pi-subagents` 与 `pi-lsp` 都是个人项目，主要由同一维护者自用和维护”的前提下，**推荐合并**。

但这不应理解为“把 `../pi-lsp` 的文件直接复制进当前项目”。更合适的方向是：

> 将当前项目从轻量 subagent 扩展，正式演进为一个个人使用的综合 pi coding toolkit。

合并目标不是保持原有 `pi-subagents` 边界，而是建立一个模块化单包：

```text
personal pi coding toolkit
= subagents
+ web tools
+ LSP tool
+ LSP diagnostics hook
+ developer commands
+ future personal workflow tools
```

因此，本计划建议：

1. 先完成项目目标重定位和文档同步。
2. 再模块化当前代码。
3. 然后合入 LSP tool。
4. 最后合入 LSP hook。

核心原则是：

> 多能力可以默认可用，但危险能力必须默认受限；项目可以变综合，但代码结构必须保持模块化。

## 背景

当前 `pi-subagents` 的原始定位是轻量 subagent 扩展：

```text
1 个主代理
+ 1 个 subagent 工具
+ 5 个内置子代理
+ foreground 单次执行
+ maxDepth = 1
+ 默认 readonly
```

但当前项目实际上已经包含超过原始 MVP 的能力：

- `subagent` 工具与内置 agents。
- readonly web tools：`web_search`、`fetch_content`、`get_search_content`。
- web provider、cache、concurrency、connection pool、observability。
- `/subagents` developer commands。
- delegation policy 注入。

`pi-lsp` 则提供另一组代码智能能力：

- LSP tool：definition、references、hover、signature、symbols、diagnostics、workspace-diagnostics、rename、codeAction 等。
- LSP hook：在 `agent_end` 或 `edit/write` 后自动诊断。
- 长生命周期 language server 管理。
- 多语言 server 发现、启动、复用、关闭。
- 文件打开状态、诊断缓存、LRU、idle shutdown 等运行时状态。

如果目标扩大为个人综合 pi coding toolkit，那么二者可以组合为：

| 模块 | 职责 |
|---|---|
| subagents | 专职任务委派、代码导航、审查、研究、实现规划、测试规划 |
| web | 搜索、网页内容获取、外部资料研究 |
| lsp | 代码智能、符号导航、诊断、类型/文档查询 |
| hooks | 自动诊断和反馈 |
| commands | doctor、list、logs、activity、lsp 配置等维护者辅助能力 |

## 新项目定位

建议将项目定位从：

```text
Lightweight pi extension for delegating tasks to specialized subagents.
```

调整为：

```text
Personal all-in-one pi coding toolkit for agentic coding workflows.
```

中文描述：

```text
面向个人工作流的综合 pi coding 扩展包，提供 subagents、web research、LSP code intelligence、自动诊断和开发者辅助命令。
```

新的设计原则：

1. **个人工作流优先**：以维护者自己的高频使用体验为主要优化目标。
2. **模块化优先**：综合能力不等于大杂烩；每个能力必须是独立模块。
3. **安全默认**：默认 readonly、默认禁止 nested subagent、默认限制 LSP mutating actions。
4. **渐进增强**：LSP 或 web 不可用时，agent 应能退回到 read/grep/find 等基础工具。
5. **主代理编排**：主代理仍是唯一 orchestrator；子代理不调度其他子代理。
6. **模块可关闭**：subagents、web、lsp tool、lsp hook、commands 都应可独立启停。

## 是否改名

如果正式扩大目标，`pi-subagents` 这个名称会逐渐不准确。建议至少在文档中明确：

> `pi-subagents` started as a lightweight subagent extension and has evolved into a personal pi coding toolkit.

可选命名方向：

| 名称 | 说明 |
|---|---|
| `pi-coding-toolkit` | 推荐，准确表达 coding 综合工具包 |
| `pi-coding-suite` | 更强调全家桶 |
| `pi-agent-toolkit` | 更强调 agent 增强 |
| `pi-devtools` | 更偏开发工具集合 |
| `nayuta-pi-tools` | 个人命名，避免泛名冲突 |

建议策略：

- 短期可以继续使用 `pi-subagents`，减少迁移成本。
- 文档先改为“已演进为 personal pi coding toolkit”。
- 如果未来要公开推广，再考虑 npm 包和仓库改名。

## 目标架构

推荐将当前项目整理成模块化单包，而不是保留 subagent-only 的目录心智。

建议结构：

```text
src/
├─ extension/
│  ├─ index.ts              # 总入口，只做组合注册
│  ├─ context.ts            # 全局上下文/共享状态，可选
│  └─ commands/             # 通用或跨模块 commands
│
├─ modules/
│  ├─ subagents/
│  │  ├─ register.ts
│  │  ├─ schemas.ts
│  │  ├─ agents.ts
│  │  ├─ frontmatter.ts
│  │  ├─ executor.ts
│  │  └─ prompt-runtime.ts
│  │
│  ├─ web/
│  │  ├─ register.ts
│  │  ├─ search.ts
│  │  ├─ fetch.ts
│  │  ├─ providers/
│  │  └─ ...
│  │
│  └─ lsp/
│     ├─ register.ts
│     ├─ core.ts
│     ├─ tool.ts
│     ├─ hook.ts
│     ├─ config.ts
│     ├─ schemas.ts
│     └─ renderers.ts
│
├─ config/
│  ├─ load-config.ts
│  ├─ defaults.ts
│  └─ schema.ts
│
└─ shared/
   ├─ types.ts
   ├─ errors.ts
   ├─ session-identity.ts
   └─ post-exit-stdio-guard.ts
```

总入口应尽量保持很薄：

```ts
export default function registerExtension(pi: ExtensionAPI): void {
  const config = loadConfig();
  const state = createExtensionState();

  if (!config.enabled) return;

  registerWebModule(pi, config.web, state);
  registerLspModule(pi, config.lsp, state);
  registerSubagentsModule(pi, config.subagents, state);
  registerDeveloperCommands(pi, config, state);
}
```

继续使用单一 pi extension 入口：

```json
{
  "pi": {
    "extensions": [
      "./src/extension/index.ts"
    ]
  }
}
```

## 配置模型

当前配置以 subagent 为根，合并后建议改为 namespace 化配置。

建议目标结构：

```json
{
  "enabled": true,

  "subagents": {
    "enabled": true,
    "maxDepth": 1,
    "timeoutMs": 120000,
    "allowWrite": false,
    "injectDelegationPolicy": true,
    "allowLspTools": true,
    "allowedLspActions": [
      "definition",
      "references",
      "hover",
      "signature",
      "symbols",
      "diagnostics",
      "workspace-diagnostics",
      "servers"
    ]
  },

  "web": {
    "enabled": true,
    "provider": "ddgs",
    "timeoutMs": 10000,
    "maxResults": 5,
    "cache": {
      "enabled": false
    }
  },

  "lsp": {
    "enabled": true,
    "tool": {
      "enabled": true,
      "allowMutatingActions": false
    },
    "hook": {
      "enabled": true,
      "mode": "agent_end"
    },
    "servers": {
      "idleShutdownMs": 120000,
      "maxOpenFiles": 64
    }
  },

  "commands": {
    "enabled": true
  }
}
```

为避免破坏现有个人配置，配置加载层应支持 legacy migration：

```ts
function migrateLegacyConfig(raw: unknown): ToolkitConfig
```

需要兼容的旧字段包括：

- `enabled`
- `maxSubagentDepth`
- `timeoutMs`
- `allowWriteSubagents`
- `injectDelegationPolicy`
- `webTools`

## 主进程 / 子代理进程注册矩阵

当前项目通过 `PI_SUBAGENT_CHILD` 防止子代理再次注册 `subagent` 工具。合并 LSP 后应继续保留这一边界。

推荐矩阵：

| 能力 | 主代理进程 | 子代理进程 | 默认策略 |
|---|---:|---:|---|
| `subagent` tool | 是 | 否 | 禁止 nested subagents |
| web tools | 是 | 是 | 允许 |
| readonly LSP tool actions | 是 | 是 | 允许 |
| `rename` | 可配置 | 否 | 默认禁用 |
| `codeAction` | 可配置 | 否 | 默认禁用或仅展示 |
| `restart` | 可配置 | 否 | 默认主进程限定 |
| LSP hook | 是 | 否 | 子进程禁用 |
| `/subagents` commands | 是 | 否 | 主进程限定 |
| `/lsp` command | 是 | 否 | 主进程限定 |

这意味着：

- 子代理可以用 LSP 查定义、引用、hover、symbols、diagnostics。
- 子代理不能调用其他子代理。
- 子代理默认不能执行 rename、codeAction、restart。
- 子代理进程不启用 LSP hook，避免重复诊断和长生命周期状态混乱。

## readonly 语义扩展

合并 LSP 后，readonly agent 不应只等价于 `read/grep/find/ls`。以下 LSP action 应被视为 readonly-safe：

```text
definition
references
hover
signature
symbols
diagnostics
workspace-diagnostics
servers
```

以下 action 应视为 privileged 或 mutating-adjacent：

```text
rename
codeAction
restart
```

建议实现一个 LSP action 白名单，而不是简单把整个 `lsp` 工具暴露给所有子代理。

## 推荐默认策略

由于这是个人综合包，默认值可以比公共包更积极，但仍需限制危险能力。

| 模块/能力 | 建议默认值 |
|---|---|
| subagents | enabled |
| web tools | enabled |
| lsp tool | enabled |
| lsp hook | enabled |
| lsp hook mode | `agent_end` |
| lsp in subagents | enabled for readonly-safe actions |
| subagent in subagents | disabled |
| write subagents | disabled |
| rename | disabled by default |
| codeAction | disabled by default 或只展示不应用 |
| restart | main process only |

如果实际使用中觉得自动诊断噪声过大，可以将 hook 默认改为：

```json
{
  "lsp": {
    "hook": {
      "enabled": false
    }
  }
}
```

但推荐个人使用默认启用 `agent_end`，因为它对 coding workflow 的收益较高，且比 `edit_write` 噪声小。

## 合并前置条件

### 必须完成

- [ ] 新增 ADR，正式记录项目从轻量 subagent 扩展演进为个人综合 pi coding toolkit。
- [ ] 更新 `AGENTS.md`，避免继续把项目描述为纯轻量 subagent MVP。
- [ ] 更新 `docs/guides/goals-and-scope.md`，记录新的目标、保留边界和废弃边界。
- [ ] 更新 `README.md` / `README.zh.md`，说明 subagents、web、LSP 的组合定位。
- [ ] 明确是否短期保留 `pi-subagents` 包名，或改名为更通用名称。
- [ ] 设计 namespace 化配置：`subagents` / `web` / `lsp` / `commands`。
- [ ] 明确主进程与子代理进程的工具注册矩阵。
- [ ] 确认 `pnpm typecheck`、`pnpm test`、`pnpm docs:check` 的合并前基线。

### 建议完成

- [ ] 先把 `src/extension/index.ts` 拆薄，提取 `registerSubagentsModule()`、`registerWebModule()`、`registerDeveloperCommands()`。
- [ ] 为 LSP tool 准备独立测试入口：`tests/lsp/`。
- [ ] 准备一个小型 TypeScript fixture 项目用于 LSP smoke test。
- [ ] 在内置 agent prompt 中加入 “if lsp tool is available” 的使用规则。
- [ ] 为 LSP 输出增加最大字符数/最大 diagnostics 数限制，避免 token 过量。
- [ ] 为 language server 不可用设计清晰错误信息和 fallback 建议。

## 建议实施阶段

### Phase 0：决策与文档改口

不先搬代码，先正式改变项目心智模型。

- 新增 ADR：`docs/adr/0005-evolve-into-personal-pi-coding-toolkit.md`。
- 更新目标与范围文档。
- 更新 README / README.zh.md。
- 更新 AGENTS.md。
- 明确是否改名。
- 明确保留边界：主代理唯一 orchestrator、maxDepth=1、子代理默认 readonly。

### Phase 1：模块化现有代码

在合入 LSP 前，先整理当前项目结构。

目标：让 `src/extension/index.ts` 只负责组合注册。

建议提取：

```ts
registerSubagentsModule(pi, config.subagents, state);
registerWebModule(pi, config.web, state);
registerDeveloperCommands(pi, config.commands, state);
```

本阶段尽量不改行为，只改变结构。

### Phase 2：配置 namespace 化

将当前 `ExtensionConfig` 演进为 `ToolkitConfig`。

建议新增：

```ts
interface ToolkitConfig {
  enabled?: boolean;
  subagents?: SubagentsConfig;
  web?: WebConfig;
  lsp?: LspConfig;
  commands?: CommandsConfig;
}
```

同时实现 legacy migration，兼容旧配置。

### Phase 3：合入 LSP tool，不启用 hook 特性

迁入：

```text
../pi-lsp/lsp-core.ts
../pi-lsp/lsp-tool.ts
```

目标位置：

```text
src/modules/lsp/core.ts
src/modules/lsp/tool.ts
src/modules/lsp/register.ts
src/modules/lsp/schemas.ts
src/modules/lsp/renderers.ts
```

改造成：

```ts
registerLspTool(pi, config.lsp.tool, state)
```

先验证：

```text
lsp action=servers
lsp action=symbols file=src/extension/index.ts
lsp action=diagnostics file=src/extension/index.ts
lsp action=definition file=... query=...
```

### Phase 4：让 subagents 可选使用 readonly LSP

修改内置 agents prompt：

- `explorer`：优先使用 LSP 进行符号级导航；不可用时退回 read/grep/find。
- `reviewer`：可使用 LSP diagnostics 辅助审查。
- `implementer`：可用 LSP definition/references 理解影响面，但仍只输出计划。
- `tester`：可用 LSP symbols/diagnostics 辅助测试规划。

同时实现子代理 LSP action 白名单。

### Phase 5：合入 LSP hook

迁入：

```text
../pi-lsp/lsp.ts
```

改造成：

```ts
registerLspHook(pi, config.lsp.hook, state)
```

要求：

- 只在主代理进程注册。
- 默认 `agent_end`。
- 支持配置关闭。
- 不影响 `lsp` tool 本身。
- 在 session shutdown 时清理 LSP 资源。

### Phase 6：统一 commands 与 diagnostics

短期可以保留：

```text
/subagents doctor
/subagents list
/subagents logs
/subagents activity
/lsp
```

长期可考虑统一为：

```text
/toolkit doctor
/toolkit modules
/toolkit logs
/toolkit agents
/toolkit lsp
```

但命令统一不是合并 LSP 的前置条件。

## 风险与控制

| 风险 | 控制策略 |
|---|---|
| LSP server 不存在或 PATH 错误 | 返回明确错误，提示安装命令，允许 fallback 到 grep/read |
| LSP hook 输出噪声 | 默认 `agent_end`，支持关闭，限制 diagnostics 数量 |
| 子代理误用 mutating action | LSP action 白名单，子进程禁用 rename/codeAction/restart |
| 长生命周期 server 泄漏 | idle shutdown、session shutdown cleanup、restart main-only |
| 配置复杂度膨胀 | namespace 化配置，默认值集中在 `config/defaults.ts` |
| 入口文件膨胀 | 合入前先模块化，入口只做组合注册 |
| 文档与代码再次脱节 | ADR + goals-and-scope + README + AGENTS.md 同步更新 |
| token 输出过大 | LSP diagnostics/symbols/references 增加输出上限 |

## 当前决策

当前决策从“无限期推迟合并”调整为：

> 推荐合并，但以项目重定位和模块化升级的形式推进。

下一步不是搬运 `../pi-lsp` 代码，而是：

1. 新增 ADR，确认项目演进为个人综合 pi coding toolkit。
2. 更新 `AGENTS.md`、README 和 goals-and-scope。
3. 模块化现有 extension 入口。
4. 然后按阶段合入 LSP tool 与 LSP hook。
