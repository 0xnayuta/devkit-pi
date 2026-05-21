---
status: accepted
audience: maintainer
last_verified: 2026-05-21
language: chinese
---

# ADR 0008: devkit-pi 向 Pi 官方/原生扩展范式收敛

## 状态

Accepted

## 背景

`devkit-pi` 已从早期能力集合演进为 Pi package，具备 subagents、web、convert、lsp、guards、commands 等模块化能力，并形成了较完整的测试与文档体系。

随着能力增长，项目需要一个稳定的项目级决策基线，回答以下问题：

- 扩展入口、生命周期与状态模型应对齐哪种范式
- 在结构重构与兼容历史实现之间如何取舍
- 当外部建议与 Pi 官方 API 不一致时，以何者为准

`internal-docs/planning/pi-native-extension-alignment-plan.md` 给出了阶段性执行路线，但其性质是实施计划，不是长期架构决策。

## 决策

`devkit-pi` 在代码结构、工程风格和设计哲学上，统一向 Pi 官方仓库与原生扩展范式收敛。

具体约束如下：

1. 以 Pi 官方 extension API 为唯一公共基线
   - 使用 `ExtensionAPI`、事件驱动生命周期和 Pi session 模型
   - 不对外模拟非官方 API（如 VS Code 风格 extension context）

2. 保持 Pi-native package 定位
   - 不 fork Pi core
   - 不将 `devkit-pi` 设计为 Pi core 替代层

3. 优先一致性与可维护性
   - 同类模块保持一致的目录结构、命名、配置归一化、错误映射、测试镜像与文档模式
   - 当 legacy 内部结构与一致性冲突时，优先规范化重构

4. 安全默认值保持保守
   - 默认 readonly / soft guard / 受限网络边界不变
   - 高风险 hard gate 仅在显式配置下启用

5. 规划与决策分层
   - 本 ADR 作为长期方向与约束
   - 分阶段落地细节、切片顺序和验收细则由 planning 文档维护

## 影响

- 架构评审、实现方案评审、PR 审核均应以“是否收敛到 Pi-native 范式”作为显式检查项。
- 对外行为变更必须同步更新 reference 文档；仅内部重构也需补充 maintain/adr 记录。
- 允许为一致性进行小幅 breaking internal change，但不得破坏既定公共契约（除非明确规划并公告）。

## 非目标

本决策不包含以下内容：

- 修改或扩展 Pi core 官方 API
- 引入并对外宣称非官方扩展入口模型
- 通过增加重型运行时依赖来换取“表面对齐”

## 合规检查（执行层）

后续变更可按以下问题快速自检：

1. 是否基于 Pi 官方 API 与事件模型实现，而非自造对外 API？
2. 是否复用了现有模块模式与命名，不新增平行结构？
3. 是否保持安全默认保守，并将高风险能力置于显式开关后？
4. 若有用户可见变化，测试与文档是否同轮更新？
5. 是否与 `pi-native-extension-alignment-plan.md` 的阶段目标一致？

不满足以上任一项时，应在变更说明中给出书面例外理由，必要时新增后续 ADR。