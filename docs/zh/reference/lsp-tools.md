---
status: current
audience: user
last_verified: 2026-05-18
language: chinese
---

# LSP Tools 参考

本文档是 devkit-pi 内置 LSP 模块的 public API reference。配置默认值以 [`configuration.md`](./configuration.md) 为准，`/toolkit lsp` 诊断入口见 [`toolkit-commands.md`](./toolkit-commands.md)，源码以 `src/modules/lsp/*` 为准。

## 概述

LSP 模块把 Language Server Protocol 能力暴露给 pi agent，用于基于语言服务器的代码理解与诊断。它适合用于：

- 查找定义和引用
- 查看 hover / signature help
- 列出文档符号
- 获取单文件或多文件 diagnostics
- 辅助 subagents 做更准确的代码导航、审查和测试规划

它和普通文本搜索的区别：

- `read` / `grep` / `find` / `rg` 面向文本和文件系统。
- `lsp` tool 面向语言服务器返回的语义信息，例如符号、定义位置、引用、诊断。
- Web tools 面向外部网页搜索与内容抓取，不参与本地语言服务器。
- Subagents 可以使用 readonly LSP actions，但子代理仍不是 LSP server manager，也不能依赖内部实现细节。

LSP 模块包含两个公开集成面：

1. 显式 tool：`lsp`
2. 自动 diagnostics hook：按配置在主代理进程中注册，用于在 agent turn 或 edit/write 后反馈诊断

`src/modules/lsp/core.ts` 是内部 facade 与 `LSPManager` 编排层，不是额外 public tool。更底层的实现细节已拆分到聚焦模块中，分别负责 server registry、client lifecycle、diagnostics、actions、edits、source-file helpers、formatters 与 request orchestration。

## 公开接口

| 接口 | 是否 public | 说明 | 主要源码 |
|---|---:|---|---|
| `lsp` tool | 是 | 唯一公开 LSP tool，通过 `action` 字段区分操作 | `src/modules/lsp/tool.ts` |
| LSP diagnostics hook | 是，作为配置化集成点 | 自动诊断，不是 agent 可直接调用的 tool | `src/modules/lsp/hook.ts` |
| `/toolkit lsp` | 是，developer command | 展示 LSP tool/hook 配置与 action 列表 | `src/modules/commands/register.ts` |
| `LSPManager` / helpers | 否 | 内部 facade 与 manager 编排；底层 helpers 拆分在 `src/modules/lsp/*` 中 | `src/modules/lsp/core.ts` |

## 公开工具列表

当前真实注册的 LSP tool 只有一个：`lsp`。

### `lsp`

- Tool name：`lsp`
- 参数 schema：`LspParams`
- 成功结果：pi tool result，包含 `content` 与 `details`
- 失败结果：通常抛出 `LspError` 或普通 `Error`，由 pi runtime 展示为 tool failure
- 内部分发字段：`action`

### Input schema

源码：`src/modules/lsp/schemas.ts`

```ts
{
  action: "definition" | "references" | "hover" | "symbols" |
    "diagnostics" | "workspace-diagnostics" | "signature" |
    "rename" | "codeAction" | "restart" | "servers";
  file?: string;
  files?: string[];
  line?: number;
  column?: number;
  endLine?: number;
  endColumn?: number;
  query?: string;
  newName?: string;
  severity?: "all" | "error" | "warning" | "info" | "hint";
  server?: string;
}
```

### 必填字段

| 字段 | 必填条件 |
|---|---|
| `action` | 始终必填 |
| `file` | 除 `workspace-diagnostics`、`restart`、`servers` 之外的大多数 action 需要 |
| `files` | `workspace-diagnostics` 需要，最多 64 个 |
| `line` / `column` | `definition`、`references`、`hover`、`signature`、`rename`、`codeAction` 需要；如果提供 `query` 且能解析到 symbol，可省略 |
| `newName` | `rename` 需要 |
| `server` | `restart` 可选；默认 `all` |

行列号是 1-indexed。内部发送给 LSP server 时会转换为 0-indexed。

### 可选字段

| 字段 | 用途 |
|---|---|
| `query` | 对 `symbols` 作为 symbol name filter；对 position-based actions 可先解析 symbol 位置 |
| `endLine` / `endColumn` | `codeAction` 的 range 结束位置；未提供时使用起始位置 |
| `severity` | 过滤 diagnostics：`all`、`error`、`warning`、`info`、`hint`；默认 `all` |
| `server` | `restart` 的目标 server id，例如 `clangd`；或 `all` |

### 输出结构

所有成功 action 返回 pi tool result：

```ts
{
  content: Array<{ type: "text"; text: string }>;
  details: unknown;
}
```

`content[0].text` 是面向 agent/用户阅读的文本，通常以 `action: ...` 开头。`details` 是结构化结果，形状随 action 不同。

取消时返回：

```ts
{
  content: [{ type: "text", text: "Cancelled" }],
  details: { cancelled: true }
}
```

### 成功语义

- 找不到定义、引用、hover、signature、symbols 或 code actions 通常是成功结果，文本中显示 `No ... found/available`，不是 tool failure。
- `diagnostics` 返回 `No diagnostics.` 表示语言服务器成功响应且没有匹配诊断。
- `diagnostics` 的 `Unsupported: ...` 或 `Timeout: ...` 是 action 的成功返回文本/详情语义，不等同于 tool failure。
- 结果会被截断：文本最多约 60,000 字符，列表类结果最多 200 项。
- LSP 请求打开的 source file 在同步读取 / didOpen 内容传输前会先执行内部 2 MiB 大小限制。超大 source file 会以明确的 “LSP source file is too large” 信息失败，而不是完整读入。

### 失败语义

以下情况通常是 tool failure：

- 缺少 action 必需字段，例如缺少 `file`、`files`、`line/column` 或 `newName`
- `workspace-diagnostics.files` 超过 64 个
- 文件路径解析到 workspace 之外
- source file 超过内部 LSP source-read 大小限制
- privileged action 在未允许时调用
- 子代理调用未被白名单允许的 action
- `restart` 指定未知 server id

LSP 模块当前没有类似 Web 的独立 canonical error-code reference。源码中存在共享 `ERROR_CODES` / `LspError`，当前 LSP 相关 code 包括：

```text
INVALID_INPUT, LSP_SERVER_NOT_FOUND, LSP_TIMEOUT, LSP_ACTION_NOT_ALLOWED
```

实际 tool failure 以 pi runtime 展示的错误消息和 `LspError.code` 为准；不要假设存在 `LSP_ERROR_CODES` 常量表。

## 支持的操作

当前 `LSP_ACTIONS` 来自 `src/modules/lsp/schemas.ts`：

```text
definition, references, hover, symbols, diagnostics, workspace-diagnostics,
signature, rename, codeAction, restart, servers
```

### `servers`

| 项 | 说明 |
|---|---|
| 必填输入 | `action: "servers"` |
| 输出 | `details.servers: string[]`；文本列出 server ids |
| 典型用途 | 查看当前内置 server adapter id |
| 限制 | 不启动 language server；只列出源码中定义的 adapter id |

示例：

```json
{ "action": "servers" }
```

### `definition`

| 项 | 说明 |
|---|---|
| 必填输入 | `file` + `line`/`column`；或 `file` + `query` |
| 输出 | `details.results` 为 LSP locations；`total` 与 `truncated` 标记数量 |
| 典型用途 | 跳转到符号定义 |
| 限制 | 取决于 language server 是否可用、项目 root 是否可识别、server 是否返回 definition |

示例：

```json
{ "action": "definition", "file": "src/index.ts", "line": 12, "column": 8 }
```

使用 symbol query 解析位置：

```json
{ "action": "definition", "file": "src/index.ts", "query": "registerWebTools" }
```

### `references`

| 项 | 说明 |
|---|---|
| 必填输入 | `file` + `line`/`column`；或 `file` + `query` |
| 输出 | `details.results` 为 LSP locations；`total` 与 `truncated` 标记数量 |
| 典型用途 | 查找引用位置 |
| 限制 | 结果取决于 server index 状态与项目配置 |

示例：

```json
{ "action": "references", "file": "src/modules/lsp/tool.ts", "query": "registerLspTool" }
```

### `hover`

| 项 | 说明 |
|---|---|
| 必填输入 | `file` + `line`/`column`；或 `file` + `query` |
| 输出 | `details` 为 LSP Hover 或 `null`；文本为格式化 hover 内容 |
| 典型用途 | 查看类型、文档或符号说明 |
| 限制 | 不保证所有 server 都提供 hover 内容 |

示例：

```json
{ "action": "hover", "file": "src/modules/lsp/tool.ts", "line": 85, "column": 10 }
```

### `signature`

| 项 | 说明 |
|---|---|
| 必填输入 | `file` + `line`/`column`；或 `file` + `query` |
| 输出 | `details` 为 LSP SignatureHelp 或 `null`；文本为格式化 signature |
| 典型用途 | 查看函数调用签名 |
| 限制 | 取决于当前位置和 server 支持 |

示例：

```json
{ "action": "signature", "file": "src/index.ts", "line": 20, "column": 16 }
```

### `symbols`

| 项 | 说明 |
|---|---|
| 必填输入 | `file` |
| 可选输入 | `query` 过滤 symbol name |
| 输出 | `details.lines: string[]`，以及 `total` / `truncated` |
| 典型用途 | 查看文件内函数、类、变量等文档符号 |
| 限制 | 只查询单个文档；不是 workspace symbol search |

示例：

```json
{ "action": "symbols", "file": "src/modules/lsp/tool.ts" }
```

过滤：

```json
{ "action": "symbols", "file": "src/modules/lsp/tool.ts", "query": "diagnostics" }
```

### `diagnostics`

| 项 | 说明 |
|---|---|
| 必填输入 | `file` |
| 可选输入 | `severity` |
| 输出 | `details.diagnostics`、`diagnosticsTotal`、`diagnosticsTruncated`，并保留内部响应状态字段 |
| 典型用途 | 获取单个文件的 LSP diagnostics |
| 限制 | 如果没有对应 LSP、文件不存在或 server 超时，会在成功结果文本/详情中体现，不一定抛出 tool failure |

示例：

```json
{ "action": "diagnostics", "file": "src/modules/lsp/tool.ts" }
```

只看 error/warning 及以上：

```json
{ "action": "diagnostics", "file": "src/modules/lsp/tool.ts", "severity": "warning" }
```

### `workspace-diagnostics`

| 项 | 说明 |
|---|---|
| 必填输入 | `files: string[]` |
| 可选输入 | `severity` |
| 输出 | `details.items`，每项包含 file、diagnostics、status、error 等字段 |
| 典型用途 | 对一组已知文件批量获取 diagnostics |
| 限制 | 不是扫描整个 workspace；调用方必须传入文件数组；最多 64 个文件 |

示例：

```json
{
  "action": "workspace-diagnostics",
  "files": ["src/index.ts", "src/modules/lsp/tool.ts"],
  "severity": "error"
}
```

### `rename`

| 项 | 说明 |
|---|---|
| 必填输入 | `file` + `line`/`column` 或 `query`，以及 `newName` |
| 输出 | `details` 为 LSP WorkspaceEdit 或 `null`；文本展示 edit 摘要 |
| 典型用途 | 预览语言服务器建议的 rename edits |
| 限制 | Privileged action；默认禁用；子代理进程中始终禁用；当前 tool 返回 edit，不直接修改文件 |

示例（需要配置允许主代理 mutating actions）：

```json
{ "action": "rename", "file": "src/index.ts", "query": "main", "newName": "run" }
```

### `codeAction`

| 项 | 说明 |
|---|---|
| 必填输入 | `file` + `line`/`column` 或 `query` |
| 可选输入 | `endLine` / `endColumn` |
| 输出 | `details.actions`，以及 `total` / `truncated` |
| 典型用途 | 查看 quick fix / refactor / source actions |
| 限制 | Privileged action；默认禁用；子代理进程中始终禁用；当前 tool 返回 action 列表，不执行 action |

示例（需要配置允许主代理 mutating actions）：

```json
{ "action": "codeAction", "file": "src/main.cpp", "line": 10, "column": 5 }
```

### `restart`

| 项 | 说明 |
|---|---|
| 必填输入 | `action: "restart"` |
| 可选输入 | `server`，默认 `all`；可为 `clangd` 等 server id |
| 输出 | `details.restarted`、`server`，单 server restart 还包含 `restartedCount` |
| 典型用途 | 重启 LSP manager 或指定 server client |
| 限制 | Privileged action；默认禁用；子代理进程中始终禁用 |

示例（需要配置允许主代理 mutating actions）：

```json
{ "action": "restart", "server": "all" }
```

## 路径和 workspace 行为

- `file` 和 `files` 可传相对路径或绝对路径。
- 相对路径基于当前 pi execution context 的 `ctx.cwd` 解析。
- `LSPManager` 会对路径做 `path.resolve()` 与 realpath normalize。
- 解析后的路径必须位于当前 workspace root（即 manager 创建时的 cwd）之内；workspace 外路径会抛出错误：`LSP file access outside workspace is not allowed`。
- 不存在的文件：
  - `diagnostics` 通常返回成功结果，`details.unsupported=true`、`error="File not found"`。
  - `workspace-diagnostics` 中对应 item 的 `status="error"`、`error="File not found"`。
  - 其他 action 通常返回空结果或 `No ... found/available`。
- URI 到路径的转换使用 Node `fileURLToPath()`，并包含 Windows file URI fallback 处理。
- LSP 自身的 workspace 边界由 `tests/lsp/tool.test.ts` 覆盖。Shared external command 解析和 runner 行为由 `tests/shared/external-command.test.ts` 覆盖。

不要把上述实现理解为完整跨平台承诺；实际行为仍受 Node.js、运行平台、language server URI 输出格式和文件系统差异影响。

## Language server 行为

devkit-pi 不内置完整 language server，也不保证自动安装所有 server。LSP 模块根据文件扩展名和项目 root marker 选择源码中定义的 server adapter，并尝试从用户环境中启动对应 server binary。Binary lookup 使用 shared external command resolver 和 LSP-specific 额外搜索路径。`src/modules/lsp/core.ts` 保留 facade 与 manager 编排；JSON-RPC client 初始化 / 停止 helper 与 lifecycle 状态 helper 分别位于 `client-manager.ts` 和 `client-lifecycle.ts`。

### Server lifecycle

- `getOrCreateManager(cwd)` 为当前 cwd 创建或复用 singleton manager。
- manager 按 `(server id, root)` 复用 language server client。
- server 初始化超时约 30 秒。
- 打开的文件会在空闲后关闭；server client 会在 session shutdown 或 restart 时关闭。
- diagnostics hook 激活时，会在主代理 session lifecycle 中管理 shutdown；hook 不激活时，模块会注册 standalone `session_shutdown` cleanup。

### 已知 server adapters

当前 `LSP_SERVERS` 定义的 adapter：

| Server id | 扩展名/语言范围 | 期望 binary / 启动方式 | Root marker 摘要 |
|---|---|---|---|
| `dart` | `.dart` | `dart language-server --protocol=lsp`，Flutter 项目可能使用 Flutter cache 中的 Dart SDK | `pubspec.yaml`, `analysis_options.yaml` |
| `typescript` | `.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, `.cjs`, `.mts`, `.cts` | local `node_modules/.bin/typescript-language-server` 或 PATH 中 `typescript-language-server` | `package.json`, `tsconfig.json`, `jsconfig.json`；Deno 项目跳过 |
| `vue` | `.vue` | `vue-language-server --stdio` | `package.json`, `vite.config.ts`, `vite.config.js` |
| `svelte` | `.svelte` | `svelteserver --stdio` | `package.json`, `svelte.config.js` |
| `pyright` | `.py`, `.pyi` | `pyright-langserver --stdio` | `pyproject.toml`, `setup.py`, `requirements.txt`, `pyrightconfig.json` |
| `gopls` | `.go` | `gopls` | `go.work` 或 `go.mod` |
| `kotlin` | `.kt`, `.kts` | `kotlin-lsp` / `kotlin-lsp.sh` / `kotlin-lsp.cmd`；可用 `PI_LSP_KOTLIN_LSP_PATH` 指定；fallback `kotlin-language-server` | Gradle/Maven markers |
| `swift` | `.swift` | `sourcekit-lsp`，或 `xcrun sourcekit-lsp` | `Package.swift`, `*.xcodeproj`, `*.xcworkspace` |
| `rust-analyzer` | `.rs` | `rust-analyzer` | `Cargo.toml` |
| `clangd` | C/C++ 扩展 | `clangd` | `compile_commands.json`, `CMakeLists.txt`, `Makefile`, `.git` 等 |

这张表说明源码中存在的 adapter，不保证当前机器一定可用。实际可用性取决于：

- 对应 binary 是否安装并在搜索路径中
- 项目 root marker 是否存在
- language server 能否成功初始化
- 项目自身配置是否完整，例如 TypeScript dependencies、Python env、C/C++ compile database

Kotlin adapter 额外支持可选自动下载 JetBrains Kotlin LSP：只有环境变量 `PI_LSP_AUTO_DOWNLOAD_KOTLIN_LSP=1` 或 `true` 时才会尝试；默认不会触发网络下载。其短生命周期辅助命令（`curl`/`unzip`）使用 shared external command runner 并带 timeout 处理；安装后的 language server 进程仍由 LSP 模块管理。

## Diagnostics hook

自动 diagnostics hook 是 LSP 模块的 public integration behavior，但不是独立 tool。

配置：

- `lsp.hook.enabled=true`
- `lsp.hook.mode="agent_end" | "edit_write" | "disabled"`

行为摘要：

- 只在主代理进程注册；子代理进程不注册 hook。
- 注册 `lsp-diagnostics` message renderer。
- 监听 session/tool/agent lifecycle 事件。
- `agent_end` 模式：记录本轮 write/edit 触达的文件，在 agent turn 结束且空闲时发送 follow-up diagnostics message。
- `edit_write` 模式：在 write/edit tool result 后把 diagnostics 文本追加到 tool result。
- 输出最多约 60,000 字符，每轮最多处理 16 个 touched files。
- diagnostics 是语言服务器对代码的诊断，不等于 LSP tool failure。

## 配置

完整配置见 [`configuration.md#lsp-配置`](./configuration.md#lsp-配置)。

默认配置：

```json
{
  "lsp": {
    "enabled": true,
    "tool": {
      "enabled": true,
      "allowMutatingActions": false
    },
    "hook": {
      "enabled": true,
      "mode": "agent_end"
    }
  }
}
```

常见配置：

| 配置 | 默认值 | 作用 |
|---|---:|---|
| `lsp.enabled` | `true` | 是否启用整个 LSP 模块 |
| `lsp.tool.enabled` | `true` | 是否注册 `lsp` tool |
| `lsp.tool.allowMutatingActions` | `false` | 是否允许主代理调用 `rename`、`codeAction`、`restart` |
| `lsp.hook.enabled` | `true` | 是否启用自动 diagnostics hook |
| `lsp.hook.mode` | `agent_end` | hook 触发模式 |

子代理 LSP 暴露还受 subagents 配置控制：

- `subagents.allowLspTools`
- `subagents.allowedLspActions`

默认允许子代理使用 readonly-safe actions：

```text
definition, references, hover, signature, symbols, diagnostics, workspace-diagnostics, servers
```

Privileged actions：

```text
rename, codeAction, restart
```

这些 action 默认禁用；即使主代理配置允许，子代理进程中也始终禁用。

## 错误和诊断语义

### Tool failure

LSP tool failure 通常来自输入、权限或 workspace 边界错误，例如：

- `Action "..." requires a file path.`
- `Action "..." requires line/column or a query matching a symbol.`
- `Action "workspace-diagnostics" accepts at most 64 files.`
- `LSP file access outside workspace is not allowed: ...`
- `Action "restart" is disabled: lsp.tool.allowMutatingActions is false.`
- `LSP action "..." is not allowed for this subagent process.`
- `Unknown server "...".`

这些 failure 通过 `LspError` 或普通 `Error` 抛出，交给 pi runtime 展示。

### Diagnostics 不是 tool failure

LSP diagnostics 是 language server 对代码的诊断数据。存在 diagnostics、没有 diagnostics、unsupported、timeout 都是 action 层面的语义：

- `No diagnostics.`：server 响应且没有匹配诊断。
- `Unsupported: ...`：没有对应 LSP、项目 root 未识别、server binary 不存在、文件不可读等。
- `Timeout: LSP server did not respond. Try again.`：server 未在等待时间内返回 diagnostics。
- `workspace-diagnostics` 中单个文件可能是 `ok`、`timeout`、`error`、`unsupported`。

这些不应被误写为 devkit-pi tool failure。

### 错误码

源码中 LSP 使用共享错误定义 `src/shared/errors.ts`，不是独立 LSP 错误码体系。当前 LSP 相关 code：

| 错误码 | 当前用途 |
|---|---|
| `INVALID_INPUT` | 缺少必需参数、数组超限等 |
| `LSP_ACTION_NOT_ALLOWED` | privileged action 未启用、子代理未获准调用 action |
| `LSP_SERVER_NOT_FOUND` | `restart` 指定未知 server id |
| `LSP_TIMEOUT` | 已定义；当前主要 timeout 语义以 response text/details 表达 |

不要仿照 Web 文档假设存在 `WEB_ERROR_CODES` 式的 LSP canonical source。

## 稳定性说明

Public contract：

- `lsp` tool 名称
- `LspParams` 的公开字段
- `LSP_ACTIONS` action 名称
- readonly-safe vs privileged action 边界
- 子代理进程中 privileged actions 始终禁用
- `content` + `details` 的 pi tool result 顶层形态
- diagnostics hook 的配置入口与 `agent_end` / `edit_write` / `disabled` 模式

Internal implementation：

- `LSPManager` 类和 client cache 结构
- root marker 查找细节
- server spawn fallback 细节
- diagnostics wait 时间、open file LRU、idle cleanup
- format/render helpers
- hook 内部 touched-files 跟踪与 status UI 实现

边界说明：

- Language server 行为可能因语言、server 版本、项目配置、依赖安装、索引状态和平台不同而变化。
- `servers` 列出的是内置 adapter id，不表示 server binary 已安装或当前项目可用。
- `rename` 与 `codeAction` 当前返回 LSP 建议，不直接修改项目文件。
- 子代理可以使用配置允许的 readonly LSP actions，但不应依赖内部 manager、hook 或 server lifecycle 细节。

## Source map

| 主题 | 源码 |
|---|---|
| Module registration | `src/modules/lsp/register.ts` |
| Tool implementation | `src/modules/lsp/tool.ts` |
| Input schema / actions | `src/modules/lsp/schemas.ts` |
| LSP facade / manager orchestrator | `src/modules/lsp/core.ts` |
| Server registry / root detection | `src/modules/lsp/server-registry.ts` |
| Client init / stop helpers | `src/modules/lsp/client-manager.ts` |
| Client lifecycle state helpers | `src/modules/lsp/client-lifecycle.ts` |
| Diagnostics orchestration | `src/modules/lsp/diagnostics.ts` |
| Readonly LSP actions | `src/modules/lsp/actions.ts` |
| Mutating LSP actions | `src/modules/lsp/edits.ts` |
| Source file helpers | `src/modules/lsp/source-files.ts` |
| Format helpers | `src/modules/lsp/formatters.ts` |
| Request preparation / sync boundary | `src/modules/lsp/request-orchestrator.ts` |
| Hook integration | `src/modules/lsp/hook.ts` |
| Shared LSP errors | `src/shared/errors.ts` |
| Shared external command infrastructure | `src/shared/external-command.ts` |
| Config loading/defaults | `src/config/load-config.ts` |
| Config types / subagent LSP env | `src/shared/types.ts` |
| Toolkit command surface | `src/modules/commands/register.ts` |
| LSP tests | `tests/lsp/tool.test.ts` |
| Subagent LSP exposure tests | `tests/subagents/lsp-tools.test.ts` |
| Shared external command tests | `tests/shared/external-command.test.ts` |
