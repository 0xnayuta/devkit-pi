/**
 * Core execution logic for running subagent
 * Simplified to only support: foreground single execution
 */

import { spawn } from "node:child_process";
import { attachPostExitStdioGuard, trySignalChild } from "../../shared/post-exit-stdio-guard.ts";
import type { Usage } from "../../shared/types.ts";
import { collectOutput } from "./collect-output.ts";
import { getPiSpawnCommand } from "./pi-spawn.ts";

export interface RunSyncResult {
  exitCode: number;
  output: string;
  usage?: Usage;
  error?: string;
  partialOutput?: string;
  final: boolean;
  lastEventType?: string;
}

interface RunSyncOptions {
  signal?: AbortSignal;
  env?: Record<string, string | undefined>;
  onUpdate?: (update: { content: unknown }) => void;
}

export async function runSync(
  cwd: string,
  args: string[],
  options: RunSyncOptions = {}
): Promise<RunSyncResult> {
  const { signal, env, onUpdate } = options;
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

    // Collect stdout
    child.stdout?.on("data", (data: Buffer) => {
      const text = data.toString("utf-8");
      output += text;

      // Try to parse JSON messages for updates
      const lines = text.split("\n").filter((line) => line.trim());
      for (const line of lines) {
        try {
          const parsed = JSON.parse(line);
          if (parsed.type === "progress" || parsed.type === "update") {
            onUpdate?.({ content: parsed });
          }
        } catch {
          // Not JSON, ignore
        }
      }
    });

    // Collect stderr
    child.stderr?.on("data", (data: Buffer) => {
      stderr += data.toString("utf-8");
    });

    child.on("close", (code) => {
      signal?.removeEventListener("abort", handleAbort);
      cleanup();

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

      resolve({
        exitCode,
        output: finalOutput,
        usage: collected.usage,
        error,
        partialOutput: collected.partialOutput,
        final: collected.final,
        lastEventType: collected.lastEventType,
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
