---
status: current
audience: all
last_verified: 2026-05-12
language: chinese
---

# 安全模型

本文档说明 devkit-pi 当前安全边界。它不是形式化安全证明；当前 public API 与配置细节以 [Configuration reference](../reference/configuration.md)、[Subagents reference](../reference/subagents.md)、[Agent definition reference](../reference/agent-definition.md)、[Web tools reference](../reference/web-tools.md)、[Web tools error codes](../reference/web-tools-error-codes.md) 和 [LSP tools reference](../reference/lsp-tools.md) 为准。

## 默认策略

- 默认 readonly
- 默认 `subagents.maxDepth = 1`
- 子代理不继承 `subagent` 工具
- 子代理只处理被委托的 task
- 子代理不应扩大任务范围
- LSP privileged actions 默认禁用
- 子代理只能使用 `subagents.allowedLspActions` 中的 readonly LSP actions
- LSP hook 仅在主代理进程注册，不在子代理进程注册

## 输出清理

结果中不应暴露：

- API key
- npm token
- Authorization header
- 环境变量值
- 完整 stack trace
- 完整系统 prompt

## Web tools 安全边界

内置 `web_search`、`fetch_content`、`get_search_content` 保持 readonly。工具参数、返回结构和错误语义见 [Web tools reference](../reference/web-tools.md) 与 [Web tools error codes](../reference/web-tools-error-codes.md)：

- 仅允许 `http:` / `https:`
- 禁止 `localhost`、loopback、link-local、private IP
- 禁止 `file:` 等本地协议
- 设置请求 timeout
- 设置最大响应体大小与最大输出字符数
- 不写项目文件；responseId storage 随 session lifecycle restore/clear，并受配置限制

### DNS rebinding / TOCTOU 限制

当前 URL 安全检查会在 fetch/download 之前校验 protocol、hostname/IP、DNS 解析结果和 redirect 目标。这可以阻止常见 localhost/private-network 目标，并且每个 redirect hop 都会重新校验。

但当前实现不提供强 DNS rebinding 防护。对于攻击者控制的域名，DNS 校验与底层 `fetch` 实际建立连接之间仍可能存在 time-of-check/time-of-use（TOCTOU）窗口。高风险环境应禁用远程 URL 抓取/转换，保持 `web.allowPrivateNetwork=false` 和 `convertContent.allowPrivateNetwork=false`，或等待后续 connection-stage IP pinning 设计。

当前 provider、Jina fallback、storage 和 URL 安全边界以 [Web tools reference](../reference/web-tools.md)、[Web providers reference](../reference/web-providers.md) 与 [Configuration reference](../reference/configuration.md) 为准。历史设计背景保存在 `internal-docs/adr/0004-bundled-readonly-web-tools.md`。

## LSP 安全边界

LSP tool/action、hook 和 failure semantics 见 [LSP tools reference](../reference/lsp-tools.md)。

Readonly-safe actions：

```text
definition, references, hover, signature, symbols, diagnostics, workspace-diagnostics, servers
```

Privileged actions：

```text
rename, codeAction, restart
```

`lsp.tool.allowMutatingActions` 默认为 `false`。即使显式开启，子代理进程中仍禁止 privileged actions。

LSP hook 默认启用 `agent_end` 模式，仅对主代理进程中本轮修改过的文件自动诊断；可通过 `lsp.hook.enabled: false` 或 `lsp.hook.mode: "disabled"` 关闭。hook 输出会限制文件数量和最大字符数。

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

Subagents 的 readonly/write 行为见 [Subagents reference](../reference/subagents.md) 与 [Agent definition reference](../reference/agent-definition.md)。子代理写能力默认关闭：

```json
{
  "subagents": {
    "allowWrite": false
  }
}
```

可写自定义 subagents 目前属于实验性能力。默认且推荐的模式是 readonly。`subagents.allowWrite=true` 只表示放宽委派策略，不代表已经具备完整权限沙箱、审计日志、自动回滚机制或稳定的写入能力契约。仅建议在可信仓库中使用，并且必须人工 review 所有变更。

当前边界：

- 内置 agents 仍按 readonly-first 设计。
- 子代理的实际工具可用性取决于 child pi runtime、当前工具注册、执行环境和配置。
- 主代理进程注册 `subagent` 和 `/toolkit`；子代理进程不注册 `subagent`，也不注册 `/toolkit`。
- LSP privileged actions 在子代理中始终禁用。
- Web tools 可用于研究和读取信息。
- 文件写入、命令执行、修改项目等 write-like 行为不应被视为默认安全能力。
- `allowWrite=true` 只是放宽策略入口，不代表完整安全沙箱。

当前没有稳定的自动回滚保证。如果用户启用可写行为，应使用 Git 工作区、提交前 diff、人工 review 和测试命令兜底。

如后续要正式支持可写自定义 subagents，应单独进行 "Writable Subagents Safety Hardening"，至少补充：权限模型、工具 allowlist/denylist、readonly 与 write-like action 分类、write action logging、modified files summary、before/after diff guidance、rollback recommendation、failure recovery notes、测试覆盖和 release note 中的 experimental/breaking 状态说明。
