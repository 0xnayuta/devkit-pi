---
status: current
audience: all
last_verified: 2026-05-12
---

# `fetch_content` 内容类型增强

本文档记录 `fetch_content` 工具在 Phase 1-5 中的内容类型检测增强、handler 架构重构和安全配置变更。当前 `fetch_content` public API、配置和错误码以 [Web tools reference](../reference/web-tools.md)、[Configuration reference](../reference/configuration.md) 与 [Web tools error codes](../reference/web-tools-error-codes.md) 为准。

## 支持的内容类型

### 内容检测优先级

`fetch_content` 按以下顺序识别内容类型：

1. **HTTP Content-Type header** — 优先使用服务器返回的 MIME 类型
2. **URL 文件后缀** — 当 Content-Type 不准确时（如 `application/octet-stream`），根据 URL 后缀识别
3. **Magic bytes** — 检测前 8 字节是否匹配已知二进制签名（PDF/ZIP/图片/音频/视频等）
4. **text/\* fallback** — 未知 `text/*` 子类型作为纯文本处理
5. **通用 fallback** — `application/octet-stream` 等无法判断的类型，fallback 为纯文本

### 已支持的文本类类型

| 类型 | Content-Type | URL 后缀 | 处理方式 |
|------|-------------|----------|---------|
| **HTML** | `text/html` | `.html`, `.htm` | 提取正文、去 script/style、提取 title |
| **Markdown** | `text/markdown`, `text/x-markdown` | `.md`, `.markdown` | 保留原文，空白规范化 |
| **JSON** | `application/json`, `application/*+json` | `.json` | pretty print；大数组限制前 50 项；JSON-LD 提取关键字段 |
| **CSV / TSV** | `text/csv`, `text/tab-separated-values` | `.csv`, `.tsv` | 解析为 Markdown table，限制 100 行 × 20 列 |
| **XML / RSS / Atom** | `application/xml`, `text/xml`, `application/rss+xml`, `application/atom+xml` | `.xml`, `.rss`, `.atom` | RSS/Atom 提取 feed entries；普通 XML 保留结构 |
| **YAML** | `text/yaml`, `text/x-yaml`, `application/yaml` | `.yml`, `.yaml` | 空白规范化，按文本返回 |
| **纯文本** | `text/plain` | `.txt`, `.log` 等 | 空白规范化 |
| **源码** | `text/css`, `text/javascript`, `application/javascript`, `application/typescript` | `.js`, `.ts`, `.css`, `.py`, `.go`, `.rs` 等 | 按源码文本返回，不执行不格式化 |

### 不支持的类型

以下类型会被明确拒绝，返回友好的错误信息：

- **文档格式**：`.pdf`, `.doc`, `.docx`, `.xls`, `.xlsx`, `.ppt`, `.pptx`, `.odt`, `.ods`, `.odp`
- **压缩包**：`.zip`, `.tar`, `.gz`, `.bz2`, `.xz`, `.rar`, `.7z`
- **可执行文件**：`.exe`, `.dll`, `.so`, `.dylib`, `.msi`, `.deb`, `.rpm`, `.apk`, `.class`, `.jar`
- **图片**：`image/*`（通过 Content-Type 拦截）
- **音频/视频**：`audio/*`, `video/*`（通过 Content-Type 拦截）
- **其他二进制**：通过 magic bytes 检测的 PDF/ZIP/ELF/图片/音频/视频等 24 种签名

当遇到不支持的类型时，`fetch_content` 返回错误，**不会**引导 agent 调用尚未实现的 `convert_content` 工具。

## Jina Reader Fallback

当 HTML 页面内容过少或被 JS 渲染时，`fetch_content` 可以使用 [Jina Reader](https://r.jina.ai/) 获取可读内容。

### 触发条件

| 触发类型 | 说明 | 默认启用 |
|---------|------|---------|
| `short-html` | 提取的正文 < 200 字符 | ✅ |
| `js-heavy-html` | 页面有 > 3 个 script 标签且可见文本 < 200 字符 | ✅ |
| `preferReader` | 用户在 `fetch_content` 参数中显式设置 `preferReader: true` | 始终生效 |

### 配置

```json
{
  "web": {
    "enableJinaFallback": false,
    "jinaTriggers": ["short-html", "js-heavy-html"],
    "jinaTimeoutMs": 8000
  }
}
```

- `enableJinaFallback` — 主开关，默认 `false`
- `jinaTriggers` — 自动触发条件列表；设为 `[]` 可禁用所有自动触发（`preferReader` 仍生效于公共 URL）
- `jinaTimeoutMs` — Jina 请求超时，默认 8000ms

Jina Reader 是外部服务。即使 `allowPrivateNetwork: true`，`fetch_content` 也不会把 localhost、私有 IP、`.local`、`.internal` 等私网 URL 发送给 Jina，以避免泄露本地/内网地址。

### `preferReader` 参数

`fetch_content` 工具支持 `preferReader: boolean` 参数。当设为 `true` 且 `enableJinaFallback` 为 `true` 时，无论页面内容如何，都会尝试使用 Jina Reader。

```
fetch_content({ url: "https://example.com", preferReader: true })
```

此参数优先于 `jinaTriggers` 配置；但出于安全考虑，私网 URL 不会被发送给 Jina。

## 安全配置

### 已有安全措施

| 措施 | 默认值 | 说明 |
|------|--------|------|
| 下载大小限制 | 1 MB (`maxResponseBytes: 1048576`) | 流式字节计数，超出后截断；Jina Reader 响应也受此限制 |
| 输出长度限制 | 30,000 字符 (`maxContentChars: 30000`) | 截断后返回 `truncated: true` |
| 请求超时 | 10s (`timeoutMs: 10000`) | AbortSignal 超时 |
| 私网 URL 拦截 | 默认拦截 | localhost、127/10/172.16-31/192.168/169.254 等 |
| DNS 解析验证 | 启用 | 解析后二次检查是否为私有 IP |
| 重定向限制 | 5 次 (`MAX_REDIRECTS = 5`) | 防止重定向循环 |
| 二进制检测 | 启用 | 24 种 magic bytes 签名，快速拒绝已知二进制格式 |

### `allowPrivateNetwork`

默认值：`false`

当设为 `true` 时，允许 `fetch_content` 访问 localhost 和私有 IP 地址。适用于个人本地开发工具场景（如访问 `http://localhost:3000` 的开发服务器）。

```json
{
  "web": {
    "allowPrivateNetwork": true
  }
}
```

**启用后的行为变化**：

- ✅ 可访问 `localhost`、`127.0.0.1`、`10.x.x.x`、`192.168.x.x` 等
- ✅ 可访问 `.local`、`.internal` 等私有主机名
- ⚠️ URL 格式校验仍然生效（无效 URL 仍被拒绝）
- ⚠️ 协议限制仍然生效（仅允许 `http:` / `https:`）

**安全建议**：仅在受信任的本地环境中启用。在共享或公共环境中保持默认的 `false`。

## Handler 架构

`fetch_content` 使用可插拔的 handler 体系处理不同内容类型。每种内容类型由对应的 handler 负责解析和格式化。

### Handler 列表

| Handler | 职责 |
|---------|------|
| `HtmlHandler` | HTML → 文本提取，提取 title |
| `PlainTextHandler` | 纯文本、Markdown、YAML、源码 → 空白规范化 |
| `JsonHandler` | JSON → pretty print / JSON-LD 提取 |
| `CsvTsvHandler` | CSV/TSV → Markdown table |
| `XmlHandler` | XML → RSS/Atom 提取或结构化文本 |
| `YamlHandler` | YAML → 空白规范化 |
| `UnsupportedHandler` | 不支持的类型 → 抛出错误 |

### Parse 失败降级

当 handler 的解析过程出错时，会自动降级为纯文本返回原始内容，并在结果中标注 `parseWarning` 字段。例如，JSON handler 收到无效 JSON 时，会按纯文本返回并设置 `parseWarning: "Invalid JSON, returned as plain text"`。

## 配置参考

完整的 `web` 配置项（`~/.pi/agent/extensions/devkit-pi/config.json`）：

```json
{
  "web": {
    "enabled": true,
    "provider": "ddgs",
    "timeoutMs": 10000,
    "maxResponseBytes": 1048576,
    "maxContentChars": 30000,
    "maxResults": 5,
    "enableJinaFallback": false,
    "jinaTriggers": ["short-html", "js-heavy-html"],
    "jinaTimeoutMs": 8000,
    "allowPrivateNetwork": false,
    "debug": false
  }
}
```

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `enabled` | `boolean` | `true` | 启用/禁用 web 工具 |
| `provider` | `string` | `"ddgs"` | 搜索引擎提供者 |
| `timeoutMs` | `number` | `10000` | 请求超时（毫秒） |
| `maxResponseBytes` | `number` | `1048576` | 最大下载字节数 |
| `maxContentChars` | `number` | `30000` | 最大输出字符数 |
| `maxResults` | `number` | `5` | 搜索结果数量 |
| `enableJinaFallback` | `boolean` | `false` | 启用 Jina Reader fallback |
| `jinaTriggers` | `string[]` | `["short-html", "js-heavy-html"]` | 自动触发 Jina 的条件 |
| `jinaTimeoutMs` | `number` | `8000` | Jina 请求超时 |
| `allowPrivateNetwork` | `boolean` | `false` | 允许访问私有网络 |
| `debug` | `false \| "minimal" \| "verbose"` | `false` | 调试日志级别 |
