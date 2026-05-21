---
status: current
audience: maintainer
last_verified: 2026-05-21
language: chinese
---

# 项目代码质量审计报告 · devkit-pi

> 本报告按 `internal-docs/audit/code-quality-audit-template.md` 结构生成。
>
> 审计基线：`main` / `6d5cea645273c7e7d2bf33beb84069253c845eac`。
>
> 口径说明：本次审计覆盖 `src/`、`tests/`、`scripts/`、`docs/`、`internal-docs/`、`.github/workflows/`、根配置与现有 coverage 产物；以源码、测试、文档、命令执行结果和只读专项审查结果为证据。

---

## 0. 审计看板

### 0.1 基本信息

| 字段 | 值 |
| --- | --- |
| 项目 | `devkit-pi` |
| 仓库 / 范围 | 全仓库：`src/`、`tests/`、`scripts/`、`docs/`、`internal-docs/`、`.github/workflows/`、根配置 |
| 审计日期 | `2026-05-21` |
| 审计基线 | `main` / `6d5cea645273c7e7d2bf33beb84069253c845eac` |
| 审计人 | pi coding agent |
| 复审状态 | `Initial` |

### 0.2 风险与状态汇总

| Priority | Total | Open | In Progress | Mitigated | Deferred | Closed |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| P0 | 2 | 0 | 0 | 0 | 0 | 2 |
| P1 | 2 | 0 | 0 | 0 | 0 | 2 |
| P2 | 5 | 4 | 0 | 0 | 0 | 1 |
| P3 | 0 | 0 | 0 | 0 | 0 | 0 |
| **合计** | 9 | 4 | 0 | 0 | 0 | 5 |

### 0.3 关键结论

- 总体评级：`B`
- 当前是否适合继续新增功能：`Conditional`
- 当前是否建议优先重构：`Conditional`，P0/P1 已关闭；继续处理 P2 架构、资源与工程门禁问题。
- 最大风险：剩余风险集中在 HTTP connection pool 语义、跨模块 observability 读取、skipped tests 与工程门禁覆盖范围。
- 下一步最高优先级：处理 `RES-001` 与 `ENG-001`，并评估 skipped tests 跨平台化。

### 0.4 Top Findings

| ID | Priority | Status | 标题 | 当前结论 |
| --- | --- | --- | --- | --- |
| SEC-001 | P0 | Closed | `web_search` provider endpoint 未走统一 URL 安全校验 | 已改为 provider endpoint 统一使用 pinned DNS fetch，默认按 `web.allowPrivateNetwork=false` 阻断私网。 |
| SEC-002 | P0 | Closed | `sanitizeOutput()` 敏感值替换表达式反向保留 secret | 已修复捕获组并新增 secret redaction 单测。 |
| SEC-003 | P1 | Closed | `convert_content` 直接暴露外部 CLI stderr 摘要 | 已复用 shared output redaction 处理 MarkItDown stderr summary，并补 token query/API key 回归测试。 |
| SEC-004 | P1 | Closed | `convert_content` 本地路径边界使用 `process.cwd()` 而非工具上下文 cwd | 已将工具执行上下文 `ctx.cwd` 传入本地路径校验，并补 cwd/workspace 分离回归测试。 |
| DOC-001 | P2 | Closed | web 安全文档与 `web_search` provider 行为不一致 | 已同步 security-model、web-tools、web-providers 中英文文档。 |

---

## 1. 审计范围与方法

### 1.1 审计范围

包括：

- 扩展入口与装配：`index.ts`、`src/index.ts`、`src/extension/*`
- 配置：`src/config/load-config.ts`、`package.json`、`tsconfig.json`、`biome.json`
- 功能模块：`src/modules/{commands,convert,guards,lsp,subagents,web}`
- 共享基础设施：`src/shared/*`
- 测试：`tests/**`
- 脚本与 CI：`scripts/*.mjs`、`.github/workflows/*.yml`
- 文档：`docs/**`、`internal-docs/**`
- 现有覆盖率产物：`.coverage/summary.json`、`.coverage/hotspots.md`

不包括：

- `node_modules/**` 依赖源码逐行审计。
- `.git/**` 内部对象审计。
- 对第三方服务真实 API 的联网集成测试。

### 1.2 审计输入

| 类型 | 路径 / 命令 / 资料 |
| --- | --- |
| 代码 | `src/**`、`index.ts` |
| 测试 | `tests/**` |
| 文档 | `docs/**`、`internal-docs/**` |
| 配置 | `package.json`、`tsconfig.json`、`biome.json`、`.github/workflows/*.yml` |
| 既有审计 | `internal-docs/audit/code-quality-audit-2026-05-13.md` |
| 验证命令 | `pnpm typecheck`、`pnpm lint`、`pnpm test`、`pnpm docs:check`、`pnpm test:coverage` |
| 专项检查 | `rg` 静态扫描、`wc -l` 热点统计、`sanitizeOutput()` 行为复现命令 |

### 1.3 严重级别定义

| Priority | 定义 | 处理期望 |
| --- | --- | --- |
| P0 | 安全、数据损坏、资源失控、核心功能不可用 | 立即修复，阻断发布 |
| P1 | 高概率稳定性/维护性风险，影响关键路径 | 当前迭代修复 |
| P2 | 中等风险，影响可维护性、测试质量或协作效率 | 近期排期 |
| P3 | 低风险改进项、可观测性、体验与长期治理 | 后续优化或持续跟踪 |

### 1.4 状态定义

| Status | 定义 |
| --- | --- |
| Open | 已确认问题，尚未开始处理 |
| In Progress | 已进入实现或验证阶段 |
| Mitigated | 已有缓解措施，但未完全根除 |
| Deferred | 明确暂缓，并记录风险接受原因 |
| Closed | 已完成修复/验证/文档同步，证据可追踪 |

---

## 2. 项目画像

### 2.1 项目类型与核心能力

- 项目类型：`pi coding agent extension / TypeScript 工具库`
- 核心能力：
  1. `subagent`：只读优先任务委派、子进程执行、输出收敛。
  2. `web_search` / `fetch_content` / `get_search_content`：网络检索、网页获取、内容存储。
  3. `convert_content`：本地/远程文件经 MarkItDown CLI 转 Markdown。
  4. `lsp`：语言服务器生命周期、只读代码智能、受限 mutating action。
  5. `/toolkit`：统一 slash command、诊断和活动面板。
  6. `guards`：git context、first-write、verification 轻量提示/软门禁。

### 2.2 技术栈与运行环境

| 类别 | 当前值 | 备注 |
| --- | --- | --- |
| 语言 | TypeScript / ESM | `module: NodeNext`，允许 `.ts` 扩展导入。 |
| 运行时 | Node.js `>=22.19.0` | CI 使用 Node 24。 |
| 包管理 | pnpm `11.1.2` | `packageManager` 已声明。 |
| 测试框架 | `node:test` + `--experimental-strip-types` | 单元测试 473 个，其中 11 skipped。 |
| Lint/Format | Biome `2.4.x` | 当前 `lint` 仅覆盖 `src`。 |
| CI | GitHub Actions | `ci.yml` 运行 docs check、test、coverage；未显式运行 `pnpm typecheck` / `pnpm lint`。 |

### 2.3 目录与模块边界

```text
devkit-pi/
├─ agents/                         # 内置子代理定义
├─ src/
│  ├─ config/                       # 默认配置与归一化
│  ├─ extension/                    # 生命周期、manifest、runtime scope
│  ├─ modules/
│  │  ├─ commands/                  # /toolkit 聚合命令与报告 viewer
│  │  ├─ convert/                   # convert_content + MarkItDown provider
│  │  ├─ guards/                    # git/write/verification 提醒与 gate
│  │  ├─ lsp/                       # LSP manager/tool/hook
│  │  ├─ subagents/                 # agent 发现、执行、输出收敛
│  │  └─ web/                       # web tools、providers、storage、network
│  └─ shared/                       # 错误、logger、HTTP 安全、外部命令、类型
├─ tests/                           # 按模块镜像的 node:test 测试
├─ docs/                            # 对外中英文文档
├─ internal-docs/                   # ADR、审计、维护、planning、issues
├─ scripts/                         # docs check 与 coverage 脚本
└─ .github/workflows/               # CI 与 docs deploy
```

边界判断：

- 清晰边界：`extension/runtime` 统一装配；`modules/*` 基本按能力划分；`shared/*` 提供跨模块基础设施。
- 模糊边界：`commands` / `subagents/commands` 对 web/convert observability 有跨模块读取；`web_search` provider 网络栈已在本轮收敛到 pinned fetch。
- 高复杂度热点：`src/modules/lsp/core.ts`、`src/modules/web/fetch.ts`、`src/modules/lsp/tool.ts`、`src/modules/subagents/executor.ts`、`src/shared/types.ts`。

---

## 3. 分领域审计结果

### 3.1 架构与模块边界

- 评级：`B`
- 结论：整体模块化清晰；`web_search` providers 已在本轮改为复用 pinned DNS fetch，剩余架构风险主要是 observability 聚合命令跨模块读取。
- 主要证据：`src/shared/pinned-fetch.ts`、`src/modules/web/fetch.ts`、`src/modules/convert/security.ts`、`src/modules/web/providers/*.ts`、`src/modules/commands/register.ts`。
- 关联问题：`SEC-001`、`ARCH-001`、`RES-001`。

### 3.2 代码质量与可维护性

- 评级：`B`
- 结论：类型、配置、测试契约整体较强；本轮已修复 sanitizer P0 缺陷，剩余问题集中在工程门禁范围、HTTP pool 语义和若干大文件热点。
- 主要证据：`src/modules/subagents/sanitize.ts`、`src/modules/lsp/core.ts`、`src/modules/web/fetch.ts`、`biome.json`、`package.json`。
- 关联问题：`SEC-002`、`QUAL-001`、`ENG-001`。

### 3.3 安全边界

| 检查项 | 结论 | 证据 | 关联问题 |
| --- | --- | --- | --- |
| 网络访问边界 | `Pass` | `fetch_content` / `convert_content` / `web_search` provider endpoint 均使用 pinned DNS；私网 provider baseUrl 默认阻断并有回归测试。 | `SEC-001`, `DOC-001` |
| 文件系统边界 | `Pass` | LSP 文件路径有 workspace 约束；`convert_content` 本地路径改用工具执行上下文 `ctx.cwd`。 | `SEC-004` |
| 外部命令执行 | `Pass` | `NodeExternalCommandRunner` 有 timeout/stdout/stderr cap；MarkItDown stderr 摘要已在用户可见错误前 redaction。 | `SEC-003` |
| secrets / token 处理 | `Pass` | `sanitizeOutput()` 已抽到 shared redaction；subagent 输出与 convert stderr summary 均有 secret redaction 回归测试；logger metadata 有 redaction。 | `SEC-002`, `SEC-003` |

### 3.4 资源与性能

- 响应大小 / 输出大小限制：`fetch_content`、providers 响应读取、external command、subagent stdout/JSONL 已有上限；coverage 显示相关测试覆盖较高。
- timeout / cancellation：web、convert、subagent、LSP 多数关键路径有 timeout；现有测试覆盖 abort/timeout。
- 并发 / 队列 / cache：web concurrency/cache/storage 有配置；HTTP connection pool 以 `http.Agent/https.Agent` 传给 global `fetch`，在 Node/undici 语义下限制可能无效，统计值为近似值。
- 关联问题：`RES-001`。

### 3.5 错误处理与可观测性

- 结构化错误：web/convert/subagent/LSP 均有结构化 payload；convert provider 已对 stderr summary 做 redaction 后再进入 error message/causeSummary。
- logger / diagnostics：`src/shared/logger.ts` 已收敛主要维护者日志；`report-viewer` 保留用户可见 stdout fallback。
- 用户输出与维护者日志边界：整体改善明显；subagent 输出 redaction 与 convert stderr redaction 已复用 shared sanitizer。
- 关联问题：`SEC-002`、`SEC-003`、`OBS-001`。

### 3.6 测试体系

- 单元测试：覆盖广，`pnpm test` 结果为 473 tests / 462 pass / 11 skipped / 0 fail。
- 集成 / 回归测试：web security、pinned DNS、convert URL 下载、LSP lifecycle、subagent child 输出等均有回归测试。
- coverage 可见性：`pnpm test:coverage` 通过，V8 coverage 当前为 99.15% line / 99.01% function。
- 关联问题：`TEST-001`、`ENG-001`。

### 3.7 文档与配置契约

- public docs 与源码一致性：`pnpm docs:check` 通过；web 安全文档已同步 `web_search` provider pinned DNS / private network blocking 行为。
- 配置默认值漂移检查：docs check 已覆盖关键默认值，当前未发现默认值漂移。
- 内部维护文档：历史审计和 issue 文档较完整；`AGENTS.md` 的结构快照未体现当前 `src/extension/*`。
- 关联问题：`DOC-001`、`ENG-001`。

### 3.8 工程化与发布风险

- lint / typecheck / test 门禁：本地命令全通过；CI 运行 docs/test/coverage，但未显式运行 `pnpm typecheck` 和 `pnpm lint`。
- CI / artifact / coverage：coverage artifact 已上传；docs deploy workflow 健全。
- runtime engines / package manifest：`engines.node >=22.19.0`、peer dependencies、pi extension entry 均存在。
- 关联问题：`ENG-001`。

---

## 4. 验证记录

### 4.1 命令执行结果

| 命令 | 结果 | 说明 |
| --- | --- | --- |
| `pnpm lint` | `Pass` | 本地通过；当前脚本为 `biome check src`，未覆盖 tests/scripts/docs config。 |
| `pnpm typecheck` | `Pass` | 本地通过；`tsconfig` include 为 `src/**/*` 与 `tests/**/*`。 |
| `pnpm test` | `Pass` | 473 tests / 462 pass / 11 skipped / 0 fail。 |
| `pnpm test:coverage` | `Pass` | 生成 `.coverage/summary.json` 与 `.coverage/hotspots.md`。 |
| `pnpm docs:check` | `Pass` | 文档检查通过。 |

补充复现命令：

| 命令 | 结果 | 说明 |
| --- | --- | --- |
| `tests/subagents/sanitize.test.ts` | `Pass` | 覆盖 API key、AWS、OPENAI/ANTHROPIC、Authorization、Bearer、GitHub token、URL secret query redaction。 |

### 4.2 Coverage 摘要（如适用）

| 指标 | 值 |
| --- | ---: |
| Total line coverage | `99.15%` |
| Total function coverage | `99.01%` |
| 文件总数 | `101` |
| 未覆盖文件数 | `6` |

热点 / 低覆盖文件：

| 文件 | Line % | Function % | 说明 |
| --- | ---: | ---: | --- |
| `src/extension/module.ts` | `0%` | `100%` | 类型/轻量模块文件，覆盖统计显示未命中。 |
| `src/index.ts` | `0%` | `0%` | 根扩展导出/入口未被 coverage 运行路径命中。 |
| `src/modules/convert/types.ts` | `0%` | `100%` | 类型文件。 |
| `src/modules/guards/types.ts` | `0%` | `100%` | 类型文件。 |
| `src/modules/web/providers/types.ts` | `0%` | `100%` | 类型文件。 |
| `src/modules/web/types.ts` | `0%` | `100%` | 类型文件。 |

### 4.3 未执行验证说明

- 真实第三方 API / 真实 LSP server 集成验证：未执行；本项目当前测试策略以 mock provider、mock fetch、mock JSON-RPC 为主。
- 真实 MarkItDown CLI 转换 smoke test：未执行；本地单测使用 runner mock，符合 optional external provider 策略。

---

## 5. 修复路线图

### 5.1 立即处理（P0 / 阻断项）

- [x] `SEC-001`：所有 `web_search` provider endpoint 请求已统一接入 `fetchWithPinnedDns()`；`allowPrivateNetwork=false` 默认阻止 localhost/私网 provider baseUrl；测试已改为显式 `allowPrivateNetwork=true` 或 public test endpoint。
- [x] `SEC-002`：已修复 `sanitizeOutput()` 捕获组与 replacement；已新增 API key、AWS、OPENAI/ANTHROPIC、Authorization、URL secret query 回归测试。

### 5.2 当前迭代处理（P1）

- [x] `SEC-003`：MarkItDown stderr summary 已复用 shared redaction；已补 API key / URL token query 回归测试。
- [x] `SEC-004`：`convert_content` 工具执行链路已接收工具 context cwd 并传入 `validateLocalFilePath(inputPath, workspaceRoot)`；已补 cwd/workspace 边界测试。

### 5.3 近期排期（P2）

- [ ] `RES-001`：重构或移除当前 `HttpConnectionPool`；如保留连接池，改用 undici `Agent` / `Dispatcher` 并与 pinned DNS 兼容，统计改为真实值或删去误导性字段。
- [x] `DOC-001`：已同步 security-model/web-providers/web-tools 文档，明确 `web_search` provider baseUrl 的私网策略。
- [ ] `TEST-001`：清理或正式记录 11 个 skipped 测试的风险接受理由；能跨平台化的改为正常运行。
- [ ] `ENG-001`：CI 增加 `pnpm typecheck` 和 `pnpm lint`；lint 范围评估扩展到 `tests`、`scripts`、`docs/.vitepress/config.ts`。
- [ ] `ARCH-001`：收敛 `/toolkit`/subagent commands 对 web/convert observability 的跨模块读取，提供 shared facade 或迁移到 commands 模块。

### 5.4 后续优化（P3）

- 当前无 P3 finding。

---

## 6. 最终结论

### 6.1 当前判断

`devkit-pi` 已具备较成熟的模块化结构、测试覆盖率和文档体系；本轮发现的 P0/P1 安全问题已关闭。剩余风险集中在 HTTP pool 真实连接限制、跨模块 observability 读取、skipped tests 与工程门禁范围。

### 6.2 是否建议继续新增功能

`Conditional`：P0/P1 已关闭；建议处理 `RES-001` / `ENG-001` 后再扩大用户可见网络或外部命令能力。

### 6.3 是否建议先重构 / 补测试 / 补文档

- 重构：`Conditional`：优先处理 http pool 与 observability 边界；避免大规模顶层重排。
- 补测试：`Yes`：P0/P1 已补 security regression tests；继续处理 skipped tests 口径。
- 补文档：`Conditional`：P0/P1 文档已同步；后续用户可见行为变化继续同步文档。

### 6.4 下一步三件事

1. 处理 `RES-001`：校正 HTTP connection pool 语义与统计。
2. 处理 `ENG-001`：CI 增加 `pnpm typecheck` 与 `pnpm lint`，并评估 lint/test glob 覆盖范围。
3. 处理 `TEST-001`：为 skipped tests 增加书面理由或跨平台替代覆盖。

---

## 7. 复审记录

> 每次复审追加一个小节，不覆盖旧记录。复审后必须同步更新第 0 章汇总与第 8 章问题总表。

### 7.1 复审（2026-05-21）

- 复审基线：`main` / `6d5cea645273c7e7d2bf33beb84069253c845eac`
- 已关闭问题：`SEC-001`、`SEC-002`、`SEC-003`、`SEC-004`、`DOC-001`。
- 状态变化：`SEC-001 Open -> Closed`、`SEC-002 Open -> Closed`、`SEC-003 Open -> Closed`、`SEC-004 Open -> Closed`、`DOC-001 Open -> Closed`。
- 新增问题：`SEC-001`、`SEC-002`、`SEC-003`、`SEC-004`、`RES-001`、`ARCH-001`、`TEST-001`、`DOC-001`、`ENG-001`
- 验证命令：`pnpm typecheck`、`pnpm lint`、`pnpm test`、`pnpm docs:check`、`pnpm test:coverage` 均通过。
- 复审结论：质量基线高，P0/P1 已关闭；按路线图继续关闭 P2。

---

## 8. 附录：问题总表（Finding Registry）

> 第 8 章是唯一状态源。新增、关闭、暂缓、缓解任何问题，都必须更新本表。

| ID | 领域 | 问题标题 | Priority | Status | 阶段来源 | 影响摘要 | 证据（代码/测试/文档/命令） | 风险接受 / 暂缓原因 | 重开触发条件 | 下一步动作 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| SEC-001 | 安全 | `web_search` provider endpoint 未走统一 URL 安全校验 | P0 | Closed | 原审计 → 本轮修复 | provider endpoint 已统一接入 pinned DNS fetch，默认阻止私网 provider baseUrl。 | 代码：`src/modules/web/providers/{ddgs,brave,openserp,searxng,serper,tavily}.ts` 使用 `fetchWithPinnedDns()`；测试：`tests/web/providers.test.ts` 新增 provider 私网阻断测试，`tests/web/search.test.ts` 对本地测试 provider 显式设置 `allowPrivateNetwork=true`；文档：`docs/guides/security-model.md`、`docs/reference/web-tools.md`、`docs/reference/web-providers.md` 及 zh 对应页。 | - | provider 网络路径重新绕过 pinned fetch 或默认允许私网 baseUrl。 | 维持 provider 私网阻断回归测试；新 provider 必须复用 pinned fetch。 |
| SEC-002 | 安全 | `sanitizeOutput()` 敏感值替换表达式反向保留 secret | P0 | Closed | 原审计 → 本轮修复 | 子代理输出 sanitizer 已修复捕获组，不再把敏感值作为 replacement 输出。 | 代码：`src/modules/subagents/sanitize.ts`；测试：`tests/subagents/sanitize.test.ts` 覆盖 API key、access token、AWS、OPENAI、Authorization、Bearer、GitHub token、URL secret query；命令：`pnpm test`。 | - | sanitizer 对任何 secret 模式仍输出原值，或新增模式缺少测试。 | 维持 secret redaction 矩阵测试；新增敏感模式必须先补测试。 |
| SEC-003 | 安全 | `convert_content` 直接暴露外部 CLI stderr 摘要 | P1 | Closed | 原审计 → 本轮修复 | MarkItDown stderr summary 已在进入 error message/causeSummary 前复用 shared output redaction。 | 代码：`src/modules/convert/provider.ts` 的 `summarizeStderr()` 调用 `sanitizeOutput()`；测试：`tests/convert/provider.test.ts` 覆盖 API key 与 URL token query redaction；共享实现：`src/shared/output-sanitize.ts`。 | - | MarkItDown 或其他 provider stderr 未做 redaction 即用户可见。 | 维持 stderr redaction 回归测试；新增 converter provider 必须复用 shared redaction。 |
| SEC-004 | 安全 | `convert_content` 本地路径边界使用 `process.cwd()` 而非工具上下文 cwd | P1 | Closed | 原审计 → 本轮修复 | `convert_content` 工具执行链路已把工具上下文 `ctx.cwd` 作为 workspace root 传入本地路径校验。 | 代码：`src/modules/convert/index.ts` execute 传入 `{ workspaceRoot: ctx.cwd }`；`src/modules/convert/tool.ts` 将 runtime workspaceRoot 传给 `validateLocalFilePath()`；测试：`tests/convert/tool.test.ts` 覆盖 process cwd 与 workspace root 分离场景。 | - | 工具上下文 cwd 与 `process.cwd()` 不一致场景未被正确处理。 | 维持 cwd/workspace 分离测试；未来文件系统工具必须显式传入 workspace root。 |
| RES-001 | 资源 | HTTP connection pool 对 global fetch 的连接限制可能无效且统计不可信 | P2 | Open | 原审计 | `web.connectionPool` 配置可能无法真正限制连接数，诊断 stats 误导维护者。 | 代码：`src/modules/web/http-pool.ts` 将 `http.Agent/https.Agent` 通过 `agent` 传给 `fetch()` 并 `@ts-expect-error`；`activeSockets` 用取模近似，`pendingRequests` 固定 0。 | - | 连接池仍通过非 undici dispatcher 实现或 stats 仍为近似值但对用户展示为真实值。 | 使用 undici dispatcher/Agent 或删除连接池承诺；修正 stats 与文档。 |
| ARCH-001 | 架构 | `/toolkit` 与 subagent commands 跨模块读取 web/convert observability | P2 | Open | 原审计 | 聚合命令职责可接受，但观测数据读取路径分散，后续模块扩展易形成边界漂移。 | 代码：`src/modules/commands/register.ts`、`src/modules/subagents/commands/{activity,logs,doctor}.ts` 读取 web/convert/lsp/guards 状态。 | - | 新增观测命令继续深度导入功能模块私有实现。 | 提供 shared observability facade，或将活动/日志命令集中到 `modules/commands`。 |
| TEST-001 | 测试 | 当前测试集中仍有 11 个 skipped tests | P2 | Open | 原审计 | 与项目“严禁跳过测试”规范存在张力，可能掩盖 subagent timeout/output hard limit 旧路径回归。 | 命令：`pnpm test` / `pnpm test:coverage` 显示 473 tests、462 pass、11 skipped；代码：`tests/subagents/execution.test.ts` 使用 `itPosix = process.platform === "win32" ? it.skip : it`。 | - | skipped tests 无明确维护者接受记录，或对应行为缺少跨平台替代测试。 | 为 skipped tests 增加书面理由并确认替代覆盖；优先跨平台化可迁移用例。 |
| DOC-001 | 文档契约 | web 安全文档与 `web_search` provider 行为不一致 | P2 | Closed | 原审计 → 本轮修复 | 文档已与 provider pinned DNS / private network blocking 行为对齐。 | 文档：`docs/guides/security-model.md`、`docs/zh/guides/security-model.md`、`docs/reference/web-tools.md`、`docs/zh/reference/web-tools.md`、`docs/reference/web-providers.md`、`docs/zh/reference/web-providers.md`；验证：`pnpm docs:check`。 | - | provider 网络安全行为变化但文档未同步。 | 新增 provider 或网络策略变化时同步 web tools/providers/security docs。 |
| ENG-001 | 工程化 | 质量门禁覆盖范围不足 | P2 | Open | 原审计 | CI 未显式运行 typecheck/lint；lint 仅覆盖 `src`；新增嵌套 tests 可能被 test glob 漏跑。 | 配置：`.github/workflows/ci.yml` 运行 docs/test/coverage 但无 typecheck/lint；`package.json` 的 `lint` 为 `biome check src`；`test:unit` 仅匹配 `tests/shared/*.test.ts`，嵌套测试依赖桥接文件。 | - | CI 或本地质量脚本继续漏掉可执行代码/配置/嵌套测试。 | CI 增加 typecheck/lint；评估扩展 lint/test glob 到 tests/scripts/docs config。 |

### ID 命名建议

| Prefix | 领域 |
| --- | --- |
| `SEC` | 安全 |
| `RES` | 资源限制 / 输出大小 / 内存 |
| `PERF` | 性能 |
| `ARCH` | 架构与模块边界 |
| `QUAL` | 代码质量与维护性 |
| `ERR` | 错误处理 |
| `OBS` | 日志、diagnostics、可观测性 |
| `TEST` | 测试体系 |
| `DOC` | 文档契约 |
| `ENG` | 工程化 / CI / package / runtime |
| `WF` | 开发流程与协作 |
