---
status: proposed
audience: maintainer
last_verified: 2026-05-13
language: english
---

# Personal Comprehensive pi Coding Toolkit Feature Roadmap

## Purpose

This document records common AI coding agent / developer tooling features worth adding to `devkit-pi`.

## Current Project State

**The project has evolved into `devkit-pi`** since v0.1.0. Current coverage:

```text
✅ subagents: task delegation, code navigation, review, research, implementation planning, test planning
✅ web: web_search, fetch_content, get_search_content
✅ lsp: definition, references, hover, symbols, diagnostics, automatic diagnostics hook
✅ convert: convert_content tool (MarkItDown CLI provider)
✅ commands: unified /toolkit command center
```

**Current implemented module structure:**

```text
devkit-pi/
├─ src/
│  ├─ index.ts              # entry point
│  ├─ modules/
│  │  ├─ subagents/         # subagent delegation system
│  │  ├─ web/               # web search and content fetching (6 providers)
│  │  ├─ lsp/               # LSP code intelligence + diagnostics hook
│  │  ├─ convert/           # file-to-Markdown conversion (MarkItDown CLI)
│  │  └─ commands/          # /toolkit commands
│  ├─ config/
│  │  └─ load-config.ts     # config loading and normalization
│  └─ shared/
│     ├─ types.ts           # core types
│     ├─ errors.ts          # error code definitions
│     ├─ activity.ts        # activity records
│     └─ external-command.ts # external command runner
├─ agents/                   # 5 builtin agent definitions
│  ├─ explorer.md
│  ├─ researcher.md
│  ├─ reviewer.md
│  ├─ implementer.md
│  └─ tester.md
└─ tests/                    # unit tests mirroring src/modules
```

**Implemented /toolkit subcommands:**

| Command | Function |
|---------|----------|
| `/toolkit doctor` | Run toolkit configuration/dependency health checks |
| `/toolkit modules` | Show module enablement status |
| `/toolkit logs` | Show recent toolkit activity (web search/fetch/get_content and convert) |
| `/toolkit agents` | List builtin/user/project agents |
| `/toolkit lsp` | Show LSP tool/hook configuration |
| `/toolkit activity` | Open the activity panel |
| `/toolkit help` | Show help |

The next stage should not prioritize adding more complex agents. Instead, it should complete workflow infrastructure common to mainstream AI coding tools: project status/context building, Git integration, check command encapsulation, hooks, diagnostics aggregation, task tracking, and safe undo. Project rules and session compaction should rely on pi platform capabilities and should not be duplicated in devkit-pi.

## Reference Tools and Common Capabilities

Common AI coding agent / developer tooling in the community and on GitHub includes:

- Claude Code
- Aider
- Cursor
- Continue
- Cline / Roo Code
- OpenHands
- SWE-agent / mini-swe-agent

These tools converge around this workflow:

```text
Project rules / memory
→ Codebase understanding / context selection
→ Planning
→ File editing
→ lint / test / diagnostics
→ Git diff / commit / undo
→ Session compaction / continue task
```

Therefore, this project should prioritize workflow primitives instead of immediately implementing MCP, vector databases, IDE autocomplete, or complex multi-agent orchestration.

## Overall Priority

> **Note**: this table lists features that are not yet implemented. Implemented features are shown above.

| Priority | Feature | Value | Complexity | Recommendation |
|---|---|---:|---:|---:|
| P0 | project_status / project status aggregation | Very high | Medium | ⭐⭐⭐ Strongly recommended |
| P0 | ~~Project memory / rules file~~ | Very high | Low | ❌ Do not implement |
| P1 | run_check: check command wrapper | High | Low-Medium | ⭐⭐⭐ Strongly recommended |
| P1 | Git integration: status, diff, commit, undo | Very high | Medium | ⭐⭐⭐ Strongly recommended |
| P1 | Hooks: deterministic automation | High | Medium | ⭐⭐ Recommended |
| P1 | diagnose: diagnostics aggregation | High | Medium | ⭐⭐ Recommended |
| P2 | Plan / Act workflow | Medium-high | Low-Medium | ⭐⭐ Recommended |
| P2 | Todo / task tracker | Medium-high | Low | ⭐⭐ Recommended |
| P2 | ~~Context compaction / session summary~~ | High | Medium-high | ❌ Do not implement |
| P2 | Per-turn undo / Undo | Medium-high | Medium | ⭐⭐ Recommended |
| P2 | ~~ADR / docs helper~~ | Medium-high | Low-Medium | ❌ Do not implement |
| P2 | Permission system enhancement | Medium-high | Medium | ⭐⭐ Recommended |
| P2 | ~~Changelog / release notes~~ | Medium | Low-Medium | ❌ Do not implement |
| P3 | GitHub issue / PR helper | Medium | Medium | ⭐ Optional |
| P3 | Repo map advanced / embedding search | Medium-high | High | ⏸️ Defer |
| P3 | ~~MCP integration~~ | Medium | High | ❌ Do not implement |
| P3 | ~~IDE inline edit / autocomplete~~ | Medium | Very high | ❌ Do not implement |

## Current Module Diagram

Implemented features are organized by capability domain:

```text
devkit-pi
├─ agents
│  ├─ subagent                ✅ Implemented (5 builtin agents)
│  ├─ explorer                ✅ Implemented
│  ├─ reviewer                ✅ Implemented
│  ├─ researcher              ✅ Implemented
│  ├─ implementer             ✅ Implemented
│  └─ tester                  ✅ Implemented
├─ intelligence
│  ├─ lsp                     ✅ Implemented (tool + diagnostics hook)
│  └─ (project_status)        🔄 To implement (P0)
├─ research
│  ├─ web_search              ✅ Implemented (6 providers)
│  ├─ fetch_content           ✅ Implemented
│  └─ get_search_content      ✅ Implemented
├─ (workflow)                 🔄 To implement (P2)
│  ├─ todo
│  ├─ plan
│  └─ (undo)                  🔄 To implement (P2)
├─ (validation)               🔄 To implement (P1)
│  ├─ run_check
│  ├─ diagnose
│  └─ hooks
├─ (vcs)                      🔄 To implement (P1)
│  ├─ git_status
│  ├─ git_diff
│  ├─ git_commit
│  └─ git_undo
├─ convert                    ✅ Implemented (MarkItDown CLI provider)
├─ commands                   ✅ Implemented (/toolkit command center)
├─ docs
│  └─ adr                     ✅ Present (manually maintained)
└─ CHANGELOG.md               ✅ Present (manually maintained)
```

---

# P0 Features

## 1. Project Memory / Rules File

### Background

Most mainstream tools have project-level rules mechanisms:

| Tool | Similar capability |
|---|---|
| Claude Code | `CLAUDE.md` |
| Cursor | `.cursorrules` / project rules |
| Cline | `.clinerules` |
| Roo Code | `.roorules` |
| Aider | `.aider.conf.yml` / repo instructions |
| Continue | rules / context providers |

This has very high ROI because it lets agents automatically receive project conventions, common commands, and maintainer preferences.

### Current Status

**❌ Do not implement** — the pi platform already has built-in `AGENTS.md` automatic injection, so this project should not duplicate it.

### Analysis

The pi platform resource discovery pipeline already provides:

1. **Automatic AGENTS.md injection**: pi loads the project-root `AGENTS.md` into agent context.
2. **Project-level priority**: resources under `.pi/` override global resources (`~/.pi/agent/`).
3. **Prompt templates**: project templates under `.pi/prompts/*.md` are supported.
4. **Extensions**: lifecycle hooks can inject custom context.

Therefore, `AGENTS.md` already covers project rule injection. devkit-pi does not need an additional rules-file loader.

### Related Files

- `AGENTS.md` — current architecture and development guidelines.
- `.pi/prompts/` — optional project-level prompt templates.

### Priority

**Do not implement** — rely on pi platform built-ins.

---

## 2. project_status / Project Status Aggregation

### Background

The toolkit already has subagents, web tools, and LSP, but lacks a compact way to summarize the current project state.

This complements AGENTS.md: AGENTS.md tells the agent how to work; project_status tells the agent what the project currently looks like.

Similar capabilities include:

- Aider repo map (lightweight version)
- Cursor / Continue codebase context
- Claude Code project status summary

### Current Status

**🔄 To implement** — the project does not yet implement a `project_status` tool.

### Relationship with Existing Commands

| Command | Purpose | Audience |
|------|------|------|
| `/toolkit modules` | Human-readable module status | Developer |
| `/toolkit doctor` | Human-readable diagnostics report | Developer |
| `project_status` | Compact context for the agent | Agent |

### Suggested Tool

```ts
project_status({
  mode: "overview" | "focused" | "health",
  paths?: string[],
  includeGit?: boolean,
  includeLsp?: boolean
})
```

### Modes

| mode | Description |
|---|---|
| `overview` | Project overview: package manager, language, directory structure, modules |
| `focused` | Context for specified files/directories: summary, key symbols |
| `health` | Project health: git status, LSP diagnostics, important file changes |

### Output Examples

**overview mode:**

```text
Project: devkit-pi
Package manager: pnpm (v11.1.1)
Language: TypeScript ESM
Main entry: src/index.ts

Modules: subagents, web (6 providers), lsp, convert, commands
Agent count: 5 (explorer, researcher, reviewer, implementer, tester)
Validation: pnpm typecheck | pnpm test | pnpm lint | pnpm docs:check
```

**focused mode targeting `src/config/`:**

```text
src/config/
├─ load-config.ts (primary)
│  - loadConfig(), mergeConfig(), normalize*()
│  - Config namespaces: web, subagents, lsp, convertContent, commands

Related files: src/shared/types.ts (ToolkitConfig types)
```

**health mode:**

```text
Health: mixed

Git: 2 files changed (1 tracked, 1 untracked)
- modified: docs/zh/planning/personal-toolkit-feature-roadmap.md
- new: src/modules/xxx/temp.ts

LSP: 0 errors, 2 warnings
- src/config/load-config.ts: unused variable 'debugMode'

Key files: AGENTS.md exists, package.json valid
```

### Implementation Suggestion

First version should focus on `overview` and `health`:

1. Parse `package.json` for project information.
2. Confirm `AGENTS.md` exists and record line count.
3. List `src/modules/` and `agents/` structure.
4. Run `git status --porcelain` for change state.
5. Reuse the LSP manager in `src/modules/lsp/core.ts`, or extract a public helper, to summarize errors/warnings. Avoid coupling through tool-to-tool calls.

`focused` can be added later using LSP `symbols` and file trees.

### Difference from AGENTS.md

| Dimension | AGENTS.md | project_status |
|------|-----------|----------------|
| Content | Rules, decisions, process | Files, state, metrics |
| Update frequency | Manual | Real-time query |
| Purpose | Guide agent behavior | Provide current context |

### Priority

**P0** — project status awareness is fundamental for efficient agent work.

---

# P1 Features

## 3. run_check: Check Command Wrapper

### Background

The agent can run shell commands directly, but a dedicated tool would be more stable, safer, and more token-efficient.

### Current Status

**🔄 To implement** — the project does not yet implement `run_check`. `/toolkit doctor` provides some toolkit health checks, but does not wrap or run project typecheck/lint/test/docs commands.

### Design Principles

**Hybrid approach**: project auto-detection + config override + default commands.

- Prefer user-configured custom commands.
- For Node/TypeScript projects, prefer existing `package.json` scripts and the current package manager, such as `pnpm typecheck`.
- Then auto-detect project type and use default commands.
- Make common multi-language projects work out of the box.
- Write-like checks such as `format` or `lint --fix` must require explicit `fix=true` or safety config approval.

### Project Type Detection

Detect by root markers:

| Project type | Marker files | Notes |
|----------|----------|------|
| TypeScript / Node.js | `package.json` | Current project |
| Rust | `Cargo.toml` | |
| Go | `go.mod` | |
| Python | `pyproject.toml` / `requirements.txt` | |
| Generic | `Makefile` | Custom checks |
| Unknown | — | No default command |

### Default Command Mapping

| Type | typecheck | test | lint | format |
|------|-----------|------|------|--------|
| **node** | Prefer `<pm> typecheck`, else `tsc --noEmit` | Prefer `<pm> test` | Prefer `<pm> lint` | Prefer check-style `<pm> format`; write mode requires `fix=true` |
| **rust** | `cargo check` | `cargo test` | `cargo clippy` | `cargo fmt` |
| **go** | `go vet ./...` | `go test ./...` | `golangci-lint run` | `gofmt -w .` |
| **python** | `mypy .` | `pytest` | `ruff check .` | `ruff format .` |
| **generic** | none | none | none | none |

### Suggested Tool

```ts
run_check({
  kind: "typecheck" | "lint" | "test" | "format" | "docs" | "custom",

  // Optional: language override. Default: auto.
  language?: "auto" | "typescript" | "rust" | "go" | "python" | "generic",

  // Optional: custom command. Overrides default and config.
  command?: string,

  // Optional: fix mode, only for lint/format.
  fix?: boolean,

  // Optional timeout in milliseconds.
  timeoutMs?: number
})
```

### Configuration

```json
{
  "checks": {
    "typecheck": "pnpm typecheck",
    "lint": "pnpm lint",
    "lintFix": "pnpm lint:fix",
    "test": "pnpm test",
    "format": "pnpm format",
    "docs": "pnpm docs:check"
  }
}
```

Command source priority:

```text
1. Explicit command parameter (highest priority)
2. Configured command for the selected kind
3. Project-type default command
4. If no default exists, return a structured skipped/error result
```

### Output Format

**Success:**

```text
check: typecheck
status: passed
duration: 1.234s
language: typescript
```

**Failure:**

```text
check: typecheck
status: failed (3 errors)
duration: 2.456s
language: typescript

1. src/config/load-config.ts:142:17
   Invalid hook mode: expected "agent_end", "edit_write", or "disabled".

2. src/shared/types.ts:231:5
   Type 'undefined' is not assignable to type 'ResolvedLspConfig'.

3. src/modules/web/handlers.ts:89:3
   Parameter 'url' implicitly has 'any' type.

suggested_next_step: Fix type errors in config and types modules.
```

**No default command:**

```text
check: typecheck
status: skipped
reason: No default command for generic project type.
        Configure checks.typecheck in settings or pass command parameter.
```

### Implementation Suggestion

**First version (config-driven):**

1. Parse `checks` command mapping from user config.
2. Use configured command if present.
3. If absent and `language=auto`, detect project type.
4. Use project-type defaults.

**Later extensions:**

1. Add `list_defaults` mode.
2. Add `validate_config` mode.
3. Support `.toolkitignore` for excluding checks.

### Priority

**P1** — low implementation cost and high daily value.

---

## 4. Git Integration

### Background

Git integration is central to Aider, Claude Code, and similar coding agents. It makes agent changes traceable, committable, and reversible.

### Current Status

**🔄 To implement** — the project does not yet implement Git integration tools.

### Suggested Tools

Split into small tools:

```ts
git_status()
git_diff({ staged?: boolean, path?: string })
git_commit({ message?: string, autoMessage?: boolean })
git_undo({ scope?: "last-ai-change" | "working-tree" })
```

Or unify as:

```ts
git_tool({
  action: "status" | "diff" | "commit" | "undo" | "log" | "snapshot",
  path?: string,
  message?: string,
  autoMessage?: boolean
})
```

### Recommended Capabilities

#### Pre-change snapshot

Record before the agent starts modifying files:

```text
HEAD commit
working tree status
modified files
```

#### Post-change diff summary

```text
Changed files:
- src/config/load-config.ts
- src/shared/types.ts

Summary:
- Added lsp config namespace.
- Updated web provider configuration.
```

#### Automatic commit message

Generate conventional commit style messages:

```text
feat: add namespace config for toolkit modules
```

#### Undo

Possible implementations:

- Based on `git restore`.
- Based on saved patches.
- Based on AI change snapshots.

### Safety Strategy

Never auto-commit by default. Commit only when the user explicitly calls the tool or enables a config option.

### Priority

**P1**.

---

## 5. Hooks: Deterministic Automation

### Background

Prompts are probabilistic; the model may forget to run format/test. Hooks are deterministic and execute every time a trigger occurs.

Claude Code hooks demonstrate that this is useful.

### Current Status

**🔄 To implement** — the project does not yet implement a generic workflow hooks mechanism. It only implements the LSP diagnostics hook (`lsp.hook.mode = "agent_end" | "edit_write" | "disabled"`).

### Suggested Events

First version should support a small number of high-value events:

```text
after_edit    # can be captured from pi write/edit tool_result events
agent_end     # pi already has an agent_end event
before_commit # not a pi built-in event; should be triggered by the future git tool
```

Future extensions:

```text
session_start
before_tool
after_tool
after_write
session_end
```

### Configuration Example

```json
{
  "hooks": {
    "afterEdit": [
      {
        "match": "**/*.{ts,tsx,js,json,md}",
        "run": "pnpm format",
        "timeoutMs": 300000
      }
    ],
    "agentEnd": [
      {
        "run": "pnpm typecheck",
        "timeoutMs": 300000
      }
    ],
    "beforeCommit": [
      {
        "run": "pnpm test",
        "timeoutMs": 300000
      }
    ]
  }
}
```

### Safety Strategy

- Hooks should be disabled by default or limited to allowlisted commands.
- Hook output must be truncated.
- Hook failures should return clear errors but must not crash the extension.

### Priority

**P1**.

---

## 6. diagnose: Diagnostics Aggregation

### Background

After adding LSP, diagnostics sources multiply:

```text
LSP diagnostics
+ typecheck
+ lint / biome / eslint
+ tests
+ docs check
+ package manifest checks
```

If the agent calls and merges these separately, it wastes tokens. A unified diagnostics aggregation tool should exist.

### Current Status

**🔄 To implement** — the project does not yet implement `diagnose`. `/toolkit doctor` provides toolkit configuration/dependency health checks (config, agents, providers, permissions, Web/LSP enablement), but it is not code diagnostics aggregation. It does not run typecheck/lint/test/docs and does not summarize workspace LSP diagnostics.

### Suggested Tool

```ts
diagnose({
  scope: "file" | "changed" | "workspace",
  file?: string,
  include?: ["lsp", "typecheck", "lint", "test", "docs"]
})
```

### Output Example

```text
Workspace Health: failed

LSP:
- 0 errors

Typecheck:
- 2 errors in src/config/load-config.ts

Lint:
- 1 formatting issue

Tests:
- not run

Suggested next step:
- Fix config type definitions first, then rerun typecheck.
```

### Priority

**P1/P2**. Implement after the LSP tool and run_check are stable.

---

# P2 Features

## 7. Plan / Act Workflow

### Background

Many tools distinguish planning and execution:

| Tool | Similar capability |
|---|---|
| Cline | Plan / Act |
| Roo Code | Architect / Code |
| Aider | Architect mode |
| Claude Code | plan mode / extended thinking |

The project already has an `implementer` subagent; it can be productized into a plan workflow.

### Current Status

**🔄 To implement** — the `implementer` agent can already be used indirectly through the `subagent` tool for implementation planning, but it is not productized as a standalone `create_plan` tool or Plan/Act workflow.

### Suggested Tool

```ts
create_plan({
  task: string,
  includeFiles?: boolean,
  includeRisks?: boolean,
  includeValidation?: boolean
})
```

### Output Shape

```json
{
  "summary": "...",
  "filesToInspect": ["..."],
  "filesToChange": ["..."],
  "steps": ["..."],
  "risks": ["..."],
  "validation": ["pnpm typecheck", "pnpm test"]
}
```

### Recommended Workflow

```text
User asks for a task
→ create_plan
→ reviewer reviews the plan
→ user confirms
→ main agent executes
→ run_check / diagnose
```

### Priority

**P2**.

---

## 8. Todo / Task Tracker

### Background

Long tasks need state. A todo tracker helps the agent know the current step.

### Current Status

**🔄 To implement** — the project does not yet implement a todo tracker.

### Suggested Tool

```ts
todo({
  action: "list" | "add" | "update" | "done" | "clear",
  id?: string,
  text?: string,
  status?: "pending" | "in_progress" | "done"
})
```

### Storage

Simple storage options:

```text
.pi/todo.json
```

or Markdown:

```text
.pi/todo.md
```

### Example

```text
[done] Inspect current config structure
[in_progress] Add lsp config namespace
[pending] Register lsp tool
[pending] Add tests
[pending] Update README
```

### Priority

**P2**. Low complexity and useful for long tasks.

---

## 9. Context Compaction / Session Summary

### Background

When conversations become long, agents may forget earlier decisions. Mainstream tools commonly provide:

- automatic conversation summaries
- manual `/compact`
- session summary / handoff summary

### Current Status

**❌ Do not implement** — the pi platform already has full session compaction and session management.

### Analysis

pi already implements:

| Capability | Description | Trigger |
|------|------|----------|
| Auto compaction | Triggered when context approaches the limit | Automatic |
| Manual compaction | `/compact [instructions]` | User-triggered |
| Branch summary | Summary when switching branches | `/tree` navigation |
| Structured format | Goal, Progress, Key Decisions, Next Steps | Automatic |
| Persistence | JSONL session files include complete history | Automatic |

The original proposed subfeatures overlap with pi mechanisms:

| Proposed feature | Problem |
|----------|------|
| **Persistent summaries** | Session JSONL already contains `CompactionEntry`; no duplicate storage needed |
| **Task-level summaries** | pi `/fork` isolates tasks more reliably |
| **Date archives** | Edge feature; filesystem search is sufficient |

**Root reason**: pi treats sessions as isolated reasoning units. Carrying old summaries across sessions can pollute context.

### Related pi Mechanisms

- `/compact` — session compaction
- `/tree` — branch navigation + summary
- Session JSONL — persistent storage
- `session_before_compact` — custom compaction logic via extensions

### Priority

**Do not implement** — rely on pi platform built-ins.

---

## 10. Per-turn Undo / Undo

### Background

After the agent edits files, the user may dislike the result. Current options:

| Option | Problem |
|------|------|
| Ask the agent to edit again | Adds conversation turns and may be slower |
| Manually run `git restore` | Requires user action and is less convenient |

An agent-controllable undo mechanism is useful.

### Current Status

**🔄 To implement** — pi's built-in fork/branch capabilities are session-level and do not affect files.

### Design Principle

**Per-turn mode**: record file snapshots at the end of each turn and allow reverting all file changes from a turn.

### Key Difference from `/tree`

| Operation | Session leaf | LLM context | File state |
|------|------------------|------------|----------|
| `/tree` | Moves to a selected entry. Selecting a user entry moves to its parent and puts the prompt back in the editor; selecting assistant/tool/etc. moves to that entry | Only messages on the selected tree path | ❌ Unchanged |
| **`/undo`** | ❌ Unchanged | ✅ Keeps full context | ✅ Rolls files back to previous turn |

**Example:**

```text
Turn 3: user says "fix this bug" and the agent edits files incorrectly.

User: /undo
→ Session remains at Turn 3
→ LLM context still includes the "fix this bug" conversation
→ Files roll back to the Turn 2 state

User: use formatDate instead of formatTime
→ Agent understands the context and edits again
```

**Compared with `/tree`:**

```text
Turn 3: user says "fix this bug" and the agent edits files incorrectly.

User: /tree Turn 2
→ Session leaf is adjusted according to the selected entry
→ LLM context only includes messages on the new tree path
→ Files remain in the post-Turn-3 state

User: needs to describe the task again
```

### Suggested Tool

```ts
undo({
  action: "list" | "preview" | "undo",
  // Optional: number of turns to undo. Default: last.
  target?: "last" | number
})
```

### Related Commands

```text
/undo             — undo last turn's file changes
/undo 3           — undo turn 3
/undo --preview   — preview without applying
/undo --list      — list available checkpoints
```

### Implementation Notes

| Point | Description |
|------|------|
| Snapshot scope | Only save changed files; ignore `.git/`, `node_modules/` |
| Turn marker | Associate with session turn number |
| Retention | Keep last N checkpoints, configurable |
| Differential storage | Use diffs instead of full files |
| Dependency handling | Warn when files have dependencies |

### Output Example

**`/undo --list`**

```text
Checkpoints:
#4  2026-05-13 10:32  "Add formatDate function"
#3  2026-05-13 10:28  "Fix type errors"
#2  2026-05-13 10:20  "Add new module"
```

**`/undo --preview`**

```text
Will revert to checkpoint #3:
- src/utils.ts: remove formatDate()
- src/types.ts: restore original
```

### Priority

**P2** — not highest priority, but significantly improves safety.

---

## 11. ADR / Docs Helper

### Background

The project already uses ADRs and relies heavily on documentation sync. Dedicated docs tooling could be added.

### Current Status

**❌ Do not implement** — tool value is limited and does not fit the lightweight-core principle.

### Analysis

#### Low value for content generation

The value of ADRs is recording architecture decisions. Content generation can already be done directly by pi:

```text
User: record the decision we just discussed as an ADR
pi: directly creates the file
```

A tool that generates ADRs from conversation is not worth implementing because:

1. Users can ask pi directly.
2. Fixed templates have low value and can be copied manually.

#### ADR management varies widely between projects/users

| Dimension | Possible choices |
|-----------|------------------|
| Storage location | `docs/adr/`, `adr/`, `.adr/`, wiki, external system |
| Naming | `0001-title.md`, `title.md`, date-based |
| Template format | Traditional, simplified, table-based, custom |
| Numbering | Centralized numbers, date numbers, no numbers |
| Indexing | Extra index file, directory scan, external database |

Supporting all variants at the tool layer is costly and not worthwhile.

#### Value summary

| Feature | Can pi do directly? | Unique tool value |
|------|-------------------|---------------|
| Content generation | ✅ Yes | ❌ None |
| Template generation | ✅ Yes | ❌ Low |
| Number management | ❌ Harder | ⭐ Medium |
| Listing | ❌ Harder | ⭐ Medium |

**Conclusion**: tool value does not justify implementation cost.

### Recommended Approach

1. Use documentation conventions instead of a tool.
2. Ask pi directly: "create an ADR".
3. Keep the current manual maintenance workflow.

### Priority

**Do not implement** — consistent with the lightweight-core principle.

---

## 12. Permission System Enhancement

### Background

The project already has readonly subagents and `subagents.allowWrite`, but a comprehensive toolkit may need more granular permissions.

### Current Status

**🔄 To implement** — basic permission control exists (`allowWrite`), but fine-grained permissions are not implemented.

### Simplified Configuration

```json
{
  "safety": {
    "allowedWritePaths": ["src/**", "docs/**", "tests/**"],
    "deniedWritePaths": [".git/**", "node_modules/**", "pnpm-lock.yaml"],
    "allowedCommands": [
      "pnpm typecheck",
      "pnpm test",
      "pnpm lint",
      "pnpm format"
    ],
    "deniedCommands": [
      "rm -rf",
      "sudo",
      "curl | sh"
    ],
    "allowedLspActions": [
      "definition",
      "references",
      "hover",
      "signature",
      "symbols",
      "diagnostics",
      "workspace-diagnostics"
    ],
    "deniedLspActions": ["rename", "codeAction", "restart"]
  }
}
```

### Priority

**P2**. Implement before adding more write operations or bash-like hooks.

---

## 13. Changelog / Release Notes

### Background

The project already has `CHANGELOG.md`. Automation could help maintain it.

### Current Status

**❌ Do not implement** — tool value is limited and does not fit the lightweight-core principle.

### Analysis

#### Low value for content generation

| Capability | Implementation | Can pi do directly? | Unique tool value |
|------|----------|-------------------|---------------|
| Generate from git commits | Programmatic | ❌ Harder | ⭐ Medium |
| Generate from changed files | Requires LLM | ✅ Yes | ❌ Low |
| Check version | Programmatic | ✅ Yes | ⭐ Low |
| Remind docs update | Simple rule | ✅ Yes | ⭐ Low |

Core issues:

1. Generating changelog entries from changed files needs LLM content generation and can be done by pi directly.
2. Formatting git commits can be done by scripts.
3. Version checks and reminders can also be handled directly by pi.

#### Similar to ADR / docs helper

- Content generation can be done directly by pi.
- Formatting can be scripted.
- Unique tool value is insufficient.

### Recommended Approach

1. Keep manual `CHANGELOG.md` maintenance.
2. Ask pi directly to generate changelog text.
3. Use simple release scripts if needed.

### Priority

**Do not implement** — consistent with lightweight core.

---

# P3 Features

## 14. GitHub Issue / PR Helper

### Background

The project does not require a GitHub workflow, but helpers may be useful if needed.

### Current Status

**🔄 To implement**

### Suggested Tools

```ts
github_issue({
  action: "list" | "create" | "summarize" | "close"
})
```

```ts
pr_description({
  base?: string,
  includeDiff?: boolean
})
```

### Output Example

```md
## Summary

- Reposition project as personal pi coding toolkit.
- Update deferred LSP merge plan.
- Add staged roadmap for LSP tool and hook integration.

## Test Plan

- Documentation only.
```

### Priority

**P3**. Unless GitHub PR workflow is frequent, this is not a next-stage priority.

---

## 15. Repo Map Advanced / Embedding Search

### Background

Aider's repo map is powerful and uses tree-sitter plus PageRank. Continue and similar tools use vector retrieval.

### Current Status

**🔄 To implement** — a lightweight `project_status` version can be implemented first. If repo map is needed, it can be a `project_status` focused/repo_map mode or a later standalone tool.

### Suggestion

Do not start with embedding search. Start with a lightweight version:

```ts
repo_map({
  path?: string,
  depth?: number,
  includeSymbols?: boolean
})
```

Combined with LSP symbols, output can look like:

```text
src/
├─ extension/
│  ├─ index.ts
│  │  - registerSubagentExtension()
│  │  - registerDeveloperCommands()
├─ config/
│  ├─ load-config.ts
│  │  - loadConfig()
│  │  - mergeConfig()
│  │  - normalizeWebToolsConfig()
```

Advanced features:

- import graph
- reference heat
- task-based related file selection
- embedding search

### Priority

Lightweight repo map: **P2** (prefer merging into `project_status` focused/repo_map mode).  
Advanced repo map / embedding: **P3**.

---

## 16. MCP Integration

### Background

MCP is popular in the community, and Claude Code, Cline, Continue, and other tools support or integrate with it.

### Current Status

**❌ Do not implement** — MCP is relatively heavy and does not fit the lightweight-core principle.

### Analysis

#### Why not now

MCP is not lightweight:

1. **Protocol complexity**: client/server model, resource management, tool calls.
2. **Security boundary**: trust and permission issues for external MCP servers.
3. **Maintenance cost**: the MCP ecosystem changes quickly.

#### Conflict with project principles

| Project principle | MCP problem |
|----------|------------|
| Lightweight core | Protocol itself is relatively heavy |
| Secure by default | External MCP server trust boundaries are complex |
| Introduce on demand | Unnecessary without a clear external ecosystem need |

#### When to reconsider

Only consider MCP when there is a concrete need to reuse external ecosystems:

- GitHub API integration
- Linear / Notion integration
- browser automation (Playwright MCP)
- database querying

Before that:

- Use pi's extension/tool mechanism.
- Use direct HTTP calls.
- Use CLI subprocesses.

### Priority

**Do not implement for now** — consistent with the lightweight-core principle; introduce only on demand.

---

## 17. IDE Inline Edit / Autocomplete

### Background

Cursor, Continue, and similar tools provide strong autocomplete experiences, but this belongs to IDE integration.

### Current Status

**❌ Do not implement in this package** — devkit-pi is a pi TUI turn-based extension and does not implement IDE realtime inline editing/autocomplete. A future separate IDE plugin could theoretically do this, but it is outside this package.

### Analysis

| Dimension | pi | IDE inline edit |
|------|-----|-----------------|
| Interaction | Turn-based, agent edits in batches | Realtime suggestions while typing |
| User control | Review after changes | Accept/reject live |
| Technical requirements | File operations, LLM | IDE plugin, deep LSP/editor integration |

Root issue:

- pi is a TUI terminal tool with a "user describes → agent edits → user reviews" workflow.
- IDE inline edit is a "live suggestion → user accepts → direct insertion" workflow.
- These workflows are fundamentally different.

**Conclusion**: this feature does not fit devkit-pi's positioning and is outside the scope of this package.

### Priority

**Do not implement** — unrelated to this package's positioning.

---

# Recommended Implementation Route

## Phase A: Personal Workflow Infrastructure

Prioritize:

```text
1. project_status tool
2. run_check tool
3. git_tool tool
```

Goal: let the agent understand project state, run checks reliably, and inspect/manage diffs.

## Phase B: Automation and Diagnostics

Implement:

```text
4. hooks
5. diagnose
6. permission system enhancement
```

Goal: turn things we hope the model remembers into deterministic system behavior.

## Phase C: Long-task Support

Implement:

```text
7. todo tracker
8. per-turn undo
9. plan/act workflow
```

Goal: make the agent more stable across multi-turn, multi-file, multi-stage tasks.

## Phase D: Release Assistance (ADR and Changelog Excluded)

Implement:

```text
10. github_issue / pr_description
```

Notes:

- ADR / docs helper is excluded because tool value is limited.
- Changelog / release notes is excluded because tool value is limited.

Goal: reduce maintenance cost for GitHub issue / PR descriptions. ADR and Changelog continue to be generated directly by pi or maintained manually; no dedicated tool.

## Phase E: Advanced Ecosystem Capabilities (On Demand)

Implement only when clearly needed:

```text
14. repo map advanced / embedding search
```

Notes:

- MCP is not considered for now because the protocol is heavy and does not fit the lightweight principle.
- IDE integration is excluded because it does not match the project positioning.

---

## Appendix: Excluded Features and Reasons

The following features are excluded from the roadmap:

| Feature | Reason |
|------|------|
| ~~Project memory / rules file~~ | pi platform already provides AGENTS.md |
| ~~Context compaction~~ | pi platform already provides `/compact` |
| ~~ADR / docs helper~~ | Limited tool value; does not fit lightweight core |
| ~~Changelog / release notes~~ | Limited tool value; can be replaced by scripts |
| ~~MCP integration~~ | Protocol is heavy; does not fit lightweight core; introduce only on demand |
| ~~IDE inline edit / autocomplete~~ | Out of scope; pi is a turn-based TUI tool |

---

> **Note**: This document is continuously updated. Submit an issue or discussion if there are questions or suggestions.
