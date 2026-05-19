# AGENTS.md — 开发与协同约束规范

## 1. 项目概述与结构 (Project Overview & Structure)

### 1.1 项目概述

`devkit-pi` 是面向个人工作流的综合 `pi coding` 扩展包，旨在通过提供一组轻量、模块化、可组合的专业工具，辅助主代理高效完成 coding 任务。主代理是唯一的编排者（Orchestrator），子代理不得调度其他子代理。本扩展核心提供以下功能：

* **Subagents（任务委派）**：执行任务的发现、路由与轻量级委派。
* **Web Research（网络检索）**：提供搜索引擎整合、网页获取与轻量级内容提取。
* **Convert Content（内容转换）**：本地/远程复杂文件向 Markdown 的标准转换（依赖 MarkItDown CLI）。
* **LSP Code Intelligence（代码智能）**：提供语言服务器生命周期管理与自动 Diagnostics Hook。
* **Toolkit Commands（开发者工具箱）**：统一注册 `/toolkit` 开发者斜杠命令。
* **Guards（轻量守卫）**：提供 Git Context、首次写入（First-write）以及结果验证的轻量流程软提醒。

### 1.2 项目完整结构

```text
  devkit-pi/
  ├─ .github/                                # GitHub 配置
  │  └─ workflows/                           # CI/CD 工作流
  │     ├─ ci.yml                            # 持续集成流程
  │     └─ docs.yml                          # 文档构建/检查流程
  ├─ agents/                                 # 内置子代理定义（Markdown）
  │  ├─ explorer.md                          # 代码探索代理
  │  ├─ implementer.md                       # 实现规划代理
  │  ├─ researcher.md                        # 研究检索代理
  │  ├─ reviewer.md                          # 代码评审代理
  │  └─ tester.md                            # 测试规划代理
  ├─ docs/                                   # 对外文档站点
  │  ├─ .vitepress/                          # VitePress 配置/构建目录
  │  │  └─ config.ts                         # VitePress 站点配置
  │  ├─ guides/                              # 使用指南（英文）
  │  ├─ public/                              # 文档静态资源
  │  ├─ reference/                           # 配置/工具/错误码参考（英文）
  │  └─ zh/                                  # 中文文档
  │     ├─ guides/                           # 使用指南（中文）
  │     └─ reference/                        # 参考文档（中文）
  ├─ internal-docs/                          # 内部维护文档（全中文，不对外）
  │  ├─ adr/                                 # 架构决策记录
  │  ├─ archive/                             # 历史归档
  │  ├─ audit/                               # 审计记录
  │  ├─ issues/                              # 问题闭环记录
  │  ├─ maintain/                            # 维护手册
  │  └─ planning/                            # 规划提案
  ├─ scripts/                                # 项目脚本
  │  ├─ check-docs.mjs                       # 文档一致性检查
  │  ├─ report-v8-coverage.mjs               # 覆盖率报告生成
  │  └─ run-v8-coverage.mjs                  # 覆盖率执行脚本
  ├─ src/                                    # 主源码目录
  │  ├─ config/                              # 配置加载/校验/归一化
  │  ├─ modules/                             # 功能模块
  │  │  ├─ commands/                         # /toolkit 命令注册与分发
  │  │  ├─ convert/                          # convert_content 工具实现
  │  │  ├─ guards/                           # 轻量守卫（git/first-write/verify）
  │  │  ├─ lsp/                              # LSP 工具与语言服务器管理
  │  │  ├─ subagents/                        # 子代理发现/路由/执行
  │  │  │  └─ commands/                      # subagents 子命令
  │  │  └─ web/                              # Web 检索/抓取能力
  │  │     └─ providers/                     # 搜索与抓取 provider 适配层
  │  ├─ shared/                              # 跨模块共享类型/错误/工具
  │  └─ index.ts                             # 扩展入口（组合注册各模块）
  ├─ tests/                                  # 测试目录（按模块镜像）
  │  ├─ commands/
  │  ├─ convert/
  │  ├─ fixtures/
  │  │  └─ ts-project/
  │  │     └─ src/
  │  ├─ guards/
  │  ├─ lsp/
  │  ├─ shared/
  │  ├─ subagents/
  │  └─ web/
  ├─ .gitignore                              # Git 忽略配置
  ├─ AGENTS.md                               # 项目协作与开发规范（核心约束）
  ├─ CHANGELOG.md                            # 版本变更记录
  ├─ LICENSE                                 # MIT 许可证
  ├─ README.md                               # 项目说明（英文）
  ├─ README.zh.md                            # 项目说明（中文）
  ├─ biome.json                              # Biome lint/format 配置
  ├─ index.ts                                # 包根入口（重导出 src/index.ts）
  ├─ package.json                            # 包元数据、脚本、依赖、pi 扩展配置
  ├─ pnpm-lock.yaml                          # pnpm 锁文件
  ├─ pnpm-workspace.yaml                     # pnpm workspace 配置
  └─ tsconfig.json                           # TypeScript 编译配置

```

---

## 2. 核心原则与架构一致性策略 (Core Principles & Consistency)

### 2.1 核心原则

1. **主代理编排**：主代理是唯一的调度核心；子代理严禁自我嵌套或调度其他子代理。
2. **模块化优先**：综合能力不等于大杂烩；每个模块、工具、Provider、Handler 必须具有清晰的职责边界。
3. **架构一致性优先**：相似职责的模块必须采用完全相同的结构、命名、配置、错误映射、测试和文档模式。
4. **不保留旧结构**：本项目不优先兼容遗留的内部废弃结构；当旧结构与清晰架构冲突时，直接规范化并重构旧结构。
5. **轻量核心**：核心包必须避免强依赖浏览器渲染、OCR、重型 PDF 布局分析、Office 本地转换、音频转写、本地大模型等重型基础设施。
6. **渐进增强**：重型或外部依赖能力应作为 Optional Provider、外部 CLI 命令或显式启用项引入。
7. **安全默认**：网络访问、文件系统、外部命令执行、LSP Mutating Actions（变更操作）均必须默认受限。
8. **失败可解释**：工具调用失败必须返回稳定的系统错误码、可读原因以及下一步改进建议。
9. **测试与文档同步**：任何用户可见行为、配置项、工具 Schema、Provider 行为发生变化时，必须在当前轮次同步更新测试和文档。

### 2.2 架构一致性决策偏好

项目坚决采用以下演进偏好：

```text
Consistent + Clean + Slightly Breaking（一致、整洁、允许轻微破坏性变更）
优先于
Backward Compatible + Inconsistent + Special-cased（向后兼容、不一致、特殊分支处理）

```

在添加或修改功能前，必须按照以下基线进行自检：

* 是否已有平行模块或类似实现？应镜像哪一个现有结构？
* 是否需要先规范或重构对应的旧结构？
* 相关的测试和文档是否已规划同步更新？
* 是否引入了新的依赖、外部命令，或导致安全边界发生变化？

---

## 3. 交互与对话风格 (Interaction & Conversational Style)

* **简明扼要**：回答必须保持极其简练、直击要点，拒绝冗长。
* **禁用 Emoji**：严禁在 Commit（提交记录）、Issue（问题）、PR（合并请求）评论、代码注释及任何技术文档中使用表情符号。
* **杜绝冗余文本**：禁止包含任何无实质意义的废话、客套话或情绪化的填补文本。
* **纯技术文本风格**：仅使用技术化专业表述，保持礼貌但直截了当（例如：使用 `"Thanks @user"`，而非 `"Thanks so much @user!"`）。
* **先答后动**：当用户提出问题时，**必须先正面回答问题**，然后再执行代码修改、运行实现命令或变更操作。
* **结果闭环建议**：在每轮交互输出的最后，**必须明确给出下一轮的操作或演进建议**。

---

## 4. 职责边界与核心工具规范 (Module & Tool Boundaries)

模块间严禁深度导入其他功能模块的私有实现。需要共享逻辑时，必须将其抽取到 Public Interface、模块内公共层或 `shared/` 目录下。

### 4.1 `web_search`（网络搜索工具）

* **主要职责**：负责执行结构化的网络检索。
* **输入输出流**：`query + options → normalized SearchResult[]`
* **行为规范**：默认仅返回高相关度的搜索条目列表；当 `includeContent=true` 时，允许复用 `fetch_content` 的轻量抓取流程附带正文片段，但仍不负责复杂文件转换。

### 4.2 `fetch_content`（内容获取工具）

* **主要职责**：负责轻量 URL 内容获取与网页友好文本类型的解析。
* **支持类型**：HTML、Plain text、Markdown、JSON（及 `application/*+json`）、CSV/TSV、XML/RSS/Atom、YAML、Source text 以及安全的 `text/*` 回退处理。
* **边界限制**：不负责 PDF/Office 本地解析、OCR 识别、音频转写、浏览器重度渲染、LLM 图片描述或递归压缩包解析。遇到此类复杂或不支持的类型时，必须返回结构化错误。

### 4.3 `convert_content`（内容转换工具）

* **主要职责**：作为独立工具或 Optional Provider 存在，专门用于通过外部服务或外部 CLI 将本地文件或安全下载后的远程复杂文件转换为标准 Markdown。
* **依赖管理**：第一优先级是 Optional External Provider（如 MarkItDown CLI）。严禁将 Python 运行时、Java 环境、浏览器引擎、OCR 核心、Docling、Tika、Pandoc、Marker 等重度系统依赖强制加入 `devkit-pi` 核心包中。

### 4.4 其他模块职责

* **`subagents`**：处理 Agent 的 Markdown 定义、动态发现、条件路由、执行链路及结果收敛。
* **`lsp`**：封装 `lsp` 工具，驱动 Language Server Manager、管理代码智能、触发 Diagnostics Hook。
* **`commands`**：统一处理 `/toolkit` 斜杠命令的注册、分发与帮助上下文。
* **`guards`**：针对 Git Context、首次写入、验证状态进行轻量的软提醒工作流引导，**不做硬性拦截（Hard gate）**。

### 4.5 Provider / Adapter 抽象规则

任何可能支持多个后端的功能（如：Web Search, Content Fetch, Content Conversion, LSP Server Manager Adapters, Diagnostics Hooks）必须严格遵守：

* 高层工具必须依赖抽象接口，严禁依赖具体实现。
* 具体实现必须通过 Registry、Factory 或配置注入选择。
* Vendor-specific（厂商特定）的响应结构必须在 Provider 边界内完成归一化。
* 新增 Provider 必须完美镜像现有同类实现的目录树、命名模式、测试用例和参考文档。

---

## 5. 代码质量与开发规范 (Code Quality Rules)

* **完整阅读文件**：在进行大范围代码变更、修改未曾完整审查的文件，或者用户要求进行调查与审计时，**必须完整阅读相关文件**。严禁仅依赖搜索代码片段（Snippets）来进行全局或跨文件的盲目修改。
* **严格类型约束**：除非绝对具有不可抗力，否则代码中**严禁使用 `any` 类型**。
* **禁止不合理的单行辅助函数**：禁止编写仅在单一调用点使用的单行辅助函数；必须直接将其内联（Inline）到调用处。
* **显式检查真实类型**：严禁凭空猜测外部 API 或依赖包的类型定义，必须直接检查 `node_modules` 中的真实类型声明。
* **禁止内联导入**：**严禁使用内联导入（Inline Imports）**。禁止使用 `await import("./foo.js")`，禁止在类型声明位置使用 `import("pkg").Type`，禁止针对类型使用动态导入。必须始终使用标准的顶级导入（Top-level Imports）。
* **禁止降级避错**：**严禁通过删除或降级代码来解决由过期依赖引起的类型错误**；必须通过升级或修复该依赖来从根本上解决。
* **变更确认**：在删除任何看似刻意设计的核心功能或现有代码前，必须先询问用户并获得显式确认。
* **按需兼容**：除非用户明确要求，否则无需主动保持向后兼容性。
* **快捷键解耦**：严禁硬编码按键检查（例如：`matchesKey(keyData, "ctrl+x")`）。所有快捷键绑定必须可配置，且默认值必须添加至相应的映射对象中（如 `DEFAULT_EDITOR_KEYBINDINGS` 或 `DEFAULT_APP_KEYBINDINGS`）。
* **减少重复与复杂度**：当类似逻辑出现三次或以上时，必须将其抽取为共享抽象（如：Shared types, Validation helpers, Error builders, Config normalization）。文件体积过大时，应按职责（Types, Config, Provider, Registry, Handlers）进行清晰地解耦拆分。

---

## 6. 配置、错误与安全默认值 (Config, Errors & Safety)

### 6.1 配置项规范

所有用户可见配置必须保持显式（Explicit）、经过校验（Validated）、文档完备（Documented），且在注入业务模块前完成归一化（Normalized）。

* **全局配置加载流程**：`Load raw config → Validate → Apply safe defaults → Normalize → Pass typed config into modules`
* **命名一致性字段池**：必须优先使用项目已采用的稳定命名字段，严禁引入平行但含义重复的别名。
> *常用配置字段池*：`enabled`, `provider`, `providerPriority`, `timeoutMs`, `maxResponseBytes`, `maxContentChars`, `maxResults`, `allowPrivateNetwork`, `enableJinaFallback`, `debug`, `baseUrl`, `apiKeyEnv`, `allowWrite`, `allowLspTools`, `allowMutatingActions`, `mode`, `maxAttempts`, `ttlMs`, `maxConcurrent` 等。

### 6.2 错误、日志与诊断

* **结构化错误**：公共错误返回必须包含稳定的系统错误码（Stable error code）和人类可读消息（Human-readable message）。新增工具错误时，应补充提供工具/服务商名称、原因摘要（Cause summary）以及下一步明确的改进建议。
* **安全防泄漏**：错误信息与日志中**严禁泄露** API Key、Token、本地 Secrets、完整环境变量、过长的底层 stderr 或私有文件内容。
* **禁止 Ad-hoc 日志**：功能模块中严禁随意散落 `console.log`。用户可见状态、警告和健康检查必须通过统一的 Diagnostics 机制进行输出。

### 6.3 安全默认值 (Safety Defaults)

* **网络工具规范**：必须具备明确的超时断开、最大响应长度限制（`maxResponseBytes`）、重定向层数限制和 User-Agent 控制。**默认禁止访问** localhost、Loopback 地址、元数据 IP（Metadata IPs）、私有网络网段（Private network ranges）以及 `file://` 协议，除非用户显式将其配置为允许。
* **文件系统工具规范**：必须具备严格的工作空间边界校验（Workspace boundary checks）和单文件大小限制。在处理 LSP 路径参数或自有路径时，默认绝不允许越过当前的 Workspace 或已定义的配置目录边界。
* **外部命令工具规范**：执行外部命令前必须显式检查命令存在性（Existence checks），配置严苛的 Timeout，限制输出长度，并截断多余的 stderr。除非绝对必要，否则**禁止进行 Shell 插值（No shell interpolation）**。
* **内容安全规范**：最大输出长度必须受限，且具备完善的截断元数据（Truncation metadata）。不支持的媒体/文本类型必须妥善拦截，**严禁自动执行下载的任何内容**。

---

## 7. 命令执行与工作流规范 (Commands & Workflow)

在代码修改完成后，必须根据所处仓库上下文，严格执行规范的质量校验。

### 7.1 本地扩展包（`devkit-pi`）开发校验

在修改本地代码后（不包括仅修改文档），必须在项目根目录运行以下命令进行完备性校验：

```bash
pnpm typecheck   # 类型显式校验
pnpm lint        # 静态代码检查
pnpm test        # 单元测试自动化运行

```

涉及文档完整性检查、格式化或覆盖率分析时，运行：

```bash
pnpm format
pnpm test:coverage
pnpm docs:check

```

### 7.2 PR 工作流与贡献准入 (PR Workflow & Contribution Gate)

* **线上优先分析**：在未进行本地拉取（Pull）之前，必须先在线分析 PR 的代码架构。
* **严禁独立创建 PR**：Agent **严禁擅自主动创建 PR**。必须始终在特性分支（Feature branch）上工作，直到完全契合用户需求，然后变基（Rebase）并直接合并、推送至 `main` 主干。
* **准入控制机制**：新贡献者的 Issue 和 PR 会分别被 `.github/workflows/issue-gate.yml` 和 `pr-gate.yml` 自动关闭。只有维护者评论 `lgtmi`（批准后续 Issue）或 `lgtm`（批准后续 Issue 与 PR 提交权）后方能放行。
* **发表评论规范**：必须先将完整评论内容写入临时文件，然后使用 `gh issue comment --body-file` 或 `gh pr comment --body-file` 发布。**严禁在 Shell 中直接通过 `--body` 传递多行 Markdown**。
* **Commit 闭环 Issue**：Commit 信息中必须包含 `fixes #<number>` 或 `closes #<number>`，以便在合并时自动关闭对应的 Issue。

---

## 8. ⚠️ 重要：多 Agent 并行 Git 规则（至关重要） ⚠️

当多个 Agent 同时在同一个工作树（Worktree）中并发修改不同的文件时，你**必须**毫无保留地死守以下 Git 防御红线：

### 8.1 提交审查红线

* **仅允许提交你在“本次会话”中亲自创建或修改的文件**。
* **绝对禁止使用 `git add -A` 或 `git add .**` —— 这些盲目暂存的命令会毁灭性地卷走其他并行 Agent 正在写的内容。
* **必须使用 `git add <specific-file-paths>**`，清晰、精准地逐一列出属于你职责内的文件路径。
* 在执行 Commit 之前，必须执行 `git status` 逐行人工复核，确保暂存区（Staged area）内没有任何不属于你的文件。

### 8.2 绝对禁用的 Git 危险操作

以下命令在并发环境下会瞬间抹杀其他 Agent 的未提交成果，**无条件严禁执行**：

* `git reset --hard` —— 毁灭性破坏未提交的共享变更。
* `git checkout .` —— 毁灭性破坏未提交的共享变更。
* `git clean -fd` —— 擅自删除其他并发进程创建的未跟踪文件。
* `git stash` —— 强行暂存包含其他 Agent 工作成果在内的所有变更。
* `git commit --no-verify` —— 恶意绕过团队预设的工程守卫与合规校验。

### 8.3 安全 Git 提交流程示例

```bash
# 1. 严格审查当前状态
git status

# 2. 精准添加且仅添加属于你自己修改的文件
git add src/web/providers/select-provider.ts
git add CHANGELOG.md

# 3. 规范化提交并关联 Issue 闭环
git commit -m "fix(subagents): description of the specific fix"

# 4. 安全推高（若遇冲突，绝不要执行 reset 或 checkout）
git pull --rebase && git push

```

* **变基冲突解决原则**：当发生 Rebase 冲突时，**仅解决属于你自己修改的文件中的冲突**。若冲突发生在未经你动过的外部文件中，必须立即中止变基（`git rebase --abort`）并询问用户。
* **严禁强行推送**：在任何情况下，**严禁执行强推（No force push）**。

### 8.4 用户覆盖规则 (User Override)

若用户的当前直接指示与本 `AGENTS.md` 设定的规则发生冲突，**必须先请求用户显式确认**是否需要覆盖（Override）既定工程规则。只有在获得明确答复后，方可谨慎执行其特殊指示。

---

## 9. 测试与文档同步要求 (Testing & Documentation Rules)

* **测试全覆盖基线**：任何新增的工具、服务商、控制逻辑或行为变更，必须在本地配套对应的单元测试。测试结构必须与实现结构实现精确的“镜像”。测试用例必须至少覆盖：**成功路径（Success path）**、**非法输入拦截（Invalid input）**、**依赖缺失处理（Missing dependency）**、**超时断开（Timeout）**、**截断与长度超限（Truncation/Size limit）**、**厂商特定失败（Provider failure）**、**归一化输出结构（Normalized shape）** 以及 **禁用状态下的表现行为**。
* **严禁跳过测试**：严禁无故跳过任何单测，除非有极其明确的团队书面理由。
* **文档即时同步**：以下用户可见元素若发生任何变化，必须在同一轮变更中同步更新文档，严禁留下任何描述过时陈旧行为的垃圾文档：
> *同步清单*：工具名称、Slash 命令名称、配置 Key 键名、服务商底层行为、支持的内容媒体类型、外部系统依赖依赖变更、系统错误码定义、功能安全边界。

---

## 10. 输出结果要求 (Output Recommendations)

* **每轮输出的最末尾，必须给出清晰、明确、可操作的下一轮操作或演进建议。**