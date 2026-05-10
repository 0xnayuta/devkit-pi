# devkit-pi

[English](README.md) | 中文

面向个人工作流的一体化 pi coding 工具包。

将 subagent 任务委派、Web 研究、LSP 代码智能、自动诊断 hook 和开发者命令整合为一个模块化 pi 扩展。

## 模块

| 模块 | 说明 | 默认状态 |
|------|------|----------|
| **subagents** | 将任务委派给 5 个专职 readonly agent；支持通过 markdown frontmatter 自定义 user/project agent | 启用 |
| **web** | `web_search`、`fetch_content`、`get_search_content` — 多供应商搜索、URL 内容提取、结果缓存 | 启用 |
| **lsp** | LSP 工具（definition、references、hover、symbols、diagnostics）+ `agent_end` 后自动诊断 hook | 启用 |
| **commands** | 统一 `/toolkit` 命令中心：doctor、modules、logs、agents、lsp、activity | 启用 |

## 快速开始

### 作为 pi 包安装

```bash
pi install devkit-pi
```

### 或本地链接开发

```json
{
  "pi": {
    "extensions": ["./src/index.ts"]
  }
}
```

```bash
git clone https://github.com/0xnayuta/devkit-pi.git
cd devkit-pi
pnpm install
pnpm test
```

## 内置 Agent

| Agent | 专长 | 权限 |
|-------|------|------|
| **explorer** | 代码导航、文件搜索、LSP 符号导航 | readonly |
| **researcher** | 文档/API 研究、Web 搜索 | readonly |
| **reviewer** | 代码审查、架构分析、LSP diagnostics | readonly |
| **implementer** | 实现规划，辅以 LSP definition/references | readonly |
| **tester** | 测试策略、边界用例规划、LSP diagnostics | readonly |

所有 agent 默认 readonly。主代理是唯一编排者 — 子代理不能再调度其他子代理。

### 自定义 agent

在 `.pi/agents/`（项目级）或 `~/.pi/agent/agents/`（用户级）放置 markdown 文件：

```md
---
name: custom-reviewer
description: 项目专用审查 agent
readonly: true
tools: read, grep, find, ls
---

You are a custom review subagent.
```

## 工具

### Subagent 工具

```ts
subagent({ agent: "explorer", task: "查找认证相关代码" })
```

将聚焦任务委派给专职 agent，结果经 sanitize 后返回给父代理。

### Web 工具

| 工具 | 说明 |
|------|------|
| `web_search` | 多供应商 Web 搜索，支持自动降级。供应商：ddgs（默认）、brave、tavily、serper、openserp、searxng |
| `fetch_content` | 抓取 URL 并提取可读文本，支持 Jina reader 降级（适用于 JS 重度渲染页面） |
| `get_search_content` | 通过 responseId 检索已存储的搜索/抓取结果 |

### LSP 工具

暴露语言服务器能力：`definition`、`references`、`hover`、`signature`、`symbols`、`diagnostics`、`workspace-diagnostics`、`servers`。

变更类操作（`rename`、`codeAction`、`restart`）默认禁用，且在子代理进程中始终被阻止。

### LSP 诊断 hook

在每轮 agent 交互后自动运行 LSP diagnostics（可配置：`agent_end` | `edit_write` | `disabled`）。

## 命令

`/toolkit` 命令提供诊断和检查子命令：

| 子命令 | 说明 |
|--------|------|
| `/toolkit doctor` | 运行统一诊断检查 |
| `/toolkit modules` | 显示各模块启用状态 |
| `/toolkit logs` | 查看近期 Web 活动日志 |
| `/toolkit agents` | 列出所有已发现的 agent |
| `/toolkit lsp` | 显示 LSP 工具/hook 配置 |
| `/toolkit activity` | 打开交互式活动面板 |
| `/toolkit help` | 显示用法帮助 |

## 配置

配置文件路径：`~/.pi/agent/extensions/devkit-pi/config.json`

完整配置参考（含默认值）：

```json
{
  "enabled": true,
  "subagents": {
    "enabled": true,
    "maxDepth": 1,
    "timeoutMs": 120000,
    "allowWrite": false,
    "allowLspTools": true,
    "allowedLspActions": [
      "definition", "references", "hover", "signature",
      "symbols", "diagnostics", "workspace-diagnostics", "servers"
    ],
    "injectDelegationPolicy": true,
    "retry": {
      "enabled": true,
      "maxAttempts": 2
    }
  },
  "web": {
    "enabled": true,
    "provider": "ddgs",
    "providerPriority": ["tavily", "serper", "brave", "openserp", "searxng", "ddgs"],
    "timeoutMs": 10000,
    "maxResponseBytes": 1048576,
    "maxContentChars": 30000,
    "maxResults": 5,
    "enableJinaFallback": false,
    "cache": { "enabled": false, "maxEntries": 50, "ttlMs": 300000 },
    "concurrency": { "maxConcurrent": 3, "maxQueueSize": 10 },
    "debug": false
  },
  "lsp": {
    "enabled": true,
    "tool": {
      "enabled": true,
      "allowMutatingActions": false
    },
    "hook": {
      "enabled": true,
      "mode": "agent_end"
    }
  },
  "commands": {
    "enabled": true
  }
}
```

每个模块均可独立启用或禁用。

## 错误码

### Subagent 错误

`INVALID_INPUT` | `SUBAGENTS_DISABLED` | `UNKNOWN_AGENT` | `SUBAGENT_DISABLED` | `SUBAGENT_DEPTH_EXCEEDED` | `SUBAGENT_TIMEOUT` | `SUBAGENT_FAILED` | `SUBAGENT_OUTPUT_TRUNCATED`

### Web 工具错误

`INVALID_INPUT` | `WEB_SEARCH_FAILED` | `PROVIDER_AUTH_FAILED` | `PROVIDER_RATE_LIMITED` | `PROVIDER_UNAVAILABLE` | `WEB_SEARCH_TIMEOUT` | `FETCH_CONTENT_FAILED` | `NETWORK_ERROR` | `CONTENT_TOO_LARGE` | `CONTENT_FETCH_TIMEOUT` | `STORAGE_FULL` | `NOT_FOUND` | `CACHE_DISABLED`

## 项目结构

```text
src/
├─ index.ts                 # 薄入口 — 注册所有模块
├─ modules/
│  ├─ subagents/            # 任务委派、agent 发现、执行
│  │  └─ commands/          # doctor、list、logs 格式化逻辑
│  ├─ web/                  # 搜索、抓取、内容提取、缓存
│  │  └─ providers/         # ddgs、brave、tavily、serper、openserp、searxng
│  ├─ lsp/                  # LSP 工具、诊断 hook、server 管理
│  └─ commands/             # 统一 /toolkit 命令注册
├─ config/                  # 配置加载与默认值
└─ shared/                  # 类型、错误码、通用工具
agents/                     # 5 个内置 agent 定义（markdown）
tests/                      # 镜像 src/modules 结构
docs/                       # 文档、指南、ADR
```

## 设计边界

1. 主代理是唯一编排者
2. 子代理不能再调度其他子代理（`maxDepth = 1`）
3. 默认 readonly — 写入能力需要显式配置
4. LSP 变更类操作（`rename`、`codeAction`、`restart`）默认禁用，且在子代理进程中始终被阻止
5. 每个模块均可独立启用或禁用

## 开发

```bash
pnpm typecheck    # 类型检查
pnpm lint         # 使用 Biome 检查代码
pnpm lint:fix     # 自动修复 lint 问题
pnpm format       # 使用 Biome 格式化代码
pnpm test         # 运行单元测试
pnpm docs:check   # 验证文档
```

## 文档

- [目标与范围](docs/guides/goals-and-scope.md)
- [架构](docs/guides/architecture.md)
- [配置参考](docs/reference/configuration.md)
- [Agent 定义](docs/reference/agent-definition.md)
- [安全模型](docs/guides/security-model.md)
- [架构决策记录](docs/adr/README.md)

## 许可证

MIT © Izayoi Nayuta
