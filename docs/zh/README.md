---
status: current
audience: all
last_verified: 2026-05-13
language: chinese
---

# devkit-pi 文档

`docs/` 保存公开 VitePress 文档站内容。这里刻意只保留面向用户的指南和 API/reference 文档。

架构说明、测试策略、发布清单、ADR、规划、问题日志、归档和审计等维护者资料已分流到仓库根目录的 `internal-docs/`，不进入公开网站主导航。

当前行为应以 `src/`、`tests/` 与 `docs/reference/` 中标记为 current 的 reference 文档为准。

## 文档站

在线文档站：https://devkit-pi.wangyan.life/

npm 包：https://www.npmjs.com/package/devkit-pi

本地预览命令：

```bash
pnpm docs:dev
pnpm docs:build
pnpm docs:preview
```

## 公开文档分区

### 指南

- [目标与范围](./guides/goals-and-scope.md)：项目目标、当前包含/不包含的能力和设计边界。
- [Agent Workflow Guide](./guides/agent-workflow.md)：轻量 workflow 方法，覆盖 planning、implementation、debug、review 与 verification 说明。
- [安全模型](./guides/security-model.md)：Subagents、Web tools、LSP、convert 和写入能力的安全边界。

### 参考

- [参考索引](./reference/README.md)
- [配置参考](./reference/configuration.md)
- [Subagents 参考](./reference/subagents.md)
- [Subagent 工具参考](./reference/subagent-tool.md)
- [Agent 定义参考](./reference/agent-definition.md)
- [结果 Schema 参考](./reference/result-schema.md)
- [Web 工具参考](./reference/web-tools.md)
- [Web Providers 参考](./reference/web-providers.md)
- [Web 错误码](./reference/web-tools-error-codes.md)
- [LSP 工具参考](./reference/lsp-tools.md)
- [Convert 工具参考](./reference/convert-tools.md)
- [Toolkit 命令参考](./reference/toolkit-commands.md)

## 推荐阅读路径

### 新用户

1. [目标与范围](./guides/goals-and-scope.md)
2. [Agent Workflow Guide](./guides/agent-workflow.md)
3. [安全模型](./guides/security-model.md)
4. [配置参考](./reference/configuration.md)
5. [Toolkit 命令参考](./reference/toolkit-commands.md)

### 想使用 Subagents

默认推荐 readonly subagents。可写自定义 subagents 仍是 experimental，`subagents.allowWrite=true` 不代表 sandbox、audit 或 rollback 保证。

1. [Subagents 参考](./reference/subagents.md)
2. [Subagent 工具参考](./reference/subagent-tool.md)
3. [Agent 定义参考](./reference/agent-definition.md)
4. [结果 Schema 参考](./reference/result-schema.md)

### 想使用 Web / LSP / Convert 工具

- [Web 工具参考](./reference/web-tools.md)
- [LSP 工具参考](./reference/lsp-tools.md)
- [Convert 工具参考](./reference/convert-tools.md)

## 内容策略

- `docs/` 是公开网站文档。
- `internal-docs/` 是内部维护知识库。
- planning、archive、ADR、issue、audit 和 release-process 文档不进入公开网站导航。
- proposed/roadmap/archive 内容不代表当前行为，除非源码、测试和 current reference 文档已经同步实现并验证。
