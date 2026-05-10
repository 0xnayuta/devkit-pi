---
status: current
audience: user
last_verified: 2026-05-09
---

# 配置参考

## 配置文件位置

`~/.pi/agent/extensions/subagent/config.json`

## 配置字段

```json
{
  "enabled": true,
  "maxSubagentDepth": 1,
  "timeoutMs": 120000,
  "allowWriteSubagents": false,
  "webTools": {
    "enabled": true,
    "provider": "ddgs",
    "providerPriority": ["tavily", "serper", "brave", "openserp", "searxng", "ddgs"],
    "timeoutMs": 10000,
    "maxResponseBytes": 1048576,
    "maxContentChars": 30000,
    "maxResults": 5,
    "maxStoredResults": 100,
    "maxStoredContentChars": 200000,
    "debug": "false",
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
  }
}
```

## 字段说明

### 基础配置

| 字段 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `enabled` | boolean | `true` | 是否启用 subagent 工具 |
| `maxSubagentDepth` | number | `1` | 子代理递归深度。固定为 1，子代理不能再调子代理 |
| `timeoutMs` | number | `120000` | 子代理执行超时（毫秒） |
| `allowWriteSubagents` | boolean | `false` | 是否允许子代理写文件。MVP 默认 false |

### Web Tools 基础配置

| 字段 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `webTools.enabled` | boolean | `true` | 是否注册 `web_search` / `fetch_content` / `get_search_content` |
| `webTools.provider` | string | `"ddgs"` | 搜索 provider，支持 `brave` / `ddgs` / `openserp` / `searxng` / `tavily` / `serper` / `auto` |
| `webTools.providerPriority` | string[] | 见配置 | `provider="auto"` 时的选择顺序 |
| `webTools.timeoutMs` | number | `10000` | 单次网络请求超时 |
| `webTools.maxResponseBytes` | number | `1048576` | 最大读取响应体大小（1MB） |
| `webTools.maxContentChars` | number | `30000` | 最大返回文本长度 |
| `webTools.maxResults` | number | `5` | 默认搜索结果数量 |
| `webTools.maxStoredResults` | number | `100` | 内存缓存最多保留多少个 `responseId` 条目 |
| `webTools.maxStoredContentChars` | number | `200000` | 单条存储内容的最大字符数 |

### 调试配置

| 字段 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `webTools.debug` | string | `"false"` | 调试级别：`"false"`（无输出）、`"minimal"`（仅错误）、`"verbose"`（所有请求） |

### 缓存配置

| 字段 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `webTools.cache.enabled` | boolean | `false` | 是否启用搜索结果缓存 |
| `webTools.cache.maxEntries` | number | `50` | 最大缓存条目数 |
| `webTools.cache.ttlMs` | number | `300000` | 缓存 TTL（毫秒），默认 5 分钟 |

### 并发控制配置

| 字段 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `webTools.concurrency.maxConcurrent` | number | `3` | 最大并发请求数 |
| `webTools.concurrency.maxQueueSize` | number | `10` | 最大排队请求数 |

### 连接池配置

| 字段 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `webTools.connectionPool.maxSockets` | number | `10` | 每主机最大 socket 数 |
| `webTools.connectionPool.maxFreeSockets` | number | `5` | 最大空闲 socket 数 |
| `webTools.connectionPool.timeout` | number | `60000` | socket 超时（毫秒） |

### Provider 配置

| 字段 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `webTools.openserp.enabled` | boolean | `false` | 是否启用 OpenSERP provider |
| `webTools.openserp.baseUrl` | string | `"https://api.openserp.com/search"` | OpenSERP API endpoint |
| `webTools.openserp.apiKeyEnv` | string | `"OPENSERP_API_KEY"` | API key 环境变量名 |
| `webTools.searxng.enabled` | boolean | `false` | 是否启用 SearXNG provider |
| `webTools.searxng.baseUrl` | string | `""` | SearXNG 实例地址（使用时应显式配置） |
| `webTools.searxng.defaultEngine` | string | `"google"` | SearXNG 默认 engine |
| `webTools.tavily.enabled` | boolean | `false` | 是否允许显式使用 Tavily |
| `webTools.tavily.baseUrl` | string | `"https://api.tavily.com/search"` | Tavily API endpoint |
| `webTools.tavily.apiKeyEnv` | string | `"TAVILY_API_KEY"` | API key 环境变量名 |
| `webTools.serper.enabled` | boolean | `false` | 是否允许显式使用 Serper |
| `webTools.serper.baseUrl` | string | `"https://google.serper.dev/search"` | Serper API endpoint |
| `webTools.serper.apiKeyEnv` | string | `"SERPER_API_KEY"` | API key 环境变量名 |

## Provider 策略

### Auto 模式分层选择

```
商业 keyed（质量优先）  →  tavily → serper → brave
OpenSERP / SearXNG     →  openserp → searxng
DDGS 兜底（可用性优先） →  ddgs
```

- `providerPriority` 控制同 tier 内的候选顺序
- 不在列表中的 provider 会被忽略
- 检测到 API key 时自动启用对应 provider

### 显式指定模式

设置 `provider: "ddgs"` 等值，只使用指定 provider，不降级。

## MVP 不支持的配置

以下配置字段在 MVP 中会被忽略：

- `asyncByDefault` - background jobs 不支持
- `parallel` - parallel execution 不支持
- `intercomBridge` - intercom 不支持
- `worktreeSetupHook` - worktree 不支持
- `agentOverrides` - per-agent model/skill override 不支持
- `defaultSessionDir` - 复杂 session 管理不支持

## readonly agents 允许的工具

默认 readonly agents 只能使用安全工具：

```text
read, grep, find, ls
```

researcher 可使用网络研究工具：

```text
web_search, fetch_content, get_search_content
```

不允许使用 `bash`、`edit`、`write` 等可能修改文件系统的工具。

## 配置示例

### 最小配置（零配置）

```json
{
  "enabled": true
}
```

### 启用缓存和调试

```json
{
  "webTools": {
    "debug": "verbose",
    "cache": {
      "enabled": true,
      "maxEntries": 100,
      "ttlMs": 600000
    }
  }
}
```

### 自托管 SearXNG

```json
{
  "webTools": {
    "provider": "searxng",
    "searxng": {
      "enabled": true,
      "baseUrl": "http://127.0.0.1:8080"
    }
  }
}
```

### 高并发配置

```json
{
  "webTools": {
    "concurrency": {
      "maxConcurrent": 5,
      "maxQueueSize": 20
    }
  }
}
```
