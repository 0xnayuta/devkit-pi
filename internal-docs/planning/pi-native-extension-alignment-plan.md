---
status: proposed
audience: maintainer
last_verified: 2026-05-20
language: chinese
---

# devkit-pi 向 Pi 官方/原生扩展看齐计划

## 目的

本文记录 `devkit-pi` 在代码结构、工程风格和设计哲学上向 Pi 官方仓库与原生扩展范式收敛的计划。

本文仅为规划文档，不代表当前行为，不修改公共契约，不要求立即实现。当前行为仍以 `docs/reference/`、`src/` 与 `tests/` 为准。

## 背景

`devkit-pi` 当前已经具备较完整的模块化结构：

```text
src/
├─ index.ts
├─ config/
├─ modules/
│  ├─ commands/
│  ├─ convert/
│  ├─ guards/
│  ├─ lsp/
│  ├─ subagents/
│  └─ web/
└─ shared/
```

现有优势包括：

- 模块边界清晰，`subagents`、`web`、`convert`、`lsp`、`guards`、`commands` 各自独立。
- 测试目录按模块镜像，便于维护一致性。
- 文档较完整，已覆盖配置、工具、错误码、安全边界和命令。
- 安全默认值较保守：子代理默认 readonly、LSP mutating actions 默认禁用、网络私网访问默认拦截、文档转换依赖 optional external CLI。
- 已经作为 Pi package 暴露：`package.json` 中声明 `pi.extensions` 指向 `./index.ts`。

主要差距集中在：

- 入口仍是按顺序调用多个 `register*` 函数，缺少统一 runtime/lifecycle 抽象。
- 长生命周期资源的清理分散在模块内部，缺少统一 owner。
- 工具 metadata、prompt guidance、rendering、state restoration 的模式尚未完全统一。
- 错误体系分散在多个模块。
- 状态模型未完全对齐 Pi 的 session/branch-aware 设计。
- 部分代码仍依赖兼容写法或宽类型，例如 `any`。
- 代码格式与 Pi 官方仓库存在差异。

## Pi 官方/原生扩展基线

根据 Pi 官方仓库 `packages/coding-agent` 的 README、扩展文档和 examples，原生扩展的核心基线如下。

### 1. 极简核心与扩展优先

Pi 核心刻意不内建 subagents、plan mode、permission popups、todo、MCP 等复杂工作流。此类能力应通过 extensions、skills、prompt templates 或 pi packages 实现。

`devkit-pi` 的定位应是一个 Pi-native package，而不是 Pi core fork 或 Pi core 替代品。

### 2. TypeScript 扩展入口

官方扩展入口是普通 TypeScript module：

```ts
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function extension(pi: ExtensionAPI) {
  pi.registerTool({ /* ... */ });
  pi.registerCommand("name", { /* ... */ });
  pi.on("session_start", async (_event, ctx) => { /* ... */ });
}
```

扩展 factory 可同步，也可异步。Pi 会等待 async factory 完成后再继续启动。

### 3. 事件驱动生命周期

Pi 原生生命周期主要由事件承载，而不是 VS Code 风格的 `ExtensionContext.subscriptions`：

- `session_start`
- `session_shutdown`
- `resources_discover`
- `before_agent_start`
- `agent_start`
- `tool_call`
- `tool_result`
- `agent_end`
- `context`
- `session_before_*`

`devkit-pi` 应将初始化、状态重建、资源清理、安全确认和 UI 通知映射到这些事件。

### 4. Session-aware 状态

Pi 官方建议扩展状态优先通过以下方式表达：

- 工具返回值中的 `details`，用于 tool result rendering 与 branch-aware state restoration。
- `pi.appendEntry(customType, data)`，用于不进入 LLM context 的自定义 session entry。
- `ctx.sessionManager.getBranch()`，用于按当前会话分支重建状态。

不应优先引入绕过 session tree 的独立全局状态库。

### 5. 工具是一等 Pi 资源

Pi-native tool 不只是执行函数，还应尽量包含：

- `name`
- `label`
- `description`
- `parameters`
- `promptSnippet`
- `promptGuidelines`
- `execute`
- `renderCall`
- `renderResult`
- streaming `onUpdate`
- truncation metadata
- 对 mutating file tool 使用 `withFileMutationQueue()`

### 6. 安全由扩展实现但默认保守

Pi 核心不强制 permission popup。官方示例通过扩展实现：

- `permission-gate.ts`
- `protected-paths.ts`
- `dirty-repo-guard.ts`
- `sandbox/`

`devkit-pi` 应继续保持安全默认值保守，并将 hard gate 作为显式配置，而不是默认行为。

## 对第三方建议的取舍原则

外部建议可以作为参考，但必须以 Pi 官方真实 API 为准。

### 应采纳的方向

- 统一 lifecycle/resource 管理。
- 统一错误 payload 和 remediation metadata。
- 将状态模型收敛到 session entries、tool result details 和 branch reconstruction。
- 强化 subagent frontmatter schema 校验。
- 让工具定义、渲染、prompt guidance 更接近官方 examples。

### 不应直接采纳的方向

以下概念不是当前 Pi 官方扩展 API，不应作为公共设计目标：

- `activate(context: PiExtensionContext)` 公共入口。
- `context.subscriptions.push(...)` 生命周期模型。
- `context.workspaceState` / `context.globalState`。
- `package.json contributes.piTools` 静态贡献点。

如果需要类似能力，应以 `devkit-pi` 内部 runtime 抽象实现，不对外宣称为 Pi 官方 API。

## 目标定位

`devkit-pi` 的目标形态：

```text
一个 Pi-native package，使用 Pi 官方 extension API，
以事件驱动生命周期、session-aware 状态和可组合工具为核心，
提供 Pi 核心刻意不内建的高级 coding workflow 能力。
```

关键原则：

- 不 fork Pi core。
- 不模拟非官方扩展 API。
- 不牺牲当前模块化和测试镜像结构。
- 不默认引入高风险 hard gate 或复杂 sandbox。
- 不把规划中的能力写成当前公共行为。

## 目标源码结构

建议在现有结构上新增一层 extension runtime，而不是推翻当前模块目录。

```text
src/
├─ index.ts                         # package extension entry，仅创建 runtime 并激活
├─ extension/
│  ├─ activate.ts                   # async activate(pi, options)
│  ├─ runtime.ts                    # DevkitRuntime / ResourceScope
│  ├─ module.ts                     # DevkitModule / DevkitModuleContext
│  └─ manifest.ts                   # 内部模块/工具 metadata，不是 Pi 官方 manifest
├─ config/
│  └─ load-config.ts
├─ modules/
│  ├─ commands/
│  ├─ convert/
│  ├─ guards/
│  ├─ lsp/
│  ├─ subagents/
│  └─ web/
└─ shared/
```

### DevkitModule

```ts
export interface DevkitModule {
  readonly name: string;
  register(context: DevkitModuleContext): void | Promise<void>;
}

export interface DevkitModuleContext {
  readonly pi: ExtensionAPI;
  readonly config: ResolvedToolkitConfig;
  readonly resources: ResourceScope;
  readonly logger: Logger;
}
```

模块仍负责自身注册，但通过统一 context 获取配置、logger 和资源作用域。

### ResourceScope

`ResourceScope` 是 `devkit-pi` 内部抽象，不暴露为 Pi 官方概念。

```ts
export interface DisposableResource {
  dispose(): void | Promise<void>;
}

export class ResourceScope {
  private readonly resources: DisposableResource[] = [];

  add(resource: DisposableResource): void {
    this.resources.push(resource);
  }

  async disposeAll(): Promise<void> {
    for (const resource of this.resources.splice(0).reverse()) {
      await resource.dispose();
    }
  }
}
```

典型用法：

```ts
export default async function devkitPi(pi: ExtensionAPI) {
  const runtime = await createDevkitRuntime(pi);
  await runtime.activate();

  pi.on("session_shutdown", async () => {
    await runtime.dispose();
  });
}
```

## 阶段进度

- Phase 1：已完成（生命周期与 runtime 收敛，含 `session_shutdown` 资源回收测试）。
- Phase 2：已完成（工具 metadata 标准化、manifest 单一来源、注册一致性测试、`/toolkit modules` 与 `/toolkit doctor` 消费闭环）。
- Phase 3：进行中（状态清单审计与状态模型测试已落地，后续持续按模块收敛）。
- Phase 4：已闭环（六模块执行链路统一 `*.error_payload` 命名已落地，且“错误码 -> payload 字段 -> remediation 来源”最终对照表已完成）。
- Phase 5：已闭环（guards 分层、mode/non-interactive/blockMode 配置、confirm/block gate 流程、可选 hard-block 与 `GUARD_HARD_BLOCKED` 结构化错误、doctor/help 可见性已落地）。
- Phase 6：Slice 6.1~6.5 已完成。
- Phase 7：待执行。

## 分阶段计划

### Phase 1：生命周期与 runtime 收敛

目的：在不改变用户可见行为的前提下，把入口从顺序注册器收敛为 Pi-native runtime。

建议任务：

1. 新增 `src/extension/module.ts`。
2. 新增 `src/extension/runtime.ts`。
3. 新增 `src/extension/activate.ts`。
4. 将 `src/index.ts` 改为薄入口：加载 runtime 并激活。
5. 将现有模块注册函数逐步适配为接收 `DevkitModuleContext`。
6. 将 LSP shutdown、web connection pool、潜在 watcher 或长期资源挂入 `ResourceScope`。
7. 移除 `pi as any` 等非必要兼容写法，直接依赖当前 `ExtensionAPI` 类型。
8. **强化子进程生命周期管控**：必须将 `src/modules/subagents/pi-spawn.ts` 衍生出的 `pi` 子进程（Child processes）注册到 `ResourceScope`。当主代理触发 `session_shutdown`（例如用户 `Ctrl+C` 强退）时，必须确保所有正在执行的子代理进程被彻底 kill，严防僵尸进程。
9. **明确配置归一化时机**：`activate()` 流程必须在**任何模块被实例化或注册之前**，严格执行现有的 `loadConfig() -> validate -> normalize` 流程。`DevkitModuleContext.config` 注入的必须是不可变的、完全归一化后的配置。
10. **LSP Hook 适配**：LSP 模块的 `register()` 将继续绑定 `agent_end` 和 `edit_write` 扩展事件，但其内部持有的状态（如本轮编辑的文件列表）必须受 `ResourceScope` 或 Session 级别生命周期管控。

边界：

- 不新增用户配置。
- 不改变工具名称、参数、返回结构和命令名称。
- 不改变默认启用状态。
- 不改变 soft guard 行为。

验收：

```bash
pnpm typecheck
pnpm lint
pnpm test
```

- 增加单元测试：通过 mock `ExtensionAPI` 的 `pi.on("session_shutdown", ...)`，显式验证 `ResourceScope.disposeAll()` 被正确调用。

### Phase 2：工具定义 Pi-native 化

目的：让每个 tool 更接近 Pi 官方 examples 中的一等工具资源。

建议任务：

1. 为所有工具补齐或审查：
   - `label`
   - `description`
   - `promptSnippet`
   - `promptGuidelines`
   - `renderCall`
   - `renderResult`
2. 建立内部 `DevkitToolMetadata`：

```ts
export interface DevkitToolMetadata {
  readonly name: string;
  readonly label: string;
  readonly module: "subagents" | "web" | "convert" | "lsp";
  readonly safety: "readonly" | "network" | "external-command" | "mutating";
  readonly promptSnippet?: string;
  readonly promptGuidelines?: string[];
}
```

3. 将 metadata 用于 `/toolkit modules`、`/toolkit doctor` 或内部一致性测试。
4. 保持 TypeBox schema 作为工具参数 schema 的主要来源。
5. 使用 `StringEnum` 处理 string enum，避免 Google-compatible provider 的 schema 兼容问题。

边界：

- 内部 metadata 不是 Pi 官方 `package.json` contribution。
- 不改变公共参数字段，除非单独规划 breaking change。

验收：

- 新增工具 metadata 一致性测试。
- 原有工具注册测试继续通过。
- 文档若出现 prompt guidance 行为变化，应同步更新 reference。

### Phase 3：状态模型对齐 Pi session tree

目的：让 state restoration 与 branch navigation 更符合 Pi 官方 session 模型。

当前启动策略：先完成“状态清单审计”，再进入代码改造。

建议任务：

1. 审计所有内存状态：
   - subagent execution state
   - web response storage/cache
   - convert activity
   - LSP diagnostics hook state
   - guards state
2. 按以下规则分类：
   - transient runtime state：仅内存保存，session shutdown 清理。
   - branch-aware state：从 tool result `details` 和 `ctx.sessionManager.getBranch()` 重建。
   - session-level metadata：使用 `pi.appendEntry(customType, data)`。
3. 为 web `responseId` 明确三层语义：
   - memory cache
   - session-restorable storage
   - optional provider cache
4. 将 activity log 与 tool details 的关系文档化：哪些用于 UI，哪些用于 LLM，哪些用于 session restore。
5. 避免新建与 Pi session tree 脱节的本地状态文件。

审计交付要求（Phase 3 第一个切片）：

- 产出一份状态清单审计表，至少包含字段：
  - `stateName`
  - `ownerModule`
  - `currentStorage`
  - `lifecycleBoundary`
  - `classification`（memory / session entry / details）
  - `restoreStrategy`
  - `risk`
  - `nextAction`
- 明确每个状态是否需要迁移、保持现状或删除（删除需单独确认）。
- 审计阶段不改变公共工具参数与输出契约。

边界：

- 不要求移除现有 storage，但需要明确生命周期和恢复策略。
- 不引入数据库或后台服务。

验收：

- 增加 session restoration 单测。
- 增加 branch reconstruction 单测。
- `/toolkit logs` 与 `/toolkit activity` 行为有变化时同步更新文档。

### Phase 4：统一错误模型与 remediation

目的：统一 subagents、web、convert、lsp 的错误结构，提升可诊断性和 LLM 自愈能力。

建议目标结构：

```ts
export interface DevkitErrorPayload {
  readonly code: string;
  readonly message: string;
  readonly module: "subagents" | "web" | "convert" | "lsp" | "commands" | "guards";
  readonly provider?: string;
  readonly causeSummary?: string;
  readonly retryable: boolean;
  readonly remediation?: string;
}
```

建议任务：

1. 在 `src/shared/errors.ts` 中定义统一 payload 和 factory。
2. 保留现有错误码字符串，先不做破坏性重命名。
3. 将 `web/errors.ts` 的 recovery suggestion 映射到 `DevkitErrorPayload.remediation`。
4. 将 `convert/errors.ts` 的 provider error 映射到统一 payload。
5. 将 subagent 和 LSP 错误逐步改为统一输出结构。
6. 建立错误码清单测试，防止文档和实现漂移。

边界：

- 初期只统一输出 payload，不强制移动全部错误码定义。
- 不泄露 API key、token、完整 stderr、私有文件内容。

验收：

- 各模块错误测试通过。
- `docs/reference/*error*` 与实现一致。
- 错误输出包含 `code`、`message`、`module`、`retryable`，可选包含 `remediation`。

### Phase 5：guards 分层与可选 hard gate

目的：在保留当前 soft notice 默认行为的前提下，提供更 Pi-native 的可配置安全 gate。

建议结构：

```text
src/modules/guards/
├─ index.ts
├─ notices/
├─ gates/
├─ classifiers/
├─ policies/
├─ state.ts
└─ types.ts
```

建议配置方向：

```json
{
  "guards": {
    "enabled": true,
    "mode": "notice",
    "confirmDestructiveBash": false,
    "protectPaths": [".env", ".git", "node_modules"]
  }
}
```

`mode` 候选值：

- `off`
- `notice`
- `confirm`
- `block`

建议任务：

1. 将现有 git context、first write、verification reminder 归入 `notices`。
2. 新增 `tool_call` hard gate 框架，但默认不启用。
3. destructiveness classifier 复用现有 command/tool classifier。
4. 在 `ctx.hasUI` 为 true 时允许 `ctx.ui.confirm()`。
5. 非交互模式下行为由配置明确决定，避免隐式危险放行。

边界：

- 默认仍是 soft notice，保持当前用户体验。
- 不引入全局 permission popup 模型。
- 不实现完整 sandbox 或事务回滚。

验收：

- notice 模式保持兼容。
- confirm/block 模式有单元测试。
- 文档明确非交互模式行为。

### Phase 6：Subagents 向官方 example 收敛

目的：吸收 Pi 官方 subagent example 中更原生的命名、安全和渲染方式。

建议任务：

1. 审查 agent scope 语义，向以下模式靠齐：
   - `user`
   - `project`
   - `both`
2. project-local agents 默认需要交互确认。
3. 明确用户级和项目级 agent 发现路径：
   - `~/.pi/agent/agents/*.md`
   - `.pi/agents/*.md`
4. 强化 markdown frontmatter schema 校验。
5. 逐步支持更丰富 delegation mode：
   - single
   - parallel
   - chain
6. 渲染继续向官方 example 靠齐：
   - collapsed view 显示状态、agent、tool calls、usage。
   - expanded view 使用 Markdown 输出完整结果。
   - streaming update 显示 running 状态。
7. 保持主代理唯一 orchestrator，子代理不得再调度子代理。

边界：

- parallel/chain 属于功能增强，应单独设计测试和文档。
- 默认 readonly 不变。
- 写能力仍为实验性，不在本阶段扩大默认权限。

验收：

- agent discovery 单测覆盖 user/project/both。
- project agent confirmation 有测试。
- frontmatter invalid case 返回结构化诊断。

### Phase 7：工程风格与格式对齐

目的：在逻辑稳定后，单独处理与 Pi 官方仓库的代码风格差异。

建议任务：

1. 评估是否将 Biome formatter 调整为与官方 Pi 完全一致：
   - `indentStyle: "tab"`
   - `indentWidth: 3`
   - `lineWidth: 120`
2. 若调整，必须单独提交，避免与逻辑改动混合。
3. 按 Pi package 文档审查 peer dependencies：
   - `@earendil-works/pi-ai`
   - `@earendil-works/pi-agent-core`
   - `@earendil-works/pi-coding-agent`
   - `@earendil-works/pi-tui`
   - `typebox`
4. 清理非必要 `any`。
5. 优先复用 Pi 导出的 helpers：
   - `StringEnum`
   - `withFileMutationQueue`
   - `truncateHead`
   - `truncateTail`
   - `formatSize`
   - `keyHint`
   - `pi.exec`

边界：

- 格式化变更不应混入功能变更。
- 不因对齐风格而降低类型安全。
- 不为了减少错误而删除已有功能。

验收：

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm docs:check
```

## 配置演进原则

新增配置时遵循以下规则：

1. 字段命名优先复用现有字段池：
   - `enabled`
   - `provider`
   - `providerPriority`
   - `timeoutMs`
   - `maxResponseBytes`
   - `maxContentChars`
   - `allowPrivateNetwork`
   - `allowWrite`
   - `allowLspTools`
   - `allowMutatingActions`
   - `mode`
   - `maxAttempts`
   - `ttlMs`
   - `maxConcurrent`
2. 所有配置必须先 normalize，再传入模块。
3. 用户可见配置必须同步更新 reference 文档。
4. 不为旧的不一致字段新增长期 alias，除非有明确迁移期。
5. 默认值必须安全保守。

## 测试策略

每个阶段都应保持现有测试镜像策略：

```text
tests/
├─ commands/
├─ convert/
├─ guards/
├─ lsp/
├─ shared/
├─ subagents/
└─ web/
```

新增测试建议：

| 阶段 | 测试重点 |
|---|---|
| Phase 1 | runtime activation、session_shutdown dispose、模块注册顺序不变 |
| Phase 2 | tool metadata 完整性、promptSnippet/promptGuidelines 注册 |
| Phase 3 | session restore、branch reconstruction、responseId 恢复 |
| Phase 4 | unified error payload、remediation、错误码文档一致性 |
| Phase 5 | notice/confirm/block 模式、非交互模式行为 |
| Phase 6 | agent scope、project agent confirmation、frontmatter validation |
| Phase 7 | typecheck/lint/test/docs:check 全量通过 |

## 文档策略

每个阶段若改变用户可见行为，必须同步更新：

- `README.md`
- `README.zh.md`
- `docs/reference/configuration.md`
- `docs/reference/subagents.md`
- `docs/reference/subagent-tool.md`
- `docs/reference/web-tools.md`
- `docs/reference/lsp-tools.md`
- `docs/reference/convert-tools.md`
- `docs/reference/toolkit-commands.md`
- `docs/guides/security-model.md`

内部设计或维护行为更新时，优先更新：

- `internal-docs/maintain/architecture.md`
- `internal-docs/maintain/extension-api.md`
- `internal-docs/maintain/testing.md`
- `internal-docs/adr/` 中相关 ADR

## 风险与缓解

### 风险 1：过度模拟非官方 API

缓解：所有扩展设计以 `ExtensionAPI`、Pi docs 和 examples 为准。内部 runtime 可以存在，但不得对外宣称为 Pi 官方 API。

### 风险 2：一次性大重构导致行为回归

缓解：按 phase 分步执行。Phase 1 只做结构迁移，不改用户行为。每阶段单独验证。

### 风险 3：格式化变更淹没逻辑 diff

缓解：格式化对齐作为独立阶段和独立提交处理。

### 风险 4：hard gate 破坏现有工作流

缓解：默认继续使用 soft notice。confirm/block 仅显式配置启用。

### 风险 5：状态迁移影响历史 session

缓解：保留 `prepareArguments`、旧 details parser 或兼容 reader。不要为了新状态模型破坏历史 session 渲染。

### 风险 6：错误模型统一变成 breaking change

缓解：保留现有错误码字符串，先统一 payload 外层结构，再逐步迁移模块内部实现。

## 不做事项

本计划明确不包含：

- fork 或修改 Pi core。
- 引入 VS Code 风格公共扩展 API。
- 实现 `contributes.piTools` 作为对外 manifest。
- 默认启用 hard permission popup。
- 第一阶段实现完整 worktree transaction 或 sandbox rollback。
- 将 `devkit-pi` 拆成多个 npm packages。
- 引入大型运行时依赖，例如浏览器引擎、OCR、Java/Python heavy pipeline、本地大模型。

## 推荐执行顺序

建议按以下顺序执行：

1. Phase 1：生命周期与 runtime 收敛（已完成）。
2. Phase 2：工具定义 Pi-native 化（已完成）。
3. Phase 3：状态模型对齐 Pi session tree（进行中，先审计后改造）。
4. Phase 4：统一错误模型（已闭环）。
5. Phase 5：guards 分层与可选 hard gate（已闭环）。
6. Phase 6：Subagents 向官方 example 收敛。
7. Phase 7：工程风格与格式对齐。

Phase 3 和 Phase 4 可根据实际耦合程度交换，但当前按“Phase 3 先行”的路线执行。

## 首个实施切片建议

第一个实现切片应限制为：

```text
新增 src/extension/module.ts
新增 src/extension/runtime.ts
新增 src/extension/activate.ts
重构 src/index.ts 为薄入口
将 LSP shutdown 挂入 ResourceScope
补充 runtime 单元测试
```

该切片必须满足：

- 不新增工具。
- 不新增配置。
- 不改变工具 schema。
- 不改变 `/toolkit` 命令输出语义。
- 不改变默认安全策略。

完成后再进入工具 metadata 或错误模型统一。
