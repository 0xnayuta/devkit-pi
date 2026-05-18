/**
 * Core execution logic for running subagent
 * Simplified to only support: foreground single execution
 *
 * Streaming: parses JSONL events from the pi subprocess in real-time and
 * emits structured `StreamingState` snapshots via `onStreamingUpdate`.
 * This allows the TUI to show live progress (tool calls, assistant text,
 * usage) without polluting the parent agent's context window.
 */

import { spawn } from "node:child_process";
import { attachPostExitStdioGuard, trySignalChild } from "../../shared/post-exit-stdio-guard.ts";
import type { Usage } from "../../shared/types.ts";
import {
  appendLimitedOutput,
  type ChildOutputLimitExceeded,
  ChildStdoutCollector,
  createLimitedOutputBuffer,
  decodeLimitedOutput,
  type LimitedOutputBuffer,
} from "./child-output-buffer.ts";
import { collectOutput } from "./collect-output.ts";
import { getPiSpawnCommand } from "./pi-spawn.ts";

const DEFAULT_TERMINATION_GRACE_MS = 5000;
export const DEFAULT_SUBAGENT_MAX_STDOUT_BYTES = 8 * 1024 * 1024;
export const DEFAULT_SUBAGENT_MAX_STDERR_BYTES = 1 * 1024 * 1024;
export const DEFAULT_SUBAGENT_MAX_JSONL_LINES = 10000;
export const DEFAULT_SUBAGENT_MAX_TRANSIENT_JSONL_LINES = 100000;
export const DEFAULT_SUBAGENT_MAX_UNTERMINATED_JSONL_BYTES = 1 * 1024 * 1024;

// ---------------------------------------------------------------------------
// Streaming types
// ---------------------------------------------------------------------------

/** A single tool call extracted from an assistant message. */
export interface ToolCallInfo {
  name: string;
  args: Record<string, unknown>;
}

/** Snapshot of accumulated state emitted during streaming. */
export interface StreamingState {
  /** All messages received so far (raw JSONL `message` objects). */
  messages: unknown[];
  /** Aggregated usage across all completed turns. */
  usage: Usage;
  /** Text content of the most recent assistant message. */
  lastAssistantText: string;
  /** Tool calls extracted from all assistant messages so far. */
  toolCalls: ToolCallInfo[];
}

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export interface RunSyncResult {
  exitCode: number;
  output: string;
  usage?: Usage;
  error?: string;
  partialOutput?: string;
  final: boolean;
  lastEventType?: string;
  timedOut?: boolean;
  /** Why the execution was terminated. Present when timedOut === true. */
  timeoutReason?: "runtime" | "idle";
  cancelled?: boolean;
  terminationSignal?: NodeJS.Signals;
  /** Child output hard limit that terminated execution, if any. */
  outputLimitExceeded?: ChildOutputLimitExceeded | "stderr";
  /**
   * Display items accumulated during execution. Useful for rich rendering
   * of the final result (showing tool calls the subagent made).
   */
  displayItems?: DisplayItem[];
}

/** A displayable item extracted from assistant messages. */
export type DisplayItem =
  | { type: "text"; text: string }
  | { type: "toolCall"; name: string; args: Record<string, unknown> };

interface RunSyncOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  /** Maximum idle time (ms) since the last valid activity event before terminating. */
  idleTimeoutMs?: number;
  env?: Record<string, string | undefined>;
  /** Called each time a new message is received from the subprocess. */
  onStreamingUpdate?: (state: StreamingState) => void;
  /** Internal/test hook: maximum child stdout bytes to collect before terminating. */
  maxStdoutBytes?: number;
  /** Internal/test hook: maximum child stderr bytes to collect before terminating. */
  maxStderrBytes?: number;
  /** Internal/test hook: maximum persisted JSONL stdout lines before terminating. */
  maxJsonlLines?: number;
  /** Internal/test hook: maximum transient/drop JSONL stdout lines before terminating. */
  maxTransientJsonlLines?: number;
  /** Internal/test hook: maximum buffered bytes for an unterminated JSONL candidate. */
  maxUnterminatedJsonlBytes?: number;
  /** Internal/test hook: override pi spawn command resolution. */
  spawnCommand?: { command: string; args?: string[] };
}

export async function runSync(
  cwd: string,
  args: string[],
  options: RunSyncOptions = {}
): Promise<RunSyncResult> {
  const {
    signal,
    timeoutMs,
    idleTimeoutMs,
    env,
    onStreamingUpdate,
    maxStdoutBytes = DEFAULT_SUBAGENT_MAX_STDOUT_BYTES,
    maxStderrBytes = DEFAULT_SUBAGENT_MAX_STDERR_BYTES,
    maxJsonlLines = DEFAULT_SUBAGENT_MAX_JSONL_LINES,
    maxTransientJsonlLines = DEFAULT_SUBAGENT_MAX_TRANSIENT_JSONL_LINES,
    maxUnterminatedJsonlBytes = Math.max(
      maxStdoutBytes,
      DEFAULT_SUBAGENT_MAX_UNTERMINATED_JSONL_BYTES
    ),
    spawnCommand,
  } = options;
  const { command, args: spawnArgs } = spawnCommand
    ? { command: spawnCommand.command, args: [...(spawnCommand.args ?? []), ...args] }
    : getPiSpawnCommand(args);

  return new Promise((resolve) => {
    const stdoutCollector = new ChildStdoutCollector({
      maxStdoutBytes,
      maxJsonlLines,
      maxTransientJsonlLines,
      maxUnterminatedJsonlBytes,
    });
    const stderrBuffer: LimitedOutputBuffer = createLimitedOutputBuffer();
    let output = "";
    let stderr = "";
    let exitCode = 0;
    let timedOut = false;
    let timeoutReason: "runtime" | "idle" | undefined;
    let cancelled = false;
    let outputLimitExceeded: RunSyncResult["outputLimitExceeded"];

    let runtimeTimeoutHandle: NodeJS.Timeout | undefined;
    let idleTimeoutHandle: NodeJS.Timeout | undefined;
    let forceKillHandle: NodeJS.Timeout | undefined;

    // --- Activity event types that reset the idle timer ---
    const ACTIVITY_EVENT_TYPES = new Set([
      "message_end",
      "tool_result_end",
      "turn_end",
      // NOTE: tool_call_start / tool_call_end are not currently emitted by pi runtime.
      // Add them here if pi adds support for tool-call lifecycle events.
    ]);

    /** Mark the execution as timed out with a specific reason. */
    const markTimedOut = (reason: "runtime" | "idle") => {
      if (timedOut || cancelled) return;
      timedOut = true;
      timeoutReason = reason;
      terminateChild();
    };

    /** Reset the idle timeout. Called on startup and each valid activity event. */
    const resetIdleTimeout = () => {
      if (idleTimeoutMs === undefined) return;
      if (idleTimeoutHandle) clearTimeout(idleTimeoutHandle);
      idleTimeoutHandle = setTimeout(() => {
        markTimedOut("idle");
      }, idleTimeoutMs);
      idleTimeoutHandle.unref?.();
    };

    const child = spawn(command, spawnArgs, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, ...env },
      detached: false,
    });

    // Set up post-exit guard for Windows
    const cleanup = attachPostExitStdioGuard(child);

    const terminateChild = () => {
      trySignalChild(child, "SIGTERM");
      if (forceKillHandle) return;
      forceKillHandle = setTimeout(() => {
        trySignalChild(child, "SIGKILL");
      }, DEFAULT_TERMINATION_GRACE_MS);
      forceKillHandle.unref?.();
    };

    const handleAbort = () => {
      if (!timedOut) cancelled = true;
      terminateChild();
    };

    const markOutputLimitExceeded = (stream: NonNullable<RunSyncResult["outputLimitExceeded"]>) => {
      if (outputLimitExceeded || timedOut || cancelled) return;
      outputLimitExceeded = stream;
      terminateChild();
    };

    signal?.addEventListener("abort", handleAbort, { once: true });

    if (timeoutMs !== undefined) {
      runtimeTimeoutHandle = setTimeout(() => {
        markTimedOut("runtime");
      }, timeoutMs);
      runtimeTimeoutHandle.unref?.();
    }

    // Start the idle timer immediately after the process starts
    resetIdleTimeout();

    // Streaming state accumulation
    const streamMessages: unknown[] = [];
    const streamUsage: Usage = {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      cost: 0,
      turns: 0,
    };
    const streamToolCalls: ToolCallInfo[] = [];
    let streamLastAssistantText = "";

    const processEvent = (event: Record<string, unknown>) => {
      const eventType = event.type;

      // --- message_end: assistant or user message finalized ---
      if (eventType === "message_end" && isRecord(event.message)) {
        const msg = event.message;
        streamMessages.push(msg);

        if (msg.role === "assistant") {
          streamUsage.turns++;

          // Extract usage from assistant message
          if (isRecord(msg.usage)) {
            const u = msg.usage;
            streamUsage.input += asNum(u.input);
            streamUsage.output += asNum(u.output);
            streamUsage.cacheRead += asNum(u.cacheRead);
            streamUsage.cacheWrite += asNum(u.cacheWrite);
            const cost = isRecord(u.cost) ? asNum(u.cost.total) : asNum(u.cost);
            streamUsage.cost += cost;
          }

          // Extract text and tool calls from content
          if (Array.isArray(msg.content)) {
            for (const part of msg.content) {
              if (!isRecord(part)) continue;
              if (part.type === "text" && typeof part.text === "string" && part.text.trim()) {
                streamLastAssistantText = part.text;
              } else if (part.type === "toolCall" && typeof part.name === "string") {
                streamToolCalls.push({
                  name: part.name,
                  args: (isRecord(part.arguments) ? part.arguments : {}) as Record<string, unknown>,
                });
              }
            }
          }
        }

        // Reset idle timeout if this event type is considered valid activity
        if (typeof eventType === "string" && ACTIVITY_EVENT_TYPES.has(eventType)) {
          resetIdleTimeout();
        }

        onStreamingUpdate?.({
          messages: [...streamMessages],
          usage: { ...streamUsage },
          lastAssistantText: streamLastAssistantText,
          toolCalls: [...streamToolCalls],
        });
        return;
      }

      // --- tool_result_end: tool output finalized ---
      if (eventType === "tool_result_end" && isRecord(event.message)) {
        streamMessages.push(event.message);

        // Reset idle timeout if this event type is considered valid activity
        if (typeof eventType === "string" && ACTIVITY_EVENT_TYPES.has(eventType)) {
          resetIdleTimeout();
        }

        onStreamingUpdate?.({
          messages: [...streamMessages],
          usage: { ...streamUsage },
          lastAssistantText: streamLastAssistantText,
          toolCalls: [...streamToolCalls],
        });
      }
    };

    const processStdoutEvents = (events: ReturnType<ChildStdoutCollector["push"]>) => {
      for (const { event, persistence } of events) {
        if (persistence !== "drop") processEvent(event);
      }
    };

    const syncStdoutLimit = () => {
      const limit = stdoutCollector.limitExceeded;
      if (limit) markOutputLimitExceeded(limit);
    };

    // Collect stdout with proper line buffering. Only persisted JSONL/non-JSON
    // lines are stored in the final stdout buffer; high-frequency transient
    // child events are parsed for live state but not retained.
    child.stdout?.on("data", (data: Buffer) => {
      if (outputLimitExceeded) return;

      processStdoutEvents(stdoutCollector.push(data));
      syncStdoutLimit();
    });

    // Collect stderr with a hard byte cap.
    child.stderr?.on("data", (data: Buffer) => {
      const beforeTruncated = stderrBuffer.truncated;
      appendLimitedOutput(stderrBuffer, data, maxStderrBytes);
      if (!beforeTruncated && stderrBuffer.truncated) {
        markOutputLimitExceeded("stderr");
      }
    });

    child.on("close", (code, closeSignal) => {
      signal?.removeEventListener("abort", handleAbort);
      if (runtimeTimeoutHandle) clearTimeout(runtimeTimeoutHandle);
      if (idleTimeoutHandle) clearTimeout(idleTimeoutHandle);
      if (forceKillHandle) clearTimeout(forceKillHandle);
      cleanup();

      // Flush remaining line buffer unless output hard limits already stopped execution.
      if (!outputLimitExceeded) {
        processStdoutEvents(stdoutCollector.flush());
        syncStdoutLimit();
      }

      output = stdoutCollector.decode();
      stderr = decodeLimitedOutput(stderrBuffer);

      exitCode = outputLimitExceeded
        ? 1
        : timedOut
          ? 124
          : (code ?? (cancelled ? 130 : stderr.includes("error") ? 1 : 0));

      const outputLimitMessage = outputLimitExceeded
        ? `Subagent child output exceeded ${formatOutputLimit(outputLimitExceeded, {
            maxStdoutBytes,
            maxStderrBytes,
            maxJsonlLines,
            maxTransientJsonlLines,
          })} and was stopped.`
        : undefined;
      const collected = outputLimitExceeded
        ? {
            output:
              outputLimitMessage ?? "Subagent child output exceeded a hard limit and was stopped.",
            usage: undefined,
            error: outputLimitMessage,
            partialOutput: output || stderr || undefined,
            final: false,
            lastEventType: undefined,
          }
        : collectOutput(output);
      let finalOutput = collected.output;
      let error = collected.error;

      // Preserve stderr as the primary failure reason when the provider/runtime
      // writes errors there. Keep stdout-derived text as partial output.
      if (exitCode !== 0 && stderr.trim()) {
        const stderrText = stderr.trim();
        error = error ? `${error}\n${stderrText}` : stderrText;
        finalOutput = finalOutput ? `${finalOutput}\n${stderrText}` : stderrText;
      }

      // Build display items from accumulated streaming messages
      const displayItems = extractDisplayItems(streamMessages);

      resolve({
        exitCode,
        output: finalOutput,
        usage: collected.usage,
        error,
        partialOutput: collected.partialOutput,
        final: collected.final,
        lastEventType: collected.lastEventType,
        displayItems,
        timedOut,
        timeoutReason,
        cancelled,
        terminationSignal: closeSignal ?? undefined,
        outputLimitExceeded,
      });
    });

    child.on("error", (error) => {
      signal?.removeEventListener("abort", handleAbort);
      if (runtimeTimeoutHandle) clearTimeout(runtimeTimeoutHandle);
      if (idleTimeoutHandle) clearTimeout(idleTimeoutHandle);
      if (forceKillHandle) clearTimeout(forceKillHandle);
      cleanup();

      resolve({
        exitCode: 1,
        output: `Failed to spawn pi: ${error.message}`,
        error: `Failed to spawn pi: ${error.message}`,
        final: false,
      });
    });
  });
}

/**
 * Simple child process spawning for pi
 */
export function spawnPi(
  cwd: string,
  args: string[],
  options: {
    signal?: AbortSignal;
    onStdout?: (data: string) => void;
    onStderr?: (data: string) => void;
    onClose?: (code: number | null) => void;
  } = {}
): ReturnType<typeof spawn> {
  const { command, args: spawnArgs } = getPiSpawnCommand(args);

  const child = spawn(command, spawnArgs, {
    cwd,
    stdio: ["ignore", "pipe", "pipe"],
    env: process.env,
    detached: false,
  });

  const cleanup = attachPostExitStdioGuard(child);

  const onAbort = () => {
    trySignalChild(child, "SIGTERM");
  };
  options.signal?.addEventListener("abort", onAbort, { once: true });

  child.stdout?.on("data", (data: Buffer) => {
    options.onStdout?.(data.toString("utf-8"));
  });

  child.stderr?.on("data", (data: Buffer) => {
    options.onStderr?.(data.toString("utf-8"));
  });

  child.on("close", (code) => {
    options.signal?.removeEventListener("abort", onAbort);
    cleanup();
    options.onClose?.(code);
  });

  return child;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function formatOutputLimit(
  stream: NonNullable<RunSyncResult["outputLimitExceeded"]>,
  limits: {
    maxStdoutBytes: number;
    maxStderrBytes: number;
    maxJsonlLines: number;
    maxTransientJsonlLines: number;
  }
): string {
  switch (stream) {
    case "stdout":
      return `stdout hard limit (${limits.maxStdoutBytes} bytes)`;
    case "stderr":
      return `stderr hard limit (${limits.maxStderrBytes} bytes)`;
    case "jsonlLines":
      return `persisted JSONL line hard limit (${limits.maxJsonlLines} lines)`;
    case "transientJsonlLines":
      return `transient JSONL line hard limit (${limits.maxTransientJsonlLines} lines)`;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asNum(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/**
 * Extract display items from accumulated JSONL messages.
 * Only processes assistant messages for text blocks and tool_use blocks.
 */
function extractDisplayItems(messages: unknown[]): DisplayItem[] {
  const items: DisplayItem[] = [];
  for (const msg of messages) {
    if (!isRecord(msg) || msg.role !== "assistant" || !Array.isArray(msg.content)) continue;
    for (const part of msg.content) {
      if (!isRecord(part)) continue;
      if (part.type === "text" && typeof part.text === "string" && part.text.trim()) {
        items.push({ type: "text", text: part.text });
      } else if (part.type === "toolCall" && typeof part.name === "string") {
        items.push({
          type: "toolCall",
          name: part.name,
          args: (isRecord(part.arguments) ? part.arguments : {}) as Record<string, unknown>,
        });
      }
    }
  }
  return items;
}
