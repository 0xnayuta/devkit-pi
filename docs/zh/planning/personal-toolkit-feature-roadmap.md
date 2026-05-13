---
status: proposed
audience: maintainer
last_verified: 2026-05-13
language: chinese
---

# 个人综合 pi coding toolkit 功能路线图

## 目的

本文记录在 `pi-subagents` 与 `pi-lsp` 基本完成后，继续演进为个人综合 pi coding toolkit 时，值得添加的常见 AI coding agent / developer tooling 功能。

## 项目当前状态

**项目已演进为 `devkit-pi`**（自 v0.1.0 起），当前已覆盖：

```text
✅ subagents：任务委派、代码导航、审查、研究、实现规划、测试规划
✅ web：web_search、fetch_content、get_search_content
✅ lsp：definition、references、hover、symbols、diagnostics、自动诊断 hook
✅ convert：convert_content 工具（MarkItDown CLI provider）
✅ commands：统一 /toolkit 命令中心
```

**当前已实现的模块结构：**

```text
devkit-pi/
├─ src/
│  ├─ index.ts              # 入口
│  ├─ modules/
│  │  ├─ subagents/         # 子代理委派系统
│  │  ├─ web/               # 网络搜索与内容获取（6 个 provider）
│  │  ├─ lsp/               # LSP 代码智能 + diagnostics hook
│  │  ├─ convert/           # 文件转 Markdown（MarkItDown CLI）
│  │  └─ commands/          # /toolkit 命令
│  ├─ config/
│  │  └─ load-config.ts     # 配置加载与归一化
│  └─ shared/
│     ├─ types.ts           # 核心类型
│     ├─ errors.ts          # 错误码定义
│     ├─ activity.ts        # 活动记录
│     └─ external-command.ts # 外部命令执行
├─ agents/                   # 5 个内置 agent 定义
│  ├─ explorer.md
│  ├─ researcher.md
│  ├─ reviewer.md
│  ├─ implementer.md
│  └─ tester.md
└─ tests/                    # 单元测试（镜像 src/modules 结构）
```

**已实现的 /toolkit 子命令：**

| 命令 | 功能 |
|------|------|
| `/toolkit doctor` | 运行统一诊断检查 |
| `/toolkit modules` | 显示模块启用状态 |
| `/toolkit logs` | 显示最近网络活动日志 |
| `/toolkit agents` | 列出内置/用户/项目 agent |
| `/toolkit lsp` | 显示 LSP tool/hook 配置 |
| `/toolkit activity` | 打开活动面板 |
| `/toolkit help` | 显示帮助 |

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

> **注**：下表列出的是尚未实现的功能。已实现功能见上方「当前模块图」。

| 优先级 | 功能 | 价值 | 复杂度 | 推荐程度 |
|---|---|---:|---:|---:|
| P0 | project_status / 项目状态聚合 | 极高 | 中 | ⭐⭐⭐ 强烈推荐 |
| P0 | ~~项目记忆 / 规则文件~~ | 极高 | 低 | ❌ 不实现（pi 平台提供） |
| P1 | run_check：检查命令封装 | 高 | 低-中 | ⭐⭐⭐ 强烈推荐 |
| P1 | Git 集成：status、diff、commit、undo | 极高 | 中 | ⭐⭐⭐ 强烈推荐 |
| P1 | Hooks：确定性自动化 | 高 | 中 | ⭐⭐ 推荐 |
| P1 | diagnose：诊断聚合 | 高 | 中 | ⭐⭐ 推荐 |
| P2 | Plan / Act workflow | 中高 | 低-中 | ⭐⭐ 推荐 |
| P2 | Todo / task tracker | 中高 | 低 | ⭐⭐ 推荐 |
| P2 | ~~Context compaction / session summary~~ | 高 | 中-高 | ❌ 不实现（pi 平台提供） |
| P2 | Patch queue / apply preview | 中高 | 中 | ⭐⭐ 推荐 |
| P2 | ADR / docs helper | 中高 | 低-中 | ⭐⭐ 推荐 |
| P2 | 权限系统增强 | 中高 | 中 | ⭐⭐ 推荐 |
| P2 | Changelog / release notes | 中 | 低-中 | ⭐ 可选 |
| P3 | GitHub issue / PR helper | 中 | 中 | ⭐ 可选 |
| P3 | Repo map advanced / embedding search | 中高 | 高 | ⏸️ 暂缓 |
| P3 | MCP 集成 | 中 | 高 | ⏸️ 暂缓 |
| P3 | IDE inline edit / autocomplete | 中 | 很高 | ⛔ 不建议优先做 |

**图例：**
- ⭐⭐⭐ 强烈推荐 — 优先实现
- ⭐⭐ 推荐 — 值得实现
- ⭐ 可选 — 按需实现
- ⏸️ 暂缓 — 需要时再考虑
- ⛔ 不建议 — 投入产出比低

## 当前模块图

项目已实现的功能按能力域组织如下：

```text
devkit-pi
├─ agents
│  ├─ subagent        ✅ 已实现（5 个内置 agent）
│  ├─ explorer        ✅ 已实现
│  ├─ reviewer        ✅ 已实现
│  ├─ implementer     ✅ 已实现
│  └─ tester          ✅ 已实现
│
├─ intelligence
│  ├─ lsp             ✅ 已实现（tool + diagnostics hook）
│  └─ (project_status) 🔄 待实现（P0）
│
├─ research
│  ├─ web_search      ✅ 已实现（6 个 provider）
│  ├─ fetch_content   ✅ 已实现
│  └─ get_search_content ✅ 已实现
│
├─ (workflow)         🔄 待实现（P2）
│  ├─ todo
│  ├─ plan
│  ├─ compact
│  └─ patch_queue
│
├─ (validation)       🔄 待实现（P1）
│  ├─ run_check
│  ├─ diagnose
│  └─ hooks
│
├─ (vcs)              🔄 待实现（P1）
│  ├─ git_status
│  ├─ git_diff
│  ├─ git_commit
│  └─ git_undo
│
├─ convert            ✅ 已实现（MarkItDown CLI provider）
│
├─ commands           ✅ 已实现（/toolkit 命令中心）
│
└─ docs
   ├─ adr             ✅ 已有（手动维护）
   ├─ (adr_tool)      🔄 待实现（P2）
   └─ (changelog)    🔄 待实现（P2）
```

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

### 当前状态

**❌ 不考虑实现** — pi 平台已内置 AGENTS.md 自动注入机制，本项目无需重复实现。

### 分析

pi 平台的资源发现管道（Resource Discovery Pipeline）已实现：

1. **AGENTS.md 自动注入**：pi 会自动加载项目根目录的 `AGENTS.md` 并注入到 agent 上下文
2. **项目级优先**：`.pi/` 目录下的资源覆盖全局资源（`~/.pi/agent/`）
3. **Prompt Templates**：支持 `.pi/prompts/*.md` 项目级模板
4. **Extensions**：支持生命周期 hook，可自定义上下文注入

因此，`AGENTS.md` 已完整覆盖"项目规则注入"的需求。devkit-pi 无需额外实现规则文件加载器。

### 相关文件

- `AGENTS.md` — 项目已有的架构指南和开发规范
- `.pi/prompts/` — 可放置项目级 prompt 模板（如需要）

### 优先级

**不实现** — 依赖 pi 平台内置机制。

---

## 2. project_status / 项目状态聚合

### 背景

目前 toolkit 已有 subagents、web 和 LSP，但缺少一个将"项目当前状态"整理成紧凑上下文的能力。

这与 AGENTS.md（静态规则）**互补** — AGENTS.md 告诉 agent "应该怎么做"，project_status 告诉 agent "现在项目是什么状态"。

类似能力包括：

- Aider 的 repo map（轻量版）
- Cursor / Continue 的 codebase context
- Claude Code 的项目状态摘要

### 当前状态

**🔄 待实现** — 项目尚未实现 project_status 工具。

### 与现有命令的关系

| 命令 | 用途 | 对象 |
|------|------|------|
| `/toolkit modules` | 给人看的模块状态 | 开发者 |
| `/toolkit doctor` | 给人看的诊断报告 | 开发者 |
| `project_status` | 给 agent 看的紧凑上下文 | agent |

### 建议工具

```ts
project_status({
  mode: "overview" | "focused" | "health",
  paths?: string[],
  includeGit?: boolean,
  includeLsp?: boolean
})
```

### 模式说明

| mode | 说明 |
|---|---|
| `overview` | 返回项目概览：包管理器、语言、目录结构、模块列表 |
| `focused` | 返回指定文件/目录的上下文：摘要、关键 symbols |
| `health` | 返回项目健康状态：git status、LSP diagnostics、关键文件变化 |

### 输出示例

**overview 模式：**

```text
Project: devkit-pi
Package manager: pnpm (v11.1.1)
Language: TypeScript ESM
Main entry: src/index.ts

Modules: subagents, web (6 providers), lsp, convert, commands
Agent count: 5 (explorer, researcher, reviewer, implementer, tester)
Validation: pnpm typecheck | pnpm test | pnpm lint | pnpm docs:check
```

**focused 模式：targeting `src/config/`**

```text
src/config/
├─ load-config.ts (primary)
│  - loadConfig(), mergeConfig(), normalize*()
│  - Config namespaces: web, subagents, lsp, convertContent, commands

Related files: src/shared/types.ts (ToolkitConfig types)
```

**health 模式：**

```text
Health: mixed

Git: 2 files changed (1 tracked, 1 untracked)
- modified: docs/zh/planning/personal-toolkit-feature-roadmap.md
- new: src/modules/xxx/temp.ts

LSP: 0 errors, 2 warnings
- src/config/load-config.ts: unused variable 'debugMode'

Key files: AGENTS.md exists, package.json valid
```

### 实现建议

第一版聚焦 `overview` 和 `health` 模式：

1. 解析 `package.json` 获取项目信息
2. 读取 `AGENTS.md` 行数（确认存在）
3. 列出 `src/modules/` 和 `agents/` 目录结构
4. 调用 `git status --porcelain` 获取修改状态
5. 调用 LSP `workspace-diagnostics` 获取错误/警告摘要

`focused` 模式后续实现，可结合 LSP `symbols` 和文件树。

### 与 AGENTS.md 的区别

| 维度 | AGENTS.md | project_status |
|------|-----------|----------------|
| 内容 | 规则、决策、流程 | 文件、状态、metrics |
| 更新频率 | 手动更新 | 实时查询 |
| 用途 | 指导 agent 行为 | 提供当前上下文 |

### 优先级

**P0** — 项目状态感知是 agent 高效工作的基础。

---

# P1 功能

## 3. run_check：检查命令封装

### 背景

agent 可以直接用 bash 跑命令，但封装为专门工具更稳定、更安全、更节省 token。

### 当前状态

**🔄 待实现** — 项目尚未实现 run_check 工具。但 `/toolkit doctor` 命令提供了部分诊断功能。

### 设计原则

**混合方案**：自动检测项目类型 + 配置覆盖 + 命令默认值。

- 优先使用用户配置的自定义命令
- 其次根据项目类型自动检测默认命令
- 确保多语言项目都能开箱即用

### 项目类型检测

自动检测项目根目录的特征文件：

| 项目类型 | 特征文件 | 备注 |
|----------|----------|------|
| TypeScript / Node.js | `package.json` | 当前项目 |
| Rust | `Cargo.toml` | |
| Go | `go.mod` | |
| Python | `pyproject.toml` / `requirements.txt` | |
| Generic | `Makefile` | 自定义检查 |
| Unknown | — | 无默认命令 |

### 默认命令映射

| 类型 | typecheck | test | lint | format |
|------|-----------|------|------|--------|
| **node** | `tsc --noEmit` | `pnpm test` | `pnpm lint` | `pnpm format` |
| **rust** | `cargo check` | `cargo test` | `cargo clippy` | `cargo fmt` |
| **go** | `go vet ./...` | `go test ./...` | `golangci-lint run` | `gofmt -w .` |
| **python** | `mypy .` | `pytest` | `ruff check .` | `ruff format .` |
| **generic** | (无默认值) | (无默认值) | (无默认值) | (无默认值) |

### 建议工具

```ts
run_check({
  kind: "typecheck" | "lint" | "test" | "format" | "docs" | "custom",

  // 可选：指定语言（默认 auto，自动检测项目类型）
  language?: "auto" | "typescript" | "rust" | "go" | "python" | "generic",

  // 可选：自定义命令（覆盖默认 + 配置）
  command?: string,

  // 可选：fix 模式（仅用于 lint/format）
  fix?: boolean,

  // 可选：超时（毫秒）
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

**命令来源优先级**：

```text
1. 显式传入 command 参数（最高优先级）
2. 配置中的 kind 对应命令
3. 项目类型的默认命令
4. 无默认命令时返回错误
```

### 输出格式

结构化输出，便于 agent 理解和后续处理：

**成功时：**

```text
check: typecheck
status: passed
duration: 1.234s
language: typescript
```

**失败时：**

```text
check: typecheck
status: failed (3 errors)
duration: 2.456s
language: typescript

1. src/config/load-config.ts:142:17
   Invalid hook mode: expected "agent_end", "edit_write", or "disabled".

2. src/shared/types.ts:231:5
   Type 'undefined' is not assignable to type 'ResolvedLspConfig'.

3. src/modules/web/handlers.ts:89:3
   Parameter 'url' implicitly has 'any' type.

suggested_next_step: Fix type errors in config and types modules.
```

**无默认命令时：**

```text
check: typecheck
status: skipped
reason: No default command for generic project type.
           Configure checks.typecheck in settings or pass command parameter.
```

### 实现建议

**第一版（配置驱动）**：

1. 解析用户配置中的 `checks` 映射
2. 如果配置存在，使用配置的命令
3. 如果配置不存在且 `language` 为 `auto`，检测项目类型
4. 根据项目类型使用默认命令

**后续扩展**：

1. 添加 `list_defaults` 模式，显示当前项目类型的默认命令
2. 添加 `validate_config` 模式，检查配置中的命令是否可用
3. 支持 `.toolkitignore` 文件，排除某些检查

### 优先级

**P1** — 实现复杂度低，日常收益高。

---

## 4. Git 集成

### 背景

Git 集成是 Aider、Claude Code 等 coding agent 的核心体验之一。它能让 agent 的修改可追踪、可提交、可撤销。

### 当前状态

**🔄 待实现** — 项目尚未实现 Git 集成工具。

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
- Updated web provider configuration.
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

**P1**。

---

## 5. Hooks：确定性自动化

### 背景

Prompt 是概率性的，模型可能忘记运行 format/test；hook 是确定性的，每次触发都会执行。

Claude Code 的 hooks 机制证明该能力很实用。

### 当前状态

**🔄 待实现** — 项目尚未实现 Hooks 机制。但 LSP diagnostics hook 已作为类似概念实现。

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
        "timeoutMs": 300000
      }
    ],
    "agentEnd": [
      {
        "run": "pnpm typecheck",
        "timeoutMs": 300000
      }
    ],
    "beforeCommit": [
      {
        "run": "pnpm test",
        "timeoutMs": 300000
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

**P1**。

---

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

### 当前状态

**🔄 待实现** — 项目尚未实现 diagnose 工具。但 `/toolkit doctor` 命令已提供统一诊断检查。

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

**P1/P2**。建议在 LSP tool 和 run_check 稳定后实现。

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

### 当前状态

**🔄 待实现** — `implementer` agent 存在但尚未作为独立工具暴露。

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

**P2**。

---

## 8. Todo / task tracker

### 背景

长任务需要状态。Todo tracker 能让 agent 明确当前进行到哪一步。

### 当前状态

**🔄 待实现** — 项目尚未实现 Todo tracker。

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

**P2**。复杂度低，适合长任务。

---

## 9. Context compaction / session summary

### 背景

当会话变长时，agent 会忘记早期决策。主流工具常见能力包括：

- 自动总结旧对话
- 手动 `/compact`
- session summary / handoff summary

### 当前状态

**❌ 不考虑实现** — pi 平台已内置完整的会话压缩与会话管理机制。

### 分析

pi 平台已实现：

| 功能 | 描述 | 触发方式 |
|------|------|----------|
| 自动压缩 | 当上下文接近限制时自动触发 | 自动 |
| 手动压缩 | `/compact [instructions]` | 用户触发 |
| 分支摘要 | 切换分支时生成分支摘要 | `/tree` 导航时 |
| 结构化格式 | Goal、Progress、Key Decisions、Next Steps | 自动 |
| 持久化 | JSONL Session 文件包含完整历史 | 自动 |

原始提案的三个子功能与 pi 现有机制重叠：

| 提案功能 | 问题 |
|----------|------|
| **Summary 持久化** | Session JSONL 已包含 CompactionEntry，无需重复保存 |
| **任务级摘要** | 用 pi 的 `/fork` 隔离任务更可靠，无需自行切分 |
| **日期归档** | 边缘功能，用户可用文件系统搜索替代 |

**根本原因**：pi 设计会话为独立思考单元，跨会话传递旧摘要可能导致上下文污染。

### 相关 pi 机制

- `/compact` — 会话压缩
- `/tree` — 分支导航 + 摘要
- Session JSONL — 持久化存储
- `session_before_compact` — 自定义压缩逻辑（Extensions）

### 优先级

**不实现** — 依赖 pi 平台内置机制。

---

## 10. Patch queue / apply preview

### 背景

许多 coding tools 的核心体验是：

```text
propose patch
→ preview diff
→ accept/reject
```

当前项目强调 readonly planning 和安全边界，因此 patch queue 很适合。

### 当前状态

**🔄 待实现** — 项目尚未实现 Patch queue。

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

**P2**。

---

## 11. ADR / docs helper

### 背景

当前项目已经使用 ADR，并且非常依赖文档同步。可以提供专用 docs tooling。

### 当前状态

**🔄 待实现** — ADR 目前手动维护，项目未实现专用工具。

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

**P2**。与当前项目工作流高度匹配。

---

## 12. 权限系统增强

### 背景

当前项目已有 readonly subagents 和 `subagents.allowWrite`，但综合 toolkit 可能需要更细粒度的权限。

### 当前状态

**🔄 待实现** — 项目已有基础权限控制（`allowWrite`），但尚未实现细粒度权限。

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

**P2**。建议在引入更多写操作或 bash-like hooks 前实现。

---

## 13. Changelog / release notes

### 背景

项目已有 `CHANGELOG.md`，可提供自动化工具辅助维护。

### 当前状态

**🔄 待实现** — changelog 目前手动维护。

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

**P2/P3**。适合发布 npm 包时使用。

---

# P3 功能

## 14. GitHub issue / PR helper

### 背景

项目目前不强制依赖 GitHub workflow，但有需要时可实现。

### 当前状态

**🔄 待实现**

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

**P3**。除非你高频使用 GitHub PR workflow，否则不是下一阶段重点。

---

## 15. Repo map advanced / embedding search

### 背景

Aider 的 repo map 很强，使用 tree-sitter 和 PageRank。Continue 等工具使用向量检索。

### 当前状态

**🔄 待实现** — `project_context` 的轻量版可先实现。

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

轻量 repo map：**P2**（合并到 project_context）。  
高级 repo map / embedding：**P3**。

---

## 16. MCP 集成

### 背景

MCP 是社区热门方向，Claude Code、Cline、Continue 等工具都支持或集成相关生态。

### 当前状态

**🔄 待实现** — 项目尚未实现 MCP 集成。

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

**P3**。

---

## 17. IDE inline edit / autocomplete

### 背景

Cursor、Continue 等工具的自动补全体验很强，但这属于 IDE 集成范畴。

### 当前状态

**🔄 待实现** — 项目不计划实现 IDE 集成功能。

### 不建议优先做的原因

- 需要编辑器插件或深度 UI 集成。
- 与 pi CLI / TUI coding workflow 不完全匹配。
- 实现复杂度很高。

### 优先级

**P3**，当前不建议。

---

# 推荐实施路线

## Phase A：个人工作流基础设施

优先实现：

```text
1. 项目规则 / memory (.pi/rules.md / PI.md)
2. project_context 工具
3. run_check 工具
4. git_tool 工具
```

目标：让 agent 每次进入项目都知道规则、知道项目结构、能稳定运行检查、能查看和管理 diff。

## Phase B：自动化与诊断

实现：

```text
5. hooks
6. diagnose
7. 权限系统增强
```

目标：把"希望模型记得做的事"变成系统确定执行的事。

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