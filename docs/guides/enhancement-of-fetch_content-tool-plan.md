# 一、扩展 / 增强 `fetch_content` 工具功能计划

## 目标定位

`fetch_content` 的第一版增强目标不是“支持所有文件”，而是把它从：

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

第一版建议只做 **文本类内容扩展 + handler registry + 安全限制 + 更友好的 unsupported 类型处理**。

### 第一版新增支持类型

内置支持：

```text
text/html
text/plain
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

第一版不支持本地 PDF/DOCX/XLSX/PPTX 解析。遇到这些类型时，`fetch_content` 应该返回友好错误，并建议使用 `convert_content`。

---

## 推荐阶段拆分

## Phase 1：重构为 Content Handler Registry

### 目标

把当前的：

```text
isSupportedContentType → true / false
```

改成：

```text
Content-Type / URL extension / sniff → handler
```

### 主要内容

建立统一的 handler 接口，例如概念上分成：

```text
HtmlHandler
PlainTextHandler
MarkdownHandler
JsonHandler
CsvTsvHandler
XmlFeedHandler
YamlHandler
SourceTextHandler
TextFallbackHandler
UnsupportedHandler
```

每个 handler 负责：

```text
是否匹配该内容
如何解析
输出什么格式
如何截断
返回哪些 metadata
```

### 执行边界

本阶段只改架构，不新增太多复杂解析能力。重点是把未来扩展点搭好。

### 验收标准

`fetch_content` 主流程不再是大量 if/else，而是：

```text
fetch URL
detect content type
select handler
parse
normalize output
return
```

---

## Phase 2：扩展轻量文本类内容支持

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

处理方式：

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

支持常见源码/样式类型：

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

## Phase 3：增强 Content-Type 检测与 URL 后缀 fallback

### 目标

解决很多服务器返回错误 MIME 的问题。

现实中常见情况：

```text
.md 文件返回 text/plain
.pdf 返回 application/octet-stream
.json 返回 text/plain
GitHub raw 内容 MIME 不稳定
```

### 主要内容

检测顺序建议：

```text
1. HTTP Content-Type
2. URL pathname extension
3. buffer magic bytes
4. text sniff fallback
```

第一版只需要实现轻量规则：

```text
.md/.markdown → markdown
.json → json
.csv/.tsv → csv/tsv
.xml/.rss/.atom → xml/feed
.yml/.yaml → yaml
.js/.ts/.css → source text
.pdf → unsupported but suggest convert_content
.docx/.pptx/.xlsx → unsupported but suggest convert_content
```

### 执行边界

不要在 `fetch_content` 里解析 PDF/Office。只识别它们，然后转交建议。

### 验收标准

当 Content-Type 不准确时，工具仍能基于 URL 后缀选择正确 handler。

---

## Phase 4：安全、稳定性与上下文控制

### 目标

防止子代理被超大网页、慢请求、二进制文件、私网 URL 拖垮。

### 必须加入的限制

#### 下载大小限制

建议默认：

```text
maxDownloadBytes: 5MB
```

可配置。

如果响应头 `content-length` 超过限制，直接拒绝。下载过程中也要计数，不能只信 header。

#### 输出长度限制

建议默认：

```text
maxOutputChars: 12000 或 20000
```

返回：

```text
truncated: true
originalLength / sampledLength
```

#### 超时

建议默认：

```text
timeoutMs: 15000 或 20000
```

#### URL 安全

建议默认禁止：

```text
localhost
127.0.0.1
0.0.0.0
::1
169.254.169.254
10.0.0.0/8
172.16.0.0/12
192.168.0.0/16
file://
```

可以提供配置项：

```text
allowPrivateNetwork: false
```

### 执行边界

如果 devkit-pi 主要是个人本地工具，可以允许用户显式打开私网访问，但默认应该保守。

### 验收标准

工具在大文件、慢响应、私网 URL、二进制文件场景下不会卡死或污染上下文。

---

## Phase 5：Jina Reader fallback 泛化，但保持可选

### 目标

保留你现在已有的 Jina fallback 思路，但不要让它变成隐式依赖。

### 建议触发条件

可以支持：

```text
HTML 正文过短
JS-heavy 页面
用户显式 preferReader: true
unsupported 但可能可读的网页类型
```

第一版不建议自动对所有 unsupported 类型走 Jina，避免外部请求不可控。

### 配置建议

```json
{
  "fetchContent": {
    "jinaFallback": {
      "enabled": true,
      "trigger": ["short-html", "js-heavy-html"],
      "timeoutMs": 20000,
      "maxOutputChars": 20000
    }
  }
}
```

### 执行边界

Jina Reader 是外部服务，不应作为 devkit-pi 的强制路径。用户要能关闭。

---

## Phase 6：测试与文档

### 测试范围

至少覆盖：

```text
HTML 保持现有行为
HTML short body 触发 Jina fallback
plain text
markdown
json
application/*+json
csv
tsv
xml
rss
atom
yaml
source text
text/* fallback
URL extension fallback
unsupported PDF/DOCX/XLSX/PPTX
max output truncation
max download bytes
timeout
private network blocking
```

### 文档需要写清楚

```text
fetch_content 支持哪些类型
哪些类型不支持
遇到 PDF/Office 应使用 convert_content
Jina fallback 的触发条件
安全限制和配置项
```

---

## `fetch_content` 第一版边界总结

### 做

```text
URL 获取
HTML/plain text 提取
Markdown/JSON/CSV/XML/YAML/source text 支持
Content handler registry
URL extension fallback
安全下载限制
输出截断
Jina fallback 可选增强
unsupported 类型友好提示
```

### 不做

```text
不解析 PDF
不解析 DOCX/PPTX/XLSX
不做 OCR
不做音频转写
不引入 Playwright
不引入 Firecrawl/Crawl4AI
不自动安装外部工具
不把 MarkItDown 塞进 fetch_content 核心
```

---
