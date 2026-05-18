---
status: implemented
audience: maintainer
last_verified: 2026-05-13
language: chinese
---

# `/toolkit` 直接 console 输出破坏 TUI 界面

> **状态**：本文档记录改造计划，代码实现已完成（见各改动文件的 git log）。本文档保留作为历史参考和背景说明。

## 摘要

在 pi 交互式 TUI 中执行 `/toolkit` 或 `/toolkit help` 等命令后，命令输出会直接覆盖输入框、边框、项目路径和 footer 区域，造成界面错位或残留文本。

典型现象：

```text
/too ... devkit-pi toolkit command────
= toolkit     [u] devkit-pi command center: doctor/modules/logs/agents/lsp/activity
Usage:s/devkit-pi (main)
  /toolkit doctor     Run unified diagnostics checks
  ...
```

其中：

- `devkit-pi toolkit command` 来自 `/toolkit` help 输出第一行。
- `Usage:` 来自 help 输出第三行。
- `Usage:s/devkit-pi (main)` 表明新输出覆盖了原本的项目路径/footer 文本，但未清理旧内容。

## 影响范围

主要影响交互式 TUI 环境中的 `/toolkit` 命令：

- `/toolkit`
- `/toolkit help`
- `/toolkit doctor`
- `/toolkit modules`
- `/toolkit logs`
- `/toolkit agents`
- `/toolkit lsp`

`/toolkit activity` 已使用 `ctx.ui.custom()` 打开自定义 TUI 面板，当前不属于主要问题来源，但仍可能被其他直接 stdout/stderr 输出干扰。

## 初步原因

核心原因是 `/toolkit` 命令处理器直接使用 `console.log()` 输出多行报告，绕过了 pi 的 TUI 渲染系统。

相关文件：

```text
src/modules/commands/register.ts
```

当前主要输出路径包括：

```ts
console.log(output);
console.log(formatModulesOverview(config));
console.log(formatLogs(parseLogsOptions(rest)));
console.log(formatAgentList(report));
console.log(formatLspOverview(config));
console.log(formatHelp());
```

在 TUI 应用中，直接写 stdout/stderr 会从当前终端光标位置写入，不会经过 pi 的布局、清屏和重绘流程，因此会与输入框、命令补全、footer、cwd/git 状态等 UI 区域交错。

## 次要风险点

除 `/toolkit` 外，仓库中还存在其他直接 console 输出路径，后续也可能破坏 TUI：

### Web debug 日志

文件：

```text
src/modules/web/observability.ts
```

风险代码：

```ts
console.log(formatted);
```

当 `web.debug` 启用时，Web 工具执行期间可能直接向 stdout 写日志。

### 配置加载错误

文件：

```text
src/config/load-config.ts
```

风险代码：

```ts
console.error(`Failed to load devkit-pi config from '${configPath}':`, error);
```

扩展加载或重载期间如果配置解析失败，可能向 stderr 写入错误。

### LSP hook fallback

文件：

```text
src/modules/lsp/hook.ts
```

风险代码：

```ts
else console.error(report.notification);
```

该路径已有 `ctx.hasUI` 判断，正常 TUI 下风险较低，但仍属于直接 stderr fallback。

### Subagents disabled 日志

文件：

```text
src/modules/subagents/register.ts
```

风险代码：

```ts
console.log("Subagent extension is disabled in config");
```

如果子代理模块被禁用，注册阶段可能向 stdout 写入状态日志。

## 修复目标

1. 交互式 TUI 环境中，`/toolkit` 不再直接写 stdout/stderr。
2. `/toolkit` 的用户可见报告通过 pi TUI API 展示。
3. 保留非 TUI、非协议 stdout 场景下的可见输出能力，并避免污染 RPC/JSON stdout。
4. 保持现有 formatter 复用，减少改动范围。
5. 同步更新测试和用户文档，避免继续把 console 输出作为公开契约。

## 修复方案

### 方案概览

新增统一的只读报告展示 helper，例如：

```text
src/modules/commands/report-viewer.ts
```

建议导出接口：

```ts
async function showToolkitReport(
  ctx: ExtensionCommandContext,
  options: {
    title: string;
    content: string;
  }
): Promise<void>
```

对外可以保持 `Promise<void>`，但内部不要把 `ctx.ui.custom<void>()` 的 `undefined` 结果直接视为“用户已关闭面板”。建议使用类似 `ctx.ui.custom<"closed">(...)` 的哨兵值，只有返回 `"closed"` 才表示 TUI panel 已实际展示并正常关闭；返回 `undefined` 等情况应按 unsupported/degraded fallback 处理。

职责：

- 在交互式 TUI 中优先使用 `ctx.ui.custom()` 打开只读报告面板。
- 不要仅用 `ctx.hasUI === true` 判断是否可用 TUI panel：pi 的 RPC 模式下 `ctx.hasUI` 也可能为 true，但 `ctx.ui.custom()` 不支持或会退化返回。
- 实现应能识别 `ctx.ui.custom()` unsupported / degraded 的情况，例如内部使用非 `void` 哨兵返回值区分“用户关闭面板”和“custom UI 未实际显示”。
- 只有在确认 stdout 不是 TUI 绘制流、也不是 RPC/JSON 协议通道时，才允许 fallback 到 `console.log(content)`。
- RPC/JSON 协议模式不得输出裸文本到 stdout；应使用协议支持的 UI/响应机制，或暂时返回明确的 unsupported/fallback 提示。
- 集中处理滚动、关闭、宽度裁剪和空内容展示。

### TUI 面板交互

最小交互建议：

- `q` / `Esc`：关闭面板
- `ArrowDown` / `j`：向下滚动
- `ArrowUp` / `k`：向上滚动
- `PageDown` / `Ctrl+F`：向下翻页
- `PageUp` / `Ctrl+B`：向上翻页
- `Home`：跳到顶部
- `End`：跳到底部

底部提示示例：

```text
↑/↓ scroll · PgUp/PgDn page · q/Esc close
```

组件实现必须符合 pi TUI component contract：`render(width)` 返回 `string[]`，且每一行的可见宽度不得超过 `width`。长行应使用 `truncateToWidth()` 或等价逻辑裁剪/换行，滚动应基于已处理的行数组。快捷键匹配建议使用 `matchesKey()` / `Key`，避免手写不完整的 escape sequence 判断。

### Formatter 保持不变

短期内不改这些 formatter 的输出语义：

- `formatHelp()`
- `formatModulesOverview()`
- `formatLspOverview()`
- `formatDoctorReport()`
- `formatLogs()`
- `formatAgentList()`

它们只负责生成文本，问题根源是输出通道而不是文本格式。

## `/toolkit` 命令替换计划

在 `src/modules/commands/register.ts` 中，用 `showToolkitReport()` 替换所有 TUI 路径下的 `console.log()`。

### `/toolkit` / `/toolkit help`

当前：

```ts
console.log(formatHelp());
```

目标：

```ts
await showToolkitReport(ctx, {
  title: "Toolkit Help",
  content: formatHelp(),
});
```

### `/toolkit modules`

当前：

```ts
console.log(formatModulesOverview(config));
ctx.ui.notify("Module status printed to console", "info");
```

目标：

```ts
await showToolkitReport(ctx, {
  title: "Toolkit Modules",
  content: formatModulesOverview(config),
});
```

通知文案应避免继续使用 `printed to console`。

### `/toolkit logs`

当前：

```ts
console.log(formatLogs(parseLogsOptions(rest)));
ctx.ui.notify("Activity logs printed to console", "info");
```

目标：

```ts
await showToolkitReport(ctx, {
  title: "Toolkit Activity Logs",
  content: formatLogs(parseLogsOptions(rest)),
});
```

### `/toolkit agents`

当前：

```ts
const report = getAgentList(ctx.cwd);
console.log(formatAgentList(report));
ctx.ui.notify(`Found ${report.total} agents`, "info");
```

目标：

```ts
const report = getAgentList(ctx.cwd);
await showToolkitReport(ctx, {
  title: `Toolkit Agents (${report.total})`,
  content: formatAgentList(report),
});
```

### `/toolkit lsp`

当前：

```ts
console.log(formatLspOverview(config));
ctx.ui.notify("LSP module status printed to console", "info");
```

目标：

```ts
await showToolkitReport(ctx, {
  title: "Toolkit LSP",
  content: formatLspOverview(config),
});
```

### `/toolkit doctor`

当前：

```ts
const report = await runDoctorChecks(ctx.cwd, config);
const output = formatDoctorReport(report);
console.log(output);
ctx.ui.notify(
  `Doctor: ${report.summary.passed} passed, ${report.summary.warnings} warnings, ${report.summary.failed} failed`,
  "info"
);
```

目标：

```ts
const report = await runDoctorChecks(ctx.cwd, config);
const output = formatDoctorReport(report);
await showToolkitReport(ctx, {
  title: "Toolkit Doctor",
  content: output,
});
ctx.ui.notify(
  `Doctor: ${report.summary.passed} passed, ${report.summary.warnings} warnings, ${report.summary.failed} failed`,
  "info"
);
```

可选优化：doctor 开始前通知 `Running doctor checks...`，报告关闭后再显示 summary。

## 测试计划

### 命令注册行为

保持现有覆盖：

- `commands.enabled === true` 时注册 `/toolkit`。
- `commands.enabled === false` 时不注册。
- `PI_SUBAGENT_CHILD === "1"` 时不注册。

### `/toolkit` 输出行为

更新 `tests/commands/register.test.ts`：

- 不再 mock `console.log` 作为主要断言对象。
- mock `ctx.ui.custom`，捕获 `factory` 返回组件的 `render(width)` 输出。
- 断言 `/toolkit modules` 的面板内容包含：
  - `devkit-pi modules`
  - `convert:`
  - `lsp:`
- 断言 `/toolkit help` 的面板内容包含：
  - `Usage:`
  - `/toolkit doctor`
- 断言 `/toolkit lsp` 的面板内容包含：
  - `LSP module`
  - `tool.actions:`
- 断言 TUI 模式下不调用 `console.log`。

### Report viewer 单元测试

如果新增 `report-viewer.ts`，建议单独覆盖：

- 短文本正常渲染。
- 空内容显示占位或至少不崩溃。
- 长文本可滚动。
- `q` / `Esc` 调用 `done()` 关闭。
- `ArrowDown` / `ArrowUp` 更新 scroll offset。
- 小宽度下不抛异常。
- `ctx.hasUI === false` 且 stdout 确认不是协议通道时 fallback 到 stdout。
- `ctx.hasUI === true` 但 `ctx.ui.custom()` unsupported/degraded（例如 RPC 模式返回 `undefined`）时不会静默丢失报告，也不会输出裸文本污染 RPC stdout。

## 文档更新计划

修复代码时应同步更新：

```text
docs/reference/toolkit-commands.md
docs/zh/reference/toolkit-commands.md
```

需要替换或删除的旧表述：

- `output to console`
- `Console outputs ...`
- `printed to console`
- `Most subcommands print text reports via console.log()`

建议新表述：

- `open a read-only TUI report panel`
- `display report in TUI`
- `non-interactive, non-protocol stdout mode may print to stdout as fallback`
- `RPC/JSON mode must not emit raw report text to stdout`

## 实施顺序

### Step 1：修复 `/toolkit` 主问题 ✅ 已完成

目标：解决当前可复现的 TUI 污染。

内容：

1. 新增最小 `showToolkitReport()`。 ✅
2. 替换 `src/modules/commands/register.ts` 中 `/toolkit` 相关 `console.log()`。 ✅
3. 更新命令测试。 ✅
4. 更新中英文 `/toolkit` 命令参考文档。 ✅

### Step 2：增强报告面板体验 ✅ 已完成

目标：让报告查看更适合长内容。

内容：

1. 完善滚动快捷键。 ✅ 已支持 ↑↓/jk、PgUp/PgDn、Home/End、Ctrl+B/Ctrl+F
2. 加入标题、分隔线、底部帮助。 ✅ 边框标题行、header/footer 分隔线、状态栏、底部快捷键提示
3. 处理超窄宽度和超长行裁剪。 ✅ 宽度 ≤ 2 时退化渲染；`truncateToWidth()` 裁剪每行；`wrapTextWithAnsi()` 处理超长内容
4. 视觉增强：✅ 边框 box-drawing（┌─┐├─┤└─┘）、右对齐状态栏（当前行 / 总行数）、紧凑底部帮助文本

已新增内容：


- `statusLine(width, total, height)` — 右上角滚动位置状态栏（如 `  5 / 30`）
- `headerLine` / `footerLine` — body 上下分隔线
- 主体行末尾自动填充空白行（维持固定高度）
- 空内容时显示 `(empty report)` 占位符
- `dispose()` 方法（支持 `ctx.ui.custom()` 的 `dispose` 生命周期回调）
- 滚动时复用 `cachedBodyLines`，避免重复 `buildBodyLines()` 调用

### Step 3：治理其他 direct console 输出

目标：降低未来 TUI 污染风险。

内容：

1. 将 `webDebugLog()` 接入 activity log、diagnostics 或可配置 debug sink。
   → 推迟：需要更多架构设计，当前 debug log 已有 `web.debug` 配置 gate，在 TUI 环境中用户不会开启。
2. 将配置加载错误改为结构化诊断或延迟在 `/toolkit doctor` 中展示。 ✅ 已重构
   - `loadConfig()` 返回 `{ config, errors }` 而非直接 `console.error`
   - `registerExtension()` 在启动时统一打印 config load errors
3. 删除或改造 `Subagent extension is disabled in config` 的 stdout 日志。
   → 推迟：属于注册期一次性通知，影响有限，删除可能造成调试困难。
4. 复查 LSP hook fallback 的 stderr 路径。 ✅ 已修复
   - `collectDiagnostics()` 中移除 `else console.error(report.notification)`
   - 无 UI 时不再输出诊断通知到 stderr，避免破坏 TUI
5. 可选：增加测试或 lint 规则，避免交互式路径重新引入 direct console 输出。
   → 推迟：可作为后续 lint rules 工作的一部分

## 风险与注意事项

1. `ctx.ui.custom()` 是交互式、等待关闭的 UI。相比原来的 `console.log()` 后立即返回，命令生命周期会变长。
2. 通知可能遮挡报告面板，建议报告型命令减少通知，或在面板关闭后通知。
3. 非 TUI 环境仍需要输出 fallback，否则 `/toolkit` 在 print 场景下不可见；但 RPC/JSON 协议模式不能输出裸文本到 stdout，应使用协议支持的 UI/响应机制或明确 unsupported。
4. 初版 viewer 应尽量轻量，避免把修复 TUI 污染扩大成复杂 UI 重构。

## 验收标准

1. 在交互式 pi TUI 中执行 `/toolkit` 和各子命令，不再覆盖输入框、边框、cwd/git footer 或命令补全面板。 ✅
2. `/toolkit` 报告内容仍完整可读。 ✅
3. 长报告可滚动查看。 ✅ 快捷键：↑↓、PgUp/PgDn、Home、End
4. 非 TUI、非协议 stdout 场景仍可获得文本输出；RPC/JSON 协议场景不会被裸文本 stdout 污染。 ✅
5. 测试不再要求 `/toolkit` 在 TUI 路径使用 `console.log()`。 ✅
6. 文档不再将 console 输出描述为 `/toolkit` 的主要用户可见行为。 ✅
7. 超窄宽度（≤ 2）和超长行有适当降级处理。 ✅
8. 空内容报告有明确占位符显示。 ✅
