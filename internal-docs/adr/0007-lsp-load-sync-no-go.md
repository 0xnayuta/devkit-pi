---
status: accepted
audience: maintainer
last_verified: 2026-05-18
language: chinese
---

# ADR 0007: LSP load/sync 实现迁移 NO-GO（当前阶段）

## 状态

Accepted

## 背景

在 LSP core 拆分的 Phase 5 中，我们已经完成以下工作：

- diagnostics 聚合从 `core.ts` 提取到 `diagnostics.ts`
- readonly 请求编排提取到 `actions.ts`
- mutating 请求编排提取到 `edits.ts`
- 新增 `request-orchestrator.ts`，并完成 diagnostics / readonly / mutating 路径的调用入口收口

也就是说，调用面已经统一：上层请求路径不再直接散落调用 `loadFile` 与 `openOrUpdate`，而是经由 orchestrator 进入。

但 `loadFile` / `openOrUpdate` 的具体实现仍在 `core.ts`。团队需要判断：是否在本轮继续把这两部分实现下沉到独立模块。

## 决策

当前阶段给出 **NO-GO**：

- 暂不下沉 `loadFile` / `openOrUpdate` 的实现
- 保持“调用面统一、实现暂留 core”的边界

具体边界如下：

- 调用入口：统一通过 `request-orchestrator.ts`
- 具体实现：继续保留在 `core.ts`
- diagnostics 当前只收口 sync 调用面：单文件 / workspace diagnostics 仍在 `core.ts` 保留 prepare/load 状态处理，以维持 file-not-found、read-error、unsupported、timeout 等细粒度结果语义；后续若要完全统一 prepare/load，需要先引入可表达这些状态的 typed prepare result。

## 决策理由

1. **时序敏感风险高**
   `loadFile` / `openOrUpdate` 涉及 `didOpen` / `didChange` / `didSave` 的时序、`openFiles` version 与 LRU 驱逐，以及 server-specific 触发路径，属于高回归风险区域。

2. **当前收益已经兑现**
   调用入口收口后，编排层一致性和可维护性已显著提升。继续下沉实现的边际收益，短期内不足以覆盖回归风险。

3. **测试形态仍以集成为主**
   现有测试能覆盖主要行为，但对时序细节的白盒契约仍不够充分。此时推进实现迁移，风险不可控。

## 影响

- 优点
  - 保持现有稳定性，避免在高敏时序路径引入不必要波动
  - 维持明确边界：上层统一经 orchestrator，后续仍可渐进迁移
  - 避免后续迭代反复讨论同一决策

- 代价
  - `core.ts` 仍承担部分底层 file sync / lifecycle 细节
  - “实现完全下沉”目标延后

## 复审条件

仅在满足以下条件后，才重开实现下沉决策：

1. 为 `loadFile` / `openOrUpdate` 增补明确的白盒时序契约测试
2. 制定可回滚的最小迁移切片（slice）
3. 每个切片都通过以下门禁：
   - `pnpm typecheck`
   - `pnpm lint`
   - `pnpm test`

满足上述条件后，可在“不改行为”的前提下，按最小步迁移实现。