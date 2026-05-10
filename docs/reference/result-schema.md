---
status: current
audience: user
last_verified: 2026-05-08
---

# 结果 Schema

## 成功结果

```json
{
  "ok": true,
  "output": "Found auth middleware in src/server/auth.ts...",
  "usage": {
    "input": 1000,
    "output": 500,
    "cacheRead": 0,
    "cacheWrite": 0,
    "cost": 0.01,
    "turns": 3
  }
}
```

## 错误结果

```json
{
  "ok": false,
  "error": {
    "code": "UNKNOWN_AGENT",
    "message": "Unknown agent: invalid-agent. Available agents: explorer, researcher, reviewer, implementer, tester"
  }
}
```

## MVP 错误码

| Code | 说明 |
|------|------|
| `INVALID_INPUT` | 缺少必需参数 agent 或 task |
| `SUBAGENTS_DISABLED` | 子代理功能已禁用 |
| `UNKNOWN_AGENT` | 未知代理名称 |
| `SUBAGENT_DISABLED` | 该代理已禁用 |
| `SUBAGENT_DEPTH_EXCEEDED` | 递归深度超限（子代理不能再调子代理） |
| `SUBAGENT_TIMEOUT` | 执行超时 |
| `SUBAGENT_FAILED` | 子代理执行失败 |
| `SUBAGENT_OUTPUT_TRUNCATED` | 输出被截断 |

## Details 结构

```json
{
  "mode": "single",
  "runId": "abc12345",
  "results": [
    {
      "agent": "explorer",
      "task": "Find auth code",
      "exitCode": 0,
      "usage": { "input": 1000, "output": 500, ... },
      "sessionFile": "/path/to/session.jsonl"
    }
  ],
  "error": {
    "code": "SUBAGENT_TIMEOUT",
    "message": "Subagent timed out after 120000ms."
  }
}
```

## Web tools 错误码

内置 web tools（`web_search` / `fetch_content` / `get_search_content`）的错误码列表见：

- [Web Tools 错误码](./web-tools-error-codes.md)

## 输出要求

- 结构稳定
- 错误信息简短
- 不暴露敏感信息（API keys, tokens 等已清理）
- 不暴露完整 stack trace
- 长输出可能被截断（默认 200KB 或 5000 行）
