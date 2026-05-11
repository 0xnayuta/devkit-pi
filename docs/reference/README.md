---
status: current
audience: all
last_verified: 2026-05-11
---

# Reference Index

## Reference overview

`docs/reference/` 是 devkit-pi 的查表型、契约型文档目录。这里记录当前已实现的 public surface、配置、工具参数、返回结构、错误/失败语义和稳定性边界。

Reference 文档不是教程，也不记录 roadmap。若 proposal、ADR 或 archive 与 reference 不一致，以当前 `src/`、`tests/` 和本目录 reference 为准。

## Related guides

- [Architecture](../guides/architecture.md)：当前源码结构与模块职责。
- [Security model](../guides/security-model.md)：安全边界与风险说明。
- [Testing](../guides/testing.md)：测试组织与文档检查。
- [Release checklist](../guides/release-checklist.md)：发布前同步检查。

## Core references

### Configuration

`subagents.allowWrite` is experimental and not a stable write-capability contract; it does not provide a complete sandbox, audit trail, or rollback guarantee. Details are in [configuration.md](./configuration.md), [subagents.md](./subagents.md), and [Security model](../guides/security-model.md).

| Document | 适合什么时候读 | Canonical source |
|---|---|---|
| [configuration.md](./configuration.md) | 配置 devkit-pi、核对默认值和 normalize 规则 | `src/config/load-config.ts`, `src/shared/types.ts` |

### Subagents

| Document | 适合什么时候读 | Canonical source |
|---|---|---|
| [subagents.md](./subagents.md) | 理解 Subagents 模块 public surface、执行模型和边界 | `src/modules/subagents/`, `agents/`, `src/shared/delegation-policy.ts` |
| [subagent-tool.md](./subagent-tool.md) | 调用 `subagent` tool、查看输入/输出/失败语义 | `src/modules/subagents/register.ts`, `schemas.ts`, `executor.ts` |
| [agent-definition.md](./agent-definition.md) | 编写 built-in/user/project agent markdown 定义 | `src/modules/subagents/agents.ts`, `frontmatter.ts`, `agents/*.md` |
| [result-schema.md](./result-schema.md) | 程序化理解 `subagent` tool result 与错误码 | `src/modules/subagents/executor.ts`, `collect-output.ts`, `src/shared/types.ts` |

### Web tools

| Document | 适合什么时候读 | Canonical source |
|---|---|---|
| [web-tools.md](./web-tools.md) | 调用 `web_search`、`fetch_content`、`get_search_content` | `src/modules/web/register.ts`, `schemas.ts`, `types.ts`, `search.ts`, `fetch.ts`, `storage.ts` |
| [web-providers.md](./web-providers.md) | 配置/选择 ddgs、brave、tavily、serper、openserp、searxng | `src/modules/web/providers/`, `src/modules/web/providers/select-provider.ts` |
| [web-tools-error-codes.md](./web-tools-error-codes.md) | 判断 Web tool structured errors 和 reserved/deprecated code 边界 | `src/modules/web/errors.ts`, `src/modules/web/types.ts` |

### LSP tools

| Document | 适合什么时候读 | Canonical source |
|---|---|---|
| [lsp-tools.md](./lsp-tools.md) | 调用 `lsp` tool、理解 diagnostics hook 和 action 权限 | `src/modules/lsp/register.ts`, `tool.ts`, `schemas.ts`, `hook.ts` |

### Toolkit commands

| Document | 适合什么时候读 | Canonical source |
|---|---|---|
| [toolkit-commands.md](./toolkit-commands.md) | 使用 `/toolkit` 诊断、查看 modules/agents/logs/LSP 状态 | `src/modules/commands/register.ts`, `src/modules/subagents/commands/` |

### Schemas and contracts

| Document | 适合什么时候读 | Canonical source |
|---|---|---|
| [result-schema.md](./result-schema.md) | 查看 `subagent` tool result 的结构化字段 | `src/shared/types.ts`, `src/modules/subagents/executor.ts` |
| [web-tools-error-codes.md](./web-tools-error-codes.md) | 查看 Web canonical error code、active/reserved/deprecated 状态 | `src/modules/web/errors.ts` |
| [configuration.md](./configuration.md) | 查看配置 schema-like defaults 和 normalize 行为 | `src/config/load-config.ts` |

## Canonical source policy

- [`configuration.md`](./configuration.md) 以 `src/config/load-config.ts` 为准。
- [`web-tools-error-codes.md`](./web-tools-error-codes.md) 以 `src/modules/web/errors.ts` 中的 `WEB_ERROR_CODES` 为准。
- [`web-tools.md`](./web-tools.md) 以 `src/modules/web/register.ts`、`handlers.ts`、`schemas.ts`、`types.ts` 为准。
- [`web-providers.md`](./web-providers.md) 以 `src/modules/web/providers/*`、`registry.ts`、`select-provider.ts` 为准。
- [`lsp-tools.md`](./lsp-tools.md) 以 `src/modules/lsp/register.ts`、`tool.ts`、`schemas.ts` 为准。
- [`toolkit-commands.md`](./toolkit-commands.md) 以 `src/modules/commands/register.ts` 和各模块 `register` / `commands` 实现为准。
- [`subagents.md`](./subagents.md)、[`subagent-tool.md`](./subagent-tool.md)、[`agent-definition.md`](./agent-definition.md)、[`result-schema.md`](./result-schema.md) 以 `src/modules/subagents/`、`agents/`、`src/shared/delegation-policy.ts` 和 `src/shared/types.ts` 为准。

## Stability policy

`subagents.allowWrite` 不属于稳定写入能力契约；当前只作为 experimental / advanced / unsafe 配置入口记录在 [configuration.md](./configuration.md) 与 [subagents.md](./subagents.md)。

相对稳定：

- Public tool names：`subagent`、`web_search`、`fetch_content`、`get_search_content`、`lsp`
- Public command root/subcommands：`/toolkit`、`doctor`、`modules`、`logs`、`agents`、`lsp`、`activity`、`help`
- 文档中明确列出的 input schema 字段
- 文档中明确列出的 output contract / structured error code
- 当前 canonical error code 字符串值

可能变化：

- Internal helpers、formatters、manager classes 和 provider parser 实现细节
- Human-readable logs、console output、TUI rendering 和 notification 文案
- Agent prompt wording、delegation policy examples 和 markdown 输出模板
- Session file 布局、streaming display item 细节、sanitize/truncate 具体规则
- Reserved error codes 的启用时机和 proposed behavior

Reserved error codes / proposed behavior 不代表当前会直接返回或执行。若需要把 proposed 能力变成 public reference，应先在源码和测试中实现，再更新 reference。
