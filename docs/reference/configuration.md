---
status: current
audience: user
last_verified: 2026-05-20
language: english
---

# Configuration Reference

This document uses `src/config/load-config.ts` as canonical source, with supplementary reference from `src/shared/types.ts`, `src/modules/web/providers/*`, `src/modules/lsp/schemas.ts`, and related tests. If README or old docs conflict with this document, the defaults and normalize logic in `src/config/load-config.ts` take precedence.

## Configuration file location

Default configuration file:

```text
~/.pi/agent/extensions/devkit-pi/config.json
```

devkit-pi uses namespace-based configuration and does not support legacy flat configuration fields. When the config file is missing or unreadable, the default config `{}` merged with `DEFAULT_CONFIG` is used.

Configuration follows the architecture consistency policy: similar modules use namespace-based config objects, aligned `enabled` switches, default/normalize behavior, and matching source/test/documentation coverage. Legacy flat fields are not retained when they conflict with this structure.

## Complete default configuration example

Source: `DEFAULT_CONFIG`, `DEFAULT_SUBAGENTS_CONFIG`, `DEFAULT_WEB_CONFIG`, `DEFAULT_CONVERT_CONTENT_CONFIG`, `DEFAULT_GUARDS_CONFIG`, and `DEFAULT_SUBAGENT_LSP_ACTIONS` in `src/config/load-config.ts`.

```json
{
  "enabled": true,
  "subagents": {
    "enabled": true,
    "maxDepth": 1,
    "timeoutMs": 900000,
    "idleTimeoutMs": 180000,
    "allowWrite": false,
    "allowLspTools": true,
    "allowedLspActions": [
      "definition",
      "references",
      "hover",
      "signature",
      "symbols",
      "diagnostics",
      "workspace-diagnostics",
      "servers"
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
    "jinaTimeoutMs": 8000,
    "maxStoredResults": 100,
    "maxStoredContentChars": 200000,
    "allowPrivateNetwork": false,
    "jinaTriggers": ["short-html", "js-heavy-html"],
    "debug": false,
    "cache": {
      "enabled": false,
      "maxEntries": 50,
      "ttlMs": 300000
    },
    "concurrency": {
      "maxConcurrent": 3,
      "maxQueueSize": 10
    },
    "openserp": {
      "enabled": false,
      "baseUrl": "https://api.openserp.com/search",
      "apiKeyEnv": "OPENSERP_API_KEY"
    },
    "searxng": {
      "enabled": false,
      "baseUrl": "",
      "defaultEngine": "google"
    },
    "brave": {
      "enabled": false,
      "baseUrl": "https://api.search.brave.com/res/v1/web/search",
      "apiKeyEnv": "BRAVE_SEARCH_API_KEY"
    },
    "tavily": {
      "enabled": false,
      "baseUrl": "https://api.tavily.com/search",
      "apiKeyEnv": "TAVILY_API_KEY"
    },
    "serper": {
      "enabled": false,
      "baseUrl": "https://google.serper.dev/search",
      "apiKeyEnv": "SERPER_API_KEY"
    }
  },
  "convertContent": {
    "enabled": true,
    "provider": "markitdown",
    "command": "markitdown",
    "timeoutMs": 30000,
    "maxResponseBytes": 10485760,
    "maxContentChars": 50000,
    "allowPrivateNetwork": false
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
  },
  "guards": {
    "enabled": true,
    "gitContextNotice": true,
    "firstWriteReminder": true,
    "verificationReminder": true
  }
}
```

All fields are optional; unconfigured or type-non-conforming values fall back to defaults per normalize rules.

## Normalize rules summary

Source: `src/config/load-config.ts`.

| Rule | Applicable fields | Behavior |
|---|---|---|
| `booleanValue` | boolean fields | Only boolean takes effect, otherwise uses default |
| `positiveInteger` | Timeouts, sizes, counts, queue positive integers | Must be `> 0` integer, otherwise uses default |
| `nonNegativeInteger` | `subagents.maxDepth` | Must be `>= 0` integer, otherwise uses default |
| `normalizeProvider` | `web.provider` | Only accepts `auto`, `brave`, `ddgs`, `openserp`, `searxng`, `tavily`, `serper` |
| `normalizeProviderPriority` | `web.providerPriority` | Filters invalid providers, deduplicates; empty or invalid array falls back to default |
| `normalizeDebugLevel` | `web.debug` | Accepts `false`, `minimal`, `verbose`; `true` becomes `minimal` |
| `normalizeJinaTriggers` | `web.jinaTriggers` | Accepts non-empty string array and deduplicates; non-array falls back to default; empty array can be retained as empty |
| `normalizeLspReadonlyActions` | `subagents.allowedLspActions` | Only retains readonly-safe LSP actions and deduplicates |
| `normalizeLspHookMode` | `lsp.hook.mode` | Only accepts `agent_end`, `edit_write`, `disabled` |
| `nonEmptyString` | External command / provider URLs / env var names | Trimmed non-empty strings take effect, otherwise uses default |

## Top-level configuration

Source: `DEFAULT_CONFIG`, `mergeConfig()`.

| Key | Type | Default | Required | Purpose | Related source |
|---|---|---:|---|---|---|
| `enabled` | boolean | `true` | No | Whether to enable entire devkit-pi extension; when `false`, main entry returns immediately | `src/index.ts`, `src/config/load-config.ts` |
| `subagents` | object | See below | No | Subagent tool, built-in agents, delegation policy, subagent LSP exposure | `src/modules/subagents/*` |
| `web` | object | See below | No | `web_search` / `fetch_content` / `get_search_content` | `src/modules/web/*` |
| `lsp` | object | See below | No | `lsp` tool and automatic diagnostics hook | `src/modules/lsp/*` |
| `convertContent` | object | See below | No | `convert_content` document conversion tool configuration. Local `path` and remote `url` conversion use MarkItDown provider after safe source handling | `src/modules/convert/*` |
| `commands` | object | See below | No | Unified `/toolkit` developer command | `src/modules/commands/register.ts` |
| `guards` | object | See below | No | Lightweight user-visible session notices; soft reminders only, no hard gates | `src/modules/guards/*` |

Example: disable entire extension.

```json
{
  "enabled": false
}
```

## Subagents configuration

Public overview, tool API, agent definition, and result schema: [`subagents.md`](./subagents.md), [`subagent-tool.md`](./subagent-tool.md), [`agent-definition.md`](./agent-definition.md), [`result-schema.md`](./result-schema.md).

Source: `DEFAULT_SUBAGENTS_CONFIG`, `normalizeSubagentsConfig()`, `src/modules/subagents/register.ts`, `src/modules/subagents/executor.ts`.

| Key | Type | Default | Required | Purpose | Related source |
|---|---|---:|---|---|---|
| `subagents.enabled` | boolean | `true` | No | Whether to register `subagent` tool | `src/modules/subagents/register.ts` |
| `subagents.maxDepth` | number | `1` | No | Maximum subagent depth; default prohibits nested subagents. Accepts non-negative integer | `src/shared/types.ts`, `src/modules/subagents/register.ts` |
| `subagents.timeoutMs` | number | `900000` | No | Single child execution hard cap in ms; starts when the child process is spawned and does not reset on activity | `src/modules/subagents/executor.ts` |
| `subagents.idleTimeoutMs` | number | `180000` | No | Maximum idle time in ms since the last valid structured child activity event; plain stdout text does not reset this timer | `src/modules/subagents/executor.ts`, `src/modules/subagents/collect-output.ts` |
| `subagents.allowWrite` | boolean | `false` | No | Experimental/advanced/unsafe switch. Relaxes non-readonly custom agent tool filtering policy; does not imply complete permission sandbox, audit log, automatic rollback, or stable write-capability contract | `src/config/load-config.ts`, `src/modules/subagents/*` |
| `subagents.allowLspTools` | boolean | `true` | No | Whether to allow subagents to use readonly LSP tool; also constrained by `lsp.enabled` and `lsp.tool.enabled` | `src/index.ts`, `src/modules/subagents/*` |
| `subagents.allowedLspActions` | string[] | See below | No | Subagent LSP action allowlist; invalid values are discarded | `src/config/load-config.ts` |
| `subagents.injectDelegationPolicy` | boolean | `true` | No | Whether to inject delegation policy and few-shot examples into main agent system prompt | `src/shared/delegation-policy.ts`, `src/modules/subagents/register.ts` |
| `subagents.retry.enabled` | boolean | `true` | No | Whether to enable subagent retry | `src/config/load-config.ts`, `src/modules/subagents/executor.ts` |
| `subagents.retry.maxAttempts` | number | `2` | No | Maximum attempt count, must be positive integer | `src/config/load-config.ts`, `src/modules/subagents/executor.ts` |

Default `subagents.allowedLspActions`:

```json
[
  "definition",
  "references",
  "hover",
  "signature",
  "symbols",
  "diagnostics",
  "workspace-diagnostics",
  "servers"
]
```

Example: disable delegation policy injection and disable subagent LSP.

```json
{
  "subagents": {
    "injectDelegationPolicy": false,
    "allowLspTools": false
  }
}
```

Example: only allow subagents to use LSP symbols and diagnostics.

```json
{
  "subagents": {
    "allowedLspActions": ["symbols", "diagnostics", "servers"]
  }
}
```

### `subagents.allowWrite` boundary

Writable custom subagents are currently an experimental capability. The default and recommended mode is readonly. `subagents.allowWrite=true` only indicates relaxed delegation policy; it does not imply a complete permission sandbox, audit logging, automatic rollback mechanism, or stable write-capability contract. Use only in trusted repositories, and all changes must be human-reviewed.

Current constraints:

- Built-in agents continue to be designed as readonly-first.
- Subagent's actual tool availability depends on child pi runtime, current tool registration, execution environment, and configuration.
- Subagent processes do not register `subagent` or `/toolkit`.
- LSP privileged actions are always disabled in subagents.
- Web tools can be used for research and reading information.
- File writing, command execution, project modification, and other write-like behaviors have no stable automatic rollback guarantee.

To enable writable behavior, use Git workspaces, pre-commit diffs, human review, and test commands as safety nets. If formally supporting writable custom subagents in the future, permission strategy, audit logging, rollback recommendations, and test coverage should be supplemented first.

## LSP configuration

Public API, action input/output, language server behavior, and failure semantics: [`lsp-tools.md`](./lsp-tools.md).

Source: `DEFAULT_CONFIG.lsp`, `normalizeLspConfig()`, `src/modules/lsp/register.ts`, `src/modules/lsp/tool.ts`, `src/modules/lsp/hook.ts`, `src/modules/lsp/schemas.ts`.

| Key | Type | Default | Required | Purpose | Related source |
|---|---|---:|---|---|---|
| `lsp.enabled` | boolean | `true` | No | Whether to enable entire LSP module | `src/modules/lsp/register.ts` |
| `lsp.tool.enabled` | boolean | `true` | No | Whether to register explicit `lsp` tool | `src/modules/lsp/register.ts`, `src/modules/lsp/tool.ts` |
| `lsp.tool.allowMutatingActions` | boolean | `false` | No | Whether to allow main agent process to call `rename`, `codeAction`, `restart`; subagent processes always disabled | `src/modules/lsp/tool.ts` |
| `lsp.hook.enabled` | boolean | `true` | No | Whether to enable automatic diagnostics hook; only registered in main agent process | `src/modules/lsp/register.ts`, `src/modules/lsp/hook.ts` |
| `lsp.hook.mode` | `agent_end` / `edit_write` / `disabled` | `agent_end` | No | Hook trigger timing. `disabled` resolves to `hook.enabled=false`, `hook.mode="disabled"` | `src/config/load-config.ts`, `src/modules/lsp/hook.ts` |

`lsp` tool actions from `src/modules/lsp/schemas.ts`:

```text
definition, references, hover, symbols, diagnostics, workspace-diagnostics,
signature, rename, codeAction, restart, servers
```

Readonly-safe actions (can be exposed to subagents via `subagents.allowedLspActions`):

```text
definition, references, hover, signature, symbols, diagnostics, workspace-diagnostics, servers
```

Privileged actions:

```text
rename, codeAction, restart
```

Example: disable LSP hook but retain explicit `lsp` tool.

```json
{
  "lsp": {
    "hook": {
      "enabled": false
    }
  }
}
```

Example: allow main agent to use mutating actions (subagents still disabled).

```json
{
  "lsp": {
    "tool": {
      "allowMutatingActions": true
    }
  }
}
```

## Web base configuration

Source: `DEFAULT_WEB_CONFIG`, `normalizeWebConfig()`, `src/modules/web/register.ts`, `src/modules/web/search.ts`, `src/modules/web/fetch.ts`, `src/modules/web/storage.ts`.

| Key | Type | Default | Required | Purpose | Related source |
|---|---|---:|---|---|---|
| `web.enabled` | boolean | `true` | No | Whether to register `web_search`, `fetch_content`, `get_search_content` | `src/modules/web/register.ts` |
| `web.provider` | string | `ddgs` | No | Search provider: `auto` / `brave` / `ddgs` / `openserp` / `searxng` / `tavily` / `serper` | `src/config/load-config.ts`, `src/modules/web/providers/select-provider.ts` |
| `web.providerPriority` | string[] | `['tavily','serper','brave','openserp','searxng','ddgs']` | No | Candidate order for `provider="auto"`. Source code applies this priority after layering by commercial / self-host-or-open / zero-config | `src/modules/web/providers/select-provider.ts` |
| `web.timeoutMs` | number | `10000` | No | web/provider/fetch request timeout in ms | `src/modules/web/abort.ts`, providers |
| `web.maxResponseBytes` | number | `1048576` | No | Max response body bytes for `fetch_content` downloads and search provider responses | `src/modules/web/fetch.ts`, `src/modules/web/read-limited.ts` |
| `web.maxContentChars` | number | `30000` | No | Max tool return content characters | `src/modules/web/fetch.ts`, `src/modules/web/storage.ts` |
| `web.maxResults` | number | `5` | No | Default search result count | `src/modules/web/search.ts` |
| `web.maxStoredResults` | number | `100` | No | Max responseId storage retained result entries | `src/modules/web/storage.ts`, `src/modules/web/register.ts` |
| `web.maxStoredContentChars` | number | `200000` | No | Max single stored content characters | `src/modules/web/storage.ts`, `src/modules/web/register.ts` |
| `web.allowPrivateNetwork` | boolean | `false` | No | Whether to allow `fetch_content` to access localhost / private IP / `.local` / `.internal` | `src/modules/web/security.ts`, `src/modules/web/fetch.ts` |
| `web.debug` | `false` / `minimal` / `verbose` | `false` | No | Web observability debug output level; configuring `true` normalizes to `minimal` | `src/modules/web/observability.ts` |

Example: use auto provider selection and increase result count.

```json
{
  "web": {
    "provider": "auto",
    "maxResults": 8
  }
}
```

Example: allow fetching local development server.

```json
{
  "web": {
    "allowPrivateNetwork": true
  }
}
```

## Web providers configuration

Provider names from `WebSearchProviderName` in `src/shared/types.ts` and `src/modules/web/providers/registry.ts`. Provider selection logic in `src/modules/web/providers/select-provider.ts`.

### `ddgs`

| Key | Type | Default | Required | Purpose | Related source |
|---|---|---:|---|---|---|
| No namespace config | - | - | - | Default zero-config provider, uses DuckDuckGo Lite fallback | `src/modules/web/providers/ddgs.ts` |

### `brave`

| Key | Type | Default | Required | Purpose | Related source |
|---|---|---:|---|---|---|
| `web.brave.enabled` | boolean | `false` | No | Selection enabled gate for explicit and auto modes | `src/modules/web/providers/select-provider.ts` |
| `web.brave.baseUrl` | string | `https://api.search.brave.com/res/v1/web/search` | No | Brave Search API endpoint | `src/modules/web/providers/brave.ts` |
| `web.brave.apiKeyEnv` | string | `BRAVE_SEARCH_API_KEY` | No | Which environment variable to read API key from | `src/modules/web/providers/brave.ts` |

### `openserp`

| Key | Type | Default | Required | Purpose | Related source |
|---|---|---:|---|---|---|
| `web.openserp.enabled` | boolean | `false` | No | Selection enabled gate for explicit and auto modes | `src/modules/web/providers/select-provider.ts` |
| `web.openserp.baseUrl` | string | `https://api.openserp.com/search` | No | OpenSERP endpoint | `src/config/load-config.ts` |
| `web.openserp.apiKeyEnv` | string | `OPENSERP_API_KEY` | No | Which environment variable to read API key from | `src/modules/web/providers/openserp.ts` |

### `searxng`

| Key | Type | Default | Required | Purpose | Related source |
|---|---|---:|---|---|---|
| `web.searxng.enabled` | boolean | `false` | No | Selection enabled gate for explicit and auto modes | `src/modules/web/providers/select-provider.ts` |
| `web.searxng.baseUrl` | string | `""` | No | SearXNG base URL; must be valid http/https URL to be available | `src/modules/web/providers/searxng.ts` |
| `web.searxng.defaultEngine` | string | `google` | No | Default value for request parameter `engines` | `src/modules/web/providers/searxng.ts` |

### `tavily`

| Key | Type | Default | Required | Purpose | Related source |
|---|---|---:|---|---|---|
| `web.tavily.enabled` | boolean | `false` | No | Selection enabled gate for explicit and auto modes | `src/modules/web/providers/select-provider.ts` |
| `web.tavily.baseUrl` | string | `https://api.tavily.com/search` | No | Tavily endpoint | `src/modules/web/providers/tavily.ts` |
| `web.tavily.apiKeyEnv` | string | `TAVILY_API_KEY` | No | Which environment variable to read API key from | `src/modules/web/providers/tavily.ts` |

### `serper`

| Key | Type | Default | Required | Purpose | Related source |
|---|---|---:|---|---|---|
| `web.serper.enabled` | boolean | `false` | No | Selection enabled gate for explicit and auto modes | `src/modules/web/providers/select-provider.ts` |
| `web.serper.baseUrl` | string | `https://google.serper.dev/search` | No | Serper endpoint | `src/modules/web/providers/serper.ts` |
| `web.serper.apiKeyEnv` | string | `SERPER_API_KEY` | No | Which environment variable to read API key from | `src/modules/web/providers/serper.ts` |

### `provider="auto"` behavior

Auto mode filters providers by the same enabled gate and technical availability checks used by explicit mode, then applies `providerPriority`. Current source code divides candidate providers into three tiers:

1. commercial: `tavily`, `serper`, `brave`
2. self-host-or-open: `openserp`, `searxng`
3. zero-config: `ddgs`

Final order is sorted by `providerPriority` within each tier, then concatenated. Default configuration equivalent to:

```text
tavily → serper → brave → openserp → searxng → ddgs
```

Selection availability combines provider `enabled` gates with adapter-level technical checks. For example, `brave` requires `web.brave.enabled=true`, a valid baseUrl, and an API key from `web.brave.apiKeyEnv`; `searxng` requires `web.searxng.enabled=true` and a valid http/https baseUrl.

## Web cache configuration

Source: `src/modules/web/cache.ts`, `src/modules/web/register.ts`.

| Key | Type | Default | Required | Purpose | Related source |
|---|---|---:|---|---|---|
| `web.cache.enabled` | boolean | `false` | No | Whether to enable search result cache | `src/modules/web/cache.ts` |
| `web.cache.maxEntries` | number | `50` | No | Max cache entries | `src/modules/web/cache.ts` |
| `web.cache.ttlMs` | number | `300000` | No | Cache TTL in ms | `src/modules/web/cache.ts` |

Example:

```json
{
  "web": {
    "cache": {
      "enabled": true,
      "maxEntries": 100,
      "ttlMs": 600000
    }
  }
}
```

## Web concurrency configuration

Source: `src/modules/web/concurrency.ts`, `src/modules/web/register.ts`.

| Key | Type | Default | Required | Purpose | Related source |
|---|---|---:|---|---|---|
| `web.concurrency.maxConcurrent` | number | `3` | No | Max simultaneously executing web requests | `src/modules/web/concurrency.ts` |
| `web.concurrency.maxQueueSize` | number | `10` | No | Max waiting queue length | `src/modules/web/concurrency.ts` |

Example:

```json
{
  "web": {
    "concurrency": {
      "maxConcurrent": 2,
      "maxQueueSize": 20
    }
  }
}
```


## Jina Reader configuration

Source: `DEFAULT_WEB_CONFIG`, `src/modules/web/fetch.ts`, `src/modules/web/security.ts`, `src/modules/web/schemas.ts`.

| Key | Type | Default | Required | Purpose | Related source |
|---|---|---:|---|---|---|
| `web.enableJinaFallback` | boolean | `false` | No | Whether to enable Jina Reader fallback. When not enabled, `preferReader` also won't trigger Jina | `src/modules/web/fetch.ts` |
| `web.jinaTimeoutMs` | number | `8000` | No | Jina request timeout in ms | `src/modules/web/fetch.ts` |
| `web.jinaTriggers` | string[] | `["short-html", "js-heavy-html"]` | No | Auto-trigger Jina conditions; empty array means no auto-trigger, but `preferReader` still works when fallback enabled | `src/modules/web/fetch.ts` |

`fetch_content` tool schema also has parameter:

```json
{
  "preferReader": true
}
```

It is not a config item, but a single tool call parameter. Private network URLs are not sent to Jina to avoid leaking localhost/private network addresses.

Example: enable Jina fallback.

```json
{
  "web": {
    "enableJinaFallback": true,
    "jinaTimeoutMs": 8000,
    "jinaTriggers": ["short-html", "js-heavy-html"]
  }
}
```

## Convert content configuration

`convert_content` is an optional document conversion tool. The current public tool supports local `path` conversion and remote `url` conversion through the configured MarkItDown CLI provider. Remote URLs are safely downloaded to a temporary file before conversion. TUI renderers and toolkit-level activity integration are implemented. The MarkItDown provider uses shared external command infrastructure for command resolution/execution while keeping convert-specific validation and error mapping in `src/modules/convert/provider.ts`.

Source: `DEFAULT_CONVERT_CONTENT_CONFIG`, `normalizeConvertContentConfig()`, `src/modules/convert/index.ts`, `src/modules/convert/schemas.ts`, `src/modules/convert/errors.ts`, `src/modules/convert/provider.ts`, `src/modules/convert/renderers.ts`, `src/modules/convert/observability.ts`.

| Key | Type | Default | Required | Purpose | Related source |
|---|---|---:|---|---|---|
| `convertContent.enabled` | boolean | `true` | No | Whether to register the `convert_content` tool | `src/modules/convert/index.ts` |
| `convertContent.provider` | `markitdown` | `markitdown` | No | Conversion provider name. Current config normalizes all values to `markitdown` | `src/config/load-config.ts` |
| `convertContent.command` | string | `markitdown` | No | External MarkItDown CLI command/path used by the internal MarkItDown provider; resolved/executed through shared external command infrastructure | `src/config/load-config.ts`, `src/modules/convert/provider.ts`, `src/shared/external-command.ts` |
| `convertContent.timeoutMs` | number | `30000` | No | Timeout in ms for remote download and MarkItDown provider execution; must be positive integer | `src/config/load-config.ts`, `src/modules/convert/security.ts`, `src/modules/convert/provider.ts` |
| `convertContent.maxResponseBytes` | number | `10485760` | No | Max local/remote source bytes for conversion execution; must be positive integer | `src/config/load-config.ts`, `src/modules/convert/security.ts`, `src/modules/convert/provider.ts` |
| `convertContent.maxContentChars` | number | `50000` | No | Max returned Markdown characters; provider output beyond this limit is truncated with `truncated=true` | `src/config/load-config.ts`, `src/modules/convert/provider.ts` |
| `convertContent.allowPrivateNetwork` | boolean | `false` | No | Whether URL download may access private-network targets; defaults to blocked. Every redirect hop is revalidated with this policy | `src/config/load-config.ts`, `src/modules/convert/security.ts` |

Current tool schema fields:

```json
{
  "path": "./document.pdf",
  "url": "https://example.com/document.pdf",
  "maxContentChars": 50000,
  "timeoutMs": 30000
}
```

`path` and `url` are mutually exclusive at execution time; providing both or neither returns `INVALID_INPUT`. `path` converts an existing local file inside the active workspace (`process.cwd()` for the extension process) through MarkItDown; paths outside the workspace return `INVALID_INPUT`. `url` is validated, safely downloaded to a temporary file, size-limited by `maxResponseBytes`, converted through MarkItDown, and then cleaned up. URL redirects are followed manually and each hop reruns private-network validation.

Example: disable convert_content registration.

```json
{
  "convertContent": {
    "enabled": false
  }
}
```

Example: configure MarkItDown command path.

```json
{
  "convertContent": {
    "command": "/usr/local/bin/markitdown"
  }
}
```

## Commands configuration

Public command list, parameters, output, and failure semantics: [`toolkit-commands.md`](./toolkit-commands.md).

Source: `DEFAULT_CONFIG.commands`, `normalizeCommandsConfig()`, `src/modules/commands/register.ts`.

| Key | Type | Default | Required | Purpose | Related source |
|---|---|---:|---|---|---|
| `commands.enabled` | boolean | `true` | No | Whether to enable unified `/toolkit` developer command. Subagent processes never register this command | `src/modules/commands/register.ts` |

Current `/toolkit` subcommands:

```text
doctor, modules, logs, agents, lsp, activity, help
```

Example:

```json
{
  "commands": {
    "enabled": false
  }
}
```

## Guards configuration

Source: `DEFAULT_GUARDS_CONFIG`, `normalizeGuardsConfig()`, `src/modules/guards/*`.

Guards provide lightweight notices plus optional gate modes. They use UI notification/status channels when available.

| Key | Type | Default | Required | Purpose | Related source |
|---|---|---:|---|---|---|
| `guards.enabled` | boolean | `true` | No | Whether to register guards in the main agent process | `src/modules/guards/index.ts` |
| `guards.mode` | `"off" \| "notice" \| "confirm" \| "block"` | `"notice"` | No | Guard operating mode (`off` disables all guards, `notice` keeps reminders only, `confirm`/`block` enable gate flow) | `src/modules/guards/policies/mode.ts`, `src/modules/guards/gates/register.ts` |
| `guards.nonInteractivePolicy` | `"allow" \| "deny"` | `"allow"` | No | Decision policy for `mode="confirm"` when interactive confirm UI is unavailable | `src/modules/guards/gates/register.ts` |
| `guards.blockMode` | `"preview" \| "soft" \| "hard"` | `"soft"` | No | Deny behavior for gate flow (`hard` throws structured hard-block error) | `src/modules/guards/gates/register.ts`, `src/modules/guards/errors.ts` |
| `guards.gitContextNotice` | boolean | `true` | No | After the first tool result in a session, show repo/branch/worktree context once when the current cwd is inside a git worktree | `src/modules/guards/git-context.ts` |
| `guards.firstWriteReminder` | boolean | `true` | No | Before the first likely write tool call in a session, show current branch/worktree context once | `src/modules/guards/index.ts`, `src/modules/guards/tool-classifier.ts` |
| `guards.verificationReminder` | boolean | `true` | No | At agent end, if the current turn appears to have modified files but no verification command was detected, show a soft reminder | `src/modules/guards/index.ts`, `src/modules/guards/command-classifier.ts` |

Current behavior: `gitContextNotice`, `firstWriteReminder`, and `verificationReminder` are implemented. Git commands use a short timeout and silently degrade when git is unavailable, the cwd is not a git repo, or git commands fail. Write classification is conservative: explicit file-editing tools are treated as writes, and `bash`/`shell` are only treated as writes for obvious mutating commands such as redirection, `rm`, `mv`, `cp`, `sed -i`, `tee`, `apply_patch`, selected `git` mutating commands, or package installs. Verification classification is also conservative and recognizes common test/lint/typecheck/build commands. Examples include, but are not limited to: `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm run test`, `pnpm run lint`, `pnpm run typecheck`, `npm test`, `npm run test`, `npm run lint`, `npm run typecheck`, `yarn test`, `yarn lint`, `yarn typecheck`, `tsc --noEmit`, `cargo test`, `cargo check`, `pytest`, `uv run pytest`, `go test`, `cmake --build`, `ctest`, and `biome check`. Subagent child processes do not register guards.

### Guards mode combination matrix

| mode | nonInteractivePolicy | blockMode | Effective behavior |
|---|---|---|---|
| `off` | any | any | Guards not registered |
| `notice` | any | any | Reminder-only flow (`gitContextNotice` / `firstWriteReminder` / `verificationReminder`) |
| `confirm` | `allow` | `preview`/`soft` | Non-interactive fallback allows potential write tool calls |
| `confirm` | `deny` | `preview`/`soft` | Non-interactive fallback emits deny decision (`deny_soft`), no hard throw |
| `confirm` | `deny` | `hard` | Non-interactive fallback emits hard deny and throws `GUARD_HARD_BLOCKED` |
| `block` | any | `preview`/`soft` | Gate emits deny decision (`deny_soft`), no hard throw |
| `block` | any | `hard` | Gate hard-blocks and throws `GUARD_HARD_BLOCKED` |

Misconfiguration guidance:

- If you want no interruption, keep `mode="notice"` (recommended default path).
- If you enable `mode="confirm"` in non-interactive environments, set `nonInteractivePolicy` explicitly.
- Use `blockMode="hard"` only when explicit hard-block behavior is intended in automation/CI.

Example:

```json
{
  "guards": {
    "gitContextNotice": false
  }
}
```

## Common combination examples

### Minimal: only enable subagents

```json
{
  "web": { "enabled": false },
  "lsp": { "enabled": false },
  "commands": { "enabled": false },
  "subagents": { "enabled": true }
}
```

### Enable web auto provider with cache

```json
{
  "web": {
    "provider": "auto",
    "cache": {
      "enabled": true,
      "maxEntries": 50,
      "ttlMs": 300000
    }
  }
}
```

### Disable LSP hook but retain subagent readonly LSP

```json
{
  "lsp": {
    "tool": { "enabled": true },
    "hook": { "enabled": false }
  },
  "subagents": {
    "allowLspTools": true,
    "allowedLspActions": ["definition", "references", "hover", "symbols", "diagnostics", "servers"]
  }
}
```

## Known environment / future notes

1. **`subagents.allowWrite` is not a stable write-capability contract**
   - Configuration item exists, defaults to `false`.
   - Currently recorded as experimental/advanced/unsafe switch; default and recommended mode is still readonly.
   - If formally supporting writable custom subagents in the future, permission strategy, audit logging, rollback recommendations, and test coverage should be supplemented separately.

2. **LSP language server availability depends on local environment**
   - Configuration only controls whether devkit-pi registers tools/hooks, not automatic language server installation.
