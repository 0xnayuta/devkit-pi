---
status: current
audience: all
last_verified: 2026-05-20
language: english
---

# Agent Workflow Guide · devkit-pi

This guide describes a **lightweight workflow style** for using devkit-pi effectively. It is guidance, not a strict runtime policy engine.

## 1) Scope

This guide is for day-to-day coding tasks with devkit-pi tools:

- subagents
- web research (`web_search`, `fetch_content`)
- convert (`convert_content`)
- LSP (`lsp`)
- toolkit commands (`/toolkit`)
- lightweight guards (git context, first-write, verification reminders)

It does **not** introduce workflow phases, hard gates, or mandatory turn rewrites. Guards are soft reminders only; they do not block tool calls or force follow-up turns.

## 2) devkit-pi workflow principles

1. The main agent makes decisions; subagents handle focused investigation/review.
2. Readonly-first by default, especially for reviewer-style work.
3. Small tasks can execute directly, but report verification status honestly.
4. Large tasks should start with a short plan and step-by-step execution.
5. Debug flow: reproduce → narrow down → fix minimally → verify.
6. Keep implementation and review separated when possible.
7. Use tools/subagents for large outputs instead of polluting the main context.

## 3) Lightweight flow for small tasks

Recommended sequence:

1. Clarify goal and constraints.
2. Inspect relevant files quickly.
3. Make minimal changes.
4. Run the smallest relevant verification command(s).
5. Report what changed and what was verified.

## 4) Flow for larger tasks

Recommended sequence:

1. Clarify scope and non-goals.
2. Inspect code/docs/tests.
3. Write a short plan (2–5 steps).
4. Execute in small batches.
5. Verify after each meaningful batch.
6. Summarize risks, follow-ups, and remaining work.

## 5) Debug workflow

1. **Reproduce**: confirm how to trigger the issue.
2. **Observe**: collect logs/errors/files.
3. **Narrow**: isolate likely modules.
4. **Fix**: apply minimal targeted fix.
5. **Verify**: run reproduction and/or tests.
6. **Document**: add notes if behavior changed.

Tool mapping:

- Web tools: external research for errors/symptoms
- Convert tool: read complex file formats into markdown
- LSP tool: symbols/definitions/references/diagnostics
- Subagents: focused exploration/review
- `/toolkit`: module status and diagnostics overview

## 6) Review workflow

Suggested pattern:

1. Main agent implements a scoped change.
2. Delegate focused review to readonly reviewer subagent.
3. Classify findings by severity.
4. Main agent decides what to fix.
5. Re-verify and summarize.

Review is not a replacement for build/test/lint verification.

## 7) Verification before completion

Before declaring completion, include verification status.

Common checks:

- `pnpm typecheck`
- `pnpm lint`
- `pnpm test`
- `pnpm docs:check` when docs changed
- `pnpm test:coverage` when coverage visibility matters; current coverage is a lightweight Node/V8 visibility report, not a threshold gate

Examples:

```md
## Verification

- Ran: `pnpm typecheck` ✅
- Ran: `pnpm test` ✅
- Not run: `pnpm docs:check` (no docs changed)
```

If verification was not run:

```md
## Verification

- Not run in this session.
- Suggested next step: `pnpm typecheck && pnpm lint && pnpm test`
```

## 8) Subagent boundaries

- Main agent remains the only orchestrator.
- Do not let subagents recursively orchestrate new subagents.
- Prefer readonly subagents by default.
- Keep final decision authority in the main agent.

## 9) Anti-patterns

Avoid:

- over-process for tiny tasks
- large refactors without reading tests/docs first
- claiming completion without verification status
- treating workflow guidance as hard runtime gates

## 10) Reusable templates

### A. Small fix template

1. Inspect target files.
2. Apply minimal change.
3. Run one or two focused checks.
4. Summarize change + verification.

### B. Feature template

1. Clarify constraints.
2. Plan 2–5 steps.
3. Implement incrementally.
4. Verify incrementally.
5. Summarize behavior, risks, and next steps.

### C. Debug template

1. Reproduce
2. Observe
3. Narrow
4. Fix
5. Verify
6. Document

## Related docs

- [Goals and scope](./goals-and-scope.md)
- [Security model](./security-model.md)
- [Configuration reference](../reference/configuration.md)
- [Subagents reference](../reference/subagents.md)
- [Toolkit commands reference](../reference/toolkit-commands.md)
