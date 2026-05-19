---
status: proposed
audience: maintainer
last_verified: 2026-05-19
language: chinese
---

# 基于 Node 原生 V8 Coverage 的轻量可见性实施方案

> 目标：在不引入 c8/nyc/istanbul 等额外工具链的前提下，为 `devkit-pi` 建立“可持续观察热点覆盖率”的最小工程化闭环，并与现有 `pnpm test` / CI 流程兼容。

## 1. 背景与动机

审计文档 `internal-docs/audit/code-quality-audit-2026-05-13.md` 中 `ENG-002` 已进入 In Progress：已完成可见性接入，当前处于基线观察期。

当前项目已有：

- `pnpm typecheck` / `pnpm lint` / `pnpm test` 稳定门禁；
- 按模块镜像的测试结构（`tests/web`、`tests/convert`、`tests/subagents`、`tests/lsp`、`tests/shared`）；
- Node 版本下限较新（`engines.node >=22.19.0`），可直接使用原生 V8 coverage 能力。

因此本方案选择：

- **只使用 Node 原生能力**（`NODE_V8_COVERAGE` + `node --test`）；
- 通过项目内小脚本做“热点可读摘要”；
- CI 先产出报告与 artifact，不做硬失败阈值。

---

## 2. 设计目标与非目标

## 2.1 目标（Do）

1. 本地可一键生成 coverage 原始数据与可读摘要。
2. CI 可上传 coverage artifact，支持审计与回溯。
3. 报告聚焦 `src/`，并提供“热点模块覆盖率排名”。
4. 第一阶段不因“覆盖率数值低”阻断 PR；但测试失败或 coverage 脚本执行失败仍阻断 PR。

## 2.2 非目标（Don’t）

1. 不接入 c8/nyc/jest/vitest 覆盖率体系。
2. 不在第一阶段引入全局/模块最低阈值硬门禁。
3. 不改造现有测试组织与执行模型。

---

## 3. 总体方案

采用“三层产物”模型：

1. **原始层（Raw）**：V8 JSON（`NODE_V8_COVERAGE` 输出目录）。
2. **汇总层（Summary）**：项目脚本生成 JSON summary（按文件/目录聚合）。
3. **可读层（Hotspots）**：Markdown/TXT 摘要（低覆盖文件 TopN、关键模块覆盖概览）。

目录建议：

```text
.coverage/
├─ v8/                     # 原始 V8 JSON（每进程一个）
├─ summary.json            # 聚合后的机器可读摘要
└─ hotspots.md             # 人类可读热点报告
```

> 说明：`.coverage/` 应加入 `.gitignore`；CI 通过 artifact 保留，不入库。

---

## 4. 详细实施步骤

## 4.1 第一步：新增 coverage 脚本（package.json）

在现有 scripts 基础上新增：

- `test:coverage:raw`：清理旧目录，运行 Node test 并输出 V8 raw。
- `coverage:report`：读取 raw，生成 `summary.json` + `hotspots.md`。
- `test:coverage`：串联 `test:coverage:raw` 与 `coverage:report`。

建议脚本（示意）：

```json
{
  "scripts": {
    "test:coverage:raw": "node scripts/run-v8-coverage.mjs",
    "coverage:report": "node scripts/report-v8-coverage.mjs",
    "test:coverage": "pnpm test:coverage:raw && pnpm coverage:report"
  }
}
```

> 备注：不直接在 package.json 内写跨平台复杂 shell（如 `rm -rf` + env 前缀），统一下沉到 Node 脚本，避免 Windows/Linux 差异。

---

## 4.2 第二步：新增运行脚本 `scripts/run-v8-coverage.mjs`

职责：

1. 删除并重建 `.coverage/v8`；
2. 以子进程方式执行现有 `pnpm test:unit` 等价命令；
3. 注入环境变量 `NODE_V8_COVERAGE=.coverage/v8`；
4. 保留原始退出码（测试失败时直接失败）。

关键点：

- 不改变测试命令参数，确保行为与 `pnpm test` 一致；
- stdout/stderr 透传，便于 CI 定位失败。

---

## 4.3 第三步：新增聚合脚本 `scripts/report-v8-coverage.mjs`

职责：

1. 读取 `.coverage/v8/*.json`；
2. 只统计 `src/**/*.ts`（排除 `tests/`、`docs/`、`node_modules/`），并以该集合为 coverage 全集；
3. 对 raw 中缺失的 `src` 文件按 0% 计入；
4. 基于 V8 range 计算每文件 line/function 覆盖比（近似指标，用于趋势观察，不等价于 statement/branch coverage）；
5. 输出：
   - `.coverage/summary.json`（机器可读）；
   - `.coverage/hotspots.md`（维护者可读）。

建议输出字段（summary）：

```json
{
  "generatedAt": "ISO-8601",
  "nodeVersion": "v24.x",
  "command": "pnpm test:coverage",
  "totals": {
    "files": 0,
    "coveredFiles": 0,
    "uncoveredFiles": 0,
    "linePct": 0,
    "functionPct": 0
  },
  "byModule": {
    "web": { "linePct": 0, "files": 0 },
    "convert": { "linePct": 0, "files": 0 },
    "subagents": { "linePct": 0, "files": 0 },
    "lsp": { "linePct": 0, "files": 0 },
    "shared": { "linePct": 0, "files": 0 },
    "other": { "linePct": 0, "files": 0 }
  },
  "unknownFiles": 0,
  "lowestFiles": [
    { "path": "src/...", "linePct": 0, "functionPct": 0 }
  ]
}
```

`hotspots.md` 建议内容：

- 总览（总覆盖率、统计文件数）；
- 模块排名（web/convert/subagents/lsp/shared/other）；
- 低覆盖文件 Top 10；
- “建议补测方向”（固定模板）。

---

## 4.4 第四步：CI 集成（仅可见性，不设硬门禁）

修改 `.github/workflows/ci.yml`：

1. 在 `Run tests` 后新增：
   - `Run V8 coverage`：`pnpm test:coverage`；
2. 新增 artifact 上传步骤：
   - 上传 `.coverage/summary.json`、`.coverage/hotspots.md`、`.coverage/v8/**`。

建议 artifact 名称：`v8-coverage-${{ github.sha }}`。

注意：

- 该步骤第一阶段建议 `continue-on-error: false`（测试或脚本失败应阻断）；
- 第一阶段“不阻断 PR”的含义是“不因 coverage 数值低而阻断”；
- 不增加“coverage 低于阈值则失败”逻辑；
- 初期可接受 CI 双跑（`pnpm test` + `pnpm test:coverage`）以降低改动风险，后续可按时长观测改为 nightly 覆盖率任务或单跑覆盖率任务。

---

## 4.5 第五步：文档同步

至少更新：

1. `internal-docs/maintain/testing.md`：新增“如何本地生成 coverage 报告”。
2. `internal-docs/audit/code-quality-audit-2026-05-13.md`：将 `ENG-002` 从 Open 更新为“进行中/已建立可见性基线”（按实际进度）。
3. 如有需要，补充 `docs/zh/guides/testing.md` 或对应维护路径中的说明。

---

## 5. 热点观察策略（落地后 1~2 周）

优先关注模块：

- `src/modules/web/*`
- `src/modules/convert/*`
- `src/modules/subagents/*`
- `src/modules/lsp/*`
- `src/shared/external-command.ts`

观察维度：

1. 每周生成一次 baseline（可在主分支 nightly 或合并后触发）；
2. 记录低覆盖 Top10 是否长期不变；
3. 判断是否存在“关键安全路径低覆盖”现象（web/network/security、convert/security、subagent/execution）。

---

## 6. 风险与缓解

## 6.1 风险

1. V8 raw 数据体积偏大，CI artifact 膨胀；
2. 不同 Node minor 可能导致覆盖率细节波动；
3. `--experimental-strip-types` + V8 range 映射会引入一定行级近似误差；
4. 自研聚合脚本若实现不严谨，会造成数字偏差。

## 6.2 缓解

1. artifact 保留期限设短（例如 7~14 天）；
2. CI Node 版本固定（当前已固定 24），避免跨版本抖动；
3. 在 `report-v8-coverage.mjs` 中保留校验：
   - 输入文件为空时显式报错；
   - 路径不在 workspace 时忽略并计数；
   - raw 不包含的 `src` 文件按 0% 计入；
   - 输出中包含 `unknownFiles` 统计辅助排障。

---

## 7. 分阶段门禁升级（可选）

Phase A（当前建议）：

- 仅产出报告 + artifact；
- 不设阈值。

Phase B（稳定后）：

- 对关键模块引入软阈值提醒（如 line < 60% 仅警告）。

Phase C（成熟后）：

- 再考虑硬阈值（例如仅对 `web/network/security`、`convert/security` 等关键路径）。

---

## 8. 任务拆解清单（执行用）

1. [x] 新增 `scripts/run-v8-coverage.mjs`。
2. [x] 新增 `scripts/report-v8-coverage.mjs`。
3. [x] 更新 `package.json` scripts（`test:coverage:*`）。
4. [x] 更新 `.gitignore`（忽略 `.coverage/`）。
5. [x] 更新 `.github/workflows/ci.yml`（coverage 步骤 + artifact，初期双跑策略）。
6. [x] 本地验证：
   - [x] `pnpm test:coverage`
   - [x] 检查 `.coverage/summary.json` 与 `hotspots.md`。
7. [ ] CI 验证：PR 中确认 artifact 可下载、内容完整。
8. [x] 文档同步：`internal-docs/maintain/testing.md` + 审计文档 `ENG-002` 状态更新。

---

## 9. 完成定义（DoD）

满足以下条件即视为“完成可见性接入”：

1. 本地可稳定执行 `pnpm test:coverage` 并生成三层产物；
2. CI 可上传 coverage artifact；
3. `hotspots.md` 至少包含总览、模块排名、低覆盖 TopN，并记录 `nodeVersion` 与生成命令；
4. 文档已同步，团队可按文档复现；
5. 不引入额外第三方 coverage 工具链。

---

## 10. 与审计问题映射

- 对应问题：`ENG-002 覆盖率门禁缺失`。
- 本方案完成后建议状态：
  - 先由 `Open` → `In Progress`（接入与观察期）；
  - 观察稳定后再评估是否 `Closed`（若团队将“有可见性但无阈值”视为已满足目标，可直接 Closed，并在“下一步动作”注明后续门禁升级选项）。

---

## 11. 下一步建议

按最小可交付顺序推进：

1. 先落地脚本与本地报告（不改 CI）；
2. 本地输出稳定后再接 CI artifact；
3. 连续观察 1~2 周热点，再决定是否进入软阈值提醒。