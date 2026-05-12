---
status: historical
audience: maintainer
last_verified: 2026-05-10
language: chinese
---

# 一、扩展 / 增强 `fetch_content` 工具功能计划

> Historical content：本文是归档计划，可能包含已实现、已调整或不再采用的设计；当前行为以 `docs/reference/`、`src/` 和 `tests/` 为准。

## 目标定位

`fetch_content` 的第一版增强目标不是"支持所有文件"，而是把它从：

```text
只支持 text/html + text/plain
```

升级为：

```text
轻量 URL 内容读取工具，支持常见文本类 Web 内容，并能对复杂类型给出明确转交建议
```

它应该服务于：

```text
web_search → fetch_content → 子代理读取网页/文档片段 → 总结/研究/代码辅助
```

## 第一版最小可行方案

第一版建议只做 **文本类内容扩展 + handler registry + 更友好的 unsupported 类型处理**。

> **现状说明**：安全限制（下载大小、输出截断、超时、私网拦截）和 Jina fallback 核心逻辑已在当前代码中实现，本计划在对应 Phase 中标注了已有实现，仅规划增量工作。

### 第一版新增支持类型

内置支持：

```text
text/html                                    (已有)
text/plain                                   (已有)
text/markdown
text/x-markdown
application/json
application/*+json
text/csv
text/tab-separated-values
application/xml
text/xml
application/rss+xml
application/atom+xml
text/yaml
text/x-yaml
application/yaml
text/css
text/javascript
application/javascript
application/typescript
其他 text/* fallback
```

第一版不支持本地 PDF/DOCX/XLSX/PPTX 解析。遇到这些类型时，`fetch_content` 应该返回友好错误说明该类型不受支持。

> **注意**：`convert_content` 工具目前也处于计划阶段（见 `add-convert_content-tool-plan.md`），尚未实现。在 `convert_content` 上线前，错误信息不应引导 agent 调用一个不存在的工具。待 `convert_content` 实现后，再更新错误提示为"建议使用 convert_content"。

---

## 推荐阶段拆分

## Phase 1：Content-Type 检测增强与 URL 后缀 fallback

### 目标

解决很多服务器返回错误 MIME 的问题。**此阶段是后续新类型能否被正确识别的前提**，因此优先于内容类型扩展。

现实中常见情况：

```text
.md 文件返回 text/plain
.json 返回 text/plain
GitHub raw 内容 MIME 不稳定
```

### 现有基础

当前 `isSupportedContentType()` 仅按 Content-Type header 判断，返回 `"html"` | `"text"` | `null`（`src/modules/web/fetch.ts`）。无 URL 后缀 fallback 能力。

### 主要内容

检测顺序建议：

```text
1. HTTP Content-Type header
2. URL pathname extension
3. buffer magic bytes（轻量，仅用于区分二进制/文本）
4. text/* fallback（对未知 text/* 子类型兜底为纯文本）
```

实现轻量规则：

```text
.md/.markdown  → markdown
.json         → json
.csv/.tsv     → csv/tsv
.xml/.rss/.atom → xml/feed
.yml/.yaml    → yaml
.js/.ts/.css  → source text
.pdf          → unsupported（不解析，只识别后缀给出明确提示）
.docx/.pptx/.xlsx → unsupported（同上）
```

对于 `application/octet-stream` 等无法判断的通用类型，如果 URL 后缀也无法识别，则 fallback 为纯文本尝试解析，而非直接拒绝。

### 执行边界

不要在 `fetch_content` 里解析 PDF/Office。只识别它们，给出明确的不支持提示。

### 验收标准

- 当 Content-Type 不准确时，工具仍能基于 URL 后缀选择正确 handler
- `application/octet-stream` + `.json` 后缀 → 正确识别为 JSON
- `text/plain` + `.md` 后缀 → 正确识别为 Markdown
- `.pdf` 后缀 → 返回明确的"不支持该类型"错误

---

## Phase 2：重构为 Content Handler Registry

### 目标

把当前的硬编码 if/else 分发改为可插拔的 handler 体系，为后续扩展搭好架构。

把当前的：

```text
isSupportedContentType → "html" | "text" | null
```

改成：

```text
Content-Type + URL extension → handler
```

### 现有基础

当前 `fetchUrlContent()` 中通过 `isSupportedContentType` 返回值做 `if (html) / else (text)` 分支（`src/modules/web/fetch.ts`）。结构简单但不可扩展。

### 主要内容

建立统一的 handler 接口，按职责划分为 **6 个 handler**（合并同类项，避免过度拆分）：

```text
HtmlHandler          — text/html
PlainTextHandler     — text/plain, text/markdown, text/x-markdown,
                       text/css, text/javascript, application/javascript,
                       application/typescript, 其他 text/* fallback
JsonHandler          — application/json, application/*+json
CsvTsvHandler        — text/csv, text/tab-separated-values
XmlHandler           — application/xml, text/xml,
                       application/rss+xml, application/atom+xml
YamlHandler          — text/yaml, text/x-yaml, application/yaml
UnsupportedHandler   — 无法处理的类型，返回友好错误
```

**设计说明**：Markdown、源码文本（CSS/JS/TS）本质上都是纯文本，与 `text/plain` 的处理方式一致（保留原文、截断、不执行、不格式化），因此统一归入 `PlainTextHandler`。RSS/Atom 是 XML 的子集，`XmlHandler` 内部根据 schema 分支处理即可。

每个 handler 负责：

```text
isMatch(contentType, urlExtension) — 是否匹配
parse(raw) → parsed content         — 如何解析
format(parsed) → string             — 输出什么格式
truncate(formatted, limit) → result — 如何截断
metadata() → object                 — 返回哪些 metadata
```

每个 handler **必须**实现 parse 失败降级策略：

```text
parse() 抛出异常时 → fallback 为纯文本返回原始内容 + 在 metadata 中标注 parseWarning
```

例如：JSON handler 收到 invalid JSON → 按纯文本返回原始内容，metadata 中标注 `{ parseWarning: "Invalid JSON, returned as plain text" }`。CSV 列数不一致、XML 格式错误等同理。

### 主流程

```text
fetch URL
  → detect content type (Phase 1 的检测逻辑)
  → select handler from registry
  → handler.parse(raw)
    → 失败则 fallback 为纯文本
  → handler.format(parsed)
  → handler.truncate(formatted)
  → return with metadata
```

### 执行边界

本阶段只改架构，复用已有的解析逻辑（HTML 提取、纯文本标准化等）。重点是把扩展点搭好。

### 验收标准

- `fetch_content` 主流程不再有大型 if/else
- 现有 HTML 和 plain text 行为不变（回归测试通过）
- 每个 handler 的 parse 失败都能降级为纯文本
- 新增内容类型只需实现 handler 接口并注册，无需修改主流程

---

## Phase 3：扩展轻量文本类内容支持

### 目标

让 agent 能读取更多真实 Web 上常见的内容类型。

### 主要内容

#### Markdown

支持：

```text
text/markdown
text/x-markdown
.md
.markdown
```

处理方式（归入 PlainTextHandler，与其他纯文本类型一致）：

```text
保留 Markdown 原文
做基础空白规范化
限制最大输出长度
```

#### JSON

支持：

```text
application/json
application/*+json
.json
```

处理方式：

```text
小 JSON：pretty print
大 JSON：截断
数组：可只展示前 N 项
JSON-LD：优先提取 headline/name/description/articleBody 等字段
解析失败：fallback 为纯文本 + parseWarning
```

#### CSV / TSV

支持：

```text
text/csv
text/tab-separated-values
.csv
.tsv
```

处理方式：

```text
只读取前 100 行左右
限制最大列数
输出 Markdown table 或清晰文本表格
返回 truncated/sample metadata
解析失败：fallback 为纯文本 + parseWarning
```

#### XML / RSS / Atom

支持：

```text
application/xml
text/xml
application/rss+xml
application/atom+xml
.xml
.rss
.atom
```

处理方式：

```text
RSS/Atom：提取 feed title、entry title、link、published、summary
普通 XML：格式化或简化为可读文本
解析失败：fallback 为纯文本 + parseWarning
```

#### YAML

支持：

```text
text/yaml
text/x-yaml
application/yaml
.yml
.yaml
```

处理方式：

```text
按文本返回
基础空白规范化
截断
```

#### Source text

支持常见源码/样式类型（归入 PlainTextHandler）：

```text
text/css
text/javascript
application/javascript
application/typescript
.js
.ts
.css
```

处理方式：

```text
按源码文本返回
不要尝试执行
不要格式化
只做截断和 metadata
```

### 执行边界

不引入重型依赖。CSV/XML 如需依赖，也应选择轻量库；如果当前项目倾向零依赖，可以先做简单解析。

### 验收标准

这些类型不会再抛出 unsupported content type，而是能返回 agent 可读内容。

---

## Phase 4：安全、稳定性审计与增量补充

### 目标

审计现有安全限制是否完备，补充缺失的可配置能力。

### 现有基础（已实现）

当前代码已实现以下安全/稳定性措施：

| 能力 | 实现位置 | 当前默认值 |
|------|----------|-----------|
| 下载大小限制 | `fetch.ts` → `readLimitedBody()` 流式字节计数 | `maxResponseBytes: 1MB` (1048576) |
| 输出长度限制 | `extract.ts` → `truncateContent()` | `maxContentChars: 30000` |
| 请求超时 | `abort.ts` → `withTimeoutSignal()` | `timeoutMs: 10000` |
| 私网 URL 拦截 | `security.ts` → `validatePublicHttpUrl()` + `isPrivateIPv4()` + `isPrivateIPv6()` | 硬拦截，不可配置放开 |
| 拦截范围 | localhost, 127.0.0.1, 0.0.0.0, ::1, 169.254.x.x, 10.x.x.x, 172.16-31.x.x, 192.168.x.x, 100.64-127.x.x, multicast, file:// | — |
| DNS 解析后二次验证 | `security.ts` → DNS lookup 后检查解析结果是否为私有 IP | — |
| 重定向限制 | `fetch.ts` → `fetchWithRedirects()` | `MAX_REDIRECTS = 5` |
| 并发限流 | `concurrency.ts` → `withThrottle()` | 可配置 |
| 连接池 | `http-pool.ts` → `pooledFetch()` | 可配置 |
| 截断元数据 | `truncateContent()` 返回 `{ content, truncated, originalLength }` | — |
| 结构化错误码 | `errors.ts` → `CONTENT_FETCH_TIMEOUT`, `CONTENT_FETCH_TOO_LARGE` 等 | — |

### 增量补充项

#### 1. `allowPrivateNetwork` 配置开关

当前私网拦截是硬编码的。对于个人本地工具场景，用户可能需要访问本地服务（如 localhost:3000 的开发服务器）。

建议新增配置项：

```text
web.allowPrivateNetwork: false  (默认关闭，保持保守)
```

设置为 `true` 时，跳过 `validatePublicHttpUrl` 中的私有地址检查。

#### 2. Content-Type 未知时的二进制检测

当前对无法识别的 Content-Type，可补充轻量 magic bytes 检测：

```text
前 16 字节匹配常见二进制签名 (PDF: %PDF, ZIP: PK, Office: PK/ÐÏ) → 直接拒绝，不尝试文本解码
否则 → fallback 为纯文本
```

### 执行边界

本阶段是增量补充，不重构已有安全架构。

### 验收标准

- 大文件、慢响应、二进制文件场景下不会卡死或污染上下文（已有，回归验证）
- `allowPrivateNetwork: true` 时可以访问 localhost（新增）
- 已知二进制格式被快速拒绝，不浪费下载带宽（新增）

---

## Phase 5：Jina Reader fallback 策略扩展

### 目标

在现有 Jina fallback 基础上，扩展触发条件并使策略可配置。

### 现有基础（已实现）

| 能力 | 实现位置 | 现状 |
|------|----------|------|
| Jina Reader 请求逻辑 | `fetch.ts` → `fetchFromJinaReader()` | 已实现，通过 `r.jina.ai/` 获取内容 |
| 触发条件检测 | `extract.ts` → `shouldTryJinaFallback()` | 已实现：body 文本 < 200 字符 且 script 标签 > 3 |
| 启用配置 | `ResolvedWebConfig.enableJinaFallback` | 默认 `false` |
| 超时配置 | `ResolvedWebConfig.jinaTimeoutMs` | 默认 `8000` |

### 增量扩展

#### 1. 扩展触发条件

在现有 `short-html + js-heavy` 基础上，新增可选触发条件：

```text
"short-html"    — HTML 正文过短（已有，body < 200 chars + script > 3）
"js-heavy-html" — JS-heavy 页面检测（已有，包含在上述逻辑中）
"user-request"  — 用户在工具参数中显式指定 preferReader: true
"unsupported-type" — unsupported 但 URL 看起来是网页（如 .html 返回了 octet-stream）
```

第一版不建议自动对所有 unsupported 类型走 Jina，避免外部请求不可控。

#### 2. 触发策略可配置化

将触发条件从硬编码改为可配置：

```json
{
  "web": {
    "enableJinaFallback": true,
    "jinaTriggers": ["short-html", "js-heavy-html"],
    "jinaTimeoutMs": 8000
  }
}
```

#### 3. 工具参数支持

在 `fetch_content` 的参数 schema 中新增可选字段：

```text
preferReader?: boolean  — 用户显式请求使用 Jina Reader
```

### 执行边界

Jina Reader 是外部服务，不应作为 devkit-pi 的强制路径。用户要能关闭。触发条件扩展应渐进式推进，避免引入不可预测的外部请求。

### 验收标准

- 现有 Jina fallback 行为不变（回归测试通过）
- `preferReader: true` 参数可触发 Jina
- 触发条件可通过配置裁剪

---

## Phase 6：测试与文档

### 测试范围

#### 复用现有测试（回归验证）

以下能力已有完整测试覆盖（`tests/web/` 目录下 12+ 个测试文件），确保重构不 break：

```text
HTML 文本提取（extract.test.ts）
纯文本标准化（extract.test.ts）
Jina fallback 触发逻辑（extract.test.ts）
内容截断（extract.test.ts）
下载字节限制（fetch.test.ts）
Content-Type 限制（fetch.test.ts）
私网 URL 拦截（security.test.ts）
DNS 解析验证（security.test.ts）
超时/中断处理（abort.test.ts）
并发限流（concurrency.test.ts）
连接池复用（http-pool.test.ts）
结构化错误码（errors.test.ts）
结果存储与检索（storage.test.ts）
可观测性记录（observability.test.ts）
Schema 验证（schemas.test.ts）
工具注册（register.test.ts）
渲染器（renderers.test.ts）
```

#### 新增测试

```text
Phase 1: URL 后缀 fallback 检测（各种 Content-Type + 后缀组合）
Phase 1: application/octet-stream + 已知后缀的识别
Phase 1: 二进制 magic bytes 快速拒绝
Phase 2: 每个 Handler 的 parse 成功路径
Phase 2: 每个 Handler 的 parse 失败降级（fallback to plain text + parseWarning）
Phase 3: markdown / json / csv / tsv / xml / rss / atom / yaml / source text 各类型
Phase 3: application/*+json 带参数的 Content-Type
Phase 3: text/* fallback 对未知子类型的处理
Phase 4: allowPrivateNetwork 配置生效
Phase 5: preferReader 参数触发 Jina
Phase 5: jinaTriggers 配置裁剪
```

### 文档需要写清楚

```text
fetch_content 支持哪些类型（含已有 + 新增）
哪些类型不支持（PDF/DOCX/XLSX/PPTX/音频/视频等）
当前不支持的类型应如何处理（不引导到未实现的 convert_content）
Jina fallback 的触发条件与配置方式
安全限制和配置项（含已有默认值）
allowPrivateNetwork 的使用场景与风险
```

---

## `fetch_content` 第一版边界总结

### 做

```text
Content-Type 检测增强 + URL 后缀 fallback（Phase 1）
Handler registry 架构重构（Phase 2）
Markdown/JSON/CSV/XML/YAML/source text 支持（Phase 3）
每个 Handler 的 parse 失败降级（Phase 2-3）
安全限制审计 + allowPrivateNetwork 配置（Phase 4）
Jina fallback 触发策略扩展 + 配置化（Phase 5）
```

### 已有（不需重复实现）

```text
URL 获取 + 重定向处理
HTML/plain text 提取与标准化
下载大小限制（1MB）+ 流式字节计数
输出长度限制（30000 chars）+ 截断元数据
请求超时（10s）
私网 URL 拦截（含 DNS 解析后验证）
并发限流 + 连接池
结构化错误码 + recovery 建议
Jina Reader fallback 核心逻辑（默认关闭）
结果存储与检索
可观测性记录
```

### 不做

```text
不解析 PDF
不解析 DOCX/PPTX/XLSX
不做 OCR
不做音频转写
不做 charset 自动检测/转换（硬编码 UTF-8，非 UTF-8 内容可能乱码但不报错）
不引入 Playwright
不引入 Firecrawl/Crawl4AI
不自动安装外部工具
不把 MarkItDown 塞进 fetch_content 核心
不在 fetch_content 中引导 agent 使用尚未实现的 convert_content
```
