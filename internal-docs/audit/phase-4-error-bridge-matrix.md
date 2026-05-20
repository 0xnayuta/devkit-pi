---
status: current
audience: maintainer
last_verified: 2026-05-20
language: chinese
---

# Phase 4 错误桥接现状矩阵（DevkitErrorPayload）

## 范围

本审计用于记录 Phase 4 当前阶段各模块错误桥接落地状态，覆盖：

- `subagents`
- `web`
- `convert`
- `lsp`
- `commands`
- `guards`

目标是给出统一视图：

1. 是否已接入 `DevkitErrorPayload`。
2. 接入位置（helper / 执行链路 / 日志）。
3. 是否使用 `moduleHint` 提升 fallback 语义。
4. 是否已有测试覆盖。

## 统一基础能力

- 统一结构定义：`src/shared/errors.ts`
  - `DevkitErrorPayload`
  - `createDevkitErrorPayload(input)`
  - `toDevkitErrorPayload(error, { moduleHint? })`
- fallback 策略（当前）：
  - `LspError`：强制映射 `module: "lsp"`（优先级高于 `moduleHint`）。
  - 其他 `Error` / string / unknown：默认 `INTERNAL_ERROR`，module 取 `moduleHint`，未提供时保持历史默认 `"commands"`。

## 现状矩阵

| module | helper bridge | internal execute-path bridge | payload sink | moduleHint used | contract change | test coverage |
|---|---|---|---|---|---|---|
| subagents | `src/modules/subagents/errors.ts` `toDevkitSubagentErrorPayload` | `src/modules/subagents/register.ts`（depth 阻断 + executor 返回后） | `logger.warn("subagents.error_payload")` | N/A（模块专用 helper） | 无（`details.error` 保持原结构） | `tests/subagents/errors.test.ts`, `tests/subagents/register.test.ts` |
| web | `src/modules/web/errors.ts` `toDevkitWebErrorPayload` | `src/modules/web/register.ts`（`web_search` / `fetch_content` / `get_search_content` 结构化错误分支） | `logger.warn("web.error_payload")` | N/A（模块专用 helper） | 无（`WebError` 保持原结构） | `tests/web/search.test.ts`, `tests/web/register.test.ts` |
| convert | `src/modules/convert/errors.ts` `toDevkitConvertErrorPayload` | `src/modules/convert/index.ts`（`convert_content` 结构化错误分支） | `logger.warn("convert.error_payload")` | N/A（模块专用 helper） | 无（`ConvertProviderError` 保持原结构） | `tests/convert/provider.test.ts`, `tests/convert/register.test.ts` |
| lsp | 共享 `toDevkitErrorPayload`（`LspError` 专门映射） | `src/modules/lsp/tool.ts` execute 顶层 catch | `logger.warn/error("lsp.error_payload")` | 是（`moduleHint: "lsp"`，但 `LspError` 仍强制 `lsp`） | 无（原抛错/返回行为保持） | `tests/lsp/tool.test.ts`, `tests/shared/errors.test.ts` |
| commands | 共享 `toDevkitErrorPayload` | `src/modules/commands/register.ts` command handler catch | `logger.error("commands.error_payload")` | 是（`moduleHint: "commands"`） | 无（仍 `ui.notify` 原错误语义） | `tests/commands/register.test.ts`, `tests/shared/errors.test.ts` |
| guards | 共享 `toDevkitErrorPayload` | `src/modules/guards/index.ts`（`tool_call` / `agent_end` / `tool_result` catch） | `logger.warn("guards.error_payload")` | 是（`moduleHint: "guards"`） | 无（soft notice 流程不变） | `tests/guards/git-context.test.ts`, `tests/shared/errors.test.ts` |

## 关键结论

1. **无破坏迁移已成立**
   - 现阶段所有桥接均为 helper 或内部日志接入。
   - 公共工具参数、结果结构和错误主语义未发生破坏性变更。

2. **module 语义精度已提升**
   - `commands/guards/lsp` 非特化错误场景已通过 `moduleHint` 精准标注模块归属。
   - 保持 `LspError -> lsp` 的强优先级，避免被 hint 覆盖。

3. **六模块执行链路已闭环**
   - 专用 helper：`subagents/web/convert`
   - 通用 fallback：`lsp/commands/guards`
   - 六个模块均已在执行链路内部接入统一命名 `*.error_payload` 事件

## 错误码 -> payload 字段 -> remediation 来源（最终对照）

> 说明：本对照用于 Phase 4 收尾审计，聚焦“错误码如何进入 `DevkitErrorPayload`，以及 remediation 的来源路径”。

| module | representative error code | payload fields（核心） | remediation 来源 |
|---|---|---|---|
| subagents | `SUBAGENT_TIMEOUT` / `SUBAGENT_EXECUTION_FAILED` | `code`, `message`, `module: "subagents"`, `retryable`, `provider?`, `causeSummary?`, `remediation?` | `toDevkitSubagentErrorPayload` 内部映射（含超时/执行失败语义） |
| web | `WEB_SEARCH_TIMEOUT` / `PROVIDER_RATE_LIMITED` / `CONTENT_FETCH_INVALID_URL` | `code`, `message`, `module: "web"`, `provider?`, `retryable`, `remediation?`, `causeSummary?` | `ERROR_RECOVERY_MAP[code].description` -> `toDevkitWebErrorPayload(...).remediation` |
| convert | `INVALID_INPUT` / `CONVERT_TIMEOUT` / `CONVERT_FAILED` | `code`, `message`, `module: "convert"`, `provider?`, `retryable`, `remediation?`, `causeSummary?` | `toDevkitConvertErrorPayload` 的错误分类映射（provider/timeout/command failure 分支） |
| lsp | `LSP_*` 系列与非 `LspError` 异常 | `code`, `message`, `module: "lsp"`, `retryable`, `remediation?`, `causeSummary?` | `toDevkitErrorPayload`（`LspError` 专门映射 + 通用 fallback） |
| commands | `INTERNAL_ERROR`（handler 异常 fallback） | `code`, `message`, `module: "commands"`, `retryable`, `causeSummary?`, `remediation?` | `toDevkitErrorPayload(..., { moduleHint: "commands" })` |
| guards | `INTERNAL_ERROR`（notice 路径异常 fallback） | `code`, `message`, `module: "guards"`, `retryable`, `causeSummary?`, `remediation?` | `toDevkitErrorPayload(..., { moduleHint: "guards" })` |

## 风险与待办

### 风险

1. 当前 `web/convert` 执行链路日志基于结构化错误分支记录 payload；后续若新增异常抛出路径，需保持同名事件覆盖。
2. 统一命名已完成，但跨模块 payload 字段完整度（如 `provider`/`remediation`）仍建议持续收敛。

### 统一日志检索建议

1. 采用统一事件后缀聚合检索：`*.error_payload`（例如按 `event` 字段后缀过滤）。
2. 推荐的模块级聚合键：`subagents.error_payload`、`web.error_payload`、`convert.error_payload`、`lsp.error_payload`、`commands.error_payload`、`guards.error_payload`。
3. 在故障排查时先按 `event in [..]` 聚合，再按 `metadata.payload.module/code/retryable` 分桶，快速定位高频错误码与可重试失败。
