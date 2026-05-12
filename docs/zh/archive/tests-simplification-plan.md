---
status: deprecated
audience: maintainer
last_verified: 2026-05-12
language: chinese
---

# 测试简化计划

状态：第 6 阶段已执行完成  
日期：2026-05-12

本计划最初是对 `tests/` 目录进行简化的第一阶段审查。第 2 阶段合并了低风险的子代理测试。第 3 阶段合并了低风险的 Web 注册/模式/渲染器和缓存/存储测试。第 4 阶段合并了 fetch/内容提取和处理程序测试。第 5 阶段将搜索 provider 测试合并为单个 provider 契约文件。第 6 阶段删除了独立的内部 Web 基础设施测试，并在工具或公共契约边界保留了所需的超时/并发/错误覆盖。第 6 阶段还删除了 `tests/shared/path-handling.test.ts` —— 该测试断言的是通用 Node.js `path` 行为，而非项目特定的回归（源码中不存在 `startsWith('/')` 反模式），因此按照计划的候选删除标准已移除。`tests/shared/` 目录现已清空并被移除；`package.json` 测试 glob 也相应更新。

## 已审查的输入材料

- `AGENTS.md`
- `package.json` 测试脚本
- `tsconfig.json`
- `docs/guides/testing.md`
- 当前的 `tests/` 目录树
- 当前的 `src/modules/`、`src/config/` 和 `src/shared/` 目录树

## 当前测试执行/配置说明

- `pnpm test` 运行 `pnpm test:unit`。
- `test:unit` 当前使用明确的 Node 测试 glob：
  - `tests/subagents/*.test.ts`
  - `tests/commands/*.test.ts`
  - `tests/web/*.test.ts`
  - `tests/lsp/*.test.ts`
  - `tests/package-manifest.test.ts`
- `tsconfig.json` 排除了 `tests`，因此测试类型导入的漂移可能逃过 `pnpm typecheck`。
- `lint` / `format` 当前仅针对 `src`，不针对 `tests`。
- 如果测试被合并移出 `tests/subagents/commands/` 或 `tests/web/providers/`，实现阶段必须更新 `package.json` 测试 glob。
- `docs/guides/testing.md` 描述了当前的目录布局，最终结构变更时必须更新。

## 源码模块边界快照

`src/modules/` 下的当前模块边界：

```text
src/modules/
├─ commands/    # unified /toolkit registration
├─ lsp/         # lsp tool, schemas, hook/register/core
├─ subagents/   # agent discovery, execution/runtime, spawn, commands, schemas
└─ web/         # tools, fetch/search, providers, handlers, storage/cache, security, observability
```

支撑边界：

```text
src/config/     # config loading/defaults/normalization
src/shared/     # shared public types/errors/path/session/delegation helpers
```

目标测试应继续镜像这些边界，但减少每个内部辅助函数一个文件的测试。

## 按文件覆盖审查

| 测试文件 | 当前覆盖 | 保留/合并/删除指导 | 风险 |
|---|---|---|---|
| `tests/package-manifest.test.ts` | 包清单包含 CI 安装的 `@earendil-works/*` 直接运行时导入声明。 | 保留作为根清单/导出/依赖契约测试。 | 低 |
| `tests/shared/path-handling.test.ts` | 跨平台 `path.isAbsolute`、`path.join`、原生分隔符行为。 | 已删除 — 源码中不存在 `startsWith('/')` 反模式；通用 Node API 行为非项目特定。 | 中（已完成） |
| `tests/commands/register.test.ts` | 统一 `/toolkit` 命令注册、禁用门、子进程保护、概览输出。 | 保留为 `tests/commands/register.test.ts`；用户可见的命令注册是必需的覆盖。 | 低 |
| `tests/lsp/tool.test.ts` | LSP 注册、hook 事件注册/禁用/模式、子进程隔离、禁用门、`servers`、特权操作阻塞、工作区边界、工作区诊断上限、子代理只读白名单、操作名称导出。 | 保留为 `tests/lsp/tool.test.ts`；可内部分组为注册/权限/操作。不要进一步拆分。 | 低 |
| `tests/subagents/agents.test.ts` | 内置 agent 发现、必需元数据、安全工具列表、已移除的旧内置不存在。 | 保留为 `tests/subagents/agents.test.ts`；考虑将 frontmatter 发现测试合并进来。 | 低 |
| `tests/subagents/frontmatter.test.ts` | Frontmatter 解析、项目源码分配、已移除的 frontmatter 字段未被解析、`~/.pi/agent/agents` 用户代理发现。 | 合并到 `tests/subagents/agents.test.ts`，因为它属于 agent 定义/发现行为。如果旧字段断言仅保留已移除的旧结构，则删除旧字段断言，除非它们是来自 docs/ADR 的明确回归保证。 | 中 |
| `tests/subagents/config.test.ts` | 全局配置默认值、Web provider 优先级默认值、Web provider 验证、子代理 LSP 白名单规范化、LSP hook 配置、无效子代理字段规范化、子代理错误码、排除旧参数的 `SubagentParams` schema。 | 保留但可重命名/调整范围。 当前覆盖全局配置、Web 配置、LSP 配置和子代理 schema 在子代理文件中。 后续更广泛的清理中优先 `tests/config.test.ts`，或将 Web/LSP 默认值移到模块测试。 | 中 |
| `tests/subagents/register.test.ts` | 主进程中的子代理工具注册和子进程保护。 | 保留为 `tests/subagents/register.test.ts`。 | 低 |
| `tests/subagents/collect-output.test.ts` | JSONL/结果输出提取、provider 错误提取、部分输出分离、非 JSON 回退、usage 提取。 | 合并到 `tests/subagents/runtime.test.ts`；它是运行时/结果处理，非独立公共模块边界。保留 provider 错误和部分输出回归。 | 低 |
| `tests/subagents/prompt-runtime.test.ts` | 子 prompt 构建、项目上下文/技能剥离、子边界注入、编排技能过滤、仅父消息过滤、hook 重写、产物过滤。 | 合并到 `tests/subagents/runtime.test.ts`；保留所有用户可见的上下文隔离行为。 | 低 |
| `tests/subagents/pi-spawn.test.ts` | 跨平台 pi spawn 命令选择、Windows argv/package bin 解析、回退行为。 | 合并到 `tests/subagents/runtime.test.ts` 作为执行/spawn 行为。保留 Windows 路径回归；如果一个代表性案例已覆盖，则删除过多的重复非 Windows 回退变体。 | 中 |
| `tests/subagents/lsp-tools.test.ts` | 只读代理默认获取 `lsp`，`allowLspTools=false` 时移除，无只读 LSP 操作时移除。 | 合并到 `tests/subagents/runtime.test.ts` 或 `agents.test.ts`。它是 agent 工具解析策略。保留，因为子代理 LSP 权限边界是必需的。 | 低 |
| `tests/subagents/commands/activity-panel.test.ts` | 活动面板构建、渲染、键盘输入、缓存失效、工厂选项。 | 合并到 `tests/subagents/commands.test.ts`。如果缓存失效/mock-heavy 断言仅测试内部 TUI 实现细节，考虑删除。保留渲染和键盘用户可见行为。 | 中 |
| `tests/subagents/commands/doctor.test.ts` | 医生检查报告结构、类别/状态/消息、provider 检查、格式化文本、摘要/状态/类别符号、ddgs 可用性。 | 合并到 `tests/subagents/commands.test.ts`。保留健康检查/输出契约；减少重复的格式化断言。 | 低 |
| `tests/subagents/commands/list.test.ts` | Agent 列表数据形状、内置属性、文本格式化器部分、JSON 格式化器一致性。 | 合并到 `tests/subagents/commands.test.ts`；保留文本/JSON 用户可见契约。 | 低 |
| `tests/subagents/commands/logs.test.ts` | 最近日志数据/统计、限制/类型过滤器、文本格式化器、JSON 格式化器。 | 合并到 `tests/subagents/commands.test.ts`；保留选择器/过滤器和格式化器契约。 | 低 |
| `tests/web/register.test.ts` | Web 启用门、注册三个工具、工具名称/执行/渲染器、参数 schema 暴露、生命周期事件处理器、会话恢复/清除/关闭、appendEntry 设置。 | 保留为 `tests/web/register.test.ts`。如果 `schemas.test.ts` 保留独立文件则删除重复 schema 断言，或将 schema 检查合并到此文件。 | 低 |
| `tests/web/schemas.test.ts` | `FetchContentParams`、`WebSearchParams`、`GetSearchContentParams` 的 TypeBox 验证；可选/必需字段、错误类型、额外属性。 | 合并到 `tests/web/register.test.ts` 或保留小型 `register.test.ts` schema 部分。工具 schema 测试是强制的；避免为三个简单 schema 创建独立 schema 文件。 | 低 |
| `tests/web/search.test.ts` | 缺失查询错误、不支持的 provider 运行时检查、provider 认证/回退/优先级/可用性、存储、includeContent fetch、速率限制/超时分类、默认 ddgs 行为、显式 provider 无回退、ddgs 上限。 | 保留为 `tests/web/search.test.ts`；这是高价值工具行为。如果已合并，将 provider 选择重复项移到 `providers.test.ts`。 | 低 |
| `tests/web/fetch.test.ts` | 缺失/畸形/私有 URL 错误、HTML 提取/截断、Jina 回退/preferReader/触发器/私有保护/字节上限、响应字节上限、可接受的内容类型、不支持/二进制文件、源扩展名检测、localhost 允许门。 | 重命名为 `tests/web/fetch-content.test.ts`。保留安全、支持类型、不支持类型、Jina、字节/输出截断。考虑将纯处理程序解析用例移到 `fetch-content.test.ts` 并从 `handlers.test.ts` 删除重复。 | 低 |
| `tests/web/security.test.ts` | 安全限制提取、无效协议、阻塞主机名、私有 IPv4/IPv6 范围、公共边界情况、DNS 解析、allowPrivateNetwork 行为。 | 保留为 `tests/web/security.test.ts`。它是必需的 SSRF/私有网络覆盖。 | 低 |
| `tests/web/storage.test.ts` | `get_search_content` 未知 responseId、按 url/query/index 选择器、提示、会话恢复/TTL、最大条目、存储/返回内容截断。 | 与缓存测试合并为 `tests/web/cache-storage.test.ts`；保留选择器和截断行为。 | 低 |
| `tests/web/cache.test.ts` | 搜索结果缓存存储/检索/未命中/清除/失效、缓存键规范化、LRU 驱逐、命中/未命中统计、全局实例配置。 | 与存储测试合并为 `tests/web/cache-storage.test.ts`。保留 LRU、键规范化、统计（如果用户可见/可诊断）。 | 低 |
| `tests/web/observability.test.ts` | 调试配置级别、统计聚合、活动日志、记录辅助函数、调试日志。 | 保留为 `tests/web/observability.test.ts`；仅在模块边界变更时合并日志/活动命令测试，否则与子代理命令分开保留。 | 低 |
| `tests/web/errors.test.ts` | Web 错误码清单、恢复映射、`createWebError`、HTTP/网络映射、格式化、摘要。 | 按行为合并到 `tests/web/search.test.ts`、`fetch-content.test.ts` 和/或 `observability.test.ts`。在某处保留稳定错误码测试。独立内部错误工厂文件过度碎片化。 | 中 |
| `tests/web/abort.test.ts` | 超时信号行为、父信号组合、类 abort 错误检测（DOMException/Error/string/null）。 | 将超时/取消断言合并到 `tests/web/search.test.ts` 和 `tests/web/fetch-content.test.ts`。如果非用户可见则删除穷举字符串/类型矩阵。 | 中 |
| `tests/web/concurrency.test.ts` | 请求节流器默认值/配置、并行限制、统计、队列满、空闲/重置、全局实例。 | 作为 includeContent 并发/队列行为合并到 `tests/web/search.test.ts`，或合并到 `observability.test.ts`（如果仅是统计）。仅在通过工具行为暴露时保留队列满/限制行为。 | 中 |
| `tests/web/http-pool.test.ts` | 池默认值/配置/统计/重置/销毁/全局函数、`pooledFetch` 委托和计数器。 | 候选删除或大量削减。它主要测试内部基础设施。仅在用户配置行为未被测试时保留最大 socket/全局生命周期。 | 高 |
| `tests/web/extract.test.ts` | 截断、空格规范化、标题提取、JS 渲染/Jina 触发器检测、旧 `shouldTryJinaFallback`、纯文本提取、HTML 提取。 | 合并到 `tests/web/fetch-content.test.ts`。如果函数/名称仅为兼容性保留则删除旧 `shouldTryJinaFallback` 测试。保留截断、标题提取、JS/Jina 触发器行为作为 fetch 可见回归。 | 中 |
| `tests/web/handlers.test.ts` | 处理程序注册表、HTML/text/JSON/CSV/TSV/XML/RSS/Atom/YAML/不支持处理程序、解析回退。 | 合并到 `tests/web/fetch-content.test.ts`。为每种支持类型保留代表性用例和解析回退；减少穷举格式化器内部细节。 | 中 |
| `tests/web/renderers.test.ts` | search/fetch/get content 的工具调用/结果渲染器、部分/错误状态、安全字符串/截断辅助函数。 | 合并到 `tests/web/register.test.ts` 或保留为渲染器部分（如果较大）。除非渲染器被视为用户可见的 UI 契约，否则不要独立渲染器文件。 | 中 |
| `tests/web/providers/metadata.test.ts` | Provider 元数据名称、层级、显示名称、enabled 辅助函数、api key env 辅助函数。 | 合并到 `tests/web/providers.test.ts`。保留 provider 列表和 env/显示契约。 | 低 |
| `tests/web/providers/registry.test.ts` | 注册表返回每个元数据名称的 provider、provider 形状、ddgs 可用性、未知 provider undefined。 | 合并到 `tests/web/providers.test.ts`。 | 低 |
| `tests/web/providers/select-provider.test.ts` | 显式不支持/禁用/不可用/认证失败、自动模式/ddgs/默认优先级、结果形状。 | 合并到 `tests/web/providers.test.ts`。保留选择行为；避免 provider 可用性检查重复（已由 provider 特定契约部分覆盖）。 | 低 |
| `tests/web/providers/ddgs.test.ts` | DDGS 可用性/名称、Lite HTML 解析、结果上限、请求端点、错误、中止传播、去重/解码/过滤。 | 合并到 `tests/web/providers.test.ts`；保留 DDGS 作为零配置 provider 契约和解析器边界情况。 | 低 |
| `tests/web/providers/brave.test.ts` | Brave 可用性/名称、API key/baseUrl 验证、请求参数/headers、规范化的响应、过滤/回退字段、错误。 | 合并到 `tests/web/providers.test.ts`；使用共享 provider 契约辅助函数去除重复。 | 中 |
| `tests/web/providers/openserp.test.ts` | OpenSerp 可用性/名称、请求参数/headers、有机/结果回退、规范化的字段、错误。 | 合并到 `tests/web/providers.test.ts`；使用共享 provider 契约辅助函数。 | 中 |
| `tests/web/providers/searxng.test.ts` | SearXNG 可用性/名称、baseUrl 验证/路径处理/默认引擎、规范化的结果、错误。 | 合并到 `tests/web/providers.test.ts`；保留 SearXNG 特定的 base 路径/默认引擎用例。 | 中 |
| `tests/web/providers/serper.test.ts` | Serper 可用性/名称、POST body/headers、规范化的有机结果、错误。 | 合并到 `tests/web/providers.test.ts`；使用共享 provider 契约辅助函数。 | 中 |
| `tests/web/providers/tavily.test.ts` | Tavily 可用性/名称、POST body、规范化的结果、错误。 | 合并到 `tests/web/providers.test.ts`；使用共享 provider 契约辅助函数。 | 中 |

## 重复或过度碎片化区域

1. **Web provider 测试**
   - 六个 provider 文件重复相同模式：名称、可用性、请求形状、规范化输出、HTTP/网络错误。
   - 保留 provider 特定 fixtures，但合并为一个 `providers.test.ts` 及共享契约辅助函数。
   - 风险：中，因为 provider 特定规范化细节可能在合并期间意外丢失。

2. **Web fetch/内容管道测试**
   - `fetch.test.ts`、`extract.test.ts` 和 `handlers.test.ts` 在文本提取、内容类型支持、截断和回退行为上重叠。
   - 通过 `fetch_content` 保留可见行为；减少纯辅助函数矩阵测试。
   - 风险：中，因为支持的内容类型回归是用户可见的。

3. **Web 内部基础设施测试**
   - `abort.test.ts`、`concurrency.test.ts` 和 `http-pool.test.ts` 主要测试内部工具函数。
   - 尽可能将超时/取消/并发覆盖移到工具级行为。
   - 风险：`http-pool` 如果配置驱动的池化未在其他地方覆盖则为中/高。

4. **Web schemas/渲染器/register 测试**
   - 工具 schemas 和渲染器是用户可见的，但独立文件使模块看起来比源码边界更碎片化。
   - 除非变得太大，否则将 schema 和渲染器契约部分合并到 `register.test.ts`。
   - 风险：低/中。

5. **子代理运行时测试**
   - `collect-output.test.ts`、`prompt-runtime.test.ts`、`pi-spawn.test.ts` 和 `lsp-tools.test.ts` 都是运行时/执行策略测试。
   - 整合为 `runtime.test.ts`。
   - 风险：spawn 平台情况为中。

6. **子代理命令测试**
   - `tests/subagents/commands/` 下的四个文件镜像实现文件但过度碎片化命令输出/格式化器。
   - 整合为 `commands.test.ts`，包含 doctor/list/logs/activity 部分。
   - 风险：低/中。

7. **配置放置**
   - `tests/subagents/config.test.ts` 当前包含全局、Web、LSP、子代理 schema 和子代理错误码检查。
   - 要么保留为临时配置契约测试，要么在后续架构清理中提升为根 `tests/config.test.ts`。下方推荐的目标结构仅保留用户提供的目标文件，因此本计划暂时保留 `subagents/config.test.ts` 但随时间缩小其内容。
   - 风险：中。

8. **旧结构/兼容性测试**
   - `frontmatter.test.ts` 移除的字段（`package`、`inheritSkills`、`defaultContext`）和 `config.test.ts` 旧参数排除应与 docs/ADR 对照审查。
   - 仅在它们代表有意的回归约束时保留，而非与旧结构的兼容性。
   - `extract.test.ts` 明确标注 `shouldTryJinaFallback` 为旧版；如不再公开/当前则删除。
   - 风险：中。

## 应保留为不可协商契约的测试

- 包清单依赖/导出契约。
- 统一 toolkit 命令注册及禁用/子进程保护。
- 子代理注册、内置 agents、schema、运行时隔离、输出收集、LSP 工具权限边界。
- LSP 工具注册、操作门控、工作区边界、hook 禁用模式、子代理限制。
- Web 工具注册、schemas、渲染器、search/fetch/get-content 行为。
- Provider 规范化输出和 provider 选择行为。
- 配置默认值和规范化公共配置字段。
- 结构化错误码和可操作消息。
- 工具边界的超时/中止/取消行为。
- 输出截断和存储截断。
- SSRF/私有网络/路径边界安全测试。
- 支持/不支持的 `fetch_content` 内容类型。

## 候选删除或削减

此处删除指在行为被其他地方覆盖后的删除，不是盲目移除。

| 候选项 | 原因 | 替换覆盖 | 风险 |
|---|---|---|---|
| `shared/path-handling.test.ts` 中通用 Node `path` 行为断言 | 测试 Node 运行时而非项目行为。 | 已移除 — 源码中不存在 `startsWith('/')` 反模式；真实的 `path.isAbsolute`/`path.join` 用法隐式由工具级测试覆盖。 | 中（已完成） |
| 穷举类 abort 字符串/类型矩阵 | 内部辅助函数实现细节。 | Fetch/search 超时和取消用户可见错误。 | 中 |
| 大部分 `http-pool` 构造函数/全局单例测试 | 内部基础设施和 mock 调用计数器。 | 工具/provider fetch 行为加任何公共配置默认值。 | 高 |
| 重复 provider `isAvailable` 禁用但技术上有效的情况 | 跨 keyed providers 重复相同模式。 | 共享 provider 契约表。 | 中 |
| 重复 provider 请求形状幸福路径 | 结构重复；每个 provider 保留一个 fixture，不要多个冗余变体。 | 整合的 `providers.test.ts`。 | 中 |
| `extract.shouldTryJinaFallback (旧版)` | 明确为旧版名称/行为。 | 当前 `detectJinaTrigger` 和 `fetch_content` Jina 回退测试。 | 中 |
| 格式化器符号/制表符绘制微断言 | 脆弱的内部展示细节。 | 每个格式化器一个快照式或部分存在性断言。 | 低 |
| 仅 mock 调用计数断言 | 不验证用户可见行为。 | 结果形状、注册工具/事件、可观察输出。 | 低 |
| 仅旧兼容性的旧 frontmatter 字段 | 与无旧结构规则冲突。 | 当前 agent 定义 schema/参考测试。 | 中 |

## 推荐的目标 `tests/` 结构

## 推荐的目标 `tests/` 结构（第 2–6 阶段已达成）{#recommended-target-tests-structure-achieved-in-phases-2-6}

> ✅ 所有阶段已完成。下方结构反映 `tests/` 当前状态。

首选整合结构（第 2–6 阶段达成）：

```text
tests/
├─ package-manifest.test.ts
├─ commands/
│  └─ register.test.ts
├─ lsp/
│  └─ tool.test.ts
├─ subagents/
│  ├─ agents.test.ts
│  ├─ runtime.test.ts
│  ├─ config.test.ts
│  ├─ register.test.ts
│  └─ commands.test.ts
└─ web/
   ├─ register.test.ts
   ├─ search.test.ts
   ├─ fetch-content.test.ts
   ├─ providers.test.ts
   ├─ cache-storage.test.ts
   ├─ security.test.ts
   └─ observability.test.ts
```

说明：

- `tests/subagents/commands/` 目录已移除；命令测试整合为 `tests/subagents/commands.test.ts`。
- `tests/web/providers/` 目录已移除；provider 测试整合为 `tests/web/providers.test.ts`。
- `tests/web/fetch.test.ts` 已重命名为 `fetch-content.test.ts` 以匹配公共工具名称。
- `tests/shared/path-handling.test.ts` 已移除 — 它测试通用 Node.js `path` 行为而非项目特定回归（源码中不存在 `startsWith('/')` 反模式）；`tests/shared/` 目录现已清空并移除。
- 如果配置测试继续覆盖所有模块，考虑未来的 `tests/config.test.ts`；否则将 `tests/subagents/config.test.ts` 缩小为子代理特定 schema/config，并将 Web/LSP 默认值移到其模块文件。

## 提议的迁移图

```text
tests/subagents/frontmatter.test.ts         -> tests/subagents/agents.test.ts
tests/subagents/collect-output.test.ts     -> tests/subagents/runtime.test.ts
tests/subagents/prompt-runtime.test.ts     -> tests/subagents/runtime.test.ts
tests/subagents/pi-spawn.test.ts           -> tests/subagents/runtime.test.ts
tests/subagents/lsp-tools.test.ts          -> tests/subagents/runtime.test.ts
tests/subagents/commands/*.test.ts         -> tests/subagents/commands.test.ts

tests/web/fetch.test.ts                    -> tests/web/fetch-content.test.ts
tests/web/extract.test.ts                  -> tests/web/fetch-content.test.ts
tests/web/handlers.test.ts                 -> tests/web/fetch-content.test.ts
tests/web/abort.test.ts                    -> tests/web/search.test.ts + tests/web/fetch-content.test.ts
tests/web/concurrency.test.ts              -> tests/web/search.test.ts 或 tests/web/observability.test.ts
tests/web/errors.test.ts                   -> tests/web/search.test.ts + tests/web/fetch-content.test.ts + tests/web/observability.test.ts
tests/web/renderers.test.ts                -> tests/web/register.test.ts
tests/web/schemas.test.ts                  -> tests/web/register.test.ts
tests/web/cache.test.ts                    -> tests/web/cache-storage.test.ts
tests/web/storage.test.ts                  -> tests/web/cache-storage.test.ts
tests/web/http-pool.test.ts                -> 如有需要则删除/削减到 provider/工具测试
tests/web/providers/*.test.ts              -> tests/web/providers.test.ts
```

## 执行顺序（已完成）

所有阶段已执行。见下方[达成的目标结构](#recommended-target-tests-structure-achieved-in-phases-2-6)。

## 剩余分阶段执行顺序

### 第 1 阶段 — 仅计划

- 保持本文档作为审查基线。
- 无测试代码变更。

### 第 2 阶段 — 低风险子代理整合

1. 从以下文件创建 `tests/subagents/runtime.test.ts`：
   - `collect-output.test.ts`
   - `prompt-runtime.test.ts`
   - `pi-spawn.test.ts`
   - `lsp-tools.test.ts`
2. 将 `frontmatter.test.ts` 合并到 `agents.test.ts`。
3. 将 `tests/subagents/commands/*.test.ts` 合并到 `tests/subagents/commands.test.ts`。
4. 合并测试通过后移除旧文件。
5. 更新 `package.json` 测试 glob 以停止引用 `tests/subagents/commands/*.test.ts`。

阶段后验证：

```bash
pnpm test:unit
```

### 第 3 阶段 — Web 注册/schema/缓存整合

1. 将 `schemas.test.ts` 和渲染器契约测试合并到 `web/register.test.ts`。
2. 将 `cache.test.ts` 和 `storage.test.ts` 合并到 `web/cache-storage.test.ts`。
3. 保持 `web/security.test.ts`、`web/search.test.ts` 和 `web/observability.test.ts` 不变。
4. 如有需要更新测试 glob。

验证：

```bash
pnpm test:unit
```

### 第 4 阶段 — Web fetch/内容整合

1. 将 `web/fetch.test.ts` 重命名为 `web/fetch-content.test.ts`。
2. 将保留的 `extract.test.ts` 和 `handlers.test.ts` 行为移入 `fetch-content.test.ts`。
3. 将超时/中止和相关结构化错误移入 `fetch-content.test.ts`。
4. 等效工具级覆盖存在后删除旧版或纯内部辅助函数矩阵测试。

验证：

```bash
pnpm test:unit
```

### 第 5 阶段 — Provider 契约整合

1. 在 `tests/web/providers.test.ts` 内或本地 fixture 部分创建共享测试辅助函数。
2. 将 provider 特定文件转换为 provider 契约部分：
   - metadata/registry/selection
   - ddgs
   - brave
   - openserp
   - searxng
   - serper
   - tavily
3. 确认 parity 后删除 `tests/web/providers/` 目录。
4. 更新 `package.json` 测试 glob。

验证：

```bash
pnpm test:unit
```

### 第 6 阶段 — 内部基础设施剪枝

1. 确保用户配置的 fetch/provider 行为仍覆盖重要的失败和计数器后，减少或删除 `http-pool` 直接测试。
2. 如尚未完成则将 `concurrency` 和 `abort` 断言移到工具边界测试。
3. 审查 `shared/path-handling.test.ts` 的项目特定价值；减少通用 Node 行为断言。

验证：

```bash
pnpm test:unit
pnpm typecheck
pnpm lint
```

### 第 7 阶段 — 文档和脚本同步

1. 更新 `docs/guides/testing.md` 和中文对应版本（如需要）。
2. 更新 `package.json` `test:unit` glob 为最终结构。
3. 考虑后续添加测试 typecheck/lint 路径，因为 `tsconfig.json` 当前排除 `tests`。
4. 运行：

```bash
pnpm test
pnpm docs:check
```

## 主要风险和缓解措施

- **Provider 整合丢失供应商特定规范化覆盖。** 使用 provider 契约表加每个后端一个 provider 特定 fixture 来缓解。
- **Fetch/内容整合丢失支持的内容类型保证。** 在 `fetch-content.test.ts` 中使用显式支持/不支持内容类型矩阵来缓解。
- **删除内部基础设施测试隐藏池化/节流回归。** 通过 search/fetch 测试保留用户可见的超时、队列和配置行为来缓解。
- **移动命令测试丢失格式化器契约。** 每个命令输出一个文本和一个 JSON 断言来缓解。
- **删除目录后测试脚本漂移。** 在文件移动的同一阶段更新 `package.json` glob 来缓解。
- **文档漂移。** 确认最终结构后更新 `docs/guides/testing.md` 来缓解。