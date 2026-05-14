import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  type ExternalCommandRunner,
  NodeExternalCommandRunner,
} from "../../shared/external-command.ts";
import { PI_SUBAGENT_CHILD, type ResolvedGuardsConfig } from "../../shared/types.ts";
import { extractShellCommand, isShellTool, isVerificationCommand } from "./command-classifier.ts";
import { formatFirstWriteNotice, formatGitContextNotice, getGitContext } from "./git-context.ts";
import { createGuardsSessionState } from "./state.ts";
import { isPotentialWriteTool } from "./tool-classifier.ts";

export interface RegisterGuardsOptions {
  runner?: ExternalCommandRunner;
}

function notify(ctx: any, message: string): void {
  if (ctx?.hasUI && typeof ctx.ui?.notify === "function") {
    ctx.ui.notify(message, "info");
    return;
  }
  if (ctx?.hasUI && typeof ctx.ui?.setStatus === "function") {
    ctx.ui.setStatus("devkit-pi", message);
  }
}

function potentialWriteTarget(event: any): string {
  const input = event?.input;
  return input &&
    typeof input === "object" &&
    typeof (input as Record<string, unknown>).path === "string"
    ? ((input as Record<string, unknown>).path as string)
    : String(event?.toolName ?? "unknown");
}

export function formatVerificationNotice(): string {
  return "[devkit-pi] Verification status: this session appears to have modified files, but no test/lint/typecheck/build command was detected. Suggested next step: run the relevant verification command or explicitly document that verification was not run.";
}

export function registerGuardsModule(
  pi: ExtensionAPI,
  config: ResolvedGuardsConfig,
  options: RegisterGuardsOptions = {}
): void {
  if (!config.enabled) return;
  if (process.env[PI_SUBAGENT_CHILD] === "1") return;
  if (typeof (pi as any).on !== "function") return;

  const runner = options.runner ?? new NodeExternalCommandRunner();
  let state = createGuardsSessionState();

  (pi as any).on("session_start", () => {
    state = createGuardsSessionState();
  });

  (pi as any).on("session_shutdown", () => {
    state = createGuardsSessionState();
  });

  (pi as any).on("agent_start", () => {
    state.modifiedFiles.clear();
    state.verificationCommands = [];
  });

  (pi as any).on("tool_call", async (event: any, ctx: any) => {
    const toolName = String(event?.toolName ?? "");
    if (isShellTool(toolName)) {
      const command = extractShellCommand(event?.input);
      if (isVerificationCommand(command)) state.verificationCommands.push(command);
    }

    const isWrite = isPotentialWriteTool(toolName, event?.input);
    if (isWrite) state.modifiedFiles.add(potentialWriteTarget(event));

    if (!config.firstWriteReminder) return;
    if (state.hasWarnedBeforeFirstWrite) return;
    if (!isWrite) return;
    state.hasWarnedBeforeFirstWrite = true;

    const cwd = typeof ctx?.cwd === "string" ? ctx.cwd : process.cwd();
    const context = await getGitContext({ cwd, runner });
    if (!context) return;

    notify(ctx, formatFirstWriteNotice(context));
  });

  (pi as any).on("agent_end", async (_event: unknown, ctx: any) => {
    if (!config.verificationReminder) return;
    if (state.modifiedFiles.size === 0) return;
    if (state.verificationCommands.length > 0) return;

    notify(ctx, formatVerificationNotice());
    state.modifiedFiles.clear();
  });

  (pi as any).on("tool_result", async (_event: unknown, ctx: any) => {
    if (!config.gitContextNotice) return;
    if (state.hasShownGitContext) return;
    state.hasShownGitContext = true;

    const cwd = typeof ctx?.cwd === "string" ? ctx.cwd : process.cwd();
    const context = await getGitContext({ cwd, runner });
    if (!context) return;

    notify(ctx, formatGitContextNotice(context, cwd));
  });
}

export {
  extractShellCommand,
  isShellTool,
  isVerificationCommand,
} from "./command-classifier.ts";
export { formatFirstWriteNotice, formatGitContextNotice, getGitContext } from "./git-context.ts";
export { createGuardsSessionState } from "./state.ts";
export { isPotentialWriteTool } from "./tool-classifier.ts";
export type { GitContext, GuardsSessionState } from "./types.ts";
