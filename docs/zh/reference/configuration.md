---
status: current
audience: user
last_verified: 2026-05-20
language: chinese
---

# 配置参考

本文档以 `src/config/load-config.ts` 为 canonical source，辅助参考 `src/shared/types.ts`、`src/modules/web/providers/*`、`src/modules/lsp/schemas.ts` 与相关 tests。若 README 或旧 docs 与本文档不一致，以 `src/config/load-config.ts` 的默认值和 normalize 逻辑为准。

## 配置文件位置

默认配置文件：

```text
~/.pi/agent/extensions/devkit-pi/config.json
```

devkit-pi 使用 namespace 化配置，不支持旧的扁平配置字段。配置文件缺失或读取失败时，使用默认配置 `{}` 与 `DEFAULT_CONFIG` merge 后的结果。

配置遵循架构一致性策略：相似模块使用 namespace 化配置对象、对齐的 `enabled` 开关、默认值 / normalize 行为，以及匹配的源码 / 测试 / 文档覆盖。当 legacy flat fields 与该结构冲突时，不再保留。

## 完整默认配置示例

对应源码：`src/config/load-config.ts` 中的 `DEFAULT_CONFIG`、`DEFAULT_SUBAGENTS_CONFIG`、`DEFAULT_WEB_CONFIG`、`DEFAULT_CONVERT_CONTENT_CONFIG`、`DEFAULT_GUARDS_CONFIG` 和 `DEFAULT_SUBAGENT_LSP_ACTIONS`。

```json
{
  "enabled": true,
  "subagents": {
    "enabled": true,
    "maxDepth": 1,
    "timeoutMs": 900000,
    "idleTimeoutMs": 180000,
    "allowWrite": false,
    "allowLspTools": true,
    "allowedLspActions": [
      "definition",
      "references",
      "hover",
      "signature",
      "symbols",
      "diagnostics",
      "workspace-diagnostics",
      "servers"
    ],
    "injectDelegationPolicy": true,
    "retry": {
      "enabled": true,
      "maxAttempts": 2
    }
  },
  "web": {
    "enabled": true,
    "provider": "ddgs",
    "providerPriority": ["tavily", "serper", "brave", "openserp", "searxng", "ddgs"],
    "timeoutMs": 10000,
    "maxResponseBytes": 1048576,
    "maxContentChars": 30000,
    "maxResults": 5,
    "enableJinaFallback": false,
    "jinaTimeoutMs": 8000,
    "maxStoredResults": 100,
    "maxStoredContentChars": 200000,
    "allowPrivateNetwork": false,
    "jinaTriggers": ["short-html", "js-heavy-html"],
    "debug": false,
    "cache": {
      "enabled": false,
      "maxEntries": 50,
      "ttlMs": 300000
    },
    "concurrency": {
      "maxConcurrent": 3,
      "maxQueueSize": 10
    },
    "connectionPool": {
      "maxSockets": 10,
      "maxFreeSockets": 5,
      "timeout": 60000
    },
    "openserp": {
      "enabled": false,
      "baseUrl": "https://api.openserp.com/search",
      "apiKeyEnv": "OPENSERP_API_KEY"
    },
    "searxng": {
      "enabled": false,
      "baseUrl": "",
      "defaultEngine": "google"
    },
    "brave": {
      "enabled": false,
      "baseUrl": "https://api.search.brave.com/res/v1/web/search",
      "apiKeyEnv": "BRAVE_SEARCH_API_KEY"
    },
    "tavily": {
      "enabled": false,
      "baseUrl": "https://api.tavily.com/search",
      "apiKeyEnv": "TAVILY_API_KEY"
    },
    "serper": {
      "enabled": false,
      "baseUrl": "https://google.serper.dev/search",
      "apiKeyEnv": "SERPER_API_KEY"
    }
  },
  "convertContent": {
    "enabled": true,
    "provider": "markitdown",
    "command": "markitdown",
    "timeoutMs": 30000,
    "maxResponseBytes": 10485760,
    "maxContentChars": 50000,
    "allowPrivateNetwork": false
  },
  "lsp": {
    "enabled": true,
    "tool": {
      "enabled": true,
      "allowMutatingActions": false
    },
    "hook": {
      "enabled": true,
      "mode": "agent_end"
    }
  },
  "commands": {
    "enabled": true
  },
  "guards": {
    "enabled": true,
    "gitContextNotice": true,
    "firstWriteReminder": true,
    "verificationReminder": true
  }
}
```

所有字段都是可选字段；未配置或类型不符合 normalize 规则时会回退到默认值。

## Normalize 规则摘要

对应源码：`src/config/load-config.ts`。

| 规则 | 适用字段 | 行为 |
|---|---|---|
| `booleanValue` | boolean 字段 | 只有 boolean 生效，否则使用默认值 |
| `positiveInteger` | 超时、大小、数量、队列等正整数 | 必须是 `> 0` 的 integer，否则使用默认值 |
| `nonNegativeInteger` | `subagents.maxDepth` | 必须是 `>= 0` 的 integer，否则使用默认值 |
| `normalizeProvider` | `web.provider` | 只接受 `auto`、`brave`、`ddgs`、`openserp`、`searxng`、`tavily`、`serper` |
| `normalizeProviderPriority` | `web.providerPriority` | 过滤非法 provider，去重；空数组或非法数组回退默认值 |
| `normalizeDebugLevel` | `web.debug` | 接受 `false`、`minimal`、`verbose`；`true` 会变为 `minimal` |
| `normalizeJinaTriggers` | `web.jinaTriggers` | 接受非空 string 数组并去重；非数组回退默认值；空数组可保留为空 |
| `normalizeLspReadonlyActions` | `subagents.allowedLspActions` | 只保留 readonly-safe LSP actions 并去重 |
| `normalizeLspHookMode` | `lsp.hook.mode` | 只接受 `agent_end`、`edit_write`、`disabled` |
| `nonEmptyString` | 外部命令 / provider URL / 环境变量名 | 去除首尾空白后非空 string 生效，否则使用默认值 |

## 顶层配置

对应源码：`DEFAULT_CONFIG`、`mergeConfig()`。

| Key | 类型 | 默认值 | 必填 | 作用 | 相关源码 |
|---|---|---:|---|---|---|
| `enabled` | boolean | `true` | 否 | 是否启用整个 devkit-pi 扩展；为 `false` 时主入口直接返回 | `src/index.ts`, `src/config/load-config.ts` |
| `subagents` | object | 见下方 | 否 | subagent 工具、内置 agents、delegation policy、子代理 LSP 暴露 | `src/modules/subagents/*` |
| `web` | object | 见下方 | 否 | `web_search` / `fetch_content` / `get_search_content` | `src/modules/web/*` |
| `lsp` | object | 见下方 | 否 | `lsp` tool 与自动 diagnostics hook | `src/modules/lsp/*` |
| `convertContent` | object | 见下方 | 否 | `convert_content` 文档转换工具配置。本地 `path` 和远程 `url` 转换在安全来源处理后使用 MarkItDown provider | `src/modules/convert/*` |
| `commands` | object | 见下方 | 否 | 统一 `/toolkit` developer command | `src/modules/commands/register.ts` |
| `guards` | object | 见下方 | 否 | 轻量 user-visible session notices；只做 soft reminders，不做 hard gates | `src/modules/guards/*` |

示例：关闭整个扩展。

```json
{
  "enabled": false
}
```

## Subagents 配置

Public overview、tool API、agent definition 与 result schema 见 [`subagents.md`](./subagents.md)、[`subagent-tool.md`](./subagent-tool.md)、[`agent-definition.md`](./agent-definition.md)、[`result-schema.md`](./result-schema.md)。

对应源码：`DEFAULT_SUBAGENTS_CONFIG`、`normalizeSubagentsConfig()`、`src/modules/subagents/register.ts`、`src/modules/subagents/executor.ts`。

| Key | 类型 | 默认值 | 必填 | 作用 | 相关源码 |
|---|---|---:|---|---|---|
| `subagents.enabled` | boolean | `true` | 否 | 是否注册 `subagent` tool | `src/modules/subagents/register.ts` |
| `subagents.maxDepth` | number | `1` | 否 | 子代理最大深度；默认禁止 nested subagents。接受非负整数 | `src/shared/types.ts`, `src/modules/subagents/register.ts` |
| `subagents.timeoutMs` | number | `900000` | 否 | 单次 child execution 的最大总运行时长（hard cap），从子进程启动时开始计时，不会因子代理活动而重置 | `src/modules/subagents/executor.ts` |
| `subagents.idleTimeoutMs` | number | `180000` | 否 | 子代理自最后一次有效结构化活动后的最大空闲时间，单位 ms；普通 stdout 文本不会重置该计时器 | `src/modules/subagents/executor.ts`, `src/modules/subagents/collect-output.ts` |
| `subagents.allowWrite` | boolean | `false` | 否 | 实验性/高级/不安全开关。放宽非 readonly 自定义 agent 的工具过滤策略；不代表完整权限沙箱、审计日志、自动回滚或稳定写入能力契约 | `src/config/load-config.ts`, `src/modules/subagents/*` |
| `subagents.allowLspTools` | boolean | `true` | 否 | 是否允许子代理使用 readonly LSP tool；还会受 `lsp.enabled` 与 `lsp.tool.enabled` 共同限制 | `src/index.ts`, `src/modules/subagents/*` |
| `subagents.allowedLspActions` | string[] | 见下方 | 否 | 子代理可用 LSP action 白名单；非法值会被丢弃 | `src/config/load-config.ts` |
| `subagents.injectDelegationPolicy` | boolean | `true` | 否 | 是否向主代理 system prompt 注入 delegation policy 和 few-shot 示例 | `src/shared/delegation-policy.ts`, `src/modules/subagents/register.ts` |
| `subagents.retry.enabled` | boolean | `true` | 否 | 是否启用子代理重试 | `src/config/load-config.ts`, `src/modules/subagents/executor.ts` |
| `subagents.retry.maxAttempts` | number | `2` | 否 | 最大尝试次数，必须是正整数 | `src/config/load-config.ts`, `src/modules/subagents/executor.ts` |

默认 `subagents.allowedLspActions`：

```json
[
  "definition",
  "references",
  "hover",
  "signature",
  "symbols",
  "diagnostics",
  "workspace-diagnostics",
  "servers"
]
```

示例：关闭 delegation policy 注入，并禁用子代理 LSP。

```json
{
  "subagents": {
    "injectDelegationPolicy": false,
    "allowLspTools": false
  }
}
```

示例：只允许子代理使用 LSP symbols 和 diagnostics。

```json
{
  "subagents": {
    "allowedLspActions": ["symbols", "diagnostics", "servers"]
  }
}
```

### `subagents.allowWrite` 边界

可写自定义 subagents 目前属于实验性能力。默认且推荐的模式是 readonly。`subagents.allowWrite=true` 只表示放宽委派策略，不代表已经具备完整权限沙箱、审计日志、自动回滚机制或稳定的写入能力契约。仅建议在可信仓库中使用，并且必须人工 review 所有变更。

当前约束：

- 内置 agents 继续按 readonly-first 设计。
- 子代理的实际工具可用性取决于 child pi runtime、当前工具注册、执行环境和配置。
- 子代理进程不注册 `subagent`，也不注册 `/toolkit`。
- LSP privileged actions 在子代理中始终禁用。
- Web tools 可用于研究和读取信息。
- 文件写入、命令执行、修改项目等 write-like 行为没有稳定的自动回滚保证。

如需启用可写行为，应使用 Git 工作区、提交前 diff、人工 review 和测试命令兜底。后续若要正式支持 writable custom subagents，应先补齐权限策略、审计日志、回滚建议和测试覆盖。

## LSP 配置

Public API、action 输入输出、language server 行为与失败语义见 [`lsp-tools.md`](./lsp-tools.md)。

对应源码：`DEFAULT_CONFIG.lsp`、`normalizeLspConfig()`、`src/modules/lsp/register.ts`、`src/modules/lsp/tool.ts`、`src/modules/lsp/hook.ts`、`src/modules/lsp/schemas.ts`。

| Key | 类型 | 默认值 | 必填 | 作用 | 相关源码 |
|---|---|---:|---|---|---|
| `lsp.enabled` | boolean | `true` | 否 | 是否启用整个 LSP 模块 | `src/modules/lsp/register.ts` |
| `lsp.tool.enabled` | boolean | `true` | 否 | 是否注册显式 `lsp` tool | `src/modules/lsp/register.ts`, `src/modules/lsp/tool.ts` |
| `lsp.tool.allowMutatingActions` | boolean | `false` | 否 | 是否允许主代理进程调用 `rename`、`codeAction`、`restart`；子代理进程始终禁用 | `src/modules/lsp/tool.ts` |
| `lsp.hook.enabled` | boolean | `true` | 否 | 是否启用自动 diagnostics hook；只在主代理进程注册 | `src/modules/lsp/register.ts`, `src/modules/lsp/hook.ts` |
| `lsp.hook.mode` | `agent_end` / `edit_write` / `disabled` | `agent_end` | 否 | hook 触发时机。`disabled` 会使 resolved `hook.enabled=false`、`hook.mode="disabled"` | `src/config/load-config.ts`, `src/modules/lsp/hook.ts` |

`lsp` tool actions 来自 `src/modules/lsp/schemas.ts`：

```text
definition, references, hover, symbols, diagnostics, workspace-diagnostics,
signature, rename, codeAction, restart, servers
```

Readonly-safe actions（可通过 `subagents.allowedLspActions` 暴露给子代理）：

```text
definition, references, hover, signature, symbols, diagnostics, workspace-diagnostics, servers
```

Privileged actions：

```text
rename, codeAction, restart
```

示例：关闭 LSP hook，但保留显式 `lsp` tool。

```json
{
  "lsp": {
    "hook": {
      "enabled": false
    }
  }
}
```

示例：允许主代理使用 mutating actions（子代理仍禁用）。

```json
{
  "lsp": {
    "tool": {
      "allowMutatingActions": true
    }
  }
}
```

## Web 基础配置

对应源码：`DEFAULT_WEB_CONFIG`、`normalizeWebConfig()`、`src/modules/web/register.ts`、`src/modules/web/search.ts`、`src/modules/web/fetch.ts`、`src/modules/web/storage.ts`。

| Key | 类型 | 默认值 | 必填 | 作用 | 相关源码 |
|---|---|---:|---|---|---|
| `web.enabled` | boolean | `true` | 否 | 是否注册 `web_search`、`fetch_content`、`get_search_content` | `src/modules/web/register.ts` |
| `web.provider` | string | `ddgs` | 否 | 搜索 provider：`auto` / `brave` / `ddgs` / `openserp` / `searxng` / `tavily` / `serper` | `src/config/load-config.ts`, `src/modules/web/providers/select-provider.ts` |
| `web.providerPriority` | string[] | `['tavily','serper','brave','openserp','searxng','ddgs']` | 否 | `provider="auto"` 时的候选顺序。源码会按 commercial / self-host-or-open / zero-config 分层后应用该优先级 | `src/modules/web/providers/select-provider.ts` |
| `web.timeoutMs` | number | `10000` | 否 | web/provider/fetch 请求超时，单位 ms | `src/modules/web/abort.ts`, providers |
| `web.maxResponseBytes` | number | `1048576` | 否 | `fetch_content` 下载与 search provider 响应体最大字节数 | `src/modules/web/fetch.ts`, `src/modules/web/read-limited.ts` |
| `web.maxContentChars` | number | `30000` | 否 | tool 返回内容最大字符数 | `src/modules/web/fetch.ts`, `src/modules/web/storage.ts` |
| `web.maxResults` | number | `5` | 否 | 默认搜索结果数量 | `src/modules/web/search.ts` |
| `web.maxStoredResults` | number | `100` | 否 | responseId storage 最多保留结果条目数 | `src/modules/web/storage.ts`, `src/modules/web/register.ts` |
| `web.maxStoredContentChars` | number | `200000` | 否 | 单条存储内容最大字符数 | `src/modules/web/storage.ts`, `src/modules/web/register.ts` |
| `web.allowPrivateNetwork` | boolean | `false` | 否 | 是否允许 `fetch_content` 访问 localhost / private IP / `.local` / `.internal` 等私网地址 | `src/modules/web/security.ts`, `src/modules/web/fetch.ts` |
| `web.debug` | `false` / `minimal` / `verbose` | `false` | 否 | web observability 调试输出级别；配置 `true` 会 normalize 为 `minimal` | `src/modules/web/observability.ts` |

示例：使用自动 provider 选择，并提高结果数。

```json
{
  "web": {
    "provider": "auto",
    "maxResults": 8
  }
}
```

示例：允许抓取本地开发服务。

```json
{
  "web": {
    "allowPrivateNetwork": true
  }
}
```

## Web providers 配置

Provider 名称来自 `src/shared/types.ts` 的 `WebSearchProviderName` 与 `src/modules/web/providers/registry.ts`。provider selection 逻辑在 `src/modules/web/providers/select-provider.ts`。

### `ddgs`

| Key | 类型 | 默认值 | 必填 | 作用 | 相关源码 |
|---|---|---:|---|---|---|
| 无 namespace 配置 | - | - | - | 默认零配置 provider，使用 DuckDuckGo Lite fallback | `src/modules/web/providers/ddgs.ts` |

### `brave`

| Key | 类型 | 默认值 | 必填 | 作用 | 相关源码 |
|---|---|---:|---|---|---|
| `web.brave.enabled` | boolean | `false` | 否 | explicit 和 auto mode 共用的 selection enabled gate | `src/modules/web/providers/select-provider.ts` |
| `web.brave.baseUrl` | string | `https://api.search.brave.com/res/v1/web/search` | 否 | Brave Search API endpoint | `src/modules/web/providers/brave.ts` |
| `web.brave.apiKeyEnv` | string | `BRAVE_SEARCH_API_KEY` | 否 | 从哪个环境变量读取 API key | `src/modules/web/providers/brave.ts` |

### `openserp`

| Key | 类型 | 默认值 | 必填 | 作用 | 相关源码 |
|---|---|---:|---|---|---|
| `web.openserp.enabled` | boolean | `false` | 否 | explicit 和 auto mode 共用的 selection enabled gate | `src/modules/web/providers/select-provider.ts` |
| `web.openserp.baseUrl` | string | `https://api.openserp.com/search` | 否 | OpenSERP endpoint | `src/config/load-config.ts` |
| `web.openserp.apiKeyEnv` | string | `OPENSERP_API_KEY` | 否 | 从哪个环境变量读取 API key | `src/modules/web/providers/openserp.ts` |

### `searxng`

| Key | 类型 | 默认值 | 必填 | 作用 | 相关源码 |
|---|---|---:|---|---|---|
| `web.searxng.enabled` | boolean | `false` | 否 | explicit 和 auto mode 共用的 selection enabled gate | `src/modules/web/providers/select-provider.ts` |
| `web.searxng.baseUrl` | string | `""` | 否 | SearXNG base URL；必须是有效 http/https URL 才可用 | `src/modules/web/providers/searxng.ts` |
| `web.searxng.defaultEngine` | string | `google` | 否 | 请求参数 `engines` 的默认值 | `src/modules/web/providers/searxng.ts` |

### `tavily`

| Key | 类型 | 默认值 | 必填 | 作用 | 相关源码 |
|---|---|---:|---|---|---|
| `web.tavily.enabled` | boolean | `false` | 否 | explicit 和 auto mode 共用的 selection enabled gate | `src/modules/web/providers/select-provider.ts` |
| `web.tavily.baseUrl` | string | `https://api.tavily.com/search` | 否 | Tavily endpoint | `src/modules/web/providers/tavily.ts` |
| `web.tavily.apiKeyEnv` | string | `TAVILY_API_KEY` | 否 | 从哪个环境变量读取 API key | `src/modules/web/providers/tavily.ts` |

### `serper`

| Key | 类型 | 默认值 | 必填 | 作用 | 相关源码 |
|---|---|---:|---|---|---|
| `web.serper.enabled` | boolean | `false` | 否 | explicit 和 auto mode 共用的 selection enabled gate | `src/modules/web/providers/select-provider.ts` |
| `web.serper.baseUrl` | string | `https://google.serper.dev/search` | 否 | Serper endpoint | `src/modules/web/providers/serper.ts` |
| `web.serper.apiKeyEnv` | string | `SERPER_API_KEY` | 否 | 从哪个环境变量读取 API key | `src/modules/web/providers/serper.ts` |

### `provider="auto"` 行为

`auto` mode 使用与 explicit mode 相同的 enabled gate 和技术可用性检查过滤 provider，然后应用 `providerPriority`。当前源码将候选 provider 分为三类：

1. commercial：`tavily`、`serper`、`brave`
2. self-host-or-open：`openserp`、`searxng`
3. zero-config：`ddgs`

最终顺序是在每一类内按 `providerPriority` 排序，然后拼接。默认配置下等价于：

```text
tavily → serper → brave → openserp → searxng → ddgs
```

selection availability 由 provider `enabled` gate 和 adapter 层技术检查共同决定。例如 `brave` 需要 `web.brave.enabled=true`、有效 baseUrl，并从 `web.brave.apiKeyEnv` 指定的环境变量读取 API key；`searxng` 需要 `web.searxng.enabled=true` 且 `baseUrl` 是有效 http/https URL。

## Web cache 配置

对应源码：`src/modules/web/cache.ts`、`src/modules/web/register.ts`。

| Key | 类型 | 默认值 | 必填 | 作用 | 相关源码 |
|---|---|---:|---|---|---|
| `web.cache.enabled` | boolean | `false` | 否 | 是否启用 search result cache | `src/modules/web/cache.ts` |
| `web.cache.maxEntries` | number | `50` | 否 | cache 最大条目数 | `src/modules/web/cache.ts` |
| `web.cache.ttlMs` | number | `300000` | 否 | cache TTL，单位 ms | `src/modules/web/cache.ts` |

示例：

```json
{
  "web": {
    "cache": {
      "enabled": true,
      "maxEntries": 100,
      "ttlMs": 600000
    }
  }
}
```

## Web concurrency 配置

对应源码：`src/modules/web/concurrency.ts`、`src/modules/web/register.ts`。

| Key | 类型 | 默认值 | 必填 | 作用 | 相关源码 |
|---|---|---:|---|---|---|
| `web.concurrency.maxConcurrent` | number | `3` | 否 | 同时执行的 web 请求上限 | `src/modules/web/concurrency.ts` |
| `web.concurrency.maxQueueSize` | number | `10` | 否 | 等待队列最大长度 | `src/modules/web/concurrency.ts` |

示例：

```json
{
  "web": {
    "concurrency": {
      "maxConcurrent": 2,
      "maxQueueSize": 20
    }
  }
}
```

## Web connection pool 配置

对应源码：`src/modules/web/http-pool.ts`、`src/modules/web/register.ts`。

| Key | 类型 | 默认值 | 必填 | 作用 | 相关源码 |
|---|---|---:|---|---|---|
| `web.connectionPool.maxSockets` | number | `10` | 否 | HTTP/HTTPS agent 最大 socket 数 | `src/modules/web/http-pool.ts` |
| `web.connectionPool.maxFreeSockets` | number | `5` | 否 | keep-alive 空闲 socket 上限 | `src/modules/web/http-pool.ts` |
| `web.connectionPool.timeout` | number | `60000` | 否 | socket timeout，单位 ms | `src/modules/web/http-pool.ts` |

示例：

```json
{
  "web": {
    "connectionPool": {
      "maxSockets": 20,
      "maxFreeSockets": 10,
      "timeout": 60000
    }
  }
}
```

## Jina Reader 配置

对应源码：`DEFAULT_WEB_CONFIG`、`src/modules/web/fetch.ts`、`src/modules/web/security.ts`、`src/modules/web/schemas.ts`。

| Key | 类型 | 默认值 | 必填 | 作用 | 相关源码 |
|---|---|---:|---|---|---|
| `web.enableJinaFallback` | boolean | `false` | 否 | 是否启用 Jina Reader fallback。未启用时，`preferReader` 也不会触发 Jina | `src/modules/web/fetch.ts` |
| `web.jinaTimeoutMs` | number | `8000` | 否 | Jina 请求超时，单位 ms | `src/modules/web/fetch.ts` |
| `web.jinaTriggers` | string[] | `["short-html", "js-heavy-html"]` | 否 | 自动触发 Jina 的条件；空数组表示不自动触发，但 `preferReader` 仍可在启用 fallback 时请求 Jina | `src/modules/web/fetch.ts` |

`fetch_content` tool schema 中还存在参数：

```json
{
  "preferReader": true
}
```

它不是配置项，而是单次工具调用参数。私网 URL 不会发送给 Jina，以避免泄露 localhost/private network 地址。

示例：启用 Jina fallback。

```json
{
  "web": {
    "enableJinaFallback": true,
    "jinaTimeoutMs": 8000,
    "jinaTriggers": ["short-html", "js-heavy-html"]
  }
}
```

## Convert content 配置

`convert_content` 是可选文档转换工具。当前 public tool 支持通过已配置的 MarkItDown CLI provider 转换本地 `path` 和远程 `url`。远程 URL 会先安全下载到临时文件，再执行转换。TUI renderers 和 toolkit-level activity 集成已实现。MarkItDown provider 使用 shared external command 基础设施解析/执行命令，同时把 convert-specific 校验和错误映射保留在 `src/modules/convert/provider.ts`。

对应源码：`DEFAULT_CONVERT_CONTENT_CONFIG`、`normalizeConvertContentConfig()`、`src/modules/convert/index.ts`、`src/modules/convert/schemas.ts`、`src/modules/convert/errors.ts`、`src/modules/convert/provider.ts`、`src/modules/convert/renderers.ts`、`src/modules/convert/observability.ts`。

| Key | 类型 | 默认值 | 必填 | 作用 | 相关源码 |
|---|---|---:|---|---|---|
| `convertContent.enabled` | boolean | `true` | 否 | 是否注册 `convert_content` tool | `src/modules/convert/index.ts` |
| `convertContent.provider` | `markitdown` | `markitdown` | 否 | 转换 provider 名称。当前 config 会将所有值 normalize 为 `markitdown` | `src/config/load-config.ts` |
| `convertContent.command` | string | `markitdown` | 否 | 内部 MarkItDown provider 使用的外部 MarkItDown CLI 命令/路径；通过 shared external command 基础设施解析/执行 | `src/config/load-config.ts`, `src/modules/convert/provider.ts`, `src/shared/external-command.ts` |
| `convertContent.timeoutMs` | number | `30000` | 否 | 远程下载和 MarkItDown provider 执行 timeout，单位 ms；必须是正整数 | `src/config/load-config.ts`, `src/modules/convert/security.ts`, `src/modules/convert/provider.ts` |
| `convertContent.maxResponseBytes` | number | `10485760` | 否 | 转换执行允许的本地/远程 source 最大字节数；必须是正整数 | `src/config/load-config.ts`, `src/modules/convert/security.ts`, `src/modules/convert/provider.ts` |
| `convertContent.maxContentChars` | number | `50000` | 否 | 返回 Markdown 最大字符数；provider 输出超出该限制时会截断并返回 `truncated=true` | `src/config/load-config.ts`, `src/modules/convert/provider.ts` |
| `convertContent.allowPrivateNetwork` | boolean | `false` | 否 | URL 下载是否允许访问私网目标；默认阻止。每个 redirect hop 都会用该策略重新校验 | `src/config/load-config.ts`, `src/modules/convert/security.ts` |

当前 tool schema 字段：

```json
{
  "path": "./document.pdf",
  "url": "https://example.com/document.pdf",
  "maxContentChars": 50000,
  "timeoutMs": 30000
}
```

`path` 和 `url` 在执行时互斥；同时提供或都不提供会返回 `INVALID_INPUT`。`path` 会通过 MarkItDown 转换 active workspace（扩展进程的 `process.cwd()`）内已存在的本地文件；workspace 外路径返回 `INVALID_INPUT`。`url` 会经过校验、安全下载到临时文件、按 `maxResponseBytes` 限制大小、通过 MarkItDown 转换，然后清理临时文件。URL redirects 会手动跟随，且每个 hop 都重新执行 private-network 校验。

示例：禁用 convert_content 注册。

```json
{
  "convertContent": {
    "enabled": false
  }
}
```

示例：配置 MarkItDown 命令路径。

```json
{
  "convertContent": {
    "command": "/usr/local/bin/markitdown"
  }
}
```

## Commands 配置

Public command 列表、参数、输出与失败语义见 [`toolkit-commands.md`](./toolkit-commands.md)。

对应源码：`DEFAULT_CONFIG.commands`、`normalizeCommandsConfig()`、`src/modules/commands/register.ts`。

| Key | 类型 | 默认值 | 必填 | 作用 | 相关源码 |
|---|---|---:|---|---|---|
| `commands.enabled` | boolean | `true` | 否 | 是否启用统一 `/toolkit` developer command。子代理进程始终不注册该命令 | `src/modules/commands/register.ts` |

当前 `/toolkit` 子命令：

```text
doctor, modules, logs, agents, lsp, activity, help
```

示例：

```json
{
  "commands": {
    "enabled": false
  }
}
```

## Guards 配置

对应源码：`DEFAULT_GUARDS_CONFIG`、`normalizeGuardsConfig()`、`src/modules/guards/*`。

Guards 提供轻量提醒与可选 gate 模式，优先使用 UI notification/status channel。

| Key | 类型 | 默认值 | 必填 | 作用 | 相关源码 |
|---|---|---:|---|---|---|
| `guards.enabled` | boolean | `true` | 否 | 是否在主代理进程注册 guards | `src/modules/guards/index.ts` |
| `guards.mode` | `"off" \| "notice" \| "confirm" \| "block"` | `"notice"` | 否 | guards 运行模式（`off` 关闭、`notice` 仅提醒、`confirm`/`block` 启用 gate 流程） | `src/modules/guards/policies/mode.ts`, `src/modules/guards/gates/register.ts` |
| `guards.nonInteractivePolicy` | `"allow" \| "deny"` | `"allow"` | 否 | `mode="confirm"` 且无交互 confirm UI 时的决策策略 | `src/modules/guards/gates/register.ts` |
| `guards.blockMode` | `"preview" \| "soft" \| "hard"` | `"soft"` | 否 | gate 拒绝行为（`hard` 会抛出结构化 hard-block 错误） | `src/modules/guards/gates/register.ts`, `src/modules/guards/errors.ts` |
| `guards.gitContextNotice` | boolean | `true` | 否 | session 第一次 tool result 后，如果当前 cwd 位于 git worktree 中，则显示一次 repo/branch/worktree context | `src/modules/guards/git-context.ts` |
| `guards.firstWriteReminder` | boolean | `true` | 否 | session 第一次疑似写入 tool call 前，显示一次当前 branch/worktree context | `src/modules/guards/index.ts`, `src/modules/guards/tool-classifier.ts` |
| `guards.verificationReminder` | boolean | `true` | 否 | agent end 时，如果当前 turn 疑似修改了文件但没有检测到 verification command，则显示 soft reminder | `src/modules/guards/index.ts`, `src/modules/guards/command-classifier.ts` |

当前行为：`gitContextNotice`、`firstWriteReminder` 和 `verificationReminder` 已实现。Git commands 使用短 timeout；当 git 不可用、cwd 不在 git repo 中或 git 命令失败时会静默降级。写入分类是保守的：显式文件编辑工具会被视为写入，`bash`/`shell` 仅在明显 mutating commands 时视为写入，例如 redirection、`rm`、`mv`、`cp`、`sed -i`、`tee`、`apply_patch`、部分 mutating `git` 命令或 package installs。验证命令分类同样保守，识别常见 test/lint/typecheck/build 命令。示例包括但不限于：`pnpm test`、`pnpm lint`、`pnpm typecheck`、`pnpm run test`、`pnpm run lint`、`pnpm run typecheck`、`npm test`、`npm run test`、`npm run lint`、`npm run typecheck`、`yarn test`、`yarn lint`、`yarn typecheck`、`tsc --noEmit`、`cargo test`、`cargo check`、`pytest`、`uv run pytest`、`go test`、`cmake --build`、`ctest` 和 `biome check`。子代理进程不注册 guards。

### Guards 模式组合矩阵

| mode | nonInteractivePolicy | blockMode | 生效行为 |
|---|---|---|---|
| `off` | 任意 | 任意 | 不注册 guards |
| `notice` | 任意 | 任意 | 仅提醒流程（`gitContextNotice` / `firstWriteReminder` / `verificationReminder`） |
| `confirm` | `allow` | `preview`/`soft` | 非交互回退允许潜在写入工具调用 |
| `confirm` | `deny` | `preview`/`soft` | 非交互回退给出拒绝决策（`deny_soft`），不抛 hard-block |
| `confirm` | `deny` | `hard` | 非交互回退给出硬拒绝并抛出 `GUARD_HARD_BLOCKED` |
| `block` | 任意 | `preview`/`soft` | gate 给出拒绝决策（`deny_soft`），不抛 hard-block |
| `block` | 任意 | `hard` | gate 硬阻断并抛出 `GUARD_HARD_BLOCKED` |

误配建议：

- 若不希望中断流程，保持 `mode="notice"`（推荐默认路径）。
- 在非交互环境启用 `mode="confirm"` 时，请显式设置 `nonInteractivePolicy`。
- 仅在明确需要自动化/CI 硬阻断时使用 `blockMode="hard"`。

示例：

```json
{
  "guards": {
    "gitContextNotice": false
  }
}
```

## 常见组合示例

### 最小只启用 subagents

```json
{
  "web": { "enabled": false },
  "lsp": { "enabled": false },
  "commands": { "enabled": false },
  "subagents": { "enabled": true }
}
```

### 启用 web auto provider 与 cache

```json
{
  "web": {
    "provider": "auto",
    "cache": {
      "enabled": true,
      "maxEntries": 50,
      "ttlMs": 300000
    }
  }
}
```

### 禁用 LSP hook 但保留子代理 readonly LSP

```json
{
  "lsp": {
    "tool": { "enabled": true },
    "hook": { "enabled": false }
  },
  "subagents": {
    "allowLspTools": true,
    "allowedLspActions": ["definition", "references", "hover", "symbols", "diagnostics", "servers"]
  }
}
```

## Known environment / future notes

1. **`subagents.allowWrite` 不是 stable write-capability contract**
   - 配置项存在，默认 `false`。
   - 当前作为 experimental / advanced / unsafe 开关记录；默认且推荐模式仍是 readonly。
   - 若未来要正式支持 writable custom subagents，应单独补齐权限策略、审计日志、回滚建议和测试覆盖。

2. **LSP language server 可用性依赖本机环境**
   - 配置只控制 devkit-pi 是否注册工具/hook，不自动安装 language server。
