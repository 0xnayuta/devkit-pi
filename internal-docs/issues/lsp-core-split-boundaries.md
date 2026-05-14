---
status: proposed
audience: maintainer
last_verified: 2026-05-14
language: chinese
---

# LSP core 拆分边界设计记录

## 背景

`src/modules/lsp/core.ts` 当前承担了多类职责：

- language id / server registry
- project root detection
- external LSP server discovery / spawn
- JSON-RPC client lifecycle
- didOpen / didChange / didSave / didClose 文档同步
- diagnostics pull/push 聚合
- definition / references / hover / signature / symbols 等 readonly actions
- rename / codeAction 相关 LSP 请求
- source file 读取限制与 symbol position refinement
- diagnostics / symbols formatting helpers

阶段 0 只完成安全与资源上限加固，不进行大规模拆分，以避免在 hardening 阶段引入行为变化。

## Public facade 边界

后续拆分必须保持以下 public/import 边界稳定，除非同步更新调用方、测试和文档：

- `LSPManager`
- `getOrCreateManager()`
- `shutdownManager()`
- `LSP_SERVERS`
- `LANGUAGE_IDS`
- `diagnosticsWaitMsForFile()`
- `filterDiagnosticsBySeverity()`
- `formatDiagnostic()`
- `collectSymbols()`
- `findSymbolPosition()` / `resolvePosition()`
- `uriToPath()`
- `getCppCompilationDbHint()`
- `DEFAULT_LSP_MAX_SOURCE_FILE_BYTES`
- `LspFileTooLargeError`
- `readTextFileLimited()`

`src/modules/lsp/tool.ts` 和 `src/modules/lsp/hook.ts` 应继续只依赖 facade exports，不应深度导入拆分后的私有模块。

## 推荐目标结构

```text
src/modules/lsp/
├── core.ts                    # facade，保留对外 LSPManager 接口和稳定 exports
├── server-registry.ts          # LSP_SERVERS、LANGUAGE_IDS、root detection
├── server-install.ts           # Kotlin/Dart 等辅助外部命令安装/发现逻辑
├── client-manager.ts           # init/open/close/restart/cleanup、JSON-RPC lifecycle
├── diagnostics.ts              # document/workspace diagnostics、pull/push 聚合
├── actions.ts                  # definition/references/hover/signature/symbols
├── edits.ts                    # rename/codeAction 请求封装
├── source-files.ts             # source file 限制读取、URI/path helper、symbol refinement
└── formatters.ts               # filterDiagnosticsBySeverity、formatDiagnostic、collectSymbols 等纯格式化 helper
```

## 推荐拆分顺序

1. **纯 helper 先行**
   - 提取 `uriToPath()`、diagnostic formatter、symbol formatter、severity filter。
   - 不接触 server lifecycle。

2. **source file helper**
   - 提取 `DEFAULT_LSP_MAX_SOURCE_FILE_BYTES`、`LspFileTooLargeError`、`readTextFileLimited()`。
   - 保持大文件错误信息和测试不变。

3. **server registry / root detection**
   - 提取 `LANGUAGE_IDS`、`LSP_SERVERS`、root marker helpers。
   - 注意 Dart / Kotlin / Swift / C++ root detection 与 external command helper 的边界。

4. **client lifecycle**
   - 提取 init/open/update/close/restart/cleanup。
   - 保持 `LSPManager` 方法签名不变。

5. **diagnostics 与 actions**
   - 将 diagnostics 和 readonly actions 拆出为依赖 client lifecycle 的内部 functions。
   - 避免让 tool 层直接依赖这些私有 functions。

## 非目标

- 不改变 LSP public tool schema。
- 不新增配置项。
- 不改变 language server 选择策略。
- 不改变 subagent LSP readonly allowlist 语义。
- 不改变 diagnostics hook 触发模式。
- 不新增 LSP 错误码，除非同步更新 public docs/tests。

## 验收标准

每一步拆分后都应通过：

```bash
pnpm typecheck
pnpm lint
pnpm test
```

涉及文档边界或 public exports 变化时，还需通过：

```bash
pnpm docs:check
```

至少覆盖：

- `tests/lsp/tool.test.ts`
- `tests/subagents/readonly-tools.test.ts`（如影响 subagent LSP tool policy）
- diagnostics hook 相关测试（如移动 hook 依赖）

## 当前状态

阶段 0 已完成 LSP source file 大小限制，但未执行 LSP core 全面拆分。本记录作为后续 maintenance issue / implementation plan 的设计入口。
