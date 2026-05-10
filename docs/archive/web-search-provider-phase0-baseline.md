---
status: current
audience: maintainer
last_verified: 2026-05-09
---

# Web Search Provider 迁移 Phase 0 基线报告

对应计划：[`docs/archive/web-tool-enhancement-plan.md`](./web-tool-enhancement-plan.md)

本报告用于锁定迁移前（brave-only）的行为基线、回归命令与主要风险。

---

## 1) 基线行为（当前）

- `web_search` 仅支持 `provider: "brave"`
- 缺少 query 输入：`INVALID_INPUT`
- 缺少 `BRAVE_SEARCH_API_KEY`：`WEB_SEARCH_AUTH_REQUIRED`
- provider 429：`WEB_SEARCH_RATE_LIMIT`
- timeout/abort：`SUBAGENT_TIMEOUT`
- `includeContent` 并发上限：3
- `responseId` 可被 `get_search_content` 回读

新增基线断言：

- `test/unit/web-search.test.ts`
  - `rejects unsupported provider values at runtime`

---

## 2) 回归命令（Phase 0 锁定）

按顺序执行：

```bash
pnpm test:unit
pnpm test:mvp
pnpm lint
pnpm typecheck
pnpm docs:check
```

执行结果（2026-05-09）：全部通过。

---

## 3) 风险清单（简版）

1. **行为漂移风险**
   - 描述：引入 provider 抽象后，现有 brave 路径可能出现兼容偏差。
   - 控制：Phase A 保持外部行为不变；优先复用现有错误分类逻辑。

2. **错误码不一致风险**
   - 描述：多 provider 后错误映射不统一，导致调用方处理复杂化。
   - 控制：在 `web_search` 上层统一分类并对齐现有错误码。

3. **auto 降级可观测性不足**
   - 描述：provider 自动切换后问题定位困难。
   - 控制：保留 `webTools.debug` 日志，记录 provider 选择轨迹。

4. **开放 provider 稳定性风险**
   - 描述：无 key provider（如 ddgs/open endpoints）可用性波动较大。
   - 控制：显式 provider 模式不自动降级；auto 模式严格按优先级回退。

---

## 4) Phase 0 完成判定

- [x] 锁定 brave-only 行为基线
- [x] 记录关键回归命令
- [x] 补齐关键 web_search 断言（unsupported provider runtime）
- [x] 五项命令全通过
