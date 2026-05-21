---
status: completed
audience: maintainer
last_verified: 2026-05-21
language: chinese
completion_type: completed-with-deferred-items
---

# 测试去重、归并与契约化实施计划（收口版）

## 1. 背景与目标

当前 `tests/` 已具备较高覆盖与稳定性，本轮治理目标是：

- 在不降低门禁质量（`typecheck/lint/test/docs:check`）前提下完成测试体系的去重、归并与契约化。
- 与 `pi` 官方工程风格保持一致：模块镜像、行为导向、边界清晰、可维护性优先。
- 降低维护成本，提高回归信号质量，减少测试漂移。

本计划已进入收口状态，结果见第 10~12 节。

---

## 2. 范围与非目标

### 2.1 范围（In Scope）

- `tests/` 全目录结构重整、重复断言消除、共享契约抽取、表驱动归并。
- 与测试重构直接相关的最小测试 helper 提取（仅 `tests/` 内部）。
- 必要的小规模命名规范统一（如去阶段化）。

### 2.2 非目标（Out of Scope）

- 不修改生产逻辑行为语义（除非发现真实 bug，并单独记录）。
- 不做单轮大重写，采用渐进式重构。
- 不以减少测试数量为唯一目标，不牺牲关键安全边界覆盖。

---

## 3. 设计原则

1. 行为优先：验证产品行为与对外契约，避免验证测试矩阵定义本身。
2. 单一职责：测试文件按 register/config/schema/runtime/state/renderer 职责聚焦。
3. 共享契约：跨模块稳定共性进入 shared contracts。
4. 表驱动优先：高重复边界场景统一 matrix/table-driven。
5. 最小变更闭环：每批改动可独立通过门禁。
6. 结构镜像：测试目录持续镜像 `src/modules/*`。

---

## 4. 审计问题与落地结果对照

### 4.1 重复簇 A：runtime 生命周期重复

- 相关文件：
  - `tests/extension/runtime.test.ts`
  - `tests/shared/runtime.test.ts`
  - `tests/shared/activate-runtime.test.ts`
- 结果：已完成去重，保留 shared 主断言与 extension 特有 wiring 行为。

### 4.2 重复簇 B：模块注册样板重复

- 相关文件：
  - `tests/convert/register.test.ts`
  - `tests/web/register.test.ts`
  - `tests/subagents/register.test.ts`
  - `tests/lsp/tool.test.ts`（注册子集）
- 结果：已通过共享 contract 收敛稳定共性，模块本地保留特有行为。

### 4.3 重复簇 C：schema 与注册职责混杂

- 结果：已局部收敛；schema 仍以模块内断言为主，未强行统一成共享 strictness contract（见第 11 节）。

### 4.4 重复簇 D：Provider 错误路径重复

- 相关文件：`tests/web/providers.test.ts`
- 结果：已完成 matrix/table-driven 归并，并保留 provider 特有 request+normalize 深测。

### 4.5 重复簇 E：security 边界测试离散

- 相关文件：`tests/web/security.test.ts`
- 结果：已完成表驱动重构，边界点与可读性保持。

### 4.6 低价值元测试

- 相关文件（已去阶段化命名）：
  - `tests/web/state-model.test.ts`
  - `tests/subagents/state-model.test.ts`
- 结果：已移除低价值“矩阵定义类”用例，保留行为层高价值断言。

---

## 5. 目标测试架构（收口后状态）

```text
tests/
├─ shared/
│  ├─ contracts/
│  │  └─ module-registration-contract.test.ts         # 已落地
│  ├─ async-fetch-helpers.ts                           # 已落地（统一异步长链路 helper）
│  └─ ...
├─ web/
│  ├─ register.test.ts
│  ├─ providers.test.ts
│  ├─ security.test.ts
│  ├─ state-model.test.ts                              # 已去阶段化
│  └─ ...
├─ subagents/
│  ├─ register.test.ts
│  ├─ state-model.test.ts                              # 已去阶段化
│  └─ ...
└─ convert/lsp/commands/guards/...（按职责拆分）
```

说明：

- `module-registration-contract` 已落地并稳定。
- `error-payload-contract`、`schema-strictness-contract` 本轮**明确延后**（非缺失，见第 11 节偏差说明）。

---

## 6. 分阶段实施结果

### Phase 1：机械去重（低风险）

- 删除低价值元测试。
- 去除 runtime 显式重复断言。
- 结果：完成。

### Phase 2：契约抽取（中风险，高收益）

- 新增 `tests/shared/contracts/module-registration-contract.test.ts`。
- 收敛多模块注册共性断言。
- 结果：完成。

### Phase 3：表驱动归并（中风险）

- `tests/web/security.test.ts` 表驱动。
- `tests/web/providers.test.ts` matrix 化 common empty/error 行为。
- 结果：完成。

### Phase 4：高价值缺口补强（质量提升）

- redirect loop / max redirects。
- abort/cancel propagation。
- session 恢复负路径（malformed/stale）。
- 结果：完成。

---

## 7. 实际改动文件（收口记录）

已完成并验证的关键文件包含：

- `tests/shared/contracts/module-registration-contract.test.ts`
- `tests/shared/module-registration-contract.test.ts`
- `tests/shared/async-fetch-helpers.ts`
- `tests/web/register.test.ts`
- `tests/convert/register.test.ts`
- `tests/subagents/register.test.ts`
- `tests/lsp/tool.test.ts`（注册与 payload 相关段）
- `tests/web/security.test.ts`
- `tests/web/providers.test.ts`
- `tests/web/fetch-content.test.ts`
- `tests/web/search.test.ts`
- `tests/convert/tool.test.ts`
- `tests/web/state-model.test.ts`
- `tests/subagents/state-model.test.ts`
- `tests/extension/runtime.test.ts`
- `tests/shared/runtime.test.ts`

---

## 8. 质量门禁结果

阶段执行与收口阶段均已通过：

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm docs:check
```

结论：全量门禁通过。

---

## 9. 风险复核结论

1. 误删有效断言风险：已通过行为映射与回归跑通控制。
2. 共享 contract 过度抽象风险：已采用“只抽稳定共性”策略。
3. 表驱动可读性风险：通过 case 分类与命名保持可读。
4. 大改 review 风险：已分批提交，具备可回滚性。

---

## 10. 完成定义（DoD）验收

- M1（Phase 1）：完成。
- M2（Phase 2）：完成。
- M3（Phase 3）：完成。
- M4（Phase 4）：完成。

最终 DoD 结论：

- 测试可读性、可维护性、变更成本显著改善。
- 覆盖质量未下降，关键安全与契约路径更集中。
- 结构与风格与 pi 工程哲学保持一致。

---

## 11. 偏差说明（已确认）与延后项

### 11.1 偏差说明

原“目标架构”中列出以下候选共享 contract：

- `tests/shared/contracts/error-payload-contract.test.ts`
- `tests/shared/contracts/schema-strictness-contract.test.ts`

本轮未新增上述两个独立文件，原因：

1. **error payload** 在模块间语义差异较大（事件名、级别、模块特有约束），当前模块内断言定位更直接。  
2. **schema strictness** 在工具间形态差异较大（required/legacy/selector 组合差异），强行统一易形成低收益“最低公约数”测试。

### 11.2 当前替代覆盖

- Error payload 由 `web/convert/subagents/lsp/commands/guards` 对应测试文件分别覆盖。
- Schema strictness 由 `web/register.test.ts`、`convert/register.test.ts`、`subagents/config.test.ts` 等模块内用例覆盖。

### 11.3 延后项状态

- `error-payload-contract.test.ts`：Deferred（延后，不阻塞本轮完成）
- `schema-strictness-contract.test.ts`：Deferred（延后，不阻塞本轮完成）

---

## 12. 后续触发条件（何时再做延后项）

仅在满足以下任一条件时重启延后项：

1. 同一类 payload/schema 断言在 **3 个及以上模块重复出现且持续演化**。
2. 月度维护中出现 **2 次及以上**“同类契约漂移”回归。
3. 新增模块接入导致现有模块内断言模板复制明显增加。
4. Review 明确指出模块内断言可读性下降，且共享抽象可提升定位效率。

触发后优先策略：

- 优先提取 `tests/shared/assertions/*` 级别 helper；
- 确认 helper 稳定后，再评估是否升级为 shared contract 文件。

---

## 13. 维护备注

- 本计划文档作为治理收口记录，后续若进入新一轮测试体系治理，请新建新计划文档，不在本文件继续叠加阶段草案。
