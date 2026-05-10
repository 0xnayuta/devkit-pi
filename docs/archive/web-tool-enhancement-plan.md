---
status: historical
audience: all
last_verified: 2026-05-09
completed_phases: [1, 2, 3, 4, 5, 6, 7]
---

# Web 工具增强计划

> 本文档已归档，仅保留为历史增强计划。当前行为请以 [Web Tools 运行时治理与可观测性](./web-tools-runtime-governance-and-observability.md)、[配置参考](../reference/configuration.md) 和代码为准。
>
> ✅ Phase 1-7 已完成（2026-05-09）

## 概述

当前 `pi-subagents` 的 web 工具（`web_search`、`fetch_content`、`get_search_content`）已具备基础功能。本计划为这些工具添加：

1. **可观测性** - 实时 activity 日志、请求统计、debug 分级 ✅
2. **开发者工具** - 诊断检查、agent 列表、执行日志 ✅
3. **测试覆盖** - 单元测试、provider mock、集成测试 ✅
4. **性能优化** - 搜索结果缓存、并发限制、连接池 ✅
5. **错误码扩展** - 结构化错误、recovery 建议 ✅
6. **UI 集成** - 交互式 TUI 面板 ✅
7. **工具输出折叠/展开** - `web_search`、`fetch_content`、`get_search_content` 默认摘要，Ctrl+O 展开完整内容 ✅

```
┌──────────────────────────────────────────────────────────────────┐
│                        增强后的能力                               │
├──────────────────────────────────────────────────────────────────┤
│  可观测性                                                          │
│  ├── 实时 activity 日志 (Ctrl+Shift+W)                            │
│  ├── 请求/响应统计                                                │
│  └── debug 日志分级 (false/minimal/verbose)                      │
│                                                                    │
│  开发者工具                                                        │
│  ├── /subagents doctor  - 配置检查                                │
│  ├── /subagents list    - agent 列表                             │
│  └── /subagents logs    - 最近执行日志                            │
│                                                                    │
│  测试覆盖                                                          │
│  ├── 单元测试 (observability, config, agent loading)              │
│  ├── Provider mock 测试                                           │
│  └── 集成测试 (spawn pi 进程)                                     │
│                                                                    │
│  性能优化                                                          │
│  ├── 搜索结果缓存 (基于 query hash)                               │
│  ├── 并发请求限制器 (semaphore)                                    │
│  └── 连接池管理 (HTTP keep-alive)                                 │
│                                                                    │
│  错误码扩展                                                        │
│  ├── WEB_SEARCH_FAILED / CONTENT_FETCH_FAILED                    │
│  ├── PROVIDER_RATE_LIMITED / INVALID_URL_FORMAT                   │
│  └── recovery 建议                                                │
│                                                                    │
│  输出折叠/展开                                                     │
│  ├── web_search 默认显示 query/result 计数摘要                    │
│  ├── fetch_content 默认显示 URL/content 摘要                      │
│  └── get_search_content 默认显示命中内容摘要，Ctrl+O 展开完整 JSON │
└──────────────────────────────────────────────────────────────────┘
```

---

## 一、可观测性增强

### 1.1 Activity 日志

参考 `pi-web-access` 的 activity widget，提供实时工具调用可视化。

#### 类型定义

```typescript
// src/web/observability.ts

export interface ActivityEntry {
  timestamp: number;
  type: "search" | "fetch" | "get_content";
  provider?: string;
  status: "pending" | "success" | "error" | "rate_limited";
  duration?: number;
  error?: string;
  requestId: string;
}

export interface WebToolStats {
  totalRequests: number;
  successCount: number;
  errorCount: number;
  rateLimitedCount: number;
  averageLatencyMs: number;
  providerStats: Map<string, ProviderStats>;
}

export interface ProviderStats {
  requests: number;
  errors: number;
  rateLimited: number;
  totalLatencyMs: number;
  successRate: number;
}
```

#### UI 显示格式

```
┌─────────────────────────────────────────────────────────┐
│  Web Search Activity                         [Ctrl+Shift+W] │
├─────────────────────────────────────────────────────────┤
│  EXA   "TypeScript best practices"     200   210ms ✓  │
│  GET   docs.example.com/guide          200   85ms  ✓  │
│  TAV   "react hooks"                  429   120ms ⚠  │
│  GET   blog.example.com/post           404   30ms  ✗  │
├─────────────────────────────────────────────────────────┤
│  Requests: 127  |  Success: 118  |  Rate Limited: 5    │
│  Errors: 9  |  Avg Latency: 145ms                       │
└─────────────────────────────────────────────────────────┘
```

### 1.2 Debug 日志分级

```typescript
export interface WebToolsConfig {
  // ...
  debug?: boolean | "minimal" | "verbose";
}
```

| 级别 | 输出内容 |
|------|----------|
| `false` | 仅错误 |
| `"minimal"` | 请求 + 响应状态 + timing |
| `"verbose"` | 完整请求/响应体、header、详细 timing |

---

## 二、开发者工具

### 2.1 命令设计

```text
/subagents doctor    # 检查配置、agent 加载、provider 状态
/subagents list      # 列出可用 agents（含自定义）
/subagents logs      # 查看最近执行日志（含子代理调用）
```

### 2.2 `/subagents doctor`

诊断检查项：

| 检查项 | 内容 |
|--------|------|
| config | 配置文件存在、格式正确 |
| agents | builtin/user/project agents 加载情况 |
| providers | 各 provider 可用性测试 |
| permissions | 目录权限检查 |

输出示例：

```
╔══════════════════════════════════════════════════════╗
║  Subagent Doctor - Diagnostic Report                  ║
╠══════════════════════════════════════════════════════╣
│  [PASS]  Configuration loaded from ~/.pi/agent/...    │
│  [PASS]  5 builtin agents discovered                  │
│  [WARN]  2 user agents skipped (parse error)         │
│  [PASS]  Provider ddgs responds correctly             │
│  [FAIL]  Provider tavily not configured               │
│  [PASS]  Results directory writable                  │
╠══════════════════════════════════════════════════════╣
│  Summary: 4 passed, 1 failed, 1 warnings              ║
╚══════════════════════════════════════════════════════╝
```

### 2.3 `/subagents list`

```
Available Agents (7)
────────────────────
[builtin]
  explorer      Codebase navigation and file search
  researcher    Web research and information synthesis
  reviewer      Code review and quality assessment
  implementer   Implementation planning
  tester        Test planning and strategy

[user]
  custom-review Project-specific code reviewer
  api-expert    API documentation specialist

Use: subagent({ agent: "explorer", task: "..." })
```

### 2.4 `/subagents logs`

```
Recent Activity (last 20)
─────────────────────────
14:32:15  web_search     exa        "rust async"       200  245ms ✓
14:32:08  fetch_content  ddgs       github.com/...      200  1.2s  ✓
14:31:55  web_search     tavily     "react hooks"       429  180ms ⚠
14:31:42  fetch_content  -          example.com/docs    -    -    ✗
14:31:30  subagent       explorer   "find auth module"  0    3.4s  ✓

Full logs: /tmp/pi-subagents-uid-xxx/results/
```

---

## 三、测试覆盖

### 3.1 测试策略

```
tests/
├── unit/                    # 单元测试
│   ├── observability.test.ts   # 可观测性：activity log、stats、debug logging
│   ├── errors.test.ts          # 错误码：映射、recovery、格式化
│   ├── cache.test.ts           # 缓存：LRU、hit/miss、global instance
│   ├── concurrency.test.ts     # 并发限制：semaphore、queue、reset
│   ├── web-search.test.ts      # web_search：providers、错误分类、DDGS
│   ├── web-fetch.test.ts       # fetch_content：安全限制、内容类型
│   ├── web-storage.test.ts     # get_search_content：存储、回读、truncate
│   ├── activity-panel.test.ts  # TUI 面板：render、keyboard input
│   ├── collect-output.test.ts  # 输出收集：JSONL 解析、fallback
│   ├── path-handling.test.ts   # 跨平台路径处理
│   ├── pi-spawn.test.ts        # pi 进程启动
│   ├── subagent-prompt-runtime.test.ts  # prompt runtime
│   └── commands/
│       ├── doctor.test.ts      # /subagents doctor
│       ├── list.test.ts        # /subagents list
│       └── logs.test.ts        # /subagents logs
├── mvp/unit/                 # MVP 测试套件
│   ├── builtin-agents.test.ts  # 5 个内置 agent 发现
│   ├── config-loading.test.ts  # 配置加载、MVP error codes
│   └── frontmatter.test.ts     # frontmatter 解析、user agents
└── mocks/providers/
    └── ddgs.ts                # DDGS provider mock
```

### 3.2 单元测试覆盖

#### Observability 模块

```typescript
// tests/unit/observability.test.ts

describe("observability - configuration", () => {
  it("should default debug level to false", () => { ... });
  it("should support minimal/verbose debug level", () => { ... });
});

describe("observability - stats", () => {
  it("tracks search success/error/rate-limited and fetch success/error", () => { ... });
  it("aggregates provider stats with success rate", () => { ... });
  it("calculates average latency and resets correctly", () => { ... });
});

describe("observability - activity log", () => {
  it("should record search/fetch activity entries", () => { ... });
  it("should limit activity log to 100 entries", () => { ... });
  it("should clear activity log", () => { ... });
});

describe("observability - debug logging", () => {
  it("does not output logs when debug is disabled", () => { ... });
  it("outputs minimal/verbose debug logs when enabled", () => { ... });
  it("debug logs can be toggled on and off", () => { ... });
});
```

#### Web Tools 模块

```typescript
// tests/unit/web-search.test.ts

describe("web_search", () => {
  it("returns structured error when query is missing", () => { ... });
  it("uses ddgs by default when no commercial keys are set", () => { ... });
  it("prefers keyed commercial providers in auto mode", () => { ... });
  it("supports explicit providers (tavily, serper, searxng, brave, openserp)", () => { ... });
  it("classifies provider rate limit errors", () => { ... });
  it("classifies timeout/abort with actionable guidance", () => { ... });
  it("caps ddgs results at 5 regardless of numResults request", () => { ... });
  it("normalizes multiple queries and stores search results", () => { ... });
});

// tests/unit/web-fetch.test.ts

describe("fetch_content", () => {
  it("returns structured error when URL is missing", () => { ... });
  it("rejects non-http URLs (file://)", () => { ... });
  it("rejects localhost/private URLs before fetching", () => { ... });
  it("rejects unsupported content types (json, image, binary)", () => { ... });
  it("falls back to Jina reader for JS-heavy pages when enabled", () => { ... });
  it("limits the number of response bytes read", () => { ... });
});

// tests/unit/web-storage.test.ts

describe("web storage get_search_content", () => {
  it("returns clear error for unknown responseId", () => { ... });
  it("retrieves fetch content by urlIndex/url", () => { ... });
  it("retrieves search content by queryIndex/query", () => { ... });
  it("returns actionable hints for selector errors", () => { ... });
  it("enforces storage max entries and per-item size", () => { ... });
});
```

#### MVP 测试套件

```typescript
// tests/mvp/unit/builtin-agents.test.ts

describe("MVP Built-in Agents Discovery", () => {
  it("[MVP TARGET] discovers exactly 5 builtin agents", () => { ... });
  it("[MVP TARGET] each builtin agent has required properties", () => { ... });
  it("[MVP TARGET] explorer has safe exploration tools", () => { ... });
  it("[MVP TARGET] researcher has web search, reviewer has read/grep", () => { ... });
});

describe("MVP Removed Builtin Agents", () => {
  it("[MVP TARGET] legacy agents are not present", () => { ... });
});

// tests/mvp/unit/config-loading.test.ts

describe("MVP Config Loading", () => {
  it("has correct MVP default values", () => { ... });
  it("has correct webTools providerPriority", () => { ... });
  it("merges partial webTools config with defaults", () => { ... });
  it("validates depth and timeout ranges", () => { ... });
  it("has exactly 8 error codes", () => { ... });
  it("SubagentParams has required agent/task, excludes legacy params", () => { ... });
});

// tests/mvp/unit/frontmatter.test.ts

describe("MVP Simple Frontmatter Parsing", () => {
  it("parses name, description, readonly, tools, and systemPrompt", () => { ... });
  it("sets source to 'project' for project agents", () => { ... });
});

describe("MVP Removed Frontmatter Features", () => {
  it("does not parse 'package', 'inheritSkills', 'defaultContext' frontmatter", () => { ... });
});
```

### 3.5 测试命令

```bash
# 运行所有测试
pnpm test

# 运行单元测试
pnpm test:unit

# 运行 MVP 测试套件
pnpm test:mvp

# 一键格式化 + 检查
pnpm lint:fix

# 类型检查
pnpm typecheck

# 文档一致性检查
pnpm docs:check
```

---

## 四、性能优化

### 4.1 搜索结果缓存

基于 query hash 的智能缓存，减少重复请求。

```typescript
// src/web/cache.ts

export interface CacheConfig {
  enabled: boolean;
  maxEntries: number;
  ttlMs: number;
  hashFn: (query: string, options?: SearchOptions) => string;
}

interface CacheEntry {
  key: string;
  results: NormalizedSearchResult[];
  timestamp: number;
  hitCount: number;
}

export class SearchResultCache {
  private cache: Map<string, CacheEntry> = new Map();
  private hitStats: Map<string, number> = new Map();

  constructor(private config: CacheConfig) {}

  get(query: string, options?: SearchOptions): NormalizedSearchResult[] | null {
    const key = this.config.hashFn(query, options);
    const entry = this.cache.get(key);

    if (!entry) return null;

    // Check TTL
    if (Date.now() - entry.timestamp > this.config.ttlMs) {
      this.cache.delete(key);
      return null;
    }

    // Update hit stats
    entry.hitCount++;
    this.hitStats.set(key, (this.hitStats.get(key) || 0) + 1);

    return entry.results;
  }

  set(query: string, options: SearchOptions | undefined, results: NormalizedSearchResult[]): void {
    if (this.cache.size >= this.config.maxEntries) {
      // Evict least recently used entry
      const lruKey = this.findLRUEntry();
      this.cache.delete(lruKey);
      this.hitStats.delete(lruKey);
    }

    const key = this.config.hashFn(query, options);
    this.cache.set(key, {
      key,
      results,
      timestamp: Date.now(),
      hitCount: 1,
    });
  }

  getStats(): { hits: number; misses: number; hitRate: number } {
    const total = Array.from(this.hitStats.values()).reduce((a, b) => a + b, 0);
    return {
      hits: total,
      misses: this.cache.size - total,
      hitRate: total / this.cache.size,
    };
  }
}
```

#### 配置

```typescript
// src/config/load-config.ts

export interface WebToolsConfig {
  cache?: {
    enabled?: boolean;
    maxEntries?: number;   // default: 50
    ttlMs?: number;        // default: 5 minutes
  };
}
```

### 4.2 并发请求限制器

使用 semaphore 模式限制并发请求数。

```typescript
// src/web/concurrency.ts

export class RequestThrottler {
  private semaphore: AsyncSemaphore;
  private queue: number = 0;
  private active: number = 0;

  constructor(
    private maxConcurrent: number = 3,
    private maxQueueSize: number = 10
  ) {
    this.semaphore = new AsyncSemaphore(maxConcurrent);
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.active >= this.maxConcurrent && this.queue >= this.maxQueueSize) {
      throw new RateLimitError("Request queue full");
    }

    this.queue++;
    try {
      this.active++;
      return await this.semaphore.run(fn);
    } finally {
      this.active--;
      this.queue--;
    }
  }

  getStats() {
    return {
      active: this.active,
      queued: this.queue,
      maxConcurrent: this.maxConcurrent,
      maxQueue: this.maxQueueSize,
    };
  }
}

// 使用示例
const throttler = new RequestThrottler(3, 10);

async function fetchWithThrottle(url: string) {
  return throttler.execute(() => fetch(url));
}
```

### 4.3 连接池管理

```typescript
// src/web/http-pool.ts

export class HttpConnectionPool {
  private agent: http.Agent;
  private stats = { totalRequests: 0, failedRequests: 0 };

  constructor(maxSockets: number = 10) {
    this.agent = new http.Agent({
      keepAlive: true,
      maxSockets,
      maxFreeSockets: maxSockets / 2,
      timeout: 60000,
      scheduling: "fifo",
    });
  }

  async fetch(url: string, options?: RequestInit): Promise<Response> {
    const startTime = performance.now();

    try {
      const response = await fetch(url, {
        ...options,
        agent: this.agent,
      });
      this.stats.totalRequests++;
      return response;
    } catch (error) {
      this.stats.failedRequests++;
      throw error;
    }
  }

  getStats() {
    return {
      ...this.stats,
      failureRate: this.stats.failedRequests / this.stats.totalRequests,
    };
  }

  destroy() {
    this.agent.destroy();
  }
}

// 全局实例
let globalPool: HttpConnectionPool | null = null;

export function getConnectionPool(): HttpConnectionPool {
  if (!globalPool) {
    globalPool = new HttpConnectionPool(10);
  }
  return globalPool;
}
```

### 4.4 配置选项

```typescript
// src/config/load-config.ts

export interface WebToolsConfig {
  // ... existing config ...

  cache?: {
    enabled?: boolean;
    maxEntries?: number;    // default: 50
    ttlMs?: number;          // default: 300000 (5min)
  };

  concurrency?: {
    maxConcurrent?: number;  // default: 3
    maxQueueSize?: number;   // default: 10
  };

  connectionPool?: {
    maxSockets?: number;     // default: 10
  };
}
```

---

## 五、错误码扩展

### 5.1 当前错误码

```typescript
// 已有 (MVP_ERROR_CODES)
INVALID_INPUT
SUBAGENTS_DISABLED
UNKNOWN_AGENT
SUBAGENT_DISABLED
SUBAGENT_DEPTH_EXCEEDED
SUBAGENT_TIMEOUT
SUBAGENT_FAILED
SUBAGENT_OUTPUT_TRUNCATED
```

### 5.2 新增 Web 工具错误码

```typescript
// src/web/errors.ts

export const WEB_ERROR_CODES = {
  // Search 错误
  WEB_SEARCH_FAILED: "WEB_SEARCH_FAILED",
  WEB_SEARCH_TIMEOUT: "WEB_SEARCH_TIMEOUT",
  WEB_SEARCH_NO_RESULTS: "WEB_SEARCH_NO_RESULTS",
  WEB_SEARCH_INVALID_QUERY: "WEB_SEARCH_INVALID_QUERY",

  // Fetch 错误
  CONTENT_FETCH_FAILED: "CONTENT_FETCH_FAILED",
  CONTENT_FETCH_TIMEOUT: "CONTENT_FETCH_TIMEOUT",
  CONTENT_FETCH_INVALID_URL: "CONTENT_FETCH_INVALID_URL",
  CONTENT_FETCH_TOO_LARGE: "CONTENT_FETCH_TOO_LARGE",

  // Provider 错误
  PROVIDER_RATE_LIMITED: "PROVIDER_RATE_LIMITED",
  PROVIDER_UNAVAILABLE: "PROVIDER_UNAVAILABLE",
  PROVIDER_AUTH_FAILED: "PROVIDER_AUTH_FAILED",

  // 通用错误
  NETWORK_ERROR: "NETWORK_ERROR",
  PARSE_ERROR: "PARSE_ERROR",
  CACHE_ERROR: "CACHE_ERROR",
} as const;

export type WebErrorCode = typeof WEB_ERROR_CODES[keyof typeof WEB_ERROR_CODES];
```

### 5.3 错误结构与 Recovery

```typescript
// src/web/errors.ts

export interface WebError {
  code: WebErrorCode;
  message: string;
  provider?: string;
  originalError?: Error;
  recovery?: RecoverySuggestion;
  retryable: boolean;
}

export interface RecoverySuggestion {
  action: "retry" | "fallback" | "skip" | "abort";
  nextProvider?: string;
  waitMs?: number;
  description: string;
}

export const ERROR_RECOVERY_MAP: Record<WebErrorCode, RecoverySuggestion> = {
  WEB_SEARCH_FAILED: {
    action: "fallback",
    nextProvider: "auto",
    description: "Fallback to next available provider",
  },
  PROVIDER_RATE_LIMITED: {
    action: "retry",
    waitMs: 5000,
    description: "Rate limit hit, waiting before retry",
  },
  PROVIDER_AUTH_FAILED: {
    action: "abort",
    description: "Check API key configuration",
  },
  CONTENT_FETCH_TIMEOUT: {
    action: "fallback",
    nextProvider: "jina",
    description: "Fetch timed out, try Jina Reader fallback",
  },
  NETWORK_ERROR: {
    action: "retry",
    waitMs: 1000,
    description: "Network error, retry with backoff",
  },
  // ... more mappings
};
```

### 5.4 错误处理示例

```typescript
// src/web/search.ts

async function executeSearch(query: string, config: ResolvedWebToolsConfig) {
  for (const providerName of config.providerPriority) {
    const provider = getProvider(providerName);

    try {
      return await provider.search(query);
    } catch (error) {
      const webError = mapErrorToWebError(error, providerName);

      // 记录到 activity
      recordActivity({
        type: "search",
        provider: providerName,
        status: "error",
        error: webError.message,
      });

      const recovery = ERROR_RECOVERY_MAP[webError.code];

      if (recovery.action === "abort") {
        throw webError;
      }

      if (recovery.action === "retry" && recovery.waitMs) {
        await sleep(recovery.waitMs);
        continue;
      }

      // Fallback to next provider
      continue;
    }
  }

  throw {
    code: WEB_ERROR_CODES.WEB_SEARCH_FAILED,
    message: "All providers failed",
    retryable: false,
    recovery: { action: "abort", description: "No providers available" },
  };
}
```

### 5.5 错误日志格式

```typescript
// 结构化错误日志，便于诊断
interface ErrorLogEntry {
  timestamp: number;
  requestId: string;
  operation: "search" | "fetch";
  provider: string;
  error: WebError;
  context: {
    query?: string;
    url?: string;
    attempt: number;
    durationMs: number;
  };
}
```

---

## 六、实施计划

### Phase 1: 可观测性核心 (1-2 天)

```
src/web/
├── observability.ts       # 新增：Activity 日志、统计追踪
├── providers/
│   └── ddgs.ts            # 集成 activity 记录
└── index.ts              # 导出 observability API
```

实现步骤：
- [ ] 创建 `src/web/observability.ts`
- [ ] 定义 `ActivityEntry`、`WebToolStats` 类型
- [ ] 实现 `recordActivity()`、`getStats()`、`resetStats()`
- [ ] 在 `fetch.ts`、`search.ts` 中集成 activity 记录
- [ ] 添加 debug 配置选项和分级日志

### Phase 2: 开发者工具 (1 天)

```
src/extension/
├── commands/
│   ├── doctor.ts          # 新增：诊断检查
│   ├── list.ts            # 新增：agent 列表
│   └── logs.ts            # 新增：执行日志
└── index.ts              # 注册命令
```

实现步骤：
- [ ] 创建 `src/extension/commands/` 目录
- [ ] 实现 `doctor.ts`：配置检查、agent 验证、provider 测试
- [ ] 实现 `list.ts`：格式化 agent 列表输出
- [ ] 实现 `logs.ts`：读取并展示 activity 日志
- [ ] 在 `index.ts` 中注册命令

### Phase 3: 测试框架 (1.5 天)

实现步骤：
- [x] 设置 Node.js 原生测试框架 (`node:test`)
- [x] 创建 mock utilities (`tests/mocks/providers/ddgs.ts`)
- [x] 实现 observability 单元测试 (`tests/unit/observability.test.ts`)
- [x] 实现 cache 单元测试 (`tests/unit/cache.test.ts`)
- [x] 实现 concurrency 单元测试 (`tests/unit/concurrency.test.ts`)
- [x] 实现 errors 单元测试 (`tests/unit/errors.test.ts`)
- [x] 实现 web-search/fetch/storage 单元测试
- [x] 实现 activity-panel 单元测试 (`tests/unit/activity-panel.test.ts`)
- [x] 实现 commands 单元测试 (`doctor, list, logs`)
- [x] 实现 collect-output 单元测试 (`tests/unit/collect-output.test.ts`)
- [x] 实现 MVP 测试套件 (`tests/mvp/unit/`)
- [x] 添加 npm scripts (`test:unit`, `test:mvp`)

### Phase 4: 性能优化 (1-2 天)

```
src/web/
├── cache.ts              # 新增：搜索结果缓存
├── concurrency.ts        # 新增：并发限制器
└── http-pool.ts          # 新增：连接池管理
```

实现步骤：
- [x] 实现 `SearchResultCache` 类
- [x] 实现 `RequestThrottler` 类
- [x] 实现 `HttpConnectionPool` 类
- [x] 在 provider 中集成缓存
- [x] 在 fetch 中集成 throttler
- [x] 添加配置选项

### Phase 5: 错误码扩展 (0.5 天)

```
src/web/
├── errors.ts             # 新增：错误码定义
└── errors.ts             # 修改：更新 search.ts、fetch.ts
```

实现步骤：
- [x] 定义 `WEB_ERROR_CODES` 常量
- [x] 定义 `WebError` 和 `RecoverySuggestion` 接口
- [x] 实现 `ERROR_RECOVERY_MAP`
- [x] 实现 `mapErrorToWebError()` 函数
- [x] 更新 `search.ts` 使用新的错误处理
- [x] 更新 `fetch.ts` 使用新的错误处理

### Phase 6: UI 集成与收尾 (0.5 天)

- [x] 添加 `/subagents activity` 命令
- [x] 实现交互式 TUI 显示层
- [x] 添加 session 生命周期清理
- [x] 更新 `docs/archive/web-tools-runtime-governance-and-observability.md`

### Phase 7: Web 工具输出折叠/展开渲染增强 (0.5-1 天)

目标：利用 pi `ToolExecutionComponent` 的 `expanded` 渲染机制，为 `web_search`、`fetch_content`、`get_search_content` 添加自定义 `renderCall` / `renderResult`，让工具默认只展示摘要，用户按 `Ctrl+O`（`app.tools.expand`）时展开查看完整内容。

#### 设计原则

- **不改变工具执行结果**：`execute()`、`content`、`details` 保持兼容，LLM 上下文可见内容不因 TUI 摘要而减少。
- **仅优化 TUI 展示**：摘要/完整视图只影响交互界面渲染。
- **默认简洁**：收起态显示可判断成功/失败和定位来源的关键信息。
- **展开可审计**：展开态应显示完整 JSON 或足够完整的结构化内容，便于用户复制、排查和验证。
- **错误优先可见**：错误结果在收起态也必须显示错误码、message、recovery 建议摘要。
- **处理 partial**：`isPartial` 时显示进行中状态，例如 `Searching...` / `Fetching...` / `Loading cached content...`。

#### 工具渲染策略

| 工具 | 收起态摘要 | 展开态内容 |
|------|------------|------------|
| `web_search` | query 数量、结果数量、responseId、前 3 条标题/URL | 完整 `details` JSON 或格式化后的所有查询与结果 |
| `fetch_content` | URL 数量、responseId、每个 URL 的状态、标题/域名、前 300-500 字内容摘要 | 完整 `details` JSON 或按 URL 分组的完整提取文本 |
| `get_search_content` | responseId、选择器（url/urlIndex/query/queryIndex）、命中条目数、内容长度、前 300-500 字 | 完整返回内容，必要时保留 JSON 结构 |

#### 实现位置

当前三个 web 工具在 `src/web/index.ts` 的 `registerWebTools()` 中注册。Phase 7 优先在已有工具定义上直接增加 renderer，而不是重新注册同名工具：

```typescript
pi.registerTool({
  name: "fetch_content",
  label: "Fetch Content",
  description: "Fetch HTTP/HTTPS URL content and extract readable text. Readonly.",
  parameters: FetchContentParams as any,
  execute(_id: string, params: FetchContentInput, signal: AbortSignal) {
    return fetchContent(params, config, signal).then(asToolResult);
  },
  renderCall(args, theme, context) { /* concise call line */ },
  renderResult(result, { expanded, isPartial }, theme, context) { /* summary/full */ },
} as any);
```

建议抽取公共渲染工具，避免三个 renderer 重复处理 JSON、截断、错误和 ANSI 样式：

```
src/web/
├── index.ts              # 注册 renderCall/renderResult
└── renderers.ts          # 新增：web tool TUI render helpers
```

#### 建议新增 helper

```typescript
// src/web/renderers.ts
export function safeStringify(value: unknown): string;
export function truncateText(text: string, maxChars: number): { text: string; truncated: boolean };
export function getTextContent(result: AgentToolResult<any>): string;
export function renderJsonSummary(...): Component;
export function renderWebSearchResult(...): Component;
export function renderFetchContentResult(...): Component;
export function renderGetSearchContentResult(...): Component;
```

#### 配置建议

为避免硬编码摘要长度，可扩展 `webTools.ui` 配置，默认开启：

```typescript
webTools: {
  ui?: {
    compactResults?: boolean;        // default: true
    summaryChars?: number;           // default: 500
    maxPreviewItems?: number;        // default: 3
    expandedMaxChars?: number;       // default: 0 表示不额外截断，由工具原结果限制控制
    showExpandHint?: boolean;        // default: true
  }
}
```

若为了保持 MVP 极简，也可以先不新增配置，使用内部常量实现；后续再按需求配置化。

#### 测试计划

新增或扩展单元测试，覆盖：

- [ ] `renderCall` 能正确显示 query / URL / responseId 关键信息
- [ ] 收起态不输出完整大段内容，只输出摘要和展开提示
- [ ] 展开态输出完整内容或完整结构化 JSON
- [ ] `isPartial` 显示进行中状态
- [ ] 错误结果收起态显示错误码与 recovery 摘要
- [ ] 多 URL / 多 query 场景的摘要稳定、可读
- [ ] 空结果、未知 responseId、selector 错误的渲染不会抛异常

建议测试文件：

```
tests/unit/web-renderers.test.ts
```

#### 验收标准

| 功能 | 验收条件 | 状态 |
|------|----------|------|
| `web_search` 摘要渲染 | 默认只显示查询、结果数、responseId、前几条结果 | ✅ |
| `fetch_content` 摘要渲染 | 默认只显示 URL、状态、内容摘要、responseId | ✅ |
| `get_search_content` 摘要渲染 | 默认只显示选择器、命中数、内容长度、摘要 | ✅ |
| Ctrl+O 展开 | 展开态可查看完整内容 | ✅ |
| 错误结果可读 | 收起态显示错误码、message、recovery | ✅ |
| 测试覆盖 | renderer 单元测试覆盖摘要/展开/错误/partial | ✅ |

---

## 七、文件变更摘要

| 文件 | 操作 | 描述 |
|------|------|------|
| `src/web/observability.ts` | 新增 | Activity 日志与统计追踪 |
| `src/web/cache.ts` | 新增 | 搜索结果缓存 |
| `src/web/concurrency.ts` | 新增 | 并发请求限制器 |
| `src/web/http-pool.ts` | 新增 | HTTP 连接池 |
| `src/web/errors.ts` | 新增 | 错误码定义与 recovery |
| `src/web/renderers.ts` | 新增 | Web 工具折叠/展开 TUI 渲染 helper（Phase 7） |
| `src/web/fetch.ts` | 修改 | 集成 activity、throttler、error 处理 |
| `src/web/search.ts` | 修改 | 集成 activity、cache、error 处理 |
| `src/extension/commands/doctor.ts` | 新增 | 诊断检查命令 |
| `src/extension/commands/list.ts` | 新增 | agent 列表命令 |
| `src/extension/commands/logs.ts` | 新增 | 执行日志命令 |
| `src/extension/commands/activity.ts` | 新增 | 交互式 TUI 面板 |
| `src/extension/index.ts` | 修改 | 注册开发者命令 |
| `src/shared/types.ts` | 修改 | 添加相关类型 |
| `src/config/load-config.ts` | 修改 | 添加缓存、并发、连接池配置，可选添加 webTools.ui 配置 |
| `tests/unit/web-renderers.test.ts` | 新增 | Phase 7 renderer 摘要/展开/错误/partial 测试 |
| `tests/unit/*.test.ts` | 新增 | 各类单元测试 |
| `tests/mocks/providers/*.ts` | 新增 | Provider mocks |

---

## 八、向后兼容性

- 所有新增功能默认启用，可通过配置关闭
- 现有工具执行结果和 LLM 上下文内容不变
- Phase 7 仅改变交互式 TUI 展示，不改变 `content` / `details` 数据结构
- 新错误码仅在使用新功能时触发
- 不会引入新的外部依赖（使用原生 `node:http` 和已有测试框架）

---

## 九、验收标准

| 功能 | 验收条件 | 状态 |
|------|----------|------|
| Activity 日志 | `/subagents logs` 显示最近调用记录 | ✅ |
| 统计信息 | 显示 success/error/rate_limited 数量、平均延迟 | ✅ |
| Activity Panel | `/subagents activity` 交互式 TUI 面板 | ✅ |
| debug 分级 | `debug: "verbose"` 时输出完整请求详情 | ✅ |
| `/subagents doctor` | 输出配置、agent、provider 诊断结果 | ✅ |
| `/subagents list` | 列出所有 builtin/user/project agents | ✅ |
| `/subagents logs` | 显示最近工具调用历史 | ✅ |
| 单元测试覆盖 | observability、config、agent-loading、errors > 80% | ✅ |
| Provider mock | ddgs、tavily、searxng 可 mock | ✅ |
| 缓存 | 相同 query 不触发重复请求 | ✅ |
| 并发限制 | 同时不超过 3 个请求 | ✅ |
| 连接池 | keep-alive 复用连接 | ✅ |
| 错误码 | 包含 14 个结构化错误码 | ✅ |
| Recovery | 每个错误码有对应的 recovery 建议 | ✅ |
| Web 工具摘要渲染 | `web_search`、`fetch_content`、`get_search_content` 默认只显示摘要 | ✅ |
| Web 工具展开渲染 | `Ctrl+O` 展开后可查看完整内容 | ✅ |
| Renderer 测试 | 覆盖摘要、展开、错误、partial、多 URL/多 query 场景 | ✅ |

---

## 十、测试结果

```bash
pnpm test:unit  # 144 tests, 26 suites, all passed
```

Phase 7 新增 `tests/unit/web-renderers.test.ts`。