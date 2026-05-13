---
status: implemented
audience: maintainer
last_verified: 2026-05-13
language: english
---

# Subagent Timeout Issue: Dual Timeout Model Refactoring Plan

> **Status**: This document records the refactoring plan. The code implementation is complete (see git log of relevant files). This document is retained as historical reference and background.

## Summary

The current subagent timeout mechanism uses an absolute wall-clock timeout calculated from when the subagent process starts. It cannot distinguish whether the subagent is in an active working state. This causes subagents to be mechanically terminated after reaching a fixed time limit, even when they are still actively producing output, calling tools, or delivering messages during long-running tasks. This design is extremely unfriendly to long-running tasks and reduces the usability of subagents in actual workflows.

## Problem Description

### Current Behavior

Subagent timeout is controlled by the `subagents.timeoutMs` configuration, with a default value of `300000` (5 minutes).

Relevant implementations:

- **Config layer**: `src/config/load-config.ts:100`
  - Default value `timeoutMs: 300000`
- **Execution layer**: `src/modules/subagents/execution.ts:119-124`
  - `setTimeout` starts immediately after subprocess spawn, never resets due to any activity
- **Executor layer**: `src/modules/subagents/executor.ts:308, 340, 370-371`
  - Executor maps timeout to `SUBAGENT_TIMEOUT` error code and fixed message `"Subagent timed out after ${timeoutMs}ms."`

The current code parses subagent JSONL events (`message_end`, `tool_result_end`) in `processLine()` and pushes streaming updates to the main agent on these events, but these active signals are not connected to the timeout mechanism.

### Core Problem

The 5-minute timeout has nothing to do with the subagent's actual working state. A subagent may be in these scenarios:

1. **Executing a 20-minute analysis task** - the process remains active, but gets terminated after 5 minutes.
2. **Calling a time-consuming tool** (e.g., Web search, long-running LSP operation) - no output during tool call, subagent gets terminated after 5 minutes.
3. **Completed main work, delivering results to main agent** - terminated before result delivery, all work is lost.

These are all reasonable user scenarios, but the current design will unconditionally terminate subagents after 5 minutes, regardless of whether they are working.

## Solution: Dual Timeout Model

Introduce two independent timeout mechanisms:

```json
{
  "subagents": {
    "timeoutMs": 900000,
    "idleTimeoutMs": 180000
  }
}
```

Semantics:

| Config Field | Value | Meaning |
|---|---|---|
| `timeoutMs` | 900000 (15 minutes) | **Maximum total runtime** for a single subagent execution, hard cap. Timer starts when process spawns and is never reset by subagent activity. When this limit is reached, the subagent is terminated regardless of activity. |
| `idleTimeoutMs` | 180000 (3 minutes) | **Maximum idle time** allowed after the subagent's last **valid activity**. Resets on each valid activity event. If this limit is exceeded but the subagent is still active, it will not be terminated. |

### Behavior Matrix

| Scenario | Current Behavior | After Refactoring |
|---|---|---|
| Subagent actively runs for 10 minutes | Terminated after 5 minutes | Completes normally (10 minutes < 15 minutes hard timeout) |
| Subagent has no output for 3 minutes | Terminated after 3 minutes | Terminated after 3 minutes via idle timeout |
| Subagent outputs one assistant message per minute | Terminated after 5 minutes | Continues running until 15 minutes hard timeout |
| Subagent continuously prints meaningless logs | Terminated after 5 minutes | Terminated after 3 minutes via idle timeout |
| Subagent calls a tool that takes 8 minutes | Terminated after 5 minutes | Terminated after 3 minutes via idle timeout (if no intermediate events during tool execution) |
| Subagent completes work and exits normally | Exits normally | Exits normally |

### Definition of Valid Activity

Valid activity is **not** arbitrary stdout text, but structured JSONL runtime events output by the subagent process. The first version recommends treating the following events as valid activity:

- `message_end`: assistant or user message finalized
- `tool_result_end`: tool execution result finalized
- `turn_end`: conversation turn ended

> **Future Extension**: If pi runtime subsequently outputs `tool_call_start` / `tool_call_end` or other tool-call lifecycle events, they can be added to the `ACTIVITY_EVENT_TYPES` set. These events are not currently handled in the code.

Arbitrary stdout raw chunks, stderr content, invalid JSON, or non-activity-type JSONL events **will not** reset the idle timeout.

This design prevents subagents from bypassing the idle timeout by continuously outputting meaningless logs.

### Why Keep Hard Timeout

If we only implemented idle timeout without hard timeout, there would be these risks:

- Subagents could infinitely extend their running time by continuously outputting valid activity events (via infinite loop + continuous `message_end` events)
- Subagents could remain active in a slow inference process with no bugs until the user manually terminates them

Therefore, hard timeout is an indispensable safety boundary.

## Implementation Plan

### Step 1: Extend Types and Default Config

**Files**: `src/shared/types.ts`, `src/config/load-config.ts`

**Changes**:

- Add `idleTimeoutMs?: number` to `SubagentsConfig`
- Field is automatically required in `ResolvedSubagentsConfig`
- Change `DEFAULT_SUBAGENTS_CONFIG.timeoutMs` from `300000` to `900000`
- Add `DEFAULT_SUBAGENTS_CONFIG.idleTimeoutMs = 180000`
- Use `positiveInteger()` normalization in `normalizeSubagentsConfig()`

**Boundary**: Config boundary continues to use existing `positiveInteger()` rules. Idle timeout cannot be disabled (`idleTimeoutMs` must be a positive integer).

### Step 2: Extend `runSync()` Parameters and Results

**Files**: `src/modules/subagents/execution.ts`

**Changes**:

- Add `idleTimeoutMs?: number` to `RunSyncOptions`
- Add `timeoutReason?: "runtime" | "idle"` to `RunSyncResult`

### Step 3: Implement Dual Timers

**Files**: `src/modules/subagents/execution.ts`

**Changes**:

- Keep the original hard timeout timer (renamed to `runtimeTimeoutHandle`)
- Add new idle timeout timer (`idleTimeoutHandle`)
- Abstract `markTimedOut(reason: "runtime" | "idle")` function to avoid mutual interference when both timers trigger
- Abstract `resetIdleTimeout()` function, called once after subprocess starts, then called again on each valid activity event
- Define valid activity event constant `ACTIVITY_EVENT_TYPES`
- Call `resetIdleTimeout()` in `message_end` and `tool_result_end` handling within `processLine()`
- Clean up both timers in `close` and `error` branches

**Key Notes**:

- Arbitrary stdout chunks should not be considered activity; only successfully parsed structured JSONL events count as activity
- Hard timeout cannot be reset by activity
- `cancelled` and `timedOut` should not interfere with each other

### Step 4: Executor Layer Parameter Passing and Error Messages

**Files**: `src/modules/subagents/executor.ts`

**Changes**:

- Read `deps.config.idleTimeoutMs` and pass to `runSync()`
- Save `result.timeoutReason`
- Generate different error messages based on `timeoutReason`:
  - hard timeout: `"Subagent exceeded maximum runtime after 900000ms."`
  - idle timeout: `"Subagent timed out after 180000ms without activity."`
- Continue using `SUBAGENT_ERROR_CODES.SUBAGENT_TIMEOUT` as error code
- Add `timeoutReason?: "runtime" | "idle"` field to `SingleResult`

### Step 5: Test Additions

**Files**: `tests/subagents/execution.test.ts` or new dedicated test file

**New Test Cases**:

1. **Hard timeout still takes effect**: subprocess continuously outputs valid activity, but `timeoutMs` is short. Should be terminated by runtime timeout, assert `result.timedOut === true` and `result.timeoutReason === "runtime"`
2. **Idle timeout triggers with no activity**: subprocess outputs no valid JSONL, `idleTimeoutMs` is short. Should trigger idle timeout, assert `result.timeoutReason === "idle"`
3. **Valid activity resets idle timeout**: subprocess outputs valid JSONL events at short intervals. Total duration exceeds `idleTimeoutMs` but not `timeoutMs`. Should not be killed by idle timeout
4. **Invalid stdout should not reset idle timeout**: subprocess outputs non-JSONL text, `idleTimeoutMs` is short. Should trigger idle timeout
5. **Executor layer idle timeout error message**: trigger idle timeout via `createSubagentExecutor()`, assert error message contains `without activity`
6. **Config defaults**: confirm default `timeoutMs === 900000`, `idleTimeoutMs === 180000`

### Step 6: Documentation Update

**Files**:

- `docs/zh/reference/subagents.md` (config field description)
- `docs/zh/reference/result-schema.md` (`SingleResult` new field)
- `docs/reference/configuration.md` (if English config documentation exists)

**Updates**:

- Explain `subagents.timeoutMs` as maximum total runtime / hard timeout
- Add `subagents.idleTimeoutMs` field description
- Explain the definition and scope of "valid activity"
- Update `SUBAGENT_TIMEOUT` error code description, noting it may be triggered by runtime or idle timeout
- Update `SingleResult` type description, mark `timeoutReason` field

### Step 7: Complete Verification

**Verification Commands**:

```bash
pnpm typecheck
pnpm lint
pnpm test
# If docs check is involved
pnpm docs:check
```

## Risks and Considerations

### 1. Long-Running Tool Calls May Trigger Idle Timeout

If pi runtime does not output intermediate events (like `tool_call_start`) during tool execution, long-running tool calls (e.g., 8-minute Web search or LSP operation) may have no events to reset idle timeout, causing idle timeout to trigger after 3 minutes.

Mitigations:

- Set `idleTimeoutMs` to a higher value (e.g., 300000)
- Advocate for pi runtime to output `tool_call_start` event when tool execution begins
- Consider adding "pause idle timeout during tool calls" mechanism in the future

First version recommends keeping the 3-minute default without premature optimization.

### 2. Windows Platform Signal Behavior Unstable

Some test cases use `itPosix` to skip Windows platform because shell scripts and signals behave differently on Windows.

New timeout tests that rely on bash scripts should use `itPosix` or switch to cross-platform Node scripts.

### 3. No New Error Codes

First version continues using `SUBAGENT_ERROR_CODES.SUBAGENT_TIMEOUT`. Detailed cause is exposed through error message and `timeoutReason` field.

### 4. Default Behavior Change

Changes from "maximum 5 minutes" to "maximum 15 minutes, but early timeout if no valid activity for 3 minutes". This is a user-visible behavior change that needs to be noted in changelog or release notes.

### 5. Error Message Change

Original fixed message `"Subagent timed out after ${timeoutMs}ms."` will produce different outputs based on `timeoutReason`. Existing test assertions need to be updated synchronously.

## Final Config Values

```json
{
  "subagents": {
    "enabled": true,
    "maxDepth": 1,
    "timeoutMs": 900000,
    "idleTimeoutMs": 180000,
    "allowWrite": false,
    "allowLspTools": true,
    "allowedLspActions": [...],
    "injectDelegationPolicy": true,
    "retry": {
      "enabled": true,
      "maxAttempts": 2
    }
  }
}
```

| Field | Default | Description |
|---|---|---|
| `timeoutMs` | 900000 (15 minutes) | Maximum total runtime, hard cap |
| `idleTimeoutMs` | 180000 (3 minutes) | Maximum idle time, calculated from last valid activity |

## Related Files

| File | Change Type | Description |
|---|---|---|
| `src/shared/types.ts` | Type extension | `SubagentsConfig` adds `idleTimeoutMs`, `SingleResult` adds `timeoutReason` |
| `src/config/load-config.ts` | Config extension | Default value adjustment, `normalizeSubagentsConfig` normalization |
| `src/modules/subagents/execution.ts` | Core logic | Dual timer implementation, `RunSyncOptions`/`RunSyncResult` extension |
| `src/modules/subagents/executor.ts` | Adapter layer | Parameter passing, error messages, schema extension |
| `tests/subagents/execution.test.ts` | Tests | New idle timeout and hard timeout test cases |
| `docs/zh/reference/subagents.md` | Documentation | Config field description update |
| `docs/zh/reference/result-schema.md` | Documentation | `SingleResult` schema update |

## Implementation Reference Details

### Dual Timer State Management

```ts
let runtimeTimeoutHandle: NodeJS.Timeout | undefined;
let idleTimeoutHandle: NodeJS.Timeout | undefined;
let timedOut = false;
let timeoutReason: "runtime" | "idle" | undefined;

const markTimedOut = (reason: "runtime" | "idle") => {
  if (timedOut || cancelled) return;
  timedOut = true;
  timeoutReason = reason;
  terminateChild();
};

const resetIdleTimeout = () => {
  if (idleTimeoutMs === undefined) return;
  if (idleTimeoutHandle) clearTimeout(idleTimeoutHandle);
  idleTimeoutHandle = setTimeout(() => {
    markTimedOut("idle");
  }, idleTimeoutMs);
};
```

### Valid Activity Event Set

```ts
const ACTIVITY_EVENT_TYPES = new Set([
  "message_end",
  "tool_result_end",
  "turn_end",
  // NOTE: tool_call_start / tool_call_end are not currently emitted by pi runtime.
  // Add them here if pi adds support for tool-call lifecycle events.
]);
```

### Error Message Semantics

| Reason | Error Message Example |
|---|---|
| hard timeout | `Subagent exceeded maximum runtime after 900000ms.` |
| idle timeout | `Subagent timed out after 180000ms without activity.` |
| user cancellation | `Subagent execution was cancelled by user.` |