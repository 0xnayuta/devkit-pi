---
status: deprecated
audience: maintainer
last_verified: 2026-05-12
language: english
---

# Tests Simplification Plan

Status: phase 6 web infrastructure pruning completed  
Date: 2026-05-12

This plan started as the first-stage audit for simplifying `tests/`. Phase 2 consolidated low-risk subagent tests. Phase 3 consolidated low-risk web registration/schema/renderer and cache/storage tests. Phase 4 consolidated fetch/content extraction and handler tests. Phase 5 consolidated search provider tests into a single provider contract file. Phase 6 removed standalone internal web infrastructure tests and retained required timeout/concurrency/error coverage at tool or public-contract boundaries. Phase 6 also deleted `tests/shared/path-handling.test.ts` — its assertions tested generic Node.js `path` behavior rather than project-specific regressions (no `startsWith('/')` anti-pattern exists in the source), so per the plan's candidate-deletion criteria it was removed. The `tests/shared/` directory is now empty and was removed; `package.json` test globs were updated accordingly.

## Inputs reviewed

- `AGENTS.md`
- `package.json` test scripts
- `tsconfig.json`
- `docs/guides/testing.md`
- current `tests/` tree
- current `src/modules/`, `src/config/`, and `src/shared/` tree

## Current test execution/configuration notes

- `pnpm test` runs `pnpm test:unit`.
- `test:unit` currently uses explicit Node test globs:
  - `tests/subagents/*.test.ts`
  - `tests/commands/*.test.ts`
  - `tests/web/*.test.ts`
  - `tests/lsp/*.test.ts`
  - `tests/package-manifest.test.ts`
- `tsconfig.json` excludes `tests`, so test type-only import drift can escape `pnpm typecheck`.
- `lint` / `format` currently target `src` only, not `tests`.
- If tests are merged out of `tests/subagents/commands/` or `tests/web/providers/`, `package.json` test globs must be updated in the implementation phase.
- `docs/guides/testing.md` describes the current directory layout and must be updated when the final structure changes.

## Source module boundary snapshot

Current module boundaries under `src/modules/`:

```text
src/modules/
├─ commands/    # unified /toolkit registration
├─ lsp/         # lsp tool, schemas, hook/register/core
├─ subagents/   # agent discovery, execution/runtime, spawn, commands, schemas
└─ web/         # tools, fetch/search, providers, handlers, storage/cache, security, observability
```

Supporting boundaries:

```text
src/config/     # config loading/defaults/normalization
src/shared/     # shared public types/errors/path/session/delegation helpers
```

The target tests should continue to mirror these boundaries, but with fewer one-file-per-internal-helper tests.

## File-by-file coverage audit

| Test file | Current coverage | Keep / merge / delete guidance | Risk |
|---|---|---|---|
| `tests/package-manifest.test.ts` | Package manifest has direct `@earendil-works/*` runtime imports declared for CI installs. | Keep as root manifest/export/dependency contract test. | Low |
| `tests/shared/path-handling.test.ts` | Cross-platform `path.isAbsolute`, `path.join`, native separator behavior. | Deleted — no `startsWith('/')` anti-pattern in source; generic Node API behavior not project-specific. | Medium (done) |
| `tests/commands/register.test.ts` | Unified `/toolkit` command registration, disabled gate, child-process guard, overview output. | Keep as `tests/commands/register.test.ts`; user-visible command registration is required coverage. | Low |
| `tests/lsp/tool.test.ts` | LSP registration, hook event registration/disabling/mode, child-process isolation, disabled gates, `servers`, privileged action blocking, workspace boundary, workspace diagnostics cap, subagent readonly whitelist, action name exports. | Keep as `tests/lsp/tool.test.ts`; may internally group into registration/permissions/actions. Do not split further. | Low |
| `tests/subagents/agents.test.ts` | Built-in agent discovery, required metadata, safe tool lists, removed legacy built-ins absent. | Keep as `tests/subagents/agents.test.ts`; consider merging frontmatter discovery tests into it. | Low |
| `tests/subagents/frontmatter.test.ts` | Frontmatter parsing, project source assignment, removed frontmatter fields not parsed, user-agent discovery from `~/.pi/agent/agents`. | Merge into `tests/subagents/agents.test.ts` because it is agent definition/discovery behavior. Delete legacy-field-only assertions if they only preserve old removed structure, unless they are explicit regression guarantees from docs/ADR. | Medium |
| `tests/subagents/config.test.ts` | Global config defaults, web provider priority defaults, web provider validation, subagent LSP whitelist normalization, LSP hook config, invalid subagent field normalization, subagent error codes, `SubagentParams` schema excluding legacy params. | Keep but rename/scope if desired. It currently covers global config, web config, lsp config, and subagent schema in a subagent file. Prefer `tests/config.test.ts` in a future broader cleanup, or keep as `tests/subagents/config.test.ts` only for subagent-specific config and move web/lsp defaults to module tests. | Medium |
| `tests/subagents/register.test.ts` | Subagent tool registration in main process and child-process guard. | Keep as `tests/subagents/register.test.ts`. | Low |
| `tests/subagents/collect-output.test.ts` | JSONL/result output extraction, provider error extraction, partial output separation, non-JSON fallback, usage extraction. | Merge into `tests/subagents/runtime.test.ts`; it is runtime/result processing, not a standalone public module boundary. Keep provider error and partial-output regressions. | Low |
| `tests/subagents/prompt-runtime.test.ts` | Child prompt build, project context/skills stripping, child boundary injection, orchestration skill filtering, parent-only message filtering, hook rewrite, artifact filtering. | Merge into `tests/subagents/runtime.test.ts`; keep all user-visible context isolation behavior. | Low |
| `tests/subagents/pi-spawn.test.ts` | Cross-platform pi spawn command selection, Windows argv/package bin resolution, fallback behavior. | Merge into `tests/subagents/runtime.test.ts` as execution/spawn behavior. Keep Windows path regressions; drop excessive duplicate non-Windows fallback variants if covered by one representative case. | Medium |
| `tests/subagents/lsp-tools.test.ts` | Readonly agents get `lsp` by default, removed when `allowLspTools=false`, removed with no readonly LSP actions. | Merge into `tests/subagents/runtime.test.ts` or `agents.test.ts`. It is agent-tool resolution policy. Keep because subagent LSP permission boundary is required. | Low |
| `tests/subagents/commands/activity-panel.test.ts` | Activity panel construction, rendering, keyboard input, cache invalidation, factory options. | Merge into `tests/subagents/commands.test.ts`. Consider deleting cache-invalidation/mock-heavy assertions if they only test internal TUI implementation details. Keep render and keyboard user-visible behavior. | Medium |
| `tests/subagents/commands/doctor.test.ts` | Doctor checks report structure, categories/status/messages, provider checks, formatted text, summary/status/category glyphs, ddgs availability. | Merge into `tests/subagents/commands.test.ts`. Keep health/check output contracts; reduce repeated formatting assertions. | Low |
| `tests/subagents/commands/list.test.ts` | Agent list data shape, built-in properties, text formatter sections, JSON formatter parity. | Merge into `tests/subagents/commands.test.ts`; keep text/JSON user-visible contracts. | Low |
| `tests/subagents/commands/logs.test.ts` | Recent logs data/stats, limit/type filters, text formatter, JSON formatter. | Merge into `tests/subagents/commands.test.ts`; keep selector/filter and formatter contracts. | Low |
| `tests/web/register.test.ts` | Web enabled gate, three tools registered, tool names/execute/renderers, parameter schemas exposed, lifecycle event handlers, session restore/clear/shutdown, appendEntry setup. | Keep as `tests/web/register.test.ts`. Remove duplicate schema assertions if `schemas.test.ts` remains separate or merge schema checks into this file. | Low |
| `tests/web/schemas.test.ts` | TypeBox validation for `FetchContentParams`, `WebSearchParams`, `GetSearchContentParams`; optional/required fields, wrong types, extra properties. | Merge into `tests/web/register.test.ts` or keep a small `register.test.ts` schema section. Tool schema tests are mandatory; avoid a standalone schema file for three simple schemas. | Low |
| `tests/web/search.test.ts` | Missing query errors, unsupported provider runtime check, provider auth/fallback/priority/availability, storage, includeContent fetch, rate-limit/timeout classification, default ddgs behavior, explicit provider no-fallback, ddgs cap. | Keep as `tests/web/search.test.ts`; this is high-value tool behavior. Move provider-selection-only duplicates to `providers.test.ts` if consolidated. | Low |
| `tests/web/fetch.test.ts` | Missing/malformed/private URL errors, HTML extraction/truncation, Jina fallback/preferReader/triggers/private guard/byte cap, response byte cap, accepted content types, unsupported/binary files, source extension detection, localhost allow gate. | Rename to `tests/web/fetch-content.test.ts`. Keep security, supported types, unsupported types, Jina, byte/output truncation. Consider moving pure handler parsing cases to `fetch-content.test.ts` and deleting duplicates from `handlers.test.ts`. | Low |
| `tests/web/security.test.ts` | Security limit extraction, invalid protocols, blocked hostnames, private IPv4/IPv6 ranges, public boundary cases, DNS resolution, allowPrivateNetwork behavior. | Keep as `tests/web/security.test.ts`. It is required SSRF/private network coverage. | Low |
| `tests/web/storage.test.ts` | `get_search_content` unknown responseId, selectors by url/query/index, hints, session restore/TTL, max entries, stored/returned content truncation. | Merge with cache tests into `tests/web/cache-storage.test.ts`; keep selector and truncation behavior. | Low |
| `tests/web/cache.test.ts` | Search result cache store/retrieve/miss/clear/invalidate, cache key normalization, LRU eviction, hit/miss stats, global instance config. | Merge with storage tests into `tests/web/cache-storage.test.ts`. Keep LRU, key normalization, stats if user-visible/diagnostic. | Low |
| `tests/web/observability.test.ts` | Debug config levels, stats aggregation, activity log, record helpers, debug logging. | Keep as `tests/web/observability.test.ts`; merge logs/activity command tests only if module boundary changes, otherwise keep separate from subagent commands. | Low |
| `tests/web/errors.test.ts` | Web error code inventory, recovery map, `createWebError`, HTTP/network mapping, formatting, summaries. | Merge into `tests/web/search.test.ts`, `fetch-content.test.ts`, and/or `observability.test.ts` by behavior. Keep stable error code tests somewhere. Standalone internal error factory file is over-fragmented. | Medium |
| `tests/web/abort.test.ts` | Timeout signal behavior, parent signal composition, abort-like error detection over DOMException/Error/string/null. | Merge timeout/cancellation assertions into `tests/web/search.test.ts` and `tests/web/fetch-content.test.ts`. Drop exhaustive string/type matrix if not user-visible. | Medium |
| `tests/web/concurrency.test.ts` | Request throttler defaults/config, parallel limit, stats, queue full, idle/reset, global instance. | Merge into `tests/web/search.test.ts` as includeContent concurrency/queue behavior, or into `observability.test.ts` if only stats. Keep queue-full/limit behavior only if exposed through tool behavior. | Medium |
| `tests/web/http-pool.test.ts` | Pool defaults/config/stats/reset/destroy/global functions, `pooledFetch` delegation and counters. | Candidate delete or reduce heavily. It mostly tests internal infrastructure. Keep only max sockets/global lifecycle if user-configured behavior is otherwise untested. | High |
| `tests/web/extract.test.ts` | Truncation, whitespace normalization, heading extraction, JS-rendered/Jina trigger detection, legacy `shouldTryJinaFallback`, plain text extraction, HTML extraction. | Merge into `tests/web/fetch-content.test.ts`. Delete legacy `shouldTryJinaFallback` tests if the function/name is kept only for compatibility. Keep truncation, title extraction, JS/Jina trigger behavior as fetch-visible regressions. | Medium |
| `tests/web/handlers.test.ts` | Handler registry, HTML/text/JSON/CSV/TSV/XML/RSS/Atom/YAML/unsupported handlers, parse fallback. | Merge into `tests/web/fetch-content.test.ts`. Keep representative cases for each supported type and parse fallback; reduce exhaustive formatter internals. | Medium |
| `tests/web/renderers.test.ts` | Tool call/result renderers for search/fetch/get content, partial/error states, safe string/truncation helpers. | Merge into `tests/web/register.test.ts` or keep as a renderer section if large. Prefer no standalone renderer file unless renderers are treated as user-visible UI contracts. | Medium |
| `tests/web/providers/metadata.test.ts` | Provider metadata names, tiers, display names, enabled helper, api key env helper. | Merge into `tests/web/providers.test.ts`. Keep provider list and env/display contracts. | Low |
| `tests/web/providers/registry.test.ts` | Registry returns provider for each metadata name, provider shape, ddgs availability, unknown provider undefined. | Merge into `tests/web/providers.test.ts`. | Low |
| `tests/web/providers/select-provider.test.ts` | Explicit unsupported/disabled/unavailable/auth failures, auto mode/ddgs/default priority, result shape. | Merge into `tests/web/providers.test.ts`. Keep selection behavior; avoid duplicate provider availability checks covered by provider-specific contract sections. | Low |
| `tests/web/providers/ddgs.test.ts` | DDGS availability/name, Lite HTML parsing, result caps, request endpoint, errors, abort propagation, dedup/decoding/filtering. | Merge into `tests/web/providers.test.ts`; keep DDGS as zero-config provider contract and parser edge cases. | Low |
| `tests/web/providers/brave.test.ts` | Brave availability/name, API key/baseUrl validation, request params/headers, normalized response, filtering/fallback fields, errors. | Merge into `tests/web/providers.test.ts`; use shared provider contract helper to remove duplication. | Medium |
| `tests/web/providers/openserp.test.ts` | OpenSerp availability/name, request params/headers, organic/results fallback, normalized fields, errors. | Merge into `tests/web/providers.test.ts`; use shared provider contract helper. | Medium |
| `tests/web/providers/searxng.test.ts` | SearXNG availability/name, baseUrl validation/path handling/default engine, normalized results, errors. | Merge into `tests/web/providers.test.ts`; keep SearXNG-specific base path/default engine cases. | Medium |
| `tests/web/providers/serper.test.ts` | Serper availability/name, POST body/headers, normalized organic results, errors. | Merge into `tests/web/providers.test.ts`; use shared provider contract helper. | Medium |
| `tests/web/providers/tavily.test.ts` | Tavily availability/name, POST body, normalized results, errors. | Merge into `tests/web/providers.test.ts`; use shared provider contract helper. | Medium |

## Duplicate or over-fragmented areas

1. **Web provider tests**
   - Six provider files repeat the same pattern: name, availability, request shape, normalized output, HTTP/network errors.
   - Keep provider-specific fixtures, but consolidate into one `providers.test.ts` with shared contract helpers.
   - Risk: medium, because provider-specific normalization details can be accidentally dropped during consolidation.

2. **Web fetch/content pipeline tests**
   - `fetch.test.ts`, `extract.test.ts`, and `handlers.test.ts` overlap around text extraction, content type support, truncation, and fallback behavior.
   - Keep behavior visible through `fetch_content`; reduce pure helper matrix tests.
   - Risk: medium, because supported content type regressions are user-visible.

3. **Web internal infrastructure tests**
   - `abort.test.ts`, `concurrency.test.ts`, and `http-pool.test.ts` mostly test internal utilities.
   - Move timeout/cancellation/concurrency coverage to tool-level behavior where possible.
   - Risk: medium/high for `http-pool` if config-driven pooling is not covered elsewhere.

4. **Web schemas/renderers/register tests**
   - Tool schemas and renderers are user-visible, but standalone files make the module look more fragmented than the source boundary.
   - Merge schema and renderer contract sections into `register.test.ts` unless they become too large.
   - Risk: low/medium.

5. **Subagent runtime tests**
   - `collect-output.test.ts`, `prompt-runtime.test.ts`, `pi-spawn.test.ts`, and `lsp-tools.test.ts` are all runtime/execution policy tests.
   - Consolidate as `runtime.test.ts`.
   - Risk: medium for spawn platform cases.

6. **Subagent command tests**
   - Four files under `tests/subagents/commands/` mirror implementation files but over-fragment command output/formatters.
   - Consolidate as `commands.test.ts` with sections for doctor/list/logs/activity.
   - Risk: low/medium.

7. **Config placement**
   - `tests/subagents/config.test.ts` currently includes global, web, LSP, subagent schema, and subagent error code checks.
   - Either keep as a temporary config contract test or promote to root `tests/config.test.ts` in a later architecture cleanup. The recommended target structure below keeps only user-provided target files, so this plan preserves `subagents/config.test.ts` for now but narrows its content over time.
   - Risk: medium.

8. **Old structure/compatibility tests**
   - `frontmatter.test.ts` removed fields (`package`, `inheritSkills`, `defaultContext`) and `config.test.ts` legacy param exclusion should be reviewed against docs/ADR.
   - Keep only if they represent intentional regression constraints, not compatibility with old structures.
   - `extract.test.ts` explicitly labels `shouldTryJinaFallback` as legacy; delete if no longer public/current.
   - Risk: medium.

## Tests that should be retained as non-negotiable contracts

- Package manifest dependency/export contract.
- Unified toolkit command registration and disabled/child-process guards.
- Subagent registration, built-in agents, schema, runtime isolation, output collection, LSP tool permission boundaries.
- LSP tool registration, action gating, workspace boundary, hook disabled modes, subagent restrictions.
- Web tool registration, schemas, renderers, search/fetch/get-content behavior.
- Provider normalized output and provider selection behavior.
- Config defaults and normalized public config fields.
- Structured error codes and actionable messages.
- Timeout/abort/cancellation behavior at tool boundary.
- Output truncation and storage truncation.
- SSRF/private-network/path-boundary security tests.
- Supported/unsupported `fetch_content` content types.

## Candidate deletions or reductions

Deletion here means deletion after behavior is covered elsewhere, not blind removal.

| Candidate | Reason | Replacement coverage | Risk |
|---|---|---|---|
| Generic Node `path` behavior assertions in `shared/path-handling.test.ts` | Tests Node runtime instead of project behavior. | Removed — no `startsWith('/')` anti-pattern in source; real `path.isAbsolute`/`path.join` usage implicitly covered by tool-level tests. | Medium (done) |
| Exhaustive abort-like string/type matrix | Internal helper implementation detail. | Fetch/search timeout and cancellation user-visible errors. | Medium |
| Most `http-pool` constructor/global singleton tests | Internal infrastructure and mock call counters. | Tool/provider fetch behavior plus any public config defaults. | High |
| Duplicate provider `isAvailable` disabled-but-technically-valid cases | Same pattern repeated across keyed providers. | Shared provider contract table. | Medium |
| Duplicate provider request-shape happy paths | Repeated structure; keep one fixture per provider, not multiple redundant variants. | Consolidated `providers.test.ts`. | Medium |
| `extract.shouldTryJinaFallback (legacy)` | Explicitly legacy name/behavior. | Current `detectJinaTrigger` and `fetch_content` Jina fallback tests. | Medium |
| Formatter glyph/box-drawing micro-assertions | Brittle internal presentation detail. | One snapshot-like or section-existence assertion per formatter. | Low |
| Mock call-count-only assertions | Do not validate user-visible behavior. | Result shape, registered tools/events, observable outputs. | Low |
| Old frontmatter fields if only legacy compatibility | Conflicts with no-old-structure rule. | Current agent definition schema/reference tests. | Medium |

## Recommended target `tests/` structure

## Recommended target `tests/` structure (achieved in phases 2–6) {#recommended-target-tests-structure-achieved-in-phases-2-6}

> ✅ All phases completed. The structure below reflects the current state of `tests/`.

Preferred consolidated structure (achieved in phases 2–6):

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

Notes:

- `tests/subagents/commands/` directory was removed; command tests consolidated into `tests/subagents/commands.test.ts`.
- `tests/web/providers/` directory was removed; provider tests consolidated into `tests/web/providers.test.ts`.
- `tests/web/fetch.test.ts` was renamed to `fetch-content.test.ts` to match the public tool name.
- `tests/shared/path-handling.test.ts` was removed — it tested generic Node.js `path` behavior rather than project-specific regressions (no `startsWith('/')` anti-pattern exists in the source); `tests/shared/` directory is now empty and was removed.
- If config tests continue to cover all modules, consider a future `tests/config.test.ts`; otherwise narrow `tests/subagents/config.test.ts` to subagent-specific schema/config and move web/lsp defaults to their module files.

## Proposed migration map

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
tests/web/concurrency.test.ts              -> tests/web/search.test.ts or tests/web/observability.test.ts
tests/web/errors.test.ts                   -> tests/web/search.test.ts + tests/web/fetch-content.test.ts + tests/web/observability.test.ts
tests/web/renderers.test.ts                -> tests/web/register.test.ts
tests/web/schemas.test.ts                  -> tests/web/register.test.ts
tests/web/cache.test.ts                    -> tests/web/cache-storage.test.ts
tests/web/storage.test.ts                  -> tests/web/cache-storage.test.ts
tests/web/http-pool.test.ts                -> delete/reduce into provider/tool tests if needed
tests/web/providers/*.test.ts              -> tests/web/providers.test.ts
```

## Execution order (completed)

All phases have been executed. See the [achieved target structure](#recommended-target-tests-structure-achieved-in-phases-2-6) below.

## Remaining phased execution order

### Phase 1 — Planning only

- Keep this document as the audit baseline.
- No test code changes.

### Phase 2 — Low-risk subagent consolidation

1. Create `tests/subagents/runtime.test.ts` from:
   - `collect-output.test.ts`
   - `prompt-runtime.test.ts`
   - `pi-spawn.test.ts`
   - `lsp-tools.test.ts`
2. Merge `frontmatter.test.ts` into `agents.test.ts`.
3. Merge `tests/subagents/commands/*.test.ts` into `tests/subagents/commands.test.ts`.
4. Remove old files after the merged test passes.
5. Update `package.json` test globs to stop referencing `tests/subagents/commands/*.test.ts`.

Validation after phase:

```bash
pnpm test:unit
```

### Phase 3 — Web registration/schema/cache consolidation

1. Merge `schemas.test.ts` and renderer contract tests into `web/register.test.ts`.
2. Merge `cache.test.ts` and `storage.test.ts` into `web/cache-storage.test.ts`.
3. Keep `web/security.test.ts`, `web/search.test.ts`, and `web/observability.test.ts` in place.
4. Update test globs if needed.

Validation:

```bash
pnpm test:unit
```

### Phase 4 — Web fetch/content consolidation

1. Rename `web/fetch.test.ts` to `web/fetch-content.test.ts`.
2. Move retained `extract.test.ts` and `handlers.test.ts` behavior into `fetch-content.test.ts`.
3. Move timeout/abort and relevant structured errors into `fetch-content.test.ts`.
4. Delete legacy or internal-only helper matrix tests after equivalent tool-level coverage exists.

Validation:

```bash
pnpm test:unit
```

### Phase 5 — Provider contract consolidation

1. Create shared test helpers inside `tests/web/providers.test.ts` or a local fixture section.
2. Convert provider-specific files into provider contract sections:
   - metadata/registry/selection
   - ddgs
   - brave
   - openserp
   - searxng
   - serper
   - tavily
3. Delete `tests/web/providers/` directory after parity is confirmed.
4. Update `package.json` test globs.

Validation:

```bash
pnpm test:unit
```

### Phase 6 — Internal infrastructure pruning

1. Reduce or delete `http-pool` direct tests after ensuring user-configured fetch/provider behavior still covers failures and counters that matter.
2. Move `concurrency` and `abort` assertions to tool-boundary tests if not already done.
3. Review `shared/path-handling.test.ts` for project-specific value; reduce generic Node behavior assertions.

Validation:

```bash
pnpm test:unit
pnpm typecheck
pnpm lint
```

### Phase 7 — Documentation and script sync

1. Update `docs/guides/testing.md` and Chinese counterpart if needed.
2. Update `package.json` `test:unit` globs to the final structure.
3. Consider adding a test typecheck/lint path later because `tsconfig.json` currently excludes `tests`.
4. Run:

```bash
pnpm test
pnpm docs:check
```

## Main risks and mitigations

- **Provider consolidation loses vendor-specific normalization coverage.** Mitigate with a provider contract table plus one provider-specific fixture per backend.
- **Fetch/content consolidation drops supported content type guarantees.** Mitigate with an explicit supported/unsupported content-type matrix in `fetch-content.test.ts`.
- **Deleting internal infra tests hides regressions in pooling/throttling.** Mitigate by preserving user-visible timeout, queue, and config behavior through search/fetch tests.
- **Moving command tests loses formatter contract.** Mitigate with one text and one JSON assertion per command output.
- **Test script drift after deleting directories.** Mitigate by updating `package.json` globs in the same phase as file moves.
- **Docs drift.** Mitigate by updating `docs/guides/testing.md` after final structure is confirmed.
