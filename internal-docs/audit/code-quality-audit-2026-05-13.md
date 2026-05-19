---
status: implemented
audience: maintainer
last_verified: 2026-05-19
language: chinese
---

# 项目代码质量审计报告 · devkit-pi

> **审计基准 commit**: `db96565` · **审计日期**: 2026-05-13 · **审计对象**: `src/`、`tests/`、`agents/`、`docs/zh/guides`、`docs/zh/archive`、`docs/zh/reference`（当前对应维护路径：`internal-docs/maintain`、`internal-docs/archive`、`docs/zh/reference`）· **验证命令**: `pnpm typecheck`、`pnpm lint`、`pnpm test` 全部通过（280 tests）
>
> **历史路径说明**：本报告记录审计当时的仓库结构。后续文档分流后，部分维护者文档、归档文档和审计文档已从 `docs/` / `docs/zh/` 移动到 `internal-docs/`；报告正文中的旧路径保留为当时上下文。
>
> **复审增量说明（2026-05-18）**：基于 `internal-docs/planning/workflow-integration-plan.md` 已完成的阶段 0/1/2，本报告在原结构基础上补充“十六、复审增量章节”，用于标注关键问题的最新状态、已落地修复与后续未完成项。
---

## 审计看板（首页精简版）

> 用于快速判断当前风险优先级与处理状态；详细清单见文末“十七、附录：问题总表（详细版）”。

### 风险与状态汇总

- P0：3（Closed 3）
- P1：4（Closed 4）
- P2：3（Closed 3）
- P3：2（Closed 2）

- Closed：13
- Mitigated：0
- Deferred：0
- Open：0
- In Progress：0

### 关键问题总览（精简版）

| ID | 问题标题 | Priority | Status | 当前结论 |
|---|---|---|---|---|
| SEC-001 | HTTPS 默认关闭证书校验 | P0 | Closed | 已修复，TLS 默认安全。 |
| RES-001 | external command 输出无硬上限 | P0 | Closed | 已加 stdout/stderr hard cap 并测试。 |
| RES-002 | subagent child 输出无硬上限 | P0 | Closed | 已加 stdout/stderr/JSONL hard cap 并终止超限子进程。 |
| RES-003 | web provider 响应无限读取 | P0 | Closed | 已改为统一有限读取。 |
| SEC-002 | DNS rebinding / TOCTOU 缺口 | P1 | Closed | 已实现连接阶段 DNS pinning（含 redirect 逐跳重校验与重 pin）。 |
| ARCH-001 | LSP core 过大（维护性热点） | P1 | Closed | 已按边界文档完成拆分，`core.ts` 由上帝文件收敛为 facade/orchestrator。 |
| DOC-001 | 配置默认值文档漂移 | P1 | Closed | 文档已对齐，docs:check 已加漂移校验。 |
| WF-001 | 缺少轻量 workflow 过程提醒 | P2 | Closed | 已落地 guards（git/first-write/verification 提示）。 |

---

## 一、项目基本信息

### 项目名称

**devkit-pi**

### 项目类型

- ☑ **pi coding agent 扩展包**
- ☑ 个人工作流开发工具集
- ☑ TypeScript / Node.js 工具型项目
- ☐ 完整多代理框架
- ☐ 独立 SaaS / Web 服务

### 技术栈

**核心语言**：TypeScript 6 · ESM · Node.js 内置 test runner  
**运行时 / 宿主**：pi coding agent extension API 0.74.x  
**协议 / 外部能力**：Language Server Protocol（`vscode-jsonrpc`、`vscode-languageserver-protocol`）· Fetch API · 外部 CLI（MarkItDown）  
**Schema / 类型**：typebox  
**文档**：VitePress · 中英文 docs  
**工程化**：pnpm 11 · Biome · TypeScript compiler · GitHub Actions

### 核心能力

```text
subagents（前台只读任务委派）
+ web research（web_search / fetch_content / get_search_content）
+ convert_content（MarkItDown CLI 文件转 Markdown）
+ LSP code intelligence（显式 lsp tool + diagnostics hook）
+ /toolkit 命令中心
```

---

## 二、项目目录结构审计

### 当前目录结构（核心）

```text
devkit-pi/
├── index.ts                         # package 根入口，重导出 src/index.ts
├── package.json
├── pnpm-lock.yaml
├── biome.json
├── agents/                          # 5 个内置 readonly agent 定义
├── src/
│   ├── index.ts                      # extension 主入口：加载配置并注册模块
│   ├── config/load-config.ts         # 默认配置、读取、merge/normalize
│   ├── shared/                       # 通用类型、错误、外部命令、委派策略
│   └── modules/
│       ├── subagents/                # agent 发现、执行、输出收集、命令支撑
│       ├── web/                      # web tools、providers、handlers、storage
│       ├── convert/                  # convert_content + MarkItDown provider
│       ├── lsp/                      # LSP manager、tool、hook
│       └── commands/                 # /toolkit 命令注册与报告展示
├── tests/                            # 23 个测试文件，按模块镜像
├── docs/zh/guides/                   # 架构、安全、测试、范围指南
├── docs/zh/reference/                # 配置、工具、命令、结果 schema reference
└── docs/zh/archive/                  # 历史路径（现已迁移为 internal-docs/archive/）
```

### 优点

- **模块边界清晰**：`subagents`、`web`、`convert`、`lsp`、`commands` 分区明确，入口 `src/index.ts` 只做组合注册。
- **源码 / 测试 / 文档结构一致**：`src/modules/*`、`tests/*`、`docs/zh/reference/*` 基本按同一能力域映射。
- **配置集中**：`src/config/load-config.ts` 是默认值和 normalize 的 canonical source，符合文档中的架构一致性策略。
- **内置 agent 独立为 Markdown**：`agents/*.md` 便于用户理解 prompt 与工具边界。
- **历史文档有归档边界**：历史路径 `docs/zh/archive/index.md` 已迁移；当前以 `internal-docs/archive/README.md` 作为归档边界说明。

### 问题

- **`src/modules/lsp/core.ts` 过大**：约 1876 行，混合 server discovery、spawn、JSON-RPC client、诊断、symbol/format helper、Kotlin 辅助下载等职责，是当前最明显的维护热点。
- **`docs/zh/reference/configuration.md` 与源码存在默认值不一致**：源码 `DEFAULT_SUBAGENTS_CONFIG.timeoutMs = 900000`，但配置参考完整默认示例和表格写 `300000`；同时源码已有 `idleTimeoutMs=180000`，完整默认示例未列出。
- **内置 agents 目录定位逻辑脆弱**：`src/modules/subagents/agents.ts` 会优先向上查找任意 `agents/` 目录作为 builtin 根，普通工作区若也有 `agents/` 目录，可能混淆内置 agent 来源。
- **中文测试文档未列出 `tests/convert/` 与 `tests/shared/`**：该历史问题对应文档已迁移，当前维护路径为 `internal-docs/maintain/testing.md`。

### 风险等级

- ☑ **中** —— 结构整体健康，但 LSP 核心文件和少量文档漂移会持续放大维护成本。

### 是否建议重构目录结构

- ☑ **否（不建议大规模重排）**
- ☑ **是（建议局部拆分 LSP core）**

建议保持当前模块化顶层结构，只将 `src/modules/lsp/core.ts` 拆成 `server-registry.ts`、`client-manager.ts`、`diagnostics.ts`、`formatters.ts`、`server-install.ts` 等内部文件。

---

## 三、技术栈与依赖审计

### 核心依赖清单

| 依赖 | 当前版本 | 用途 | 状态 | 风险 |
|---|---:|---|---|---|
| `typebox` | `^1.1.38` | tool 参数 schema | 合理 | 低 |
| `vscode-jsonrpc` | `^8.2.1` | LSP JSON-RPC 连接 | 合理 | 低 |
| `vscode-languageserver-protocol` | `^3.17.5` | LSP 类型与 request | 合理 | 低 |
| `@earendil-works/pi-*` | `^0.74.0` | pi extension peer/dev runtime | 合理 | 中（宿主 API 版本耦合） |
| `@biomejs/biome` | `^2.4.15` | lint/format | 合理 | 低 |
| `typescript` | `^6.0.3` | 类型检查 | 偏新 | 中（生态兼容需持续确认） |
| `vitepress` | `^1.6.4` | 文档站 | 合理 | 低 |

### 是否存在过时依赖

未发现明显废弃依赖。项目依赖克制，核心运行时依赖仅 3 个，符合“轻量核心”原则。

### 是否存在重复依赖

未发现重复依赖。

### 是否存在无用依赖

从当前静态扫描看，`typebox`、LSP 相关依赖、pi runtime devDependencies 均有明确用途。没有发现类似“声明但完全未引用”的明显死依赖。

### 高风险依赖 / 版本策略

- `typescript@^6.0.3` 与 `@types/node@^25.6.2` 使用较新的 major，短期可接受，但若发布给更广泛用户，建议明确 Node/TS 支持矩阵。
- pi 相关包作为 peerDependencies 且 optional，符合 extension 包形态；但它也意味着真实运行质量依赖宿主 pi 版本，需继续依靠 CI 和 package manifest 测试锁定直接 runtime imports。

### 优化建议

1. 在 `package.json` 增加 `engines.node`，明确最低 Node 版本（建议以当前 Fetch/Web Streams/AbortSignal 使用为准）。
2. 发布前在 release checklist 中加入“pi 0.74.x smoke test”。
3. 对 TypeScript 6 相关升级保持谨慎；若未来遇到生态兼容问题，可考虑 pin 到经过验证的 minor。

---

## 四、代码质量审计

### 审计评分

| 维度 | 分数 | 依据 |
|---|---:|---|
| 命名规范 | **8/10** | 模块、配置、错误码命名整体一致；少量 legacy 注释与实现不完全同步 |
| 可读性 | **7/10** | 大部分文件职责单一；`lsp/core.ts` 过长显著拉低可读性 |
| 可维护性 | **7/10** | 有测试和文档兜底；但 LSP、HTTP pool、agent discovery 等热点需要拆分/修复 |
| 解耦程度 | **8/10** | provider/handler/runner/config 抽象较好；高层依赖接口较多 |
| 可扩展性 | **8/10** | 新 web provider、convert provider、tool/command 的模式清晰 |
| 类型安全 | **6/10** | public schema 明确，但 LSP/renderer/runtime 边界存在较多 `any` |

### 主要问题

#### 问题 1：LSP core 文件职责过多

**文件位置**：`src/modules/lsp/core.ts`

该文件约 1876 行，包含：

- language id 和 server registry
- root detection
- server spawn / shutdown
- JSON-RPC client 管理
- diagnostics / workspace diagnostics
- definition / references / hover / signature / symbols
- rename / code action formatting
- Kotlin LSP 辅助下载
- 结果格式化 helper

**影响**：

- 单文件上下文过大，修改 LSP 某个 action 时容易影响其他 action。
- 单元测试只能通过外层 `lsp/tool.test.ts` 间接覆盖，manager 内部场景难以精细测试。
- `any` 与 LSP 协议返回类型混杂，使 schema drift 更难发现。

**建议**：先不改变 public API，内部拆分为：

```text
src/modules/lsp/
├─ core.ts                 # facade / public manager
├─ server-registry.ts      # server configs、root detection
├─ client-manager.ts       # spawn/init/open/close/cleanup
├─ diagnostics.ts          # diagnostics/workspace diagnostics
├─ actions.ts              # definition/references/hover/signature/symbols
├─ edits.ts                # rename/codeAction formatting
└─ server-install.ts       # Kotlin 等辅助安装逻辑
```

#### 问题 2：HTTP connection pool 默认禁用 TLS 证书校验

**文件位置**：`src/modules/web/http-pool.ts:78`、`src/modules/web/http-pool.ts:182`

```ts
rejectUnauthorized: false
```

**问题描述**：HTTPS Agent 默认允许自签名证书，注释为“flexibility”。这与项目“安全默认”原则冲突。

**影响**：

- 如果 Node fetch/运行时采纳该 agent，则 HTTPS 请求可被中间人攻击。
- 即使当前运行时未完全使用 `agent` 参数，这段代码也会成为未来迁移或重构时的安全陷阱。

**建议**：默认删除该字段或设为 `true`。如确需自签名证书，应新增显式配置，例如 `web.connectionPool.allowInsecureTls`，默认 `false`，并在安全文档中标为高级风险选项。

#### 问题 3：外部命令与子进程输出无硬性字节上限

**文件位置**：

- `src/shared/external-command.ts:143-149`
- `src/modules/subagents/execution.ts:262-272`
- `src/modules/web/providers/ddgs.ts:124` 及其他 search providers 的 `response.text()` 路径

**问题描述**：部分路径会把 stdout/stderr/HTTP body 先完整累积到内存，再由上层截断。

**影响**：

- MarkItDown CLI、子 pi 进程、搜索 provider 若输出异常大，可能导致内存膨胀。
- `convertContent.maxContentChars` 只能限制最终返回字符，不能限制 stdout 收集过程。

**建议**：

- 给 `ExternalCommandRunOptions` 增加 `maxStdoutBytes` / `maxStderrBytes`。
- 给 `runSync` 的 stdout/stderr line buffer 增加硬上限，超限后终止子进程并返回结构化错误。
- search provider 复用 `readLimitedBody()` 风格的有限读取，而不是直接 `response.text()`。

#### 问题 4：Web / Convert SSRF 防护存在 DNS rebinding TOCTOU 风险

**文件位置**：

- `src/modules/web/security.ts:119-145`
- `src/modules/web/fetch.ts:468-501`
- `src/modules/convert/security.ts:149-208`

**问题描述**：当前先 `dns.lookup()` 检查 hostname 是否解析到私网，再调用 `fetch()`，实际连接时底层可能重新解析 DNS。

**影响**：攻击者控制域名时，可在校验和连接之间切换解析结果，绕过私网阻断。

**建议**：

- 使用支持自定义 lookup / dispatcher 的 fetch 实现，将已校验 IP pin 到连接阶段；或
- 对高风险环境在文档中明确“当前防护不覆盖 DNS rebinding”，并优先在 web/convert 安全测试中加入回归用例。

#### 问题 5：配置文档与源码默认值漂移

**文件位置**：

- 源码：`src/config/load-config.ts`
- 文档：`docs/zh/reference/configuration.md`

**问题描述**：

- `subagents.timeoutMs` 源码默认 `900000`，文档示例/表格写 `300000`。
- 源码已有 `idleTimeoutMs=180000`，中文配置完整示例未列出。

**影响**：用户按文档预期调试超时行为时会产生误判；也削弱“配置参考以源码为 canonical source”的可信度。

**建议**：同步中文/英文配置 reference，并在 `docs:check` 增加关键默认值一致性检查。

---

## 五、架构审计

### 当前架构分析

#### 分层情况

- **扩展入口层**：`src/index.ts` 负责加载配置并注册模块。
- **配置层**：`src/config/load-config.ts` 负责默认值、类型归一化和 namespace merge。
- **功能模块层**：`src/modules/{subagents,web,convert,lsp,commands}`。
- **共享基础设施层**：`src/shared/*` 提供错误、外部命令、timeout、activity、delegation policy 等。
- **文档与测试层**：`docs/zh/reference` 描述 public contract，`tests/` 锁定行为。

依赖方向总体健康：入口组合模块，模块主要依赖 `shared` 和自身内部实现，未发现大面积跨模块深度耦合。

### 架构优点

- **Provider / adapter 意识强**：web search providers、convert provider、content handlers 均有可扩展接口。
- **安全边界模块化**：web URL 校验、convert 本地路径校验、LSP action gating、subagent readonly 工具过滤都有明确实现。
- **命令中心统一**：`/toolkit` 避免散落多个 slash command。
- **测试结构镜像架构**：新增模块时已有清晰测试模式可参考。

### 架构问题

#### 模块边界

- `lsp/core.ts` 已经成为 LSP 子系统内部“上帝文件”。
- `subagents/agents.ts` 中 builtin root 推断混入 cwd 向上查找，导致“扩展包内置资源”与“用户工作区资源”边界不够硬。
- `shared/external-command.ts` 足够通用，但缺少输出上限，导致所有复用方继承同一资源风险。

#### 数据流

- `web_search(includeContent=true)` 会复用 fetch 流程，整体合理；但搜索 provider 自身的响应体读取没有统一走 `maxResponseBytes`。
- `convert_content(url=...)` 下载临时文件再交给 MarkItDown provider，职责清楚；临时文件清理已有测试覆盖。
- `subagent` 通过 child pi JSONL 输出收集结果，符合 foreground 单子进程设计；但 stdout/stderr 累积需要硬限制。

#### 状态管理

- web storage 有 `maxStoredResults` / `maxStoredContentChars` 限制，较健康。
- activity log 有上限测试，较健康。
- LSP manager 维护 clients/open files/cleanup interval，属于合理状态集中；但拆分后更易维护。

### 架构评级

- ☐ S
- ☑ **A-**
- ☐ B
- ☐ C
- ☐ D

**说明**：整体模块化和契约意识明显强于一般个人工具项目；主要扣分来自 LSP 单文件复杂度、安全默认值细节和文档漂移。

---

## 六、核心业务逻辑审计

### 核心模块列表

| 模块 | 职责 | 风险等级 |
|---|---|---|
| `src/modules/subagents/executor.ts` | 委派编排、agent 选择、prompt 构造、重试、结果归一化 | 中 |
| `src/modules/subagents/execution.ts` | child pi 进程执行、timeout/idle timeout、JSONL streaming 收集 | 中 |
| `src/modules/web/fetch.ts` | URL 拉取、redirect、安全限制、内容类型识别、handler 编排 | 中 |
| `src/modules/web/search.ts` | provider 选择、查询归一化、includeContent、storage | 中 |
| `src/modules/convert/tool.ts` | path/url 输入编排、本地/远程转换、错误映射 | 低-中 |
| `src/modules/convert/security.ts` | workspace 路径围栏、安全下载、临时文件 | 中 |
| `src/modules/lsp/tool.ts` | action 参数校验、权限 gating、输出格式 | 中 |
| `src/modules/lsp/core.ts` | LSP server 生命周期与所有核心 action | 中-高 |
| `src/config/load-config.ts` | 默认值与配置 normalize | 低-中 |

### 模块详细分析

#### 模块一 · `subagent` 执行链路

**输入**：`{ agent, task }` + 当前 cwd/session context。  
**输出**：`AgentToolResult<Details>`，包含 result、usage、sessionFile、displayItems、错误码等。

**做得好的地方**：

- `maxDepth` 和 `PI_SUBAGENT_CHILD` 阻止 nested delegation。
- readonly agent 工具过滤包含 read/grep/find/ls/web/convert/readonly LSP。
- runtime timeout 与 idle timeout 分离。
- transient error 支持有限重试。
- 输出经过 `sanitizeOutput()` 与 `truncateOutput()`。

**风险点**：

1. child stdout/stderr 在 `runSync` 内持续字符串拼接，无硬上限。
2. `spawnPi()` abort listener 使用匿名函数 add/remove，remove 不能移除原 listener，长期大量 spawn 存在低等级 listener 泄漏。
3. builtin agent 发现可能受 cwd 中 `agents/` 目录影响。

**建议**：加入输出 byte cap；修复 abort listener 引用；固定 builtin agents dir 为 package 自身 `agents/`。

#### 模块二 · `web fetch/search` 链路

**输入**：URL 或 query。  
**输出**：结构化结果、responseId、metadata、truncation 信息或 web error。

**做得好的地方**：

- 默认拒绝 localhost/private network/file protocol。
- `fetch_content` 使用有限 body reader，支持 redirect hop 再校验。
- 内容 handler 支持 HTML/JSON/CSV/XML/YAML/source text，并拒绝明确二进制。
- Jina fallback 默认关闭，且不会向 Jina 发送私网 URL。
- web error code 与 recovery 建议比较完整。

**风险点**：

1. DNS rebinding 防护不完整。
2. search providers 多数直接 `response.text()`，没有统一 max bytes。
3. HTTPS pool 默认 `rejectUnauthorized:false`。

**建议**：统一 provider fetch helper；修复 TLS 默认；增强 SSRF 连接阶段保护。

#### 模块三 · `convert_content`

**输入**：`path` 或 `url`，互斥。  
**输出**：Markdown 内容、metadata、truncated 标记或 convert error。

**做得好的地方**：

- 本地路径同时做 lexical boundary 与 realpath symlink 检查。
- URL 下载检查 content-length 和流式大小上限。
- 临时文件失败清理有测试覆盖。
- MarkItDown 是 optional external CLI，没有把重依赖带入核心包。
- 外部命令非 shell 执行，避免 shell interpolation。

**风险点**：

- MarkItDown stdout/stderr 在 shared runner 中完整收集后才截断。
- URL 下载同样有 DNS rebinding TOCTOU 风险。
- 当前配置虽然有 `provider` 字段，但 normalize 固定为 `markitdown`；若后续扩展多 provider，需要补完整 registry/factory。

#### 模块四 · LSP tool/hook

**做得好的地方**：

- privileged actions 默认禁用，子代理中始终禁用。
- `rename`/`codeAction` 返回建议，不直接写文件。
- 文件路径限制在 workspace 内。
- hook 只在主代理注册，避免子代理自动诊断噪声。

**风险点**：

- `readFileSync(fp, "utf-8")` 无文件大小限制，针对超大文件可能阻塞事件循环。
- core 单文件复杂度高。
- manager 级集成测试少，当前测试主要覆盖注册、权限和路径边界。

**建议**：增加 `lsp.maxFileBytes` 或内部常量；大文件返回结构化错误；拆分核心文件并补 manager 单测。

---

## 七、性能审计

### 性能风险点

| 文件 | 问题 | 风险等级 | 优化方案 |
|---|---|---|---|
| `src/modules/lsp/core.ts` | 同步读取文件且无大小限制 | 中 | 增加文件大小上限，必要时异步读取 |
| `src/shared/external-command.ts` | stdout/stderr 无硬上限 | 中 | 增加 max bytes，超限终止或截断并标记 |
| `src/modules/subagents/execution.ts` | child stdout/stderr 字符串累积 | 中 | line/byte cap + 超限终止 |
| `src/modules/web/providers/*.ts` | provider 响应多用 `response.text()` | 中 | 统一有限读取 helper |
| `src/modules/lsp/core.ts` | 单 manager 文件同步逻辑较多 | 低-中 | 拆分并减少事件循环阻塞 |

### 重复计算

- LSP root detection / server lookup 在多文件诊断中会重复发生，当前可接受；如果 workspace-diagnostics 文件数增大，应考虑 cache root detection。
- web provider availability 每次选择可能读取环境变量和 baseUrl，成本很低。
- MarkItDown provider availability 已缓存，设计合理。

### 内存泄漏 / 资源泄漏

- `spawnPi()` abort listener remove 逻辑无效，是低等级资源泄漏风险。
- LSP client cleanup 有 idle timeout 和 shutdown cleanup，方向正确；但应通过拆分后测试覆盖更多异常关闭路径。
- web storage/activity/cache 都有容量限制，表现较好。

### 缓存策略

- web search cache 可配置且默认关闭，适合安全默认。
- MarkItDown command availability 有缓存。
- LSP client 长连接复用，适合性能需求。

---

## 八、安全审计

### 安全风险检查

| 检查项 | 状态 | 风险 |
|---|---|---|
| API key 泄露 | ✅ 基本通过 | provider key 通过环境变量名配置，未发现明文回传 UI 的路径 |
| Token 泄露 | ✅ 基本通过 | 文档要求输出清理；仍需持续测试 sanitize |
| SSRF / 私网访问 | ⚠️ 部分通过 | 默认阻断私网，但 DNS rebinding 仍是缺口 |
| TLS 校验 | ❌ 失败 | `rejectUnauthorized:false` 违反安全默认 |
| 文件路径穿越 | ✅ 大体通过 | convert/LSP 都限制 workspace；subagent 文件读写依赖 pi runtime 工具权限 |
| 命令注入 | ✅ 大体通过 | MarkItDown runner 使用 structured args，无 shell；但 stdout/stderr 无上限 |
| 子代理权限 | ✅ 大体通过 | readonly-first、maxDepth=1、privileged LSP 禁用 |
| LSP mutating action | ✅ 通过 | 默认禁用；子代理始终禁用；rename/codeAction 不直接写文件 |
| 输出资源耗尽 | ⚠️ 部分 | 外部命令、子进程、provider response 有内存上限缺口 |
| 文档安全声明 | ✅ 较完整 | `docs/zh/guides/security-model.md` 清楚说明默认边界与 writable 风险 |

### 高危问题

#### 问题 1 · HTTPS 证书校验默认关闭

详见第四章问题 2。建议作为第一优先级修复。

#### 问题 2 · DNS rebinding 使 SSRF 防护不是强保证

当前实现已经覆盖大量常见私网/localhost/IP literal 场景，测试也较完整；但安全模型不应声称“强 SSRF 防护”。建议：

1. 代码层：连接阶段 pin 已校验地址。
2. 文档层：在 `security-model.md` 和 web/convert reference 中补充限制说明。
3. 测试层：加入模拟 DNS rebinding 的安全回归测试。

#### 问题 3 · 大输出导致内存耗尽

该问题跨 `web provider`、`subagent child process`、`external command runner` 三条路径。它不一定能直接越权，但在工具型 agent 场景中容易被 prompt injection 或恶意网页触发，建议作为安全与稳定性共同问题处理。

---

## 九、日志与异常处理审计

### 日志体系评分

**评分：6/10**

- ✅ web observability 有 stats、activity log 和 debug level。
- ✅ `/toolkit logs/activity/doctor` 提供面向用户的诊断入口。
- ✅ 错误码体系较完整，尤其 web/convert/subagent。
- ⚠️ 仍存在少量 `console.log/error` fallback：`src/index.ts`、`src/modules/subagents/register.ts`、`src/modules/web/observability.ts`、`src/modules/commands/*`。
- ⚠️ 没有统一的 extension-level logger interface；不同模块使用 diagnostics/activity/console 的边界不完全一致。

### 异常处理评分

**评分：7/10**

- ✅ 用户可见工具错误多为结构化结果，而不是直接抛出。
- ✅ convert provider error 有稳定错误码。
- ✅ web error mapping 包含 retryable/recovery 语义。
- ⚠️ config 加载错误只 `console.error`，没有进入统一 diagnostics。
- ⚠️ 多处 `catch {}` 用于容错，合理但降低排障信息。
- ⚠️ LSP 大文件/协议异常路径仍需更细粒度测试。

### 优化建议

1. 增加 `src/shared/logger.ts` 或统一 diagnostics sink，逐步替换裸 `console.*`。
2. 对 config load error、provider error、LSP initialization failure 输出统一健康检查项。
3. 给 `catch {}` 的关键路径保留 safe debug metadata，避免吞掉可诊断信息。

---

## 十、测试体系审计

### 当前测试覆盖情况

| 模块 | 单元测试 | 集成/仿真测试 | 备注 |
|---|---|---|---|
| subagents | ✅ | ✅（mock child runtime） | 覆盖 agent 发现、readonly policy、timeout、prompt runtime |
| web | ✅ | ✅（mock fetch） | 覆盖 security、providers、fetch、storage、observability |
| convert | ✅ | ✅（mock provider / mock download） | 覆盖 path/url、临时文件、错误映射、MarkItDown provider |
| lsp | ⚠️ | ⚠️ | 主要覆盖注册、权限、path cap；缺 manager 深测 |
| commands | ✅ | ✅（mock TUI） | 覆盖 report viewer、subcommands |
| shared | ✅ | ✅ | 覆盖 external-command 基础行为 |
| docs contract | ✅ | — | `pnpm docs:check` 存在，但本次未运行 |

### 本次验证

```text
pnpm typecheck  ✅
pnpm lint       ✅
pnpm test       ✅ 280 tests passed
```

### 测试优点

- 测试数量和范围明显优于个人工具项目平均水平。
- 不依赖真实 pi 子进程或真实 language server，CI 稳定性好。
- web security 边界测试覆盖 localhost/private IP/IPv6/allowPrivateNetwork。
- convert URL 下载、redirect 私网阻断、临时文件清理都有测试。

### 测试缺口

1. **LSP manager 内部缺少单元测试**：server init failure、large file、cleanup、workspace diagnostics 多 server 行为都值得补。
2. **TLS 默认安全缺少测试**：应锁定 HTTPS agent 不关闭证书校验。
3. **DNS rebinding 缺少测试**：至少以 mock lookup/fetch 的形式暴露 TOCTOU 风险。
4. **输出上限缺少测试**：external command stdout/stderr、subagent JSONL、search provider body 都应覆盖超限行为。
5. **文档默认值一致性缺少测试**：`subagents.timeoutMs` 已出现漂移，应纳入 docs check。

### 优先补充测试模块

| 模块 | 优先级 | 建议测试 |
|---|---|---|
| `web/http-pool.ts` | 高 | HTTPS agent 默认校验证书 |
| `shared/external-command.ts` | 高 | stdout/stderr 超限截断或终止 |
| `subagents/execution.ts` | 高 | child stdout/stderr 超限与 listener cleanup |
| `web/providers/*` | 高 | provider 大响应不完整读入内存 |
| `lsp/core.ts` | 高 | 大文件拒绝、manager cleanup、server init failure |
| `docs:check` | 中 | 配置默认值从源码抽样比对文档 |

---

## 十一、工程化审计

> 时效说明：本章主体为 2026-05-13 审计快照；当前状态以第十六、十七章为准。

### 工程化能力检查

| 项目 | 状态 |
|---|---|
| README / 中文 README | ✅ |
| 架构文档 | ✅ |
| Reference 文档 | ✅ |
| Lint | ✅ `biome check src` |
| Format | ✅ `biome format --write src` |
| Type check | ✅ `tsc --noEmit` |
| Unit tests | ✅ Node test runner，280 tests |
| Docs check | ✅ `scripts/check-docs.mjs` |
| CI | ✅ `.github/workflows/ci.yml` / docs workflow |
| Release checklist | ✅ `internal-docs/maintain/release-checklist.md`（历史路径：`docs/zh/guides/release-checklist.md`） |
| CHANGELOG | ✅ |
| License | ✅ MIT |
| Docker | N/A（extension 包，不需要） |
| Coverage 报告 | ⚠️ 未见覆盖率门禁 |
| Node engines | ✅ 已声明（`>=22.6.0`） |

### 工程化优点

- `prepublishOnly` 跑 `docs:check && pnpm test`，发布前有基本兜底。
- package manifest 对 pi extension 入口、files、peerDependencies 声明完整。
- Biome/TypeScript/Node test 三件套简洁、快速。

### 工程化问题

- （历史问题，已关闭）Node engine 已在后续迭代声明；兼容矩阵显式性风险已收敛。
- 没有测试覆盖率统计，难以量化热点模块覆盖缺口。
- 文档一致性检查仍可继续扩展（当前已覆盖关键默认值与 guide 导航校验）。

### 工程化建议

1. （已完成）`engines.node` 已补齐，后续维护最低支持版本说明。
2. 引入轻量 coverage（Node test 可配合 c8/内置 V8 coverage），不必一开始设高门槛，先观察热点。
3. 继续扩展 `docs:check`：在现有默认值/导航校验基础上，逐步增加错误码与 reference 一致性校验。

---

## 十二、重构路线图

> 时效说明：本章为原审计规划视角；其中已完成事项请以第十六、十七章状态为准。

### 第一阶段（立即执行 · 0.5–1 天）

**目标**：修复安全默认和文档漂移。

1. ✅ 移除 `http-pool.ts` 中 `rejectUnauthorized:false`，或改成显式高风险配置且默认关闭。
2. ✅ 更新 `docs/zh/reference/configuration.md`：`subagents.timeoutMs=900000`、补 `idleTimeoutMs=180000`。
3. ✅ 更新测试文档（当前维护路径 `internal-docs/maintain/testing.md`；历史路径 `docs/zh/guides/testing.md`）：补 `tests/convert/`、`tests/shared/`。
4. ✅ 修复 `spawnPi()` abort listener remove 引用。
5. ✅ 为以上变更补测试。

### 第二阶段（稳定性提升 · 2–4 天）

**目标**：补齐资源上限和安全缺口。

1. ✅ 给 `ExternalCommandRunner` 增加 stdout/stderr byte cap。
2. ✅ 给 subagent child 输出收集增加 hard cap 与结构化错误。
3. ✅ search providers 改用统一有限 body reader。
4. ✅ LSP 文件读取增加大小限制。
5. ✅ 在安全文档中说明 DNS rebinding 限制，并完成连接阶段 DNS pinning 设计与实现（web/convert 请求链路已接入，含 redirect 逐跳重校验与重 pin）。

### 第三阶段（维护性优化 · 1 周）

**目标**：降低 LSP 复杂度和强化文档契约。

1. ✅ 拆分 `src/modules/lsp/core.ts`（已完成，详见 `internal-docs/issues/lsp-core-split-boundaries.md`）。
2. 🟡 持续补 LSP manager/orchestrator 级白盒与时序回归测试。
3. ✅ 扩展 `docs:check` 默认值一致性检查。
4. ✅ 增加 coverage 报告（已完成，V8 coverage 可见性链路已接入）。
5. ✅ 建立统一 logger/diagnostics sink，减少裸 `console.*`（已完成批次 A/B，核心散点已收敛）。

### 第四阶段（长期）

**目标**：更强安全模型与可扩展 provider 体系。

1. Web/convert URL 访问实现 DNS resolution pinning。
2. Convert provider 从固定 `markitdown` 演进为 registry/factory。
3. 对可写 subagents 做独立 safety hardening ADR。
4. 为 LSP server 支持矩阵建立可选 integration tests。

---

## 十三、推荐目录结构（局部重构后）

> 时效说明：本节目标结构已大部分落地；保留为架构意图与对照参考。

```text
src/modules/lsp/
├── register.ts
├── schemas.ts
├── tool.ts
├── hook.ts
├── core.ts                    # facade，保留对外 LSPManager 接口
├── server-registry.ts          # LSP_SERVERS、language ids、root detection
├── client-manager.ts           # init/open/close/restart/cleanup
├── diagnostics.ts              # document/workspace diagnostics
├── actions.ts                  # definition/references/hover/signature/symbols
├── edits.ts                    # rename/codeAction result formatting
├── server-install.ts           # Kotlin/Dart 等辅助外部命令
└── formatters.ts               # shared output formatting helpers
```

```text
src/modules/web/
├── http-client.ts              # validate + limited read + provider fetch helper
├── http-pool.ts                # keep-alive only，不关闭 TLS 校验
└── providers/*.ts              # 不再直接 response.text() 大响应
```

```text
src/shared/
├── external-command.ts         # 增加 maxStdoutBytes/maxStderrBytes
├── logger.ts                   # 可选：统一 diagnostics/logger adapter
└── limits.ts                   # 可选：共享 byte/char limit helper
```

**说明**：不建议改变当前顶层模块边界；推荐只拆大文件、补共享基础设施。

---

## 十四、综合评分

> 时效说明：本章分数为 2026-05-13 原审计快照，不代表 2026-05-19 的最新量化评分。

| 维度 | 分数 | 备注 |
|---|---:|---|
| 项目结构 | **8/10** | （原审计快照）当时因 LSP core 过大扣分 |
| 代码质量 | **7/10** | 可读性总体好，部分 `any` 和 console/fallback 存在 |
| 架构设计 | **8/10** | provider/handler/config/test/doc 契约成熟 |
| 性能 | **7/10** | 常规使用足够，外部输出和 LSP 大文件需硬上限 |
| 安全 | **6/10** | 默认边界不错，但 TLS 与 DNS rebinding 是实质缺口 |
| 测试 | **8/10** | 280 tests 通过，覆盖广；LSP manager/资源上限缺口明显 |
| 工程化 | **8/10** | （原审计快照）当时缺 engines/coverage；其中 engines 已在后续迭代关闭 |
| 文档一致性 | **7/10** | 文档体系完整，但配置默认值和测试目录有漂移 |

### 综合评分

**59 / 80（折算 74 / 100）**

### 评级

- ☐ S 商业级
- ☑ **A- 良好但需安全/稳定性加固**
- ☐ B 可优化
- ☐ C 原型阶段
- ☐ D 高风险

**说明**：devkit-pi 已明显超过原型阶段，具备清晰架构、稳定测试和完整文档。当前不宜继续无节制加功能，应先修复安全默认值、资源上限和 LSP 复杂度。

---

## 十五、最终结论

> **时效说明**：本章为 2026-05-13 原审计结论的归纳性文本。当前执行状态与优先级判断请以“十六、复审增量（2026-05-18）”和“十七、附录：问题总表（详细版）”为准。

### 当前阶段

**成熟个人工具包 / 早期可发布扩展**。项目在模块化、测试、文档和配置规范方面具备较好基础，符合“轻量、模块化、主代理编排”的定位。

### 关键关注点（以十六/十七章状态为准）

当前需要持续关注的重点已从“多项高优先级缺口并存”收敛为“少量已知边界与技术债”：

- 安全边界：DNS rebinding / TOCTOU 已从“文档化缓解”升级为“连接阶段 pinning 已落地（Closed）”，同时保留非形式化安全保证的边界声明；
- 工程化提升：coverage 与质量可见性增强仍为后续优化项。

### 是否建议继续加功能

- ☐ 是
- ☑ **原则上先按问题总表清理剩余 Open 项，再评估新增功能节奏**

### 是否建议先重构

- ☑ **是，但只做局部重构**：当前优先进行拆分后回归巩固（manager/orchestrator 时序测试、边界稳定性），不重排顶层结构。

### 是否适合商业化

- ☐ 是
- ☑ **需谨慎推进**：关键高优先级缺口多数已关闭，但仍应先完成剩余安全增强与维护性改进，再进入更高强度发布场景。

### 是否适合多人协作

- ☑ **基本适合**：已有 CI、lint、typecheck、tests、docs；后续按总表持续收敛 Open 项可进一步提升协作稳定性。

### 下一步最优先执行的三件事（以十七章状态驱动）

1. **保持安全增强回归保障**：持续验证 DNS 校验到连接阶段一致性（pinning）与 redirect 逐跳重校验链路，防止回退。
2. **补齐工程化可见性**：已接入 Node 原生 V8 coverage 可见性链路（脚本 + CI artifact），进入热点覆盖率观察期。
3. **持续 LSP 回归保障**：在现有拆分基础上继续补 manager/orchestrator 白盒测试与时序回归用例。

---

## 十六、复审增量（2026-05-18）

> 本节仅更新 2026-05-13 审计后的增量结论；原章节保留，作为当时快照。

### 16.1 三阶段执行概览

- 阶段 0（安全与资源硬化）：已完成。
- 阶段 1（轻量 guardrails）：已完成。
- 阶段 2（workflow 指南与导航一致性）：已完成。

本轮复审验证（2026-05-18 快照）：

```text
pnpm docs:check ✅
pnpm typecheck ✅
pnpm lint ✅
pnpm test ✅（当时测试集 328 tests / 317 passed / 11 skipped）
```

后续复核补记（2026-05-19）：

```text
pnpm test ✅（当前测试集 406 passed / 0 failed / 0 skipped）
pnpm test:coverage ✅（V8 coverage summary + hotspots 已接入并产出）
```

### 16.2 关键问题状态对照（相对原审计）

| 原审计问题 | 当前状态 | 证据（示例） | 说明 |
|---|---|---|---|
| TLS 默认关闭证书校验（高） | ✅ 已关闭 | `src/modules/web/http-pool.ts`, `tests/web/http-pool.test.ts` | 移除 `rejectUnauthorized:false`，默认回归安全 TLS 校验。 |
| external command stdout/stderr 无硬上限 | ✅ 已关闭 | `src/shared/external-command.ts`, `tests/shared/external-command.test.ts` | 增加 stdout/stderr 硬字节上限，超限终止并标记截断。 |
| subagent child 输出无硬上限 + abort listener remove 问题 | ✅ 已关闭 | `src/modules/subagents/execution.ts`, `src/modules/subagents/executor.ts`, `tests/subagents/execution.test.ts` | 子进程 stdout/stderr/JSONL 行数均有 hard cap；abort listener 清理修复。 |
| web providers 直接 `response.text()/json()` 无限读取 | ✅ 已关闭 | `src/modules/web/read-limited.ts`, `src/modules/web/providers/*.ts`, `tests/web/providers.test.ts` | provider 响应改为统一有限读取路径。 |
| LSP source file 无大小限制 | ✅ 已关闭 | `src/modules/lsp/core.ts`, `tests/lsp/tool.test.ts` | 增加 `DEFAULT_LSP_MAX_SOURCE_FILE_BYTES` 与超限错误。 |
| 配置文档默认值漂移 | ✅ 已关闭 | `docs/reference/configuration.md`, `docs/zh/reference/configuration.md`, `scripts/check-docs.mjs` | 默认值已对齐，并由 docs:check 抽样校验。 |
| DNS rebinding / DNS TOCTOU 风险未说明 | ✅ 已关闭 | `src/modules/web/network.ts`, `src/modules/web/fetch.ts`, `src/modules/convert/security.ts`, `tests/web/network.test.ts`, `tests/web/fetch-content.test.ts`, `tests/convert/tool.test.ts`, `docs/guides/security-model.md`, `docs/zh/guides/security-model.md`, web/convert reference | 已实现连接阶段 DNS pinning，并完成文档与回归测试同步。 |
| LSP core 过大（维护性热点） | ✅ 已关闭 | `internal-docs/issues/lsp-core-split-boundaries.md`；`src/modules/lsp/{actions,client-lifecycle,client-manager,diagnostics,edits,formatters,request-orchestrator,server-registry,source-files}.ts` | 阶段 0 的边界记录已在后续迭代完成实现，`core.ts` 已显著瘦身并转为 facade/orchestrator。 |

### 16.3 新增能力与工程化增量

#### A. 新增 lightweight guards（阶段 1）

已新增 `src/modules/guards/`，并落地三项软提醒能力：

1. `gitContextNotice`：session 首次工具结果后显示 repo/branch/worktree 提示。
2. `firstWriteReminder`：session 首次潜在写入前提示当前 branch/worktree。
3. `verificationReminder`：本轮有修改且未检测到验证命令时，在 `agent_end` 提醒。

边界保持：

- 只提醒，不阻断；
- 不触发 follow-up turn；
- 不引入 workflow monitor / Plan Tracker / phase state。

#### B. 新增 workflow 方法指南（阶段 2）

- `docs/guides/agent-workflow.md`
- `docs/zh/guides/agent-workflow.md`

并已同步 VitePress 中英导航。

#### C. docs:check 增强

`scripts/check-docs.mjs` 新增 guide sidebar 覆盖检查：

- `docs/guides/*.md` 必须存在 `/guides/<slug>` 导航链接；
- `docs/zh/guides/*.md` 必须存在 `/zh/guides/<slug>` 导航链接。

该项已覆盖“新增 guide 必须被导航引用”的最低一致性要求。

### 16.4 对原审计结论的更新

原结论中“先完成第一/第二阶段加固再继续加功能”的建议已被执行并验证。

当前建议更新为：

1. 继续保持“安全默认 + 资源上限 + 文档契约校验”作为变更门槛；
2. 进入专门维护窗口时再推进 LSP core 分步拆分；
3. 将 DNS pinning 纳入持续回归门槛（代码 + 测试 + 文档一致性），避免后续迭代弱化连接阶段保障。

### 16.5 当前复审结论

- 项目从 2026-05-13 审计时的“关键安全/稳定性缺口待补”推进到“关键缺口大多关闭，剩余为已知边界与技术债”。
- 原审计提出的高优先级修复项（TLS 默认、输出硬上限、有限读取、配置漂移）已完成闭环。
- 审计文档可继续沿用单文档增量更新模式，无需拆出独立平行审计文件。

### 16.6 内部交叉引用校验（2026-05-19）

本轮对第十六、十七章“证据（代码/测试/文档）”路径做了逐项存在性校验，并同步清理了少量历史路径漂移引用。

校验结论：

- ✅ 关键证据路径均存在（代码、测试、文档与维护文档）。
- ✅ `ARCH-001`/`ENG-001` 关闭状态对应证据可在仓库中直接定位。
- ✅ 历史路径 `docs/zh/archive/*`、`docs/zh/guides/{testing,release-checklist}.md` 已在文档中补充迁移说明并指向当前维护路径：
  - `internal-docs/archive/README.md`
  - `internal-docs/maintain/testing.md`
  - `internal-docs/maintain/release-checklist.md`

---

## 十七、附录：问题总表（详细版）

> 状态枚举：`Open / In Progress / Mitigated / Deferred / Closed`

| ID | 领域 | 问题标题 | Priority | Status | 阶段来源 | 影响摘要 | 证据（代码/测试/文档） | 暂缓原因 / 风险接受 | 重开触发条件 | 下一步动作 |
|---|---|---|---|---|---|---|---|---|---|---|
| SEC-001 | 安全 | HTTPS 默认关闭证书校验（`rejectUnauthorized:false`） | P0 | Closed | 原审计 → Stage0 | 可能导致中间人风险，违背安全默认 | 代码：`src/modules/web/http-pool.ts`；测试：`tests/web/http-pool.test.ts`；文档：`docs/guides/security-model.md` | - | - | 保持回归测试，防止回退 |
| RES-001 | 资源 | external command stdout/stderr 无硬上限 | P0 | Closed | 原审计 → Stage0 | 异常输出可导致内存膨胀/阻塞 | 代码：`src/shared/external-command.ts`；测试：`tests/shared/external-command.test.ts`；文档：`docs/reference/convert-tools.md` | - | - | 如需可评估阈值配置化 |
| RES-002 | 资源 | subagent child stdout/stderr/JSONL 无硬上限 | P0 | Closed | 原审计 → Stage0 | 子进程噪声或恶意输出可放大资源消耗 | 代码：`src/modules/subagents/execution.ts`（执行链路）；测试：`tests/subagents/execution.test.ts`；文档：`docs/reference/subagents.md` | - | - | 继续补齐/解锁超限场景测试 |
| RES-003 | 资源 | web providers 直接 `response.text()/json()` 无限读取 | P0 | Closed | 原审计 → Stage0 | 大响应可能拖垮进程内存 | 代码：`src/modules/web/read-limited.ts`（provider 有限读取入口）；测试：`tests/web/providers.test.ts`；文档：`docs/reference/web-tools.md` | - | - | 新 provider 强制复用有限读取 helper |
| RES-004 | 资源 | LSP source file 读取无大小限制 | P1 | Closed | 原审计 → Stage0 | 大文件阻塞事件循环并增加内存压力 | 代码：`src/modules/lsp/source-files.ts`（读取上限） / `src/modules/lsp/core.ts`（编排）；测试：`tests/lsp/tool.test.ts`；文档：`docs/reference/lsp-tools.md` | - | - | 观察是否需要后续配置化 |
| SEC-002 | 安全 | DNS rebinding / DNS TOCTOU 连接阶段缺口 | P1 | Closed | 原审计 → Stage0 → 2026-05-19 关闭 | 私网阻断已从“仅校验阶段”升级为“校验-连接一致性” | 代码：`src/modules/web/network.ts`、`src/modules/web/fetch.ts`、`src/modules/convert/security.ts`、`src/modules/web/security.ts`；测试：`tests/web/network.test.ts`、`tests/web/fetch-content.test.ts`、`tests/convert/tool.test.ts`、`tests/web/security.test.ts`；文档：`docs/guides/security-model.md`（含 zh 对应页）与 web/convert reference | 保留边界声明（非对所有上游网络攻击的形式化保证） | 连接阶段 pinning 被绕过、redirect 跳转未重校验或相关回归测试失败 | 维持 pinning 回归测试与文档一致性检查
| DOC-001 | 文档契约 | 配置默认值与源码漂移（含 timeout/idle） | P1 | Closed | 原审计 → Stage0 | 用户按文档调试会误判行为 | 代码：`src/config/load-config.ts`；测试/校验：`scripts/check-docs.mjs`；文档：`docs/reference/configuration.md`（含 zh 对应页） | - | - | 继续扩展 drift 检查覆盖面 |
| DOC-002 | 文档契约 | guide 新增后可能未进入导航 | P2 | Closed | Stage2 | 文档可发现性差，易形成信息孤岛 | 代码：`scripts/check-docs.mjs`；测试/校验：`pnpm docs:check`（脚本门禁）；文档：`docs/guides/agent-workflow.md` | - | - | 后续可扩展到 reference 导航一致性 |
| WF-001 | 流程质量 | 会话缺少轻量 workflow 提醒 | P2 | Closed | Stage1 | 容易“改完未验证就结束” | 代码：`src/modules/guards/`；测试：`tests/guards/git-context.test.ts`；文档：`docs/guides/agent-workflow.md` | - | - | 观察误报/漏报，迭代分类器 |
| ARCH-001 | 架构 | `lsp/core.ts` 过大、职责集中 | P1 | Closed | 原审计 + Stage0(0-H) → 后续迭代关闭 | 单文件复杂度高、变更面过大 | 代码：`src/modules/lsp/core.ts` + `src/modules/lsp/{actions,client-lifecycle,client-manager,diagnostics,edits,formatters,request-orchestrator,server-registry,source-files}.ts`；测试：`tests/lsp/*.test.ts`；文档：`internal-docs/issues/lsp-core-split-boundaries.md` | - | - | 维持 facade 边界稳定并持续补时序/回归测试 |
| ENG-001 | 工程化 | Node engines 未声明（兼容矩阵不够显式） | P2 | Closed | 原审计 → 后续迭代关闭 | 旧 Node 环境可能出现运行时兼容问题 | 代码：`package.json`（`engines.node >=22.6.0`）；测试/校验：`pnpm test` / `pnpm typecheck`（Node 版本前提）；文档：本报告第十一章工程化审计 | - | - | 发布说明中持续维护支持矩阵与最低版本说明 |
| ENG-002 | 工程化 | 覆盖率门禁缺失 | P3 | Closed | 原审计 → 2026-05-19 关闭 | 缺少 coverage 可见性会弱化热点模块测试充分性判断 | 代码：`scripts/run-v8-coverage.mjs`、`scripts/report-v8-coverage.mjs`、`package.json`（`test:coverage*`）、`.github/workflows/ci.yml`（coverage + artifact）；测试/校验：`pnpm test:coverage`；文档：`internal-docs/issues/v8-coverage-visibility-plan.md`、`internal-docs/maintain/testing.md` | 当前采用“仅可见性、无阈值门禁”策略，先观察稳定性与基线 | 覆盖率任务长期不稳定、统计偏差不可接受或 CI 开销不可控 | 维持覆盖率可见性基线，按趋势评估是否引入 soft gate（不影响 Closed 状态） |
| OBS-001 | 可观测性 | 缺少统一 logger/diagnostics sink（仍有分散 `console.*` fallback） | P3 | Closed | 原审计后续维护项 → 2026-05-19 关闭 | 模块日志出口已统一到 shared logger，跨模块排障一致性提升 | 代码：`src/shared/logger.ts`、`src/index.ts`、`src/modules/subagents/register.ts`、`src/modules/web/observability.ts`、`src/modules/commands/{register,report-viewer}.ts`；测试：`tests/shared/logger.test.ts`、`tests/subagents/register.test.ts`、`tests/web/observability.test.ts`、`tests/commands/{register,report-viewer}.test.ts`；说明：`src/modules/commands/report-viewer.ts` 保留用户可见 `stdout` fallback | - | 若新增模块绕过 shared logger 直接引入分散 `console.*` 维护者日志 | 维持“logger 注入 + memory sink 断言”测试约定，并持续审计 `console.*` 剩余项是否属于用户可见输出路径 |
