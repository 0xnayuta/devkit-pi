---
status: historical
audience: maintainer
last_verified: 2026-05-08
---

# 简化改造实施计划

> Status: historical
>
> 本文档记录简化改造过程与验收历史，不再作为当前代码结构的 source of truth。当前架构请以 `docs/guides/architecture.md`、`src/runtime/`、`src/extension/` 和 `src/agents/` 为准。

本文档基于简化改造期间的代码阅读结果修订，作为 `pi-subagents` 简化改造的执行记录。

## 改造前代码事实

改造前项目不是一个简单工具，而是一个完整度较高的多代理编排扩展。主要事实:

- 扩展入口在 `src/extension/index.ts`,目前同时注册:
  - `subagent` tool
  - async result watcher
  - async job tracker
  - slash bridge
  - prompt template bridge
  - TUI renderers
  - notify renderer
  - control notice renderer
- tool schema 在 `src/extension/schemas.ts`,当前支持大量参数:`action`、`tasks`、`chain`、`concurrency`、`worktree`、`async`、`model`、`fallback` 相关控制、`clarify`、`share`、`sessionDir`、`output` 等。
- 主执行器在 `src/runs/foreground/subagent-executor.ts`,当前混合处理:
  - management action
  - foreground single
  - foreground parallel
  - foreground chain
  - async/background
  - resume/interrupt/status
  - intercom
  - worktree
  - fork context
  - clarify TUI
- 真正启动 child pi 的核心逻辑在 `src/runs/foreground/execution.ts`。
- pi 参数构造在 `src/runs/shared/pi-args.ts`。
- pi 命令解析在 `src/runs/shared/pi-spawn.ts`。
- 子代理 prompt runtime 在 `src/runs/shared/subagent-prompt-runtime.ts`,已经有可复用的 child boundary 和父消息过滤逻辑。
- agent discovery 在 `src/agents/agents.ts`,当前包含 builtins、user agents、project agents、chains、settings overrides、management 等能力。
- frontmatter 解析器 `src/agents/frontmatter.ts` 不是完整 YAML 解析器,只支持简单 `key: value`。因此当前 markdown 示例中的列表应使用逗号形式,例如 `tools: read, grep, find, ls`,除非先重写 parser。

## 总目标

最终形态:

```text
simple pi subagents
= 一个 pi 扩展包
+ 一个 subagent 工具
+ 五个内置子代理
+ foreground 单次执行
+ maxSubagentDepth = 1
+ 默认 readonly
```

核心原则:

- 主代理是唯一 orchestrator。
- `subagent` 工具每次只启动一个子代理。
- 子代理不能再调用子代理。
- 第一版不支持 background、parallel、chain、intercom、worktree、TUI widget、slash bridge、复杂 artifact/session 管理。

---

## Phase 0:建立基线与裁剪清单 ✅ 已完成

### 目标

在改代码前确认所有旧能力入口,避免只删文件但仍有 import、schema、README 或测试残留。

### 已完成

- [x] 删除目录:`src/runs/background/`, `src/intercom/`, `src/slash/`, `src/tui/`, `prompts/`, `skills/`
- [x] 删除旧文件:chain-clarify.ts, chain-execution.ts, parallel-utils.ts, model-fallback.ts, worktree.ts 等
- [x] 重写 schemas.ts:仅保留 `agent` 和 `task` 参数
- [x] 创建 5 个内置 agents:explorer, researcher, reviewer, implementer, tester
- [x] 更新 package.json
- [x] 清理旧测试,创建 MVP 测试
- [x] 验证清理结果:`rg "chain|parallel|background|intercom|worktree|slash|tui" src` 仅 3 个文件含误报(注释/环境变量)

### 验收标准 ✅

- [x] 明确每个旧模块的去留
- [x] 先提交文档/计划,不混入代码大改
- [x] MVP 测试全部通过 (86 unit + 27 test)

---

## Phase 1:重建最小类型、配置与结果模型 ✅ 已完成

### 目标

先替换复杂类型,否则后续代码会被旧 `Details`、`SingleResult`、`AsyncStatus`、`ControlEvent` 等类型拖住。

### 已完成

- [x] 重写 `src/shared/types.ts`,只保留 MVP 类型
- [x] 新增 `src/config/load-config.ts` 配置加载
- [x] 固定默认值:`enabled: true`, `maxSubagentDepth: 1`, `timeoutMs: 120000`, `allowWriteSubagents: false`
- [x] 删除旧类型概念:async job/status, progress watcher, chain/parallel mode, intercom payload, control events, worktree/fork context, artifact tree, model fallback
- [x] 创建配置加载测试 (18 tests)

### 验收标准 ✅

- [x] `src/shared/types.ts` 中不再出现 `AsyncStatus`、`SubagentRunMode`、`Intercom`、`Worktree` 等 MVP 外类型
- [x] 配置加载单测覆盖:默认配置、非法 JSON、局部覆盖、disabled agent

---

## Phase 2:重建 agent 定义与加载 ✅ 已完成

### 目标

将内置 agents 收敛为 5 个 markdown 文件,并让加载逻辑简单可测。

### 已完成

- [x] 删除旧内置 agents:context-builder, delegate, oracle, planner, scout, worker
- [x] 保留并改写:researcher.md, reviewer.md
- [x] 新增:explorer.md, implementer.md, tester.md
- [x] 所有 agent 都包含 `readonly: true`
- [x] 重写 `src/agents/agents.ts`:简化为 MVP agent 发现
- [x] 添加 MVP_ERROR_CODES 类型和常量
- [x] 更新 executor 返回结构化错误码

### 验收标准 ✅

- [x] `discoverAgents` 只返回有效的 agents
- [x] 内置 agents 只有 5 个:explorer, researcher, reviewer, implementer, tester
- [x] unknown agent 返回 `UNKNOWN_AGENT` 错误码
- [x] frontmatter 测试覆盖逗号工具列表与 readonly

---

## Phase 3:重写扩展入口与最小 `subagent` schema ✅ 已完成

### 目标

把 `src/extension/index.ts` 从大型 orchestrator 入口重写为最小 tool 注册入口。

### 已完成

- [x] 重写 `src/extension/schemas.ts`:只保留 `agent` 和 `task` 参数
- [x] 重写 `src/extension/index.ts`:最小 tool 注册入口
  - 保留默认导出 `registerSubagentExtension(pi)`
  - 如果 `PI_SUBAGENT_CHILD === "1"`,直接 return,防止子代理注册 `subagent`
  - 加载 config
  - 注册一个 tool:`subagent`
  - 不注册 message renderer
  - 不注册 slash command
  - 不注册 async watcher
  - 不注册 TUI widget
- [x] 创建扩展注册测试 (22 tests)

### 验收标准 ✅

- [x] `rg "registerSlash|registerMessageRenderer|ResultWatcher|AsyncJob|renderWidget" src/extension` 无命中
- [x] `SubagentParams` 不包含 `action`、`tasks`、`chain`、`async`、`worktree`、`model`
- [x] 子进程因 `PI_SUBAGENT_CHILD=1` 不注册该扩展

---

## Phase 4:实现 foreground single runtime ✅ 已完成

### 目标

保留"启动一个 child pi,等待完成,收集最终输出"的核心路径,但删除并行、链式、异步、intercom、artifact、fallback model 等分支。

### 已完成

- [x] `src/runs/foreground/execution.ts` - runSync 实现
- [x] `src/runs/foreground/subagent-executor.ts` - 完整执行器
- [x] `src/runs/foreground/sanitize.ts` - 敏感信息清理
- [x] `src/runs/foreground/collect-output.ts` - 输出收集
- [x] Timeout 实现:`AbortController + setTimeout(config.timeoutMs)`
- [x] 删除所有旧分支:runParallelPath, runChainPath, runAsyncPath 等

### 最小运行流程 ✅

```text
validate input
→ load config
→ check enabled/depth
→ load selected agent
→ build child prompt
→ spawn pi --mode json -p
→ collect JSON stdout messages
→ extract final assistant text
→ sanitize
→ return SubagentResult
```

### 验收标准 ✅

- [x] `subagent({ agent: "explorer", task: "..." })` 可以完成一次 foreground 调用
- [x] timeout 会终止 child pi
- [x] child 失败不会抛未处理异常,而是返回错误码
- [x] 执行路径中没有 chain/parallel/background 分支

---

## Phase 5：递归保护、readonly 与 sanitize ✅ 已完成

### 目标

保证默认安全，尤其是防止递归和敏感信息泄漏。

### 已完成

- [x] 递归保护：`PI_SUBAGENT_CHILD`, `PI_SUBAGENT_DEPTH`, `PI_SUBAGENT_MAX_DEPTH`
- [x] `checkSubagentDepth()` 实现
- [x] `maxSubagentDepth = 1` 默认值
- [x] Readonly agents 默认 `readonly: true`
- [x] 写工具过滤：`allowWriteSubagents: false` 时过滤 edit/write
- [x] `sanitizeOutput()` 实现，清理 API keys, tokens, stack traces
- [x] 8 个稳定错误码定义

### 验收标准 ✅

- [x] 子代理中不能看到 `subagent` 工具
- [x] depth 超限返回 `SUBAGENT_DEPTH_EXCEEDED`
- [x] 模拟 token/header/stack trace 会被清理
- [x] readonly agent 不会获得 `edit`、`write` 等写工具

---

## Phase 6:删除高级模块并修复包元数据 ✅ 已完成

### 目标

不是"隐藏"高级功能,而是移除维护面。

### 已完成

- [x] 删除目录: src/runs/background/, src/intercom/, src/slash/, src/tui/, prompts/, skills/
- [x] 删除文件: chain-clarify.ts, chain-execution.ts, parallel-utils.ts, model-fallback.ts, worktree.ts, fork-context.ts, artifacts.ts, jsonl-writer.ts, model-info.ts, session-tokens.ts, status-format.ts, chain-serializer.ts, agent-management.ts, run-history.ts, single-output.ts
- [x] 更新 package.json: 描述、files、pi 配置与 MVP 一致
- [x] 清理 subagent-prompt-runtime.ts 中的 intercom 残留代码
- [x] 更新旧测试以移除 intercom/slash 相关测试

### 验收标准 ✅

- [x] `rg "chain|parallel|background|intercom|worktree|slash|tui" src` 仅剩误报 (getuid 包含 uid)
- [x] `pnpm test:unit` 与 `pnpm test:mvp` 使用新测试集通过
- [x] package 描述、files、pi 配置与 MVP 一致

---

## Phase 7:测试重组 ✅ 已完成

### 目标

删除旧平台能力测试,建立 MVP 测试矩阵。

### 已完成

- [x] 删除旧集成测试: async-*, chain-*, parallel-*, intercom-*, fork-context-*, render-*, slash-*, result-watcher, top-level-async, doctor-executor, template-resolution
- [x] 删除旧单元测试: async-*, chain-*, intercom-*, model-fallback, parallel-utils, render-*, slash-*, worktree, status-format, session-tokens, schemas
- [x] 创建 MVP 测试目录 test/mvp/unit/ 包含 158 个测试
- [x] 保留核心单元测试: package-manifest, path-handling, pi-spawn, subagent-prompt-runtime
- [x] 更新 post-exit-stdio-guard.ts 添加默认参数
- [x] 更新 package.json 测试脚本

### MVP 测试覆盖

- builtin-agents.test.ts - 内置 agents 发现
- frontmatter.test.ts - frontmatter 解析
- config-loading.test.ts - 配置加载
- error-codes.test.ts - 错误码定义
- readonly-scope.test.ts - 只读范围
- extension-registration.test.ts - 扩展注册
- runtime-execution.test.ts - 运行时执行
- tool-registration.test.ts - 工具注册

### 验收标准 ✅

- [x] `pnpm test:unit` 通过
- [x] `pnpm test:mvp` 通过
- [x] 测试不再依赖 TUI、slash、async watcher、intercom、worktree

---

## Phase 8:README、参考文档与安装器更新 ✅ 已完成

### 目标

让用户看到的能力与代码一致。

### 已完成

- [x] README.md - 更新为轻量定位，明确不支持的功能
- [x] 已删除 install.mjs（独立安装脚本），用户通过 `pi install` 安装
- [x] docs/reference/configuration.md - 更新为 MVP 配置字段
- [x] docs/reference/result-schema.md - 更新为 MVP 结果 Schema
- [x] docs/reference/subagent-tool.md - 验证正确
- [x] docs/reference/agent-definition.md - 验证正确

### 验收标准 ✅

- [x] README 示例只有 `subagent({ agent: "explorer", task: "..." })`
- [x] 文档明确第一版不支持:background、chain、parallel、intercom、worktree、slash workflow、TUI widget

---

## Phase 9:最终验证与发布准备 ✅ 已完成

### 功能验证 ✅

- [x] 主代理能看到 `subagent` 工具
- [x] tool schema 只接受 `agent` 和 `task`
- [x] 5 个内置 agents 都能加载 (15 tests)
- [x] unknown agent 返回 `UNKNOWN_AGENT`
- [x] timeout 返回 `SUBAGENT_TIMEOUT`
- [x] disabled config 生效

### 边界验证 ✅

- [x] 子代理 session 不注册 `subagent` 工具 (PI_SUBAGENT_CHILD 检查)
- [x] 子代理 prompt 包含 child boundary
- [x] 不存在可执行的 chain 路径
- [x] 不存在可执行的 parallel 路径
- [x] 不存在可执行的 background 路径
- [x] 不存在 intercom/worktree/slash/TUI 入口

### 安全验证 ✅

- [x] 默认 readonly (所有 5 个内置 agents)
- [x] readonly agent 不包含 `edit`/`write` 工具
- [x] token/header 被 sanitize
- [x] stack trace 被压缩 (max 5 lines)
- [x] 绝对路径不直接暴露 (HOME/USERPROFILE 清理)

### 维护验证 ✅

- [x] `pnpm test:unit` 与 `pnpm test:mvp` 通过
- [x] `package.json` 元数据准确
- [x] docs 与代码一致
- [x] `rg` 检查无旧功能入口残留

---

## 推荐提交顺序

1. `docs: audit current code and update simplification plan`
2. `refactor: replace shared types and config with mvp model`
3. `refactor: replace builtin agents with five readonly agents`
4. `feat: register minimal subagent tool`
5. `feat: add foreground single subagent runtime`
6. `feat: add depth guard readonly tools and sanitizer`
7. `refactor: remove orchestration modules`
8. `test: replace legacy tests with mvp tests`
9. `docs: update readme and references for simple subagents`
10. `chore: update package metadata and installer text`

---

## 非目标清单

MVP 中不要实现:

- agent management actions(create/update/delete)
- `/subagents` 命令(包括所有 slash bridge、slash live state、TUI 渲染)
- `bash` 工具在 readonly agents 中
- `skills` 目录 / skills 注入
- `implementer` / `tester` 写文件能力
- background jobs
- async status/resume/interrupt
- chain workflow
- parallel tasks
- intercom/contact_supervisor
- worktree/fork context
- artifact tree
- complex session/artifact 管理(metadata、progress file、watcher、cleanup manager)
- per-agent model override
- fallback model chain
- TUI clarification UI
- output file workflow

未来如果恢复任何能力,必须新增 ADR,并说明为什么它值得增加维护成本。
