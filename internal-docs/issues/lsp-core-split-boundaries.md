---
status: implemented
audience: maintainer
last_verified: 2026-05-18
language: chinese
---

# LSP core 拆分边界设计记录

> **状态**：本文档记录改造计划，代码实现已完成（见各改动文件的 git log）。本文档保留作为历史参考和背景说明。

## 背景

`src/modules/lsp/core.ts` 当前承担了多类职责：

- language id / server registry
- project root detection
- external LSP server discovery / spawn
- JSON-RPC client lifecycle
- didOpen / didChange / didSave / didClose 文档同步
- diagnostics pull/push 聚合
- definition / references / hover / signature / symbols 等 readonly actions
- rename / codeAction 相关 LSP 请求
- source file 读取限制与 symbol position refinement
- diagnostics / symbols formatting helpers

阶段 0 只完成安全与资源上限加固，不进行大规模拆分，以避免在 hardening 阶段引入行为变化。

## Public facade 边界

后续拆分必须保持以下 public/import 边界稳定，除非同步更新调用方、测试和文档：

- `LSPManager`
- `getOrCreateManager()`
- `shutdownManager()`
- `LSP_SERVERS`
- `LANGUAGE_IDS`
- `diagnosticsWaitMsForFile()`
- `filterDiagnosticsBySeverity()`
- `formatDiagnostic()`
- `collectSymbols()`
- `findSymbolPosition()` / `resolvePosition()`
- `uriToPath()`
- `getCppCompilationDbHint()`
- `DEFAULT_LSP_MAX_SOURCE_FILE_BYTES`
- `LspFileTooLargeError`
- `readTextFileLimited()`

`src/modules/lsp/tool.ts` 和 `src/modules/lsp/hook.ts` 应继续只依赖 facade exports，不应深度导入拆分后的私有模块。

## 推荐目标结构

```text
src/modules/lsp/
├── core.ts                    # facade + LSPManager 编排；保留 loadFile/openOrUpdate 等时序敏感实现
├── server-registry.ts          # LSP_SERVERS、LANGUAGE_IDS、root detection
├── client-manager.ts           # init/open/close/restart/cleanup、JSON-RPC lifecycle
├── diagnostics.ts              # document/workspace diagnostics、pull/push 聚合
├── actions.ts                  # definition/references/hover/signature/symbols
├── edits.ts                    # rename/codeAction 请求封装
├── source-files.ts             # source file 限制读取、URI/path helper、symbol refinement
└── formatters.ts               # filterDiagnosticsBySeverity、formatDiagnostic、collectSymbols 等纯格式化 helper
```

## 推荐拆分顺序（执行版）

> 目标：先立测试护栏，再做低风险拆分，最后推进生命周期与请求分层。

### Phase 0：冻结 facade 边界（先立护栏）

- 保持 `src/modules/lsp/core.ts` 对外导出名单不变：
  - `LSPManager`
  - `getOrCreateManager()`
  - `shutdownManager()`
  - `LSP_SERVERS`
  - `LANGUAGE_IDS`
  - `diagnosticsWaitMsForFile()`
  - `filterDiagnosticsBySeverity()`
  - `formatDiagnostic()`
  - `collectSymbols()`
  - `findSymbolPosition()` / `resolvePosition()`
  - `uriToPath()`
  - `getCppCompilationDbHint()`
  - `DEFAULT_LSP_MAX_SOURCE_FILE_BYTES`
  - `LspFileTooLargeError`
  - `readTextFileLimited()`
- `src/modules/lsp/tool.ts` 与 `src/modules/lsp/hook.ts` 仅依赖 `core.ts` facade export，不深度导入私有模块。

测试护栏（新增）：

- 在 `tests/lsp/tool.test.ts` 或新增 `tests/lsp/facade-contract.test.ts` 增加“facade export contract”测试：
  - 断言上述关键 exports 存在且可调用。
  - 防止拆分过程中 public 边界漂移。

### Phase 1：提取纯 helper（最低风险）

建议新增：

- `src/modules/lsp/formatters.ts`
  - `formatDiagnostic()`
  - `filterDiagnosticsBySeverity()`
  - `collectSymbols()`
- `src/modules/lsp/source-files.ts`（先放纯 helper）
  - `uriToPath()`
  - symbol 匹配纯算法 helper（如 best-match 逻辑）

要求：

- `core.ts` 通过 import/re-export 暴露稳定 API。
- 不修改 tool schema，不改错误码，不改返回形状。

测试护栏（新增）：

- `tests/lsp/formatters.test.ts`
  - severity 过滤全枚举
  - diagnostic 文本格式稳定性
  - `collectSymbols()` 的 query/depth 行为
- `tests/lsp/source-files.test.ts`
  - file URI、Windows URI fallback、异常输入兜底（由 `uriToPath` 用例覆盖）

### Phase 2：提取 source file 限制读取与位置精炼

集中到 `src/modules/lsp/source-files.ts`：

- `DEFAULT_LSP_MAX_SOURCE_FILE_BYTES`
- `LspFileTooLargeError`
- `readTextFileLimited()`
- `findSymbolPosition()`
- `resolvePosition()`
- `refineSymbolPositionFromSource()`

要求：

- 保持大文件错误语义不变（含错误类型与 message 基调）。
- 保持读取上限默认值不变。

测试护栏（新增/迁移）：

- 新增 `tests/lsp/source-files.test.ts`
  - 小文件读取成功
  - 超限触发 `LspFileTooLargeError`
  - `resolvePosition()` 在缺文件/超限/模糊匹配时退化行为稳定
- 保留 `tests/lsp/tool.test.ts` 的集成断言。

### Phase 3：提取 registry / root detection

建议新增 `src/modules/lsp/server-registry.ts`：

- `LANGUAGE_IDS`
- `LSP_SERVERS`
- root marker / root detection helpers
- `getCppCompilationDbHint()`

注意边界：

- Dart / Kotlin / Swift / C++ root detection 与外部命令辅助逻辑边界明确。
- 不改变现有 language server 选择策略。

测试护栏（新增）：

- `tests/lsp/server-registry.test.ts`
  - extension -> language id 映射
  - root marker 命中/未命中
  - C++ compilation db hint 行为
- 对 `LSP_SERVERS` 做稳定性断言（避免 server id 无意漂移）。

### Phase 4：提取 client lifecycle（中高风险）

建议新增 `src/modules/lsp/client-manager.ts`：

- init/open/update/close/restart/cleanup
- JSON-RPC client lifecycle
- spawn 与 timeout/cleanup 协调

迁移策略：

- 小步迁移（每次只迁一类生命周期方法）。
- `LSPManager` 外部方法签名不变，`core.ts` 继续作为 facade。

测试护栏（新增）：

- `tests/lsp/client-lifecycle.test.ts` + `tests/lsp/client-manager.test.ts`（mock child process / rpc）
  - init 失败回收
  - restart(all/single)
  - cleanup 幂等性
  - timeout/error surface 稳定

### Phase 5：提取 diagnostics / actions / edits

建议新增：

- `src/modules/lsp/diagnostics.ts`
  - document/workspace diagnostics 聚合
- `src/modules/lsp/actions.ts`
  - definition/references/hover/signature/symbols
- `src/modules/lsp/edits.ts`
  - rename/codeAction 请求封装

要求：

- 不改 subagent readonly allowlist 语义。
- 不改 privileged action 默认阻止策略。

测试护栏（新增）：

- `tests/lsp/diagnostics.test.ts`
  - diagnostics severity/filter/format 联动
  - `workspace-diagnostics` 输入上限（64）
- `tests/lsp/tool.test.ts`（包含 privileged actions 断言）
  - `allowMutatingActions=false` 默认拒绝
  - subagent 永久拒绝 `rename`/`codeAction`/`restart`
- 保持 `tests/lsp/tool.test.ts` 的端到端行为覆盖。

## 建议执行节奏

- **W1**：Phase 0 + Phase 1 + Phase 2（低风险优先，先收敛结构与资源边界）
- **W2**：Phase 3 + Phase 4 + Phase 5（中高风险，严格小步提交）

每个 phase 最低验证：

```bash
pnpm typecheck
pnpm lint
pnpm test
```

涉及导出边界或文档同步时追加：

```bash
pnpm docs:check
```

## 非目标

- 不改变 LSP public tool schema。
- 不新增配置项。
- 不改变 language server 选择策略。
- 不改变 subagent LSP readonly allowlist 语义。
- 不改变 diagnostics hook 触发模式。
- 不新增 LSP 错误码，除非同步更新 public docs/tests。

## 验收标准

每一步拆分后都应通过：

```bash
pnpm typecheck
pnpm lint
pnpm test
```

涉及文档边界或 public exports 变化时，还需通过：

```bash
pnpm docs:check
```

至少覆盖：

- `tests/lsp/tool.test.ts`
- `tests/subagents/readonly-tools.test.ts`（如影响 subagent LSP tool policy）
- diagnostics hook 相关测试（如移动 hook 依赖）

## 当前状态

截至当前迭代，拆分进度如下：

- ✅ Phase 0 已完成：facade export contract 护栏已落地（`tests/lsp/tool.test.ts`）。
- ✅ Phase 1 已完成：`formatters.ts` 已提取，`core.ts` 通过 facade re-export 保持稳定边界。
- ✅ Phase 2 已完成：`source-files.ts` 已提取（文件大小限制读取、symbol position 解析/精炼、`uriToPath`）。
- ✅ Phase 3 已完成：`server-registry.ts` 已提取（`LANGUAGE_IDS`、root detection helpers、`createLspServers` / `LSP_SERVERS` 迁移）。
- ✅ Phase 3 护栏已补齐：`tests/lsp/server-registry.test.ts`（language id + server id inventory 稳定性断言）。
- ✅ Phase 4 / Slice 4.1 已完成：`client-lifecycle.ts` 提取类型与纯状态 helper（`OpenFile`、`LSPClient`、`FileDiagnosticItem`、`FileDiagnosticsResult`、spawn generation helpers）。
- ✅ Phase 4 / Slice 4.2 已完成：`client-manager.ts` 提取 init/spawn 成功路径（`initializeSpawnedClient`）。
- ✅ Phase 4 / Slice 4.3 已完成：提取 init 失败路径与 stop timeout/cleanup（`initClientWithSpawn`、`stopLspClient`），`core.ts` 保留状态回调编排。
- ✅ Phase 4 / Slice 4.4 已完成：`restart/shutdown` 状态编排提取到 `client-lifecycle.ts` 纯 helper，`core.ts` 仅保留流程调用。
- ✅ Phase 4 cleanup 护栏已补齐：`tests/lsp/client-manager.test.ts` 新增“initialize 失败后清理已 spawn 进程”测试，覆盖 kill 与流资源清理。
- ✅ Phase 5 / Diagnostics 已完成：`diagnostics.ts` 已提取 diagnostics 聚合编排（push/pull fallback、去陈旧缓存、批量与单文件复用）。
- ✅ Phase 5 / Readonly actions 已完成：`actions.ts` 已提取 definition/references/hover/signature/documentSymbols 请求编排。
- ✅ Phase 5 / Mutating actions 已完成：`edits.ts` 已提取 rename/codeAction 请求编排（含 C/C++ quick fix fallback 与去重逻辑）。
- ✅ Phase 5 护栏已补齐：`tests/lsp/diagnostics.test.ts`、`tests/lsp/edits.test.ts` 新增模块级行为测试。
- ✅ Orchestrator 接线 Slice A 已完成：新增 `request-orchestrator.ts`（`prepareFileContext` / `syncFileToClients` 薄封装接口）并补 `tests/lsp/request-orchestrator.test.ts`。
- ✅ Orchestrator 接线 Slice B 已完成：diagnostics 路径改为经 `requestOrchestrator` 调用（保持 `loadFile/openOrUpdate` 具体实现在 `core.ts`）。
- ✅ Orchestrator 接线 Slice C 已完成：readonly actions（definition/references/hover/signature/documentSymbols）调用入口改为经 `requestOrchestrator`。
- ✅ Orchestrator 接线 Slice D 已完成：mutating actions（rename/codeAction）调用入口改为经 `requestOrchestrator`。

当前状态：**Phase 5 主体拆分与 orchestrator 调用替换已完成；实现下沉已形成 NO-GO 决策并归档到 ADR-0007。**

### loadFile/openOrUpdate 实现下沉结论（go/no-go）

- **结论：当前阶段 `NO-GO`（暂不下沉实现）**
- 决策记录：`internal-docs/adr/0007-lsp-load-sync-no-go.md`

原因：

1. `loadFile/openOrUpdate` 仍承载时序敏感行为（didOpen/didChange/didSave 顺序、openFiles version/LRU 驱逐、server-specific 触发时机）。
2. 现阶段已完成“调用面统一”，结构收益已基本兑现；继续下沉实现的边际收益小于回归风险。
3. 现有测试虽覆盖主路径，但对跨语言服务器时序差异（尤其 Kotlin/Swift/C++）的行为锁定仍偏集成黑盒，贸然下沉易引入隐性回归。

建议：

- 短期保持实现在 `core.ts`，仅通过 `request-orchestrator` 访问。
- 若后续需要下沉，实现前先补“open/update 时序契约”白盒测试，再按最小切片迁移。

### 后续 follow-up

1. **Cancellable pending spawn / immediate shutdown cleanup**
   - 当前 `getClientsForFile()` 已能在 stale spawn 成功返回 client 后执行 `stopLspClient()`，避免 late client 被静默丢弃。
   - 但 `spawning` 仍只保存 `Promise<LSPClient | undefined>`，没有保存可立即停止的 spawn/init handle；如果 shutdown/restart 发生在 child process 已 spawn 但 initialize 尚未完成期间，清理可能延迟到 init 成功、失败或 timeout。
   - 后续若要强化，应设计 cancellable pending spawn 结构，并增加“shutdown/restart 不等待 INIT_TIMEOUT_MS 即能清理已 spawn 进程”的测试。

2. **Diagnostics prepare/load boundary full unification**
   - 当前 diagnostics 已通过 `requestOrchestrator.syncFileToClients()` 收口 file sync，但单文件 / workspace diagnostics 的 prepare/load 状态处理仍保留在 `core.ts`，以维持 file-not-found、read-error、unsupported、timeout 等细粒度结果语义。
   - 后续若要让 diagnostics 也完全通过 `prepareFileContext()`，需要先把 prepare 结果扩展为 typed/discriminated result，避免把不同失败原因都折叠成 `null`。

## Phase 4 前风险分解（client lifecycle）

### 风险清单（按优先级）

1. **生命周期状态漂移风险（P1）**
   - 现象：`clients/spawning/broken/cleanupTimer` 等状态拆分后可能不一致。
   - 影响：重复启动、僵尸 client、错误复用 broken 状态。
   - 缓解：先抽“只读状态访问”与“状态写入入口”到单点；迁移时禁止跨模块直接改 Map/Set。

2. **并发与竞态风险（P1）**
   - 现象：同文件并发请求触发多次 spawn；restart 与 in-flight 请求冲突。
   - 影响：偶发失败、连接关闭后仍写入、不可复现 flake。
   - 缓解：保留并强化 `spawning` 去重语义；在 client-manager 内集中处理“in-flight + shutdown/restart”仲裁。

3. **资源清理回退风险（P1）**
   - 现象：拆分后 didClose/进程退出/interval cleanup 顺序变化。
   - 影响：文件句柄或子进程泄漏、长会话内存增长。
   - 缓解：把 cleanup 路径统一成幂等函数（可重复调用）；为 `shutdown()`/`restart()` 加幂等测试。

4. **错误面变化风险（P1）**
   - 现象：错误抛出点迁移导致 message/cause 不一致。
   - 影响：tool 层错误体验变化，回归难定位。
   - 缓解：保持现有错误文本基调；新增“错误 surface 稳定性”测试（timeout/spawn fail/init fail）。

5. **行为时序变化风险（P2）**
   - 现象：initialize/didOpen/didChange/didSave 调度顺序细微变化。
   - 影响：部分 server（尤其 Kotlin/Swift）诊断时机变化。
   - 缓解：先迁“无副作用方法”，后迁时序敏感路径；每步跑现有 lsp 集成测试。

6. **边界侵入风险（P2）**
   - 现象：`tool.ts`/`hook.ts` 直接引用 `client-manager.ts` 私有实现。
   - 影响：破坏 facade 稳定约束，后续继续拆分困难。
   - 缓解：强制只经 `core.ts` 出口访问；review checklist 增加 import 边界检查。

### Phase 4 建议切片（最小可回滚）

- **Slice 4.1**：先提取类型与纯状态 helper（不改行为）
- **Slice 4.2**：提取 init/spawn 成功路径
- **Slice 4.3**：提取失败路径与 timeout/cleanup
- **Slice 4.4**：提取 restart/shutdown 并补幂等测试

每个 slice 独立提交并执行：

```bash
pnpm typecheck
pnpm lint
pnpm test
```

若触及导出/文档边界，再追加：

```bash
pnpm docs:check
```
