---
status: current
audience: all
last_verified: 2026-05-12
language: chinese
---

# Convert Content 工具参考

`convert_content` 当前支持本地 `path` 输入和远程 `url` 输入。远程 URL 会先被安全下载到临时文件，然后通过已配置的 MarkItDown CLI provider 转换为 Markdown。TUI renderer 和 toolkit 级 activity 集成已经实现。

Canonical source：`src/modules/convert/` 和 `src/config/load-config.ts`。

## 工具

| 工具 | 状态 | 作用 |
|---|---|---|
| `convert_content` | 已实现本地路径和 URL 转换 | 使用 MarkItDown CLI 将本地文件或安全下载的远程文件转换为 Markdown |

## 参数

```ts
{
  path?: string,
  url?: string,
  maxContentChars?: number,
  timeoutMs?: number
}
```

执行时会校验必须且只能提供 `path` 或 `url` 其中之一。同时提供两者或两者都不提供会返回 `INVALID_INPUT`。

## 当前工具行为

- `convertContent.enabled=false` 会禁用工具注册。
- `path` 必须指向 active workspace（扩展进程的 `process.cwd()`）内一个已存在的本地文件。缺失路径和目录会返回 `FILE_NOT_FOUND`；workspace 外的路径会返回 `INVALID_INPUT`。
- 大于 `convertContent.maxResponseBytes` 的本地文件会在 provider 执行前返回 `FILE_TOO_LARGE`。
- `url` 必须使用 `http:` 或 `https:`。其他协议会返回 `UNSUPPORTED_PROTOCOL`。
- 远程 URL 会在下载前经过 private-network protection 校验。
- 每个 redirect hop 都会在 follow 前用相同的 private-network policy 重新校验。
- 当前 DNS 校验发生在 `fetch` 之前；这会阻止常见 private-network 目标，但不声称可以消除所有 DNS rebinding / DNS TOCTOU 风险。
- 大于 `convertContent.maxResponseBytes` 的远程响应会在 provider 执行前返回 `FILE_TOO_LARGE`。
- 临时下载文件会在转换成功或失败后被删除。
- 本地文件和下载文件的转换都会调用已配置的 MarkItDown CLI provider。
- 单次调用的 `timeoutMs` 和 `maxContentChars` 如果是正整数，会覆盖配置默认值。
- Provider 输出超过 `maxContentChars` 时会被截断，并返回 `truncated=true`。
- Tool calls 包含用于调用/结果展示的 compact/expanded TUI renderers。
- 成功和失败的转换都会以 `type="convert"` 记录到共享 toolkit activity log。
- `allowPrivateNetwork=false` 默认阻止 localhost、loopback、private、link-local、metadata-style 和 internal hostnames/IPs。仅在可信环境中设置 `convertContent.allowPrivateNetwork=true`。
- `file_path` 不是受支持的 canonical field；请使用 `path`。

## MarkItDown provider 状态

`src/modules/convert/provider.ts` 实现了 `MarkItDownProvider`：

- 使用 `src/shared/external-command.ts` 检查已配置 MarkItDown CLI 命令是否存在并执行命令。
- 将输入文件作为结构化参数传给已配置 executable，不使用 shell interpolation。
- 通过 shared external command runner 应用转换 timeout。
- 在 convert provider 内根据 `maxResponseBytes` 于执行前检查输入文件大小。
- 从 shared runner 接收 stdout/stderr。
- 将命令缺失、timeout、非零退出和文件过大失败映射到 convert error codes。
- 将 stdout 截断到 `maxContentChars`，并返回 `truncated=true`。

`src/shared/external-command.ts` 只负责基础设施：解析/运行短生命周期外部命令并收集 stdout/stderr。MarkItDown-specific 行为、convert 错误映射、文件大小检查、metadata 和输出截断仍保留在 `src/modules/convert/provider.ts`。

## 成功结果

```ts
{
  source: string,
  provider: "markitdown",
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

## 错误码

```text
INVALID_INPUT
FILE_NOT_FOUND
FILE_TOO_LARGE
UNSUPPORTED_PROTOCOL
COMMAND_NOT_FOUND
CONVERT_TIMEOUT
CONVERT_FAILED
NETWORK_ERROR
PRIVATE_NETWORK_BLOCKED
```

`convertContent` 默认值见 [配置](./configuration.md)。
