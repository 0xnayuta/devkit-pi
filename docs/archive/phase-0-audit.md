---
status: historical
audience: maintainer
last_verified: 2026-05-08
---

# Phase 0 裁剪清单审计报告

> 生成时间: 2026-05-07
> 状态: **✅ 已完成**

## 审计范围

基于 `docs/audits/simplification-implementation-history.md` Phase 0 定义的必查文件和裁剪清单。

---

## 一、必查文件状态

### 1.1 package.json

| 检查项 | 状态 | 当前值 | 目标值 |
|--------|------|--------|--------|
| description | ❌ 需改 | "Pi extension for delegating tasks to subagents with chains, parallel execution, and TUI clarification" | "Simple pi subagents extension" |
| files | ❌ 需改 | 包含 `skills/**/*`, `prompts/**/*` | 移除 skills/prompts |
| pi.prompts | ❌ 需改 | `["./prompts"]` | 移除 |
| pi.skills | ❌ 需改 | `["./skills"]` | 移除 |

### 1.2 src/extension/index.ts

| 检查项 | 状态 | 问题 |
|--------|------|------|
| SUBAGENT_CHILD_ENV check | ✅ 已存在 | `if (process.env[SUBAGENT_CHILD_ENV] === "1") return;` |
| createResultWatcher | ❌ 需删除 | 未使用的 result watcher 导入和启动 |
| createAsyncJobTracker | ❌ 需删除 | async job tracker |
| registerSlashCommands | ❌ 需删除 | slash 命令注册 |
| registerPromptTemplateDelegationBridge | ❌ 需删除 | prompt template bridge |
| registerSlashSubagentBridge | ❌ 需删除 | slash subagent bridge |
| registerSubagentNotify | ❌ 需删除 | notify renderer |
| TUI renderers | ❌ 需删除 | SubagentControlNoticeComponent, renderWidget |
| registerMessageRenderer | ❌ 需删除 | 3 个 message renderer 注册 |
| artifact cleanup | ❌ 需删除 | cleanupAllArtifactDirs, cleanupOldArtifacts |

### 1.3 src/extension/schemas.ts

| 检查项 | 状态 | 问题 |
|--------|------|------|
| SubagentParams 复杂度 | ❌ 需简化 | 当前包含 TaskItem, ParallelTaskSchema, ChainItem, ControlOverrides 等 |
| 目标 schema | ✅ 目标 | `Type.Object({ agent: string, task: string })` |

### 1.4 src/runs/foreground/subagent-executor.ts

| 检查项 | 状态 | 问题 |
|--------|------|------|
| 文件大小 | ❌ 需重写 | 2233 行 |
| runAsyncPath | ❌ 需删除 | async 执行路径 |
| runChainPath | ❌ 需删除 | chain 执行路径 |
| runForegroundParallelTasks | ❌ 需删除 | parallel 执行路径 |
| resumeAsyncRun | ❌ 需删除 | async resume 逻辑 |
| 目标 | ✅ 目标 | 仅保留 foreground single execution |

### 1.5 src/shared/types.ts

| 检查项 | 状态 | 问题 |
|--------|------|------|
| AsyncStatus | ❌ 需删除 | async job status 类型 |
| AsyncJobState | ❌ 需删除 | async job state 类型 |
| ControlEvent | ❌ 需删除 | control event 类型 |
| IntercomEventBus | ❌ 需删除 | intercom 事件总线 |
| SubagentRunMode | ❌ 需删除 | parallel/chain 模式 |
| 目标 | ✅ 目标 | 仅保留 MVP 类型 |

---

## 二、裁剪分类详细清单

### 2.1 保留/改写

| 文件 | 新状态 | 处置方式 |
|------|--------|----------|
| src/extension/index.ts | 🔄 改写 | 重写为最小入口 |
| src/extension/schemas.ts | 🔄 改写 | 重写为最小 schema |
| src/agents/frontmatter.ts | ✅ 保留 | 当前实现已符合 MVP |
| src/runs/foreground/execution.ts | 🔄 改写 | 保留 runSync 核心，删除其他分支 |
| src/runs/shared/pi-args.ts | ✅ 保留 | 可裁剪复用 |
| src/runs/shared/pi-spawn.ts | ✅ 保留 | 保留 |
| src/runs/shared/subagent-prompt-runtime.ts | ✅ 保留 | 简化 |

### 2.2 需删除目录

| 目录 | 文件数 | 删除原因 |
|------|--------|----------|
| src/runs/background/ | 11 | async/background 执行 |
| src/intercom/ | 2 | intercom 通信 |
| src/slash/ | 4 | slash 命令 |
| src/tui/ | 2 | TUI 渲染 |
| prompts/ | 6 | chain/parallel 模板 |

### 2.3 需删除文件

| 文件 | 删除原因 |
|------|----------|
| src/runs/foreground/chain-clarify.ts | TUI clarify |
| src/runs/foreground/chain-execution.ts | chain 执行 |
| src/runs/shared/parallel-utils.ts | parallel 工具 |
| src/runs/shared/model-fallback.ts | model 回退 |
| src/runs/shared/worktree.ts | worktree 支持 |
| src/shared/fork-context.ts | fork context |
| src/shared/artifacts.ts | artifact 管理 |
| src/shared/jsonl-writer.ts | JSONL 写入 |
| src/shared/model-info.ts | model info |
| src/shared/session-tokens.ts | session token |
| src/shared/status-format.ts | status 格式化 |
| src/agents/chain-serializer.ts | chain 序列化 |
| src/agents/agent-management.ts | agent 管理 |

### 2.4 视实现决定

| 文件 | 建议 |
|------|------|
| src/shared/utils.ts | 保留，裁剪到最小工具函数 |
| src/shared/formatters.ts | 保留，删除 TUI 相关格式化 |
| src/shared/post-exit-stdio-guard.ts | 保留 |
| src/shared/atomic-json.ts | 删除 |
| src/shared/file-coalescer.ts | 删除 |
| src/shared/session-identity.ts | 保留或删除 |
| src/agents/skills.ts | 删除 |

### 2.5 agents/ 目录 ✅ 已完成

已创建 5 个内置 agents:
- explorer.md (新增)
- researcher.md (重写，移除 intercom)
- reviewer.md (重写，移除 intercom)
- implementer.md (新增)
- tester.md (新增)

### 2.6 测试目录 ✅ 已清理

删除的测试文件：
- test/unit/: 25+ 个旧测试
- test/integration/: 13+ 个旧测试

保留的测试：
- test/mvp/unit/*.test.ts (MVP 新测试)
- test/mvp/integration/*.test.ts (MVP 集成测试)
- test/unit/: agent-disabled, agent-frontmatter, agent-overrides, agent-scope, agent-selection, foreground-tool-call-compaction, index-child-registration, path-handling, path-resolution, pi-args, pi-spawn, recursion-guard, schemas, subagent-prompt-runtime, temp-paths, tool-description, ts-loader 等

### 2.7 package.json ✅ 已更新

- description 已更新
- files 已移除 skills, prompts
- pi.skills 和 pi.prompts 已移除

| 文件 | 状态 |
|------|------|
| explorer.md | 🆕 需新增 |
| researcher.md | 🔄 改写 |
| reviewer.md | 🔄 改写 |
| implementer.md | 🆕 需新增 |
| tester.md | 🆕 需新增 |
| context-builder.md | ❌ 删除 |
| delegate.md | ❌ 删除 |
| oracle.md | ❌ 删除 |
| planner.md | ❌ 删除 |
| scout.md | ❌ 删除 |
| worker.md | ❌ 删除 |

---

## 三、测试目录处理

### 3.1 需删除的测试

**test/unit/**
- async-*.test.ts
- chain-*.test.ts
- intercom-*.test.ts
- model-fallback.test.ts
- parallel-utils.test.ts
- render-*.test.ts
- slash-*.test.ts
- worktree.test.ts
- status-format.test.ts
- session-tokens.test.ts
- ...等 40 个文件中的大部分

**test/integration/**
- async-*.test.ts
- chain-*.test.ts
- parallel-*.test.ts
- intercom-*.test.ts
- fork-context-*.test.ts
- render-*.test.ts
- slash-*.test.ts
- result-watcher.test.ts
- top-level-async.test.ts

### 3.2 保留的测试

| 测试 | 原因 |
|------|------|
| test/mvp/unit/*.test.ts | MVP 新测试 |
| test/mvp/integration/*.test.ts | MVP 集成测试 |

---

## 四、执行计划

### 步骤 1: 删除整个目录
```
src/runs/background/
src/intercom/
src/slash/
src/tui/
prompts/
```

### 步骤 2: 删除单个文件
```
src/runs/foreground/chain-clarify.ts
src/runs/foreground/chain-execution.ts
src/runs/shared/parallel-utils.ts
src/runs/shared/model-fallback.ts
src/runs/shared/worktree.ts
src/shared/fork-context.ts
src/shared/artifacts.ts
src/shared/jsonl-writer.ts
src/shared/model-info.ts
src/shared/session-tokens.ts
src/shared/status-format.ts
src/shared/atomic-json.ts
src/shared/file-coalescer.ts
src/agents/chain-serializer.ts
src/agents/agent-management.ts
src/agents/skills.ts
```

### 步骤 3: 删除旧 agents ✅ 已完成
```
agents/context-builder.md
agents/delegate.md
agents/oracle.md
agents/planner.md
agents/scout.md
agents/worker.md
```

### 步骤 4: 改写入口文件 🔄 进行中
```
src/extension/index.ts
src/extension/schemas.ts
```

### 步骤 5: 简化 types
```
src/shared/types.ts
```

### 步骤 6: 更新 package.json

### 步骤 7: 清理测试目录

---

## 五、验收标准

- [x] 无旧功能目录残留 (`src/runs/background/`, `src/intercom/`, `src/slash/`, `src/tui/`, `prompts/`)
- [x] 无旧功能文件残留
- [x] `src/extension/schemas.ts` 仅包含 `agent` 和 `task` 参数
- [x] `package.json` 元数据与 MVP 一致
- [x] agents/ 目录仅包含 5 个内置 agents
- [x] 所有 MVP 单元测试通过 (86 tests)
- [x] 所有 unit 测试通过 (27 tests)
