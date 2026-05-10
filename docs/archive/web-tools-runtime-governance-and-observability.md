---
status: historical
audience: maintainer
last_verified: 2026-05-09
---

# Web Tools 运行时治理与可观测性

> 本文档已归档，记录 Web Tools 运行时治理与可观测性增强的完成状态。当前行为请以 [配置参考](../reference/configuration.md)、[Web Tools 错误码](../reference/web-tools-error-codes.md)、[问题记录](../issues/issue-log.md) 和代码为准。

本文说明内置 web tools 的运行时治理策略与可观测能力。

适用范围：

- `web_search`
- `fetch_content`
- `get_search_content`

---

## 1. 存储治理（Storage Governance）

### 1.1 条目数量上限

配置项：`webTools.maxStoredResults`（默认 `100`）

行为：

- 每次 `storeResult` 写入后执行容量检查
- 超出上限时按 FIFO 淘汰最早条目
- 会话恢复（`restoreResultsFromSession`）时同样应用上限

影响：

- 限制长会话内存增长
- 极长会话下旧 `responseId` 可能被淘汰

### 1.2 单条内容大小上限

配置项：`webTools.maxStoredContentChars`（默认 `200000`）

行为：

- 在存储阶段裁剪过长 `content`
- 被裁剪条目会标记 `truncated: true`
- fetch/search 内嵌 content 都适用

影响：

- 降低单条异常页面占用过大内存风险
- `get_search_content` 读取到的是治理后内容

### 1.3 与输出截断的关系

- 存储治理：控制"存多少"（`maxStoredContentChars`）
- 输出治理：控制"返回多少"（`maxContentChars`）

二者独立生效：

1. 先存储治理（可能截断并标记）
2. 再响应输出治理（按 tool 输出上限再次截断）

---

## 2. SSRF 与地址安全增强

增强点：

- 支持 bracket IPv6 host 的规范化检查（如 `[::1]`）
- 拒绝 `localhost`/`.localhost`、`.local`、`.internal`
- 重定向链每一跳都重新执行 URL 安全校验

仍保持：

- 仅允许 `http:` / `https:`
- 拒绝私网、loopback、link-local 地址

---

## 3. 可观测性（Observability）

### 3.1 调试日志级别

配置项：`webTools.debug`（默认 `"false"`）

| 级别 | 行为 |
|------|------|
| `"false"` | 不输出 web tools 调试日志 |
| `"minimal"` | 仅输出错误和警告 |
| `"verbose"` | 输出所有请求详情，包括成功请求 |

日志目标：

- 方便维护者排障
- 默认不污染用户常规输出

### 3.2 活动日志（Activity Log）

内存中维护最近 100 条活动记录：

```ts
interface ActivityEntry {
  timestamp: number;
  type: "search" | "fetch" | "get_content";
  provider?: string;
  status: "pending" | "success" | "error" | "rate_limited";
  duration?: number;
  error?: string;
  requestId: string;
}
```

查看方式：

```bash
/subagents logs                    # 显示最近 20 条
/subagents logs --search          # 按搜索筛选
/subagents logs --fetch           # 按获取筛选
/subagents logs --limit 50        # 自定义条数
```

### 3.3 实时统计（Web Tool Stats）

会话内统计维度：

| 统计项 | 说明 |
|--------|------|
| `totalRequests` | 总请求数 |
| `successCount` | 成功数 |
| `errorCount` | 错误数 |
| `rateLimitedCount` | 限流次数 |
| `averageLatencyMs` | 平均延迟 |
| `providerStats` | 各 provider 统计 |

查看方式：

```bash
/subagents logs    # 输出底部显示统计摘要
/subagents activity # 交互式 TUI 面板（实时刷新）
```

### 3.4 交互式 Activity 面板

```bash
/subagents activity
```

功能：
- 实时显示活动记录和统计
- 键盘导航（↑↓、PageUp/PageDown、Home/End）
- 快捷操作：
  - `r` - 刷新数据
  - `c` - 清除日志
  - `s` - 重置统计
- `Esc` 或 `Ctrl+C` - 关闭面板

### 3.5 诊断命令

```bash
/subagents doctor   # 运行完整诊断检查
/subagents list    # 列出所有可用 agents
```

---

## 4. 性能优化（Performance）

### 4.1 搜索结果缓存

配置项：`webTools.cache`

```json
{
  "cache": {
    "enabled": false,
    "maxEntries": 50,
    "ttlMs": 300000
  }
}
```

行为：

- 基于 query + provider + numResults 生成缓存 key
- 支持 LRU 淘汰策略
- 支持 TTL 过期
- 追踪命中/未命中统计

### 4.2 并发请求限制

配置项：`webTools.concurrency`

```json
{
  "concurrency": {
    "maxConcurrent": 3,
    "maxQueueSize": 10
  }
}
```

行为：

- 使用 semaphore 模式限制并发
- 队列满时抛出 `QueueFullError`
- 追踪活跃/排队/总处理数

### 4.3 HTTP 连接池

配置项：`webTools.connectionPool`

```json
{
  "connectionPool": {
    "maxSockets": 10,
    "maxFreeSockets": 5,
    "timeout": 60000
  }
}
```

行为：

- HTTP keep-alive 连接复用
- 可配置 socket 数量
- 请求统计

---

## 5. Abort/Timeout 一致性模型

统一策略：

- 使用 `AbortSignal.timeout(...)` 生成超时信号
- 使用 `AbortSignal.any([...])` 合并父 signal 与超时 signal

收益：

- `web_search` 与 `fetch_content` 的取消/超时语义一致
- 错误分类更稳定

---

## 6. 推荐配置模板

```json
{
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

---

## 7. 运维建议

- 若出现 `responseId` 频繁失效：
  - 提高 `maxStoredResults`
- 若内存压力偏高：
  - 降低 `maxStoredResults` 与 `maxStoredContentChars`
  - 关闭 `cache.enabled`
- 若排障需要：
  - 临时启用 `webTools.debug: "verbose"`，问题定位后关闭
- 若超时较多：
  - 先减小查询规模，再视情况上调 `timeoutMs`
- 若 API 限流频繁：
  - 降低 `concurrency.maxConcurrent`
  - 启用 `cache.enabled` 减少重复请求
