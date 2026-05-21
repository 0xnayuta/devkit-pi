---
status: current
audience: maintainer
last_verified: 2026-05-18
language: chinese
---

# 架构决策记录

ADR 是历史决策记录。它们解释过去设计选择的背景和取舍，但不等同于当前 API reference。

如果 ADR 与当前行为或当前 reference 文档不一致，以 `docs/reference/`、`src/` 和 `tests/` 为准。

| ADR | 标题 |
|-----|------|
| [0000](./0000-adr-template.md) | ADR 模板（新建 ADR 时复制并替换） |
| [0001](./0001-lightweight-foreground-subagents.md) | 采用轻量 foreground subagent 设计 |
| [0002](./0002-mvp-boundary-decisions.md) | MVP 边界决策 |
| [0003](./0003-autonomous-subagent-triggering.md) | 自主触发子代理的改进方案 |
| [0004](./0004-bundled-readonly-web-tools.md) | 内置极简 readonly web tools |
| [0005](./0005-evolve-into-devkit-pi.md) | 从 pi-subagents 演进为 devkit-pi |
| [0006](./0006-architecture-consistency-over-legacy-layout.md) | 架构一致性优先于 legacy layout |
| [0007](./0007-lsp-load-sync-no-go.md) | LSP load/sync 实现迁移 NO-GO（当前阶段） |
| [0008](./0008-align-with-pi-native-extension-paradigm.md) | devkit-pi 向 Pi 官方/原生扩展范式收敛 |
