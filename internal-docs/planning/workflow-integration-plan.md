---
status: proposed
audience: maintainer
last_verified: 2026-05-14
language: chinese
source_context:
  - code-quality-audit-2026-05-13.md
  - discussion: devkit-pi 与 pi-superpowers-plus 轻量集成策略
---

# devkit-pi 轻量 Workflow 能力整合计划

> **计划基准**:基于 `项目代码质量审计报告 · devkit-pi`(审计基准 commit: `db96565`，审计日期: 2026-05-13)与后续关于 `pi-superpowers-plus` 的讨论。
> **计划目标**:在不破坏 devkit-pi "轻量、模块化、主代理编排、readonly-first"定位的前提下，借鉴 `pi-superpowers-plus` 的 workflow 思想，逐步整合 devkit-pi 真正需要的核心能力。
> **核心判断**:当前阶段不建议直接集成完整 `pi-superpowers-plus`，也不建议马上实现 Plan Tracker / Workflow Monitor / TDD Gate。应先完成安全与稳定性加固，再增加低侵入的 session guardrails，最后将 workflow 方法论文档化。

---

## 一、背景与原则

### 1.1 当前 devkit-pi 定位

`devkit-pi` 当前更接近一个 **pi coding agent 扩展工具包**，而不是完整多代理框架或强约束 workflow 框架。

现有核心能力包括:

```text
subagents(前台只读任务委派)
+ web research(web_search / fetch_content / get_search_content)
+ convert_content(通过 `src/modules/convert/provider.ts` 调用 MarkItDown CLI，将本地/安全下载的远程文件转 Markdown)
+ LSP code intelligence(显式 lsp tool + diagnostics hook)
+ /toolkit 命令中心
```

因此，本计划不以"复制 Superpowers"或"变成强流程框架"为目标，而是以以下方向为准:

```text
devkit-pi core = 轻量工具增强
devkit-pi guardrails = 低侵入安全与验证提醒
devkit-pi workflow docs = 推荐工作流方法论
strict workflow = 长期可选，不进入当前三阶段
```

### 1.2 来自 pi-superpowers-plus 的可借鉴点

`pi-superpowers-plus` 的价值不在于某一个工具，而在于它提出了一套 agentic development discipline:

- 先澄清与计划，再执行;
- 修改前确认工作区和分支;
- 完成前必须验证;
- bug 修复应先复现;
- review 与 implementation 应分离;
- 复杂任务应拆分，并由主 agent 负责编排;
- subagent 应隔离上下文，避免污染主上下文。

这些思想值得 devkit-pi 吸收。

但 `pi-superpowers-plus` 的一些运行时 enforcement 对 devkit-pi 来说偏重:

- Workflow Monitor;
- Plan Tracker;
- Brainstorm / Plan 阶段写入限制;
- TDD warning / gate;
- commit / push / PR gate;
- 自带 subagent subprocess runner。

这些能力不应在当前阶段原样合入 devkit-pi。

### 1.3 总体集成原则

本计划采用以下原则:

1. **先修底座，再加功能**
   先解决审计报告中指出的安全默认、资源上限、文档漂移和 LSP 复杂度问题，再考虑 workflow 相关增强。

2. **默认提醒，不默认拦截**
   devkit-pi 默认只做 soft warning / notice，不做 hard gate。

3. **优先零状态 / 低状态实现**
   避免引入复杂状态机、跨 session 追踪、TUI tracker、持久 workflow phase。

4. **不复制 pi-superpowers-plus 实现**
   只吸收设计思想，不直接搬运大文件、prompt 原文或 runtime monitor。

5. **文档先行，runtime 后置**
   workflow 方法论先通过文档沉淀，确认稳定后再考虑轻量命令或 hook。

6. **严格模式长期可选**
   TDD gate、commit/push gate、Plan 阶段写入限制等仅作为长期 opt-in 方向，不进入当前三阶段实施范围。

---

## 二、阶段总览

| 阶段 | 名称 | 目标 | 是否新增 runtime 功能 | 优先级 |
|---|---|---|---:|---:|
| 阶段 0 | 底座加固 | 修复安全默认、资源上限、文档漂移和 LSP 维护热点 | 否，除修复必要代码外不加新功能 | 最高 |
| 阶段 1 | 轻量 Session Guardrails | 增加 git context notice、首次写入提醒、completion 前验证提醒 | 是，但只做低状态 hook | 高 |
| 阶段 2 | Workflow 方法论文档化 | 将 planning/debugging/review/verification 最佳实践写成 devkit-pi 风格文档 | 否，先不做命令/tool | 中 |

### 不在当前三阶段内实现的内容

以下内容暂不进入近期实现:

```text
- Workflow Monitor 大一统运行时监督器
- Plan Tracker / TUI widget
- workflow phase 持久状态机
- TDD hard gate
- commit / push / PR hard gate
- Brainstorm / Plan 阶段写入硬限制
- 复制 pi-superpowers-plus 的 subagent runner
- 直接依赖 pi-superpowers-plus 作为 devkit-pi runtime 依赖
```

---

# 阶段 0:底座加固

## 0.1 阶段目标

阶段 0 的目标是先提升 devkit-pi 作为通用 extension 包的可信度。

本阶段不追求新增功能，而是修复审计中最影响安全、稳定性和维护性的缺口:

```text
安全默认
资源上限
文档一致性
LSP 复杂度
子进程资源清理
```

阶段 0 完成后，devkit-pi 才适合进入 workflow guardrails 增强。

## 0.2 本阶段不做什么

本阶段明确不做:

- 不新增 `/toolkit workflow`;
- 不新增 workflow phase;
- 不新增 Plan Tracker;
- 不新增 TDD gate;
- 不新增 commit/push gate;
- 不集成 `pi-superpowers-plus`;
- 不做大规模目录重排;
- 不改变现有 public tool schema，除非为安全修复必要。

## 0.3 任务 0-A:修复 HTTPS TLS 安全默认

### 问题

当前 `src/modules/web/http-pool.ts` 中存在:

```ts
rejectUnauthorized: false
```

这会导致 HTTPS Agent 默认允许不可信证书，与"安全默认"原则冲突。

### 推荐改法

优先方案:删除该字段，使用 Node 默认 TLS 校验。

```ts
// 不显式设置 rejectUnauthorized
new https.Agent({
  keepAlive: true,
  maxSockets,
  timeout,
});
```

如确实需要支持自签名证书，应新增显式高风险配置:

```json
{
  "web": {
    "connectionPool": {
      "allowInsecureTls": false
    }
  }
}
```

但第一版建议不要加配置，直接恢复安全默认。

### 需要修改的文件

```text
src/modules/web/http-pool.ts
tests/web/http-pool.test.ts 或新增对应测试文件
docs/zh/guides/security-model.md
docs/zh/reference/configuration.md(如涉及配置说明)
```

### 验收标准

- HTTPS agent 默认不关闭证书校验;
- 测试能锁定不出现 `rejectUnauthorized: false` 的行为;
- 安全文档不再暗示默认支持不安全 TLS;
- `pnpm typecheck`、`pnpm lint`、`pnpm test` 通过。

---

## 0.4 任务 0-B:修正文档默认值漂移

### 问题

修复前源码与文档存在默认值不一致:

```text
源码:subagents.timeoutMs = 900000
旧文档:subagents.timeoutMs = 300000
源码:idleTimeoutMs = 180000
旧文档完整示例未列出 idleTimeoutMs
```

当前执行本任务时，应确保 reference 文档已更新为源码默认值，并通过 `pnpm docs:check` 锁定关键默认值。

### 推荐改法

以源码 `src/config/load-config.ts` 为 canonical source，同步文档。

### 需要修改的文件

```text
src/config/load-config.ts(确认无需变更)
docs/reference/configuration.md
docs/zh/reference/configuration.md
docs/reference/subagents.md
docs/zh/reference/subagents.md
internal-docs/maintain/testing.md
scripts/check-docs.mjs
```

### 建议增强 docs check

新增最小默认值一致性检查:

```text
- subagents.timeoutMs
- subagents.idleTimeoutMs
- web.maxResponseBytes
- convertContent.maxContentChars
- lsp.hook.enabled
- lsp.hook.mode
```

第一版可以只检查已出现漂移的两个字段。

### 验收标准

- 配置 reference 与源码默认值一致;
- `internal-docs/maintain/testing.md` 列出当前 `tests/convert/` 和 `tests/shared/`;
- `pnpm docs:check` 能捕捉关键默认值漂移;
- `pnpm typecheck`、`pnpm lint`、`pnpm test`、`pnpm docs:check` 通过。

---

## 0.5 任务 0-C:增加外部命令 stdout/stderr 字节上限

### 问题

`src/shared/external-command.ts` 当前会先完整累积 stdout/stderr，再由上层截断。这可能导致 MarkItDown 或异常外部命令输出过大时内存膨胀。

### 推荐改法

给 `ExternalCommandRunOptions` 增加:

```ts
maxStdoutBytes?: number;
maxStderrBytes?: number;
```

默认值建议:

```ts
const DEFAULT_MAX_STDOUT_BYTES = 8 * 1024 * 1024; // 8 MiB
const DEFAULT_MAX_STDERR_BYTES = 1 * 1024 * 1024; // 1 MiB
```

超限策略建议:

```text
- 标记 stdout/stderr truncated
- 尝试终止子进程
- 返回结构化错误或带 truncated metadata 的结果
```

对 convert 场景，shared runner 应返回稳定 metadata 或内部错误状态，由 `src/modules/convert/provider.ts` 映射为 public convert error。若新增 public error code，建议命名为:

```text
CONVERT_OUTPUT_TOO_LARGE
```

新增 public error code 时必须同步 `src/modules/convert/errors.ts`、中英文 `convert-tools.md`、README / README.zh 中的错误码列表和测试。若不想扩大 public schema，第一版可将其映射为 `CONVERT_FAILED`，但 message 必须明确 stdout/stderr 超限。

### 需要修改的文件

```text
src/shared/external-command.ts
src/modules/convert/provider.ts
tests/shared/external-command.test.ts
tests/convert/provider.test.ts
```

### 验收标准

- stdout 超限不会无限累积;
- stderr 超限不会无限累积;
- 超限时结果中包含明确错误信息;
- convert_content 不会因异常大输出导致内存膨胀;
- 相关测试覆盖 stdout/stderr 超限路径。

---

## 0.6 任务 0-D:增加 subagent child 输出硬上限

### 问题

`src/modules/subagents/execution.ts` 会收集 child pi JSONL 输出与 stderr。异常子进程或错误配置可能产生大量输出。

### 推荐改法

新增配置或内部常量:

```ts
maxStdoutBytes: 8 * 1024 * 1024
maxStderrBytes: 1 * 1024 * 1024
maxJsonlLines: 10000
```

第一版建议内部常量即可，不急于暴露配置。

超限后:

```text
- 终止 child pi 进程
- 返回 `SUBAGENT_OUTPUT_TOO_LARGE`(如新增 public error code)，或在第一版复用 `SUBAGENT_OUTPUT_TRUNCATED` 但 message 必须明确这是 child output hard cap 而非普通最终输出截断
- 保留前 N 字节或尾部摘要
- activity log 中记录超限原因
```

### 需要修改的文件

```text
src/modules/subagents/execution.ts
src/shared/types.ts(如新增 public subagent error code)
tests/subagents/execution.test.ts
tests/subagents/runtime.test.ts(如涉及 runtime 输出/渲染语义)
tests/subagents/collect-output.test.ts(如新增该测试文件)
```

### 额外修复

同时修复 `spawnPi()` abort listener remove 引用问题:

```ts
const onAbort = () => { ... };
signal.addEventListener("abort", onAbort);
...
signal.removeEventListener("abort", onAbort);
```

### 验收标准

- child stdout/stderr 超限会停止收集并终止子进程;
- abort listener 可以正确 remove;
- 超限错误结构化，并与 `src/shared/types.ts` 中的 subagent error code / `docs/reference/result-schema.md` / `docs/zh/reference/result-schema.md` / README / README.zh 保持一致;
- 不影响正常 subagent JSONL 输出收集;
- 相关测试覆盖超限与 listener cleanup。

---

## 0.7 任务 0-E:统一 web provider 有限读取

### 问题

`fetch_content` 主链路已有有限 body reader，但部分 search provider 仍直接调用 `response.text()`。

### 推荐改法

新增 provider fetch helper:

```text
src/modules/web/http-client.ts
```

或在现有 helper 中加入:

```ts
readLimitedText(response, {
  maxBytes,
  context: "search-provider",
});
```

provider 不再直接使用:

```ts
await response.text();
```

而是统一走有限读取。

### 需要修改的文件

```text
src/modules/web/providers/*.ts
src/modules/web/http-client.ts 或 src/modules/web/read-limited.ts(新增模块内 helper)
src/modules/web/fetch.ts(可保持 private reader，不建议直接跨文件深度复用 private helper)
tests/web/providers/*.test.ts
tests/web/fetch.test.ts
```

### 验收标准

- 所有 search provider 响应体读取都有 max bytes;
- 超限时返回 provider-level 结构化错误或截断标记;
- includeContent 流程不被破坏;
- 大响应测试通过。

---

## 0.8 任务 0-F:LSP 文件读取增加大小限制

### 问题

LSP manager 中存在同步读取文件且无大小限制的路径。超大文件可能阻塞事件循环或造成内存压力。

### 推荐改法

新增内部常量或配置:

```ts
const DEFAULT_LSP_MAX_SOURCE_FILE_BYTES = 2 * 1024 * 1024; // 2 MiB
```

限制对象应主要是用户 source file / didOpen 内容读取 / symbol position refinement，不应误伤 package.json、pubspec.yaml、tsconfig 等小型 server/root detection 配置读取。建议抽内部 helper:

```ts
readTextFileLimited(filePath, maxBytes)
```

读取前先 `stat`:

```ts
const stat = statSync(filePath);
if (stat.size > maxFileBytes) {
  return createLspError("LSP_FILE_TOO_LARGE", ...);
}
```

第一版建议内部常量，不急于暴露配置。

### 需要修改的文件

```text
src/modules/lsp/core.ts
src/modules/lsp/tool.ts(如错误映射在 tool 层)
tests/lsp/tool.test.ts 或新增 manager 测试
```

### 验收标准

- 超大文件不会被同步完整读取;
- 返回明确错误;
- 小文件行为不变;
- diagnostics hook 不因单个大文件崩溃。

---

## 0.9 任务 0-G:标注 DNS rebinding 限制

### 问题

当前 Web / Convert SSRF 防护是先 DNS lookup 检查，再 fetch。实际连接时底层可能重新解析 DNS，存在 TOCTOU 风险。

### 推荐改法

短期:文档明确限制。

长期:设计连接阶段 IP pinning。

本阶段只做短期文档与测试准备。注意:当前 `docs/zh/reference/convert-tools.md` 已包含 DNS TOCTOU / rebinding 限制说明，本任务重点是补齐英文与 Web/security 文档，避免重复或互相矛盾。

### 需要修改的文件

```text
docs/guides/security-model.md
docs/zh/guides/security-model.md
docs/reference/web-tools.md
docs/zh/reference/web-tools.md
docs/reference/convert-tools.md
docs/zh/reference/convert-tools.md
tests/web/security.test.ts
tests/convert/tool.test.ts(如需要添加 TODO/注释测试)
```

### 文档建议表述

```text
当前 URL 安全检查默认阻断 localhost、私网地址和 file 协议，并在 redirect 后重复校验。
但当前实现不提供强 DNS rebinding 防护;攻击者控制域名解析时，仍可能存在 DNS 校验与实际连接之间的 TOCTOU 风险。
高风险环境应禁用远程 URL 转换/抓取，或等待后续连接阶段 IP pinning 实现。
```

### 验收标准

- 安全文档不夸大 SSRF 防护能力;
- web/convert reference 中说明限制;
- 后续 IP pinning 有明确 TODO 或设计入口。

---

## 0.10 任务 0-H:LSP core 拆分设计记录(非阶段 0 阻塞项)

### 问题

`src/modules/lsp/core.ts` 约 1876 行，混合 server registry、spawn、JSON-RPC client、diagnostics、actions、formatters 等职责。

### 推荐策略

阶段 0 不把 LSP core 拆分作为阻塞验收项。若在修复 0-F 时触及相关代码，可顺手完成低风险 helper 提取;否则只需记录拆分边界和后续任务:

```text
- 标注 public facade 边界
- 提取纯 helper 到 formatters.ts
- 提取 server registry 到 server-registry.ts
- 保持 LSPManager public API 不变
```

### 推荐拆分目标

```text
src/modules/lsp/
├── core.ts                    # facade，保留对外 LSPManager 接口
├── server-registry.ts          # LSP_SERVERS、language ids、root detection
├── client-manager.ts           # init/open/close/restart/cleanup
├── diagnostics.ts              # document/workspace diagnostics
├── actions.ts                  # definition/references/hover/signature/symbols
├── edits.ts                    # rename/codeAction result formatting
├── server-install.ts           # Kotlin/Dart 等辅助外部命令
└── formatters.ts               # shared output formatting helpers
```

### 验收标准

- 阶段 0 不要求完成全面拆分;
- 如做 helper 提取，public API 不变，现有 LSP tests 全部通过;
- 如不拆分，应在本计划或后续 maintenance issue 中明确拆分边界;
- 不因重构引入新行为。

### 执行记录

阶段 0 未进行 LSP core 全面拆分;拆分边界已记录在 `internal-docs/issues/lsp-core-split-boundaries.md`，作为后续 maintenance issue / implementation plan 的设计入口。

---

## 0.11 阶段 0 验收清单

阶段 0 完成标准:

```text
pnpm typecheck ✅
pnpm lint ✅
pnpm test ✅
pnpm docs:check ✅
```

并满足:

- [x] HTTPS 默认不关闭证书校验;
- [x] 配置文档默认值与源码一致;
- [x] external command stdout/stderr 有硬上限;
- [x] subagent child 输出有硬上限;
- [x] web provider 不直接无限 `response.text()`;
- [x] LSP 大文件读取有上限;
- [x] DNS rebinding 限制已文档化;
- [x] abort listener remove 修复;
- [x] LSP core 拆分边界已记录;如实际提取 helper，现有 LSP 行为不变。

---

# 阶段 1:轻量 Session Guardrails

## 1.1 阶段目标

阶段 1 才开始吸收 `pi-superpowers-plus` 的轻量运行时能力。

重要约束:第一版 guardrails 默认只做 **user-visible notice**，优先通过 `ctx.ui.notify` / `ctx.ui.setStatus` 等 UI 通道展示;非交互式或无 UI 场景可静默降级或仅记录 debug/activity。默认不通过 `pi.sendMessage()` 注入 follow-up，不触发额外 agent turn，不污染主 agent 上下文。

目标不是实现 Workflow Monitor，而是增加三个低侵入、低状态、高收益的 guardrails:

```text
1. Git context notice
2. First write notice
3. Verification status notice
```

这些能力只做提醒，不做拦截。提醒对象默认是用户，而不是要求 agent 自动改写当前回复。

## 1.2 本阶段不做什么

阶段 1 明确不做:

- 不做 Plan Tracker;
- 不做 workflow phase state;
- 不做 Brainstorm/Plan 阶段写入限制;
- 不做 TDD gate;
- 不做 commit/push gate;
- 不做跨 session 状态恢复;
- 不新增复杂 TUI widget;
- 不修改 subagent runner 架构。

## 1.3 推荐模块命名

不建议一开始命名为 `workflow`，因为这容易诱导后续把状态机和强约束都塞进去。

推荐命名:

```text
src/modules/guards/
```

或:

```text
src/modules/session-guards/
```

推荐使用 `guards`，简洁、低承诺、符合轻量护栏定位。

## 1.4 推荐目录结构

```text
src/modules/guards/
├── index.ts
├── config.ts
├── types.ts
├── git-context.ts
├── verification-reminder.ts
├── tool-classifier.ts
├── command-classifier.ts
└── state.ts
```

测试目录:

```text
tests/guards/
├── git-context.test.ts
├── verification-reminder.test.ts
├── command-classifier.test.ts
└── register.test.ts
```

## 1.5 配置设计

建议在 devkit-pi 配置中新增:

```json
{
  "guards": {
    "enabled": true,
    "gitContextNotice": true,
    "firstWriteReminder": true,
    "verificationReminder": true,
    "mode": "light"
  }
}
```

其中:

```text
mode = light
```

第一版只支持 `light`。即使预留 `guided` / `strict`，也不要实现对应行为。

更保守的做法:不暴露 `mode`，只暴露三个 boolean。推荐第一版采用更保守方案:

```json
{
  "guards": {
    "enabled": true,
    "gitContextNotice": true,
    "firstWriteReminder": true,
    "verificationReminder": true
  }
}
```

## 1.6 任务 1-A:Git context notice

### 目标

在 session 第一次工具输出后，轻量显示当前仓库上下文:

```text
Repo: /path/to/repo
Branch: main
Worktree: clean / dirty
Detached HEAD: no
```

### 触发时机

推荐监听:

```text
tool_result
```

首次出现工具结果后，如果当前 cwd 属于 git repo，则显示一次 notice。

### 状态设计

只需要 session 内状态:

```ts
type GuardsSessionState = {
  hasShownGitContext: boolean;
  hasWarnedBeforeFirstWrite: boolean;
  modifiedFiles: Set<string>;
  verificationCommands: string[];
};
```

### git 信息获取

可使用外部命令:

```bash
git rev-parse --show-toplevel
git branch --show-current
git status --porcelain
git rev-parse --is-inside-work-tree
git rev-parse --abbrev-ref HEAD
```

需要注意:

- command timeout 应较短，例如 1000-2000ms;
- 失败时静默降级，不影响主流程;
- 不应在非 git repo 中输出噪声。

### 输出示例

```text
[devkit-pi] Git context: branch=feature/workflow-guards, status=dirty, repo=devkit-pi.
```

### 验收标准

- git repo 中只显示一次;
- 非 git repo 不显示;
- detached HEAD 有明确提示;
- dirty working tree 有提示，但不阻止;
- git 命令失败不影响 agent 正常执行。

### 执行记录

已新增 `src/modules/guards/`，在主代理进程注册 `tool_result` listener。`gitContextNotice` 使用短 timeout 的 `git` 命令读取 repo、branch、dirty/detached 状态，并通过 `ctx.ui.notify(..., "info")` 或 `ctx.ui.setStatus` 软提示;非 git repo、git 不可用或命令失败时静默降级，不触发 follow-up turn，也不阻止工具调用。

---

## 1.7 任务 1-B:First write notice

### 目标

在本 session 第一次写文件或修改文件前，向用户显示当前 branch/worktree 提醒。第一版不做交互式确认，不阻断工具调用，也不要求 agent 在当前上下文中响应。

### 触发时机

推荐监听:

```text
tool_call
```

识别 write/edit 类工具。

### 工具分类

需要维护一个轻量 classifier:

```ts
function isPotentialWriteTool(toolName: string): boolean {
  return [
    "write",
    "edit",
    "multi_edit",
    "apply_patch",
    "bash",
    "shell",
  ].includes(normalizeToolName(toolName));
}
```

对于 `bash` / `shell`，不要一律视为写入。可以结合命令内容做轻量判断:

```text
高概率写入命令:
- rm
- mv
- cp
- sed -i
- tee
- echo ... >
- cat ... >
- apply_patch
- git checkout
- git reset
- git clean
- pnpm install / npm install(会写 lockfile/node_modules)
```

第一版可以只识别明确写文件工具，不急着精确解析 shell。

### 输出示例

```text
[devkit-pi] First write in this session. Current branch: feature/workflow-guards; working tree: dirty. Please ensure this is the intended branch before editing.
```

### 验收标准

- 每个 session 最多提醒一次;
- 只在潜在写入前显示 user-visible notice;
- 不阻止工具调用，不做交互式确认;
- 非 git repo 可提示"not a git repo"或静默跳过;
- 不影响子代理 readonly 工具策略。

### 执行记录

已在 `src/modules/guards/index.ts` 注册 `tool_call` listener，并新增 `src/modules/guards/tool-classifier.ts`。首次疑似写入前读取 git context 并通过 UI soft notice 提醒当前 branch/worktree;显式 `write`/`edit`/`multi_edit`/`apply_patch` 视为写入，`bash`/`shell` 仅对明显 mutating commands 保守匹配。非 git repo 或 git 命令失败时静默跳过;不阻断工具调用，不做确认，不触发 follow-up turn。

---

## 1.8 任务 1-C:Verification status notice

### 目标

如果本轮发生了文件修改，且没有检测到验证命令，则在 agent 完成后向用户显示验证状态提醒。

这不是 gate，只是提醒。第一版不触发 follow-up turn，不要求 agent 自动改写最终回复;是否在未来通过 `pi.sendMessage(..., { deliverAs: "followUp" })` 触发 agent 自我修正，需要单独评估噪声、误判和与 LSP diagnostics follow-up 的交互。

### 核心逻辑

记录三类状态:

```text
1. 本轮是否发生写入
2. 本轮是否运行过验证命令
3. agent_end 是否发生;第一版不依赖"声称完成"关键词作为触发条件，避免误判后触发额外 turn
```

### 写入检测

复用 `isPotentialWriteTool()`。

### 验证命令检测

推荐第一版识别:

```text
pnpm test
npm test
npm run test
yarn test
pnpm lint
npm run lint
pnpm typecheck
npm run typecheck
tsc --noEmit
cargo test
cargo check
pytest
uv run pytest
go test
cmake --build
ctest
biome check
```

命令匹配应保守，不需要过度智能。

### 完成语义检测

第一版不建议依赖完成语义关键词触发 runtime 行为。关键词检测容易误判，并且 `agent_end` 时最终回复已经产生;如再提醒 agent，需要 follow-up turn，容易制造噪声。

如后续实现 guided/strict 模式，可再评估中文/英文完成语义检测，但仍只能作为弱信号。

### 输出示例

```text
[devkit-pi] Verification status: this session appears to have modified files, but no test/lint/typecheck/build command was detected. Suggested next step: run the relevant verification command or explicitly document that verification was not run.
```

### 执行记录

已新增 `src/modules/guards/command-classifier.ts`，在 `tool_call` 时记录保守识别到的 verification commands，并复用 `isPotentialWriteTool()` 记录当前 turn 的潜在修改。`agent_start` 会清空 turn-level 修改/验证状态；`agent_end` 时如果发现本 turn 有潜在写入但没有验证命令，则通过 UI soft notice 提醒用户，不调用 `pi.sendMessage()`，不触发 follow-up turn，也不阻止最终回复。

### 最终回复建议格式

workflow 文档可以引导 agent 在最终回复中包含：

```text
Verification:
- Ran: pnpm test ✅
- Not run: pnpm typecheck(原因:本轮未改 TS 类型相关代码)
```

如果未验证:

```text
Verification:
- Not run in this session.
- Suggested next step: pnpm typecheck && pnpm test
```

上述格式第一版主要写入 workflow 文档和 agent 指南，不由 runtime 强制改写最终回复。

### 验收标准

- 写文件但未检测到验证命令时能向用户显示 notice;
- 写文件且已检测到验证命令时不提醒;
- 未写文件时不提醒;
- 只提醒，不阻止，不触发 follow-up turn;
- 不声称测试已通过，除非实际检测到命令执行。

---

## 1.9 任务 1-D:与现有 diagnostics / activity 体系对齐

### 目标

避免新增一套割裂的日志体系。

### 推荐做法

第一版应优先输出用户可见 notice(UI 可用时用 `ctx.ui.notify` / status;无 UI 时静默降级或 debug-only)，不写复杂 activity log。

如果需要记录，应复用已有 activity/observability 机制，而不是新增 guard-specific logger。

### 注意事项

审计报告已指出当前没有统一 extension-level logger interface。因此阶段 1 不宜引入新 logger 抽象，除非阶段 0 已完成 shared logger。

### 验收标准

- guardrails 输出风格与 `/toolkit` / diagnostics 现有风格一致;
- 不引入大量裸 `console.log`;
- 不制造新的日志噪声。

### 执行记录

阶段 1 guards 当前只使用 `ctx.ui.notify(..., "info")` 或 `ctx.ui.setStatus` 作为 soft notice channel；没有新增裸 `console.log`，没有新增 activity log 或 guard-specific logger，也没有通过 `pi.sendMessage()` 注入 follow-up turn。架构与测试映射已补充到 `internal-docs/maintain/architecture.md` 和 `internal-docs/maintain/testing.md`。

---

## 1.10 阶段 1 验收清单

阶段 1 完成标准:

```text
pnpm typecheck ✅
pnpm lint ✅
pnpm test ✅
pnpm docs:check ✅
```

并满足:

- [x] 新增 `guards` 模块，职责清晰;
- [x] git context notice 只显示一次;
- [x] first write notice 只提醒一次；
- [x] verification status notice 能检测“修改但未验证”；
- [x] 所有 guardrails 默认只提醒，不阻止；
- [x] 配置可关闭 guardrails;
- [x] 不引入 Plan Tracker / phase state;
- [x] 不复制 `pi-superpowers-plus` runtime monitor;
- [x] guards 架构和测试映射已纳入维护文档。

### 收尾审查记录

阶段 1 已完成 1-A、1-B、1-C 和 1-D。当前实现保持 lightweight guardrails 边界：只提醒、不阻止、不做 workflow monitor、不触发 follow-up turn。公共配置和行为已同步到英文/中文 configuration reference，维护侧架构/测试文档已同步。

---

# 阶段 2:Workflow 方法论文档化

## 2.1 阶段目标

阶段 2 的目标是把 `pi-superpowers-plus` 中值得借鉴的 workflow 思想，改写成 devkit-pi 自己的维护者/用户指南。

本阶段仍不新增 runtime 命令。

重点是让用户知道:

```text
什么时候用 subagent
什么时候先计划
什么时候需要验证
如何做 debug
如何让 review agent 参与
如何避免大输出污染主上下文
```

## 2.2 本阶段不做什么

阶段 2 明确不做:

- 不新增 `/toolkit workflow`;
- 不新增 `workflow_reference` tool;
- 不新增 workflow phase tracking;
- 不新增 TDD gate;
- 不新增 Plan Tracker;
- 不把 Superpowers 原文复制进 docs;
- 不宣称 devkit-pi 官方兼容 `pi-superpowers-plus`。

## 2.3 推荐文档结构

建议第一版只新增单文件，降低导航与 docs check 维护成本:

```text
docs/guides/agent-workflow.md
docs/zh/guides/agent-workflow.md
```

后续如内容增长，再拆分 verification / review / debugging 独立文档。

## 2.4 文档 2-A:agent-workflow.md

### 推荐标题

```markdown
# Agent Workflow Guide · devkit-pi
```

### 推荐内容结构

```markdown
## 一、适用范围
## 二、devkit-pi 的工作流原则
## 三、轻量任务流程
## 四、复杂任务流程
## 五、Debug 流程
## 六、Review 流程
## 七、Verification before completion
## 八、Subagent 使用边界
## 九、不推荐的使用方式
## 十、常见任务模板
```

### 核心原则

建议写成 devkit-pi 风格:

```text
1. 主代理负责决策，subagent 负责局部调查/审查。
2. 默认 readonly-first，避免子代理直接改代码。
3. 小任务可以直接执行，但完成前要说明验证情况。
4. 大任务先写计划，再分步执行。
5. Debug 先复现，再定位，再修复，再验证。
6. Review 与 implementation 分离，避免同一上下文自我确认。
7. 大输出放进 subagent / web / convert / LSP 工具链，不污染主上下文。
```

## 2.5 文档 2-B:Verification before completion

如果拆分为独立文档，建议包含:

```markdown
# Verification Before Completion

## 为什么需要验证说明
## 什么算验证
## 什么不算验证
## 常见项目类型的验证命令
## 没有运行验证时如何诚实说明
## devkit-pi guardrails 如何提醒
```

### 推荐验证命令示例

```text
TypeScript / Node:
- pnpm typecheck
- pnpm lint
- pnpm test
- pnpm docs:check

Rust:
- cargo check
- cargo test

Python:
- python -m pytest
- uv run pytest

C/C++:
- cmake --build <build-dir>
- ctest --test-dir <build-dir>
```

### 推荐最终回复模板

```markdown
## Verification

- Ran: `pnpm typecheck` ✅
- Ran: `pnpm test` ✅
- Not run: `pnpm docs:check`(本轮未修改 docs)
```

未验证时:

```markdown
## Verification

- Not run in this session.
- Suggested next step: `pnpm typecheck && pnpm test`
```

## 2.6 文档 2-C:Subagent Review Workflow

### 目标

指导用户如何利用 devkit-pi 现有 subagents 做轻量 review，而不是引入新的 subagent runner。

### 推荐流程

```text
1. 主 agent 完成小范围实现;
2. 主 agent 调 readonly reviewer subagent;
3. reviewer 输出问题列表，按 severity 分类;
4. 主 agent 判断哪些问题需要修;
5. 主 agent 修改后运行验证;
6. 最终回复列出修改与验证结果。
```

### 推荐 review 输出格式

```markdown
## Review Findings

### Blocker
- ...

### Major
- ...

### Minor
- ...

### Notes
- ...
```

### 边界说明

```text
- subagent 不应继续 spawn subagents;
- reviewer 默认 readonly;
- reviewer 不应直接修改代码;
- 主 agent 保留最终决策权;
- 不应把 review 当成验证命令的替代品。
```

## 2.7 文档 2-D:Debugging Workflow

### 推荐流程

```text
1. Reproduce:先确认问题如何复现。
2. Observe:收集错误信息、日志、相关文件。
3. Narrow:缩小到最可能模块。
4. Fix:做最小修复，不做顺手重构。
5. Verify:运行对应测试或复现命令。
6. Document:必要时补充 troubleshooting 文档。
```

### 与现有 devkit-pi 工具对应

```text
web/fetch:查外部资料或报错背景
convert_content:读取 PDF/Word/复杂文件
lsp:定位 symbol、diagnostics、references
subagents:让 explorer/reviewer 做局部调查
/toolkit:查看工具状态、日志、doctor
```

## 2.8 文档 2-E:Planning Workflow

### 推荐流程

```text
1. Clarify:确认目标和边界。
2. Inspect:读取相关源码、文档、测试。
3. Plan:拆成 2-5 个小步骤。
4. Risk:列出可能破坏的边界。
5. Verify:提前定义验收命令。
6. Execute:按步骤小步修改。
```

### 不建议

```text
- 一开始就大规模重构;
- 没读测试就改核心逻辑;
- 没有验证方案就声称完成;
- 把计划、实现、review 全塞给同一个子代理;
- 为了 workflow 而 workflow，小任务不必过度流程化。
```

## 2.9 VitePress 导航更新

如文档站使用 VitePress，需要同步更新:

```text
docs/.vitepress/config.ts
或 docs/zh/index/sidebar 配置文件
```

新增 Guide 入口:

```text
Guides
- Agent Workflow
- Security Model
- Testing
- Release Checklist
```

如果阶段 2 只新增一个文档，则只加一个 nav item。

### 执行记录

已新增：

- `docs/guides/agent-workflow.md`
- `docs/zh/guides/agent-workflow.md`

并已同步导航入口：

- `docs/.vitepress/config.ts` guide sidebar
- `docs/README.md` / `docs/zh/README.md`
- `docs/index.md` / `docs/zh/index.md`

## 2.10 docs:check 增强

建议 `docs:check` 增加:

```text
- 新增文档是否被 sidebar/nav 引用;
- archive 文档是否没有被当成 current guide 引用;
- guide 中出现的命令是否仍存在于 package scripts;
- verification 文档中列出的 devkit-pi 命令是否可在 package.json 中找到。
```

第一版可只做"新增文档被导航引用"检查。

## 2.11 阶段 2 验收清单

阶段 2 完成标准:

```text
pnpm docs:check ✅
pnpm lint ✅
pnpm test ✅(如 docs check 集成测试需要)
```

并满足:

- [x] 新增 devkit-pi 风格 workflow guide;
- [x] 文档没有复制 `pi-superpowers-plus` 原文;
- [x] 明确 devkit-pi 不是强 workflow 框架;
- [x] 明确 subagent readonly-first 和主 agent orchestration;
- [x] 明确 completion 前验证说明格式;
- [x] VitePress sidebar/nav 已更新;
- [x] docs:check 能覆盖基本导航一致性。

### 收尾审查记录

阶段 2 已完成：

- 新增 `docs/guides/agent-workflow.md` 与 `docs/zh/guides/agent-workflow.md`；
- 内容明确 devkit-pi 是 lightweight workflow 指南，而非强约束 workflow 框架；
- 明确 readonly-first subagent 边界与主代理 orchestration 职责；
- 明确 completion 前 verification 说明格式；
- 完成 VitePress guide 导航同步；
- `scripts/check-docs.mjs` 已新增 guide sidebar 覆盖检查，确保新增 guide 必须被导航引用。

阶段 2 文档与导航一致性已闭环。

---

# 三阶段后的长期方向

完成上述三阶段后，再评估是否需要进入长期阶段。

## 方向 A:轻量 workflow command

可考虑新增:

```text
/toolkit workflow status
/toolkit workflow checklist
/toolkit workflow verify
```

但这些命令仍应只做提示，不做状态机。

## 方向 B:guided mode

可考虑配置:

```json
{
  "guards": {
    "mode": "guided"
  }
}
```

行为:

```text
- 更积极提醒计划/验证/review;
- 检测到大规模修改时建议先 plan;
- 检测到 bug 修复任务时建议先 reproduce;
- 仍不阻止工具调用。
```

## 方向 C:strict mode

仅当 devkit-pi 明确要支持强工程流程时再考虑:

```json
{
  "guards": {
    "mode": "strict",
    "tddGate": true,
    "gitCommandGate": true,
    "phaseWriteGuard": true
  }
}
```

strict mode 必须满足:

- 明确 opt-in;
- 可按项目关闭;
- 有绕过机制;
- 有充分测试;
- 不影响默认轻量体验。

---

## 风险与应对

### 风险 1:devkit-pi 变得过度 opinionated

**表现**:用户一安装就被 workflow 规则干扰。

**应对**:默认只提醒，不拦截;Plan Tracker / phase / gate 全部后置。

### 风险 2:出现第二个"上帝文件"

**表现**:新增 `workflow-monitor.ts` 变成几千行。

**应对**:拆成 `guards` 小模块;每个 guard 独立测试;不做大一统 monitor。

### 风险 3:验证提醒误判

**表现**:明明无需测试却提示未验证，或命令识别不完整。

**应对**:提醒文案保持温和;只说"未检测到"，不说"一定没验证";允许配置关闭。

### 风险 4:git context 增加噪声

**表现**:每次工具调用都输出 branch 信息。

**应对**:每 session 只输出一次;非 git repo 静默;失败静默降级。

### 风险 5:阶段 0 被跳过

**表现**:直接加 workflow 功能，安全/资源问题继续堆积。

**应对**:将阶段 0 作为阶段 1 的前置条件;未通过阶段 0 验收，不进入 guards 实现。

---

## 推荐实施顺序

最推荐顺序:

```text
0-A TLS 安全默认
0-B 文档默认值漂移
0-D subagent 输出上限 + abort listener
0-C external command 输出上限
0-E web provider 有限读取
0-F LSP 文件大小限制
0-G DNS rebinding 文档限制
0-H LSP core 拆分设计记录(非阶段 0 阻塞项)
1-A Git context notice
1-B First write notice
1-C Verification status notice
2-A Agent workflow guide
2-B Verification guide 内容
2-C Subagent review/debug 内容
2-D VitePress/docs:check 更新
```

如果需要进一步压缩，可按以下最小闭环执行:

```text
最小闭环 1:
- TLS 安全默认
- 文档默认值漂移
- external command 输出上限
- subagent 输出上限

最小闭环 2:
- Git context notice
- First write notice
- Verification status notice

最小闭环 3:
- agent-workflow.md
- docs nav 更新
- docs:check 更新
```

---

## 最终结论

devkit-pi 可以借鉴 `pi-superpowers-plus`，但当前最优路线不是"集成它"，而是:

```text
先加固底座
再加入轻量 guardrails
最后文档化 workflow 方法论
```

这条路线能同时满足三个目标:

1. 保持 devkit-pi 的轻量定位;
2. 吸收 Superpowers-like workflow 的核心价值;
3. 避免在安全与资源上限尚未补齐时继续扩大运行时复杂度。

最终形态应是:

```text
devkit-pi 默认仍是轻量工具包;
需要时提供温和的 session guardrails;
复杂 workflow 先由文档指导;
严格模式长期可选，绝不默认强制。
```
