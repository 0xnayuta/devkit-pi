---
status: proposed
audience: maintainer
last_verified: 2026-05-12
language: english
---

# Personal pi Coding Toolkit Feature Roadmap

> **⚠️ Status: Proposed / Roadmap — not current behavior.** This document records possible future directions. The features, tools, modules, and interfaces described here are **not part of the current public API** and may never be implemented as described. For the current public surface, see [Reference index](../reference/README.md), `src/`, and `tests/`.

## Purpose

This document records the common AI coding agent / developer tooling features worth adding when evolving from `pi-subagents` and `pi-lsp` to a personal comprehensive pi coding toolkit.

Current project coverage:

```text
subagents: task delegation, code navigation, review, research, implementation planning, test planning
web tools: web_search, fetch_content, get_search_content
lsp: definition, references, hover, symbols, diagnostics, auto-diagnostics hook
```

The next stage should not prioritize adding more complex agents, but rather complete the workflow infrastructure common to mainstream AI coding tools: project memory, context building, Git integration, check command encapsulation, hooks, diagnostic aggregation, task tracking, and session compaction.

## Reference Tools and Common Capabilities

Common AI coding agent / developer tooling on GitHub and in the community includes:

- Claude Code
- Aider
- Cursor
- Continue
- Cline / Roo Code
- OpenHands
- SWE-agent / mini-swe-agent

These tools are highly convergent in functionality, usually organized around:

```text
Project rules / memory
→ Codebase understanding / context selection
→ Planning
→ File editing
→ lint / test / diagnostics
→ Git diff / commit / undo
→ Session compaction / continue task
```

Therefore, this project recommends prioritizing workflow primitives for the next stage, rather than immediately implementing MCP, vector databases, IDE auto-completion, or complex multi-agent orchestration.

## Overall Priority

| Priority | Feature | Value | Complexity | Recommendation |
|----------|---------|------:|----------:|----------------|
| P0 | Project memory / rules file | Very High | Low | Strongly recommended |
| P0 | project context / repo summary | Very High | Medium | Strongly recommended |
| P1 | run_check: test, lint, typecheck encapsulation | High | Low-Medium | Strongly recommended |
| P1 | Git integration: status, diff, commit, undo | Very High | Medium | Strongly recommended |
| P1 | Hooks: deterministic automation | High | Medium | Recommended |
| P1 | diagnose: diagnostics aggregation | High | Medium | Recommended |
| P2 | Plan / Act workflow | Medium-High | Low-Medium | Recommended |
| P2 | Todo / task tracker | Medium-High | Low | Recommended |
| P2 | Context compaction / session summary | High | Medium-High | Recommended |
| P2 | Patch queue / apply preview | Medium-High | Medium | Recommended |
| P2 | ADR / docs helper | Medium-High | Low-Medium | Recommended |
| P2 | Permission system enhancement | Medium-High | Medium | Recommended |
| P2 | Changelog / release notes | Medium | Low-Medium | Optional |
| P3 | GitHub issue / PR helper | Medium | Medium | Optional |
| P3 | Repo map advanced / embedding search | Medium-High | High | Defer |
| P3 | MCP integration | Medium | High | Defer |
| P3 | IDE inline edit / autocomplete | Medium | Very High | Not recommended as priority |

## Recommended Final Module Diagram

If the project evolves into a comprehensive toolkit, it can be organized by capability domain:

```text
pi-coding-toolkit
├─ agents
│  ├─ subagent
│  ├─ explorer
│  ├─ reviewer
│  ├─ implementer
│  └─ tester
│
├─ intelligence
│  ├─ lsp
│  ├─ repo_map
│  └─ project_context
│
├─ research
│  ├─ web_search
│  ├─ fetch_content
│  └─ get_search_content
│
├─ workflow
│  ├─ todo
│  ├─ plan
│  ├─ compact
│  └─ patch_queue
│
├─ validation
│  ├─ run_check
│  ├─ diagnose
│  └─ hooks
│
├─ vcs
│  ├─ git_status
│  ├─ git_diff
│  ├─ git_commit
│  └─ git_undo
│
└─ docs
   ├─ adr
   ├─ changelog
   └─ release_notes
```

The actual code structure doesn't need to immediately follow this directory reorganization, but the diagram serves as a reference for feature boundaries.

---

# P0 Features

## 1. Project Memory / Rules File

### Background

Mainstream tools almost all have project-level rules mechanisms:

| Tool | Similar Capability |
|------|---------------------|
| Claude Code | `CLAUDE.md` |
| Cursor | `.cursorrules` / project rules |
| Cline | `.clinerules` |
| Roo Code | `.roorules` |
| Aider | `.aider.conf.yml` / repo instructions |
| Continue | rules / context providers |

This is the highest ROI feature. It allows agents to automatically get project conventions, common commands, and maintainer preferences each time they enter the project.

### Suggested Files

Can support the following files, loaded by hierarchy:

```text
~/.pi/toolkit/rules.md          # Global personal rules
PROJECT/AGENTS.md               # Project existing agent rules
PROJECT/.pi/rules.md            # Project-level rules
PROJECT/.pi/memory.md           # Project long-term memory
PROJECT/.pi/instructions.md     # Optional additional instructions
```

Can also support a shorter root file:

```text
PROJECT/PI.md
```

### Example

```md
# Project Rules

## Commands

- Typecheck: `pnpm typecheck`
- Test: `pnpm test`
- Lint: `pnpm lint`
- Format: `pnpm format`
- Docs check: `pnpm docs:check`

## Coding Style

- Use TypeScript ESM.
- Prefer small modules.
- Avoid new runtime dependencies unless necessary.
- Keep extension entry files thin.

## Agent Behavior

- Inspect related files before editing.
- Prefer LSP for symbol lookup.
- After editing code, run typecheck and relevant tests.
- For documentation changes, run docs check when available.
```

### Injection Strategy

Recommended injection order:

```text
global rules
→ project rules
→ AGENTS.md
→ project memory
→ session summary
```

If content is too long, truncate or summarize.

### Recommended Tool/Command

```ts
project_rules({ action: "show" | "reload" | "paths" })
```

Or command:

```text
/toolkit rules
/toolkit rules reload
```

### Priority

P0. Should be one of the first features implemented in the next stage.

## 2. Project Context / Project Context Package

### Background

Currently the toolkit has subagents, web, and LSP, but is missing an ability to consolidate "current project state" into a compact context.

Similar capabilities include:

- Aider's repo map.
- Cursor / Continue's codebase context.
- Claude Code's project context and file references.

### Suggested Tool

```ts
project_context({
  mode: "summary" | "files" | "health" | "task",
  task?: string,
  paths?: string[],
  includeGit?: boolean,
  includeLsp?: boolean
})
```

### Mode Description

| mode | Description |
|------|-------------|
| `summary` | Returns project structure, package info, main directories, common commands |
| `files` | Summarizes specified files' summaries, symbols, import relationships |
| `health` | Summarizes git status, LSP diagnostics, check command results |
| `task` | Automatically finds relevant files based on task description and generates task context |

### Output Example

```text
Project: pi-subagents
Package manager: pnpm
Language: TypeScript ESM
Main extension entry: src/extension/index.ts

Key modules:
- src/extension/: extension registration and commands
- src/runtime/: subagent foreground execution
- src/web/: web tools and providers
- src/agents/: agent discovery and frontmatter parsing
- src/config/: config loading

Validation:
- pnpm typecheck
- pnpm test
- pnpm docs:check

Git:
- modified docs/adr/0005-evolve-into-devkit-pi.md
```

### Implementation Suggestions

Phase 1 doesn't need complex indexing, directly combine:

- `package.json`
- `AGENTS.md`
- `.pi/rules.md`
- `docs/guides/goals-and-scope.md`
- `find` / `rg` / file tree
- LSP `symbols`
- `git status`

Consider import graph, PageRank, or embedding search later.

### Priority

P0.

---

# P1 Features

## 3. run_check: Check Command Encapsulation

### Background

Agents can directly run commands via bash, but encapsulating as a dedicated tool is more stable, secure, and token-efficient.

### Suggested Tool

```ts
run_check({
  kind: "typecheck" | "lint" | "test" | "format" | "docs" | "custom",
  target?: string,
  fix?: boolean,
  command?: string,
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

### Output Target

Don't directly return full stdout/stderr, but extract summary:

```text
Typecheck failed: 3 errors

1. src/config/load-config.ts:142:17
   Invalid hook mode: expected "agent_end", "edit_write", or "disabled".

2. src/shared/types.ts:231:5
   Type 'undefined' is not assignable to type 'ResolvedLspConfig'.

Suggested next step:
- Update ToolkitConfig normalization and ResolvedToolkitConfig types.
```

### Priority

P1. Low implementation complexity, high daily benefit.

## 4. Git Integration

### Background

Git integration is one of the core experiences in Aider, Claude Code and other coding agents. It allows agent modifications to be trackable, committable, and undoable.

### Suggested Tools

Can be split into multiple small tools:

```ts
git_status()
git_diff({ staged?: boolean, path?: string })
git_commit({ message?: string, autoMessage?: boolean })
git_undo({ scope?: "last-ai-change" | "working-tree" })
```

Can also unify:

```ts
git_tool({
  action: "status" | "diff" | "commit" | "undo" | "log" | "snapshot",
  path?: string,
  message?: string,
  autoMessage?: boolean
})
```

### Recommended Capabilities

#### Pre-modification snapshot

Before agent starts modifying, record:

```text
HEAD commit
working tree status
modified files
```

#### Post-modification diff summary

```text
Changed files:
- src/config/load-config.ts
- src/shared/types.ts

Summary:
- Added lsp config namespace.
- Updated web provider configuration.
```

#### Auto commit message

Generate conventional commit style:

```text
feat: add namespace config for toolkit modules
```

#### Undo

Optional implementation:

- Based on git restore.
- Based on saved patches.
- Based on AI change snapshot.

### Security Strategy

Don't auto-commit by default unless user explicitly calls or config enables.

### Priority

P1.

## 5. Hooks: Deterministic Automation

### Background

Prompts are probabilistic; models may forget to run format/test. Hooks are deterministic and execute every time they're triggered.

Claude Code's hooks mechanism proves this capability is useful.

### Suggested Events

Phase 1 only supports a small number of high-value events:

```text
after_edit
agent_end
before_commit
```

Can be extended later:

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
        "timeoutMs": 120000
      }
    ],
    "agentEnd": [
      {
        "run": "pnpm typecheck",
        "timeoutMs": 120000
      }
    ],
    "beforeCommit": [
      {
        "run": "pnpm test",
        "timeoutMs": 120000
      }
    ]
  }
}
```

### Security Strategy

- Hooks are disabled by default or only allow whitelisted commands.
- Hook output needs truncation.
- Hook failures should return clear errors but not crash the extension.

### Priority

P1.

## 6. diagnose: Diagnostics Aggregation

### Background

After merging LSP, diagnostic sources increase:

```text
LSP diagnostics
+ typecheck
+ lint / biome / eslint
+ tests
+ docs check
+ package manifest checks
```

If agents call these tools separately and concatenate results, it wastes tokens. Should provide a unified diagnostics aggregation tool.

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

P1/P2. Recommend implementing after LSP tool and run_check are stable.

---

# P2 Features

## 7. Plan / Act Workflow

### Background

Many tools distinguish planning and execution:

| Tool | Similar Capability |
|------|---------------------|
| Cline | Plan / Act |
| Roo Code | Architect / Code |
| Aider | Architect mode |
| Claude Code | plan mode / extended thinking |

The current project already has an `implementer` subagent, which can be further productized as a plan workflow.

### Suggested Tool

```ts
create_plan({
  task: string,
  includeFiles?: boolean,
  includeRisks?: boolean,
  includeValidation?: boolean
})
```

### Output Structure

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
User proposes task
→ create_plan
→ reviewer reviews plan
→ User confirms
→ Main agent executes
→ run_check / diagnose
```

### Priority

P2.

## 8. Todo / Task Tracker

### Background

Long tasks need status. Todo tracker allows agents to clearly know which step they're at.

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

Simply store to:

```text
.pi/todo.json
```

Or markdown:

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

P2. Low complexity, good for long tasks.

## 9. Context Compaction / Session Summary

### Background

When sessions grow long, agents forget early decisions. Common capabilities in mainstream tools include:

- Auto-summarize old conversations.
- Manual `/compact`.
- Session summary.
- Handoff summary.

### Suggested Tool

```ts
compact_context({
  mode: "session" | "task" | "handoff",
  save?: boolean
})
```

### Output Example

```md
# Session Summary

## Goal

Merge pi-lsp into pi-subagents as personal pi coding toolkit.

## Decisions

- Rename optional, but docs should describe toolkit direction.
- LSP tool before LSP hook.
- Child subagents may use readonly LSP actions.
- Mutating LSP actions disabled in child processes.

## Changed Files

- docs/adr/0005-evolve-into-devkit-pi.md

## Next Steps

1. Add ADR 0005.
2. Update AGENTS.md.
3. Modularize extension index.
```

### Storage Location

```text
.pi/session-summary.md
.pi/memory/YYYY-MM-DD.md
```

### Priority

P2. High long-term value.

## 10. Patch Queue / Apply Preview

### Background

The core experience in many coding tools is:

```text
propose patch
→ preview diff
→ accept/reject
```

The current project emphasizes readonly planning and secure boundaries, so patch queue is a good fit.

### Suggested Tool

```ts
patch_queue({
  action: "create" | "list" | "show" | "apply" | "discard",
  patch?: string,
  id?: string
})
```

### Usage

`implementer` subagent first outputs patch plan without directly writing files. Main agent or user then decides whether to apply.

### Priority

P2.

## 11. ADR / Docs Helper

### Background

The current project already uses ADR and heavily relies on documentation sync. Can provide dedicated docs tooling.

### Suggested Tools

```ts
adr({
  action: "new" | "list" | "show" | "supersede",
  title?: string,
  id?: string
})
```

```ts
docs_tool({
  action: "check" | "toc" | "link-check" | "config-reference" | "adr-template"
})
```

### ADR Example

```text
adr({ action: "new", title: "Evolve into personal pi coding toolkit" })
```

Generates:

```md
---
status: proposed
date: 2026-05-10
---

# 0005 - Evolve into personal pi coding toolkit

## Context

...

## Decision

...

## Consequences

...
```

### Priority

P2. Highly matched with current project workflow.

## 12. Permission System Enhancement

### Background

The current project already has readonly subagents and `subagents.allowWrite`, but a comprehensive toolkit may need more granular permissions.

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

P2. Recommend implementing before introducing more write operations or bash-like hooks.

## 13. Changelog / Release Notes

### Suggested Tool

```ts
release_notes({
  since?: string,
  format: "markdown" | "github" | "npm"
})
```

### Capabilities

- Generate release notes from git commits.
- Generate changelog entry from changed files.
- Check package.json version.
- Remind to update README / docs.

### Priority

P2/P3. Suitable for publishing npm packages.

---

# P3 Features

## 14. GitHub Issue / PR Helper

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

P3. Not a next-stage priority unless you frequently use GitHub PR workflow.

## 15. Repo Map Advanced / Embedding Search

### Background

Aider's repo map is powerful, using tree-sitter and PageRank. Continue and other tools use vector retrieval.

### Suggestion

Don't start with embedding search. First do a lightweight version:

```ts
repo_map({
  path?: string,
  depth?: number,
  includeSymbols?: boolean
})
```

Combined with LSP symbols can generate:

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

Advanced capabilities include:

- Import graph.
- Reference热度.
- Task-based related file selection.
- Embedding search.

### Priority

Lightweight repo map: P2.
Advanced repo map / embedding: P3.

## 16. MCP Integration

### Background

MCP is a hot community direction; Claude Code, Cline, Continue and other tools all support or integrate related ecosystems.

### Reason for Deferral

- High implementation complexity.
- Complex security boundaries.
- pi already has extension/tool mechanisms.
- Current project needs workflow primitives more than external ecosystem protocols.

### When to Consider

Only consider when there's a clear need to integrate:

- GitHub
- Linear
- Notion
- browser / Playwright
- database
- Custom MCP servers

### Priority

P3.

## 17. IDE Inline Edit / Autocomplete

### Background

Cursor, Continue and other tools have strong auto-completion experiences, but this falls into IDE integration territory.

### Reasons Not Recommended as Priority

- Requires editor plugin or deep UI integration.
- Doesn't fully match pi CLI / TUI coding workflow.
- Very high implementation complexity.

### Priority

P3, currently not recommended.

---

# Recommended Implementation Roadmap

## Phase A: Personal Workflow Infrastructure

Prioritize implementing:

```text
1. Project rules / memory
2. project_context
3. run_check
4. git_tool
```

Goal: Make agents know project rules, project structure, can run checks reliably, and can view and manage diffs every time they enter the project.

## Phase B: Automation and Diagnostics

Implement:

```text
5. hooks
6. diagnose
7. Permission system enhancement
```

Goal: Turn "things the model should remember to do" into system-determined executions.

## Phase C: Long Task Support

Implement:

```text
8. todo tracker
9. compact_context
10. plan/act workflow
11. patch_queue
```

Goal: Enable agents to handle cross-session, multi-file, multi-phase tasks more stably.

## Phase D: Documentation and Release Assistance

Implement:

```text
12. adr
13. docs_tool
14. release_notes
15. pr_description
```

Goal: Reduce costs of maintaining documentation, ADR, and release notes.

## Phase E: Advanced Ecosystem Capabilities

Implement only when there's clear need:

```text
16. repo map advanced / embedding search
17. MCP integration
18. IDE integration
```

---

# Minimal Recommended Next Steps

If only choosing 3 features, recommend in this order:

```text
P0-1: .pi/rules.md / PI.md Project rules auto-injection
P0-2: project_context tool
P1-1: run_check tool
```

If choosing 5 features, recommend:

```text
1. Project rules / memory
2. project_context
3. run_check
4. git_tool
5. hooks
```

These features can immediately improve personal usage experience and won't break the existing subagent + web + LSP architecture.

---

# Current Recommendations

After merging `pi-subagents` and `pi-lsp` into a personal comprehensive pi coding toolkit, the next stage should not rush to implement complex ecosystem features. Recommend prioritizing:

```text
Rules → Context → Check → Git → Hooks → Diagnose
```

This route best matches high-frequency needs of personal coding agent toolkit and is easiest to combine with existing modules.
