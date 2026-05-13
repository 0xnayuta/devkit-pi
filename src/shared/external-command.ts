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
}

export interface ExternalCommandResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

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
      let stdout = "";
      let stderr = "";
      let timedOut = false;
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
}
