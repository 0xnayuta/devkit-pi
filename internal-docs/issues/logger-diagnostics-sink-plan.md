---
status: proposed
audience: maintainer
last_verified: 2026-05-19
language: chinese
---

# OBS-001 统一 logger / diagnostics sink 修复计划

## 1. 背景与目标

`internal-docs/audit/code-quality-audit-2026-05-13.md` 在第十七章新增 `OBS-001`：

> 缺少统一 logger/diagnostics sink（仍有分散 `console.*` fallback）

当前项目的安全、资源、LSP 回归和 coverage 可见性高优先级事项已基本闭环；OBS-001 属于 P3 维护性与可观测性收敛问题，适合在当前维护窗口推进。

本计划目标不是引入复杂日志平台，而是提供一个轻量、可测试、可逐步迁移的统一出口：

1. 为模块内部状态、警告、错误提供一致的 logger interface。
2. 将裸 `console.*` fallback 收敛到少量受控位置。
3. 保持 pi extension 运行环境安全默认：不泄露 secret、不强依赖 UI、不引入重依赖。
4. 与现有 diagnostics、activity、toolkit 输出边界兼容。
5. 以小批次替换方式降低风险，避免一次性重写全部模块。

---

## 2. 现状盘点与问题边界

## 2.1 已知分散出口

计划启动时重点关注以下位置：

- `src/index.ts`
  - 配置加载失败或扩展注册 fallback 可能直接输出到 console。
- `src/modules/subagents/register.ts`
  - 子代理注册/命令路径中存在面向宿主的 fallback 输出。
- `src/modules/web/observability.ts`
  - web debug logging 已有能力，但与 extension-level logger 未统一。
- `src/modules/commands/*`
  - TUI/report fallback 与 stdout/console 边界需要明确。

这些路径当前不是高危缺陷，但会带来：

- 跨模块排障格式不一致；
- 测试中难以统一断言日志行为；
- 后续新增模块容易继续复制裸 `console.*`；
- JSON protocol / degraded UI 场景下输出边界更难审计。

## 2.2 非目标 / 排除项

本轮不做：

1. 不引入 pino/winston 等第三方 logging framework。
2. 不实现远程日志、文件日志轮转或 telemetry。
3. 不改变用户可见 tool result schema。
4. 不把所有 activity log、tool renderer、TUI report 都合并成同一个概念。
5. 不在子代理 child 进程中增加新的主动输出行为。
6. 不把 debug 日志默认打开。

---

## 3. 设计原则

1. **轻量核心**：新增代码应尽量位于 `src/shared/`，无新运行时依赖。
2. **安全默认**：默认静默或只走宿主 diagnostics；不得默认打印敏感 metadata。
3. **结构化优先**：logger 接口接收 `module`、`event`、`level`、`message`、`metadata`。
4. **可替换 sink**：高层依赖接口，不直接依赖 `console`。
5. **渐进迁移**：先覆盖 OBS-001 指定散点，再迁移新发现位置。
6. **不破坏现有 UX**：命令输出、report viewer、activity panel 仍按原职责展示用户内容。
7. **可测试**：提供 memory/test sink，避免测试污染 stdout/stderr。

---

## 4. 目标架构

建议新增：

```text
src/shared/logger.ts
```

核心概念：

```ts
export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogEvent {
  level: LogLevel;
  module: string;
  event: string;
  message: string;
  metadata?: Record<string, unknown>;
  error?: unknown;
}

export interface LoggerSink {
  log(event: LogEvent): void;
}

export interface Logger {
  debug(event: string, message: string, metadata?: Record<string, unknown>): void;
  info(event: string, message: string, metadata?: Record<string, unknown>): void;
  warn(event: string, message: string, metadata?: Record<string, unknown>): void;
  error(event: string, message: string, metadata?: Record<string, unknown>, error?: unknown): void;
  child(module: string): Logger;
}
```

预期内置 sink：

1. `noopLogger` / `NoopLoggerSink`
   - 默认安全兜底。
2. `consoleLoggerSink`
   - 仅作为受控 fallback；需要统一格式化与 secret redaction。
3. `memoryLoggerSink`
   - 测试专用，便于断言事件。
4. 可选：`diagnosticsLoggerSink`
   - 如宿主 pi 提供 diagnostics/report 能力，可桥接；否则退化为 noop 或 console fallback。

---

## 5. 安全与输出规则

## 5.1 metadata 规则

logger 应对 metadata 做安全归一化：

- 限制 key 数量与嵌套深度；
- 限制字符串长度；
- 对疑似敏感 key 进行 redaction：
  - `token`
  - `apiKey`
  - `api_key`
  - `authorization`
  - `password`
  - `secret`
  - `cookie`
- error 只输出安全摘要：
  - `name`
  - `message` 截断后文本
  - 可选 `code`
  - 不默认输出 stack。

## 5.2 输出边界

- tool result / renderer：继续负责用户可见结果，不被 logger 替代。
- activity log：继续记录 web/subagent/convert 的业务活动，不被 logger 替代。
- logger：负责维护者可观测性、内部 warning/error/debug。
- console：只作为最后 fallback，且必须通过统一 sink。

---

## 6. 分批实施计划

## 批次 A：基础设施与测试（P0）

目标：先建立统一接口和测试能力，不替换大量业务代码。

1. 新增 `src/shared/logger.ts`
   - 定义 `Logger` / `LoggerSink` / `LogEvent`。
   - 实现 `createLogger()`、`noopLogger`、`createConsoleLoggerSink()`、`createMemoryLoggerSink()`。
   - 实现 metadata redaction / truncation。
2. 新增 `tests/shared/logger.test.ts`
   - 覆盖 log event shape。
   - 覆盖 child logger module 命名。
   - 覆盖 secret redaction。
   - 覆盖 error summary 不含 stack 默认泄漏。
   - 覆盖 console sink 可注入 writer，测试不污染真实 console。

验收：

- `pnpm test -- tests/shared/logger.test.ts` 通过。
- 不修改用户可见行为。

## 批次 B：OBS-001 指定散点替换（P0）

目标：只替换审计中明确点名的分散 console fallback。

候选文件：

1. `src/index.ts`
   - 配置加载或模块注册异常：改为 logger error/warn。
2. `src/modules/subagents/register.ts`
   - 注册 degraded/fallback 状态：改为 logger warn/debug。
3. `src/modules/web/observability.ts`
   - 现有 debug logging 适配 shared logger 或共享 redaction helper。
4. `src/modules/commands/*`
   - 仅替换维护者日志；不要替换正常用户 report/stdout fallback。

测试：

- 更新或新增对应模块测试，确保：
  - JSON protocol 模式下不出现额外 raw console 输出；
  - degraded UI fallback 的用户输出不被误删；
  - logger sink 可注入并收到预期事件。

验收：

- `rg "console\." src` 中剩余项必须被分类：
  - 受控 sink 内部使用；或
  - 明确用户输出路径；或
  - 待后续批次迁移。

## 批次 C：文档与审计闭环（P1）

目标：更新维护文档与审计状态。

1. 更新 `internal-docs/maintain/testing.md`
   - 说明 logger 测试策略和 stdout/stderr 不污染原则。
2. 更新 `internal-docs/audit/code-quality-audit-2026-05-13.md`
   - 将 `OBS-001` 从 `In Progress` 调整为 `Closed`（完成后）。
   - 更新首页风险汇总。
3. 可选新增 `internal-docs/issues/obs-001-logger-diagnostics-sink-plan-2026-05-19.md` 的执行结果回填。

验收：

- 文档与第十七章问题表状态一致。
- 不留下“待推进/已完成”矛盾描述。

---

## 7. 用例命名规范

新增测试建议使用可追踪 ID：

- `OBS-LOG-001`：基础 logger event shape。
- `OBS-LOG-002`：child logger module 继承与覆盖。
- `OBS-LOG-003`：secret metadata redaction。
- `OBS-LOG-004`：error summary 安全输出。
- `OBS-LOG-005`：console sink 注入 writer，不污染真实 stdout/stderr。
- `OBS-LOG-006`：`src/index.ts` 使用 logger 记录配置/注册异常。
- `OBS-LOG-007`：commands fallback 不破坏用户可见输出边界。

---

## 8. 风险与回退策略

## 风险 1：误删用户可见输出

- 触发：把 commands/report viewer 的 fallback stdout 当成日志移除。
- 约束：用户内容输出和维护者日志必须分开判断。
- 回退：仅替换内部 warning/error；保留 report viewer fallback。

## 风险 2：logger 引入循环依赖

- 触发：shared logger 依赖 modules 或 config。
- 约束：`src/shared/logger.ts` 不得依赖功能模块。
- 回退：logger 只接受构造参数，不主动读取全局配置。

## 风险 3：日志泄露敏感信息

- 触发：metadata 直接 stringify error/env/config。
- 约束：统一 redaction 与 truncation；默认不输出 stack。
- 回退：默认使用 noop sink，仅测试和显式 fallback 使用 console sink。

## 风险 4：破坏现有 web observability

- 触发：把 web activity/debug 与 shared logger 强行合并。
- 约束：web activity 保持业务记录职责；shared logger 只复用安全格式化或作为 sink。
- 回退：批次 B 只做 adapter，不移除 web observability API。

---

## 9. 验收标准

完成标准：

- [ ] `src/shared/logger.ts` 存在并有单元测试。
- [ ] OBS-001 指定的裸 `console.*` fallback 已替换或分类说明。
- [ ] logger metadata redaction / truncation 有测试。
- [ ] 用户可见 report/stdout fallback 行为不回退。
- [ ] `pnpm test` 通过。
- [ ] `pnpm typecheck` 通过。
- [ ] `pnpm lint` 通过。
- [ ] 审计文档中 `OBS-001` 状态与实际实现一致。

---

## 10. 执行顺序建议

推荐顺序：

1. 批次 A：新增 shared logger + tests。
2. 批次 B1：替换 `src/index.ts` 和 `src/modules/subagents/register.ts`。
3. 批次 B2：适配 `src/modules/web/observability.ts`。
4. 批次 B3：审查 `src/modules/commands/*`，只替换维护者日志，不动用户输出。
5. 批次 C：更新维护文档与审计状态。

每批后至少运行：

```bash
pnpm test
pnpm typecheck
```

最终运行：

```bash
pnpm lint
pnpm test:coverage
```

---

## 11. 当前结论

OBS-001 可以开始修复，且建议以“轻量 shared logger + 分批替换 console fallback”的方式推进。该问题不应扩大为完整观测平台建设；本轮重点是统一边界、降低分散输出、增强测试可控性与安全 redaction。
