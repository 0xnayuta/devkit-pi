---
status: current
audience: all
last_verified: 2026-05-13
language: chinese
---

<p align="center">
  <img src="/logo.png" alt="devkit-pi logo" width="80" height="80" />
</p>

# devkit-pi

`devkit-pi` 是面向个人工作流的一体化 pi coding 工具包。它将 subagent 任务委派、Web 研究工具、内容转换、LSP 代码智能、自动诊断 hook 和开发者命令整合为一个模块化 pi 扩展。

公开文档站刻意只分为指南和参考。维护者内部资料位于仓库根目录的 `internal-docs/`，不进入公开网站导航。

## 文档站

在线文档站：https://devkit-pi.wangyan.life/

npm 包：https://www.npmjs.com/package/devkit-pi

本地预览命令：

```bash
pnpm docs:dev
pnpm docs:build
pnpm docs:preview
```

## 主要入口

- [指南](./README.md)：文档概览、阅读路径和内容策略。
- [参考](./reference/)：当前 public contract / API reference。
- [GitHub](https://github.com/0xnayuta/devkit-pi)：源码仓库。

## 从这里开始

- [目标与范围](./guides/goals-and-scope.md)：项目目标和当前能力边界。
- [安全模型](./guides/security-model.md)：subagents、Web 工具、LSP、convert 和写入能力的安全边界。
- [Subagents 参考](./reference/subagents.md)：subagent 模块 surface 和执行边界。
- [Web 工具参考](./reference/web-tools.md)：`web_search`、`fetch_content` 和 `get_search_content`。
- [LSP 工具参考](./reference/lsp-tools.md)：LSP tool actions 和 diagnostics hook 行为。
- [Convert 工具参考](./reference/convert-tools.md)：`convert_content` 行为和 MarkItDown provider 边界。
- [Toolkit 命令参考](./reference/toolkit-commands.md)：`/toolkit` 命令 surface。
