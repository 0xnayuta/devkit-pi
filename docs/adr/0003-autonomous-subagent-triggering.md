---
status: accepted
audience: maintainer
last_verified: 2026-05-12
language: english
---

# ADR 0003: Autonomous Subagent Triggering

> Historical decision record: this document records the context and trade-offs at the time, and is not equivalent to current API reference; current behavior is defined by `docs/reference/`, `src/`, and `tests/`.

## Status

Accepted (implementation completed 2026-05-10)

## Context

In the current design, whether the main agent uses `subagent` depends entirely on the model's free judgment, with no mechanism to guide its behavior. In practice, the main agent tends to use `read`, `bash`, and other tools directly rather than delegating to more specialized subagents.

Root cause:

| Current state | Problem |
|----------|------|
| Tool descriptions only describe "what to do" | No guidance on "when to use" |
| `before_agent_start` only handles subagent prompts | No delegation policy injection to main agent |
| Entirely relies on model self-awareness | Model tends to do things directly |

## Approach

### Approach A: Semantic Intent Description + Few-shot Example Driven

Inject **language-agnostic semantic intent descriptions** and **multilingual conversation examples** into the main agent's system prompt to guide the model toward delegating in appropriate scenarios.

#### A.1 Semantic Intent Description

Uses semantic descriptions rather than keyword matching to define when to delegate:

```
## Subagent Delegation Policy

When the user's request matches a subagent's specialty, prefer delegating:

- **explorer**: Locating, navigating, or searching code/files in the codebase
- **researcher**: Investigating external resources, comparing technologies, synthesizing information
- **reviewer**: Evaluating code quality, checking for issues, analyzing architecture
- **implementer**: Planning implementation, designing solutions, architecting features
- **tester**: Designing test strategies, identifying edge cases, planning coverage

Delegate when the task is focused and benefits from specialized tools.
Handle directly when the task is simple, requires immediate action, or is too small to benefit from delegation.
```

**Language agnosticism**: semantic descriptions naturally support multilingual — the model can map any language's user input to semantic concepts without maintaining keyword lists for each language.

#### A.2 Few-shot Examples

Provide specific conversation examples in the system prompt showing delegation behavior:

```
## Delegation Examples

User: "Find where authentication is implemented"
→ Delegate to explorer

User: "Compare React and Vue for this project"
→ Delegate to researcher

User: "Review this code for security issues"
→ Delegate to reviewer

User: "How should I implement the payment flow?"
→ Delegate to implementer

User: "Plan the test strategy for this feature"
→ Delegate to tester
```

**Advantages**:
- LLMs learn more effectively from examples than rule lists
- Naturally demonstrates multilingual scenarios (1-2 examples each in Chinese/English)
- Can demonstrate complex scenarios (not just single-sentence triggers)

- **Pros**:
  - Semantic descriptions are easier for LLMs to understand than keyword lists
  - Naturally language-agnostic, no per-language keyword maintenance needed
  - Example-driven, better model learning
  - Injected via `before_agent_start` into system prompt, high weight
  - Can be made configurable, users can enable/disable
- **Cons**:
  - Requires modifying config types and runtime logic
  - Examples consume additional tokens
  - May conflict with user-defined system prompts (mitigated by config option)

## Decision

Adopted **Approach A (Semantic Intent + Few-shot Examples)**:

| Layer | Content | Purpose |
|------|------|------|
| System Prompt | Semantic intent description | Tells model "when to delegate" |
| System Prompt | 2-3 multilingual examples | Shows how to delegate specifically |
| Tool Description | Keep current state | Tells model "what the tool can do" |

## Consequences

### File changes (implemented ✅)

| File | Change | Status |
|------|------|------|
| `src/shared/delegation-policy.ts` | **New**: `DELEGATION_POLICY` and `DELEGATION_EXAMPLES` constants | ✅ Done |
| `src/shared/types.ts` | `ExtensionConfig` added `injectDelegationPolicy?: boolean` | ✅ Done |
| `src/config/load-config.ts` | `DEFAULT_CONFIG` defaults to `true`, `mergeConfig` supports new field | ✅ Done |
| `src/extension/index.ts` | Added `before_agent_start` handler, injects delegation policy into main agent system prompt | ✅ Done |

### Implementation details

> Current implementation note: early type names, entry paths, and config paths recorded below are preserved from implementation time. Current public contract is defined by `docs/reference/configuration.md`, `src/config/load-config.ts`, `src/modules/subagents/register.ts`, and `src/shared/delegation-policy.ts`; current config key is `subagents.injectDelegationPolicy`, config path is `~/.pi/agent/extensions/devkit-pi/config.json`.

#### 1. Configuration

`ExtensionConfig.injectDelegationPolicy` (defaults to `true`); users can set `false` via `~/.pi/agent/extensions/subagent/config.json` to disable.

#### 2. Injection logic

Registers `before_agent_start` handler in `registerSubagentExtension`:
- Checks `effectiveConfig.injectDelegationPolicy` switch
- Excludes subagent processes via `PI_SUBAGENT_CHILD` environment variable
- Appends `DELEGATION_POLICY + DELEGATION_EXAMPLES` to main agent system prompt end

#### 3. Token overhead

- Semantic intent description: ~150 tokens
- Few-shot examples (6): ~200 tokens
- **Total**: ~350 tokens (approximately 2-5% of system prompt)

### Verification

| Check | Result |
|--------|------|
| `pnpm typecheck` | ✅ Passed |
| `pnpm lint` | ✅ Passed |
| `pnpm test:unit` | ✅ 144/144 passed |
