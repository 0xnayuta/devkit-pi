---
status: current
audience: all
last_verified: 2026-05-18
language: chinese
---

# Agent Workflow Guide · devkit-pi

本文档给出 devkit-pi 的**轻量工作流方法**。它是实践指南，不是强约束 runtime 框架。

## 一、适用范围

适用于日常使用 devkit-pi 的以下能力：

- subagents
- web 研究（`web_search`、`fetch_content`）
- 文档转换（`convert_content`）
- LSP（`lsp`）
- 开发者命令（`/toolkit`）

本文档不引入 workflow phase tracking、hard gate 或强制改写最终回复。

## 二、devkit-pi 的工作流原则

1. 主代理负责决策，subagent 负责局部调查/审查。
2. 默认 readonly-first，尤其是 reviewer 类任务。
3. 小任务可直接执行，但要诚实说明验证状态。
4. 大任务先计划，再分步执行。
5. Debug 按“复现 → 定位 → 最小修复 → 验证”进行。
6. 尽量分离 implementation 与 review。
7. 大输出放到工具链/subagent，避免污染主上下文。

## 三、轻量任务流程

推荐步骤：

1. 澄清目标和边界。
2. 快速读取相关代码。
3. 最小改动。
4. 运行最相关的验证命令。
5. 汇总修改与验证结果。

## 四、复杂任务流程

推荐步骤：

1. 明确范围与非目标。
2. 读取源码/文档/测试。
3. 拆 2–5 步计划。
4. 小步执行。
5. 每个关键批次后验证。
6. 最后总结风险、后续项和未完成项。

## 五、Debug 流程

1. **Reproduce**：先确认问题能稳定复现。
2. **Observe**：收集错误信息、日志、相关文件。
3. **Narrow**：缩小到最可能模块。
4. **Fix**：做最小修复，避免顺手重构。
5. **Verify**：执行复现命令和/或测试。
6. **Document**：必要时补充说明文档。

与工具映射：

- Web tools：外部资料检索
- Convert tool：复杂文件转 Markdown
- LSP tool：symbol/definition/reference/diagnostics
- Subagents：局部探索与审查
- `/toolkit`：模块状态与诊断概览

## 六、Review 流程

推荐模式：

1. 主代理先完成小范围实现。
2. 调 readonly reviewer subagent 做聚焦审查。
3. 按严重度整理问题。
4. 主代理决定修复范围。
5. 修复后再次验证并汇总。

Review 不能替代 test/lint/typecheck/build 验证。

## 七、Verification before completion

在“完成”之前，明确写出验证状态。

示例：

```md
## Verification

- Ran: `pnpm typecheck` ✅
- Ran: `pnpm test` ✅
- Not run: `pnpm docs:check`（本轮未改文档）
```

未运行验证时：

```md
## Verification

- Not run in this session.
- Suggested next step: `pnpm typecheck && pnpm test`
```

## 八、Subagent 使用边界

- 主代理始终是唯一 orchestrator。
- 不应让 subagent 继续编排 subagent。
- 默认优先 readonly subagents。
- 最终决策权保留给主代理。

## 九、不推荐的使用方式

避免：

- 小任务过度流程化
- 没读测试/文档就大改
- 没有验证状态就宣称完成
- 把 workflow 指南当成 hard runtime gate

## 十、常见任务模板

### A. 小修复模板

1. 读取目标文件
2. 最小修改
3. 跑 1–2 个关键验证命令
4. 汇总修改与验证

### B. 功能开发模板

1. 明确边界
2. 拆 2–5 步计划
3. 小步实现
4. 小步验证
5. 汇总行为变化、风险、下一步

### C. 调试模板

1. 复现
2. 观察
3. 缩小范围
4. 修复
5. 验证
6. 文档化

## 相关文档

- [目标与范围](./goals-and-scope.md)
- [安全模型](./security-model.md)
- [配置参考](../reference/configuration.md)
- [Subagents 参考](../reference/subagents.md)
- [Toolkit 命令参考](../reference/toolkit-commands.md)
