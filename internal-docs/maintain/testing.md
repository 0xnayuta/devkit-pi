---
status: current
audience: maintainer
last_verified: 2026-05-19
language: chinese
---

# 测试策略

本文档说明 devkit-pi 当前测试组织方式。Public API 与配置契约参考 [Reference index](../../docs/reference/README.md)、[Configuration reference](../../docs/reference/configuration.md)、[Subagents reference](../../docs/reference/subagents.md)、[LSP tools reference](../../docs/reference/lsp-tools.md)、[Web tools error codes](../../docs/reference/web-tools-error-codes.md) 和 [Toolkit commands reference](../../docs/reference/toolkit-commands.md)。

## 核心测试范围

- subagents：工具注册、schema、agent 加载、递归保护、输出收集、prompt runtime
- web：provider 选择、fetch 安全限制、缓存、并发、connection pool、observability、storage、renderers
- lsp：模块注册、`servers` action、privileged action gating、hook 注册/禁用/子进程隔离
- convert：`convert_content` schema、注册、本地/URL 安全边界、provider、renderers
- guards：git context notice、first write notice、verification status notice、工具/命令分类、子进程隔离
- shared：外部命令 runner、logger 等跨模块 helper
- config：namespace 配置 merge、错误码、package manifest

## 测试目录

测试目录镜像 `src/modules/` 结构。这是 devkit-pi 架构一致性策略的一部分：相似模块和功能区域应使用相似的源码 / 测试 / 文档布局，而不是保留 legacy 或一次性布局。

```text
tests/subagents/          # subagents module: agents, runtime, config, registration, commands
tests/commands/           # unified toolkit command registration
tests/web/                # web module
tests/lsp/                # lsp module
tests/convert/            # convert_content module
tests/guards/             # lightweight session guards
tests/shared/             # shared helpers, e.g. external command runner
tests/package-manifest.test.ts
```

## 当前策略

当前主要维护 unit tests，不依赖真实 pi 子进程或真实 language server。

新增或重构相似模块、工具、提供者、命令或功能区域时，优先使用一致的测试模式：匹配的目录路径、可比的 fixtures、相似命名，以及对 config defaults、normalize 行为、schema validation、registration、permissions、errors 和文档更新的等价覆盖。

文档契约通过 `pnpm docs:check` 检查，覆盖 frontmatter、相对链接、内置 agent 工具列表、subagent/web 错误码、关键 reference 导航和关键配置默认值漂移。新增或修改 public API 或默认配置时，应同步更新 `docs/reference/` 并确保相关测试覆盖当前行为。

## Logger / stdout-stderr 测试约定

- 维护者日志统一走 `src/shared/logger.ts`，优先使用可注入 sink（`createMemoryLoggerSink`）断言事件。
- 单元测试中不依赖真实 `console.*` 作为断言主路径；需要 fallback 行为时，优先注入 writer/sink 而不是污染全局 stdout/stderr。
- 用户可见输出（例如 report viewer 在无 UI 且非 JSON protocol 模式下的 `stdout` fallback）可保留并单独断言，不与维护者日志混用。
- JSON protocol / degraded UI 场景应断言“不输出 raw 文本到 stdout”，并通过 logger 事件验证维护者提示。

如后续需要 LSP smoke/integration tests，应使用小型 fixture project，并明确标记为可选集成测试，避免 CI 因本机未安装 language server 而失败。

## Coverage 可见性（Node 原生 V8）

项目已接入轻量 coverage 可见性链路（不引入 c8/nyc/istanbul）：

- 本地生成：`pnpm test:coverage`
- 原始产物：`.coverage/v8/*.json`
- 汇总产物：`.coverage/summary.json`
- 热点报告：`.coverage/hotspots.md`

说明：

- 当前阶段为“可见性基线”，不设置覆盖率阈值门禁；
- PR 不因“coverage 数值低”失败，但测试失败或 coverage 脚本失败仍会导致 CI 失败；
- 指标基于 Node 原生 V8 range，属于趋势/热点观察的近似指标，不等价于 Istanbul statement/branch coverage。

建议在提交涉及高风险模块变更（`web/network/security`、`convert/security`、`subagent/execution`、`shared/external-command`）前，至少本地运行一次 `pnpm test:coverage` 并查看 `hotspots.md` 是否出现异常回退。

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
