---
status: current
audience: maintainer
last_verified: 2026-05-12
language: chinese
---

# 规划

`docs/planning/` 收集未来的计划、提案和路线图文档。**这些文档不代表当前行为。**

当前的公共契约和已实现的 API 曲面记录在 [`docs/reference/`](../reference/) 中。`src/` 和 `tests/` 中的源代码和测试是另外两个权威来源。

## 规划文档

- [add-convert_content-tool-plan.md](./add-convert_content-tool-plan.md)：已实现的 `convert_content` 分阶段计划与历史设计记录。当前行为见 [Convert Content Tool Reference](../../reference/convert-tools.md)。
- [personal-toolkit-feature-roadmap.md](./personal-toolkit-feature-roadmap.md)：未来 toolkit 功能的路线图。尚未实现。

## 策略

- 提议、路线图和计划文档仅描述可能的未来方向。
- 不要将规划文档视为当前的公共契约或实现文档。
- 此处描述的工具、命令、字段或错误码不保证在当前版本中存在。
- 如果规划内容与 `docs/reference/`、`src/` 或 `tests/` 冲突，以参考文档和源代码为准。