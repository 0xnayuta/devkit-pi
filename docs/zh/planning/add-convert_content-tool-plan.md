---
status: implemented
audience: maintainer
last_verified: 2026-05-12
language: chinese
---

# 二、新增 `convert_content` 工具计划

> **⚠️ 状态：已实现的分阶段计划 / 历史设计记录 — not current behavior reference。** Phase 0–6 已实现，`convert_content` 在启用时会公开注册。本文件记录实现计划与剩余/未来想法；当前公开契约以 [Convert Content Tool Reference](../../reference/convert-tools.md)、[Reference index](../../reference/README.md)、`src/` 和 `tests/` 为准。

## 目标定位

`convert_content` 是一个新的独立 agent 工具，负责：

```text
复杂文件 / 本地文件 / 下载后的远程文件 → Markdown
```

它的定位不是 web fetch，而是 **document conversion**。

工具体系变为：

```text
web_search       搜索网页
fetch_content    读取 URL 的轻量内容
convert_content  复杂文件转 Markdown
```

`convert_content` 第一版只接入 **MarkItDown CLI provider**。

---

## 模块结构

### 源码路径

独立模块 `src/modules/convert/`，与 `web/`、`lsp/`、`subagents/`、`commands/` 平行：

```text
src/modules/convert/
├─ index.ts          # 模块入口 + registerConvertTools()
├─ provider.ts       # ConvertProvider interface + MarkItDownProvider
├─ tool.ts           # convert_content 工具实现
├─ schemas.ts        # ConvertContentParams TypeBox schema
├─ types.ts          # ConvertContentInput, ConvertContentResult 等
├─ errors.ts         # CONVERT_ERROR_CODES
├─ renderers.ts      # TUI 渲染（renderCall / renderResult）
├─ observability.ts  # 活动记录
└─ security.ts       # 文件路径验证（URL 安全复用 web/security.ts）
```

测试路径镜像：

```text
tests/convert/
├─ provider.test.ts
├─ tool.test.ts
├─ security.test.ts
├─ config.test.ts
└─ renderers.test.ts
```

测试脚本同步要求：新增 `tests/convert/*.test.ts` 后，必须同步更新 `package.json` 的 `test:unit` 脚本，让 convert 测试进入默认 `pnpm test` 范围。当前脚本只显式包含 `tests/subagents`、`tests/commands`、`tests/web`、`tests/lsp` 和 package manifest 测试；如果不更新脚本，convert 测试不会被执行。

### 注册入口

`src/index.ts` 新增注册调用：

```ts
import { registerConvertTools } from "./modules/convert/index.ts";

export default function registerExtension(pi: ExtensionAPI): void {
  // ... 现有注册 ...
  registerConvertTools(pi, effectiveConfig.convertContent);
}
```

### 配置命名空间

顶层命名空间 `convertContent`，与现有 `web`、`lsp`、`subagents`、`commands` 平行。

---

## 与现有基础设施的复用

| 基础设施 | 方式 | 说明 |
|----------|------|------|
| `web/security.ts` 的 `validatePublicHttpUrl()` | **直接 import** | SSRF 防护逻辑完全相同，不重复实现 |
| `web/security.ts` 的 `isPrivateNetworkHostname()` | **直接 import** | 同上 |
| `web/http-pool.ts` 的 `pooledFetch()` | **直接 import** | URL 下载复用连接池 |
| `web/abort.ts` 的 `withTimeoutSignal()` | **直接 import** | 超时逻辑通用 |
| `shared/types.ts` 的 `TEMP_ROOT_DIR` | **直接 import** | 临时文件目录已有基础设施 |
| `web/concurrency.ts` 的 `withThrottle()` | **第一版不使用** | convert_content 通常一次一个文件，无需节流 |
| `web/storage.ts` 的 `storeResult()` | **不复用** | 第一版不存储 convert 结果（见下文说明） |

这是模块间公共 API 导入，不是深度私有实现依赖，符合 AGENTS.md 的边界规则。

---

## 不存储 convert 结果的理由

- convert_content 的输出是完整 Markdown 文档，体积远大于 search snippet。
- 存储会快速消耗 `web.maxStoredContentChars` 配额。
- Agent 可以在需要时重新调用 convert_content。
- 如果未来需要存储，可以独立添加，不影响第一版工具契约。

---

## 第一版边界总结

### 做

```text
新增独立模块 src/modules/convert/
新增独立 agent 工具 convert_content
接入 MarkItDown CLI（optional provider，用户自行安装）
支持本地 path 输入
支持远程 url 输入，先安全下载到临时文件再转换
输出 Markdown
支持 timeout、maxResponseBytes、maxContentChars
支持 command missing 友好错误
支持配置项（顶层 convertContent 命名空间）
TUI renderer（renderCall / renderResult）
活动记录（observability，集成 /toolkit activity）
完整的错误码体系
同步更新测试和文档
```

### 不做

```text
不把 MarkItDown 放进 fetch_content
不自动安装 MarkItDown
不直接调用 Python API
不存储 convert 结果到 responseId storage
不做 allowOutsideWorkspace 文件沙箱（pi 运行时已有权限边界）
不做 outputFormat 多格式选项（第一版只支持 Markdown）
不做 OCR 配置
不做音频转写
不做图片理解
不做 ZIP 递归解析
不做多 provider（第一版仅 markitdown）
不做复杂 chunking
不做结构化元素模型
不引入 Docling / Marker / Tika / Pandoc
不做 fetch_content autoConvert 自动转换
不改 WebToolError 接口结构（不添加 suggestedTool 结构化字段）
```

---

## 推荐阶段拆分

---

## Phase 0：执行前一致性约定（已澄清）

本阶段只统一计划口径，不实现代码。后续 Phase 必须遵守以下约定：

1. **输入字段统一使用 `path`**：所有本地文件输入、schema、测试、错误消息和文档都使用 `path`，不再使用 `file_path`。
2. **输出超长默认截断成功**：`content` 超过 `maxContentChars` 时返回截断后的 Markdown，并设置 `truncated=true`；第一版不保留 `OUTPUT_TOO_LARGE` 错误码，除非未来出现无法安全截断的独立失败模式。
3. **测试脚本必须同步更新**：新增 `tests/convert/*.test.ts` 的同一轮必须修改 `package.json` 的 `test:unit` 脚本，确保 `pnpm test` 会运行 convert 测试。
4. **URL 下载必须防重定向 SSRF**：不能只校验初始 URL。每一次 HTTP 30x 跳转都必须重新执行 `validatePublicHttpUrl({ allowPrivateNetwork })`，并设置最大重定向次数。Phase 4 实现前应优先抽取或复用现有 `fetch_content` 的安全下载模式，避免复制出不一致的网络安全逻辑。
5. **Observability 需要先抽象活动来源**：当前 `/toolkit activity` 主要消费 web activity。Phase 5 不应只在 convert 模块内孤立记录日志；需要让 activity panel 能统一展示 `search` / `fetch` / `get_content` / `convert`，可选方案是在 shared 层抽通用 activity registry，或把现有 web activity 模型规范化为 toolkit-level activity。

---

## Phase 1：模块骨架 + 配置系统 + Schema + 错误码

### 目标

建立完整模块骨架，使 typecheck 通过且配置系统可加载空模块。

### 输入设计

采用扁平 schema，与现有 web 工具的 `url?/urls?` 风格一致：

```ts
{
  path?: string,
  url?: string,
  maxContentChars?: number,
  timeoutMs?: number
}
```

不采用 `source.type/value` 嵌套方案，因为现有工具没有嵌套先例。

执行层校验 `path` 和 `url` 互斥：都提供时报 `INVALID_INPUT`，都不提供也报 `INVALID_INPUT`。

不保留 `outputFormat` 字段——第一版只支持 Markdown，该字段是过早抽象。后续多格式支持时再加。

### 输出设计

```ts
{
  source: string,              // 文件路径或 URL
  provider: string,            // provider 名称，如 "markitdown"
  content: string,             // Markdown 内容
  truncated: boolean,          // 是否截断
  metadata?: {
    contentType?: string,      // 原始内容类型
    fileName?: string,         // 文件名
    fileSize?: number,         // 原始文件大小（字节）
    durationMs?: number        // 转换耗时
  }
}
```

### 错误码定义

新增 `src/modules/convert/errors.ts`：

```ts
export const CONVERT_ERROR_CODES = {
  INVALID_INPUT: "INVALID_INPUT",                 // path 和 url 都未提供，或同时提供
  FILE_NOT_FOUND: "FILE_NOT_FOUND",               // path 指向的文件不存在
  FILE_TOO_LARGE: "FILE_TOO_LARGE",               // 文件超过 maxResponseBytes
  UNSUPPORTED_PROTOCOL: "UNSUPPORTED_PROTOCOL",   // 非 file/http/https
  COMMAND_NOT_FOUND: "COMMAND_NOT_FOUND",         // markitdown 未安装
  CONVERT_TIMEOUT: "CONVERT_TIMEOUT",             // 转换超时
  CONVERT_FAILED: "CONVERT_FAILED",               // markitdown 返回非零 exit code
  NETWORK_ERROR: "NETWORK_ERROR",                 // URL 下载失败
  PRIVATE_NETWORK_BLOCKED: "PRIVATE_NETWORK_BLOCKED", // SSRF 拦截
} as const;

export type ConvertErrorCode = (typeof CONVERT_ERROR_CODES)[keyof typeof CONVERT_ERROR_CODES];
```

错误结构与 web 模块一致：

```ts
{
  error: {
    code: ConvertErrorCode;
    message: string;
  }
}
```

### 配置系统集成

#### `src/shared/types.ts` 新增

```ts
export interface ConvertContentConfig {
  enabled?: boolean;
  provider?: "markitdown";
  command?: string;
  timeoutMs?: number;
  maxResponseBytes?: number;
  maxContentChars?: number;
  allowPrivateNetwork?: boolean;
}

export type ResolvedConvertContentConfig = Required<ConvertContentConfig>;
```

修改 `ToolkitConfig` 和 `ResolvedToolkitConfig`，添加 `convertContent` 字段。

#### `src/config/load-config.ts` 新增

```ts
export const DEFAULT_CONVERT_CONTENT_CONFIG: ResolvedConvertContentConfig = {
  enabled: true,
  provider: "markitdown",
  command: "markitdown",
  timeoutMs: 30000,
  maxResponseBytes: 10485760,    // 10 MB
  maxContentChars: 50000,
  allowPrivateNetwork: false,
};

function normalizeConvertContentConfig(
  base: ConvertContentConfig | undefined
): ResolvedConvertContentConfig {
  return {
    enabled: booleanValue(base?.enabled, DEFAULT_CONVERT_CONTENT_CONFIG.enabled),
    provider: "markitdown",  // 第一版只支持 markitdown
    command: nonEmptyString(base?.command, DEFAULT_CONVERT_CONTENT_CONFIG.command),
    timeoutMs: positiveInteger(base?.timeoutMs, DEFAULT_CONVERT_CONTENT_CONFIG.timeoutMs),
    maxResponseBytes: positiveInteger(
      base?.maxResponseBytes, DEFAULT_CONVERT_CONTENT_CONFIG.maxResponseBytes
    ),
    maxContentChars: positiveInteger(
      base?.maxContentChars, DEFAULT_CONVERT_CONTENT_CONFIG.maxContentChars
    ),
    allowPrivateNetwork: booleanValue(
      base?.allowPrivateNetwork, DEFAULT_CONVERT_CONTENT_CONFIG.allowPrivateNetwork
    ),
  };
}
```

在 `mergeConfig()` 中集成。

#### 配置字段命名对照

| 配置字段 | 说明 | 对齐来源 |
|----------|------|----------|
| `enabled` | 是否启用 | 所有模块通用 |
| `provider` | provider 名称 | 与 `web.provider` 一致 |
| `command` | 外部命令路径 | 新字段，无先例 |
| `timeoutMs` | 超时毫秒数 | 与 `web.timeoutMs` 一致 |
| `maxResponseBytes` | 下载/读取最大字节数 | 与 `web.maxResponseBytes` 一致（⚠️ 不使用 `maxDownloadBytes`） |
| `maxContentChars` | 工具返回最大字符数 | 与 `web.maxContentChars` 一致（⚠️ 不使用 `maxOutputChars`） |
| `allowPrivateNetwork` | 是否允许访问私网 | 与 `web.allowPrivateNetwork` 一致 |

默认行为：

```text
工具注册默认存在
实际执行时如果 markitdown 不存在，返回 COMMAND_NOT_FOUND 友好错误
不强制用户安装
```

### 空模块注册

- `src/modules/convert/index.ts`：导出 `registerConvertTools(pi, config)`，内部先检查 `config.enabled`，然后注册空壳工具。
- `src/index.ts`：在现有注册链末尾调用 `registerConvertTools(pi, effectiveConfig.convertContent)`。

### 验收标准

- `pnpm typecheck` 通过
- 配置系统可加载 `convertContent` 命名空间，归一化正常
- 工具可注册（空实现），TUI 不崩溃
- `convertContent.enabled=false` 时不注册工具

### 同步更新

- `docs/reference/configuration.md`：添加 `## Convert content configuration` 节
- `docs/guides/architecture.md`：模块列表中添加 `convert`

---

## Phase 2：实现 MarkItDown CLI Provider

### 目标

通过外部命令调用 MarkItDown，不把 Python 依赖强塞进 devkit-pi。

### Provider Interface

```ts
export interface ConvertProvider {
  readonly name: string;
  /** 检查 provider 是否可用（命令存在等） */
  isAvailable(): Promise<boolean>;
  /** 转换本地文件为 Markdown */
  convertFile(filePath: string, options: ConvertOptions): Promise<ConvertResult>;
}

export interface ConvertOptions {
  maxResponseBytes: number;
  timeoutMs: number;
  maxContentChars: number;
}

export interface ConvertResult {
  content: string;
  truncated: boolean;
  metadata?: {
    contentType?: string;
    fileName?: string;
    fileSize?: number;
    durationMs?: number;
  };
}
```

### MarkItDownProvider 实现

职责：

```text
检查 markitdown 命令是否存在
调用 markitdown <input-file>
捕获 stdout/stderr
处理 exit code
处理 timeout（使用 withTimeoutSignal）
处理输出截断
返回 Markdown
```

命令存在性检查方式：用 `which markitdown` 或 `markitdown --version` 探测，缓存结果避免重复检查。

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

- 不自动安装 MarkItDown。只在 `COMMAND_NOT_FOUND` 错误中提示用户如何安装。
- 第一版只支持一个 provider，但 interface 预留了扩展点。
- 不依赖 MarkItDown 的 URL 处理能力。统一先下载到本地临时文件再调用，确保安全控制（SSRF、大小限制、超时）完全在 devkit-pi 手中。

### 验收标准

- 单元测试覆盖 success / command missing / timeout / truncation / stderr 摘要
- 使用 mock command 测试，不依赖实际安装 markitdown

---

## Phase 3：支持本地 path 输入

### 目标

先把最稳定的输入路径跑通。

### 主要内容

对本地文件：

```text
检查文件是否存在（→ FILE_NOT_FOUND）
检查是否为文件（非目录）
检查文件大小（→ FILE_TOO_LARGE）
调用 provider.convertFile()
限制输出长度（maxContentChars 截断，truncated=true）
```

### 安全边界

第一版不做 `allowOutsideWorkspace` 文件沙箱。理由：

- pi 运行时已有文件访问权限模型，devkit-pi 作为扩展包不应重复实现文件沙箱。
- 如果未来需要更细粒度控制，可以独立添加，不阻塞第一版。
- 文件路径参数的访问范围取决于 pi 运行时的工具权限模型。

### 验收标准

本地 PDF、DOCX、PPTX、XLSX、HTML、Markdown 等文件可以通过 MarkItDown 转成 Markdown。

### 同步更新

- 测试：`tests/convert/tool.test.ts` 覆盖 success / file not found / file too large / truncation

---

## Phase 4：支持 URL 输入，必须先安全下载

### 目标

允许 agent 对远程文件调用 `convert_content({ url })`，但统一先下载到本地临时文件。

### 推荐流程

```text
1. 复用 web/security.ts 的 validatePublicHttpUrl() 校验初始 URL
   - SSRF 防护、私网拦截
2. 复用 web/http-pool.ts 的 pooledFetch() + web/abort.ts 的 withTimeoutSignal()
   下载到临时文件（放在 TEMP_ROOT_DIR 下），fetch 必须使用 manual redirect
3. 对每一次 30x redirect 的 Location 重新调用 validatePublicHttpUrl({ allowPrivateNetwork })
   - 设置最大重定向次数，超过时报 NETWORK_ERROR
   - redirect 目标如指向私网，返回 PRIVATE_NETWORK_BLOCKED
4. 应用 maxResponseBytes 限制下载大小
5. 应用 timeoutMs 限制下载时间
6. 记录 contentType / fileName / fileSize
7. 调用 provider.convertFile() 转换临时文件
8. 删除临时文件（finally 块中清理，确保异常时也清理）
9. 返回 Markdown
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

即使 MarkItDown CLI 本身支持 URL，也应统一走 devkit-pi 的下载流程。如果未来确认 MarkItDown 的 URL 处理足够安全，可以作为优化项跳过下载步骤。

### 安全配置

- `allowPrivateNetwork`：复用 `web/security.ts` 的 `validatePublicHttpUrl({ allowPrivateNetwork })` 逻辑。
- `maxResponseBytes`：控制下载大小，超过时返回 `FILE_TOO_LARGE`。
- `timeoutMs`：同时应用于下载和转换两个阶段。

### 执行边界

- 第一版 URL 下载不需要支持复杂 cookie、登录、浏览器渲染。
- 不支持非 HTTP/HTTPS 协议（返回 `UNSUPPORTED_PROTOCOL`）。

### 验收标准

- 远程 PDF 转换成功
- SSRF 拦截生效（私网 URL 被拒绝）
- 临时文件在成功和异常路径都被清理
- 下载超时和大小限制生效
- redirect 链路每一跳都执行 SSRF 校验，redirect 到私网会被拦截

### 同步更新

- 测试：覆盖 URL success / SSRF blocked / download timeout / file too large / temp file cleanup

---

## Phase 5：TUI Renderer + Observability

### 目标

补齐工具的展示层和可观测性，与其他工具体验一致。

### TUI Renderer

新增 `src/modules/convert/renderers.ts`，镜像 `src/modules/web/renderers.ts` 结构：

```ts
export function renderConvertContentCall(args: ConvertContentInput, theme: ThemeLike): Text {
  // 显示：convert_content <文件名或URL> [provider]
}

export function renderConvertContentResult(
  result: AgentToolResult<any>,
  options: { expanded: boolean; isPartial: boolean },
  theme: ThemeLike
): Text {
  // 折叠：content 预览 + truncated 标记 + metadata
  // 展开：完整 JSON
  // 错误：错误码 + message
  // 部分："Converting..."
}
```

注册时在 `defineTool()` 中传入 `renderCall` / `renderResult`。

### Observability

新增 `src/modules/convert/observability.ts`：

```ts
export type ConvertActivityType = "convert";

export function recordConvertActivity(
  status: "success" | "error",
  provider?: string,
  errorCode?: string,
  durationMs?: number
): void;
```

活动类型为 `"convert"`，与 web 的 `"search"` / `"fetch"` / `"get_content"` 平行。

`/toolkit activity` 命令需要能展示 convert 活动。实现时不要只修改 `src/modules/commands/register.ts` 的 activity 子命令；还需要处理 activity 数据来源的边界：当前 activity panel 依赖 web observability。Phase 5 应先把 activity 记录/读取抽成 toolkit-level 或 shared-level API，或等价地规范化现有 web activity，使 convert 活动和 web 活动通过同一接口进入面板。

### 验收标准

- TUI 折叠/展开显示正确
- 错误结果显示错误码和 message
- `/toolkit activity` 能记录和展示 convert 活动

---

## Phase 6：与 `fetch_content` 联动

### 目标

让两个工具协作，但不互相耦合。

### 推荐方式

修改 `src/modules/web/fetch.ts` 中 `detectSupportedContent` 对疑似文档格式返回 `unsupported` 时的错误消息，增加可操作建议：

```ts
// 现有代码
if (detected.type === "unsupported") {
  throw new Error(detected.unsupportedReason ?? `Unsupported content type for ${finalUrl}`);
}

// 修改为
if (detected.type === "unsupported") {
  const reason = detected.unsupportedReason ?? `Unsupported content type for ${finalUrl}`;
  throw new Error(
    `${reason} This file type requires document conversion — consider using convert_content instead.`
  );
}
```

### Phase 6 决策：只保留 message hint

**不要**在 Phase 6 中新增 public `suggestion`、`nextAction`、`suggestedTool` 或类似字段。保持公共 web 错误形状稳定：

```ts
{
  error: {
    code: string;
    message: string;
  };
}
```

理由：

- 当前 `WebToolError` 是公共 API 契约（`error.code` + `error.message`）；为了一个 web/convert 联动点扩展它，会在尚无跨模块需要时提前引入新的公共 schema。
- 现有代码已经在 `message` 中包含可操作建议（如 timeout 错误提示 "Try fewer URLs or increase web.timeoutMs"）。
- Agent 模型能从自然语言 message 中理解"用 convert_content"，这个阶段不需要结构化字段。
- 单独为一个场景加入 `suggestion` / `nextAction`，会在其他工具错误上形成不一致。
- 如果未来多个模块都稳定需要结构化恢复建议，应单独设计 shared error suggestion schema，并在 web / convert / lsp / subagent 中统一落地。

### 是否支持 `fetch_content.autoConvert`

第一版不支持自动转换。保持明确的两步流程：

```text
fetch_content 失败并建议 convert_content
→ agent 再显式调用 convert_content
```

这样更可控，也方便调试。

### 验收标准

- fetch_content 遇到 PDF 时错误消息包含 convert_content 建议
- 不影响现有 CONTENT_FETCH_FAILED 错误码语义

### 同步更新

- `docs/reference/web-tools.md`：在 `fetch_content` 的 Content extraction behavior 节更新 unsupported 类型说明

---

## Phase 7：测试收尾 + 文档

### 测试完整范围

在各 Phase 已覆盖的基础上，补充以下用例：

```text
[Phase 1] 配置默认值归一化（convertContent: {} 全默认、类型错误回退默认值）
[Phase 1] convertContent.enabled=false 时不注册工具
[Phase 2] markitdown command missing → COMMAND_NOT_FOUND
[Phase 2] markitdown 返回非零 exit code → CONVERT_FAILED
[Phase 2] markitdown stderr 摘要包含在错误消息中
[Phase 3] 本地 path 成功转换，使用 mock command
[Phase 3] path 指向的文件不存在 → FILE_NOT_FOUND
[Phase 3] 文件超过 maxResponseBytes → FILE_TOO_LARGE
[Phase 3] 输出超过 maxContentChars → truncated=true（截断成功，不是错误）
[Phase 4] url 下载到 temp file 后转换
[Phase 4] SSRF 拦截（初始私网 URL）→ PRIVATE_NETWORK_BLOCKED
[Phase 4] redirect 到私网 URL → PRIVATE_NETWORK_BLOCKED
[Phase 4] 下载超时 → CONVERT_TIMEOUT
[Phase 4] 非 http/https 协议 → UNSUPPORTED_PROTOCOL
[Phase 4] 临时文件在成功和异常路径都被清理
[Phase 5] renderCall / renderResult 显示正确
[Phase 5] /toolkit activity 记录 convert 活动
[Phase 6] fetch_content unsupported 消息包含 convert_content 建议
[通用] Provider interface 可扩展性（mock provider 注入测试）
[通用] path 和 url 同时提供 → INVALID_INPUT
[通用] path 和 url 都未提供 → INVALID_INPUT
```

### 文档更新清单

| 文档 | 变更 |
|------|------|
| `docs/reference/configuration.md` | 新增 `## Convert content configuration` 节 |
| `docs/reference/convert-tools.md` | **新建**：convert_content 完整参考文档 |
| `docs/reference/web-tools.md` | 更新 fetch_content 的 unsupported 类型说明 |
| `docs/reference/web-tools-error-codes.md` | 补充 convert_content 错误码交叉引用 |
| `docs/guides/architecture.md` | 模块列表添加 convert |
| `AGENTS.md` | 标记 convert_content 已实现 |

### `docs/reference/convert-tools.md` 内容应覆盖

```text
convert_content 是可选工具
需要用户自行安装 MarkItDown CLI
它和 fetch_content 的区别
支持哪些输入（path / url）
第一版不支持哪些高级能力
配置项说明（command / timeoutMs / maxResponseBytes / maxContentChars / allowPrivateNetwork）
远程 URL 处理流程说明
错误码参考
Provider interface 扩展说明
```

---

## 配置示例

### 完整默认配置

```json
{
  "convertContent": {
    "enabled": true,
    "provider": "markitdown",
    "command": "markitdown",
    "timeoutMs": 30000,
    "maxResponseBytes": 10485760,
    "maxContentChars": 50000,
    "allowPrivateNetwork": false
  }
}
```

### 最小配置（使用全部默认值）

```json
{
  "convertContent": {}
}
```

### 禁用

```json
{
  "convertContent": {
    "enabled": false
  }
}
```

### 自定义命令路径

```json
{
  "convertContent": {
    "command": "/usr/local/bin/markitdown"
  }
}
```
