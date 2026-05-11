---
status: proposed
audience: maintainer
last_verified: 2026-05-11
---

# 二、新增 `convert_content` 工具计划

> **⚠️ Status: Proposed — not current behavior.** This document describes a future tool plan. devkit-pi has **not** implemented or publicly registered a `convert_content` tool. The features, interfaces, and behavior described here are **not part of the current public API**. For the current public contract, see [Reference index](../reference/README.md), `src/`, and `tests/`.

## 目标定位

`convert_content` 是一个新的 agent 工具，负责：

```text
复杂文件 / 本地文件 / 下载后的远程文件 → Markdown
```

它的定位不是 web fetch，而是 **document conversion**。

建议工具体系变成：

```text
web_search       搜索网页
fetch_content    读取 URL 的轻量内容
convert_content  复杂文件转 Markdown
```

`convert_content` 第一版建议只接入 **MarkItDown CLI provider**。

---

## 第一版最小可行方案

第一版目标：

```text
通过 MarkItDown CLI，把本地文件或远程 URL 转换成 Markdown
```

支持输入：

```text
file_path
url
```

输出：

```text
Markdown content
provider 信息
source 信息
truncated 标记
metadata
```

不直接支持：

```text
OCR
音频转写
LLM 图片描述
ZIP 递归解包
多 provider
复杂 chunking
结构化元素模型
```

---

## 推荐阶段拆分

## Phase 1：定义工具边界与 Schema

### 目标

新增独立工具：

```text
convert_content
```

不要命名成 `markitdown`，避免绑定具体实现。

### 输入设计

第一版建议支持：

```ts
{
  source: {
    type: "file_path" | "url",
    value: string
  },
  outputFormat?: "markdown",
  maxOutputChars?: number,
  timeoutMs?: number
}
```

也可以更简单：

```ts
{
  path?: string,
  url?: string,
  maxOutputChars?: number,
  timeoutMs?: number
}
```

但从长期看，`source.type` 更清楚。

### 输出设计

```ts
{
  source: string,
  provider: "markitdown",
  outputFormat: "markdown",
  content: string,
  truncated: boolean,
  metadata?: {
    contentType?: string,
    fileName?: string,
    fileSize?: number,
    durationMs?: number
  }
}
```

### 执行边界

第一版只输出 Markdown，不做 JSON/chunks/assets。

---

## Phase 2：实现 MarkItDown CLI Provider

### 目标

通过外部命令调用 MarkItDown，不把 Python 依赖强塞进 devkit-pi。

### 主要内容

实现：

```text
MarkItDownProvider
```

职责：

```text
检查 markitdown 命令是否存在
调用 markitdown input-file
捕获 stdout/stderr
处理 exit code
处理 timeout
处理输出截断
返回 Markdown
```

### 为什么用 CLI

因为 devkit-pi 是 pi coding 扩展包，不应该强制所有用户安装 Python 包到 Node 依赖链里。

CLI 方式更适合：

```text
可选能力
本地工具链
用户自行安装
跨 provider 扩展
```

### 执行边界

不自动安装 MarkItDown。只在错误中提示用户如何安装。

---

## Phase 3：支持本地 file_path 输入

### 目标

先把最稳定的输入路径跑通。

### 主要内容

对本地文件：

```text
检查文件是否存在
检查是否为文件
检查文件大小
检查路径是否允许访问
调用 markitdown
限制输出长度
```

### 安全边界

如果 devkit-pi 有 workspace root 概念，建议默认只允许访问：

```text
当前 workspace
显式允许的路径
```

避免 agent 任意读取用户系统文件。

可以提供配置：

```json
{
  "convertContent": {
    "allowOutsideWorkspace": false
  }
}
```

### 验收标准

本地 PDF、DOCX、PPTX、XLSX、HTML、Markdown 等文件可以通过 MarkItDown 转成 Markdown。

---

## Phase 4：支持 URL 输入，但必须先安全下载

### 目标

允许 agent 对远程文件调用：

```text
convert_content({ url })
```

但不要直接把 URL 丢给 MarkItDown。

### 推荐流程

```text
1. 校验 URL
2. 使用 devkit-pi 自己的安全下载逻辑下载到 temp file
3. 应用 maxDownloadBytes
4. 应用 timeout
5. 记录 contentType / fileName / fileSize
6. 调用 MarkItDown 转换 temp file
7. 删除 temp file
8. 返回 Markdown
```

### 为什么不直接给 MarkItDown URL

因为直接交给外部工具会削弱你对这些东西的控制：

```text
下载大小
下载超时
SSRF 防护
私网访问限制
临时文件清理
错误格式
metadata
```

### 执行边界

第一版 URL 下载不需要支持复杂 cookie、登录、浏览器渲染。

---

## Phase 5：配置系统

### 建议配置

```json
{
  "convertContent": {
    "enabled": true,
    "provider": "markitdown",
    "command": "markitdown",
    "timeoutMs": 30000,
    "maxDownloadBytes": 10485760,
    "maxOutputChars": 50000,
    "allowOutsideWorkspace": false,
    "allowPrivateNetwork": false
  }
}
```

### 执行边界

默认启用还是默认关闭，需要看你的 devkit-pi 产品策略。

我的建议：

```text
工具注册可以默认存在
实际执行时如果 markitdown 不存在，返回友好错误
不强制用户安装
```

这样最符合“个人工作流综合扩展包”的定位。

---

## Phase 6：与 `fetch_content` 联动

### 目标

让两个工具协作，但不要互相耦合太深。

### 推荐方式

当 `fetch_content` 遇到复杂类型时，返回错误或结构化提示：

```text
Unsupported content type: application/pdf.
This content type is better handled by convert_content.
```

如果 tool schema 支持结构化错误，可以加：

```json
{
  "error": "unsupported_content_type",
  "contentType": "application/pdf",
  "suggestedTool": "convert_content"
}
```

### 是否支持 `fetch_content.autoConvert`

第一版不建议默认支持自动转换。

可以后续再做：

```json
{
  "url": "...",
  "autoConvert": true
}
```

但第一版最好保持明确：

```text
fetch_content 失败并建议 convert_content
agent 再显式调用 convert_content
```

这样更可控，也方便调试。

---

## Phase 7：测试与文档

### 测试范围

至少覆盖：

```text
markitdown command missing
本地 file_path 成功转换，使用 mock command
url 下载到 temp file 后转换
转换 timeout
输出截断
下载大小限制
临时文件清理
stderr 摘要
file_path 不存在
不允许访问 workspace 外路径
unsupported fetch_content 提示 convert_content
```

### 文档内容

文档应说明：

```text
convert_content 是可选工具
需要用户自行安装 MarkItDown CLI
它和 fetch_content 的区别
支持哪些输入
第一版不支持哪些高级能力
如何配置 command / timeout / maxOutputChars
如何处理远程 URL
```

---

## `convert_content` 第一版边界总结

### 做

```text
新增独立 agent 工具 convert_content
接入 MarkItDown CLI
支持本地 file_path
支持远程 url，但先安全下载到临时文件
输出 Markdown
支持 timeout
支持 maxDownloadBytes
支持 maxOutputChars
支持 command missing 友好错误
支持配置项
支持基础测试和文档
```

### 不做

```text
不把 MarkItDown 放进 fetch_content
不自动安装 MarkItDown
不直接调用 Python API
不做 OCR 配置
不做音频转写
不做图片理解
不做 ZIP 递归解析
不做多 provider
不做复杂 chunking
不做结构化元素模型
不引入 Docling / Marker / Tika / Pandoc
```

---
