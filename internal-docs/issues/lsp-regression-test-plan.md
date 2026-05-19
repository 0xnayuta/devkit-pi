---
status: implemented
audience: maintainer
last_verified: 2026-05-19
language: chinese
---

# 1. 背景与目标

在 `lsp/core.ts` 拆分后，当前 `tests/lsp/*` 已覆盖：

- 基础导出/注册契约（`tool.test.ts`）
- 部分并发防抖与 spawn 竞态（`tool.test.ts`）
- client lifecycle 纯函数（`client-lifecycle.test.ts`）
- init 失败清理（`client-manager.test.ts`）
- diagnostics push/pull 基础分支（`diagnostics.test.ts`）
- orchestrator 参数转发（`request-orchestrator.test.ts`）

在计划启动时，manager/orchestrator 时序回归网仍有明显缺口，集中在：

1. 生命周期竞态（restart/shutdown 与 in-flight 请求交错）
2. 时序/超时（初始化超时、诊断等待超时、取消/中断传播）
3. 故障恢复（部分 server 失败、进程异常关闭、失败后恢复路径）

当前该计划已完成落地，本文保留“缺口→方案→结果”的完整轨迹，用于后续回归审计。

---

# 2. 现有测试盘点与缺口映射（避免重复）

## 2.1 已有关键覆盖（摘要）

- `tests/lsp/tool.test.ts`
  - 已有：同 root 并发 spawn 去重
  - 已有：shutdown/restart 发生在 in-flight spawn 期间，不回写 client
  - 已有：spawn 失败后 broken 状态 + restart 后重试
  - 已有：workspace 边界、输入上限、权限 gating
- `tests/lsp/client-manager.test.ts`
  - 已有：initialize 抛错时清理子进程
- `tests/lsp/diagnostics.test.ts`
  - 已有：push 诊断分支 / pull 兜底分支
- `tests/lsp/request-orchestrator.test.ts`
  - 已有：`prepareFileContext` 与 `syncFileToClients` 的参数透传

## 2.2 明确缺口（计划启动时）

### A. 生命周期竞态

- 缺：`restartServers()` 与 `getDiagnosticsForFiles()` 并发交错回归
- 缺：`shutdown()` 触发后已有 client 的正在进行请求如何收敛
- 缺：多 root / 多 server 并发下，局部重启是否误伤无关 client

### B. 时序/超时

- 缺：`initClientWithSpawn` 初始化超时路径（不是抛错，而是 timeout）
- 缺：diagnostics 等待窗口超时后的稳定返回形态
- 缺：workspace-diagnostics 中逐文件 timeout 对整体结果聚合影响

### C. 故障恢复

- 缺：部分 server 初始化失败时，其他 server 仍可工作（partial availability）
- 缺：client 进程/连接中途关闭后的后续请求恢复行为
- 缺：restart 后 broken/spawning 状态是否彻底清理（跨多 key）

## 2.3 非目标/排除项（明确不做）

为避免执行阶段偏离，本轮不覆盖：

1. 已有注册/导出契约细节（`tool.test.ts` 已覆盖）
2. 文件读取上限/输入上限细节（`source-files.test.ts` 已覆盖）
3. 子代理权限组合矩阵（`tool.test.ts` 已覆盖）
4. 真实语言服务器集成与语法解析能力

---

# 3. 用例命名规范（统一可追踪）

为便于定位和回归追踪，新增用例必须满足：

- `it()` 内文案必须包含用例 ID 前缀：`LSP-RACE-XXX` / `LSP-TIME-XXX` / `LSP-REC-XXX`
- ID 与本文件缺口清单一一对应
- 失败日志可通过 ID 快速反查本计划章节

示例：

```ts
it("LSP-RACE-002 shutdown 与 getDiagnosticsForFiles 并发时不挂起", async () => {
  // ...
});
```

---

# 4. 执行方案与落地映射（按优先级）

> 约定：
> - P0 = 本周必须补；P1 = 紧随其后。
> - 新增测试以白盒单测为主，mock `LSP_SERVERS` / `initClient` / connection 行为；避免引入真实语言服务器依赖。

## 4.1 生命周期竞态（P0）

### LSP-RACE-001（P0）
- 目标：`restartServers([id])` 与 `getClientsForFile()` 并发时，不产生“重启后旧 client 回写”。
- 放置：`tests/lsp/tool.test.ts`（同类竞态已在此文件）
- 与现有区别：现有覆盖“in-flight spawn + restart”，本用例补“**restart 与并发 getClients 的交错顺序矩阵**”（restart 先发、后发、同 tick）。
- 断言：
  - clients map 不保留旧 generation client
  - spawning map/broken set 状态与 generation 一致
- 量化指标：
  - 并发交错序列覆盖 ≥ 3（restart-before / restart-after / same-tick）
  - 连续运行 3 次均通过
- 回退策略：
  - 若 manager 层不稳定，降级为 lifecycle 纯函数组合断言（`clearSpawningForMatches/selectRestartTargets`）

### LSP-RACE-002（P0）
- 目标：`shutdown()` 与 `getDiagnosticsForFiles()` 并发时，结果稳定且不抛未处理异常。
- 放置：`tests/lsp/manager-lifecycle.test.ts`（新增；避免 `tool.test.ts` 过重）
- 与现有区别：现有未覆盖 diagnostics 批量流程中的 shutdown 竞态。
- 断言：
  - Promise 全部 settle
  - shutdown 后 clients/spawning 清空
  - 返回项 status 为可解释失败（unsupported/error），无挂起
- 量化指标：
  - 总运行时间 ≤ 3s（测试内 mock）
  - settle 时间抖动 ≤ 200ms（连续 5 次）
- 回退策略：
  - 若 manager 批量流程不稳定，改为单文件 diagnostics 与 shutdown 竞争最小断言

### LSP-RACE-003（P0）
- 目标：多 server 并发时重启单个 server id，不影响其他 server client。
- 放置：`tests/lsp/tool.test.ts`
- 与现有区别：现有 `restartServers(["typescript"])` 场景是单 server。
- 断言：
  - 目标 server 被重建
  - 非目标 server 的 client 实例引用保持不变
- 量化指标：
  - 并发请求数 ≥ 2，且非目标 server key 保持 1 个 client 实例不变
- 回退策略：
  - 若多 server 并发不稳定，改为“顺序重建 + 实例引用不变”最小验证

## 4.2 时序/超时回归（P0/P1，已落地）

### LSP-TIME-001（P0）
- 目标：`initClientWithSpawn` 命中 `initTimeoutMs` 时执行清理并回调 `onInitFailed`。
- 放置：`tests/lsp/client-manager.test.ts`
- 与现有区别：已有“initialize 抛错”，缺“initialize 不返回导致超时”。
- 断言：
  - 返回 `undefined`
  - spawned process 被 kill + stdio destroy
  - `onInitFailed` 调用次数正确
- 量化指标：
  - 超时路径耗时应近似 `initTimeoutMs`（允许 ±10%）
- 回退策略：
  - 若 timeout 难以精确断言，改用“行为结果唯一性”（返回 undefined + kill + callback）验证

### LSP-TIME-002（P0）
- 目标：`runDiagnosticsCycle` 在 `waitForDiagnostics` 超时/false + pull 也未响应时，返回稳定空结果。
- 放置：`tests/lsp/diagnostics.test.ts`
- 与现有区别：已有 push 与 pull-success；缺“双未命中”分支。
- 断言：
  - `responded=false`
  - `diagnostics=[]`
  - 不污染 `client.diagnostics`
- 量化指标：
  - 单用例耗时 ≤ 500ms
- 回退策略：
  - 若 pull 层耦合不稳定，改为仅验证 `responded=false` 与副作用清零

### LSP-TIME-003（P1）
- 目标：`getDiagnosticsForFiles(files, timeoutMs)` 在多个文件中，单个慢文件超时不拖垮整体。
- 放置：新增 `tests/lsp/manager-diagnostics-timeout.test.ts`
- 断言：
  - 快文件正常返回
  - 慢文件标记 timeout/error
  - 总体在合理上限内完成
- 量化指标：
  - 快文件先于慢文件返回
  - 整体完成时间 ≤ `max(快文件时长, 慢文件超时) + 500ms`
- 回退策略：
  - 若调度不稳定，改为顺序执行 + 慢文件单独超时断言

## 4.3 故障恢复（P0/P1，已落地）

### LSP-REC-001（P0）
- 目标：多 server 里一个初始化失败，另一个可继续响应 action（definition/hover 等任一）。
- 放置：`tests/lsp/tool.test.ts`
- 与现有区别：已有单 server 失败重试，缺“partial failure 可用性”。
- 断言：
  - 失败 server 进入 broken
  - 成功 server 请求可返回结果
- 量化指标：
  - 成功 action 延迟 ≤ 2s（mock）
- 回退策略：
  - 若 manager action 路径不稳定，改为仅验证“失败 server broken + 成功 server client 存在”

### LSP-REC-002（P0）
- 目标：client 连接被动关闭后，下一次请求触发重建而非复用坏 client。
- 放置：新增 `tests/lsp/manager-recovery.test.ts`
- 断言：
  - 关闭后旧 client 不再被选用
  - 后续请求触发新 init（调用计数+1）
- 量化指标：
  - 重建触发次数可控（=1）
- 回退策略：
  - 若 manager 路径不稳定，降级到 `client-manager` 的“init 被重新调用”最小断言

### LSP-REC-003（P1）
- 目标：`restartServers(["all"|subset])` 后，broken/spawning 残留状态完全清理。
- 放置：`tests/lsp/client-lifecycle.test.ts`（纯状态）+ `tests/lsp/tool.test.ts`（集成）
- 断言：
  - 对应 key 的 broken/spawning/generation 变化与预期一致
  - 非匹配 key 不被误清理
- 量化指标：
  - 关键 key 清理正确性 = 100%（断言集合覆盖）
- 回退策略：
  - 若集成层不稳定，保留 lifecycle 纯函数测试作为“保底门禁”

---

# 5. 文件归属策略（职责清晰）

- 已有 manager 竞态：优先保留在 `tests/lsp/tool.test.ts`
- 新增 manager/timeout/recovery 独立场景：优先新增：
  - `tests/lsp/manager-lifecycle.test.ts`
  - `tests/lsp/manager-recovery.test.ts`
  - `tests/lsp/manager-diagnostics-timeout.test.ts`
- 纯状态逻辑：继续在 `tests/lsp/client-lifecycle.test.ts`

目标：避免 `tool.test.ts` 变成“万能桶”，同时保持新增测试可检索。

---

# 6. 实施顺序（两批执行，已完成）

## 批次 A（已完成）

1. `client-manager.test.ts`：LSP-TIME-001
2. `diagnostics.test.ts`：LSP-TIME-002
3. 新增 `manager-lifecycle.test.ts`：LSP-RACE-002
4. `tool.test.ts`：LSP-RACE-001 / LSP-RACE-003
5. `tool.test.ts`：LSP-REC-001

## 批次 B（已完成）

1. 新增 `manager-recovery.test.ts`：LSP-REC-002
2. 新增 `manager-diagnostics-timeout.test.ts`：LSP-TIME-003
3. `tool.test.ts`：LSP-REC-003

## 批次 C（补充分支语义，已完成）

1. `client-manager.test.ts`：`stopLspClient` 分支语义（already closed / shutdown throws）
2. 新增 `manager-diagnostics-pull.test.ts`：pull diagnostics 协议 fallback（full / unchanged / workspace fallback / double-fail）
3. `tool.test.ts`：`restartServers` no-op 语义（`undefined` / `[]` / `['missing-server']`）
4. `manager-diagnostics-timeout.test.ts`：`getDiagnosticsForFiles` cleanup 语义（仅关闭新打开文件）

---

# 7. 设计约束（保证稳定且不冗余）

1. 仅 mock 内部依赖，不引入真实 LSP 二进制。
2. 避免重复“已覆盖断言”：
   - 不再重复测试注册/导出契约。
   - 不再重复单 server in-flight spawn + restart 的已有分支。
3. 所有新增用例必须对应唯一缺口 ID（LSP-RACE/TIME/REC-*）。
4. 每个时序用例显式控制调度点（`Promise` 门闩 + `setTimeout(0)`/microtask），降低 flaky 风险。

---

# 8. 验收标准（量化）

- `tests/lsp/*` 新增用例稳定通过。
- `pnpm test` 通过（406 passed / 0 failed）。
- `pnpm test:coverage` 通过，覆盖工件已更新（`.coverage/hotspots.md`、`.coverage/summary.json`）。
- 覆盖报告中 `lsp` 模块维持 **100% line coverage（14 files）**。
- 无新增 skipped 测试。

---

# 9. 变更清单（实际完成）

- 新增/修改测试文件：
  - [x] tests/lsp/tool.test.ts
  - [x] tests/lsp/client-manager.test.ts
  - [x] tests/lsp/diagnostics.test.ts
  - [x] tests/lsp/manager-lifecycle.test.ts
  - [x] tests/lsp/manager-recovery.test.ts
  - [x] tests/lsp/manager-diagnostics-timeout.test.ts
  - [x] tests/lsp/manager-diagnostics-pull.test.ts
- 覆盖缺口 ID：
  - [x] LSP-RACE-001
  - [x] LSP-RACE-002
  - [x] LSP-RACE-003
  - [x] LSP-TIME-001
  - [x] LSP-TIME-002
  - [x] LSP-TIME-003
  - [x] LSP-REC-001
  - [x] LSP-REC-002
  - [x] LSP-REC-003

---

# 10. 风险与用例级回退（不是通用建议）

- **风险 1：竞态测试易 flaky**
  - 约束：所有竞态用例需提供 ≥ 2 个可控序列分支（先后/同 tick）。
  - 回退：先做 manager 层最小断言（关键 map 清理 + 引用不变），再扩展复杂交错。

- **风险 2：timeout 断言不稳定**
  - 约束：不依赖墙上时间，采用行为结果（返回值/清理状态/回调计数）。
  - 回退：把“耗时近似”降级为“是否执行清理路径”判定。

- **风险 3：新增文件过多**
  - 约束：同主题优先收敛到一个新文件（如 manager-lifecycle）。
  - 回退：若后期规模膨胀，再拆分为 recovery / diagnostics-timeout 两个文件。

---

# 11. 执行结果回填（2026-05-19）

## 11.1 落地结果

已完成批次 A/B 与补充分支语义小批次，实际新增/更新如下：

- 新增：
  - `tests/lsp/manager-lifecycle.test.ts`（LSP-RACE-002）
  - `tests/lsp/manager-recovery.test.ts`（LSP-REC-002）
  - `tests/lsp/manager-diagnostics-timeout.test.ts`（LSP-TIME-003 + cleanup 语义）
  - `tests/lsp/manager-diagnostics-pull.test.ts`（pull diagnostics 协议分支）
- 更新：
  - `tests/lsp/client-manager.test.ts`（LSP-TIME-001 + stopLspClient 分支语义）
  - `tests/lsp/diagnostics.test.ts`（LSP-TIME-002）
  - `tests/lsp/tool.test.ts`（LSP-RACE-001/003、LSP-REC-001/003、restartServers no-op）

## 11.2 回归与覆盖率

- 回归：`pnpm test` 通过（406 passed / 0 failed）
- 覆盖率：`pnpm test:coverage` 通过
- 覆盖工件：
  - `.coverage/summary.json`
  - `.coverage/hotspots.md`

关键结果（V8 coverage 报告）：

- `lsp` 模块：**100% line coverage（14 files）**
- 全局：line 98.95%，function 98.89%

说明：本轮新增“分支语义”测试未引入覆盖率回退，LSP 热点覆盖保持满覆盖。

## 11.3 与计划偏差说明

- `LSP-TIME-003` 当前语义更偏向“批处理 timeout 稳定返回且不挂起”；
  与最初“慢文件不阻塞快文件结果”的文案存在轻微偏差。后续若要严格验证“快文件先返回”，可追加更细粒度时序断言用例。

## 11.4 结论

本计划定义的优先缺口（生命周期竞态、时序/超时、故障恢复）已完成可持续回归化覆盖，建议进入“维护态”：仅在 LSP manager/orchestrator 发生行为变更时增补对应 ID 用例。
