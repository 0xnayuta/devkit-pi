# devkit-pi

English | [中文](README.zh.md)

Personal all-in-one pi coding toolkit for agentic coding workflows.

Combines subagents, web research, LSP code intelligence, automatic diagnostics hooks, and developer commands into a single modular pi extension.

## Modules

| Module | Description | Default |
|--------|-------------|---------|
| **subagents** | Delegate tasks to 5 specialized readonly agents; supports user/project custom agents via markdown frontmatter | enabled |
| **web** | `web_search`, `fetch_content`, `get_search_content` — multi-provider search, URL content extraction, result caching | enabled |
| **lsp** | LSP tool (definitions, references, hover, symbols, diagnostics) + auto diagnostics hook on `agent_end` | enabled |
| **commands** | Unified `/toolkit` command center: doctor, modules, logs, agents, lsp, activity | enabled |

## Quick Start

### Install as a pi package

```bash
pi install devkit-pi
```

### Or link locally for development

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

## Built-in Agents

| Agent | Specialty | Permission |
|-------|-----------|------------|
| **explorer** | Code navigation, file search, LSP symbol navigation | readonly |
| **researcher** | Documentation, API research, web search | readonly |
| **reviewer** | Code review, architecture analysis, LSP diagnostics | readonly |
| **implementer** | Implementation planning with LSP definition/reference support | readonly |
| **tester** | Test strategy, edge case planning, LSP diagnostics | readonly |

All agents are readonly by default. The main agent is the sole orchestrator — subagents cannot spawn other subagents.

### Custom agents

Place markdown files in `.pi/agents/` (project) or `~/.pi/agent/agents/` (user):

```md
---
name: custom-reviewer
description: Project-specific reviewer
readonly: true
tools: read, grep, find, ls
---

You are a custom review subagent.
```

## Tools

### Subagent tool

```ts
subagent({ agent: "explorer", task: "Find authentication code" })
```

Delegates a focused task to a specialized agent. Results are sanitized and returned to the parent agent.

### Web tools

| Tool | Description |
|------|-------------|
| `web_search` | Multi-provider web search with auto-fallback. Providers: ddgs (default), brave, tavily, serper, openserp, searxng |
| `fetch_content` | Fetch and extract readable text from URLs. Supports Jina reader fallback for JS-heavy pages |
| `get_search_content` | Retrieve stored search/fetch results by responseId |

### LSP tool

Exposes language server capabilities: `definition`, `references`, `hover`, `signature`, `symbols`, `diagnostics`, `workspace-diagnostics`, `servers`.

Mutating actions (`rename`, `codeAction`, `restart`) are disabled by default and always blocked in subagent processes.

### LSP diagnostics hook

Automatically runs LSP diagnostics after each agent turn (configurable: `agent_end` | `edit_write` | `disabled`).

## Commands

The `/toolkit` command provides diagnostic and inspection subcommands:

| Subcommand | Description |
|------------|-------------|
| `/toolkit doctor` | Run unified diagnostics checks |
| `/toolkit modules` | Show module enablement status |
| `/toolkit logs` | Show recent web activity logs |
| `/toolkit agents` | List all discovered agents |
| `/toolkit lsp` | Show LSP tool/hook configuration |
| `/toolkit activity` | Open interactive activity panel |
| `/toolkit help` | Show usage help |

## Configuration

Config file: `~/.pi/agent/extensions/devkit-pi/config.json`

Full configuration reference with defaults:

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

Each module can be independently enabled or disabled.

## Error Codes

### Subagent errors

`INVALID_INPUT` | `SUBAGENTS_DISABLED` | `UNKNOWN_AGENT` | `SUBAGENT_DISABLED` | `SUBAGENT_DEPTH_EXCEEDED` | `SUBAGENT_TIMEOUT` | `SUBAGENT_FAILED` | `SUBAGENT_OUTPUT_TRUNCATED`

### Web tool errors

`INVALID_INPUT` | `WEB_SEARCH_FAILED` | `PROVIDER_AUTH_FAILED` | `PROVIDER_RATE_LIMITED` | `PROVIDER_UNAVAILABLE` | `WEB_SEARCH_TIMEOUT` | `FETCH_CONTENT_FAILED` | `NETWORK_ERROR` | `CONTENT_TOO_LARGE` | `CONTENT_FETCH_TIMEOUT` | `STORAGE_FULL` | `NOT_FOUND` | `CACHE_DISABLED`

## Project Structure

```text
src/
├─ index.ts                 # Thin entry point — registers all modules
├─ modules/
│  ├─ subagents/            # Task delegation, agent discovery, execution
│  │  └─ commands/          # doctor, list, logs formatting
│  ├─ web/                  # Search, fetch, content extraction, caching
│  │  └─ providers/         # ddgs, brave, tavily, serper, openserp, searxng
│  ├─ lsp/                  # LSP tool, diagnostics hook, server management
│  └─ commands/             # Unified /toolkit command registration
├─ config/                  # Configuration loading and defaults
└─ shared/                  # Types, error codes, utilities
agents/                     # 5 built-in agent definitions (markdown)
tests/                      # Mirrors src/modules structure
docs/                       # Documentation, guides, ADRs
```

## Design Boundaries

1. The main agent is the sole orchestrator
2. Subagents cannot spawn other subagents (`maxDepth = 1`)
3. Default readonly — write capability requires explicit configuration
4. LSP mutating actions (`rename`, `codeAction`, `restart`) are disabled by default and always blocked in subagent processes
5. Each module can be independently enabled or disabled

## Development

```bash
pnpm typecheck    # Type check
pnpm lint         # Lint with Biome
pnpm lint:fix     # Auto-fix lint issues
pnpm format       # Format with Biome
pnpm test         # Run unit tests
pnpm docs:check   # Validate documentation
```

## Documentation

- [Goals and scope](docs/guides/goals-and-scope.md)
- [Architecture](docs/guides/architecture.md)
- [Configuration reference](docs/reference/configuration.md)
- [Agent definition](docs/reference/agent-definition.md)
- [Security model](docs/guides/security-model.md)
- [Architecture Decision Records](docs/adr/README.md)

## License

MIT © Izayoi Nayuta
