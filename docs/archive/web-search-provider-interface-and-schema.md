---
status: historical
audience: maintainer
last_verified: 2026-05-08
---

# Web Search 最小 Provider 接口与配置 Schema 设计

> 本文档已归档，仅保留为历史设计记录。当前 provider 行为请以 [Web Tools 运行时治理与可观测性](./web-tools-runtime-governance-and-observability.md)、[配置参考](../reference/configuration.md) 和代码为准。

本文定义 `pi-subagents` 内置 web tools 的最小 provider 抽象层与配置 schema，目标是：

- 保持当前轻量边界
- 支持多 provider 渐进扩展
- 不破坏现有 `web_search` / `get_search_content` 行为

---

## 1. 设计目标与边界

### 1.1 目标

1. `web_search` 支持统一 provider 接口
2. `provider=auto` 时可按可用性降级
3. provider 输出结构统一，便于 `get_search_content` 复用
4. 保持 readonly，不引入后台任务与复杂编排

### 1.2 非目标

- 不引入 curator UI
- 不做并行多 provider 聚合
- 不引入复杂重试框架
- 不引入跨会话持久化数据库

---

## 2. Provider 分层策略

建议 provider 分层：

- `tier0_zero_config`: `ddgs`
- `tier1_open_or_self_hosted`: `openserp`, `searxng`
- `tier2_commercial`: `tavily`, `serper`, `brave`

`auto` 模式推荐顺序：

1. 先尝试可用 commercial（有 key）
2. 再尝试 open/self-hosted（可访问 endpoint）
3. 最后使用 `ddgs` 兜底

> 注：显式指定 `provider` 时，不做自动切换。

---

## 3. 最小接口设计

建议新增 `src/web/providers/`，每个 provider 一个文件，并实现统一接口。

### 3.1 类型定义（建议）

```ts
export type WebSearchProviderName =
  | "auto"
  | "ddgs"
  | "openserp"
  | "searxng"
  | "tavily"
  | "serper"
  | "brave";

export interface ProviderSearchParams {
  query: string;
  numResults: number;
  timeoutMs: number;
  signal?: AbortSignal;
}

export interface ProviderSearchResultItem {
  title: string;
  url: string;
  snippet?: string;
  source?: string;
}

export interface ProviderSearchResponse {
  provider: Exclude<WebSearchProviderName, "auto">;
  results: ProviderSearchResultItem[];
}

export interface SearchProviderAdapter {
  name: Exclude<WebSearchProviderName, "auto">;
  isAvailable(config: ResolvedExtensionConfig): Promise<boolean> | boolean;
  search(
    params: ProviderSearchParams,
    config: ResolvedExtensionConfig
  ): Promise<ProviderSearchResponse>;
}
```

### 3.2 错误分类约定

provider 内部错误应尽量归类为以下语义层：

- auth（缺 key / 401 / 403）
- rate limit（429）
- provider error（5xx）
- network（连接/DNS）
- timeout/abort
- unknown

由 `web_search` 上层统一映射为当前错误码：

- `WEB_SEARCH_AUTH_REQUIRED`
- `WEB_SEARCH_RATE_LIMIT`
- `WEB_SEARCH_PROVIDER_ERROR`
- `WEB_SEARCH_NETWORK_ERROR`
- `SUBAGENT_TIMEOUT`
- `WEB_SEARCH_FAILED`

---

## 4. Provider 注册与选择

### 4.1 注册表（建议）

```ts
const PROVIDERS: Record<string, SearchProviderAdapter> = {
  brave: braveProvider,
  tavily: tavilyProvider,
  serper: serperProvider,
  openserp: openserpProvider,
  searxng: searxngProvider,
  ddgs: ddgsProvider,
};
```

### 4.2 选择逻辑（建议）

1. 若 `provider !== auto`：
   - 找到对应 adapter
   - `isAvailable=false` 时返回结构化错误（不降级）
2. 若 `provider === auto`：
   - 按 tier 选择：已配置 key 的商业 provider（tavily/serper/brave） -> 可用的 OpenSERP/SearXNG -> DDGS 兜底
   - `providerPriority` 用于控制同 tier 内的顺序/候选集合
   - 若某个 auto provider 调用失败，继续尝试后续 provider；若都不可用，返回最后一次分类错误或 `WEB_SEARCH_FAILED`

---

## 5. 配置 Schema 设计

在现有 `webTools` 下增加 provider 相关最小配置。

### 5.1 建议配置结构

```json
{
  "webTools": {
    "enabled": true,
    "provider": "auto",
    "providerPriority": ["tavily", "serper", "brave", "openserp", "searxng", "ddgs"],

    "timeoutMs": 10000,
    "maxResults": 5,

    "ddgs": {
      "enabled": true
    },

    "openserp": {
      "enabled": true,
      "baseUrl": "https://api.openserp.com",
      "apiKeyEnv": "OPENSERP_API_KEY"
    },

    "searxng": {
      "enabled": false,
      "baseUrl": "",
      "defaultEngine": "google"
    },

    "tavily": {
      "enabled": false,
      "apiKeyEnv": "TAVILY_API_KEY"
    },

    "serper": {
      "enabled": false,
      "apiKeyEnv": "SERPER_API_KEY"
    },

    "brave": {
      "enabled": true,
      "apiKeyEnv": "BRAVE_SEARCH_API_KEY"
    }
  }
}
```

### 5.2 兼容策略

- 保留当前顶层 `webTools.provider`（现有 `"brave"` 仍可用）
- 若 `providerPriority` 缺失，使用内置默认顺序
- provider 子配置缺失时使用默认值，不报错

---

## 6. 运行时行为约定

1. 所有 provider 请求都必须使用统一 timeout/abort 模型
2. 所有 provider 结果都归一化成 `{title,url,snippet,source}`
3. `includeContent` 仍在上层统一实现（不放到 provider 内）
4. `responseId` 存储逻辑保持不变（搜索结果统一入库）

---

## 7. 观测与调试约定

在 `webTools.debug=true` 下建议输出：

- provider 选择结果（explicit/auto）
- 可用性检查结果
- 请求耗时
- 错误分类结果

统计维度沿用现有 `observability.ts`：

- provider calls/success/failure
- error code count
- 累计 latency

---

## 8. 分阶段实施计划（建议）

### Phase A：抽象层落地（无行为变化）

- 新增 provider 接口与 brave adapter
- `web_search` 改为通过 adapter 调用
- 保持仅 brave 可用

### Phase B：零配置兜底

- 接入 `ddgs` adapter
- `provider=auto` 支持 brave -> ddgs

### Phase C：开放/自托管 provider

- 接入 `searxng`、`openserp`
- 增加 endpoint 健康检查

### Phase D：商业增强

- 接入 `tavily`、`serper`
- 完善 key 缺失与限流分类

---

## 9. 验收标准

- 显式 provider 调用行为可预测
- auto 模式可按顺序降级
- 各 provider 返回结构一致
- 错误码稳定，分类清晰
- `pnpm test:unit`、`pnpm test:mvp`、`pnpm typecheck` 通过

---

## 10. 风险与控制

- 风险：provider 数量增加导致复杂度上升
  - 控制：严格执行最小 adapter 接口
- 风险：免费/开放 provider 稳定性波动
  - 控制：保留 auto 降级与错误分类
- 风险：配置项扩展过快
  - 控制：先做最小字段，后续按需增量
