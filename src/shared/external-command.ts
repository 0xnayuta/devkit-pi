import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { withTimeoutSignal } from "./abort.ts";

export interface ExternalCommandSpec {
  executable: string;
  args?: string[];
}

export interface ResolvedExternalCommand {
  executable: string;
  args: string[];
}

export interface ExternalCommandResolveOptions {
  env?: NodeJS.ProcessEnv;
  extraSearchPaths?: string[];
}

export interface ExternalCommandRunOptions extends ExternalCommandResolveOptions {
  timeoutMs: number;
  signal?: AbortSignal;
  cwd?: string;
  maxStdoutBytes?: number;
  maxStderrBytes?: number;
}

export interface ExternalCommandOutputTruncation {
  stdout: boolean;
  stderr: boolean;
}

export interface ExternalCommandResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  outputTruncated: ExternalCommandOutputTruncation;
}

export const DEFAULT_MAX_STDOUT_BYTES = 8 * 1024 * 1024;
export const DEFAULT_MAX_STDERR_BYTES = 1 * 1024 * 1024;

export interface ExternalCommandRunner {
  isAvailable(
    command: ExternalCommandSpec,
    options?: ExternalCommandResolveOptions
  ): Promise<boolean>;
  run(
    command: ExternalCommandSpec,
    options: ExternalCommandRunOptions
  ): Promise<ExternalCommandResult>;
}

function isPathLike(executable: string): boolean {
  return executable.includes("/") || executable.includes("\\");
}

function isExecutableFile(filePath: string): boolean {
  try {
    fs.accessSync(filePath, fs.constants.X_OK);
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function searchPath(
  executable: string,
  env: NodeJS.ProcessEnv,
  extraSearchPaths: string[] = []
): string | undefined {
  const pathValue = env.PATH ?? process.env.PATH ?? "";
  const extensions = process.platform === "win32" ? [".exe", ".cmd", ".bat", ""] : [""];
  const searchPaths = [...pathValue.split(path.delimiter), ...extraSearchPaths];

  for (const dir of searchPaths) {
    if (!dir) continue;
    for (const ext of extensions) {
      const candidate = path.join(
        dir,
        executable.endsWith(ext) ? executable : `${executable}${ext}`
      );
      if (isExecutableFile(candidate)) return candidate;
    }
  }

  return undefined;
}

export function resolveExternalExecutable(
  executable: string,
  options: ExternalCommandResolveOptions = {}
): string | undefined {
  const normalized = executable.trim();
  if (!normalized) return undefined;

  const env = options.env ?? process.env;
  return isPathLike(normalized)
    ? isExecutableFile(normalized)
      ? normalized
      : undefined
    : searchPath(normalized, env, options.extraSearchPaths);
}

export function resolveExternalCommand(
  command: ExternalCommandSpec,
  options: ExternalCommandResolveOptions = {}
): ResolvedExternalCommand | undefined {
  const resolvedExecutable = resolveExternalExecutable(command.executable, options);
  if (!resolvedExecutable) return undefined;
  return { executable: resolvedExecutable, args: command.args ?? [] };
}

interface LimitedOutputBuffer {
  chunks: Buffer[];
  bytes: number;
  truncated: boolean;
}

function appendLimitedOutput(buffer: LimitedOutputBuffer, chunk: Buffer, maxBytes: number): void {
  if (buffer.truncated) return;

  const remaining = maxBytes - buffer.bytes;
  if (remaining <= 0) {
    buffer.truncated = true;
    return;
  }

  if (chunk.byteLength > remaining) {
    buffer.chunks.push(chunk.subarray(0, remaining));
    buffer.bytes += remaining;
    buffer.truncated = true;
    return;
  }

  buffer.chunks.push(chunk);
  buffer.bytes += chunk.byteLength;
}

function decodeLimitedOutput(buffer: LimitedOutputBuffer): string {
  return Buffer.concat(buffer.chunks, buffer.bytes).toString("utf8");
}

export class NodeExternalCommandRunner implements ExternalCommandRunner {
  async isAvailable(
    command: ExternalCommandSpec,
    options: ExternalCommandResolveOptions = {}
  ): Promise<boolean> {
    return resolveExternalCommand(command, options) !== undefined;
  }

  run(
    command: ExternalCommandSpec,
    options: ExternalCommandRunOptions
  ): Promise<ExternalCommandResult> {
    const env = options.env ?? process.env;
    const resolved = resolveExternalCommand(command, options);
    if (!resolved) {
      const error = new Error(`Command not found: ${command.executable}`) as NodeJS.ErrnoException;
      error.code = "ENOENT";
      return Promise.reject(error);
    }

    return new Promise((resolve, reject) => {
      const maxStdoutBytes = options.maxStdoutBytes ?? DEFAULT_MAX_STDOUT_BYTES;
      const maxStderrBytes = options.maxStderrBytes ?? DEFAULT_MAX_STDERR_BYTES;
      const stdoutBuffer: LimitedOutputBuffer = { chunks: [], bytes: 0, truncated: false };
      const stderrBuffer: LimitedOutputBuffer = { chunks: [], bytes: 0, truncated: false };
      let timedOut = false;
      let killedForOutputLimit = false;
      const signal = withTimeoutSignal(options.timeoutMs, options.signal);

      const onAbort = () => {
        timedOut = true;
      };
      signal.addEventListener("abort", onAbort, { once: true });

      const child = spawn(resolved.executable, resolved.args, {
        cwd: options.cwd,
        env,
        signal,
        stdio: ["ignore", "pipe", "pipe"],
      });

      const killForOutputLimit = () => {
        if (killedForOutputLimit) return;
        killedForOutputLimit = true;
        child.kill();
      };

      child.stdout.on("data", (chunk: Buffer) => {
        appendLimitedOutput(stdoutBuffer, chunk, maxStdoutBytes);
        if (stdoutBuffer.truncated) killForOutputLimit();
      });
      child.stderr.on("data", (chunk: Buffer) => {
        appendLimitedOutput(stderrBuffer, chunk, maxStderrBytes);
        if (stderrBuffer.truncated) killForOutputLimit();
      });

      child.on("error", (error: NodeJS.ErrnoException) => {
        signal.removeEventListener("abort", onAbort);
        if (error.name === "AbortError" || timedOut) {
          resolve({
            exitCode: null,
            stdout: decodeLimitedOutput(stdoutBuffer),
            stderr: decodeLimitedOutput(stderrBuffer),
            timedOut: true,
            outputTruncated: {
              stdout: stdoutBuffer.truncated,
              stderr: stderrBuffer.truncated,
            },
          });
          return;
        }
        reject(error);
      });

      child.on("close", (exitCode) => {
        signal.removeEventListener("abort", onAbort);
        resolve({
          exitCode,
          stdout: decodeLimitedOutput(stdoutBuffer),
          stderr: decodeLimitedOutput(stderrBuffer),
          timedOut,
          outputTruncated: {
            stdout: stdoutBuffer.truncated,
            stderr: stderrBuffer.truncated,
          },
        });
      });
    });
  }
}
