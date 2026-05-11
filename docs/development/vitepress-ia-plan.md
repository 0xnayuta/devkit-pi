---
status: proposed
audience: maintainer
last_verified: 2026-05-11
---

# VitePress 信息架构计划

> Status: Proposed. 本文只规划 VitePress 文档站的信息架构、导航和内容隔离规则，不代表当前 public reference 或当前实现发生变化。当前行为仍以 `docs/reference/`、`src/` 和 `tests/` 为准。

## 1. Goal

本计划的目标是为后续 VitePress 建站提供信息架构草案：

- 将现有 Markdown 文档组织为可浏览的 VitePress 文档站。
- 不改变 `docs/reference/` 作为 current public contract / API reference 的事实源地位。
- 不把 proposal、roadmap、archive 或 ADR 内容渲染成当前功能说明。
- 先确定导航、sidebar、首页入口、分区和内容隔离规则，再在后续轮次引入 VitePress 配置。

本轮不引入 VitePress、不安装依赖、不修改 `package.json` scripts、不创建 `docs/.vitepress/config.ts`，也不迁移文档文件。

## 2. Documentation source policy

### Canonical source by section

| Section | Role | Current behavior / contract status |
|---|---|---|
| `docs/reference/` | Current public contract / API reference 事实源 | 记录当前已实现 public surface、配置、工具参数、返回结构、错误语义和稳定性边界 |
| `docs/guides/` | 维护者指南、背景说明、当前架构/安全/测试/发布流程，以及少量 proposal/roadmap 文件 | current guides 可作为当前背景说明；proposal/roadmap guides 不代表当前行为 |
| `docs/adr/` | 历史架构决策记录 | 解释当时的背景和取舍，不等于当前 API reference |
| `docs/archive/` | 历史计划和归档内容 | 不进入主导航，不代表当前实现或承诺 |
| `docs/issues/` | 维护记录和 issue/修复摘要 | 更适合放在 Development 下，不作为用户主路径 |
| `docs/development/` | 文档工程化、审计、建站计划等维护者工作记录 | 不代表 public API contract |
| `README.md` / `README.zh.md` | 仓库首页入口、模块概览、快速导航 | 继续作为 GitHub/npm 阅读入口；docs site 是更完整的阅读入口 |

### Policy rules

- `docs/reference/` 是 current public contract / API reference 的 canonical 文档目录。
- `docs/guides/` 中的 current 文档用于解释当前目标、架构、安全模型、测试和发布流程。
- `docs/adr/` 记录历史决策；当 ADR 与 current reference 不一致时，以 `docs/reference/`、`src/`、`tests/` 为准。
- `docs/archive/` 只保留历史上下文，不进入顶部主导航，不进入用户主 sidebar。
- proposed / roadmap / plan 类文档不进入 current Guide 主路径，也不应被搜索或导航呈现为当前能力。
- README 仍是仓库首页入口；VitePress 文档站应成为更完整、分区更清晰的阅读入口。

## 3. Proposed top navigation

推荐顶部导航：

| Nav item | Target | Priority | Rationale |
|---|---|---:|---|
| Guide | `/guide/` 或现有 `docs/` / `docs/guides/` 路由 | 高 | 当前用户理解项目目标、架构、安全边界和维护流程的入口 |
| Reference | `/reference/` | 高 | 当前 public contract / API reference 事实源，必须清晰可见 |
| Development | `/development/` | 中 | 放测试、发布、文档审计、VitePress IA、issue log 等维护者内容 |
| ADR | `/adr/` | 低 | 历史决策记录，需要可访问但不作为用户主路径 |
| GitHub | repository URL | 外链 | 返回源码仓库、README、issues |

暂不建议把 Archive 放进顶部导航。若需要暴露 archive，应只在 Development 或 ADR 页面中以 “Historical resources” 形式提供低优先级链接。

Proposed / Roadmap 也不建议作为顶部 nav。第一阶段可从 `docs/README.md` 或 Development 的 “Proposed / Roadmap” 小节链接过去，并明确不是 current behavior。

## 4. Proposed sidebar structure

第一阶段建议尽量复用现有文件路径，通过 sidebar 分组表达信息架构，而不是立即移动文件。

### Guide

建议包含 current guide / orientation 内容：

- `docs/README.md`：文档站首页候选 / 文档总入口。
- `docs/guides/goals-and-scope.md`：目标与范围。
- `docs/guides/architecture.md`：当前源码结构、模块职责、注册流程和测试映射。
- `docs/guides/extension-api.md`：当前使用的 pi extension API 子集。
- `docs/guides/security-model.md`：安全模型。
- `docs/guides/testing.md`：测试策略。
- `docs/guides/release-checklist.md`：发布前检查清单。
- `docs/guides/fetch_content-enhancement.md`：`fetch_content` 当前内容类型增强记录。

注意：`docs/guides/add-convert_content-tool-plan.md` 和 `docs/guides/personal-toolkit-feature-roadmap.md` 不进入 Guide 主路径。

### Reference

Reference sidebar 应完整覆盖 current public surface：

- `docs/reference/README.md`
- `docs/reference/configuration.md`
- `docs/reference/subagents.md`
- `docs/reference/subagent-tool.md`
- `docs/reference/agent-definition.md`
- `docs/reference/result-schema.md`
- `docs/reference/web-tools.md`
- `docs/reference/web-providers.md`
- `docs/reference/web-tools-error-codes.md`
- `docs/reference/lsp-tools.md`
- `docs/reference/toolkit-commands.md`

Reference 分区中不放 roadmap、proposal、archive 或 ADR 正文链接，避免用户把非当前内容理解为 contract。

### Development

Development sidebar 面向维护者和文档工程化：

- `docs/development/docs-restructure-plan.md`
- `docs/development/docs-audit-before-vitepress.md`
- `docs/development/vitepress-ia-plan.md`
- `docs/issues/issue-log.md`

可在 Development 末尾增加低优先级 “Historical resources” 小节，只链接 archive index 或具体 archive 文件，并标注 historical。第一阶段若不新增 archive index，则不在 sidebar 暴露 archive。

### ADR

ADR sidebar 独立低优先级分区：

- `docs/adr/README.md`
- `docs/adr/0001-lightweight-foreground-subagents.md`
- `docs/adr/0002-mvp-boundary-decisions.md`
- `docs/adr/0003-autonomous-subagent-triggering.md`
- `docs/adr/0004-bundled-readonly-web-tools.md`
- `docs/adr/0005-evolve-into-devkit-pi.md`

ADR 分区标题或 index 应持续提示：ADR 是历史决策记录，不等于当前 API reference。

### Proposed / Roadmap

建议第一阶段不建立顶部 nav，也不放进 current Guide 主路径。可选做法：在 Development sidebar 末尾建立低优先级 “Proposed / Roadmap” 分组：

- `docs/guides/add-convert_content-tool-plan.md`
- `docs/guides/personal-toolkit-feature-roadmap.md`

若启用该分组，必须在分组标题、页面 frontmatter/intro 和 sidebar label 中明确：

- Proposed / Roadmap 不代表 current behavior。
- 未实现工具、命令、字段或模块不得被用户视为 public contract。
- 当前 public surface 以 `docs/reference/`、`src/`、`tests/` 为准。

推荐第一阶段仅从 `docs/README.md` 的 “Proposed / roadmap guides” 小节链接，不作为 sidebar 主分区。

### Archive

Archive 不建议放进主 sidebar。

如果后续要保留入口，建议只在 Development 或 ADR 的 “Historical Resources” 小节中低优先级链接：

- `docs/archive/enhancement-of-fetch_content-tool-plan.md`

入口文字必须包含 historical / archive 提示，并说明不代表当前实现。

## 5. Page mapping plan

第一阶段不迁移文件。VitePress 路由可以直接使用现有路径生成；后续若想得到更短路径，可再通过迁移、重定向或 index/stub 处理。

| Current file | Site section | Proposed route | Status | Notes |
|---|---|---|---|---|
| `docs/README.md` | Guide / Home | `/` 或 `/README` | current | 站点首页候选；也可继续作为 GitHub docs 目录入口 |
| `docs/guides/goals-and-scope.md` | Guide | `/guides/goals-and-scope` | current | 当前目标、范围和不包含能力 |
| `docs/guides/architecture.md` | Guide | `/guides/architecture` | current | 当前源码结构和模块职责 |
| `docs/guides/extension-api.md` | Guide | `/guides/extension-api` | current | 当前使用的 pi extension API 子集 |
| `docs/guides/security-model.md` | Guide | `/guides/security-model` | current | 当前安全边界 |
| `docs/guides/testing.md` | Guide / Development | `/guides/testing` | current | 可在 Guide 或 Development 中出现；面向 maintainer |
| `docs/guides/release-checklist.md` | Guide / Development | `/guides/release-checklist` | current | 发布维护流程 |
| `docs/guides/fetch_content-enhancement.md` | Guide | `/guides/fetch_content-enhancement` | current | 当前 `fetch_content` 增强记录；public API 仍以 reference 为准 |
| `docs/reference/README.md` | Reference | `/reference/` 或 `/reference/README` | current | Reference index / canonical policy |
| `docs/reference/configuration.md` | Reference | `/reference/configuration` | current | current public config contract |
| `docs/reference/subagents.md` | Reference | `/reference/subagents` | current | current Subagents public overview |
| `docs/reference/subagent-tool.md` | Reference | `/reference/subagent-tool` | current | current `subagent` tool contract |
| `docs/reference/agent-definition.md` | Reference | `/reference/agent-definition` | current | current agent markdown definition contract |
| `docs/reference/result-schema.md` | Reference | `/reference/result-schema` | current | current subagent result schema |
| `docs/reference/web-tools.md` | Reference | `/reference/web-tools` | current | current Web tools contract |
| `docs/reference/web-providers.md` | Reference | `/reference/web-providers` | current | current Web provider selection/config behavior |
| `docs/reference/web-tools-error-codes.md` | Reference | `/reference/web-tools-error-codes` | current | current canonical Web error codes |
| `docs/reference/lsp-tools.md` | Reference | `/reference/lsp-tools` | current | current LSP tool/hook contract |
| `docs/reference/toolkit-commands.md` | Reference | `/reference/toolkit-commands` | current | current `/toolkit` command surface |
| `docs/development/docs-restructure-plan.md` | Development | `/development/docs-restructure-plan` | proposed/development | VitePress 前结构审计与迁移计划；不是 current contract |
| `docs/development/docs-audit-before-vitepress.md` | Development | `/development/docs-audit-before-vitepress` | development/current audit | 建站前文档审查记录 |
| `docs/development/vitepress-ia-plan.md` | Development | `/development/vitepress-ia-plan` | proposed/development | 本信息架构计划 |
| `docs/issues/issue-log.md` | Development | `/issues/issue-log` 或 `/development/issue-log` | development | 第一阶段可保留现有路径，放入 Development sidebar |
| `docs/adr/README.md` | ADR | `/adr/` 或 `/adr/README` | historical/current index | ADR index；需持续提示非 API reference |
| `docs/adr/0001-lightweight-foreground-subagents.md` | ADR | `/adr/0001-lightweight-foreground-subagents` | historical | 决策记录，不代表完整当前 contract |
| `docs/adr/0002-mvp-boundary-decisions.md` | ADR | `/adr/0002-mvp-boundary-decisions` | historical | 决策记录 |
| `docs/adr/0003-autonomous-subagent-triggering.md` | ADR | `/adr/0003-autonomous-subagent-triggering` | historical | 决策记录，含历史路径背景 |
| `docs/adr/0004-bundled-readonly-web-tools.md` | ADR | `/adr/0004-bundled-readonly-web-tools` | historical | 决策记录，Web 当前行为以 reference 为准 |
| `docs/adr/0005-evolve-into-devkit-pi.md` | ADR | `/adr/0005-evolve-into-devkit-pi` | historical | 决策记录 |
| `docs/guides/add-convert_content-tool-plan.md` | Proposed / Roadmap | `/guides/add-convert_content-tool-plan` 或 future `/proposed/convert-content-tool-plan` | proposed | 不代表当前存在 `convert_content` tool；不进入 current Guide 主路径 |
| `docs/guides/personal-toolkit-feature-roadmap.md` | Proposed / Roadmap | `/guides/personal-toolkit-feature-roadmap` 或 future `/proposed/personal-toolkit-roadmap` | roadmap/proposed | 不代表当前行为；可暂从 docs index 链接 |
| `docs/archive/enhancement-of-fetch_content-tool-plan.md` | Archive / Historical | `/archive/enhancement-of-fetch_content-tool-plan` | historical | 不进入主导航；仅 historical resource |
| `README.md` | Repository entry | GitHub/npm page, optional site link | current overview | 不建议直接作为 VitePress 页面主路径；保留仓库入口角色 |
| `README.zh.md` | Repository entry | GitHub/npm page, optional site link | current overview | 中文仓库入口；后续若做 i18n 再规划 |

## 6. Homepage strategy

### Option A：直接使用 `docs/README.md` 作为首页

优点：

- 不新增文件，最小变更。
- 现有 `docs/README.md` 已经是文档总入口，包含 reading path、sections、current public reference 和 historical/proposed policy。
- GitHub 渲染和 VitePress 渲染都能复用同一入口。

缺点：

- VitePress 首页通常希望更 landing-page 化，例如 feature cards、quick links、hero CTA；`docs/README.md` 更像目录索引。
- 若将 `docs/README.md` 同时服务 GitHub docs 目录和 VitePress 首页，后续首页视觉/交互优化会受兼容性约束。

### Option B：未来新增 `docs/index.md` 作为首页，`docs/README.md` 保留为 GitHub docs 目录入口

优点：

- 可以为 VitePress 单独设计首页，突出 Guide / Reference / Development / ADR 入口。
- `docs/README.md` 可保持 GitHub 目录索引和兼容链接角色，不被 VitePress 首页布局绑架。
- 后续若需要首页 cards、warning banner、语言入口或站点专用 CTA，更容易调整。

缺点：

- 新增一个入口文件，需维护 `docs/index.md` 与 `docs/README.md` 的导航一致性。
- 需要在 VitePress 配置、README 链接和 docs:check 中确认新入口不造成链接漂移。

### Recommendation

推荐分两步：

1. **Round 3B 最小建站阶段**：优先复用 `docs/README.md` 作为首页候选，避免本轮和最小配置阶段引入迁移复杂度。
2. **Round 3C 或后续站点优化阶段**：若需要更清晰的站点 landing page，再新增 `docs/index.md`，并让 `docs/README.md` 继续作为 GitHub docs 目录入口。

本轮不新增 `docs/index.md`。

## 7. Link and route considerations

后续引入 VitePress 前应专门检查链接兼容性。本轮不批量修改链接。

### Existing link patterns

- 根 `README.md` / `README.zh.md` 使用相对链接指向 `docs/...`，适合 GitHub 渲染。
- `docs/README.md` 使用 `./guides/...`、`./reference/...`、`../README.md` 等相对链接，整体适合 GitHub 和 VitePress。
- `docs/reference/*` 大量使用相对链接互相引用，适合在保留现有路径时直接渲染。
- ADR / archive 中存在历史路径和旧项目名，但已有 historical / current reference policy 约束，不应在建站阶段顺手改写为当前 contract。

### `.md` suffix

- VitePress 支持 Markdown 文件路由，页面内链接可保留 `.md` 后缀，也可在后续统一为无后缀路径。
- 为兼容 GitHub 渲染，第一阶段建议保留现有 `.md` 相对链接。
- 如果后续统一去掉 `.md`，应通过 docs link check 或 VitePress build 检查所有页面，而不是手工批量替换。

### Base path / GitHub Pages

当前部署目标为独立子域名 `https://devkit-pi.wangyan.life/`，因此 VitePress 使用：

```ts
base: "/"
```

只有改回 GitHub Pages 仓库路径部署时，例如 `https://www.wangyan.life/devkit-pi/` 或 `https://0xnayuta.github.io/devkit-pi/`，才应使用 `base: "/devkit-pi/"`。最终线上路径以 GitHub Pages Settings → Custom domain 和 DNS 配置为准。

### Route style

第一阶段推荐“保留文件路径，配置 sidebar 分组”：

- `docs/reference/subagents.md` → `/reference/subagents`
- `docs/guides/architecture.md` → `/guides/architecture`
- `docs/development/vitepress-ia-plan.md` → `/development/vitepress-ia-plan`

后续若要改成 `/guide/architecture` 或 `/proposed/...`，应先做重定向或保留旧路径 stub，避免 README、ADR、外部链接断裂。

## 8. Search strategy

第一阶段推荐使用 VitePress local search：

- 不接入 Algolia。
- 搜索范围优先覆盖 current Guide 和 Reference。
- Development 可进入搜索，但搜索结果标题/分区应明确 maintainer/development 属性。
- ADR 可以进入搜索，但标题或页面开头必须明确 “historical decision record”。
- Proposed / Roadmap 建议第一阶段不作为主搜索优先结果；如果 local search 无法精细排除，应确保页面开头和标题明确 `Proposed / Roadmap`。
- Archive 建议默认不进入主要搜索范围；如果无法从 local search 中排除 archive，应避免把 archive 放入 nav/sidebar，并在页面 frontmatter/intro 强提示 historical。

若后续用户反馈搜索结果混淆，应考虑：

- 为 archive/proposed 页面增加更醒目的 warning block。
- 调整 sidebar/nav 权重，减少非 current 页面暴露。
- 研究 VitePress search provider 是否支持排除特定路径。

## 9. Build and deploy strategy

### Round 3B：最小 VitePress 引入

建议后续 Round 3B 执行：

1. 安装 VitePress。
2. 新建 `docs/.vitepress/config.ts`。
3. 添加 `docs:dev`、`docs:build`、`docs:preview` scripts。
4. 配置最小 `title`、`description`、nav、sidebar。
5. 优先使用现有文件路径，不迁移文档。
6. 运行并确保 `pnpm docs:build` 通过。
7. 同步运行 `pnpm docs:check`，确认既有文档检查仍通过。

Round 3B 的目标是可构建、可浏览、导航不误导，不是美化或重写内容。

### Round 3C：站点完善与发布

建议后续 Round 3C 执行：

1. 细化 nav/sidebar 分组和 label。
2. 配置 local search。
3. 明确 proposed / roadmap / ADR / archive 的展示 warning。
4. 检查相对链接、`.md` 后缀、VitePress route 兼容性。
5. 配置 GitHub Pages workflow。
6. 根据部署目标设置 `base`。
7. 运行 `pnpm docs:check`、`pnpm docs:build`、`pnpm test`。
8. 若新增 `docs/index.md`，同步 README / docs index 导航。

## 10. Risks and guardrails

| Risk | Impact | Guardrail |
|---|---|---|
| 建站时顺手重写事实内容导致文档漂移 | Reference 与源码/tests 不一致 | VitePress 阶段只改展示层和导航层；public API 变更必须先改源码/tests，再改 `docs/reference/` |
| proposed / roadmap 被用户误认为 current | 用户调用不存在的工具、字段或命令 | 不放入 current Guide 主路径；页面顶部保留 `status: proposed` 和 warning；sidebar label 明确 Proposed/Roadmap |
| ADR 被误认为 API reference | 历史设计覆盖当前 contract | ADR 独立低优先级 nav；ADR index 和页面提示以 current reference 为准 |
| archive 被搜索结果暴露为当前行为 | 历史计划被误读 | Archive 不进主导航/sidebar；尽量排除搜索或加 historical warning |
| README / docs site 导航不一致 | 用户入口分裂 | 建站后同步检查 README、docs index、reference index、VitePress nav/sidebar |
| VitePress route/base 导致 GitHub Pages 链接错误 | 线上站点链接 404 | Round 3C 明确部署目标和 `base`；本地 `docs:build` 后检查生成链接 |
| `.md` 后缀处理不一致 | GitHub 可点但站点路由异常，或反之 | 第一阶段保留现有相对 `.md` 链接；后续统一风格前先跑 link/build 检查 |
| local search 暴露非 current 页面 | 搜索结果混淆 public surface | current guide/reference 优先；proposed/archive 增加醒目状态；必要时排除路径 |
| Development 内容被当作用户指南 | 维护计划被误读 | Development nav 低于 Guide/Reference，页面 frontmatter audience=maintainer |

## Recommended first-pass VitePress IA summary

- Top nav：Guide、Reference、Development、ADR、GitHub。
- Main user path：Guide + Reference。
- Maintainer path：Development。
- Historical path：ADR；Archive 不进主导航。
- Current contract：只从 Reference 进入。
- Proposed/Roadmap：不进 current Guide 主路径，低优先级链接并明确 non-current。
- Homepage：Round 3B 暂用 `docs/README.md`；Round 3C 后再评估新增 `docs/index.md`。
