---
status: current
audience: all
last_verified: 2026-05-10
---

# 安全模型

## 默认策略

- 默认 readonly
- 默认 `subagents.maxDepth = 1`
- 子代理不继承 `subagent` 工具
- 子代理只处理被委托的 task
- 子代理不应扩大任务范围
- LSP privileged actions 默认禁用
- 子代理只能使用 `subagents.allowedLspActions` 中的 readonly LSP actions
- LSP hook / 自动 diagnostics 在 Phase 3 不启用

## 输出清理

结果中不应暴露：

- API key
- npm token
- Authorization header
- 环境变量值
- 完整 stack trace
- 完整系统 prompt

## Web tools 安全边界

内置 `web_search`、`fetch_content`、`get_search_content` 保持 readonly：

- 仅允许 `http:` / `https:`
- 禁止 `localhost`、loopback、link-local、private IP
- 禁止 `file:` 等本地协议
- 设置请求 timeout
- 设置最大响应体大小与最大输出字符数
- 不写项目文件；仅使用内存保存 `responseId` 结果

完整设计见 [ADR 0004](../adr/0004-bundled-readonly-web-tools.md)。

## LSP 安全边界

Readonly-safe actions：

```text
definition, references, hover, signature, symbols, diagnostics, workspace-diagnostics, servers
```

Privileged actions：

```text
rename, codeAction, restart
```

`lsp.tool.allowMutatingActions` 默认为 `false`。即使显式开启，子代理进程中仍禁止 privileged actions。

子代理 LSP 由 subagents namespace 控制：

```json
{
  "subagents": {
    "allowLspTools": true,
    "allowedLspActions": ["definition", "references", "hover", "signature", "symbols", "diagnostics", "workspace-diagnostics", "servers"]
  }
}
```

## 写入能力

子代理写能力默认关闭：

```json
{
  "subagents": {
    "allowWrite": false
  }
}
```

如后续需要允许写入，应通过新 ADR 明确风险控制与测试覆盖。
