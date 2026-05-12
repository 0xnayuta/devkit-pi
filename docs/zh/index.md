---
status: current
audience: all
last_verified: 2026-05-12
language: chinese
---

<p align="center">
  <img src="/logo.png" alt="devkit-pi logo" width="80" height="80" />
</p>

# devkit-pi

`devkit-pi` 是面向个人工作流的一体化 pi coding 工具包。它将 subagent 任务委派、Web 研究工具、LSP 代码智能、自动诊断 hook 和开发者命令整合为一个模块化 pi 扩展。

当前 public contract / API reference 位于 [`docs/reference/`](./reference/)。Proposal、roadmap、archive 和 ADR 内容不应被视为当前行为，除非它们同时反映在 reference 文档、源码和测试中。

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

- [指南](./README.md)：文档概览、阅读路径、当前指南和内容策略。
- [参考](./reference/)：当前 public contract / API reference。
- [ADRs](./adr/)：历史架构决策记录，不等同于当前 API reference。
- [GitHub](https://github.com/0xnayuta/devkit-pi)：源码仓库。

## 从这里开始

- [架构](./guides/architecture.md)：当前源码结构和模块职责。
- [安全模型](./guides/security-model.md)：subagents、Web 工具、LSP 和写入能力的安全边界。
- [Subagents 参考](./reference/subagents.md)：subagent 模块 surface 和执行边界。
- [Web 工具参考](./reference/web-tools.md)：`web_search`、`fetch_content` 和 `get_search_content`。
- [LSP 工具参考](./reference/lsp-tools.md)：LSP tool actions 和 diagnostics hook 行为。
- [Toolkit 命令参考](./reference/toolkit-commands.md)：`/toolkit` 命令 surface。
