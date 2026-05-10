---
status: current
audience: maintainer
last_verified: 2026-05-09
---

# 测试策略

## 核心测试范围

- 工具注册：`subagent` 可被主代理发现
- 参数校验：缺少 agent/task 时返回稳定错误
- agent 加载：frontmatter 解析正确
- unknown agent：返回清晰错误
- foreground 执行：能启动并返回结果
- 递归保护：子代理不能再调用 `subagent`
- readonly 默认值：写入能力默认禁用
- sanitize：敏感信息不会出现在最终结果中

## 建议测试分层

MVP 实际只维护 `tests/unit/`（单元测试）：

```text
tests/unit/     # 独立模块测试（frontmatter、config、schema、sanitize 等）
tests/mvp/unit/ # MVP 行为验证（默认配置、内置 agents、移除的功能确认）
```

**暂不维护集成测试**（`tests/integration/`）。原因是：

| 原因 | 说明 |
|------|------|
| 需要真实 pi 进程 | 集成测试依赖启动 `pi` 子进程，难以在 CI 中可靠运行 |
| 覆盖成本高 | 集成路径涉及完整工具注册 → child session 启动 → JSONL 输出解析 |
| 单元测试已覆盖关键路径 | `web-search.test.ts`、`subagent-prompt-runtime.test.ts` 等已覆盖主要行为 |

如后续需补充集成测试，建议用 mock/stub 模拟 pi 扩展 API，而非真实启动子进程。

## 不再维护的测试方向

随着功能裁剪，以下测试应删除或迁移为“明确不支持”的测试：

- async/background
- chain execution
- parallel execution
- intercom
- worktree
- TUI widget
- slash bridge
