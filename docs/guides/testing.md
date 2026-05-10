---
status: current
audience: maintainer
last_verified: 2026-05-10
---

# 测试策略

## 核心测试范围

- subagents：工具注册、schema、agent 加载、递归保护、输出收集、prompt runtime
- web：provider 选择、fetch 安全限制、缓存、并发、observability、storage、renderers
- lsp：模块注册、`servers` action、privileged action gating、hook 不注册
- shared/config：namespace 配置 merge、路径处理、错误码、package manifest

## 测试目录

测试目录镜像模块结构：

```text
tests/subagents/          # subagents module
tests/subagents/commands/ # subagent developer commands
tests/web/                # web module
tests/lsp/                # lsp module
tests/shared/             # shared utilities
tests/package-manifest.test.ts
```

## 当前策略

当前主要维护 unit tests，不依赖真实 pi 子进程或真实 language server。

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
- Phase 3 中的 LSP hook
