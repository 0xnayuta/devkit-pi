---
status: current
audience: maintainer
last_verified: 2026-05-12
language: english
---

# Architecture Overview

This document describes devkit-pi's implemented module boundaries, registration flow, and test mapping based on the current `src/` directory structure. Old directory names or old project names appearing in deprecated ADRs are decision background only, not current implementation references.

Public API, configuration, and command contracts are defined in [Reference index](../reference/README.md); core references include [Configuration](../reference/configuration.md), [Subagents](../reference/subagents.md), [Web tools](../reference/web-tools.md), [LSP tools](../reference/lsp-tools.md), and [Toolkit commands](../reference/toolkit-commands.md).

## Architecture consistency policy

`devkit-pi` prioritizes structural consistency over preserving legacy layouts. Old project structures, one-off directory names, or previous implementation patterns should not be retained when they conflict with the current modular architecture.

When modules, tools, providers, commands, or feature areas serve similar roles, prefer aligned structure and conventions:

- Same responsibility → same source/test/documentation structure
- Same concept → same naming pattern
- Same lifecycle → same registration/execution pattern
- Same provider type → same adapter interface and registry pattern
- Same tool category → same schema, configuration, error, test, and reference documentation pattern

Exceptions should be documented near the implementation or in an ADR.

## Current source structure

```text
index.ts                         # package root entry; re-exports src/index.ts
src/
├─ index.ts                      # extension main entry; loads config and composes module registration
├─ config/
│  └─ load-config.ts             # config paths, defaults, merge/normalize
├─ modules/
│  ├─ commands/
│  │  └─ register.ts             # unified /toolkit command registration
│  ├─ subagents/                 # subagent discovery, execution, output collection, diagnostic commands
│  │  ├─ commands/               # doctor/list/logs/activity support logic
│  │  ├─ agents.ts               # builtin/user/project agent discovery and dedup
│  │  ├─ executor.ts             # subagent execution orchestration
│  │  ├─ collect-output.ts       # child session output collection
│  │  ├─ prompt-runtime.ts       # subagent prompt runtime processing
│  │  ├─ pi-spawn.ts             # child pi process startup
│  │  ├─ sanitize.ts             # output sanitization
│  │  ├─ schemas.ts              # subagent tool parameter schema
│  │  └─ register.ts             # subagent tool and delegation policy registration
│  ├─ web/                       # web_search/fetch_content/get_search_content
│  │  ├─ providers/              # ddgs/brave/tavily/serper/openserp/searxng
│  │  ├─ cache.ts                # search cache
│  │  ├─ concurrency.ts          # request concurrency and queue limits
│  │  ├─ fetch.ts                # fetch_content main flow
│  │  ├─ handlers.ts             # content type handlers
│  │  ├─ security.ts             # URL/SSRF/private network access validation
│  │  ├─ storage.ts              # responseId result storage and session restore
│  │  ├─ errors.ts               # web error codes and recovery suggestions
│  │  └─ register.ts             # web tools registration and session hooks
│  ├─ lsp/                       # LSP tool, hook, server management
│  │  ├─ core.ts                 # language server manager and core operations
│  │  ├─ hook.ts                 # automatic diagnostics hook
│  │  ├─ schemas.ts              # lsp tool parameter schema/actions
│  │  ├─ tool.ts                 # lsp tool implementation
│  │  └─ register.ts             # LSP module registration
│  ├─ convert/                   # convert_content document conversion
│  │  ├─ index.ts                # convert tool registration
│  │  ├─ schemas.ts              # convert_content parameter schema
│  │  ├─ errors.ts               # convert error codes and provider error class
│  │  ├─ types.ts                # convert tool result/config-adjacent types
│  │  ├─ provider.ts             # provider interface + MarkItDown CLI provider
│  │  ├─ security.ts             # safe URL download, redirect validation, temp-file cleanup
│  │  ├─ renderers.ts            # compact/expanded TUI renderers
│  │  ├─ observability.ts        # toolkit-level convert activity recording
│  │  └─ tool.ts                 # path/URL orchestration and error mapping
│  └─ ...
└─ shared/
   ├─ types.ts                   # shared types, config types, subagent error codes
   ├─ errors.ts                  # LSP/subagent shared error types
   ├─ delegation-policy.ts       # main agent delegation policy injection text
   ├─ session-identity.ts        # session identity helper
   └─ post-exit-stdio-guard.ts   # child process stdio guard

agents/                          # 5 built-in markdown agent definitions
tests/                           # unit tests, mirroring src/modules structure
```

## Entry points and registration flow

### `index.ts`

Root `index.ts` only re-exports `src/index.ts` for pi extension loading and avoids the display name being derived from `src`.

### `src/index.ts`

`src/index.ts` is the actual main entry. Current implemented flow:

```text
loadConfig()
  → mergeConfig()
  → if enabled=false, return immediately
  → registerWebTools(pi, config.web)
  → registerLspModule(pi, config.lsp)
  → registerSubagentsModule(pi, effectiveSubagentsConfig)
  → registerConvertTools(pi, config.convertContent)
  → registerToolkitCommands(pi, config)
```

Current semantics of registration order:

1. `web` tools can be registered in both main agent and subagent processes.
2. `lsp` tool can be registered in both main agent and subagent processes, but privileged actions are always blocked in subagent processes.
3. The `subagents` module internally checks `PI_SUBAGENT_CHILD`; subagent processes do not register the `subagent` tool.
4. `convert_content` can be registered in both main agent and subagent processes; local `path` and remote `url` conversion use the MarkItDown CLI provider after local validation or safe URL download.
5. `/toolkit` commands are only registered in the main agent process.
6. `subagents.allowLspTools` is merged with `lsp.enabled` and `lsp.tool.enabled` before taking effect.

## Module responsibilities

### `src/config/`

Currently implemented:

- Config file path: `~/.pi/agent/extensions/devkit-pi/config.json`
- Default configs: `DEFAULT_CONFIG`, `DEFAULT_SUBAGENTS_CONFIG`, `DEFAULT_WEB_CONFIG`, `DEFAULT_CONVERT_CONTENT_CONFIG`
- Config merge and normalize: `mergeConfig()`
- Invalid value fallback: boolean, positive integer, non-negative integer, provider name, LSP hook mode, readonly LSP actions, etc.

The canonical source for configuration docs is `src/config/load-config.ts`; type definitions are in `src/shared/types.ts`.

### `src/modules/subagents/`

Currently implemented:

- Registers `subagent` tool.
- Discovers builtin/user/project agents.
  - Builtin: `agents/*.md`
  - User-level: `~/.pi/agent/agents/`
  - Project-level: `.pi/agents/` or `.agents/`
- Parses simple markdown frontmatter.
- Deduplicates agents by project > user > builtin priority.
- Constructs delegated child prompt.
- Starts foreground child pi session.
- Collects output, usage, session file info, and display items.
- Sanitizes output.
- Uses `subagents.maxDepth` and environment variables to block nested subagents.
- Injects delegation policy in main agent process (configurable).
- Provides doctor/list/logs/activity support logic for `/toolkit`.

Current boundaries:

- The main agent is the sole orchestrator.
- Subagents do not register and should not call the `subagent` tool.
- Built-in agents default to readonly.
- `allowWrite` exists in config, but built-in agents are still designed with readonly prompts and tool lists; write capability risks need human review before expanding documentation.
- Subagents can optionally use readonly LSP actions, controlled by `subagents.allowLspTools` and `subagents.allowedLspActions`.

### `src/modules/web/`

Currently implemented:

- Registers readonly web tools: `web_search`, `fetch_content`, `get_search_content`.
- Search providers: `ddgs`, `brave`, `tavily`, `serper`, `openserp`, `searxng`.
- `provider="auto"` selects available provider by `providerPriority` and provider availability.
- URL fetch security limits: protocol restrictions, private network/localhost default blocking, DNS resolution validation, redirect limits, timeout, response size limits.
- Content extraction and handlers: HTML, plain text, Markdown/source text, JSON, CSV/TSV, XML/RSS/Atom, YAML, and unsupported type rejection.
- Jina Reader fallback configuration: `enableJinaFallback`, `jinaTimeoutMs`, `jinaTriggers`, tool parameter `preferReader`.
- Search cache, request concurrency limits, HTTP connection pool.
- responseId storage; supports pi session custom entry append/restore. It does not write project files, but is no longer just "in-process memory" semantics.
- Observability/activity logs and renderers.

Current boundaries:

- Web error codes canonical source is `WEB_ERROR_CODES` in `src/modules/web/errors.ts`; full active/reserved/deprecated semantics in [Web tools error codes](../reference/web-tools-error-codes.md).

### `src/modules/lsp/`

Currently implemented:

- Registers `lsp` tool.
- Supported actions: `definition`, `references`, `hover`, `symbols`, `diagnostics`, `workspace-diagnostics`, `signature`, `rename`, `codeAction`, `restart`, `servers`.
- Readonly-safe actions can be exposed to subagents: `definition`, `references`, `hover`, `signature`, `symbols`, `diagnostics`, `workspace-diagnostics`, `servers`.
- Privileged actions: `rename`, `codeAction`, `restart`; disabled by default and always disabled in subagent processes.
- Workspace path boundary and result truncation.
- Automatic diagnostics hook: registered in main agent process, supports `agent_end`, `edit_write`, `disabled` modes.
- Language server manager and session shutdown cleanup.

Requires human confirmation:

- Docs can list supported language servers from source comments, but actual availability depends on the corresponding server being installed locally.

### `src/modules/convert/`

Currently implemented:

- Adds the `convertContent` configuration namespace.
- Registers the `convert_content` tool when `convertContent.enabled=true`.
- Defines input schema fields: `path`, `url`, `maxContentChars`, `timeoutMs`.
- Defines convert-specific structured error codes and `ConvertProviderError`.
- Provides a provider interface and MarkItDown CLI provider.
- MarkItDown provider checks command availability, runs `markitdown <input-file>` without shell interpolation, enforces timeout, captures stdout/stderr, truncates output, and maps provider failures to convert error codes.
- Public tool execution validates `path`/`url` mutual exclusion, enforces local path workspace boundaries, handles local file existence/type/size checks, safely downloads remote URLs to temporary files, invokes the provider, cleans up downloaded files, and returns structured provider errors.

Current boundaries:

- URL download validates the initial URL and every redirect hop with private-network protection before following redirects.
- Provides compact/expanded TUI renderers for `convert_content` calls and results.
- Records convert success/error entries in the shared toolkit-level activity log.
- `path` is the canonical local file input field; `file_path` is not used.

### `src/modules/commands/`

Currently implemented:

- Registers unified slash command: `/toolkit`.
- Subcommands:
  - `/toolkit doctor`
  - `/toolkit modules`
  - `/toolkit logs [--search|--fetch|--convert] [--limit N]`
  - `/toolkit agents`
  - `/toolkit lsp`
  - `/toolkit activity`
  - `/toolkit help`
- Subagent processes do not register `/toolkit`.

### `src/shared/`

Currently implemented:

- Subagent result/config/session/usage types.
- Subagent error code constants.
- LSP/subagent shared error types.
- Delegation policy injection text.
- Session identity and temporary directory scope.
- Output truncation utilities.

Requires human confirmation:

- `src/shared/errors.ts` is named as unified error codes, but currently does not include web error codes.

## Core call chains

### Subagent call chain

```text
Main agent calls subagent({ agent, task })
  → registerSubagentsModule tool handler
  → Validate input/config/depth
  → discoverAgents(cwd, "both")
  → Select agent definition and construct child prompt
  → createSubagentExecutor / pi-spawn starts foreground child pi session
  → collect-output collects assistant output and usage
  → sanitize + normalize result/details
  → Return to main agent
```

### Web call chain

```text
Main agent or subagent calls web_search / fetch_content / get_search_content
  → registerWebTools registered tool handler
  → Schema constraints + runtime validation
  → Provider selection / URL security / cache / concurrency / storage
  → Return JSON details, compress UI display via renderer
```

### LSP call chain

```text
Main agent or subagent calls lsp({ action, ... })
  → registerLspTool
  → Action permission check (privileged actions blocked in subagents)
  → Core manager starts or reuses language server
  → Execute definition/references/diagnostics etc.
  → Limit result size and return
```

### LSP diagnostics hook

```text
Main agent session_start / tool_call / tool_result / agent_start / agent_end
  → registerLspHook maintains current turn's edited file state
  → Diagnose after agent_end or edit_write per hook.mode
  → Output lsp-diagnostics message
```

Hook is not registered in subagent processes.

## How test structure mirrors source

Current tests are primarily unit tests, not depending on real pi child processes or real language servers. Test directory mirrors modules. This mirror structure is intentional architecture policy, not just current convention: new modules or comparable feature areas should add tests under matching paths unless a documented exception exists.

```text
tests/
├─ subagents/                  # src/modules/subagents/*
│  └─ commands/                # src/modules/subagents/commands/*
├─ web/                        # src/modules/web/*
│  └─ providers/               # src/modules/web/providers/*
├─ lsp/                        # src/modules/lsp/*
├─ convert/                    # src/modules/convert/*
├─ commands/                   # src/modules/commands/*
├─ shared/                     # src/shared/*
└─ package-manifest.test.ts    # package.json publish entry/file checks
```

Mapping examples:

| Test | Source | Focus |
|---|---|---|
| `tests/subagents/agents.test.ts` | `src/modules/subagents/agents.ts` | Agent discovery, priority, path handling |
| `tests/subagents/config.test.ts` | `src/config/load-config.ts` | Namespace config merge/defaults |
| `tests/subagents/lsp-tools.test.ts` | `src/modules/subagents/*` + `src/modules/lsp/*` | Subagent LSP actions exposure boundary |
| `tests/web/*.test.ts` | `src/modules/web/*.ts` | fetch/search/security/storage/cache/concurrency/renderers |
| `tests/web/providers/*.test.ts` | `src/modules/web/providers/*.ts` | Provider adapter and selection |
| `tests/lsp/tool.test.ts` | `src/modules/lsp/*` | Tool registration, permission gating, hook registration boundary |
| `tests/convert/*.test.ts` | `src/modules/convert/*` | Config, schema, error inventory, registration, MarkItDown provider behavior, local path conversion, safe URL download/conversion, renderers, and convert activity recording |
| `tests/commands/register.test.ts` | `src/modules/commands/register.ts` | `/toolkit` registration and subcommand output |
| `tests/shared/path-handling.test.ts` | `src/shared/*` | Path and scope handling |

## Currently implemented vs design direction

### Currently implemented

- Modular single-package entry.
- Namespace configuration.
- `subagent` tool with 5 built-in readonly agents.
- User/project markdown agents.
- Readonly web tools with multi-provider search.
- `fetch_content` text-type handlers, security limits, and Jina fallback.
- `lsp` tool with main agent diagnostics hook.
- `/toolkit` command center.
- Module-level unit tests.

### Design direction / future plans

The following appear in roadmap, proposal, or ADR background but are not currently implemented features:

- VitePress documentation site.
- `convert_content` tool.
- Background/async jobs.
- Chain/parallel workflow.
- Intercom.
- Worktree management.
- Agent management actions (create/update/delete).
- Repo map / project context / git workflow / run_check, etc.

These should continue to live in roadmap/proposal/historical docs and should not be written into user feature descriptions as current capabilities.
