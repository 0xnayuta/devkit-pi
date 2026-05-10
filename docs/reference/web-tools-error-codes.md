---
status: current
audience: user
last_verified: 2026-05-09
---

# Web Tools 错误码

本文定义内置 web tools（`web_search` / `fetch_content` / `get_search_content`）返回的结构化错误码。

错误返回统一结构：

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message"
  }
}
```

> 说明：`message` 是面向调用方的可操作提示，可能随版本优化；自动化逻辑应优先使用 `code`。

## Web 工具错误码

### 搜索错误（Search Errors）

| Code | 触发场景 | Recovery | 说明 |
|------|----------|----------|------|
| `WEB_SEARCH_FAILED` | 所有 provider 都失败了 | `fallback` to next provider | 最常见的兜底错误 |
| `WEB_SEARCH_TIMEOUT` | 搜索请求超时 | `retry` after backoff | 检查网络或降低查询规模 |
| `WEB_SEARCH_NO_RESULTS` | 查询未返回任何结果 | `retry` with different query | 可能需要优化查询词 |
| `WEB_SEARCH_INVALID_QUERY` | 查询格式无效 | `retry` with fixed query | 检查 query 是否为空或格式错误 |

### Provider 错误（Provider Errors）

| Code | 触发场景 | Recovery | 说明 |
|------|----------|----------|------|
| `PROVIDER_RATE_LIMITED` | Provider 触发限流 | `retry` after wait | 自动等待 5s 退避 |
| `PROVIDER_UNAVAILABLE` | Provider 返回 5xx | `fallback` to next provider | 临时性服务错误 |
| `PROVIDER_AUTH_FAILED` | API key 无效或缺失 | `abort` | 检查 API key 配置 |

### Fetch 错误（Fetch Errors）

| Code | 触发场景 | Recovery | 说明 |
|------|----------|----------|------|
| `CONTENT_FETCH_FAILED` | 内容抓取失败 | `retry` or `skip` | SSRF 拒绝、协议不支持等 |
| `CONTENT_FETCH_TIMEOUT` | 抓取请求超时 | `fallback` to Jina | 可尝试 Jina Reader 兜底 |
| `CONTENT_FETCH_TOO_LARGE` | 响应体过大 | `skip` | 减小抓取范围 |
| `CONTENT_FETCH_INVALID_URL` | URL 格式无效 | `abort` | 检查 URL 格式 |

### 通用错误（Common Errors）

| Code | 触发场景 | Recovery | 说明 |
|------|----------|----------|------|
| `NETWORK_ERROR` | 网络连接错误 | `retry` after backoff | DNS、连接超时等 |
| `PARSE_ERROR` | 响应解析失败 | `abort` | Provider 返回格式异常 |
| `CACHE_ERROR` | 缓存操作失败 | `skip` | 不影响主流程，继续请求 |

### 输入验证错误（Validation Errors）

| Code | 触发场景 | 说明 |
|------|----------|------|
| `INVALID_INPUT` | 缺少必要参数或参数不合法 | 检查必填参数与参数类型 |
| `NOT_FOUND` | `responseId`、query/url selector 未命中 | 检查 `responseId` 是否正确 |

---

## HTTP 状态码映射

| Status | 映射到 | Recovery |
|--------|--------|----------|
| 401 | `PROVIDER_AUTH_FAILED` | `abort` |
| 403 | `PROVIDER_AUTH_FAILED` | `abort` |
| 429 | `PROVIDER_RATE_LIMITED` | `retry` after wait |
| 500 | `PROVIDER_UNAVAILABLE` | `fallback` |
| 502 | `PROVIDER_UNAVAILABLE` | `fallback` |
| 503 | `PROVIDER_UNAVAILABLE` | `fallback` |
| 504 | `PROVIDER_UNAVAILABLE` | `fallback` |

---

## Recovery 动作说明

| Action | 说明 | 行为 |
|--------|------|------|
| `retry` | 重试当前 provider | 等待 `waitMs` 后重试 |
| `fallback` | 切换到下一个 provider | 按 priority 列表尝试 |
| `skip` | 跳过当前请求 | 继续处理其他请求 |
| `abort` | 终止操作 | 返回错误，不继续 |

---

## 子代理错误码

| Code | 说明 |
|------|------|
| `INVALID_INPUT` | 缺少必需参数或不支持的配置值 |
| `SUBAGENTS_DISABLED` | 子代理功能已禁用 |
| `UNKNOWN_AGENT` | 未知代理名称 |
| `SUBAGENT_DISABLED` | 该代理已禁用 |
| `SUBAGENT_DEPTH_EXCEEDED` | 递归深度超限（`maxSubagentDepth = 1`） |
| `SUBAGENT_TIMEOUT` | 执行超时 |
| `SUBAGENT_FAILED` | 子代理执行失败 |
| `SUBAGENT_OUTPUT_TRUNCATED` | 输出被截断 |

---

## 错误码使用示例

### 搜索错误处理

```typescript
try {
  const result = await web_search({ query: "test" });
} catch (error) {
  if (error.code === 'PROVIDER_RATE_LIMITED') {
    // 等待后重试
    await sleep(5000);
    return web_search({ query: "test" });
  }
  if (error.code === 'WEB_SEARCH_TIMEOUT') {
    // 尝试更大超时
    return web_search({ query: "test" });
  }
  // 其他错误
  console.error(error.message);
}
```

### 查看错误统计

```bash
# 查看最近错误
/subagents logs | grep "✗"

/# 查看详细错误
/subagents activity
# 选择错误条目查看详情
```
