import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { Logger } from "../../../shared/logger.ts";
import type {
  GuardsBlockMode,
  GuardsMode,
  GuardsNonInteractivePolicy,
} from "../../../shared/types.ts";
import { GuardsGateBlockedError, toDevkitGuardsErrorPayload } from "../errors.ts";
import { isPotentialWriteTool } from "../tool-classifier.ts";

type GateDecision = "allow" | "deny_soft" | "deny_hard";

function notify(ctx: ExtensionContext, message: string): void {
  if (ctx.hasUI && typeof ctx.ui.notify === "function") {
    ctx.ui.notify(message, "info");
    return;
  }
  if (ctx.hasUI && typeof ctx.ui.setStatus === "function") {
    ctx.ui.setStatus("devkit-pi", message);
  }
}

function getUiConfirm(
  ctx: ExtensionContext
): ((message: string) => boolean | Promise<boolean>) | null {
  if (!ctx.hasUI || typeof ctx.ui !== "object" || ctx.ui === null) return null;
  const candidate = (ctx.ui as unknown as Record<string, unknown>).confirm;
  return typeof candidate === "function"
    ? (candidate as (message: string) => boolean | Promise<boolean>)
    : null;
}

function toDeniedDecision(
  blockMode: GuardsBlockMode
): Extract<GateDecision, "deny_soft" | "deny_hard"> {
  return blockMode === "hard" ? "deny_hard" : "deny_soft";
}

function formatConfirmPrompt(toolName: string): string {
  return `[devkit-pi] Guard mode=confirm: potential write tool '${toolName}' detected. Continue this tool call?`;
}

function formatConfirmDecisionNotice(toolName: string, decision: GateDecision): string {
  if (decision === "allow") {
    return `[devkit-pi] Guard confirm: allowed potential write tool '${toolName}'.`;
  }
  if (decision === "deny_hard") {
    return `[devkit-pi] Guard confirm: denied potential write tool '${toolName}' (hard block enforced).`;
  }
  return `[devkit-pi] Guard confirm: denied potential write tool '${toolName}' (soft deny, not enforced).`;
}

function formatNonInteractiveDecisionNotice(
  toolName: string,
  policy: GuardsNonInteractivePolicy,
  decision: GateDecision
): string {
  return `[devkit-pi] Guard mode=confirm (non-interactive): policy=${policy}, tool='${toolName}', decision=${decision}.`;
}

function formatBlockDecisionNotice(
  toolName: string,
  blockMode: GuardsBlockMode,
  decision: GateDecision
): string {
  return `[devkit-pi] Guard mode=block (${blockMode}): potential write tool '${toolName}' decision=${decision}.`;
}

function enforceHardBlock(
  decision: GateDecision,
  mode: "confirm" | "block",
  toolName: string,
  logger: Logger
): void {
  if (decision !== "deny_hard") return;
  const error = new GuardsGateBlockedError({ mode, toolName });
  logger.warn("guards.error_payload", "Guard hard block enforced", {
    payload: toDevkitGuardsErrorPayload(error),
  });
  throw error;
}

export function registerGuardsGateHandlers(
  pi: ExtensionAPI,
  options: {
    mode: Exclude<GuardsMode, "off" | "notice">;
    nonInteractivePolicy: GuardsNonInteractivePolicy;
    blockMode: GuardsBlockMode;
    logger: Logger;
  }
): void {
  pi.on("tool_call", async (event, ctx) => {
    const toolName = String(event?.toolName ?? "");
    if (!isPotentialWriteTool(toolName, event?.input)) return;

    if (options.mode === "confirm") {
      const confirm = getUiConfirm(ctx);
      if (confirm) {
        const approved = await confirm(formatConfirmPrompt(toolName));
        const decision: GateDecision = approved ? "allow" : toDeniedDecision(options.blockMode);
        options.logger.info("guards.gate_decision", "Guard confirm decision", {
          mode: options.mode,
          toolName,
          decision,
          source: "ui_confirm",
          blockMode: options.blockMode,
          enforced: decision === "deny_hard",
        });
        notify(ctx, formatConfirmDecisionNotice(toolName, decision));
        enforceHardBlock(decision, "confirm", toolName, options.logger);
        return;
      }

      const denied = options.nonInteractivePolicy === "deny";
      const decision: GateDecision = denied ? toDeniedDecision(options.blockMode) : "allow";
      options.logger.info("guards.gate_decision", "Guard non-interactive confirm policy decision", {
        mode: options.mode,
        toolName,
        decision,
        source: "non_interactive_policy",
        policy: options.nonInteractivePolicy,
        blockMode: options.blockMode,
        enforced: decision === "deny_hard",
      });
      notify(
        ctx,
        formatNonInteractiveDecisionNotice(toolName, options.nonInteractivePolicy, decision)
      );
      enforceHardBlock(decision, "confirm", toolName, options.logger);
      return;
    }

    const decision = toDeniedDecision(options.blockMode);
    options.logger.info("guards.gate_decision", "Guard block decision", {
      mode: options.mode,
      toolName,
      decision,
      blockMode: options.blockMode,
      enforced: decision === "deny_hard",
    });
    notify(ctx, formatBlockDecisionNotice(toolName, options.blockMode, decision));
    enforceHardBlock(decision, "block", toolName, options.logger);
  });
}
