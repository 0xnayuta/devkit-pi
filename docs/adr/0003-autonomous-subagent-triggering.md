---
status: accepted
audience: maintainer
last_verified: 2026-05-10
---

# ADR 0003：自主触发子代理的改进方案

## 状态

Accepted（2026-05-10 实施完成）

## 背景

当前设计中，主代理是否使用 `subagent` 完全取决于模型的自由判断，没有任何机制引导其行为。实际使用中，主代理倾向于自己直接用 `read`、`bash` 等工具完成任务，而非委托给更专业的子代理。

根本原因：

| 当前状态 | 问题 |
|----------|------|
| 工具 description 只描述"做什么" | 没有说"什么时候该用" |
| `before_agent_start` 只处理子代理的 prompt | 没有向主代理注入委托策略 |
| 完全靠模型自觉 | 模型倾向于自己直接做 |

## 方案

### 方案 A：语义意图描述 + Few-shot 示例驱动

在主代理的 system prompt 中注入**语言无关的语义意图描述**和**多语言对话示例**，引导模型在合适场景下委托子代理。

#### A.1 语义意图描述

不依赖关键词匹配，而是用语义描述定义何时委托：

```
## Subagent Delegation Policy

When the user's request matches a subagent's specialty, prefer delegating:

- **explorer**: Locating, navigating, or searching code/files in the codebase
- **researcher**: Investigating external resources, comparing technologies, synthesizing information
- **reviewer**: Evaluating code quality, checking for issues, analyzing architecture
- **implementer**: Planning implementation, designing solutions, architecting features
- **tester**: Designing test strategies, identifying edge cases, planning coverage

Delegate when the task is focused and benefits from specialized tools.
Handle directly when the task is simple, requires immediate action, or is too small to benefit from delegation.
```

**语言无关性**：语义描述天然支持多语言——模型能将任何语言的用户输入映射到语义概念，无需为每种语言维护关键词列表。

#### A.2 Few-shot 示例

在 system prompt 中提供具体的对话示例，展示委托行为：

```
## Delegation Examples

User: "Find where authentication is implemented"
→ Delegate to explorer

User: "帮我找一下认证模块在哪里"
→ Delegate to explorer

User: "Compare React and Vue for this project"
→ Delegate to researcher

User: "审查这段代码的安全性"
→ Delegate to reviewer

User: "How should I implement the payment flow?"
→ Delegate to implementer

User: "规划一下这个功能的测试方案"
→ Delegate to tester
```

**优势**：
- LLM 从示例学习比从规则列表更有效
- 自然展示多语言场景（中英各 1-2 个示例）
- 能展示复杂场景（不仅仅是单句触发）

- **优点**：
  - 语义描述对 LLM 来说比关键词列表更易理解
  - 天然语言无关，不需要为每种语言维护关键词
  - 示例驱动，模型学习效果更好
  - 通过 `before_agent_start` 注入 system prompt，权重高
  - 可做成可配置项，用户可选择启用/禁用
- **缺点**：
  - 需要修改配置类型和 runtime 逻辑
  - 示例消耗额外 token
  - 可能与用户自定义 system prompt 冲突（通过配置项缓解）

## 决策

采用**方案 A（语义意图 + Few-shot 示例）**：

| 层次 | 内容 | 作用 |
|------|------|------|
| System Prompt | 语义意图描述 | 告诉模型"什么情况该委托" |
| System Prompt | 2-3 个多语言示例 | 展示具体怎么委托 |
| Tool Description | 保持现状 | 告诉模型"工具能做什么" |

## 影响

### 文件变更（已实施 ✅）

| 文件 | 变更 | 状态 |
|------|------|------|
| `src/shared/delegation-policy.ts` | **新增**：`DELEGATION_POLICY` 和 `DELEGATION_EXAMPLES` 常量 | ✅ Done |
| `src/shared/types.ts` | `ExtensionConfig` 新增 `injectDelegationPolicy?: boolean` | ✅ Done |
| `src/config/load-config.ts` | `DEFAULT_CONFIG` 默认 `true`，`mergeConfig` 支持新字段 | ✅ Done |
| `src/extension/index.ts` | 新增 `before_agent_start` handler，注入委托策略到主代理 system prompt | ✅ Done |

### 实现细节

#### 1. 配置项

`ExtensionConfig.injectDelegationPolicy`（默认 `true`），用户可通过 `~/.pi/agent/extensions/subagent/config.json` 设置 `false` 禁用。

#### 2. 注入逻辑

在 `registerSubagentExtension` 中注册 `before_agent_start` handler：
- 检查 `effectiveConfig.injectDelegationPolicy` 开关
- 通过 `PI_SUBAGENT_CHILD` 环境变量排除子代理进程
- 将 `DELEGATION_POLICY + DELEGATION_EXAMPLES` 追加到主代理 system prompt 末尾

#### 3. Token 开销

- 语义意图描述：~150 tokens
- Few-shot 示例（6 个）：~200 tokens
- **总计**：~350 tokens（约占 system prompt 的 2-5%）

### 验证

| 检查项 | 结果 |
|--------|------|
| `pnpm typecheck` | ✅ 通过 |
| `pnpm lint` | ✅ 通过 |
| `pnpm test:unit` | ✅ 144/144 通过 |
