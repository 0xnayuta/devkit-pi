---
status: current
audience: all
last_verified: 2026-05-12
language: chinese
---

# devkit-pi 文档

## 文档概览

`devkit-pi` 文档按用途组织：

- `docs/guides/`：面向理解、维护和开发流程的指南。
- `docs/reference/`：面向 public API / 配置 / 错误语义的查表型参考。
- `docs/adr/`：历史架构决策记录。
- `docs/planning/`：proposal、roadmap 和未来计划，不代表当前已实现能力。
- `docs/archive/`：历史计划和已归档内容。

当前行为应以 `src/`、`tests/` 与 `docs/reference/` 中标记为 current 的 reference 文档为准。

## 文档站

在线文档站：https://devkit-pi.wangyan.life/

npm 包：https://www.npmjs.com/package/devkit-pi

VitePress 文档站可在本地预览：

```bash
pnpm docs:dev
pnpm docs:build
pnpm docs:preview
```

## 推荐阅读路径

### 新用户

1. [架构](./guides/architecture.md)
2. [配置参考](./reference/configuration.md)
3. [Toolkit 命令参考](./reference/toolkit-commands.md)

### 想使用 Subagents

默认推荐 readonly subagents；可写自定义 subagents 仍是 experimental，`subagents.allowWrite=true` 不代表 sandbox、audit 或 rollback 保证，详情见 [Subagents 参考](./reference/subagents.md) 和 [安全模型](./guides/security-model.md)。

1. [Subagents 参考](./reference/subagents.md)
2. [Subagent 工具参考](./reference/subagent-tool.md)
3. [Agent 定义参考](./reference/agent-definition.md)
4. [结果 Schema 参考](./reference/result-schema.md)
5. [Toolkit 命令参考](./reference/toolkit-commands.md)

### 想使用 Web 工具

1. [Web 工具参考](./reference/web-tools.md)
2. [Web Providers 参考](./reference/web-providers.md)
3. [Web 错误码](./reference/web-tools-error-codes.md)
4. [配置参考](./reference/configuration.md)

### 想使用 LSP

1. [LSP 工具参考](./reference/lsp-tools.md)
2. [配置参考](./reference/configuration.md)
3. [Toolkit 命令参考](./reference/toolkit-commands.md)

### 贡献者 / 维护者

1. [架构](./guides/architecture.md)
2. [配置参考](./reference/configuration.md)
3. [ADR 索引](./adr/README.md)
4. [测试](./guides/testing.md)
5. [发布清单](./guides/release-checklist.md)

## 文档分区

### `guides/`

面向设计理解、开发流程、安全模型、测试和发布的维护文档。

当前指南：

- [目标与范围](./guides/goals-and-scope.md)：项目目标、当前包含/不包含的能力和设计边界。
- [架构](./guides/architecture.md)：当前 `src/` 结构、模块职责、注册流程和测试映射。
- [扩展 API](./guides/extension-api.md)：devkit-pi 当前使用的 pi extension API / 集成方式。
- [安全模型](./guides/security-model.md)：Subagents、Web tools、LSP 和写入能力的安全边界。
- [测试](./guides/testing.md)：测试目录结构、unit test 策略和 `docs:check` 说明。
- [发布清单](./guides/release-checklist.md)：发布前代码、文档、安全边界和包元数据检查。
- [fetch_content 增强](./guides/fetch_content-enhancement.md)：`fetch_content` 内容类型处理和安全配置增强记录。

Proposed / roadmap 指南：

- [convert_content 工具计划](../planning/add-convert_content-tool-plan.md)
- [个人 toolkit 功能路线图](../planning/personal-toolkit-feature-roadmap.md)

Proposed / roadmap 文档不代表当前已实现能力，不进入 public reference 主路径。

### `reference/`

查表型、契约型文档，记录当前 public surface、配置、工具参数、返回结构、错误语义和稳定性边界。

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
- [Toolkit 命令参考](./reference/toolkit-commands.md)

### `adr/`

架构决策记录，解释关键取舍和历史上下文。

- [ADR 索引](./adr/README.md)

ADR 记录某个时间点的设计决策，不等同于当前完整 API reference；当 ADR 与当前 reference 不一致时，以当前源码、测试和 reference 文档为准。

### `planning/`

未来计划、proposal 和 roadmap 文档。不代表当前行为。

- [Planning 索引](../planning/README.md)
- [convert_content 工具计划](../planning/add-convert_content-tool-plan.md)
- [个人 toolkit 功能路线图](../planning/personal-toolkit-feature-roadmap.md)

Proposed / roadmap 文档不代表当前已实现能力，不进入 public reference 主路径。

### `archive/`

归档的历史计划和历史方案。

- [fetch_content 增强计划](../archive/enhancement-of-fetch_content-tool-plan.md)

Archive 内容仅保留历史背景，不代表当前实现或承诺。

## 当前 Public Reference

当前 public reference 文档集中在 `docs/reference/`：

| 文档 | 用途 |
|---|---|
| [README](./reference/README.md) | Reference 目录索引、canonical source policy 和稳定性说明 |
| [configuration.md](./reference/configuration.md) | 配置文件、默认值、normalize 规则和配置边界 |
| [subagents.md](./reference/subagents.md) | Subagents 模块 public overview |
| [subagent-tool.md](./reference/subagent-tool.md) | `subagent` tool 参数、返回和失败语义 |
| [agent-definition.md](./reference/agent-definition.md) | built-in/custom agent markdown 定义格式 |
| [result-schema.md](./reference/result-schema.md) | `subagent` tool result schema 与错误码 |
| [web-tools.md](./reference/web-tools.md) | `web_search` / `fetch_content` / `get_search_content` public API |
| [web-providers.md](./reference/web-providers.md) | Web provider selection、配置和 provider 边界 |
| [web-tools-error-codes.md](./reference/web-tools-error-codes.md) | Web tools canonical error codes |
| [lsp-tools.md](./reference/lsp-tools.md) | `lsp` tool、diagnostics hook 和 LSP action 语义 |
| [toolkit-commands.md](./reference/toolkit-commands.md) | `/toolkit` command surface 与输出/失败语义 |

## Historical / Proposed 内容策略

- `docs/planning/` 是 proposed / roadmap 文档，不代表当前实现。
- `docs/archive/` 是历史内容，不代表当前实现。
- `docs/adr/` 记录历史决策，不等于当前完整 API reference。
- `proposed`、`roadmap`、`plan` 类文档只表示设计讨论或后续方向，不应被当作当前功能说明。
- 当前行为以 `src/`、`tests/` 和 `docs/reference/` 为准。
- 不要把 planning/archive/proposal/roadmap 中的命令、字段、工具或错误码写入 current public reference，除非源码和测试已经实现并验证。
