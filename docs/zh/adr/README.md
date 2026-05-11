---
status: current
audience: maintainer
last_verified: 2026-05-12
---

# Architecture Decision Records

本目录记录重要设计决策，帮助后续维护者理解为什么这样简化。

ADR 记录某个时间点的决策背景，不等同于当前 API reference；当 ADR 与当前实现不一致时，以 `docs/reference/`、`src/` 和 `tests/` 为准。

| ADR | 标题 |
|-----|------|
| [0001](./0001-lightweight-foreground-subagents.md) | 采用轻量 foreground subagent 设计 |
| [0002](./0002-mvp-boundary-decisions.md) | MVP 边界决策 |
| [0003](./0003-autonomous-subagent-triggering.md) | 自主触发子代理的改进方案 |
| [0004](./0004-bundled-readonly-web-tools.md) | 内置极简 readonly web tools |
| [0005](./0005-evolve-into-devkit-pi.md) | 从 pi-subagents 演进为 devkit-pi |

命名格式：

```text
0001-short-title.md
0002-short-title.md
```
