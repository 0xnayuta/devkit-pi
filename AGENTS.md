## 项目概述

`devkit-pi` 是面向个人工作流的综合 pi coding 扩展包：

```
subagents（任务委派）
+ web tools（搜索与网页获取）
+ LSP code intelligence（代码智能与自动 diagnostics hook）
+ developer commands（开发者辅助命令）
```

不是完整多代理框架，而是让主代理可以调用一组专业工具完成 coding 任务。

---

## 目录结构

```
src/
├─ index.ts              # 薄入口，只做组合注册
├─ modules/
│  ├─ subagents/         # 专职任务委派、agent 发现、执行
│  │  └─ commands/       # doctor, list, logs, activity
│  ├─ web/               # 搜索、网页内容获取
│  │  └─ providers/      # ddgs, brave, tavily, serper, openserp, searxng
│  └─ lsp/               # LSP tool、hook 与 server 管理
├─ config/               # 配置加载与默认值
└─ shared/               # 类型、错误码、通用工具

agents/                  # 5 个内置 agent 定义（markdown）
tests/                   # 镜像 src/modules 结构
docs/                    # 文档、ADR、指南
```

### 设计边界

- 主代理是唯一 orchestrator
- 子代理不能调度其他子代理
- 每个模块可独立启停

---

## 核心原则

1. **模块化优先**：综合能力不等于大杂烩；每个能力是独立模块
2. **安全默认**：readonly、depth=1、LSP mutating actions 默认受限
3. **渐进增强**：readonly LSP 可作为子代理增强；LSP 或 web 不可用时，退回基础工具
4. **主代理编排**：子代理不调度其他子代理
5. **模块可关闭**：subagents、web、lsp tool、lsp hook、commands 都可独立启停

### 内置 Agent 职责

| Agent | 职责 | 权限 |
|-------|------|------|
| `explorer` | 代码导航、文件搜索、LSP 符号导航 | readonly |
| `researcher` | 文档/API 研究 | readonly |
| `reviewer` | 代码/架构审查、LSP diagnostics 辅助 | readonly |
| `implementer` | 实现规划、LSP definition/references 辅助 | readonly（默认） |
| `tester` | 测试规划、LSP symbols/diagnostics 辅助 | readonly（默认） |

### 子代理约束

每个子代理 prompt 必须包含：只处理 delegated task、不调用额外 subagents、信息不足时报告 uncertainty。

---

## 开发命令

```bash
# 类型检查
pnpm typecheck

# 代码检查
pnpm lint

# 代码格式化
pnpm format

# 一键格式化 + 检查
pnpm lint:fix

# 测试
pnpm test       # unit tests
pnpm test:unit  # unit tests
```

### 验证命令

```bash
# 验证 schema 极简
rg "Type.Object" src/modules/subagents/schemas.ts

# 验证文档同步
pnpm docs:check
```

---

## 错误码

`INVALID_INPUT` | `SUBAGENTS_DISABLED` | `UNKNOWN_AGENT` | `SUBAGENT_DISABLED` | `SUBAGENT_DEPTH_EXCEEDED` | `SUBAGENT_TIMEOUT` | `SUBAGENT_FAILED` | `SUBAGENT_OUTPUT_TRUNCATED`

---

## 文档

- `docs/guides/goals-and-scope.md` - 目标与范围
- `docs/guides/extension-api.md` - 扩展 API 参考
- `docs/adr/` - 架构决策记录
