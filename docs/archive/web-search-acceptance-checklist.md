---
status: historical
audience: maintainer
last_verified: 2026-05-09
---

# Web Search 验收清单（上线前）

> 本文档已归档，仅保留为历史上线验收记录。当前行为请以 [Web Tools 运行时治理与可观测性](./web-tools-runtime-governance-and-observability.md)、[配置参考](../reference/configuration.md)、[Web Tools 错误码](../reference/web-tools-error-codes.md) 和代码为准。

用于验证内置 `web_search` / `fetch_content` / `get_search_content` 的可用性、稳定性与边界符合预期。

> 建议按顺序执行，所有条目通过后再发布。

---

## A. 基础功能（必过）

- [x] **单 query 可用（零配置开箱即用）**
  - 执行：`web_search({ query: "TypeScript 5.7 release notes" })`
  - 期望：返回 `responseId`，至少 1 条结果含 `title/url`，`source = "fallback"`（DDGS 默认兜底）
  - 说明：零配置默认使用 DDGS，无需任何 API key

- [x] **多 query 规范化与去重**
  - 执行：`web_search({ query: "typescript", queries: ["typescript", "node", "node"], numResults: 2 })`
  - 期望：重复 query 被去重；每个 query 结果数不超过 `numResults`

- [x] **includeContent 抓取正文**
  - 执行：`web_search({ query: "Brave Search API docs", numResults: 1, includeContent: true })`
  - 期望：结果中可见 `content`（HTML 正文抓取成功）

- [x] **responseId 回读（search）**
  - 执行：`get_search_content({ responseId: "...", queryIndex: 0 })`
  - 期望：能按 query index 取回对应结果，含原始 `content`

- [x] **responseId 回读（fetch）**
  - 执行：`fetch_content({ url: "https://example.com" })` 后 `get_search_content({ responseId: "...", urlIndex: 0 })`
  - 期望：能按 url index 取回内容

---

## B. 错误分类与提示（必过）

- [x] **缺少 query 输入**
  - 执行：`web_search({})`
  - 期望：`error.code = INVALID_INPUT`，`message` 说明需要 query 或 queries

- [x] **显式 Brave provider 缺少 key**
  - 前置：移除 `BRAVE_SEARCH_API_KEY`
  - 执行：`web_search({ query: "typescript" }, mergeConfig({ webTools: { provider: "brave" } }))`
  - 期望：`error.code = WEB_SEARCH_AUTH_REQUIRED`

- [x] **显式 Tavily provider 缺少 key**
  - 前置：移除 `TAVILY_API_KEY`
  - 执行：`web_search({ query: "typescript" }, mergeConfig({ webTools: { provider: "tavily", tavily: { enabled: true } } }))`
  - 期望：`error.code = WEB_SEARCH_AUTH_REQUIRED`

- [x] **显式 SearXNG provider 未配置 endpoint**
  - 执行：`web_search({ query: "typescript" }, mergeConfig({ webTools: { provider: "searxng", searxng: { enabled: true } } }))`
  - 期望：`error.code = INVALID_INPUT`，提示需要配置 `baseUrl`

- [x] **限流错误分类**
  - 前置：通过 mock 或受控环境触发 provider 429
  - 期望：`error.code = WEB_SEARCH_RATE_LIMIT`

- [x] **超时/取消错误分类**
  - 前置：将 `webTools.timeoutMs` 设为极小值
  - 执行：`web_search(...)` 或 `fetch_content(...)`
  - 期望：`error.code = SUBAGENT_TIMEOUT`，message 含可操作建议

- [x] **selector 未命中提示可操作**
  - 执行：`get_search_content({ responseId: "...", query: "not-exist" })`
  - 期望：`NOT_FOUND` 或错误，提示可用 selector

---

## C. Provider 分层选择（必过）

- [x] **auto 模式：商业 provider 有 key 时优先**
  - 前置：设置 `TAVILY_API_KEY` 或 `SERPER_API_KEY` 或 `BRAVE_SEARCH_API_KEY`
  - 执行：`web_search({ query: "typescript" }, mergeConfig({ webTools: { provider: "auto" } }))`
  - 期望：命中商业 provider（非 ddgs），`source` 为对应 provider 名

- [x] **auto 模式：无商业 key 时降级到 DDGS**
  - 前置：移除所有商业 API key
  - 执行：`web_search({ query: "typescript" }, mergeConfig({ webTools: { provider: "auto" } }))`
  - 期望：落到 DDGS，`source = "fallback"`

- [x] **auto 模式：provider 调用失败继续尝试下一个**
  - 前置：配置 `provider: "auto"` 和 `providerPriority: ["searxng", "ddgs"]`，其中 searxng 不可达
  - 执行：`web_search({ query: "typescript" }, mergeConfig({ webTools: { provider: "auto", providerPriority: ["searxng", "ddgs"], searxng: { enabled: true, baseUrl: "http://127.0.0.1:9999" } } }))`
  - 期望：searxng 失败后自动降级到 ddgs，返回成功结果

- [x] **显式 provider 不降级**
  - 执行：`web_search({ query: "typescript" }, mergeConfig({ webTools: { provider: "searxng", searxng: { enabled: true, baseUrl: "http://127.0.0.1:9999" } } }))`
  - 期望：失败后直接返回分类错误，不尝试其他 provider

- [x] **DDGS 结果数上限保护**
  - 执行：`web_search({ query: "typescript", numResults: 10 }, mergeConfig({ webTools: { provider: "ddgs" } }))`
  - 期望：DDGS 每次最多返回 5 条结果

---

## D. 安全与边界（必过）

- [x] **协议限制**
  - 执行：`fetch_content({ url: "file:///etc/passwd" })`
  - 期望：拒绝，非 HTTP/HTTPS 返回结构化错误

- [x] **私网/本地域名限制**
  - 执行：`fetch_content({ url: "http://localhost:3000" })`
  - 期望：拒绝

- [x] **IPv6 loopback 限制**
  - 执行：`fetch_content({ url: "http://[::1]/" })`
  - 期望：拒绝

- [x] **内容类型限制**
  - 执行：请求非文本资源
  - 期望：拒绝并返回结构化错误

---

## E. 治理与可观测（推荐）

- [x] **存储条目上限生效**
  - 前置：`webTools.maxStoredResults` 设小值（如 2）
  - 期望：旧 `responseId` 被 FIFO 淘汰

- [x] **单条存储上限生效**
  - 前置：`webTools.maxStoredContentChars` 设小值
  - 期望：存储内容被截断并标记 `truncated`

- [x] **debug 日志开关生效**
  - 前置：`webTools.debug = true`
  - 期望：出现 `[web-tools]` 调试日志，含 `provider` / `mode` / `responseId` 字段；关闭后不再输出

---

## F. 进程注册语义（必过）

- [x] **parent 进程注册集合正确**
  - 期望：`web_search` / `fetch_content` / `get_search_content` + `subagent`

- [x] **child 进程注册集合正确**
  - 期望：仅 `web_search` / `fetch_content` / `get_search_content`，不含 `subagent`

---

## G. 自动化回归（必过）

发布前至少执行：

```bash
pnpm test:unit
pnpm test:mvp
pnpm lint
pnpm typecheck
pnpm docs:check
```

要求：全部通过。

---

## 备注

- 若仅上线最小能力，可跳过 E 组的推荐项，但 A/B/C/D/F 必须全部通过。
- 若启用 `enableJinaFallback`，建议额外做一次 JS-heavy 页面抓取验证。
- **Provider 分层策略**：零配置默认 DDGS → `provider=auto` 时按「商业 keyed → OpenSERP/SearXNG → DDGS 兜底」分层选择，失败自动降级。
- **显式 provider** 行为保持可预测：失败直接返回分类错误，不降级。
