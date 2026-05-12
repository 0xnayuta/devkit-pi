# AGENTS.md

## 项目概述

`devkit-pi` 是面向个人工作流的综合 pi coding 扩展包，提供：

```text
subagents（任务委派）
+ web research（搜索、网页获取、轻量内容提取）
+ LSP code intelligence（代码智能与自动 diagnostics hook）
+ toolkit commands（统一 `/toolkit` 开发者命令）
```

它不是完整多代理框架，而是让主代理可以调用一组轻量、模块化、可组合的专业工具完成 coding 任务。

---

## 核心原则

1. **主代理编排**：主代理是唯一 orchestrator；子代理不得调度其他子代理。
2. **模块化优先**：综合能力不等于大杂烩；每个模块、工具、provider、handler 必须有清晰边界。
3. **架构一致性优先**：相似职责必须使用相同或高度相似的结构、命名、配置、错误、测试和文档模式。
4. **不保留旧结构**：本项目不优先兼容遗留内部结构；当旧结构与清晰架构冲突时，直接规范化旧结构。
5. **轻量核心**：核心包避免强依赖浏览器、OCR、PDF 布局分析、Office 转换、音频转写、本地模型等重型能力。
6. **渐进增强**：重型或外部能力应作为 optional provider、外部 CLI 或显式启用项。
7. **安全默认**：网络、文件系统、外部命令、LSP mutating actions 都必须默认受限。
8. **失败可解释**：工具失败必须返回稳定错误码、可读原因和下一步建议。
9. **测试与文档同步**：用户可见行为、配置、工具 schema、provider 行为变化时，必须同步更新测试和文档。

---

## 架构一致性策略

优先考虑：

```text
相同职责 → 相同结构
相同概念 → 相同命名模式
相同生命周期 → 相同执行模式
相同 provider 类型 → 相同 adapter 接口
相同工具类别 → 相同 schema / 配置 / 测试 / 文档模式
```

不要因为旧结构已经存在就继续保留。

如果新设计能提升平行模块一致性，应更新旧模块以匹配新结构，而不是增加特殊分支、兼容层或过渡 wrapper。

添加或修改功能前，必须先检查：

1. 是否已有平行模块或类似实现。
2. 应镜像哪个现有结构。
3. 是否需要先规范旧结构。
4. 是否需要同步更新测试和文档。
5. 是否引入新依赖、外部命令或安全边界变化。

默认决策偏好：

```text
consistent + clean + slightly breaking
```

优先于：

```text
backward compatible + inconsistent + special-cased
```

---

## 模块边界

推荐长期边界：

```text
src/
├─ index.ts        # extension main entry：加载配置并组合注册模块
├─ modules/        # subagents / web / lsp / commands 等功能模块
├─ config/         # 配置路径、默认值、merge / normalize
└─ shared/         # 跨模块共享类型、错误、委派策略、session/stdio 小型工具

index.ts           # package root entry，重导出 src/index.ts
agents/            # 5 个内置 agent markdown 定义
tests/             # 单元测试，按模块镜像 src/modules 结构
docs/              # guides / reference / ADR / planning / archive
```

职责边界：

- `subagents`：agent 定义、发现、路由、执行、结果处理。
- `web`：`web_search`、`fetch_content`、`get_search_content`、搜索 provider、内容 handler、缓存、并发、HTTP pool、Jina fallback、活动记录。
- `lsp`：`lsp` tool、language server manager、代码智能、diagnostics hook。
- `commands`：统一 `/toolkit` slash command 注册和帮助文本。
- `config`：配置加载、校验、默认值和归一化。
- `shared`：多个模块共享的小型通用能力。

模块不得深度导入其他功能模块的私有实现。需要共享逻辑时，应抽取到 public interface、模块内公共层或 `shared/`。

---

## 单一职责与工具边界

每个 tool、provider、handler、module 应只有一个主要职责。

### `web_search`

主要负责搜索。

```text
query + options → normalized SearchResult[]
```

默认只返回搜索结果；当 `includeContent=true` 时可以复用 `fetch_content` 的轻量抓取流程附带正文片段，但仍不负责复杂文件转换。

### `fetch_content`

负责轻量 URL 内容获取与网页友好文本类型解析。

适合处理：

- HTML / plain text / Markdown
- JSON / `application/*+json`
- CSV / TSV
- XML / RSS / Atom
- YAML
- source text
- safe `text/*` fallback

不负责：

- PDF / Office 本地解析
- OCR
- 音频转写
- 浏览器渲染
- LLM 图片描述
- 递归压缩包解析

遇到复杂或不支持的类型时，应返回结构化错误。`convert_content` 已作为独立工具实现，用于通过 optional external provider 将本地文件或安全下载后的远程文件转换为 Markdown；文档、错误建议或 agent 指令可以将其描述为已实现能力，但必须准确说明依赖 MarkItDown CLI 且受配置与安全边界限制。

### `convert_content`

复杂文件转 Markdown 能力应保持为独立工具或 optional provider，并同步配置、测试和参考文档。

第一优先级是 optional external provider，例如 MarkItDown CLI。不得把 Python、Java、browser engine、OCR、Docling、Tika、Pandoc、Marker 等重依赖强制加入核心包。

---

## Provider / Adapter 规则

任何可能支持多个后端的功能都必须使用 provider / adapter interface。

适用范围包括：

- web search providers
- content fetch handlers
- future content conversion providers
- LSP server manager adapters（如果将来拆出多后端）
- diagnostics hooks/providers（如果将来拆出多后端）
- external command runners（例如子进程启动、未来 optional converter CLI）

要求：

- 高层工具依赖接口，不依赖具体实现。
- 具体实现通过 registry、factory 或配置选择。
- provider / handler 内部隐藏后端或格式细节。
- vendor-specific response 必须在 provider 边界归一化。
- timeout、truncation、error handling、diagnostics、external command runner 等通用逻辑应尽量复用 shared 或模块内 helper。
- 新 provider / handler 必须镜像现有同类实现的目录、命名、测试和文档模式。

---

## 配置规则

所有用户可见配置必须：

- explicit
- validated
- documented
- normalized before use
- equipped with safe defaults

推荐流程：

```text
load raw config
→ validate
→ apply defaults
→ normalize
→ pass typed config into modules
```

功能模块应接收归一化后的 typed config object，不应在深层业务逻辑中自行解析全局配置。

优先使用当前项目已经采用的稳定命名：

```text
enabled
provider
providerPriority
timeoutMs
maxResponseBytes
maxContentChars
maxResults
maxStoredResults
maxStoredContentChars
allowPrivateNetwork
enableJinaFallback
jinaTimeoutMs
jinaTriggers
debug
baseUrl
apiKeyEnv
defaultEngine
maxDepth
allowWrite
allowLspTools
allowedLspActions
injectDelegationPolicy
allowMutatingActions
mode
maxAttempts
maxEntries
ttlMs
maxConcurrent
maxQueueSize
maxSockets
maxFreeSockets
```

当前命名应以 `src/config/load-config.ts`、`src/shared/types.ts` 和 `docs/reference/configuration.md` 为准。不要引入与现有字段平行但含义重复的名字，例如用 `maxDownloadBytes` 代替 `maxResponseBytes`，或用 `fallbackOrder` 代替 `providerPriority`。

不要为同一概念引入多个名字，例如混用 `provider`、`backend`、`engine`、`driver`。

---

## 错误、日志与诊断

错误必须结构化、可操作、保持一致。

当前公共错误返回至少应包含：

- stable error code
- human-readable message

新增或重构 tool / provider error 时，应优先补充：

- tool / module / provider name
- cause summary when available
- suggested next action when useful
- safe metadata

错误信息不得泄漏 API key、token、本地 secrets、完整环境变量、过长 stderr 或私有文件内容。

用户可见状态、警告和健康检查应通过统一 diagnostics 机制输出。不要在功能模块中散落 ad hoc `console.log`。

Health checks 应验证外部依赖是否可用，但不要执行昂贵操作。

---

## 安全默认值

访问网络、文件系统、外部命令或用户内容的工具必须默认受限。

### Network tools

应具备：

- timeout
- max response size（当前配置名为 `maxResponseBytes`）
- redirect limit
- private network protection
- user-agent control when needed

默认禁止访问 localhost、loopback、metadata IP、private network ranges 和 `file://`，除非用户显式允许。

### Filesystem tools

应具备：

- workspace boundary checks
- file size limits
- clear errors for denied paths

涉及本扩展自有文件路径或 LSP 路径参数时，默认不允许越过 workspace / 已定义配置目录边界。子代理继承 pi 运行时的工具权限，不在本文件中承诺额外文件系统沙箱。

### External command tools

应具备：

- command existence checks
- timeout
- output size limits
- stderr truncation
- no shell interpolation unless necessary

### Content tools

应具备：

- max output length
- truncation metadata
- unsupported type handling
- no automatic execution of downloaded content

---

## 依赖克制

新增依赖前必须判断：

1. 是否必要。
2. 是否维护活跃。
3. 是否适合进入核心包。
4. 是否可以做成 optional。
5. 是否已有依赖或外部 CLI 可以完成同样任务。
6. 是否引入 native builds、Python、Java、browser engine、大型二进制或复杂系统依赖。

重型能力应默认做成 optional provider 或 external CLI。除非用户明确批准，不要把重依赖加入核心包。

---

## 减少重复与复杂度

避免复制粘贴平行模块逻辑。

当类似逻辑出现多次时，优先抽取：

- shared types
- validation helpers
- provider interfaces
- error builders
- config normalization
- test fixtures
- command registration helpers
- timeout / truncation / external command runner

如果三个或更多模块需要同一种行为，应抽取共享抽象。

保持文件职责集中。文件变大时优先按 `types`、`config`、`provider`、`registry`、`handler`、`errors`、`tests/fixtures` 拆分。不要机械拆分；以职责清晰为准。

---

## 测试要求

每个行为变更都应更新或新增测试。

新增 tools / providers / handlers 时，至少覆盖：

- success path
- invalid input
- missing dependency
- timeout
- truncation or size limit
- provider-specific failure
- normalized output shape
- config defaults
- disabled feature behavior

测试结构应镜像实现结构。不要跳过测试，除非有明确书面理由。

---

## 文档同步规则

修改用户可见行为时，必须在同一轮更新文档。

以下变化必须同步更新文档：

- tool names
- command names
- config keys
- provider behavior
- supported content types
- install steps
- external dependencies
- error codes
- feature boundaries
- default behavior

不要留下描述旧结构或废弃行为的文档。旧文档与当前代码冲突时，应更新或归档。

---

## 开发验证

常用验证命令以 `package.json` 为准。通常应优先运行：

```bash
pnpm typecheck
pnpm lint
pnpm test
```

涉及文档、格式化或仓库规范时，再运行对应脚本，例如：

```bash
pnpm format
pnpm docs:check
```

不要在未确认脚本存在时假设某个命令一定可用。

---

## 输出结果要求

每轮输出最后必须给出下一轮建议。
