---
status: proposed
audience: maintainer
last_verified: 2026-05-11
---

# docs 文档结构审计与迁移计划

> Status: Proposed. 本文是 VitePress 前的信息架构计划与历史审计记录，不代表当前 public reference 或当前实现；当前行为以 `docs/reference/`、`src/` 和 `tests/` 为准。

## 目标与边界

本文件用于为后续建立 VitePress 文档网站做信息架构准备。本轮只做结构审计与迁移计划，不迁移文件、不删除现有文档、不大规模重写正文、不引入 VitePress 依赖。

审计依据：`AGENTS.md`、`README.md`、`README.zh.md`、`package.json`、`docs/**`、`src/modules/{subagents,web,lsp,commands}`、`src/config`、`src/shared`、`tests/**`。

## 当前 docs/ 目录的问题总结

1. **信息架构按历史来源组织，而不是按用户任务组织**
   - 当前主要目录为 `guides/`、`reference/`、`adr/`、`issues/`、`archive/`。
   - 对用户来说，安装、快速开始、配置、功能使用、API/reference、开发维护混在一起，后续生成站点侧边栏时会难以分层。

2. **部分文档与当前源码目录不一致**
   - `docs/guides/architecture.md` 仍描述旧结构：`src/extension`、`src/agents`、`src/runtime`、`src/web`。
   - 当前源码结构是：`src/index.ts`、`src/modules/{subagents,web,lsp,commands}`、`src/config`、`src/shared`。
   - `docs/adr/0003-autonomous-subagent-triggering.md` 的实施路径仍提到旧配置和旧入口，需人工确认是否保留为历史记录或追加当前状态说明。

3. **配置参考不完整**
   - `docs/reference/configuration.md` 已覆盖主干配置，但未完整展开 `web` 的全部默认值：`enableJinaFallback`、`jinaTimeoutMs`、`jinaTriggers`、`allowPrivateNetwork`、`cache`、`concurrency`、`connectionPool`、各 provider 子配置等。
   - README 中的配置示例也不是 `src/config/load-config.ts` 的完整默认值。

4. **Web 错误码文档与实际返回存在不一致**
   - `src/modules/web/errors.ts` 定义 `WEB_ERROR_CODES`，包含 `CONTENT_FETCH_*`、`WEB_SEARCH_*`、provider 和通用错误。
   - 其他实现处还会返回 `INVALID_INPUT`、`NOT_FOUND` 等未在 `WEB_ERROR_CODES` 中定义的错误。
   - README 中列出的 `FETCH_CONTENT_FAILED`、`CONTENT_TOO_LARGE`、`STORAGE_FULL`、`CACHE_DISABLED` 与源码 canonical 定义不完全一致，需人工确认最终对外错误码集合。

5. **Reference 粒度不均衡**
   - 已有 `agent-definition`、`result-schema`、`subagent-tool`、`configuration`、`web-tools-error-codes`。
   - 缺少独立的 `lsp tool reference`、`web tools reference`、`/toolkit command reference`、`provider configuration reference`。

6. **功能文档与维护文档混放**
   - `fetch_content-enhancement.md` 既包含用户可用行为，也包含 Phase/handler 架构说明。
   - `add-convert_content-tool-plan.md`、`personal-toolkit-feature-roadmap.md` 是提案/路线图，不应出现在用户主路径。

7. **ADR 有历史价值，但不应作为用户学习入口**
   - ADR 适合保留原路径作为决策记录。
   - 其中旧路径、旧项目名、旧边界应标记为历史上下文，避免与当前实现文档冲突。

## 当前文档与源码模块的对应关系

| 当前文档 | 对应源码/测试 | 审计结论 |
|---|---|---|
| `docs/README.md` | docs 索引 | 可保留为临时索引；VitePress 后可作为 `/` 或重定向入口 |
| `docs/guides/goals-and-scope.md` | `src/index.ts`、`src/modules/*`、`AGENTS.md` | 基本匹配当前边界 |
| `docs/guides/architecture.md` | 应对应 `src/index.ts`、`src/modules/*` | 明显过时，需人工确认并更新 |
| `docs/guides/extension-api.md` | `src/index.ts`、各模块 `register.ts`、hook 事件 | 基本匹配，适合迁入 development |
| `docs/guides/security-model.md` | `src/modules/web/security.ts`、`src/modules/lsp/*`、`src/modules/subagents/*` | 大体匹配；web storage “仅内存”描述需人工确认，因为源码支持 session restore/appendEntry |
| `docs/guides/testing.md` | `tests/**` | 基本匹配；可迁入 development/testing |
| `docs/guides/release-checklist.md` | `package.json`、`scripts/check-docs.mjs`、发布文件 | 维护者文档，迁入 development/release |
| `docs/guides/fetch_content-enhancement.md` | `src/modules/web/{fetch,handlers,security,extract}.ts`、`tests/web/*` | 可拆分：用户行为进 features/reference，Phase 说明进 development |
| `docs/guides/add-convert_content-tool-plan.md` | 无实现 | 提案文档，保留但不进入用户主路径；标记未实现 |
| `docs/guides/personal-toolkit-feature-roadmap.md` | 路线图 | 包含旧项目名/旧路径，需人工确认；不进入用户主路径 |
| `docs/reference/configuration.md` | `src/config/load-config.ts`、`src/shared/types.ts`、`tests/subagents/config.test.ts` | 需要补全 web/provider 默认值 |
| `docs/reference/subagent-tool.md` | `src/modules/subagents/register.ts`、`schemas.ts`、`executor.ts` | 基本匹配，但可补充返回 details 与边界 |
| `docs/reference/agent-definition.md` | `agents/*.md`、`src/modules/subagents/agents.ts`、`frontmatter.ts` | 基本匹配 |
| `docs/reference/result-schema.md` | `src/shared/types.ts` | subagent 部分匹配；LSP/web result schema 缺失 |
| `docs/reference/web-tools-error-codes.md` | `src/modules/web/errors.ts`、`search.ts`、`fetch.ts`、`storage.ts` | 需人工确认 canonical 错误码 |
| `docs/adr/*` | 历史架构决策 | 保留原路径；部分需追加“当前实现已演进”说明 |
| `docs/issues/issue-log.md` | issue/修复记录 | 维护者记录，迁入 development 或保留为 changelog 附属 |
| `docs/archive/*` | 历史计划 | 保留 archive，不进入主导航 |

## 源码模块与测试对应关系

| 源码区域 | 当前职责 | 测试对应 | 文档缺口 |
|---|---|---|---|
| `src/index.ts` | 加载配置、组合注册 web/lsp/subagents/commands | 间接由各模块注册测试覆盖 | 需要当前架构总览 |
| `src/modules/subagents/` | agent 发现、frontmatter、prompt runtime、child pi 执行、输出收集、sanitize、tool 注册 | `tests/subagents/**` | 需要面向用户的 subagents 使用指南和更完整的工具 reference |
| `src/modules/subagents/commands/` | doctor/list/logs/activity 支撑逻辑 | `tests/subagents/commands/**` | 应归入 `/toolkit` command reference |
| `src/modules/web/` | `web_search`、`fetch_content`、`get_search_content`、storage、cache、concurrency、observability、renderers | `tests/web/**` | 缺少 web tools reference、provider 配置指南、结果/缓存语义说明 |
| `src/modules/web/providers/` | ddgs/brave/tavily/serper/openserp/searxng adapter | `tests/web/providers/**` | 缺少 provider-by-provider 配置和可用性说明 |
| `src/modules/lsp/` | `lsp` tool、server manager、diagnostics hook、schema、安全 gating | `tests/lsp/tool.test.ts` | 缺少 LSP 使用指南、action reference、hook 行为说明 |
| `src/modules/commands/` | `/toolkit` command 注册与子命令分发 | `tests/commands/register.test.ts` | 缺少 `/toolkit` command reference |
| `src/config/` | 默认配置、配置路径、merge/normalize | `tests/subagents/config.test.ts` | 配置 reference 需与默认值逐项同步 |
| `src/shared/` | 共享类型、错误码、delegation policy、session identity、输出截断 | `tests/shared/**` | 缺少统一 error codes 与 result schema 总览 |

## 建议的新 docs/ 信息架构

为 VitePress 准备时，建议按“用户任务 → 概念 → 功能 → 配置 → 参考 → 开发维护”组织：

```text
docs/
├─ index.md                         # 文档站首页/索引
├─ getting-started/
│  ├─ overview.md                    # 项目是什么/不是什么
│  ├─ installation.md                # pi install / 本地开发链接
│  └─ quick-start.md                 # 最小使用路径：subagent/web/lsp/toolkit
├─ concepts/
│  ├─ architecture.md                # 当前 src/modules 架构
│  ├─ module-boundaries.md           # 主代理编排、readonly、depth=1、模块可关闭
│  ├─ security-model.md              # 安全边界
│  └─ result-model.md                # tool result/details/error 基本模型
├─ features/
│  ├─ subagents.md                   # 配置与使用、内置 agents、自定义 agents
│  ├─ web-tools.md                   # web_search/fetch_content/get_search_content
│  ├─ lsp.md                         # lsp tool + diagnostics hook
│  └─ toolkit-commands.md            # /toolkit doctor/modules/logs/agents/lsp/activity
├─ configuration/
│  ├─ overview.md                    # 配置文件位置、namespace、启停模块
│  ├─ subagents.md                   # subagents 配置
│  ├─ web.md                         # web 通用配置、cache/concurrency/Jina/security
│  ├─ web-providers.md               # ddgs/brave/tavily/serper/openserp/searxng
│  └─ lsp.md                         # lsp.tool/lsp.hook 配置
├─ reference/
│  ├─ subagent-tool.md               # subagent 参数/返回/错误
│  ├─ agent-definition.md            # markdown frontmatter reference
│  ├─ web-tools.md                   # web tool schema/result schema
│  ├─ web-error-codes.md             # canonical web errors
│  ├─ lsp-tool.md                    # lsp action schema/result/error
│  ├─ toolkit-command.md             # slash command reference
│  ├─ configuration-schema.md        # 从 load-config/types 对齐的完整 schema
│  └─ error-codes.md                 # subagent/web/lsp 汇总，标明模块来源
├─ development/
│  ├─ architecture-notes.md          # extension API、事件、渲染
│  ├─ testing.md                     # 测试策略
│  ├─ release-checklist.md           # 发布检查
│  ├─ docs-restructure-plan.md       # 本文件
│  └─ roadmap.md                     # 路线图/提案入口
├─ adr/
├─ issues/
└─ archive/
```

## 应保留原路径的文档

以下文档建议保留原路径，至少在第一轮 VitePress 化时不迁移，以降低链接破坏风险：

- `docs/adr/README.md`
- `docs/adr/0001-lightweight-foreground-subagents.md`
- `docs/adr/0002-mvp-boundary-decisions.md`
- `docs/adr/0003-autonomous-subagent-triggering.md`
- `docs/adr/0004-bundled-readonly-web-tools.md`
- `docs/adr/0005-evolve-into-devkit-pi.md`
- `docs/archive/enhancement-of-fetch_content-tool-plan.md`
- `docs/issues/issue-log.md`（可暂时保留；后续再决定是否迁入 development）
- `docs/development/docs-restructure-plan.md`（本文件）

说明：ADR 和 archive 具有历史记录属性，路径稳定比导航层级更重要。可通过 VitePress sidebar 控制是否进入主导航。

## 建议迁移到各分区的文档

### getting-started

| 当前文档 | 建议目标 | 处理方式 |
|---|---|---|
| `README.md` / `README.zh.md` 的快速开始部分 | `getting-started/installation.md`、`getting-started/quick-start.md` | 后续提取，不在本轮修改 README |
| `docs/guides/goals-and-scope.md` 的项目目标 | `getting-started/overview.md` | 可复用主体内容 |

### concepts

| 当前文档 | 建议目标 | 处理方式 |
|---|---|---|
| `docs/guides/goals-and-scope.md` 的边界部分 | `concepts/module-boundaries.md` | 拆分边界说明 |
| `docs/guides/architecture.md` | `concepts/architecture.md` | 需要先按当前源码重写结构图 |
| `docs/guides/security-model.md` | `concepts/security-model.md` | 保留并校正 web storage 描述 |
| `docs/reference/result-schema.md` 的通用部分 | `concepts/result-model.md` | 扩展到 web/lsp 或明确仅 subagent |

### features

| 当前文档 | 建议目标 | 处理方式 |
|---|---|---|
| `docs/reference/subagent-tool.md` + `docs/reference/agent-definition.md` 的使用性内容 | `features/subagents.md` | 用户指南与 reference 分离 |
| `docs/guides/fetch_content-enhancement.md` 的用户行为部分 | `features/web-tools.md` | 移除 Phase 叙述，保留功能事实 |
| README 的 LSP 工具和 hook 段落 | `features/lsp.md` | 需补充 actions 和 hook 限制 |
| README 的命令段落 | `features/toolkit-commands.md` | 与 `src/modules/commands/register.ts` 对齐 |

### configuration

| 当前文档 | 建议目标 | 处理方式 |
|---|---|---|
| `docs/reference/configuration.md` 顶层说明 | `configuration/overview.md` | 保留配置路径和 namespace 说明 |
| `docs/reference/configuration.md` Subagents 部分 | `configuration/subagents.md` | 与 `DEFAULT_SUBAGENTS_CONFIG` 对齐 |
| `docs/reference/configuration.md` Web 部分 + fetch_content 配置 | `configuration/web.md` | 补全所有默认值 |
| provider 子配置 | `configuration/web-providers.md` | 新增文档，按 provider 展开 |
| `docs/reference/configuration.md` LSP 部分 | `configuration/lsp.md` | 与 `ResolvedLspConfig` 对齐 |

### reference

| 当前文档 | 建议目标 | 处理方式 |
|---|---|---|
| `docs/reference/subagent-tool.md` | `reference/subagent-tool.md` | 可原路径保留或迁移后加重定向 |
| `docs/reference/agent-definition.md` | `reference/agent-definition.md` | 可原路径保留 |
| `docs/reference/result-schema.md` | `reference/result-schema.md` 或 `reference/error-codes.md` | 需扩展或明确范围 |
| `docs/reference/web-tools-error-codes.md` | `reference/web-error-codes.md` | 先确认源码错误码 |
| 无 | `reference/web-tools.md` | 新增：参数、结果、storage selector |
| 无 | `reference/lsp-tool.md` | 新增：actions、参数、权限、错误 |
| 无 | `reference/toolkit-command.md` | 新增：slash command 子命令 |
| `docs/reference/configuration.md` | `reference/configuration-schema.md` | 作为完整 schema/defaults canonical 文档 |

### development

| 当前文档 | 建议目标 | 处理方式 |
|---|---|---|
| `docs/guides/extension-api.md` | `development/architecture-notes.md` | 维护者 API 说明 |
| `docs/guides/testing.md` | `development/testing.md` | 保持与 tests 结构同步 |
| `docs/guides/release-checklist.md` | `development/release-checklist.md` | 维护者发布流程 |
| `docs/guides/personal-toolkit-feature-roadmap.md` | `development/roadmap.md` | 先标注旧路径需确认 |
| `docs/guides/add-convert_content-tool-plan.md` | `development/proposals/convert-content.md` | 保持 proposed，不进入功能导航 |
| `docs/issues/issue-log.md` | `development/issue-log.md` 或保留 `issues/` | 二选一，需人工确认 |

## 可能已经过时、需要人工确认的文档

1. `docs/guides/architecture.md`
   - 旧路径与当前 `src/modules/*` 不一致。
   - 建议优先更新，因为它会成为 VitePress `concepts/architecture.md` 的基础。

2. `docs/adr/0003-autonomous-subagent-triggering.md`
   - 仍提到 `src/extension/index.ts`、`ExtensionConfig.injectDelegationPolicy`、旧配置路径 `~/.pi/agent/extensions/subagent/config.json`。
   - 当前应为 `src/modules/subagents/register.ts`、`ToolkitConfig.subagents.injectDelegationPolicy`、`~/.pi/agent/extensions/devkit-pi/config.json`。
   - ADR 可保留历史描述，但建议追加“当前实现位置”说明。

3. `docs/adr/0004-bundled-readonly-web-tools.md`
   - 推荐模块结构为 `src/web/*`，当前实际为 `src/modules/web/*`。
   - 文中写“不包含多 provider 自动编排”，当前已有 `provider: auto`、`providerPriority` 和 provider availability selection。
   - 需人工确认是否按历史 ADR 保留，或追加实施后修订说明。

4. `docs/adr/0005-evolve-into-devkit-pi.md`
   - 文件名是 0005，但标题写 `ADR 0004`。
   - 需人工确认编号修正。

5. `docs/guides/security-model.md`
   - “仅使用内存保存 `responseId` 结果”与 `src/modules/web/register.ts` 中 session append/restore 行为不完全一致。
   - 需确认对外表述：不写项目文件，但可能写入/恢复 pi session 自定义 entry。

6. `docs/reference/web-tools-error-codes.md`
   - 与 `src/modules/web/errors.ts`、`storage.ts`、README 错误码列表不完全一致。
   - 需人工确认 canonical error code source。

7. `docs/guides/personal-toolkit-feature-roadmap.md`
   - 存在旧项目名 `pi-subagents`、旧入口 `src/extension/index.ts`、旧模块路径。
   - 因状态为 `proposed`，可保留，但不应进入主导航。

8. `docs/guides/add-convert_content-tool-plan.md`
   - `convert_content` 尚未实现。
   - 文档状态为 `proposed`，需确保未来用户文档不把它写成已可用功能。

## 目前缺失的核心文档

1. **Subagents 使用指南**
   - 应覆盖：何时委托、5 个内置 agents、自定义 agent 路径、frontmatter 限制、readonly 边界、LSP/web tools 在子代理中的可用性、递归限制、重试与超时配置。

2. **LSP 功能文档与 reference**
   - 应覆盖：`lsp` tool actions、参数要求、readonly-safe vs privileged actions、`allowMutatingActions`、子代理中始终禁用 privileged actions、`workspace-diagnostics` 限制、hook 模式、支持语言服务器列表、错误码。

3. **Web tools 使用指南与 reference**
   - 应覆盖：`web_search` 参数、`fetch_content` 参数、`get_search_content` selector、`responseId` 生命周期、Jina fallback、私网访问限制、内容类型支持、输出截断、缓存/并发/connection pool、observability logs。

4. **Web provider 配置文档**
   - 应覆盖：`ddgs` 零配置默认 provider，`brave` 是否存在配置项需人工确认，`tavily`/`serper` API key env，`openserp`/`searxng` enable/baseUrl/defaultEngine，`provider=auto` 和 `providerPriority` 行为。

5. **/toolkit 命令 reference**
   - 应覆盖：`doctor`、`modules`、`logs [--search|--fetch] [--limit N]`、`agents`、`lsp`、`activity`、`help`，以及命令仅主代理进程注册。

6. **统一 error codes 文档**
   - 应覆盖：subagent、web、lsp 三类错误码。
   - 当前 `src/shared/errors.ts` 只合并 subagent/lsp，web 有独立 `src/modules/web/errors.ts`，需人工确认是否统一。

7. **完整 configuration schema/defaults 文档**
   - 应以 `src/config/load-config.ts` 和 `src/shared/types.ts` 为准，逐项列出默认值、类型、行为、无效值 normalize 规则。

8. **测试映射文档**
   - 应说明新增/修改功能时应该更新哪些测试文件，例如 web provider 改动对应 `tests/web/providers/*`，命令改动对应 `tests/commands/register.test.ts` 等。

## 后续建立 VitePress 文档站的最小步骤

1. **先确定 canonical 文档信息架构**
   - 接受或调整本文件提出的 `getting-started / concepts / features / configuration / reference / development` 分区。

2. **建立 VitePress 所需最小入口，但暂不迁移正文**
   - 后续新增 `docs/index.md` 或复用 `docs/README.md`。
   - 新增 `.vitepress/config.ts` 时只配置 title、nav、sidebar，不改变现有文档路径。

3. **先修正阻塞性过时文档**
   - 优先更新 `architecture.md`、`configuration.md`、`web-tools-error-codes.md`。
   - 这些是 VitePress 主导航最容易暴露的不一致点。

4. **新增缺失 reference，而不是先重写所有 guide**
   - 优先新增：`reference/lsp-tool.md`、`reference/web-tools.md`、`reference/toolkit-command.md`、`configuration/web-providers.md`。

5. **给历史/提案文档加导航隔离**
   - ADR、archive、proposals 可保留，但默认不放入用户主路径。

6. **增加 docs 同步检查项**
   - 扩展 `pnpm docs:check`，至少检查：README/docs 中的内置 agents、配置默认值、错误码、tool actions 与源码常量一致。

7. **最后再做路径迁移和重定向**
   - 若要移动文件，先建立旧路径到新路径的跳转或保留 stub，避免 README、ADR、外部链接断裂。

## 风险与边界

1. **不要把 proposed/historical 文档误发布为当前功能**
   - `convert_content`、roadmap 中的未来能力不应进入 features 主导航。

2. **不要假设不存在的功能**
   - 当前不支持 background/parallel/chain/intercom/worktree/agent management actions。
   - 当前不应文档化未实现的 `convert_content` 工具为可用能力。

3. **配置文档必须以源码默认值为准**
   - canonical source 是 `src/config/load-config.ts` 与 `src/shared/types.ts`。
   - README 和 docs 若不一致，应标记需人工确认，不能直接扩大能力描述。

4. **错误码需要先定 canonical source**
   - web 错误码当前分散在 `src/modules/web/errors.ts`、具体 handler/storage 返回、README 文档中。
   - 在未确认前，文档应标记“需人工确认”，避免破坏调用方依赖。

5. **ADR 允许保留历史事实**
   - 不建议把 ADR 全量改写为当前实现，否则会损失决策上下文。
   - 更安全做法是在 ADR 顶部或底部追加“当前实现已演进为...”说明。

6. **VitePress 引入应独立成后续任务**
   - 本轮不引入依赖、不新增构建脚本、不调整 package scripts。
   - 文档站工程化应在信息架构确认后进行。

## 建议执行顺序

1. 修正 `docs/guides/architecture.md`，以当前 `src/modules/*` 为准。
2. 补全 `docs/reference/configuration.md`，覆盖 `DEFAULT_CONFIG` 全量默认值。
3. 统一并修正 web error codes 文档，先标出 `INVALID_INPUT`、`NOT_FOUND` 等实际返回。
4. 新增 LSP、web tools、/toolkit 三个 reference 文档。
5. 再开始 VitePress 最小配置与 sidebar 建设。
