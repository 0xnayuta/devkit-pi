# devkit-pi

Personal all-in-one pi coding toolkit for agentic coding workflows.

Combines subagents, web research, LSP code intelligence, and developer commands into a single modular pi extension. Automatic diagnostics hooks are planned but not enabled in Phase 3.

## Modules

| Module | Description | Default |
|--------|-------------|---------|
| **subagents** | Delegate tasks to 5 specialized readonly agents | enabled |
| **web** | Web search, URL content fetch, external research | enabled |
| **lsp** | Language Server Protocol: definitions, references, diagnostics, symbols | enabled |

## Quick Start

```bash
pnpm install
pnpm test
pnpm typecheck
```

### As a pi extension

Add to your pi configuration:

```json
{
  "pi": {
    "extensions": ["./src/index.ts"]
  }
}
```

Or install as a pi package (when published):

```bash
pi install devkit-pi
```

## Configuration

Config file: `~/.pi/agent/extensions/devkit-pi/config.json`

```json
{
  "enabled": true,
  "subagents": {
    "enabled": true,
    "maxDepth": 1,
    "timeoutMs": 120000,
    "allowWrite": false,
    "injectDelegationPolicy": true
  },
  "web": {
    "enabled": true,
    "provider": "ddgs",
    "timeoutMs": 10000,
    "maxResults": 5
  },
  "lsp": {
    "enabled": true,
    "tool": {
      "enabled": true,
      "allowMutatingActions": false
    },
    "hook": {
      "enabled": false,
      "mode": "disabled"
    }
  }
}
```

## Built-in Agents

| Agent | Specialty | Permission |
|-------|-----------|------------|
| **explorer** | Code navigation, file search | readonly |
| **researcher** | Documentation, API research | readonly |
| **reviewer** | Code review, architecture analysis | readonly |
| **implementer** | Implementation planning | readonly |
| **tester** | Test strategy, edge case planning | readonly |

## Error Codes

`INVALID_INPUT` | `SUBAGENTS_DISABLED` | `UNKNOWN_AGENT` | `SUBAGENT_DISABLED` | `SUBAGENT_DEPTH_EXCEEDED` | `SUBAGENT_TIMEOUT` | `SUBAGENT_FAILED` | `SUBAGENT_OUTPUT_TRUNCATED`

## Development

```bash
# Type check
pnpm typecheck

# Lint
pnpm lint

# Format
pnpm format

# Run tests
pnpm test
```

## Project Structure

```
src/
├─ index.ts                 # Thin entry point
├─ modules/
│  ├─ subagents/            # Task delegation module
│  ├─ web/                  # Web research module
│  └─ lsp/                  # LSP code intelligence module
├─ config/                  # Configuration loading
└─ shared/                  # Types, errors, utilities
agents/                     # Built-in agent definitions
tests/                      # Mirrors src/modules structure
docs/                       # Documentation and ADRs
```

## License

MIT © Izayoi Nayuta
