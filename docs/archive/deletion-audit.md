---
status: historical
audience: maintainer
last_verified: 2026-05-08
---

# 删除清单审计

> Status: historical
>
> 本文档记录简化改造期间的删除审计，不再作为当前代码结构的 source of truth。当前架构请以 `docs/guides/architecture.md` 和 `src/` 为准。

本文档基于对项目全部源码和导入关系的审计，列出了需要删除的目录/文件，并逐一确认其属于旧高级能力。

> **状态**: ✅ 已完成 - Phase 0 完成

## 一、删除整个目录（6 个目录，27 个文件） ✅ 已删除

### 1. `src/runs/background/` — async/background 执行 ✅ 已删除

### 2. `src/intercom/` — 子代理与主代理通信 ✅ 已删除

### 3. `src/slash/` — slash 命令 ✅ 已删除

### 4. `src/tui/` — TUI 渲染 ✅ 已删除

### 5. `prompts/` — chain/parallel prompt 模板 ✅ 已删除

### 6. `skills/` — 编排 skill ✅ 已删除

---

## 二、删除内置 agents（旧 agents，替换为 5 个新 agents） ✅ 已完成

| 文件 | 所属能力 | 确认删除理由 |
|---|---|---|
| `agents/context-builder.md` | chain 专用 agent | MVP 不支持 chain；职责与 `researcher` 重叠 |
| `agents/delegate.md` | 委托 agent | MVP 不支持 delegation；职责由主代理承担 |
| `agents/oracle.md` | 问答 agent | MVP 不支持 chain；职责与 `reviewer` 重叠 |
| `agents/planner.md` | 规划 agent | MVP 不支持 chain；职责由主代理承担 |
| `agents/scout.md` | 侦察 agent | 替换为 `explorer.md` |
| `agents/worker.md` | 执行 agent | 替换为 `implementer.md` |

保留并改写：

| 文件 | 操作 |
|---|---|
| `agents/researcher.md` | 改写：移除 intercom/supervisor 协调指令，改为 readonly |
| `agents/reviewer.md` | 改写：移除 intercom/supervisor 协调指令、write/edit 工具 |

新增：

| 文件 | 说明 |
|---|---|
| `agents/explorer.md` | 只读代码导航，替换 scout |
| `agents/implementer.md` | 只读实现规划，替换 worker |
| `agents/tester.md` | 只读测试规划，新增 |

---

## 三、删除单个源码文件（仅被旧模块引用）

| 文件 | 被谁引用 | 确认删除理由 |
|---|---|---|
| `src/shared/artifacts.ts` | index.ts, schemas.ts, execution.ts, subagent-executor.ts, intercom, background, tui | 全部引用模块被重写或删除。MVP 不做 artifact tree |
| `src/shared/atomic-json.ts` | stale-run-reconciler, subagent-runner | 仅 background 使用 |
| `src/shared/file-coalescer.ts` | result-watcher | 仅 async watcher 使用 |
| `src/shared/fork-context.ts` | subagent-executor.ts | executor 重写后不再需要 fork context |
| `src/shared/model-info.ts` | chain-clarify, chain-execution, subagent-executor, model-fallback | 全部被重写或删除 |
| `src/shared/session-identity.ts` | index.ts, subagent-executor.ts | 两者均重写 |
| `src/shared/session-tokens.ts` | subagent-runner | 仅 background 使用 |
| `src/shared/status-format.ts` | async-status, run-status, tui | 仅 background/TUI 使用 |
| `src/shared/formatters.ts` | index.ts, background, chain, utils.ts, tui | index.ts 重写；utils.ts 只用 `formatToolCall`，可内联或删除 |
| `src/agents/agent-management.ts` | subagent-executor.ts | MVP 不支持 agent management actions |
| `src/agents/agent-scope.ts` | subagent-executor.ts | executor 重写后不需要 |
| `src/agents/agent-selection.ts` | agents.ts | agents.ts 重写后不需要 |
| `src/agents/agent-serializer.ts` | agent-management, agents.ts | 两者均重写/删除 |
| `src/agents/chain-serializer.ts` | agent-management, agents.ts | MVP 不支持 chains |
| `src/agents/identity.ts` | agent-serializer, agents.ts, chain-serializer, index.ts, subagent-executor.ts, session-identity | 重写 agents 加载后不需要 packaged agents |
| `src/agents/skills.ts` | 大量文件 | MVP 不支持 skills 注入 |
| `src/runs/foreground/chain-clarify.ts` | chain-execution, subagent-executor | MVP 不支持 chain/clarify |
| `src/runs/foreground/chain-execution.ts` | subagent-executor | MVP 不支持 chain |
| `src/runs/shared/completion-guard.ts` | background, execution | MVP 不需要实现任务完成守卫（用于检测无 mutation 的实现任务） |
| `src/runs/shared/long-running-guard.ts` | background, execution, completion-guard | MVP 不需要长时间运行守卫 |
| `src/runs/shared/model-fallback.ts` | background, chain, execution, subagent-executor | MVP 不支持 model fallback |
| `src/runs/shared/parallel-utils.ts` | background, subagent-executor, settings.ts, utils.ts | MVP 不支持 parallel |
| `src/runs/shared/run-history.ts` | chain-execution, subagent-executor | MVP 不需要 run history |
| `src/runs/shared/single-output.ts` | background, chain, execution, subagent-executor | MVP 不支持 output file workflow |
| `src/runs/shared/subagent-control.ts` | control-notices, background, execution, subagent-executor, subagent-prompt-runtime | MVP 不需要 control attention 系统 |
| `src/runs/shared/worktree.ts` | index.ts, schemas.ts, background, chain, subagent-executor, parallel-utils, settings.ts, types.ts, slash | MVP 不支持 worktree |
| `src/extension/control-notices.ts` | index.ts, subagent-executor | MVP 不需要 control notices |
| `src/extension/doctor.ts` | index.ts, subagent-executor | MVP 不需要 doctor action |

---

## 四、需要重写的文件（不删除，但需要大幅裁剪）

| 文件 | 当前状态 | 改写方向 |
|---|---|---|
| `src/extension/index.ts` | 大型入口，注册 TUI/slash/async/watcher/notify | 重写为最小 tool 注册入口 |
| `src/extension/schemas.ts` | TypeBox schema 支持大量参数 | 重写为只接受 `agent` 和 `task` |
| `src/runs/foreground/execution.ts` | 混合了 progress/model fallback/artifact/cleanup | 裁剪保留 `runSync` 核心路径 |
| `src/runs/foreground/subagent-executor.ts` | 混合了 management/parallel/chain/async/intercom/worktree | 重写为最小 foreground single executor |
| `src/agents/agents.ts` | 包含 builtins/user/project/chain/management/overrides | 裁剪为只保留 agent 加载 |
| `src/shared/types.ts` | 包含 async/chain/parallel/intercom/worktree/control 类型 | 重写为 MVP 类型 |
| `src/shared/settings.ts` | 包含 chain/parallel 行为解析 | 裁剪为只保留 config 加载 |
| `src/shared/utils.ts` | 包含 async status/parallel/utils | 裁剪为只保留 `getFinalOutput`、`extractTextFromContent` 等核心工具 |

---

## 五、需要保留的文件（核心到 MVP）

| 文件 | 理由 |
|---|---|
| `src/runs/shared/pi-args.ts` | 构造 pi CLI 参数，spawn child pi 的核心 |
| `src/runs/shared/pi-spawn.ts` | 解析 pi CLI 命令，Windows 兼容 |
| `src/runs/shared/subagent-prompt-runtime.ts` | child boundary 注入、父消息过滤 |
| `src/shared/post-exit-stdio-guard.ts` | 子进程退出保护 |
| `src/agents/frontmatter.ts` | agent frontmatter 解析 |
| `src/shared/jsonl-writer.ts` | session JSONL 写入（如需保留最小 session file） |

---

## 六、需要删除的测试文件

### 删除整个测试文件

| 文件 | 所属能力 |
|---|---|
| `test/integration/async-execution.test.ts` | async/background |
| `test/integration/async-job-tracker.test.ts` | async job tracker |
| `test/integration/async-status.test.ts` | async status |
| `test/integration/chain-clarify.test.ts` | chain clarify |
| `test/integration/chain-execution.test.ts` | chain execution |
| `test/integration/fork-context-execution.test.ts` | fork context |
| `test/integration/intercom-result-delivery.test.ts` | intercom |
| `test/integration/parallel-execution.test.ts` | parallel |
| `test/integration/render-fork-badge.test.ts` | TUI render |
| `test/integration/render-widget.test.ts` | TUI widget |
| `test/integration/result-watcher.test.ts` | async result watcher |
| `test/integration/session-tokens.test.ts` | session tokens |
| `test/integration/slash-commands.test.ts` | slash commands |
| `test/integration/slash-live-state.test.ts` | slash live state |
| `test/integration/template-resolution.test.ts` | prompt template |
| `test/integration/top-level-async.test.ts` | top-level async |
| `test/unit/agent-management.test.ts` | agent management |
| `test/unit/agent-overrides.test.ts` | agent overrides |
| `test/unit/agent-scope.test.ts` | agent scope |
| `test/unit/agent-selection.test.ts` | agent selection |
| `test/unit/async-resume.test.ts` | async resume |
| `test/unit/chain-serializer.test.ts` | chain serializer |
| `test/unit/close-grace-timer.test.ts` | 进程退出保护定时器 |
| `test/unit/completion-dedupe.test.ts` | async 完成去重 |
| `test/unit/completion-guard.test.ts` | completion guard |
| `test/unit/control-notices.test.ts` | control notices |
| `test/unit/doctor.test.ts` | doctor action |
| `test/unit/file-coalescer.test.ts` | file coalescer |
| `test/unit/foreground-tool-call-compaction.test.ts` | tool call compaction（TUI 相关） |
| `test/unit/fork-context.test.ts` | fork context |
| `test/unit/index-child-registration.test.ts` | child registration（依赖旧入口） |
| `test/unit/intercom-bridge.test.ts` | intercom bridge |
| `test/unit/jsonl-writer.test.ts` | jsonl writer（可保留或删除，取决于是否保留 session） |
| `test/unit/model-fallback.test.ts` | model fallback |
| `test/unit/model-info.test.ts` | model info |
| `test/unit/notify.test.ts` | notify |
| `test/unit/package-manifest.test.ts` | package manifest（验证 npm 包内容，不再需要） |
| `test/unit/parallel-utils.test.ts` | parallel utils |
| `test/unit/path-handling.test.ts` | path handling（测试 parallel/chain 路径） |
| `test/unit/path-resolution.test.ts` | path resolution（测试 skills/agents 路径） |
| `test/unit/prompt-template-bridge.test.ts` | prompt template bridge |
| `test/unit/render-helpers.test.ts` | TUI render helpers |
| `test/unit/result-intercom.test.ts` | result intercom |
| `test/unit/run-status.test.ts` | async run status |
| `test/unit/schemas.test.ts` | schemas（旧 schema 测试） |
| `test/unit/single-output.test.ts` | single output |
| `test/unit/skills-fallback.test.ts` | skills fallback |
| `test/unit/stale-run-reconciler.test.ts` | stale run reconciler |
| `test/unit/status-format.test.ts` | status format |
| `test/unit/subagent-control.test.ts` | subagent control |
| `test/unit/tool-description.test.ts` | tool description（依赖旧 description） |
| `test/unit/ts-loader.test.ts` | ts-loader（独立工具，可保留或删除） |
| `test/unit/types-fork-preamble.test.ts` | fork preamble |
| `test/unit/worktree.test.ts` | worktree |

### 保留的测试文件

| 文件 | 理由 |
|---|---|
| `test/unit/agent-disabled.test.ts` | agent disable 功能（可改写） |
| `test/unit/agent-frontmatter.test.ts` | frontmatter 解析（核心） |
| `test/unit/pi-args.test.ts` | pi args 构造（核心） |
| `test/unit/pi-spawn.test.ts` | pi spawn 命令（核心） |
| `test/unit/recursion-guard.test.ts` | 递归保护（核心） |
| `test/unit/subagent-prompt-runtime.test.ts` | prompt runtime（核心） |
| `test/unit/temp-paths.test.ts` | temp paths（可保留或删除） |
| `test/integration/detect-error.test.ts` | 错误检测（可改写） |
| `test/integration/error-handling.test.ts` | 错误处理（可改写） |
| `test/integration/foreground-result-size.test.ts` | 结果大小限制（可改写） |
| `test/integration/single-execution.test.ts` | 单次执行（核心，需大幅改写） |
| `test/integration/doctor-executor.test.ts` | doctor（可删除） |
| `test/support/helpers.ts` | 测试辅助（保留并简化） |
| `test/support/mock-pi.ts` | mock pi（保留） |
| `test/support/mock-pi-script.mjs` | mock pi script（保留） |
| `test/support/register-loader.mjs` | ts loader（保留） |
| `test/support/ts-loader.mjs` | ts loader（保留） |

---

## 七、需要更新的 package 配置

### `package.json`

需要移除：

```json
"files": [
  "prompts/**/*",    // 删除
  "skills/**/*"      // 删除
],
"pi": {
  "prompts": [       // 删除
    "./prompts"
  ],
  "skills": [        // 删除
    "./skills"
  ]
}
```

### `README.md`

需要重写：移除所有 chain、parallel、async、TUI、intercom、slash 的描述。

### `CHANGELOG.md`

保留历史，不删除。

---

## 八、统计

| 类别 | 数量 |
|---|---|
| 删除整个目录 | 6 个目录，27 个文件 |
| 删除旧内置 agents | 6 个文件 |
| 删除单个源码文件 | 27 个文件 |
| 需要重写的文件 | 8 个文件 |
| 保留的核心文件 | 6 个文件 |
| 删除的测试文件 | 48 个文件 |
| 保留的测试文件 | 17 个文件（大部分需改写） |
