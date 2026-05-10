# 0005 — 从 pi-subagents 演进为 devkit-pi

- **状态**: accepted
- **日期**: 2026-05-10
- **决策者**: Izayoi Nayuta

## 背景

`pi-subagents` 最初定位为轻量 subagent 扩展（1 主代理 + 5 子代理 + readonly + depth=1）。
但项目已实际包含超出原始 MVP 的能力：web tools、delegation policy 注入、developer commands。

同时 `pi-lsp` 提供 LSP tool 和 LSP hook，二者有合并为个人综合 pi coding toolkit 的自然需求。

## 决策

1. **合并 pi-subagents 与 pi-lsp** 为单一模块化项目 `devkit-pi`。
2. **统一 `dev` 前缀命名**，与 `devpiano` 等个人项目保持一致。
3. **模块化单包**，不保留原有项目边界，按能力域划分模块（subagents / web / lsp）。
4. **薄入口 + 模块注册**，`src/index.ts` 只做组合注册，每个模块自包含。
5. **tests 镜像 modules**，`tests/subagents/`、`tests/web/`、`tests/lsp/` 与 `src/modules/` 保持 1:1。

## 保留的设计边界

- 主代理是唯一 orchestrator
- 子代理不调度其他子代理（maxDepth=1）
- 子代理默认 readonly
- 每个模块可独立启停
- LSP mutating actions（rename / codeAction / restart）默认受限

## 不再保留的概念

- `mvp/` 开发阶段标识
- `pi-subagents` 包名
- `extension/` 目录（入口改为 `src/index.ts`）
- commands 独立目录（归属各自 module）

## 影响

- 新仓库: `github.com/0xnayuta/devkit-pi`
- 旧仓库 `pi-subagents` 和 `pi-lsp` 归档，不再独立维护
- 配置格式从 `ExtensionConfig` 演进为 namespace 化 `ToolkitConfig`

## 参考

- `docs/guides/deferred-pi-lsp-merge-plan.md`（原始合并计划文档，已归档于 pi-subagents）
