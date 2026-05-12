import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { withTimeoutSignal } from "../web/abort.ts";
import { CONVERT_ERROR_CODES, ConvertProviderError } from "./errors.ts";
import type { ConvertContentMetadata } from "./types.ts";

const STDERR_SUMMARY_CHARS = 1000;

export interface ConvertOptions {
  maxResponseBytes: number;
  timeoutMs: number;
  maxContentChars: number;
  signal?: AbortSignal;
}

export interface ConvertResult {
  content: string;
  truncated: boolean;
  metadata?: ConvertContentMetadata;
}

export interface ConvertProvider {
  readonly name: string;
  isAvailable(): Promise<boolean>;
  convertFile(filePath: string, options: ConvertOptions): Promise<ConvertResult>;
}

export interface MarkItDownProviderOptions {
  command: string;
  env?: NodeJS.ProcessEnv;
}

interface CommandResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

function summarizeStderr(stderr: string): string {
  const normalized = stderr.trim().replace(/\s+/g, " ");
  if (!normalized) return "";
  if (normalized.length <= STDERR_SUMMARY_CHARS) return normalized;
  return `${normalized.slice(0, STDERR_SUMMARY_CHARS)}...`;
}

function truncateContent(
  content: string,
  maxContentChars: number
): { content: string; truncated: boolean } {
  if (content.length <= maxContentChars) return { content, truncated: false };
  return { content: content.slice(0, maxContentChars), truncated: true };
}

function searchPath(command: string, env: NodeJS.ProcessEnv): string | undefined {
  const pathValue = env.PATH ?? process.env.PATH ?? "";
  const extensions = process.platform === "win32" ? [".exe", ".cmd", ".bat", ""] : [""];

  for (const dir of pathValue.split(path.delimiter)) {
    if (!dir) continue;
    for (const ext of extensions) {
      const candidate = path.join(dir, command.endsWith(ext) ? command : `${command}${ext}`);
      try {
        fs.accessSync(candidate, fs.constants.X_OK);
        if (fs.statSync(candidate).isFile()) return candidate;
      } catch {}
    }
  }

  return undefined;
}

function resolveCommand(command: string, env: NodeJS.ProcessEnv): string | undefined {
  if (command.includes("/") || command.includes("\\")) {
    try {
      fs.accessSync(command, fs.constants.X_OK);
      return fs.statSync(command).isFile() ? command : undefined;
    } catch {
      return undefined;
    }
  }
  return searchPath(command, env);
}

function runCommand(
  command: string,
  args: string[],
  options: { timeoutMs: number; signal?: AbortSignal; env: NodeJS.ProcessEnv }
): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const signal = withTimeoutSignal(options.timeoutMs, options.signal);

    const onAbort = () => {
      timedOut = true;
    };
    signal.addEventListener("abort", onAbort, { once: true });

    const child = spawn(command, args, {
      env: options.env,
      signal,
      stdio: ["ignore", "pipe", "pipe"],
    });

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });

    child.on("error", (error: NodeJS.ErrnoException) => {
      signal.removeEventListener("abort", onAbort);
      if (error.name === "AbortError" || timedOut) {
        resolve({ exitCode: null, stdout, stderr, timedOut: true });
        return;
      }
      reject(error);
    });

    child.on("close", (exitCode) => {
      signal.removeEventListener("abort", onAbort);
      resolve({ exitCode, stdout, stderr, timedOut });
    });
  });
}

export class MarkItDownProvider implements ConvertProvider {
  readonly name = "markitdown";

  private readonly command: string;

  private readonly env: NodeJS.ProcessEnv;

  private availabilityCache: boolean | undefined;

  constructor(options: MarkItDownProviderOptions) {
    this.command = options.command;
    this.env = options.env ?? process.env;
  }

  async isAvailable(): Promise<boolean> {
    if (this.availabilityCache !== undefined) return this.availabilityCache;
    this.availabilityCache = resolveCommand(this.command, this.env) !== undefined;
    return this.availabilityCache;
  }

  async convertFile(filePath: string, options: ConvertOptions): Promise<ConvertResult> {
    const command = resolveCommand(this.command, this.env);
    if (!command) {
      throw new ConvertProviderError(
        CONVERT_ERROR_CODES.COMMAND_NOT_FOUND,
        `MarkItDown CLI command '${this.command}' was not found. Install MarkItDown and configure convertContent.command if needed.`
      );
    }

    const startTs = Date.now();
    const stat = fs.statSync(filePath);
    if (stat.size > options.maxResponseBytes) {
      throw new ConvertProviderError(
        CONVERT_ERROR_CODES.FILE_TOO_LARGE,
        `File exceeds convertContent.maxResponseBytes (${stat.size} > ${options.maxResponseBytes}).`
      );
    }

    let result: CommandResult;
    try {
      result = await runCommand(command, [filePath], {
        timeoutMs: options.timeoutMs,
        signal: options.signal,
        env: this.env,
      });
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code === "ENOENT") {
        throw new ConvertProviderError(
          CONVERT_ERROR_CODES.COMMAND_NOT_FOUND,
          `MarkItDown CLI command '${this.command}' was not found. Install MarkItDown and configure convertContent.command if needed.`
        );
      }
      throw new ConvertProviderError(
        CONVERT_ERROR_CODES.CONVERT_FAILED,
        `Failed to execute MarkItDown CLI: ${nodeError.message}`
      );
    }

    if (result.timedOut) {
      throw new ConvertProviderError(
        CONVERT_ERROR_CODES.CONVERT_TIMEOUT,
        `MarkItDown conversion timed out after ${options.timeoutMs}ms.`
      );
    }

    if (result.exitCode !== 0) {
      const stderrSummary = summarizeStderr(result.stderr);
      throw new ConvertProviderError(
        CONVERT_ERROR_CODES.CONVERT_FAILED,
        stderrSummary
          ? `MarkItDown conversion failed with exit code ${result.exitCode}: ${stderrSummary}`
          : `MarkItDown conversion failed with exit code ${result.exitCode}.`,
        stderrSummary
      );
    }

    const truncated = truncateContent(result.stdout, options.maxContentChars);
    return {
      content: truncated.content,
      truncated: truncated.truncated,
      metadata: {
        fileName: path.basename(filePath),
        fileSize: stat.size,
        durationMs: Math.max(0, Date.now() - startTs),
      },
    };
  }
}
