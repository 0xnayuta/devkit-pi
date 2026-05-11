---
status: current
audience: all
last_verified: 2026-05-12
---

# devkit-pi Documentation

## Documentation overview

`devkit-pi` 文档按用途组织：

- `README.md` / `README.zh.md`：项目入口、模块概览和快速导航。
- `docs/guides/`：面向理解、维护和开发流程的指南。
- `docs/reference/`：面向 public API / 配置 / 错误语义的查表型参考。
- `docs/adr/`：历史架构决策记录。
- `docs/planning/`：proposal、roadmap 和未来计划，不代表当前已实现能力。
- `docs/archive/`：历史计划和已归档内容。

当前行为应以 `src/`、`tests/` 与 `docs/reference/` 中标记为 current 的 reference 文档为准。

## Local documentation site

线上文档站：https://devkit-pi.wangyan.life/

npm 包：https://www.npmjs.com/package/devkit-pi

VitePress 文档站可在本地预览：

```bash
pnpm docs:dev
pnpm docs:build
pnpm docs:preview
```

## Recommended reading path

### 新用户

1. [README.md](../README.md) / [README.zh.md](../README.zh.md)
2. [Architecture](./guides/architecture.md)
3. [Configuration reference](./reference/configuration.md)
4. [Toolkit commands reference](./reference/toolkit-commands.md)

### 想使用 Subagents

默认推荐 readonly subagents；可写自定义 subagents 仍是 experimental，`subagents.allowWrite=true` 不代表 sandbox、audit 或 rollback 保证，详情见 [Subagents reference](./reference/subagents.md) 和 [Security model](./guides/security-model.md)。

1. [Subagents reference](./reference/subagents.md)
2. [Subagent tool reference](./reference/subagent-tool.md)
3. [Agent definition reference](./reference/agent-definition.md)
4. [Result schema reference](./reference/result-schema.md)
5. [Toolkit commands reference](./reference/toolkit-commands.md)

### 想使用 Web tools

1. [Web tools reference](./reference/web-tools.md)
2. [Web providers reference](./reference/web-providers.md)
3. [Web tools error codes](./reference/web-tools-error-codes.md)
4. [Configuration reference](./reference/configuration.md)

### 想使用 LSP

1. [LSP tools reference](./reference/lsp-tools.md)
2. [Configuration reference](./reference/configuration.md)
3. [Toolkit commands reference](./reference/toolkit-commands.md)

### 贡献者 / 维护者

1. [Architecture](./guides/architecture.md)
2. [Configuration reference](./reference/configuration.md)
3. [ADR index](./adr/README.md)
4. [Testing](./guides/testing.md)
5. [Release checklist](./guides/release-checklist.md)

## Documentation sections

### `guides/`

面向设计理解、开发流程、安全模型、测试和发布的维护文档。

Current guides：

- [Goals and scope](./guides/goals-and-scope.md)：项目目标、当前包含/不包含的能力和设计边界。
- [Architecture](./guides/architecture.md)：当前 `src/` 结构、模块职责、注册流程和测试映射。
- [Extension API](./guides/extension-api.md)：devkit-pi 当前使用的 pi extension API / 集成方式。
- [Security model](./guides/security-model.md)：Subagents、Web tools、LSP 和写入能力的安全边界。
- [Testing](./guides/testing.md)：测试目录结构、unit test 策略和 `docs:check` 说明。
- [Release checklist](./guides/release-checklist.md)：发布前代码、文档、安全边界和包元数据检查。
- [fetch_content enhancement](./guides/fetch_content-enhancement.md)：`fetch_content` 内容类型处理和安全配置增强记录。

Proposed / roadmap guides：

- [Add convert_content tool plan](./planning/add-convert_content-tool-plan.md)
- [Personal toolkit feature roadmap](./planning/personal-toolkit-feature-roadmap.md)

Proposed / roadmap 文档不代表当前已实现能力，不进入 public reference 主路径。

### `reference/`

查表型、契约型文档，记录当前 public surface、配置、工具参数、返回结构、错误语义和稳定性边界。

- [Reference index](./reference/README.md)
- [Configuration reference](./reference/configuration.md)
- [Subagents reference](./reference/subagents.md)
- [Subagent tool reference](./reference/subagent-tool.md)
- [Agent definition reference](./reference/agent-definition.md)
- [Result schema reference](./reference/result-schema.md)
- [Web tools reference](./reference/web-tools.md)
- [Web providers reference](./reference/web-providers.md)
- [Web tools error codes](./reference/web-tools-error-codes.md)
- [LSP tools reference](./reference/lsp-tools.md)
- [Toolkit commands reference](./reference/toolkit-commands.md)

### `adr/`

架构决策记录，解释关键取舍和历史上下文。

- [ADR index](./adr/README.md)

ADR 记录某个时间点的设计决策，不等同于当前完整 API reference；当 ADR 与当前 reference 不一致时，以当前源码、测试和 reference 文档为准。

### `planning/`

Future plans, proposals, and roadmap documents. These do not represent current behavior.

- [Planning index](./planning/README.md)
- [Add convert_content tool plan](./planning/add-convert_content-tool-plan.md)
- [Personal toolkit feature roadmap](./planning/personal-toolkit-feature-roadmap.md)

Proposed / roadmap 文档不代表当前已实现能力，不进入 public reference 主路径。

### `archive/`

归档的历史计划和历史方案。

- [enhancement-of-fetch_content-tool-plan](./archive/enhancement-of-fetch_content-tool-plan.md)

Archive 内容仅保留历史背景，不代表当前实现或承诺。

## Current public reference

当前 public reference 文档集中在 `docs/reference/`：

| Document | Purpose |
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

## Historical / proposed content policy

- `docs/planning/` 是 proposed / roadmap 文档，不代表当前实现。
- `docs/archive/` 是历史内容，不代表当前实现。
- `docs/adr/` 记录历史决策，不等于当前完整 API reference。
- `proposed`、`roadmap`、`plan` 类文档只表示设计讨论或后续方向，不应被当作当前功能说明。
- 当前行为以 `src/`、`tests/` 和 `docs/reference/` 为准。
- 不要把 planning/archive/proposal/roadmap 中的命令、字段、工具或错误码写入 current public reference，除非源码和测试已经实现并验证。
