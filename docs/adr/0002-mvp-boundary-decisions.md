---
status: accepted
audience: maintainer
last_verified: 2026-05-12
---

# ADR 0002: MVP Boundary Decisions

> Historical decision record: this document records the context and trade-offs at the time, and is not equivalent to current API reference; current behavior is defined by `docs/reference/`, `src/`, and `tests/`.

## Status

Accepted

## Context

Before starting the simplification refactoring, the MVP boundary decisions need to be clearly defined to avoid repeated scope discussions during the process.

## Decision

### 1. User/project custom agents

**Retain simple markdown agents; do not retain management/overrides/chains.**

Custom agents are the core extension point of lightweight subagents and worth retaining. But management (create/update/delete), settings overrides, chains, and packaged agents are too complex and not retained in MVP.

### 2. `/subagents` command

**Not retained in the first version.**

The main entry point is the LLM tool `subagent({ agent, task })`. Slash commands would pull in slash bridge, live state, TUI rendering and other complex capabilities, conflicting with the simplification goal. If restoration is needed later, a minimal command for listing agents can be added.

### 3. `bash` in readonly agents

**Not allowed by default.**

Readonly agents only allow safe tools: `read, grep, find, ls`. Researcher can additionally allow `web_search, fetch_content, get_search_content`.

`bash` cannot technically guarantee read-only. Even with prompt writing "read-only inspection commands", the model may still execute commands that write files or modify the system. Therefore MVP does not open `bash` in readonly agents. If this capability needs to be restored in the future, a new ADR must be added with explicit configuration.

### 4. `skills` directory

**Not retained or not registered in the first version.**

The current `skills/pi-subagents` contains old complex orchestration capability descriptions that would lead the model toward multi-agent workflow, slash, chain, parallel, subagent scheduling, conflicting with the simplification goal. Remove `pi.skills` and `skills/**/*` from package.json.

### 5. Session files

**Retain minimal child session file; no complex management.**

Session files are helpful for debugging and failure investigation, retained. But no artifact tree, metadata, progress file, async result file, session sharing, resume, watcher, cleanup manager.

### 6. `implementer` / `tester` write files

**Not allowed in first version; both are readonly.**

- `implementer`: returns patch plan / implementation plan / exact files to change
- `tester`: returns test plan / suggested tests / test commands / optional test code snippets

Avoid unclear responsibility when main agent and subagent write files simultaneously. MVP does not implement worktree isolation, diff merging, conflict handling, rollback. Can be enabled later through explicit configuration.

> Current implementation note: early naming in this ADR does not represent current configuration contract. Current configuration key is `subagents.allowWrite`; writable custom subagents are still experimental / advanced / unsafe, and do not imply a complete sandbox, audit, rollback, or stable write-capability contract.

## Consequences

These decisions ensure the MVP form is:

```text
One subagent tool
+ 5 built-in readonly agents
+ Simple markdown custom agents
+ Foreground single execution
+ depth = 1
+ Minimal child session file
+ Simple config / result schema
```

Restoring any capability in the future requires a new ADR explaining that the benefits outweigh the complexity cost.
