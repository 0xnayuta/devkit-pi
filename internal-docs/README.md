---
status: current
audience: maintainer
last_verified: 2026-05-13
language: chinese
---

# internal-docs

本目录保存 devkit-pi 的内部维护资料，不属于公开 VitePress 网站导航。

公开用户文档位于 `docs/`；当前 public API / 配置 / 工具契约以 `docs/reference/`、源码和测试为准。

## 分区

- [维护文档](./maintain/)：架构、扩展 API、测试策略、发布清单。
- [ADR](./adr/)：历史架构决策记录。
- [规划](./planning/)：未来计划、proposal 和 roadmap。
- [归档](./archive/)：历史方案和废弃计划。
- [问题日志](./issues/)：已记录的问题和修复背景。
- [审计](./audit/)：阶段性代码质量、安全、测试和工程化审计报告。

## 内容策略

- `internal-docs/` 可记录历史、提案和维护过程，不直接代表当前 public behavior。
- 如果内部文档中的计划要成为用户可见能力，必须先同步源码、测试和 `docs/reference/`。
- 不建议从公开 `docs/` 站内链接到本目录；公开文档可用纯文本路径说明内部背景资料位置。
