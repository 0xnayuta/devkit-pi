---
status: proposed
audience: maintainer
last_verified: 2026-05-10
---

# 个人综合 pi coding toolkit 功能路线图

## 目的

本文记录在 `pi-subagents` 与 `pi-lsp` 基本完成后，继续演进为个人综合 pi coding toolkit 时，值得添加的常见 AI coding agent / developer tooling 功能。

当前项目已经覆盖：

```text
subagents：任务委派、代码导航、审查、研究、实现规划、测试规划
web tools：web_search、fetch_content、get_search_content
lsp：definition、references、hover、symbols、diagnostics、自动诊断 hook
```

下一阶段不应优先增加更多复杂 agent，而应补齐主流 AI coding tools 常见的工作流基础设施：项目记忆、上下文构建、Git 集成、检查命令封装、hooks、诊断聚合、任务追踪和会话压缩。

## 参考工具与常见能力

社区和 GitHub 上常见 AI coding agent / developer tooling 包括：

- Claude Code
- Aider
- Cursor
- Continue
- Cline / Roo Code
- OpenHands
- SWE-agent / mini-swe-agent

这些工具在功能上高度趋同，通常围绕以下链路展开：

```text
项目规则 / 记忆
→ 代码库理解 / 上下文选择
→ 规划
→ 文件编辑
→ lint / test / diagnostics
→ Git diff / commit / undo
→ 会话压缩 / 继续任务
```

因此，本项目后续建议优先补齐这些 workflow primitives，而不是立即实现 MCP、向量数据库、IDE 自动补全或复杂多代理编排。

## 总体优先级

| 优先级 | 功能 | 价值 | 复杂度 | 推荐程度 |
|---|---|---:|---:|---:|
| P0 | 项目记忆 / 规则文件 | 极高 | 低 | 强烈推荐 |
| P0 | project context / repo summary | 极高 | 中 | 强烈推荐 |
| P1 | run_check：测试、lint、typecheck 封装 | 高 | 低-中 | 强烈推荐 |
| P1 | Git 集成：status、diff、commit、undo | 极高 | 中 | 强烈推荐 |
| P1 | Hooks：确定性自动化 | 高 | 中 | 推荐 |
| P1 | diagnose：诊断聚合 | 高 | 中 | 推荐 |
| P2 | Plan / Act workflow | 中高 | 低-中 | 推荐 |
| P2 | Todo / task tracker | 中高 | 低 | 推荐 |
| P2 | Context compaction / session summary | 高 | 中-高 | 推荐 |
| P2 | Patch queue / apply preview | 中高 | 中 | 推荐 |
| P2 | ADR / docs helper | 中高 | 低-中 | 推荐 |
| P2 | 权限系统增强 | 中高 | 中 | 推荐 |
| P2 | Changelog / release notes | 中 | 低-中 | 可选 |
| P3 | GitHub issue / PR helper | 中 | 中 | 可选 |
| P3 | Repo map advanced / embedding search | 中高 | 高 | 暂缓 |
| P3 | MCP 集成 | 中 | 高 | 暂缓 |
| P3 | IDE inline edit / autocomplete | 中 | 很高 | 不建议优先做 |

## 推荐最终模块图

如果项目演进为综合 toolkit，可以按能力域组织：

```text
pi-coding-toolkit
├─ agents
│  ├─ subagent
│  ├─ explorer
│  ├─ reviewer
│  ├─ implementer
│  └─ tester
│
├─ intelligence
│  ├─ lsp
│  ├─ repo_map
│  └─ project_context
│
├─ research
│  ├─ web_search
│  ├─ fetch_content
│  └─ get_search_content
│
├─ workflow
│  ├─ todo
│  ├─ plan
│  ├─ compact
│  └─ patch_queue
│
├─ validation
│  ├─ run_check
│  ├─ diagnose
│  └─ hooks
│
├─ vcs
│  ├─ git_status
│  ├─ git_diff
│  ├─ git_commit
│  └─ git_undo
│
└─ docs
   ├─ adr
   ├─ changelog
   └─ release_notes
```

实际代码结构不一定立刻按上述目录重排，但该图可作为功能边界参考。

---

# P0 功能

## 1. 项目记忆 / 规则文件

### 背景

主流工具几乎都有项目级规则机制：

| 工具 | 类似能力 |
|---|---|
| Claude Code | `CLAUDE.md` |
| Cursor | `.cursorrules` / project rules |
| Cline | `.clinerules` |
| Roo Code | `.roorules` |
| Aider | `.aider.conf.yml` / repo instructions |
| Continue | rules / context providers |

这是投入产出比最高的功能。它能让 agent 每次进入项目时自动获得项目规范、常用命令和维护者偏好。

### 建议文件

可支持以下文件，按层级加载：

```text
~/.pi/toolkit/rules.md          # 全局个人规则
PROJECT/AGENTS.md               # 项目已有 agent 规则
PROJECT/.pi/rules.md            # 项目级规则
PROJECT/.pi/memory.md           # 项目长期记忆
PROJECT/.pi/instructions.md     # 可选额外指令
```

也可以支持更短的根文件：

```text
PROJECT/PI.md
```

### 示例

```md
# Project Rules

## Commands

- Typecheck: `pnpm typecheck`
- Test: `pnpm test`
- Lint: `pnpm lint`
- Format: `pnpm format`
- Docs check: `pnpm docs:check`

## Coding Style

- Use TypeScript ESM.
- Prefer small modules.
- Avoid new runtime dependencies unless necessary.
- Keep extension entry files thin.

## Agent Behavior

- Inspect related files before editing.
- Prefer LSP for symbol lookup.
- After editing code, run typecheck and relevant tests.
- For documentation changes, run docs check when available.
```

### 注入策略

建议注入顺序：

```text
global rules
→ project rules
→ AGENTS.md
→ project memory
→ session summary
```

如果内容过长，需要截断或总结。

### 推荐工具/命令

```ts
project_rules({ action: "show" | "reload" | "paths" })
```

或命令：

```text
/toolkit rules
/toolkit rules reload
```

### 优先级

P0。应作为下一阶段最先实现的功能之一。

## 2. Project Context / 项目上下文包

### 背景

目前 toolkit 已有 subagents、web 和 LSP，但还缺少一个将“项目当前状态”整理成紧凑上下文的能力。

类似能力包括：

- Aider 的 repo map。
- Cursor / Continue 的 codebase context。
- Claude Code 的项目上下文与文件引用。

### 建议工具

```ts
project_context({
  mode: "summary" | "files" | "health" | "task",
  task?: string,
  paths?: string[],
  includeGit?: boolean,
  includeLsp?: boolean
})
```

### 模式说明

| mode | 说明 |
|---|---|
| `summary` | 返回项目结构、包信息、主要目录、常用命令 |
| `files` | 汇总指定文件的摘要、symbols、导入关系 |
| `health` | 汇总 git status、LSP diagnostics、check 命令结果 |
| `task` | 根据任务描述自动寻找相关文件并生成任务上下文 |

### 输出示例

```text
Project: pi-subagents
Package manager: pnpm
Language: TypeScript ESM
Main extension entry: src/extension/index.ts

Key modules:
- src/extension/: extension registration and commands
- src/runtime/: subagent foreground execution
- src/web/: web tools and providers
- src/agents/: agent discovery and frontmatter parsing
- src/config/: config loading

Validation:
- pnpm typecheck
- pnpm test
- pnpm docs:check

Git:
- modified docs/guides/deferred-pi-lsp-merge-plan.md
```

### 实现建议

第一版无需复杂索引，直接组合：

- `package.json`
- `AGENTS.md`
- `.pi/rules.md`
- `docs/guides/goals-and-scope.md`
- `find` / `rg` / 文件树
- LSP `symbols`
- `git status`

后续再考虑 import graph、PageRank 或 embedding search。

### 优先级

P0。

---

# P1 功能

## 3. run_check：检查命令封装

### 背景

agent 可以直接用 bash 跑命令，但封装为专门工具更稳定、更安全、更节省 token。

### 建议工具

```ts
run_check({
  kind: "typecheck" | "lint" | "test" | "format" | "docs" | "custom",
  target?: string,
  fix?: boolean,
  command?: string,
  timeoutMs?: number
})
```

### 配置

```json
{
  "checks": {
    "typecheck": "pnpm typecheck",
    "lint": "pnpm lint",
    "lintFix": "pnpm lint:fix",
    "test": "pnpm test",
    "format": "pnpm format",
    "docs": "pnpm docs:check"
  }
}
```

### 输出目标

不要直接返回完整 stdout/stderr，而应提取摘要：

```text
Typecheck failed: 3 errors

1. src/config/load-config.ts:142:17
   Property 'lsp' does not exist on type 'ExtensionConfig'.

2. src/shared/types.ts:231:5
   Type 'undefined' is not assignable to type 'ResolvedLspConfig'.

Suggested next step:
- Update ExtensionConfig and ResolvedExtensionConfig.
```

### 优先级

P1。实现复杂度低，日常收益高。

## 4. Git 集成

### 背景

Git 集成是 Aider、Claude Code 等 coding agent 的核心体验之一。它能让 agent 的修改可追踪、可提交、可撤销。

### 建议工具

可拆成多个小工具：

```ts
git_status()
git_diff({ staged?: boolean, path?: string })
git_commit({ message?: string, autoMessage?: boolean })
git_undo({ scope?: "last-ai-change" | "working-tree" })
```

也可以统一为：

```ts
git_tool({
  action: "status" | "diff" | "commit" | "undo" | "log" | "snapshot",
  path?: string,
  message?: string,
  autoMessage?: boolean
})
```

### 推荐能力

#### 修改前 snapshot

在 agent 开始修改前记录：

```text
HEAD commit
working tree status
modified files
```

#### 修改后 diff summary

```text
Changed files:
- src/config/load-config.ts
- src/shared/types.ts

Summary:
- Added lsp config namespace.
- Migrated legacy webTools config.
```

#### 自动 commit message

生成 conventional commit 风格：

```text
feat: add namespace config for toolkit modules
```

#### Undo

可选实现：

- 基于 git restore。
- 基于保存 patch。
- 基于 AI change snapshot。

### 安全策略

默认不自动 commit，除非用户显式调用或配置开启。

### 优先级

P1。

## 5. Hooks：确定性自动化

### 背景

Prompt 是概率性的，模型可能忘记运行 format/test；hook 是确定性的，每次触发都会执行。

Claude Code 的 hooks 机制证明该能力很实用。

### 建议事件

第一版只支持少量高价值事件：

```text
after_edit
agent_end
before_commit
```

后续可扩展：

```text
session_start
before_tool
after_tool
after_write
session_end
```

### 配置示例

```json
{
  "hooks": {
    "afterEdit": [
      {
        "match": "**/*.{ts,tsx,js,json,md}",
        "run": "pnpm format",
        "timeoutMs": 120000
      }
    ],
    "agentEnd": [
      {
        "run": "pnpm typecheck",
        "timeoutMs": 120000
      }
    ],
    "beforeCommit": [
      {
        "run": "pnpm test",
        "timeoutMs": 120000
      }
    ]
  }
}
```

### 安全策略

- hooks 默认关闭或仅允许白名单命令。
- hook 输出需要截断。
- hook 失败应返回明确错误，但不应导致 extension 崩溃。

### 优先级

P1。

## 6. diagnose：诊断聚合

### 背景

合并 LSP 后，诊断来源会变多：

```text
LSP diagnostics
+ typecheck
+ lint / biome / eslint
+ tests
+ docs check
+ package manifest checks
```

agent 如果分别调用这些工具再拼接结果，容易浪费 token。应提供统一诊断聚合工具。

### 建议工具

```ts
diagnose({
  scope: "file" | "changed" | "workspace",
  file?: string,
  include?: ["lsp", "typecheck", "lint", "test", "docs"]
})
```

### 输出示例

```text
Workspace Health: failed

LSP:
- 0 errors

Typecheck:
- 2 errors in src/config/load-config.ts

Lint:
- 1 formatting issue

Tests:
- not run

Suggested next step:
- Fix config type definitions first, then rerun typecheck.
```

### 优先级

P1/P2。建议在 LSP tool 和 run_check 稳定后实现。

---

# P2 功能

## 7. Plan / Act workflow

### 背景

许多工具都区分规划和执行：

| 工具 | 类似能力 |
|---|---|
| Cline | Plan / Act |
| Roo Code | Architect / Code |
| Aider | Architect mode |
| Claude Code | plan mode / extended thinking |

当前项目已有 `implementer` 子代理，可进一步产品化为 plan workflow。

### 建议工具

```ts
create_plan({
  task: string,
  includeFiles?: boolean,
  includeRisks?: boolean,
  includeValidation?: boolean
})
```

### 输出结构

```json
{
  "summary": "...",
  "filesToInspect": ["..."],
  "filesToChange": ["..."],
  "steps": ["..."],
  "risks": ["..."],
  "validation": ["pnpm typecheck", "pnpm test"]
}
```

### 推荐工作流

```text
用户提出任务
→ create_plan
→ reviewer 审查 plan
→ 用户确认
→ 主代理执行
→ run_check / diagnose
```

### 优先级

P2。

## 8. Todo / task tracker

### 背景

长任务需要状态。Todo tracker 能让 agent 明确当前进行到哪一步。

### 建议工具

```ts
todo({
  action: "list" | "add" | "update" | "done" | "clear",
  id?: string,
  text?: string,
  status?: "pending" | "in_progress" | "done"
})
```

### 存储

简单存到：

```text
.pi/todo.json
```

或 markdown：

```text
.pi/todo.md
```

### 示例

```text
[done] Inspect current config structure
[in_progress] Add lsp config namespace
[pending] Register lsp tool
[pending] Add tests
[pending] Update README
```

### 优先级

P2。复杂度低，适合长任务。

## 9. Context compaction / session summary

### 背景

当会话变长时，agent 会忘记早期决策。主流工具常见能力包括：

- 自动总结旧对话。
- 手动 `/compact`。
- session summary。
- handoff summary。

### 建议工具

```ts
compact_context({
  mode: "session" | "task" | "handoff",
  save?: boolean
})
```

### 输出示例

```md
# Session Summary

## Goal

Merge pi-lsp into pi-subagents as personal pi coding toolkit.

## Decisions

- Rename optional, but docs should describe toolkit direction.
- LSP tool before LSP hook.
- Child subagents may use readonly LSP actions.
- Mutating LSP actions disabled in child processes.

## Changed Files

- docs/guides/deferred-pi-lsp-merge-plan.md

## Next Steps

1. Add ADR 0005.
2. Update AGENTS.md.
3. Modularize extension index.
```

### 存储位置

```text
.pi/session-summary.md
.pi/memory/YYYY-MM-DD.md
```

### 优先级

P2。长期价值高。

## 10. Patch queue / apply preview

### 背景

许多 coding tools 的核心体验是：

```text
propose patch
→ preview diff
→ accept/reject
```

当前项目强调 readonly planning 和安全边界，因此 patch queue 很适合。

### 建议工具

```ts
patch_queue({
  action: "create" | "list" | "show" | "apply" | "discard",
  patch?: string,
  id?: string
})
```

### 用法

`implementer` 子代理先输出 patch plan，不直接写文件。主代理或用户再决定是否 apply。

### 优先级

P2。

## 11. ADR / docs helper

### 背景

当前项目已经使用 ADR，并且非常依赖文档同步。可以提供专用 docs tooling。

### 建议工具

```ts
adr({
  action: "new" | "list" | "show" | "supersede",
  title?: string,
  id?: string
})
```

```ts
docs_tool({
  action: "check" | "toc" | "link-check" | "config-reference" | "adr-template"
})
```

### ADR 示例

```text
adr({ action: "new", title: "Evolve into personal pi coding toolkit" })
```

生成：

```md
---
status: proposed
date: 2026-05-10
---

# 0005 - Evolve into personal pi coding toolkit

## Context

...

## Decision

...

## Consequences

...
```

### 优先级

P2。与当前项目工作流高度匹配。

## 12. 权限系统增强

### 背景

当前项目已有 readonly subagents 和 `allowWriteSubagents`，但综合 toolkit 可能需要更细粒度的权限。

### 简化配置

```json
{
  "safety": {
    "allowedWritePaths": ["src/**", "docs/**", "tests/**"],
    "deniedWritePaths": [".git/**", "node_modules/**", "pnpm-lock.yaml"],
    "allowedCommands": [
      "pnpm typecheck",
      "pnpm test",
      "pnpm lint",
      "pnpm format"
    ],
    "deniedCommands": [
      "rm -rf",
      "sudo",
      "curl | sh"
    ],
    "allowedLspActions": [
      "definition",
      "references",
      "hover",
      "signature",
      "symbols",
      "diagnostics",
      "workspace-diagnostics"
    ],
    "deniedLspActions": ["rename", "codeAction", "restart"]
  }
}
```

### 优先级

P2。建议在引入更多写操作或 bash-like hooks 前实现。

## 13. Changelog / release notes

### 建议工具

```ts
release_notes({
  since?: string,
  format: "markdown" | "github" | "npm"
})
```

### 能力

- 从 git commits 生成 release notes。
- 从 changed files 生成 changelog entry。
- 检查 package.json version。
- 提醒 README / docs 是否需要更新。

### 优先级

P2/P3。适合发布 npm 包时使用。

---

# P3 功能

## 14. GitHub issue / PR helper

### 建议工具

```ts
github_issue({
  action: "list" | "create" | "summarize" | "close"
})
```

```ts
pr_description({
  base?: string,
  includeDiff?: boolean
})
```

### 输出示例

```md
## Summary

- Reposition project as personal pi coding toolkit.
- Update deferred LSP merge plan.
- Add staged roadmap for LSP tool and hook integration.

## Test Plan

- Documentation only.
```

### 优先级

P3。除非你高频使用 GitHub PR workflow，否则不是下一阶段重点。

## 15. Repo map advanced / embedding search

### 背景

Aider 的 repo map 很强，使用 tree-sitter 和 PageRank。Continue 等工具使用向量检索。

### 建议

不要一开始做 embedding search。先做轻量版：

```ts
repo_map({
  path?: string,
  depth?: number,
  includeSymbols?: boolean
})
```

结合 LSP symbols 即可生成：

```text
src/
├─ extension/
│  ├─ index.ts
│  │  - registerSubagentExtension()
│  │  - registerDeveloperCommands()
├─ config/
│  ├─ load-config.ts
│  │  - loadConfig()
│  │  - mergeConfig()
│  │  - normalizeWebToolsConfig()
```

高级功能包括：

- import graph。
- 引用热度。
- task-based related file selection。
- embedding search。

### 优先级

轻量 repo map：P2。
高级 repo map / embedding：P3。

## 16. MCP 集成

### 背景

MCP 是社区热门方向，Claude Code、Cline、Continue 等工具都支持或集成相关生态。

### 暂缓原因

- 实现复杂度高。
- 安全边界复杂。
- pi 已有 extension/tool 机制。
- 当前项目更缺 workflow primitives，而不是外部生态协议。

### 何时考虑

只有当明确需要接入以下服务时再考虑：

- GitHub
- Linear
- Notion
- browser / Playwright
- database
- 自定义 MCP servers

### 优先级

P3。

## 17. IDE inline edit / autocomplete

### 背景

Cursor、Continue 等工具的自动补全体验很强，但这属于 IDE 集成范畴。

### 不建议优先做的原因

- 需要编辑器插件或深度 UI 集成。
- 与 pi CLI / TUI coding workflow 不完全匹配。
- 实现复杂度很高。

### 优先级

P3，当前不建议。

---

# 推荐实施路线

## Phase A：个人工作流基础设施

优先实现：

```text
1. 项目规则 / memory
2. project_context
3. run_check
4. git_tool
```

目标：让 agent 每次进入项目都知道规则、知道项目结构、能稳定运行检查、能查看和管理 diff。

## Phase B：自动化与诊断

实现：

```text
5. hooks
6. diagnose
7. 权限系统增强
```

目标：把“希望模型记得做的事”变成系统确定执行的事。

## Phase C：长任务支持

实现：

```text
8. todo tracker
9. compact_context
10. plan/act workflow
11. patch_queue
```

目标：让 agent 更稳定地处理跨多轮、多文件、多阶段任务。

## Phase D：文档与发布辅助

实现：

```text
12. adr
13. docs_tool
14. release_notes
15. pr_description
```

目标：降低维护文档、ADR、release notes 的成本。

## Phase E：高级生态能力

仅在明确需要时实现：

```text
16. repo map advanced / embedding search
17. MCP integration
18. IDE integration
```

---

# 最小推荐下一步

如果只选 3 个功能，建议按此顺序：

```text
P0-1: .pi/rules.md / PI.md 项目规则自动注入
P0-2: project_context 工具
P1-1: run_check 工具
```

如果只选 5 个功能，建议：

```text
1. 项目规则 / memory
2. project_context
3. run_check
4. git_tool
5. hooks
```

这些功能能立即提升个人使用体验，并且不会破坏现有 subagent + web + LSP 架构。

---

# 当前建议

在 `pi-subagents` 和 `pi-lsp` 合并为个人综合 pi coding toolkit 后，下一阶段不要急于实现复杂生态功能。建议优先补齐：

```text
规则 → 上下文 → 检查 → Git → hooks → 诊断
```

这条路线最符合个人 coding agent toolkit 的高频需求，也最容易与现有模块组合。
