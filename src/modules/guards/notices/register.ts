import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { toDevkitErrorPayload } from "../../../shared/errors.ts";
import type { ExternalCommandRunner } from "../../../shared/external-command.ts";
import type { Logger } from "../../../shared/logger.ts";
import type { ResolvedGuardsConfig } from "../../../shared/types.ts";
import { extractShellCommand, isShellTool, isVerificationCommand } from "../command-classifier.ts";
import { formatFirstWriteNotice, formatGitContextNotice, getGitContext } from "../git-context.ts";
import { createGuardsSessionState } from "../state.ts";
import { isPotentialWriteTool } from "../tool-classifier.ts";

function notify(ctx: ExtensionContext, message: string): void {
  if (ctx.hasUI && typeof ctx.ui.notify === "function") {
    ctx.ui.notify(message, "info");
    return;
  }
  if (ctx.hasUI && typeof ctx.ui.setStatus === "function") {
    ctx.ui.setStatus("devkit-pi", message);
  }
}

function potentialWriteTarget(event: unknown): string {
  const record = event && typeof event === "object" ? (event as Record<string, unknown>) : {};
  const input = record.input;
  return input &&
    typeof input === "object" &&
    typeof (input as Record<string, unknown>).path === "string"
    ? ((input as Record<string, unknown>).path as string)
    : String(record.toolName ?? "unknown");
}

export function formatVerificationNotice(): string {
  return "[devkit-pi] Verification status: this session appears to have modified files, but no test/lint/typecheck/build command was detected. Suggested next step: run the relevant verification command or explicitly document that verification was not run.";
}

export function registerGuardsNoticeHandlers(
  pi: ExtensionAPI,
  config: ResolvedGuardsConfig,
  deps: { runner: ExternalCommandRunner; logger: Logger }
): void {
  const { runner, logger } = deps;
  let state = createGuardsSessionState();

  pi.on("session_start", () => {
    state = createGuardsSessionState();
  });

  pi.on("session_shutdown", () => {
    state = createGuardsSessionState();
  });

  pi.on("agent_start", () => {
    state.modifiedFiles.clear();
    state.verificationCommands = [];
  });

  pi.on("tool_call", async (event, ctx) => {
    try {
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

      const context = await getGitContext({ cwd: ctx.cwd, runner });
      if (!context) return;

      notify(ctx, formatFirstWriteNotice(context));
    } catch (error) {
      logger.warn("guards.error_payload", "Guard tool_call processing failed", {
        payload: toDevkitErrorPayload(error, { moduleHint: "guards" }),
      });
    }
  });

  pi.on("agent_end", async (_event, ctx) => {
    try {
      if (!config.verificationReminder) return;
      if (state.modifiedFiles.size === 0) return;
      if (state.verificationCommands.length > 0) return;

      notify(ctx, formatVerificationNotice());
      state.modifiedFiles.clear();
    } catch (error) {
      logger.warn("guards.error_payload", "Guard agent_end processing failed", {
        payload: toDevkitErrorPayload(error, { moduleHint: "guards" }),
      });
    }
  });

  pi.on("tool_result", async (_event, ctx) => {
    try {
      if (!config.gitContextNotice) return;
      if (state.hasShownGitContext) return;
      state.hasShownGitContext = true;

      const context = await getGitContext({ cwd: ctx.cwd, runner });
      if (!context) return;

      notify(ctx, formatGitContextNotice(context, ctx.cwd));
    } catch (error) {
      logger.warn("guards.error_payload", "Guard tool_result processing failed", {
        payload: toDevkitErrorPayload(error, { moduleHint: "guards" }),
      });
    }
  });
}
