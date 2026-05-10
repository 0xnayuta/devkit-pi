---
status: historical
audience: maintainer
last_verified: 2026-05-08
---

# 内置 Web Tools 实施路线

> 本文档已归档，仅保留为历史实施计划。当前行为请以 [Web Tools 运行时治理与可观测性](./web-tools-runtime-governance-and-observability.md)、[配置参考](../reference/configuration.md) 和代码为准。

本文记录 `pi-subagents` 内置极简 readonly web tools 的推荐实施路线。对应决策见 [ADR 0004](../adr/0004-bundled-readonly-web-tools.md)。

## 原则

不要完整复制 `pi-web-access` 后再裁剪。应重新实现最小子集：

```text
接口借鉴 pi-web-access
实现保持 pi-subagents 风格的轻量 readonly 子集
按需增量扩展
```

## Phase 1: 配置

扩展现有配置，建议字段：

```json
{
  "webTools": {
    "enabled": true,
    "provider": "ddgs",
    "timeoutMs": 10000,
    "maxResponseBytes": 1048576,
    "maxContentChars": 30000,
    "maxResults": 5
  }
}
```

建议第一版 provider：

- 首选：Brave Search API（稳定，需要 `BRAVE_SEARCH_API_KEY`）
- 后续可选：DuckDuckGo Lite/HTML fallback（免 key，但脆弱）

## Phase 2: 新增模块骨架

新增：

```text
src/web/
├─ index.ts
├─ schemas.ts
├─ types.ts
├─ security.ts
├─ storage.ts
├─ fetch.ts
├─ extract.ts
└─ search.ts
```

`src/web/index.ts` 暴露：

```ts
export function registerWebTools(pi: ExtensionAPI, config: Required<ExtensionConfig>): void;
```

## Phase 3: 实现 fetch_content

先实现最小 URL 抓取能力。

兼容接口：

```ts
fetch_content({
  url?: string,
  urls?: string[]
})
```

第一版只支持：

- `http:` / `https:`
- `text/html`
- `text/plain`

必须实现：

- 缺少 URL 时返回结构化错误
- URL 协议校验
- SSRF 防护
- timeout
- 最大响应体限制
- 输出截断
- 存储完整提取结果供 `get_search_content` 使用

## Phase 4: 实现 storage + get_search_content

使用简单内存 Map：

```ts
type StoredResult =
  | { type: "fetch"; urls: ExtractedContent[] }
  | { type: "search"; queries: QueryResultData[] };
```

`get_search_content` 兼容接口：

```ts
get_search_content({
  responseId: string,
  query?: string,
  queryIndex?: number,
  url?: string,
  urlIndex?: number
})
```

行为要求：

- 找不到 `responseId` 时返回明确错误
- fetch 结果可按 `url` 或 `urlIndex` 取回
- search 结果可按 `query` 或 `queryIndex` 取回
- 返回完整存储内容，但仍受最大输出长度保护

## Phase 5: 实现 web_search

兼容接口：

```ts
web_search({
  query?: string,
  queries?: string[],
  numResults?: number,
  includeContent?: boolean
})
```

第一版行为：

1. 规范化 `query` / `queries`
2. 限制 query 数量和 `numResults`
3. 调用单一搜索 provider
4. 返回 title/url/snippet/source
5. 生成 `responseId`
6. `includeContent: true` 时抓取前 N 个结果的正文
7. 存储搜索结果供 `get_search_content` 使用

## Phase 6: 调整扩展注册

修改 `src/extension/index.ts` 的注册顺序。

目标行为：

```ts
registerWebTools(pi, effectiveConfig);

if (process.env[PI_SUBAGENT_CHILD] === "1") return;

// register subagent tool only in parent process
pi.registerTool(subagentTool);
```

验证点：

- 主代理能调用 `subagent`
- researcher 子代理能调用 `web_search` / `fetch_content` / `get_search_content`
- 子代理不能调用 `subagent`

## Phase 7: 文档与测试

### 文档

更新：

- `README.md`
- `docs/reference/configuration.md`
- `docs/reference/agent-definition.md`
- `docs/guides/security-model.md`

说明 web tools 是内置极简子集，不等同于完整 `pi-web-access`。

### 测试

至少覆盖：

- `fetch_content` 缺 URL
- 非 HTTP/HTTPS URL 被拒绝
- localhost/private IP 被拒绝
- 响应体过大时停止或截断
- HTML 提取与输出截断
- `get_search_content` 找不到 `responseId`
- `get_search_content` 按 index/url/query 取回
- `web_search` 缺 query
- `web_search` 多 query 规范化
- `includeContent` 存储抓取内容
- child process 只注册 web tools，不注册 `subagent`

## 完成标准

- `researcher` 在不安装外部 `pi-web-access` 的情况下可完成基础 web research
- 所有 web tools readonly
- `pnpm typecheck` 通过
- `pnpm test` 通过
- 文档说明能力边界和安全限制
