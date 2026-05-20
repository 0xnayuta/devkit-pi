---
status: current
audience: maintainer
last_verified: 2026-05-20
language: chinese
---

# Phase 3 第二切片：状态模型测试计划与用例骨架

## 目标

在不改动行为契约前，先建立 Phase 3 的测试骨架，覆盖三类状态语义：

- memory
- session entry
- details

## 测试分层

### A. web responseId 三层语义（优先）

文件：`tests/web/state-model-phase3.test.ts`

计划用例：

1. memory 层
   - `session_shutdown` 后内存结果不可读取。
   - `clearResults()` 不影响 provider cache（若存在）语义判断。
2. session entry 层
   - `appendEntry -> restoreResultsFromSession` 可恢复 `responseId`。
   - branch 数据切换时仅恢复当前 branch 条目。
   - TTL 过期条目不会恢复。
3. provider cache 层（可选 cache）
   - 搜索性能缓存命中不等于 session 可恢复。
   - session restore 不应隐式重建 provider cache 命中统计。

### B. subagent details 稳定恢复语义

文件：`tests/subagents/state-model-phase3.test.ts`

计划用例：

1. details 最小稳定字段
   - `mode/results` 必须存在。
   - `results[i]` 关键字段（agent/exitCode/output/usage）可用。
2. details 错误语义
   - `details.error.code/message` 稳定可读。
3. details 向后兼容读取
   - 历史记录缺失新字段时 reader 可降级处理，不崩溃。
4. streaming 字段边界
   - `streaming` 仅在执行中出现，最终结果可缺省。

### C. 非恢复态显式化（后续）

候选文件：`tests/shared/state-model-phase3.test.ts`（后续再建）

计划用例：

- guards/lsp/activity 属于 memory 态，不进入 session restore。
- 分支切换不会重建这些状态。

## 验收标准

- 新增测试文件先以 TODO/骨架形式落地并纳入测试集。
- 不改变现有行为，不新增公共配置项。
- `pnpm typecheck && pnpm lint && pnpm test` 全通过。

## 后续最小改造入口

当骨架测试完成后，优先从 web session restore 语义的断言强化开始（不改接口，仅收敛边界行为）。
