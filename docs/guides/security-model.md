---
status: current
audience: all
last_verified: 2026-05-09
---

# 安全模型

## 默认策略

- 默认 readonly
- 默认 `maxSubagentDepth = 1`
- 子代理不继承 `subagent` 工具
- 子代理只处理被委托的 task
- 子代理不应扩大任务范围

## 输出清理

结果中不应暴露：

- API key
- npm token
- Authorization header
- 环境变量值
- 完整 stack trace
- 绝对路径
- 完整系统 prompt

## 内置 web tools 安全边界

内置 `web_search`、`fetch_content`、`get_search_content` 保持 readonly：

- 仅允许 `http:` / `https:`
- 禁止 `localhost`、loopback、link-local、private IP
- 禁止 `file:` 等本地协议
- 设置请求 timeout
- 设置最大响应体大小
- 设置最大输出字符数
- 限制重定向
- 默认只处理 HTML/text 内容
- 不写项目文件；仅使用内存保存 `responseId` 结果
- `web_search` 第一版支持多 provider 自动降级：DDGS 零配置兜底、商业 provider（tavily/serper/brave）有 key 时优先、自托管（openserp/searxng）需显式配置 endpoint
- 搜索结果默认最多 5 条（DDGS 限制），商业 provider 优先
- 不支持 browser cookie、登录态抓取、本地文件、GitHub clone、YouTube/视频或 PDF 专门处理

完整设计见 [ADR 0004](../adr/0004-bundled-readonly-web-tools.md)。

## 写入能力

第一版建议不开放写入。即使是 `implementer` 和 `tester`，也优先返回 patch plan 或测试建议。

后续如需写入，应通过显式配置开启：

```json
{
  "allowWriteSubagents": true,
  "subagents": {
    "implementer": { "readonly": false },
    "tester": { "readonly": false }
  }
}
```
