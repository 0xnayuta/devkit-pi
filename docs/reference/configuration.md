---
status: current
audience: user
last_verified: 2026-05-10
---

# 配置参考

## 配置文件位置

`~/.pi/agent/extensions/devkit-pi/config.json`

devkit-pi 使用 namespace 化配置，不支持旧的扁平配置字段。

## 示例

```json
{
  "enabled": true,
  "subagents": {
    "enabled": true,
    "maxDepth": 1,
    "timeoutMs": 120000,
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
    "maxResults": 5
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
  }
}
```

## 顶层配置

| 字段 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `enabled` | boolean | `true` | 是否启用整个 devkit-pi 扩展 |
| `subagents` | object | 见下方 | subagent 工具与内置 agents |
| `web` | object | 见下方 | web search / fetch tools |
| `lsp` | object | 见下方 | LSP tool 与自动 diagnostics hook 配置 |
| `commands` | object | 见下方 | developer commands |

## Subagents

| 字段 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `subagents.enabled` | boolean | `true` | 是否注册 `subagent` 工具 |
| `subagents.maxDepth` | number | `1` | 子代理最大深度；默认禁止 nested subagents |
| `subagents.timeoutMs` | number | `120000` | 单次子代理执行超时 |
| `subagents.allowWrite` | boolean | `false` | 是否允许子代理使用写工具 |
| `subagents.allowLspTools` | boolean | `true` | 是否允许子代理使用 readonly LSP tool |
| `subagents.allowedLspActions` | string[] | readonly-safe actions | 子代理允许调用的 LSP action 白名单；非法值会被丢弃 |
| `subagents.injectDelegationPolicy` | boolean | `true` | 是否向主代理注入委托策略 |
| `subagents.retry.enabled` | boolean | `true` | 是否启用子代理重试 |
| `subagents.retry.maxAttempts` | number | `2` | 最大尝试次数 |

## Web

| 字段 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `web.enabled` | boolean | `true` | 是否注册 `web_search` / `fetch_content` / `get_search_content` |
| `web.provider` | string | `"ddgs"` | 搜索 provider：`auto` / `brave` / `ddgs` / `openserp` / `searxng` / `tavily` / `serper` |
| `web.providerPriority` | string[] | 见示例 | `provider="auto"` 时的选择顺序 |
| `web.timeoutMs` | number | `10000` | 单次网络请求超时 |
| `web.maxResponseBytes` | number | `1048576` | 最大读取响应体大小 |
| `web.maxContentChars` | number | `30000` | 最大返回文本长度 |
| `web.maxResults` | number | `5` | 默认搜索结果数量 |
| `web.maxStoredResults` | number | `100` | 最多保留多少个结果条目 |
| `web.maxStoredContentChars` | number | `200000` | 单条存储内容最大字符数 |
| `web.debug` | `false` / `"minimal"` / `"verbose"` | `false` | 调试输出级别 |

Provider 子配置使用 `web.openserp`、`web.searxng`、`web.tavily`、`web.serper` namespace。

## LSP

LSP 模块包含显式 `lsp` tool 和主代理进程中的自动 diagnostics hook。hook 不会在子代理进程中注册。

| 字段 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `lsp.enabled` | boolean | `true` | 是否启用 LSP 模块 |
| `lsp.tool.enabled` | boolean | `true` | 是否注册 `lsp` tool |
| `lsp.tool.allowMutatingActions` | boolean | `false` | 是否允许 `rename` / `codeAction` / `restart`；子代理进程始终禁用 |
| `lsp.hook.enabled` | boolean | `true` | 是否启用自动 diagnostics hook；仅主代理进程 |
| `lsp.hook.mode` | `"agent_end"` / `"edit_write"` / `"disabled"` | `"agent_end"` | hook 触发时机；`disabled` 会禁用 hook |

Readonly-safe LSP actions：`definition`、`references`、`hover`、`signature`、`symbols`、`diagnostics`、`workspace-diagnostics`、`servers`。这些 action 可通过 `subagents.allowedLspActions` 暴露给子代理。

Privileged actions：`rename`、`codeAction`、`restart`。

## Commands

| 字段 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `commands.enabled` | boolean | `true` | 是否启用统一 `/toolkit` developer command |
