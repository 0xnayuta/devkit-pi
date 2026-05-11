---
status: current
audience: maintainer
last_verified: 2026-05-11
---

# VitePress 前文档审查记录

## 审查日期

2026-05-11

## 审查范围

- 根入口：`AGENTS.md`、`README.md`、`README.zh.md`、`package.json`
- 文档入口：`docs/README.md`、`docs/reference/README.md`
- Reference：configuration、subagents、subagent tool、agent definition、result schema、web tools/providers/error codes、LSP tools、toolkit commands
- Guides：architecture、extension API、security model、testing、release checklist、goals/scope、fetch_content enhancement、proposal/roadmap 文档
- Historical/proposed：`docs/archive/`、`docs/adr/`、`docs/development/docs-restructure-plan.md`
- 实现抽查：`src/modules/`、`src/config/`、`src/shared/`、`tests/`
- 文档检查脚本：`scripts/check-docs.mjs`

## 当前文档体系状态

当前文档已形成入口闭环：README → docs index → reference index → 各模块 reference。`docs/reference/` 是 public contract 的主要事实源；current guides 负责解释当前架构、安全、测试和发布流程；proposal、roadmap、ADR 与 archive 不进入 public reference 主路径。

## 已确认的 public reference

- Subagents：`subagent` tool、5 个内置 readonly agents、user/project custom agents、frontmatter 字段、结果 schema、错误码。
- Web tools：`web_search`、`fetch_content`、`get_search_content`、provider selection、responseId storage、Web error code 状态。
- LSP：`lsp` tool、readonly-safe / privileged action 边界、diagnostics hook 行为。
- Toolkit：`/toolkit` root command 与 `doctor`、`modules`、`logs`、`agents`、`lsp`、`activity`、`help` subcommands。
- Configuration：`~/.pi/agent/extensions/devkit-pi/config.json`、namespace defaults、normalize 规则。

## 已确认的 experimental / reserved / proposed / historical 边界

- `subagents.allowWrite` / writable custom subagents：experimental / advanced / unsafe；默认推荐 readonly；不代表完整 sandbox、audit、rollback 或稳定 write-capability contract。
- Web reserved error codes：`WEB_SEARCH_NO_RESULTS`、`CONTENT_FETCH_TOO_LARGE`、`PARSE_ERROR`、`CACHE_ERROR` 仍为 reserved，不应写成 active。
- Proposed / roadmap：`convert_content`、personal toolkit roadmap、docs restructure plan 不是 current behavior。
- Historical / ADR：用于保留决策背景；如与 current reference 不一致，以 `docs/reference/`、`src/` 和 `tests/` 为准。

## 已修正的问题

- ADR index 增加“ADR 不等同于当前 API reference”的提示。
- ADR 0002 中旧 allow-write 早期命名改为 current implementation note，指向 `subagents.allowWrite` 与实验性边界。
- ADR 0003 增加 current implementation note，说明早期类型名、入口路径和配置路径不代表当前契约。
- `docs/guides/extension-api.md` 的示例 details 避免使用容易与旧 result schema 混淆的 ok-style 结构。
- `docs/development/docs-restructure-plan.md` 增加 proposed warning。
- `docs/README.md` 与 `docs/reference/README.md` 补充 allowWrite 风险入口提示。
- `scripts/check-docs.mjs` 增加 allowWrite experimental / sandbox / audit / rollback 边界检查。

## 未修正但记录的问题

- `docs/guides/personal-toolkit-feature-roadmap.md` 保留旧项目名、旧路径和未来模块名；文件已标记 proposed / roadmap，不作为当前实现。
- ADR 文件中仍保留旧项目名和历史路径；作为决策记录保留，不迁移为 current reference。
- LSP server adapter 列表说明的是源码支持范围，实际可用性仍取决于本机 binary 和项目配置。

## 进入 VitePress 前的建议

- 以现有 `docs/reference/` 作为事实源，不在站点构建阶段重写 public contract。
- VitePress 导航应清楚区分 current reference、current guides、proposed/roadmap、ADR、archive。
- 不要把 proposed/roadmap/archive 内容放进用户主路径或功能导航。
- 建站前后继续运行 `pnpm docs:check` 与 `pnpm test`。

## 后续建站原则

VitePress 只改变展示层和导航层，不改变文档事实源。任何 public API、配置、错误码或命令说明变更，都应先以源码和测试为准更新 `docs/reference/`，再同步站点导航。reserved/proposed/historical 内容不得被渲染为当前能力。

后续信息架构计划：[VitePress 信息架构计划](./vitepress-ia-plan.md)。
