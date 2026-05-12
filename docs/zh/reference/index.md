---
status: current
audience: all
last_verified: 2026-05-12
---

# 参考文档

`docs/reference/` 是 devkit-pi 的公共契约 / API reference。它记录当前已实现的公共接口、配置、工具参数、结果结构、错误语义和稳定性边界。

完整的 reference 目录策略见 [Reference README](./README.md)。

## 核心参考

- [配置](./configuration.md)
- [Subagents](./subagents.md)
- [Subagent 工具](./subagent-tool.md)
- [Agent 定义](./agent-definition.md)
- [Result schema](./result-schema.md)
- [Web 工具](./web-tools.md)
- [Web providers](./web-providers.md)
- [Web 工具错误码](./web-tools-error-codes.md)
- [LSP 工具](./lsp-tools.md)
- [Toolkit 命令](./toolkit-commands.md)

提案、roadmap、归档和 ADR 文档不会包含在此 reference 入口中。如果非 reference 材料与当前 reference 文档、源码或测试不一致，以 `docs/reference/`、`src/` 和 `tests/` 为准。

Reference 契约应在相似模块、工具、提供者、命令、配置 namespace、测试和文档页面之间保持结构一致。当 legacy layout 与当前模块化架构冲突时，不再保留旧布局。
