---
status: accepted
audience: maintainer
last_verified: 2026-05-09
---

# ADR 0004: 内置极简 readonly web tools

## 背景

内置 `researcher` agent 声明使用：

```text
web_search, fetch_content, get_search_content
```

这些工具不是 pi core 自带工具。参考项目 `nicobailon/pi-subagents` 选择依赖独立扩展 `pi-web-access`，但本项目希望让 `researcher` 开箱可用，同时保持轻量边界。

## 决策

在 `pi-subagents` 内置一组极简 readonly web tools：

- `web_search`
- `fetch_content`
- `get_search_content`

实现目标是兼容 `pi-web-access` 的常用接口子集，而不是复制其完整功能。

## 范围

### 包含

- 普通网页搜索
- HTTP/HTTPS URL 内容抓取
- HTML/text 到可读文本的基础提取
- `responseId` 内存存储
- 从历史搜索/抓取结果中按 `responseId` 取回完整内容
- timeout、响应大小、输出长度限制
- SSRF 防护

### 不包含

- curator UI
- Gemini Web/browser cookie
- YouTube/视频分析
- PDF 专门处理
- GitHub repo clone
- MCP/Exa 复杂 fallback
- 多 provider 自动编排
- 登录态抓取
- 写入项目文件

## 推荐模块结构

```text
src/web/
├─ index.ts      # registerWebTools(pi, config)
├─ schemas.ts    # TypeBox 参数 schema
├─ types.ts      # web tool 内部类型
├─ security.ts   # URL 校验、防 SSRF、timeout/size 默认值
├─ storage.ts    # responseId -> search/fetch result cache
├─ fetch.ts      # fetch_content
├─ extract.ts    # HTML/text 提取
└─ search.ts     # web_search provider
```

## 注册策略

子代理进程不能注册 `subagent` 工具，但必须能注册 web tools：

```ts
registerWebTools(pi, effectiveConfig);

if (process.env[PI_SUBAGENT_CHILD] === "1") return;

registerSubagentTool(pi);
```

| 进程 | 注册内容 |
|---|---|
| 主代理进程 | `subagent` + 可选 `web_*` |
| 子代理进程 | `web_search` / `fetch_content` / `get_search_content` |
| 子代理进程 | 不注册 `subagent` |

## 安全边界

- 仅允许 `http:` / `https:`
- 禁止 `localhost`、loopback、link-local、private IP
- 禁止 `file:` 等本地协议
- 设置 fetch timeout
- 设置最大响应体大小
- 设置最大输出字符数
- 限制重定向
- 默认只处理 text/html/text/plain 等文本内容
- 不写项目文件；结果仅存内存或会话级临时状态

## 后果

优点：

- `researcher` 开箱可用
- 不依赖外部 `pi-web-access`
- 保留 readonly 安全边界
- 接口对常用场景保持熟悉

代价：

- 项目范围从纯 subagent 编排扩展到包含基础 web research tools
- 需要维护网络访问、安全限制和 provider 兼容性
- 搜索 provider 的稳定性会成为新的维护点
