---
status: proposed
audience: maintainer
last_verified: 2026-05-19
language: chinese
---

# DNS Pinning 推进计划（基于仓库现状校正）

> 目标：把 `validatePublicHttpUrl` 的 DNS 校验结果延续到真实连接阶段，降低 DNS rebinding / TOCTOU 风险。

## 0. 现状核对（本次修正依据）

### 0.1 package / runtime 约束

- Node: `>=22.6.0`（`package.json`）
- TS: `strict: true` + `moduleResolution: NodeNext`（`tsconfig.json`）
- 当前 runtime 依赖已包含 `undici`（用于 dispatcher pinning）
- `web` 请求执行层已接入 `fetchWithPinnedDns()`
- `convert` 下载路径已接入 `fetchWithPinnedDns()`

### 0.2 测试现状（会直接影响实施方式）

- `tests/web/fetch-content.test.ts` 主要通过覆写 `globalThis.fetch` 做 mock。
- `tests/convert/tool.test.ts` 使用 `mock.method(globalThis, "fetch", ...)`。
- `tests/web/security.test.ts` 对部分域名使用真实 DNS（`example.com`）。

**结论**：
1. 若引入独立 HTTP 客户端且绕开 `globalThis.fetch`，现有测试体系会大面积失效；
2. 需要保留“可注入 fetch/lookup”的 seam，避免 pinning 实现不可测；
3. 不宜直接大改 `http-pool.ts`（当前 `agent` 对 fetch 语义不稳定，且池化与安全 pinning 职责不同）。

---

## 1. 设计决策（最终建议）

## 1.1 先做小范围 spike，再确定实现分支

在正式改代码前做一个最小 spike（单文件实验 + 临时测试）：

- 验证在当前 Node 版本下，`fetch` + 可控连接解析（lookup/dispatcher）是否可稳定工作；
- 验证 TypeScript 类型是否可通过（是否需要新增 `undici` 依赖与类型支持）；
- 验证能否在测试中稳定 mock（不破坏现有 `globalThis.fetch` mock 模式）。

### 通过标准

- 能证明“连接使用的地址只能来自已校验集合”；
- redirect 场景可逐跳重校验；
- TS/lint/test 不引入大面积噪音。

---

## 1.2 实现策略（推荐）

采用“**网络安全层 + 请求执行层分离**”并保持现有模块边界：

```text
src/modules/web/
├─ security.ts              # 保留协议/hostname/IP 分类与校验规则
├─ network.ts               # 新增：resolve + pinning 执行封装（web/convert 共用）
└─ fetch.ts                 # 改为调用 network.ts

src/modules/convert/
└─ security.ts              # URL 下载改为调用 web/network.ts
```

> 不新增 `src/modules/web/network/` 子目录，先用单文件 `network.ts`，与当前项目“轻量核心、渐进增强”一致；后续复杂度上升再拆分。

---

## 1.3 Pinning 语义（必须明确）

1. 请求 URL 保持原 hostname（不改写为 IP）。
2. 每次真实请求前：`resolve -> validate -> pin`。
3. redirect 使用 `manual`，每一跳都重新执行第 2 步。
4. `allowPrivateNetwork=true` 仅放开“私网阻断”，**不放开 pinning**。
5. Jina fallback 请求同样走 pinning 执行层。

---

## 2. 具体改造清单（代码级）

## 2.1 新增 `src/modules/web/network.ts`

建议接口：

```ts
export interface DnsResolvedAddress {
  address: string;
  family: 4 | 6;
}

export interface PinnedRequestOptions extends RequestInit {
  timeoutMs: number;
  allowPrivateNetwork: boolean;
  signal?: AbortSignal;
}

export async function resolveAndValidateAddresses(
  url: URL,
  options: { allowPrivateNetwork: boolean }
): Promise<DnsResolvedAddress[]>;

export async function fetchWithPinnedDns(
  url: string | URL,
  options: PinnedRequestOptions
): Promise<Response>;
```

实现要点：

- 复用 `security.ts` 中已有私网判断逻辑，避免规则漂移；
- 内部支持依赖注入（仅供测试）：
  - `fetchImpl`（默认 `globalThis.fetch`）
  - `lookupImpl`（默认 `dns.lookup`）
- 连接复用策略：
  - 第一版优先“安全正确”，采用 per-request/per-hop 隔离，不做跨请求 socket 复用；
  - 后续再评估 `origin + pinned-set-hash` 级别池化。

---

## 2.2 修改 `src/modules/web/fetch.ts`

- `fetchWithRedirects()` 中将 `pooledFetch()` 替换为 `fetchWithPinnedDns()`。
- 保持 `redirect: "manual"`。
- redirect 分支维持 `validatePublicHttpUrl()`，并在下一跳再次 `fetchWithPinnedDns()`。
- `fetchFromJinaReader()` 改走同一路径。

---

## 2.3 修改 `src/modules/convert/security.ts`

- `downloadUrlToTempFile()` 的下载请求改用 `fetchWithPinnedDns()`。
- redirect、timeout、size-limit、错误映射逻辑保持现有行为。
- 不改变 `ConvertProviderError` 代码集合，先复用现有 `NETWORK_ERROR` / `PRIVATE_NETWORK_BLOCKED` / `CONVERT_TIMEOUT`。

---

## 2.4 `http-pool.ts` 处理

- 本轮不做 pinning 接入，避免“池化策略”和“连接安全策略”混改。
- 后续可评估：
  - 要么收敛为纯性能组件；
  - 要么在完成 pinning 稳定后重构为可证明安全的 pooled transport。

---

## 3. 测试改造计划（按现有 mock 方式落地）

## 3.1 新增/扩展测试文件

1. `tests/web/security.test.ts`
   - 补“域名解析返回私网地址即拒绝”用例（通过注入/mock lookup，避免依赖真实 DNS）。

2. `tests/web/fetch-content.test.ts`
   - 补“redirect 每跳重校验 + 重 pin”用例；
   - 补“Jina fallback 也走 pinning”用例。

3. `tests/convert/tool.test.ts`
   - 补“下载链路走 pinning”回归（含 redirect/private/timeout）。

4. 新增 `tests/web/network.test.ts`（推荐）
   - 专测 `resolveAndValidateAddresses` / `fetchWithPinnedDns`；
   - 覆盖 allowPrivateNetwork true/false、IPv4/IPv6、空解析结果、lookup 异常。

## 3.2 测试技术策略

- 延续现有 `node:test` + `mock.method`；
- 对 DNS 行为使用注入 `lookupImpl`，不依赖公网 DNS 稳定性；
- 保留少量真实 DNS happy-path（现有 `example.com`）即可，不新增对公网环境敏感的测试。

---

## 4. 依赖与类型策略

## 4.1 默认策略

优先尝试“不新增依赖”路径；若无法稳定控制连接阶段 DNS，再进入可选分支：

- 增加轻量依赖 `undici`（仅用于 dispatcher/connector 控制）；
- 同步更新：`package.json`、相关测试、文档（安全模型 + 安装要求）。

## 4.2 决策门槛

只有满足以下任一条件才引入新依赖：

1. 现有 Node fetch 路径无法证明连接阶段 pinning 生效；
2. 不加依赖会导致实现高度 hacky、不可测试或不可维护。

---

## 5. 文档更新清单（实现完成后）

- `docs/guides/security-model.md`
- `docs/zh/guides/security-model.md`
- `docs/reference/web-tools.md`
- `docs/zh/reference/web-tools.md`
- `docs/reference/convert-tools.md`
- `docs/zh/reference/convert-tools.md`

文档表述从“仅文档化限制”升级为“已实现连接阶段一致性（含边界说明）”。

---

## 6. 执行顺序（最终版）

1. [x] Spike：验证可控连接解析方案（含 TS 类型与 mock 可行性）。
2. [x] 新增 `src/modules/web/network.ts`（含注入 seam）。
3. [x] `web/fetch.ts` 接入（含 Jina）。
4. [x] `convert/security.ts` 接入。
5. [x] 补 `tests/web/network.test.ts` 与相关回归测试。
6. [ ] 跑验证：
   - [ ] `pnpm typecheck`（当前仓库存在既有非本改动错误：`src/modules/convert/tool.ts` 的 `localFile.stat` 可空告警）
   - [ ] `pnpm lint`
   - [x] 定向测试：`tests/web/network.test.ts`、`tests/web/fetch-content.test.ts`、`tests/convert/tool.test.ts`
   - [ ] `pnpm docs:check`
7. [ ] 更新安全与 reference 文档。

---

## 7. 风险与回滚

- 风险：连接层改造可能影响现有 timeout/abort 行为与测试稳定性。
- 缓解：
  - 先在 `network.ts` 做最小封装，避免大规模改动；
  - 保留旧路径快速回滚开关（临时分支内）；
  - 若 spike 失败，退回“文档化限制 + 更强监控”并重新评估依赖方案。

---

## 8. DoD（完成定义）

- [x] web/convert 的 URL 请求都经过同一 pinning 执行层；
- [x] redirect 每跳重校验与重 pin；
- [x] `allowPrivateNetwork` 语义清晰且有测试；
- [x] 测试不依赖不稳定公网条件（除既有少量 happy-path）；
- [x] 文档与实现边界一致。

---

## 9. Spike 技术结论记录（2026-05-19）

> 目标：验证“在当前仓库约束下，是否能真正把 DNS 校验结果绑定到连接阶段”。

### 9.1 试验环境

- Node 运行时：`v24.15.0`（本地 spike 环境）
- 项目声明下限：`>=22.6.0`
- 当前依赖：未安装 `undici` 包

### 9.2 执行的关键验证

1. **验证是否可直接引入 undici 包**

```bash
node -e "try { require('undici') } catch (e) { console.log(e.code) }"
```

结果：`MODULE_NOT_FOUND`

结论：仓库当前不能直接 `import/require('undici')`；若要使用 Undici Agent/Pool API，需显式新增依赖。

2. **验证 `fetch(..., { agent })` 能否控制连接 lookup**

- 构造 `http.Agent({ lookup })`，在 `lookup` 中打点；
- 使用 `fetch(http://localhost:port, { agent })` 请求本地 server。

结果：请求成功，但 `lookup` 未触发。

结论：在当前运行时下，`agent` 选项不足以作为“连接阶段 DNS pinning”方案依据（至少对本路径不可证明生效）。

3. **验证 `fetch(..., { dispatcher })` 是否被运行时采纳**

- 传入自定义 `dispatcher`（实现 `dispatch` 并主动抛错）；
- 观察 `dispatch` 是否被调用。

结果：`dispatch` 被调用，`fetch failed` 且 cause 为自定义错误。

结论：当前 Node fetch 路径支持 `dispatcher` seam，可作为连接阶段控制入口。

### 9.3 技术判断

综合以上结果：

- 仅靠现有 `http-pool.ts` 的 `agent` 方案，无法证明 DNS pinning 生效；
- `dispatcher` 是可行控制点，但要工程化落地，需要稳定的 dispatcher 实现（建议基于 `undici` 公共 API，而非内部符号或 hack）；
- 因项目当前未安装 `undici`，要进入可维护实现，**建议新增轻量依赖 `undici`**。

### 9.4 方案决策（更新）

将原计划中的“优先不新增依赖”调整为：

1. **主路径**：新增 `undici` 依赖，基于其 Agent/dispatcher 能力实现 `fetchWithPinnedDns`；
2. `web` 与 `convert` 统一接入该执行层；
3. 保留 `fetchImpl/lookupImpl` 注入 seam，兼容现有测试 mock 风格；
4. `http-pool.ts` 暂不承接 pinning，避免职责混杂。

### 9.5 对后续实施的直接影响

- 需要更新 `package.json`（dependencies）并补依赖说明；
- 需要新增 `tests/web/network.test.ts`，并为 web/convert 各补至少 1 个“连接阶段一致性”回归用例；
- 文档更新时应把“连接阶段 pinning 已实现”限定为“本工具发起的 HTTP(S) 请求路径”。

### 9.6 风险备注

- Node 22 与 Node 24 在 fetch/undici 细节上可能存在行为差异；
- 实施后需在项目声明下限（Node 22.6+）上至少跑一次完整 CI 验证。

---

## 10. 实施进展记录（2026-05-19）

### 10.1 已落地代码

- 依赖：`package.json` 新增 `undici`。
- 网络层：新增 `src/modules/web/network.ts`，包含：
  - `resolveAndValidateAddresses`
  - `createPinnedLookup`
  - `createPinnedDispatcher`（基于 `undici.Agent` + `connect.lookup`）
  - `fetchWithPinnedDns`
- Web 接入：`src/modules/web/fetch.ts`
  - `fetchWithRedirects()` 改为 `fetchWithPinnedDns()`
  - `fetchFromJinaReader()` 改为 `fetchWithPinnedDns()`
- Convert 接入：`src/modules/convert/security.ts`
  - `downloadUrlToTempFile()` 请求改为 `fetchWithPinnedDns()`

### 10.2 已补测试

- 新增：`tests/web/network.test.ts`
  - 覆盖 resolve 行为、dispatcher 注入、默认 dispatcher、pinned lookup hostname mismatch。
- 更新：`tests/web/fetch-content.test.ts`
  - 新增 redirect 回归：`follows redirects manually and fetches the final URL content`。
- 更新：`tests/convert/tool.test.ts`
  - 新增 redirect 回归：`follows manual redirects and converts the final downloaded file`。

### 10.3 已验证结果

已通过定向测试：

```text
node --experimental-strip-types --test tests/web/network.test.ts
node --experimental-strip-types --test tests/web/network.test.ts tests/web/fetch-content.test.ts
node --experimental-strip-types --test tests/convert/tool.test.ts tests/web/network.test.ts
node --experimental-strip-types --test tests/web/network.test.ts tests/web/fetch-content.test.ts tests/convert/tool.test.ts
```

结果：均通过（最近一次合并执行：40 passed / 0 failed）。

### 10.4 待完成事项

1. 在处理/隔离既有 typecheck 旧问题后，补跑 `pnpm typecheck`。

### 10.5 lint 结果回填（2026-05-19）

第一次执行：

```bash
pnpm lint
```

结果：❌ 未通过（Biome check 失败，exit code 1）。

处置过程：

1. 格式化本次新增文件：

```bash
pnpm exec biome format --write src/modules/web/network.ts
```

2. 复跑 lint 仍失败（剩余既有 `src/modules/lsp/*` 格式问题）。

3. 按“仅处理 lint 报出 lsp 文件”的范围格式化：

```bash
pnpm exec biome format --write src/modules/lsp/*.ts
pnpm lint
```

最终结果：✅ lint 已通过。

```text
$ biome check src
Checked 88 files in 104ms. No fixes applied.
```

结论：

- 当前 lint 门禁已恢复通过；
- 本轮格式调整包含 `src/modules/web/network.ts` 与当前报错的 `src/modules/lsp/*.ts`。

### 10.6 文档同步记录（2026-05-19）

已完成 DNS pinning 实现后的中英文文档同步，更新如下：

- `docs/guides/security-model.md`
- `docs/zh/guides/security-model.md`
- `docs/reference/web-tools.md`
- `docs/zh/reference/web-tools.md`
- `docs/reference/convert-tools.md`
- `docs/zh/reference/convert-tools.md`

同步内容要点：

- 将“等待后续 connection-stage pinning 设计/实现”的旧表述替换为“已实现 connection-stage DNS pinning”；
- 明确 redirect 每跳 revalidate + repin；
- 明确 `allowPrivateNetwork=true` 仅放宽拦截策略，不绕过 pinned-connection 请求路径；
- 保留边界声明（非对所有上游网络攻击的形式化保证）。

文档校验：

```bash
pnpm docs:check
```

结果：✅ 通过。

