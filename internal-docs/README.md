---
status: current
audience: maintainer
last_verified: 2026-05-19
language: chinese
---

# internal-docs

本目录是 devkit-pi 的内部维护知识库，不属于公开 VitePress 导航。

- 公开用户文档在 `docs/`。
- 对外行为与契约以 `docs/reference/`、源码与测试为准。

## 分区与职责

- [maintain/](./maintain/)：维护基线与操作手册（架构、测试、发布、扩展集成）。
- [adr/](./adr/)：架构决策记录（为什么这样设计）。
- [planning/](./planning/)：提案与路线图（未来要做什么、如何分阶段推进）。
- [issues/](./issues/)：单问题闭环记录（改了什么、证据是什么）。
- [audit/](./audit/)：阶段性健康审计（风险盘点、状态汇总、结论）。
- [archive/](./archive/)：历史归档（已过时或被替代内容）。

## 维护规则（避免重复）

1. **单一事实源**
   - `audit/` 负责风险总览；`issues/` 负责单项执行明细。
   - 同一问题状态在 `audit/` 与 `issues/` 必须一致，变更需同轮同步。

2. **按职责写，不双写**
   - `planning/` 写提案，不复制已落地实现细节。
   - `issues/` 写执行与证据，不重写完整背景。
   - `audit/` 写汇总与判断，不展开实现流水。
   - `adr/` 固化决策，不承载执行过程。

3. **归档约束**
   - `archive/` 仅保留历史参考，不作为当前行为依据。
   - 被替代文档应标注 superseded/archived 语义并指向新文档。

4. **与外部文档边界**
   - 外部文档仅分：`docs/guides/`（how-to）与 `docs/reference/`（规范契约）。
   - 内部文档不直接替代 public reference；用户可见行为变更必须同步到 `docs/reference/`。

5. **链接策略**
   - 不建议在公开站内直接导航到 `internal-docs/`。
   - 公开文档如需说明内部背景，使用纯文本路径提示即可。
