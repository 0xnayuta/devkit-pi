---
status: current
audience: maintainer
last_verified: 2026-05-11
---

# 测试策略

本文档说明 devkit-pi 当前测试组织方式。Public API 与配置契约参考 [Reference index](../reference/README.md)、[Configuration reference](../reference/configuration.md)、[Subagents reference](../reference/subagents.md)、[LSP tools reference](../reference/lsp-tools.md)、[Web tools error codes](../reference/web-tools-error-codes.md) 和 [Toolkit commands reference](../reference/toolkit-commands.md)。

## 核心测试范围

- subagents：工具注册、schema、agent 加载、递归保护、输出收集、prompt runtime
- web：provider 选择、fetch 安全限制、缓存、并发、observability、storage、renderers
- lsp：模块注册、`servers` action、privileged action gating、hook 注册/禁用/子进程隔离
- shared/config：namespace 配置 merge、路径处理、错误码、package manifest

## 测试目录

测试目录镜像 `src/modules/` 与 `src/shared/` 结构：

```text
tests/subagents/          # subagents module
tests/subagents/commands/ # doctor/list/logs formatters & checks
tests/commands/           # unified toolkit command registration
tests/web/                # web module
tests/lsp/                # lsp module
tests/shared/             # shared utilities
tests/package-manifest.test.ts
```

## 当前策略

当前主要维护 unit tests，不依赖真实 pi 子进程或真实 language server。

文档契约通过 `pnpm docs:check` 检查，覆盖 frontmatter、相对链接、内置 agent 工具列表、subagent/web 错误码和关键 reference 导航。新增或修改 public API 时，应同步更新 `docs/reference/` 并确保相关测试覆盖当前行为。

如后续需要 LSP smoke/integration tests，应使用小型 fixture project，并明确标记为可选集成测试，避免 CI 因本机未安装 language server 而失败。

## 不支持能力的回归测试

以下能力不应悄悄恢复；如需恢复必须新增 ADR：

- background/async jobs
- chain execution
- parallel execution
- intercom
- worktree
- nested subagents
- 子代理 privileged LSP actions
- 子代理 LSP hook
