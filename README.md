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

Writable custom subagents are experimental. The default and recommended mode is readonly; `subagents.allowWrite=true` does not provide a complete sandbox, audit trail, or rollback guarantee. See [Subagents reference](docs/reference/subagents.md) and [Security model](docs/guides/security-model.md).

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

Config file: `~/.pi/agent/extensions/devkit-pi/config.json`.

Each module can be independently enabled or disabled. See [Configuration reference](docs/reference/configuration.md) for the canonical defaults and normalize rules.

## Error Codes

### Subagent errors

`INVALID_INPUT` | `SUBAGENTS_DISABLED` | `UNKNOWN_AGENT` | `SUBAGENT_DISABLED` | `SUBAGENT_DEPTH_EXCEEDED` | `SUBAGENT_TIMEOUT` | `SUBAGENT_FAILED` | `SUBAGENT_OUTPUT_TRUNCATED`

### Web tool errors

Web tools return structured errors with `error.code` and `error.message`. Common codes include `INVALID_INPUT`, `WEB_SEARCH_INVALID_QUERY`, `WEB_SEARCH_FAILED`, `WEB_SEARCH_TIMEOUT`, `PROVIDER_AUTH_FAILED`, `PROVIDER_RATE_LIMITED`, `PROVIDER_UNAVAILABLE`, `NETWORK_ERROR`, `CONTENT_FETCH_INVALID_URL`, `CONTENT_FETCH_FAILED`, `CONTENT_FETCH_TIMEOUT`, and `NOT_FOUND`.

See the canonical list in [Web tools error codes](docs/reference/web-tools-error-codes.md).

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
3. Default readonly — write capability requires explicit configuration and remains experimental for custom subagents
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

- [Documentation index](docs/README.md)
- [Reference index](docs/reference/README.md)
- [Goals and scope](docs/guides/goals-and-scope.md)
- [Architecture](docs/guides/architecture.md)
- [Configuration reference](docs/reference/configuration.md)
- [Subagents reference](docs/reference/subagents.md)
- [Subagent tool reference](docs/reference/subagent-tool.md)
- [Agent definition](docs/reference/agent-definition.md)
- [Result schema](docs/reference/result-schema.md)
- [Toolkit commands reference](docs/reference/toolkit-commands.md)
- [LSP tools reference](docs/reference/lsp-tools.md)
- [Web tools reference](docs/reference/web-tools.md)
- [Web providers reference](docs/reference/web-providers.md)
- [Web tools error codes](docs/reference/web-tools-error-codes.md)
- [Security model](docs/guides/security-model.md)
- [Architecture Decision Records](docs/adr/README.md)

## License

MIT © Izayoi Nayuta
