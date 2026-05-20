---
status: current
audience: maintainer
last_verified: 2026-05-20
language: chinese
---

# Phase 3 状态清单审计（memory / session entry / details）

## 范围与目标

本审计用于启动 `pi-native-extension-alignment-plan.md` 的 Phase 3。
当前仅做状态盘点与分类，不修改公共契约与工具参数。

分类口径：

- `memory`：仅进程内存态，`session_shutdown` 或 runtime dispose 后清理。
- `session entry`：通过 `pi.appendEntry(customType, data)` 进入 session tree，可 branch restore。
- `details`：工具结果 `details` 结构中可用于恢复/重放的状态。

## 状态清单（首版）

| stateName | ownerModule | currentStorage | lifecycleBoundary | classification | restoreStrategy | risk | nextAction |
|---|---|---|---|---|---|---|---|
| web.results map (`responseId -> StoredEnvelope`) | `src/modules/web/storage.ts` | `Map` 内存 + `appendEntry(web-tools-results)` | session_start restore / session_shutdown clear | memory + session entry | `restoreResultsFromSession(ctx.sessionManager.getBranch())`，TTL 过滤 | branch 切换/TTL 过期导致 `responseId` 缺失 | 保持三层语义并补审计测试矩阵（memory/session/provider cache） |
| web.search cache (`SearchResultCache`) | `src/modules/web/cache.ts` | 进程内 LRU + TTL | runtime/session 生命周期内有效，未写入 session tree | memory | 不恢复（cold cache） | 与 session restore 语义混淆 | 文档明确“性能缓存非可恢复状态” |
| web observability stats/activity | `src/modules/web/observability.ts` + `src/shared/activity.ts` | 进程内计数器/环形缓冲 | session_start reset / session_shutdown reset | memory | 不恢复 | `/toolkit logs` 跨分支不可回放 | 确认是否需要最小 session entry 摘要（目前建议不迁移） |
| convert stats/activity | `src/modules/convert/observability.ts` + `src/shared/activity.ts` | 进程内计数器 + 活动日志 | 当前随进程；命令读取最近记录 | memory | 不恢复 | 与 web 日志一致性边界不清晰 | 在 Phase 3 文档中统一 activity 生命周期定义 |
| subagent runtime state (`SubagentState`) | `src/shared/types.ts` + `src/modules/subagents/register.ts` | 内存对象（baseCwd/currentSessionId/lastUiContext） | session_start reset / session_shutdown clear | memory | 不恢复 | UI context 悬挂风险（已在 shutdown 清空） | 保持 memory；补充 branch restore 设计说明“由 details 驱动而非 state 对象” |
| subagent activeControllers | `src/modules/subagents/register.ts` | `Set<AbortController>` | session_shutdown + runtime dispose abort | memory | 不恢复 | 子进程残留风险（已加 abort） | 补充测试：branch 切换时无泄漏（若需要） |
| subagent execution result payload | `src/modules/subagents/executor.ts` | tool result `details`（mode/runId/results/error/streaming） | 每次 tool result 持久化到 session tree | details | 通过 Pi 历史 tool result 恢复渲染 | details schema 演进风险 | 为 details 增加稳定字段约束测试（向后兼容 reader） |
| lsp hook touchedFiles/activeClients/activity | `src/modules/lsp/hook.ts` | `Map/Set` 内存 + status UI | agent_start reset, session_shutdown clear + shutdownManager | memory | 不恢复 | 分支切换后状态残留误导 | 维持 memory，避免写 session tree；增加生命周期注释与测试 |
| guards session state | `src/modules/guards/state.ts` + `src/modules/guards/index.ts` | 内存对象（Set + flags） | session_start/session_shutdown reset | memory | 不恢复 | 误将提醒态跨会话传播 | 维持 memory，仅通过事件实时计算 |
| toolkit doctor/report viewer缓存 | `src/modules/commands/report-viewer.ts` 等 | 组件内缓存字段 | 面板实例生命周期 | memory | 不恢复 | 无实质恢复风险 | 无需迁移 |

## 当前结论

1. 现状中只有 `web results` 已形成明确的 `memory + session entry` 双层模型，且具备 branch restore 路径。
2. 其余状态大多是运行时瞬态，归类为 `memory` 合理。
3. `subagent` 的可恢复信息应继续依赖 `details`，不应引入额外本地持久化文件作为主恢复源。
4. Phase 3 改造应优先补齐“状态语义文档 + 测试断言”，再考虑实现调整。

## 已落地项清单（Phase 3 收尾）

1. 测试层（state model）
   - `tests/web/state-model-phase3.test.ts` 已落地：
     - `web.responseId` memory 清理语义（session shutdown 后不可读取）
     - session entry 恢复语义（仅恢复有效 branch 条目，TTL 过期不恢复）
     - provider cache 与 session restore 语义解耦
   - `tests/subagents/state-model-phase3.test.ts` 已落地：
     - `details` 最小稳定恢复字段（`mode/results/error`）
     - `details.error` 稳定 `code/message` 语义
     - legacy 可选字段缺失下渲染降级可读
     - `streaming` 执行期语义与 final 可缺省边界
2. 命令诊断层（/toolkit doctor）
   - `state-model` 分类已加入，明确输出：
     - `web.responseId` 的 memory + session-entry（含 TTL）
     - `subagent.details` 的 details-driven 恢复
3. 命令概览层（/toolkit modules）
   - 已加入 `state model snapshot` 区块，输出与 doctor 保持同口径。
4. 维护文档层
   - `internal-docs/maintain/architecture.md` 已加入同口径状态语义快照。

结论：当前已形成“测试断言 + doctor 诊断 + modules 概览 + maintain 文档”四处一致的状态语义闭环。

## Phase 3 下一步实施切片（建议）

1. 为 `lsp/guards/activity` 补充“非恢复态”显式测试（若需要进一步收敛行为边界）。
2. 评估是否需要将 state-model 语义摘录同步到 public reference（仅在用户可见行为有变化时）。
3. 无新增行为诉求时，可结束 Phase 3 并进入 Phase 4（统一错误模型与 remediation）。
