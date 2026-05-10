---
status: current
audience: maintainer
last_verified: 2026-05-08
---

# 架构总览

## 简化后模块

```text
src/
├─ extension/      # pi 扩展入口、工具注册、可选命令
├─ agents/         # agent 加载、frontmatter 解析、内置 agent
├─ runtime/        # 构造 prompt、启动 pi、收集输出、sanitize
├─ web/            # 内置极简 readonly web tools
├─ config/         # 配置加载与默认值
└─ shared/         # 类型、路径、通用工具
```

## 核心调用链

```text
主代理
  ↓ 调用 tool: subagent({ agent, task })
工具处理器
  ↓ 校验 agent/task/config/depth
加载 agent 定义
  ↓ 构造 child prompt
启动 foreground child pi session
  ↓ 收集输出
sanitize + normalize result
  ↓
返回给主代理
```

## 设计边界

- 主代理是唯一 orchestrator。
- `subagent` 工具每次只启动一个子代理。
- 子代理 session 不注册 `subagent` 工具。
- 工具内部不实现 chain、parallel 或 workflow engine。

## 内置 readonly web tools

为让 `researcher` 开箱可用，项目内置 `web_search`、`fetch_content`、`get_search_content`。该模块只提供 readonly 网络研究能力，不改变 subagent 编排边界。

推荐注册顺序：

```ts
registerWebTools(pi, effectiveConfig);

if (process.env[PI_SUBAGENT_CHILD] === "1") return;

registerSubagentTool(pi);
```

这样子代理进程可以使用 web tools，但仍不能递归调用 `subagent`。

详见 [ADR 0004](../adr/0004-bundled-readonly-web-tools.md) 和 [实施路线](../archive/web-tools-implementation-plan.md)。
