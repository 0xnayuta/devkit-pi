---
status: proposed
audience: maintainer
last_verified: 2026-05-21
language: chinese
---

# 测试去重、归并与契约化实施计划（Test Dedup / Consolidation / Contract Plan）

## 1. 背景与目标

当前 `tests/` 已具备较高覆盖与稳定性，但存在以下结构性问题：

1. **重复样板较多**：多模块重复验证注册开关、子进程禁用、错误桥接、元数据完整性等共性逻辑。
2. **边界测试分散且冗长**：网络安全与 Provider 错误路径存在大量低信噪比单例测试。
3. **职责混杂**：部分 `register.test.ts` 同时承载 schema、renderer、runtime 行为断言，不利于维护。
4. **元测试噪声**：少量测试在验证“测试矩阵本身”，而非产品行为。

本计划目标：

- 在**不降低质量门禁**（typecheck/lint/test 全绿）前提下，完成测试体系的**去重、归并、契约化**。
- 与 `pi` 官方工程风格保持一致：模块镜像、行为导向、边界清晰、可维护性优先。
- 降低维护成本，提高回归信号质量，减少未来功能演进时的测试漂移。

---

## 2. 范围与非目标

### 2.1 范围（In Scope）

- `tests/` 全目录的结构重整、重复断言消除、共享契约抽取、表驱动归并。
- 与测试重构直接相关的最小工具函数提取（仅 `tests/` 内部）。
- 必要时的小规模测试命名规范统一。

### 2.2 非目标（Out of Scope）

- 不修改生产逻辑行为语义（除非发现真实 bug，并单独记录）。
- 不追求单轮“大重写”；采用渐进式重构。
- 不人为压缩关键安全边界覆盖，不以减少测试数量作为唯一目标。

---

## 3. 设计原则

1. **行为优先**：测试验证产品行为与对外契约，避免验证测试数据常量。
2. **单一职责**：一个测试文件聚焦一类职责（register/config/schema/runtime/state/renderer）。
3. **共享契约**：跨模块共性断言抽为共享 contract，避免散落重复。
4. **表驱动优先**：高重复边界场景统一改为 matrix/table-driven。
5. **最小变更闭环**：每一批改动均可独立通过 `pnpm typecheck && pnpm lint && pnpm test`。
6. **结构镜像**：测试目录持续镜像 `src/modules/*`，共享能力沉淀至 `tests/shared/contracts/*` 与 `tests/fixtures/*`。

---

## 4. 现状问题清单（基于本轮审计）

### 4.1 重复簇 A：runtime 生命周期重复

- 相关文件：
  - `tests/extension/runtime.test.ts`
  - `tests/shared/runtime.test.ts`
  - `tests/shared/activate-runtime.test.ts`
- 问题：`ResourceScope` 释放顺序与 runtime dispose 行为存在重复覆盖。

### 4.2 重复簇 B：模块注册样板重复

- 相关文件：
  - `tests/convert/register.test.ts`
  - `tests/web/register.test.ts`
  - `tests/subagents/register.test.ts`
  - `tests/lsp/tool.test.ts`（注册子集）
  - `tests/commands/register.test.ts`
- 问题：`enabled=false`、子进程禁用、错误日志结构等模式在多个模块重复。

### 4.3 重复簇 C：schema 与注册职责混杂

- 相关文件：`register/config/tool` 多文件交叉验证 schema。
- 问题：同一参数规则在不同文件重复出现，变更成本高。

### 4.4 重复簇 D：Provider 错误路径重复

- 相关文件：`tests/web/providers.test.ts`
- 问题：多个 Provider 的空响应/异常路径断言结构近似。

### 4.5 重复簇 E：security 边界测试离散

- 相关文件：`tests/web/security.test.ts`
- 问题：大量单例用例可归并为等价类+边界点。

### 4.6 低价值元测试

- 相关文件：
  - `tests/web/state-model-phase3.test.ts`
  - `tests/subagents/state-model-phase3.test.ts`
- 问题：存在“验证矩阵定义本身”的用例，对行为回归价值低。

---

## 5. 目标测试架构（Target Test Architecture）

```text
tests/
├─ shared/
│  ├─ contracts/
│  │  ├─ module-registration-contract.test.ts
│  │  ├─ error-payload-contract.test.ts
│  │  └─ schema-strictness-contract.test.ts
│  ├─ fixtures/
│  │  ├─ mock-pi.ts
│  │  ├─ mock-logger.ts
│  │  └─ tool-registration.ts
│  └─ ...（现有 shared 测试）
├─ web/
│  ├─ register.test.ts
│  ├─ schemas.test.ts
│  ├─ providers.test.ts
│  ├─ security.test.ts
│  ├─ state-model.test.ts
│  └─ ...
├─ subagents/
│  ├─ register.test.ts
│  ├─ schemas.test.ts
│  ├─ execution.test.ts
│  ├─ runtime.test.ts
│  ├─ state-model.test.ts
│  └─ ...
└─ convert/lsp/commands/guards/...（同样按职责拆分）
```

说明：

- 共享 contract 负责“跨模块一致性”；模块本地测试只保留“模块差异行为”。
- state-model 命名统一，去掉 `phase3` 等阶段标签，避免计划阶段名渗入长期测试资产。

---

## 6. 分阶段实施计划

## Phase 1：机械去重（低风险）

### 6.1 目标

- 删除低价值元测试。
- 移除 runtime 明显重复断言。
- 保持行为覆盖不变。

### 6.2 任务

1. 删除以下元测试用例：
   - `tests/web/state-model-phase3.test.ts` 中“定义矩阵”类用例。
   - `tests/subagents/state-model-phase3.test.ts` 中“定义矩阵”类用例。
2. runtime 去重：
   - 仅保留 `tests/shared/runtime.test.ts` 的 `ResourceScope` 逆序释放主断言。
   - `tests/extension/runtime.test.ts` 仅保留 extension 特有 wiring/生命周期行为。

### 6.3 验收

- 全量测试通过。
- 删除用例不引入行为覆盖空洞（通过 diff 复核断言意图）。

---

## Phase 2：契约抽取（中风险，高收益）

### 6.4 目标

- 建立共享 registration contract。
- 消除模块间重复注册样板。

### 6.5 任务

1. 新增 `tests/shared/contracts/module-registration-contract.test.ts`：
   - 统一验证 `enabled/disabled`。
   - 统一验证 child process policy。
   - 统一验证 prompt metadata 完整性。
   - 统一验证错误 payload 日志基本结构（module/code/retryable）。
2. 各模块本地 register 测试减负：
   - `tests/web/register.test.ts`
   - `tests/convert/register.test.ts`
   - `tests/subagents/register.test.ts`
   - `tests/lsp/tool.test.ts`（注册段）
   - 仅保留模块特有路径（例如 hooks 细节、provider 特殊行为、whitelist 规则）。

### 6.6 验收

- contract 测试可独立失败定位模块漂移。
- 各模块 register 文件体积显著下降且可读性提升。

---

## Phase 3：表驱动归并（中风险）

### 6.7 目标

- 降低边界测试噪声，保持覆盖强度。

### 6.8 任务

1. `tests/web/security.test.ts` 表驱动重构：
   - 按类别组织 case：invalid/protocol/hostname/private-v4/private-v6/allowPrivateNetwork。
   - 保留哨兵边界点。
2. `tests/web/providers.test.ts` 表驱动重构：
   - 通用错误行为 matrix（empty、non-OK、timeout、parse fail）。
   - 每 provider 保留一条 request+normalize 特有深测。

### 6.9 验收

- 总测试数量下降但关键边界断言不减少。
- 失败输出可读（case id 明确）。

---

## Phase 4：补强高价值缺口（质量提升）

### 6.10 目标

- 在简化后补齐高价值安全/可靠性测试。

### 6.11 任务

1. redirect loop / max redirects：
   - `tests/web/fetch-content.test.ts`
   - `tests/convert/tool.test.ts`
2. abort/cancel propagation：
   - `tests/web/search.test.ts`
   - `tests/web/fetch-content.test.ts`
   - `tests/convert/tool.test.ts`
3. session 恢复负路径：
   - malformed/oversized/stale entries 的 graceful ignore。

### 6.12 验收

- 新增测试均为行为层高价值断言。
- 与现有错误码/恢复建议保持一致。

---

## 7. 文件级改动建议（首轮）

建议第一轮先动以下文件（低冲突、易回滚）：

- `tests/web/state-model-phase3.test.ts`
- `tests/subagents/state-model-phase3.test.ts`
- `tests/extension/runtime.test.ts`
- `tests/shared/runtime.test.ts`

第二轮再进入契约抽取与表驱动重构：

- `tests/shared/contracts/*`（新增）
- `tests/web/register.test.ts`
- `tests/convert/register.test.ts`
- `tests/subagents/register.test.ts`
- `tests/lsp/tool.test.ts`
- `tests/web/security.test.ts`
- `tests/web/providers.test.ts`

---

## 8. 风险与缓解

1. **风险：误删有效断言导致回归盲区**
   - 缓解：删除前建立“断言映射表”（旧断言 -> 新位置）。
2. **风险：共享 contract 过度抽象，定位困难**
   - 缓解：contract 只覆盖稳定共性；模块特性断言仍留本地。
3. **风险：表驱动失败日志可读性下降**
   - 缓解：每 case 强制包含 id、输入摘要、期望代码。
4. **风险：一次性改动过大影响 review**
   - 缓解：严格分批提交（Phase 1/2/3/4），每批可独立通过 CI。

---

## 9. 质量门禁与执行流程

每一阶段完成后必须执行：

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm docs:check
```

附加要求：

- 每个提交附“为何删除/归并”的说明。
- 若发生行为差异，必须记录在 `internal-docs/maintain/architecture.md` 或对应维护文档。

---

## 10. 里程碑与完成定义（Definition of Done）

### M1（Phase 1 完成）
- 已删除低价值元测试与 runtime 显式重复。
- 门禁全绿。

### M2（Phase 2 完成）
- 共享 registration contract 落地。
- 至少 3 个模块 register 样板明显缩减。

### M3（Phase 3 完成）
- `web/security`、`web/providers` 完成表驱动归并。
- 失败输出可读性保持良好。

### M4（Phase 4 完成）
- redirect/cancel/session 恢复缺口补齐。
- 全量门禁通过，测试结构稳定。

最终完成标准：

- `tests/` 可读性、可维护性、变更成本显著改善。
- 覆盖质量不下降，关键安全与契约路径更集中。
- 与 pi 官方工程风格一致（模块镜像、契约优先、行为导向、渐进演进）。
