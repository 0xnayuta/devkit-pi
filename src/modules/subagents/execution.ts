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
import { collectOutput } from "./collect-output.ts";
import { getPiSpawnCommand } from "./pi-spawn.ts";

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
  env?: Record<string, string | undefined>;
  /** Called each time a new message is received from the subprocess. */
  onStreamingUpdate?: (state: StreamingState) => void;
}

export async function runSync(
  cwd: string,
  args: string[],
  options: RunSyncOptions = {}
): Promise<RunSyncResult> {
  const { signal, env, onStreamingUpdate } = options;
  const { command, args: spawnArgs } = getPiSpawnCommand(args);

  return new Promise((resolve) => {
    let output = "";
    let stderr = "";
    let exitCode = 0;

    const child = spawn(command, spawnArgs, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, ...env },
      detached: false,
    });

    // Set up post-exit guard for Windows
    const cleanup = attachPostExitStdioGuard(child);

    // Handle signal
    const handleAbort = () => {
      trySignalChild(child, "SIGTERM");
    };

    signal?.addEventListener("abort", handleAbort);

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
    let lineBuffer = "";

    const processLine = (line: string) => {
      const trimmed = line.trim();
      if (!trimmed) return;

      let event: Record<string, unknown>;
      try {
        event = JSON.parse(trimmed);
      } catch {
        return;
      }

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

        onStreamingUpdate?.({
          messages: [...streamMessages],
          usage: { ...streamUsage },
          lastAssistantText: streamLastAssistantText,
          toolCalls: [...streamToolCalls],
        });
      }
    };

    // Collect stdout with proper line buffering
    child.stdout?.on("data", (data: Buffer) => {
      const text = data.toString("utf-8");
      output += text;

      lineBuffer += text;
      const lines = lineBuffer.split("\n");
      lineBuffer = lines.pop() || "";

      for (const line of lines) {
        processLine(line);
      }
    });

    // Collect stderr
    child.stderr?.on("data", (data: Buffer) => {
      stderr += data.toString("utf-8");
    });

    child.on("close", (code) => {
      signal?.removeEventListener("abort", handleAbort);
      cleanup();

      // Flush remaining line buffer
      if (lineBuffer.trim()) {
        processLine(lineBuffer);
        lineBuffer = "";
      }

      exitCode = code ?? (stderr.includes("error") ? 1 : 0);

      const collected = collectOutput(output);
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
      });
    });

    child.on("error", (error) => {
      signal?.removeEventListener("abort", handleAbort);
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

  options.signal?.addEventListener("abort", () => {
    trySignalChild(child, "SIGTERM");
  });

  child.stdout?.on("data", (data: Buffer) => {
    options.onStdout?.(data.toString("utf-8"));
  });

  child.stderr?.on("data", (data: Buffer) => {
    options.onStderr?.(data.toString("utf-8"));
  });

  child.on("close", (code) => {
    options.signal?.removeEventListener("abort", () => trySignalChild(child, "SIGTERM"));
    cleanup();
    options.onClose?.(code);
  });

  return child;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

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
