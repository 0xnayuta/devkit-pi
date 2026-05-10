/**
 * Build pi arguments for subagent execution
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

export const PI_SUBAGENT_CHILD = "PI_SUBAGENT_CHILD";
export const PI_SUBAGENT_DEPTH = "PI_SUBAGENT_DEPTH";
export const PI_SUBAGENT_MAX_DEPTH = "PI_SUBAGENT_MAX_DEPTH";

const TASK_ARG_LIMIT = 8000;
const THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh"];

export function applyThinkingSuffix(
  model: string | undefined,
  thinking: string | undefined
): string | undefined {
  if (!model || !thinking || thinking === "off") return model;
  const colonIdx = model.lastIndexOf(":");
  if (colonIdx !== -1 && THINKING_LEVELS.includes(model.substring(colonIdx + 1))) return model;
  return `${model}:${thinking}`;
}

/**
 * Build arguments for spawning a pi child process
 */
export function buildSubagentChildArgs(input: {
  mode: "json" | "text";
  systemPrompt: string;
  task: string;
  cwd: string;
  sessionFile?: string;
  model?: string;
  tools?: string[];
  env?: Record<string, string>;
}): { args: string[]; env: Record<string, string | undefined>; tempDir?: string } {
  const args: string[] = [];

  // Set output mode
  if (input.mode === "json") {
    args.push("--mode", "json");
  }

  // Session file
  const tempDir = input.sessionFile
    ? path.dirname(input.sessionFile)
    : fs.mkdtempSync(path.join(os.tmpdir(), "pi-subagent-"));

  if (input.sessionFile) {
    fs.mkdirSync(path.dirname(input.sessionFile), { recursive: true });
    args.push("--session", input.sessionFile);
  } else {
    args.push("--no-session");
  }

  // Model
  if (input.model) {
    args.push("--model", input.model);
  }

  // Tools
  if (input.tools?.length) {
    args.push("--tools", input.tools.join(","));
  }

  // System prompt (written to temp file)
  const promptPath = path.join(tempDir, "prompt.md");
  fs.writeFileSync(promptPath, input.systemPrompt, { mode: 0o600 });
  args.push("--system-prompt", promptPath);

  // Task: include an explicit user prompt so the child CLI runs one agent turn.
  // The task is also present in the system prompt for role/constraint context.
  if (input.task.length > TASK_ARG_LIMIT) {
    const taskFilePath = path.join(tempDir, "task.md");
    fs.writeFileSync(taskFilePath, `Task: ${input.task}`, { mode: 0o600 });
    args.push(`@${taskFilePath}`);
  } else {
    args.push(`Task: ${input.task}`);
  }

  // Environment
  const env: Record<string, string | undefined> = {
    ...process.env,
    ...input.env,
    [PI_SUBAGENT_CHILD]: "1",
  };

  return { args, env, tempDir };
}

/**
 * Legacy buildPiArgs function for compatibility
 */
interface BuildPiArgsInput {
  baseArgs: string[];
  task: string;
  sessionEnabled: boolean;
  sessionDir?: string;
  sessionFile?: string;
  model?: string;
  thinking?: string;
  systemPromptMode?: "append" | "replace";
  inheritProjectContext: boolean;
  inheritSkills: boolean;
  tools?: string[];
  extensions?: string[];
  systemPrompt?: string | null;
}

export function buildPiArgs(input: BuildPiArgsInput): {
  args: string[];
  env: Record<string, string | undefined>;
  tempDir?: string;
} {
  const args = [...input.baseArgs];

  if (input.sessionFile) {
    fs.mkdirSync(path.dirname(input.sessionFile), { recursive: true });
    args.push("--session", input.sessionFile);
  } else {
    if (!input.sessionEnabled) {
      args.push("--no-session");
    }
    if (input.sessionDir) {
      fs.mkdirSync(input.sessionDir, { recursive: true });
      args.push("--session-dir", input.sessionDir);
    }
  }

  const modelArg = applyThinkingSuffix(input.model, input.thinking);
  if (modelArg) {
    args.push("--model", modelArg);
  }

  const toolExtensionPaths: string[] = [];
  if (input.tools?.length) {
    const builtinTools: string[] = [];
    for (const tool of input.tools) {
      if (tool.includes("/") || tool.endsWith(".ts") || tool.endsWith(".js")) {
        toolExtensionPaths.push(tool);
      } else {
        builtinTools.push(tool);
      }
    }
    if (builtinTools.length > 0) {
      args.push("--tools", builtinTools.join(","));
    }
  }

  if (input.extensions !== undefined) {
    args.push("--no-extensions");
    for (const extPath of input.extensions) {
      args.push("--extension", extPath);
    }
  }

  if (!input.inheritSkills) {
    args.push("--no-skills");
  }

  let tempDir: string | undefined;
  if (input.systemPrompt !== undefined && input.systemPrompt !== null) {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-subagent-"));
    const stem = "prompt".replace(/<[^\w.-]/g, "_");
    const promptPath = path.join(tempDir, `${stem}.md`);
    fs.writeFileSync(promptPath, input.systemPrompt, { mode: 0o600 });
    args.push(
      input.systemPromptMode === "replace" ? "--system-prompt" : "--append-system-prompt",
      promptPath
    );
  }

  if (input.task.length > TASK_ARG_LIMIT) {
    if (!tempDir) {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-subagent-"));
    }
    const taskFilePath = path.join(tempDir, "task.md");
    fs.writeFileSync(taskFilePath, `Task: ${input.task}`, { mode: 0o600 });
    args.push(`@${taskFilePath}`);
  } else {
    args.push(`Task: ${input.task}`);
  }

  const env: Record<string, string | undefined> = {};
  env[PI_SUBAGENT_CHILD] = "1";

  return { args, env, tempDir };
}

/**
 * Build a simple pi command line
 */
export function buildPiCommand(
  task: string,
  options: {
    mode?: "json" | "text";
    model?: string;
    tools?: string[];
    sessionFile?: string;
  } = {}
): string[] {
  const args: string[] = [];

  if (options.mode === "json") {
    args.push("--mode", "json");
  }

  if (options.sessionFile) {
    args.push("--session", options.sessionFile);
  }

  if (options.model) {
    args.push("--model", options.model);
  }

  if (options.tools?.length) {
    args.push("--tools", options.tools.join(","));
  }

  // Append task
  args.push(task);

  return args;
}

/**
 * Cleanup temp directory
 */
export function cleanupTempDir(tempDir: string | null | undefined): void {
  if (!tempDir) return;
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch {
    // Best effort cleanup
  }
}
