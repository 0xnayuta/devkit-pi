---
status: current
audience: maintainer
last_verified: 2026-05-20
language: chinese
---

# 规划

`internal-docs/planning/` 收集未来的计划、提案和路线图文档。**这些文档不代表当前行为。**

当前的公共契约和已实现的 API 曲面记录在 [`docs/reference/`](../../docs/reference/) 中。`src/` 和 `tests/` 中的源代码和测试是另外两个权威来源。

## 里程碑索引

- Phase 4：已闭环（六模块执行链路 `*.error_payload` 统一命名已落地，且错误码到 payload/remediation 最终对照已补齐）。详见：
  - [pi-native-extension-alignment-plan.md](./pi-native-extension-alignment-plan.md)
  - [phase-4-error-bridge-matrix.md](../audit/phase-4-error-bridge-matrix.md)

## 规划文档

- [add-convert_content-tool-plan.md](./add-convert_content-tool-plan.md)：已实现的 `convert_content` 分阶段计划与历史设计记录。当前行为见 [Convert Content Tool Reference](../../docs/reference/convert-tools.md)。
- [personal-toolkit-feature-roadmap.md](./personal-toolkit-feature-roadmap.md)：未来 toolkit 功能的路线图。尚未实现。
- [pi-native-extension-alignment-plan.md](./pi-native-extension-alignment-plan.md)：向 Pi 官方/原生扩展结构、风格和设计哲学看齐的分阶段计划。Phase 1/2 已完成，Phase 3 进行中，Phase 4 已闭环。
- [phase-3-state-inventory-audit.md](../audit/phase-3-state-inventory-audit.md)：Phase 3 首个切片的状态清单审计（memory / session entry / details 三分类）。

## 策略

- 提议、路线图和计划文档仅描述可能的未来方向。
- 不要将规划文档视为当前的公共契约或实现文档。
- 此处描述的工具、命令、字段或错误码不保证在当前版本中存在。
- 如果规划内容与 `docs/reference/`、`src/` 或 `tests/` 冲突，以参考文档和源代码为准。