---
status: historical
audience: maintainer
last_verified: 2026-05-08
---

# pi-subagents 简化改造参考文档

本文档用于在克隆 [`nicobailon/pi-subagents`](https://github.com/nicobailon/pi-subagents) 后，指导将其简化改造成一个更轻量、更可维护、符合“简单 subagents”目标的版本。

## 目标定位

目标不是实现完整多代理框架，而是为 pi-mono 增加一个简单、真实、可控的 subagents 能力：

```text
1 个主代理
+ 5 个子代理
+ 主代理可以自主调用子代理
+ 默认安全
+ 不做重型编排
```

推荐项目定位：

```text
simple pi subagents
= 一个 pi 扩展包
+ 一个 subagent 工具
+ 五个内置子代理
+ foreground 单次执行
+ depth=1
```

## 总体判断

`nicobailon/pi-subagents` 已经实现了较成熟的 subagents 能力，包括 foreground/background、parallel、chain、artifacts、intercom、slash bridge、TUI 状态等。

它非常适合作为参考或基础，但对于当前目标来说功能偏重。建议采用“保留核心、删除高级编排”的方式简化，而不是从零实现。

核心原则：

> 保留“主代理通过工具启动一个子代理”的能力，删除所有“工具内部编排多个子代理、后台运行、复杂状态、复杂 UI、复杂通信”的能力。

## 建议保留的核心能力

### 1. `subagent` 工具注册

这是最核心能力。主代理通过 LLM 可调用工具调用子代理，例如：

```ts
subagent({
  agent: "explorer",
  task: "Find where authentication middleware is implemented"
})
```

pi-mono 没有原生 `agent` 注册和 `@agentName` 子会话语法，因此应通过 `pi.registerTool()` 暴露 subagent 能力。

### 2. Markdown agent 定义

保留 frontmatter + markdown prompt 格式，便于用户理解和自定义。

示例：

```md
---
name: explorer
description: Read-only codebase navigator.
readonly: true
tools:
  - read
  - grep
  - find
  - ls
---

You are the explorer subagent.

Your job:
- Find relevant files.
- Trace code paths.
- Summarize where logic lives.
- Do not modify files.
```

### 3. Foreground 单子代理执行

第一版只支持同步 foreground 执行：

```text
主代理调用 subagent
→ 启动一个子代理
→ 等待其完成
→ 返回结果给主代理
```

不做后台任务，不做并行，不做链式 workflow。

### 4. 递归保护

必须保留或重写递归保护。

建议：

```text
maxSubagentDepth = 1
```

即：

```text
主代理可以调用子代理
子代理不能再调用子代理
```

子代理 session 中不应注册 `subagent` 工具，或通过环境变量阻止再次调用。

### 5. 子代理边界提示

子代理需要明确知道：

- 自己是 child session
- 不是主代理
- 不能擅自扩大任务范围
- 不能声称自己能调度其他子代理
- 如果信息不足，应返回 uncertainty / needs clarification，而不是无限探索

### 6. 简单结果返回

保留最小结构化结果即可：

```json
{
  "schemaVersion": 1,
  "ok": true,
  "agent": "explorer",
  "summary": "Found auth middleware in src/server/auth.ts.",
  "result": "...",
  "files": ["src/server/auth.ts"],
  "warnings": []
}
```

错误结果：

```json
{
  "schemaVersion": 1,
  "ok": false,
  "agent": "explorer",
  "error": {
    "code": "SUBAGENT_FAILED",
    "message": "Subagent exited unsuccessfully."
  },
  "warnings": []
}
```

注意不要暴露：

- API key
- npm token
- Authorization header
- 环境变量值
- 完整 stack trace
- 绝对路径
- 完整系统 prompt

## 建议简化或删除的内容

### 1. 删除 async/background jobs

原项目支持后台任务、状态查询、结果 watcher、通知、恢复等。第一版建议全部删除或禁用。

可删除/暂缓：

```text
src/runs/background/
```

包括：

- async execution
- async job tracker
- result watcher
- notify
- stale reconciler
- async status
- async resume
- top-level async

理由：

- 状态管理复杂
- 进程生命周期复杂
- 用户心智成本高
- MVP 不需要后台子代理

第一版只支持：

```text
subagent({ agent, task })
```

### 2. 删除 chain execution

原项目支持链式流程，例如：

```text
planner → worker → reviewer
```

建议删除或暂缓：

```text
chain
chainDir
chain-execution
chain-serializer
chain-clarify
```

理由：

- 主代理本身就是 orchestrator
- 主代理可以多次顺序调用 `subagent`
- 工具内部不应再实现 workflow engine
- 避免“编排器里面还有编排器”

简化后由主代理自己决定：

```text
1. 调 explorer
2. 调 reviewer
3. 再决定是否修改
```

### 3. 删除 parallel execution

原项目支持并行 reviewers / parallel tasks。

建议删除或暂缓：

```text
tasks: [...]
concurrency
parallel groups
aggregateParallelOutputs
```

理由：

- 并发子进程复杂
- 输出聚合复杂
- 错误处理复杂
- 容易触发速率限制
- token 成本不可控

第一版如果需要多个视角，让主代理顺序调用多个子代理即可。

### 4. 删除 intercom

原项目支持 `pi-intercom`，让子代理运行中联系父会话。

建议删除或暂缓：

```text
src/intercom/
contact_supervisor
intercom bridge
detach/resume
```

理由：

- 属于高级协作能力
- 引入额外依赖和状态
- parent/child 边界会复杂化

第一版规则：

```text
子代理不能中途问主代理。
如果信息不足，子代理在结果中说明 blocked / needs_clarification。
```

### 5. 删除 worktree 支持

原项目有 worktree、fork context、diff/cleanup 等高级隔离能力。

第一版建议不支持独立 worktree。

推荐默认策略：

```text
只读子代理默认可用
写入子代理默认禁用写权限
```

即使保留 `implementer`，也可以让它先返回 patch plan，而不直接修改文件。

理由：

- worktree 创建和清理复杂
- diff 合并复杂
- 冲突处理复杂
- 用户难以判断是谁改了文件

### 6. 简化内置 agents

原项目内置较多 agent：

```text
scout
researcher
planner
worker
reviewer
context-builder
oracle
delegate
```

建议简化为 5 个：

```text
explorer
researcher
reviewer
implementer
tester
```

建议职责：

| Agent | 职责 | 默认权限 |
|---|---|---|
| `explorer` | 搜索代码、定位文件、梳理调用链 | readonly |
| `researcher` | 文档/API/外部资料研究 | readonly |
| `reviewer` | 架构、代码、方案审查 | readonly |
| `implementer` | 小范围实现或 patch plan | readonly by default |
| `tester` | 测试方案、补测试建议或测试实现 | readonly by default |

不建议第一版同时保留 `oracle` 和 `planner`，因为容易与 `reviewer` 和主代理职责重叠。

### 7. 简化 slash commands

原项目有较丰富 slash commands 和 prompt bridge。

第一版建议只保留极少命令：

```text
/subagents
```

可选保留：

```text
/subagents doctor
```

可删除或暂缓：

```text
/run
/subagents-doctor
prompt template bridge
slash live state
slash result rendering
```

主入口应该是 LLM tool，而不是用户手动 workflow 命令。

### 8. 简化 TUI 渲染

原项目有 widget、动画、进度 UI、自定义结果组件。

第一版建议删除或暂缓：

```text
src/tui/
renderWidget
animations
live progress
custom result components
```

使用普通文本或简单 JSON 风格结果即可。

理由：

- TUI API 维护成本高
- 文本结果已经足够
- 减少对 pi 内部 UI 细节绑定

### 9. 简化 artifact/session 管理

原项目保存较多运行产物：

- session file
- artifact dir
- output file
- metadata
- progress file
- async result file

第一版建议：

```text
只返回最终结果
可选保存最小 session/log
不做复杂 artifact tree
```

如果需要 session，可以只保留临时 session 或简单 session file 路径，不要建立完整 artifact 管理系统。

### 10. 简化 model override / fallback

原项目支持：

```text
agent[model=...]
fallbackModels
thinking
per-agent model override
```

第一版建议只支持：

```text
继承当前 pi 默认模型
```

后续再逐步加入：

```json
{
  "subagents": {
    "reviewer": {
      "model": "anthropic/claude-sonnet-4",
      "thinking": "high"
    }
  }
}
```

不建议第一版实现 fallback chain。

## 建议的最小 MVP 功能集

第一版只做：

```text
✅ registerTool("subagent")
✅ 支持 agent + task
✅ 5 个内置 agent
✅ markdown frontmatter
✅ foreground sync execution
✅ max depth = 1
✅ 默认 readonly
✅ 子代理不继承 subagent 工具
✅ 简单配置
✅ 简单错误清理
✅ 简单结果返回
```

明确不做：

```text
❌ async/background
❌ chain
❌ parallel
❌ intercom
❌ worktree
❌ TUI widget
❌ slash bridge
❌ complex artifact system
❌ multi-agent workflow engine
❌ fallback model chain
```

## 建议简化后的目录结构

```text
src/
├─ extension/
│  ├─ index.ts
│  ├─ register-tool.ts
│  └─ register-command.ts
├─ agents/
│  ├─ load-agents.ts
│  ├─ frontmatter.ts
│  └─ builtin.ts
├─ runtime/
│  ├─ run-subagent.ts
│  ├─ spawn-pi.ts
│  ├─ build-prompt.ts
│  ├─ collect-output.ts
│  └─ sanitize.ts
├─ config/
│  └─ load-config.ts
└─ shared/
   ├─ types.ts
   └─ paths.ts

agents/
├─ explorer.md
├─ researcher.md
├─ reviewer.md
├─ implementer.md
└─ tester.md
```

## 子代理权限建议

默认配置建议：

```json
{
  "enabled": true,
  "maxSubagentDepth": 1,
  "timeoutMs": 120000,
  "allowWriteSubagents": false,
  "subagents": {
    "explorer": { "enabled": true, "readonly": true },
    "researcher": { "enabled": true, "readonly": true },
    "reviewer": { "enabled": true, "readonly": true },
    "implementer": { "enabled": true, "readonly": true },
    "tester": { "enabled": true, "readonly": true }
  }
}
```

后续可以允许：

```json
{
  "allowWriteSubagents": true,
  "subagents": {
    "implementer": { "readonly": false },
    "tester": { "readonly": false }
  }
}
```

但第一版建议所有子代理默认 readonly。

## 主代理提示注入建议

可以给主代理注入简短说明：

```text
You can delegate focused work to specialist subagents using the subagent tool.

Available subagents:
- explorer: read-only codebase navigation and code search
- researcher: documentation and external API research
- reviewer: architecture, code, and plan review
- implementer: bounded implementation planning or small changes when enabled
- tester: test planning and test-related work

Use subagents when a focused second pass would help.
Do not use subagents for trivial tasks.
Do not call multiple subagents unnecessarily.
Always integrate subagent results into your final answer.
```

## 子代理边界提示建议

每个子代理 prompt 都应包含：

```text
You are a child subagent, not the parent orchestrator.
You must focus only on the delegated task.
Do not call or propose additional subagents.
Do not expand scope.
If the task is unclear or blocked, report the uncertainty clearly.
Return concise findings and actionable next steps.
```

## 实施顺序建议

### Phase 1：裁剪核心路径

- 保留 extension entry
- 保留 `subagent` tool
- 保留 agent discovery/loading
- 保留 single foreground execution
- 删除 async/chain/parallel/intercom/worktree/TUI widget

### Phase 2：固定 5 个 agents

- 替换或裁剪内置 agents
- 明确 readonly frontmatter
- 删除职责重叠的 agent

### Phase 3：简化配置与输出

- 简化 settings schema
- 固定 `maxSubagentDepth = 1`
- 简化 result schema
- 做错误信息 sanitize

### Phase 4：验证

至少验证：

- 主代理能看到 `subagent` 工具
- 可以调用 `explorer`
- 子代理不能再调用子代理
- 不暴露绝对路径和敏感信息
- unknown agent 有清晰错误
- 子代理失败时返回稳定 JSON/text

## 最终目标

改造后的项目应保持这样的用户体验：

```text
用户：Use explorer to find where auth is implemented.
主代理：调用 subagent({ agent: "explorer", task: "..." })
子代理：独立执行只读搜索
主代理：整合结果并回复用户
```

而不是：

```text
用户配置复杂 workflow
后台跑多个 agent
agent 之间互相通信
TUI 显示复杂状态
worktree 自动合并
```

一句话总结：

> 做一个“主代理可调用的轻量子代理工具”，而不是一个“完整多代理编排平台”。
