---
status: template
audience: maintainer
last_verified: YYYY-MM-DD
language: chinese
---

# 项目代码质量审计报告 · <project-name>

> 模板目标：为后续审计提供统一、可复核、可工程化执行的结构。
>
> 使用规则：
>
> 1. **问题总表是唯一状态源**：第 8 章为 finding registry；首页、路线图、结论必须与第 8 章一致。
> 2. **Closed 必须有证据**：至少填写代码/测试/文档/命令之一；缺失项需说明原因。
> 3. **Deferred / Mitigated 必须可追踪**：必须写明风险接受原因、重开触发条件和复审时间。
> 4. **复审只追加不覆盖**：复审记录写入第 7 章，并同步更新第 8 章状态。
> 5. **状态枚举固定**：`Open / In Progress / Mitigated / Deferred / Closed`。

---

## 0. 审计看板

### 0.1 基本信息

| 字段 | 值 |
| --- | --- |
| 项目 | `<project-name>` |
| 仓库 / 范围 | `<repo-or-scope>` |
| 审计日期 | `YYYY-MM-DD` |
| 审计基线 | `<branch / tag / commit>` |
| 审计人 | `<name>` |
| 复审状态 | `<Initial / Re-review / Finalized>` |

### 0.2 风险与状态汇总

| Priority | Total | Open | In Progress | Mitigated | Deferred | Closed |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| P0 | 0 | 0 | 0 | 0 | 0 | 0 |
| P1 | 0 | 0 | 0 | 0 | 0 | 0 |
| P2 | 0 | 0 | 0 | 0 | 0 | 0 |
| P3 | 0 | 0 | 0 | 0 | 0 | 0 |
| **合计** | 0 | 0 | 0 | 0 | 0 | 0 |

### 0.3 关键结论

- 总体评级：`<A / B / C / D>`
- 当前是否适合继续新增功能：`<Yes / No / Conditional>`
- 当前是否建议优先重构：`<Yes / No / Conditional>`
- 最大风险：`<one-line summary>`
- 下一步最高优先级：`<one-line action>`

### 0.4 Top Findings

| ID | Priority | Status | 标题 | 当前结论 |
| --- | --- | --- | --- | --- |
| `<ID>` | `<P0-P3>` | `<Status>` | `<title>` | `<summary>` |

---

## 1. 审计范围与方法

### 1.1 审计范围

包括：

- `<module / directory / workflow>`

不包括：

- `<explicit exclusions>`

### 1.2 审计输入

| 类型 | 路径 / 命令 / 资料 |
| --- | --- |
| 代码 | `<src/...>` |
| 测试 | `<tests/...>` |
| 文档 | `<docs/...>` / `<internal-docs/...>` |
| 配置 | `<package.json / tsconfig / ci>` |
| 验证命令 | `<pnpm test / pnpm lint / ...>` |

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

- 项目类型：`<extension / service / library / cli / app>`
- 核心能力：
  1. `<capability>`
  2. `<capability>`

### 2.2 技术栈与运行环境

| 类别 | 当前值 | 备注 |
| --- | --- | --- |
| 语言 | `<TypeScript / ...>` | `<note>` |
| 运行时 | `<Node.js ...>` | `<note>` |
| 包管理 | `<pnpm / npm / yarn>` | `<note>` |
| 测试框架 | `<node:test / vitest / jest>` | `<note>` |
| CI | `<GitHub Actions / ...>` | `<note>` |

### 2.3 目录与模块边界

```text
<core-tree>
```

边界判断：

- 清晰边界：`<modules>`
- 模糊边界：`<modules>`
- 高复杂度热点：`<files/modules>`

---

## 3. 分领域审计结果

> 本章只记录分析结论与证据摘要；具体问题必须进入第 8 章问题总表。

### 3.1 架构与模块边界

- 评级：`<A/B/C/D>`
- 结论：`<summary>`
- 主要证据：`<paths/tests/docs>`
- 关联问题：`<ARCH-XXX>`

### 3.2 代码质量与可维护性

- 评级：`<A/B/C/D>`
- 结论：`<summary>`
- 主要证据：`<paths/tests/docs>`
- 关联问题：`<QUAL-XXX>`

### 3.3 安全边界

检查项：

| 检查项 | 结论 | 证据 | 关联问题 |
| --- | --- | --- | --- |
| 网络访问边界 | `<Pass/Fail/Partial>` | `<evidence>` | `<SEC-XXX>` |
| 文件系统边界 | `<Pass/Fail/Partial>` | `<evidence>` | `<SEC-XXX>` |
| 外部命令执行 | `<Pass/Fail/Partial>` | `<evidence>` | `<SEC-XXX>` |
| secrets / token 处理 | `<Pass/Fail/Partial>` | `<evidence>` | `<SEC-XXX>` |

### 3.4 资源与性能

- 响应大小 / 输出大小限制：`<summary>`
- timeout / cancellation：`<summary>`
- 并发 / 队列 / cache：`<summary>`
- 关联问题：`<RES-XXX / PERF-XXX>`

### 3.5 错误处理与可观测性

- 结构化错误：`<summary>`
- logger / diagnostics：`<summary>`
- 用户输出与维护者日志边界：`<summary>`
- 关联问题：`<ERR-XXX / OBS-XXX>`

### 3.6 测试体系

- 单元测试：`<summary>`
- 集成 / 回归测试：`<summary>`
- coverage 可见性：`<summary>`
- 关联问题：`<TEST-XXX>`

### 3.7 文档与配置契约

- public docs 与源码一致性：`<summary>`
- 配置默认值漂移检查：`<summary>`
- 内部维护文档：`<summary>`
- 关联问题：`<DOC-XXX>`

### 3.8 工程化与发布风险

- lint / typecheck / test 门禁：`<summary>`
- CI / artifact / coverage：`<summary>`
- runtime engines / package manifest：`<summary>`
- 关联问题：`<ENG-XXX>`

---

## 4. 验证记录

### 4.1 命令执行结果

| 命令 | 结果 | 说明 |
| --- | --- | --- |
| `pnpm lint` | `<Pass/Fail/Not Run>` | `<note>` |
| `pnpm typecheck` | `<Pass/Fail/Not Run>` | `<note>` |
| `pnpm test` | `<Pass/Fail/Not Run>` | `<note>` |
| `pnpm test:coverage` | `<Pass/Fail/Not Run>` | `<note>` |
| `pnpm docs:check` | `<Pass/Fail/Not Run>` | `<note>` |

### 4.2 Coverage 摘要（如适用）

| 指标 | 值 |
| --- | ---: |
| Total line coverage | `<%>` |
| Total function coverage | `<%>` |
| 文件总数 | `<count>` |
| 未覆盖文件数 | `<count>` |

热点 / 低覆盖文件：

| 文件 | Line % | Function % | 说明 |
| --- | ---: | ---: | --- |
| `<path>` | `<%>` | `<%>` | `<note>` |

### 4.3 未执行验证说明

- `<command>`：`<reason / risk>`

---

## 5. 修复路线图

### 5.1 立即处理（P0 / 阻断项）

- [ ] `<ID>`：`<action>`

### 5.2 当前迭代处理（P1）

- [ ] `<ID>`：`<action>`

### 5.3 近期排期（P2）

- [ ] `<ID>`：`<action>`

### 5.4 后续优化（P3）

- [ ] `<ID>`：`<action>`

---

## 6. 最终结论

### 6.1 当前判断

`<short conclusion>`

### 6.2 是否建议继续新增功能

`<Yes / No / Conditional>`：`<reason>`

### 6.3 是否建议先重构 / 补测试 / 补文档

- 重构：`<Yes / No / Conditional>`：`<reason>`
- 补测试：`<Yes / No / Conditional>`：`<reason>`
- 补文档：`<Yes / No / Conditional>`：`<reason>`

### 6.4 下一步三件事

1. `<action>`
2. `<action>`
3. `<action>`

---

## 7. 复审记录

> 每次复审追加一个小节，不覆盖旧记录。复审后必须同步更新第 0 章汇总与第 8 章问题总表。

### 7.1 复审（YYYY-MM-DD）

- 复审基线：`<commit/tag/branch>`
- 已关闭问题：`<IDs>`
- 状态变化：`<IDs + old -> new>`
- 新增问题：`<IDs>`
- 验证命令：`<commands + result>`
- 复审结论：`<summary>`

---

## 8. 附录：问题总表（Finding Registry）

> 第 8 章是唯一状态源。新增、关闭、暂缓、缓解任何问题，都必须更新本表。

| ID | 领域 | 问题标题 | Priority | Status | 阶段来源 | 影响摘要 | 证据（代码/测试/文档/命令） | 风险接受 / 暂缓原因 | 重开触发条件 | 下一步动作 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| SEC-001 | 安全 | `<title>` | P0 | Open | 原审计 | `<impact>` | `<evidence>` | - | `<trigger>` | `<action>` |
| RES-001 | 资源 | `<title>` | P0 | Open | 原审计 | `<impact>` | `<evidence>` | - | `<trigger>` | `<action>` |
| ARCH-001 | 架构 | `<title>` | P1 | Open | 原审计 | `<impact>` | `<evidence>` | - | `<trigger>` | `<action>` |
| QUAL-001 | 代码质量 | `<title>` | P1 | Open | 原审计 | `<impact>` | `<evidence>` | - | `<trigger>` | `<action>` |
| TEST-001 | 测试 | `<title>` | P2 | Open | 原审计 | `<impact>` | `<evidence>` | - | `<trigger>` | `<action>` |
| DOC-001 | 文档契约 | `<title>` | P2 | Open | 原审计 | `<impact>` | `<evidence>` | - | `<trigger>` | `<action>` |
| ENG-001 | 工程化 | `<title>` | P2 | Open | 原审计 | `<impact>` | `<evidence>` | - | `<trigger>` | `<action>` |
| OBS-001 | 可观测性 | `<title>` | P3 | Open | 原审计 | `<impact>` | `<evidence>` | - | `<trigger>` | `<action>` |

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
