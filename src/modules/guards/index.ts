import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  type ExternalCommandRunner,
  NodeExternalCommandRunner,
} from "../../shared/external-command.ts";
import { createLogger, type Logger } from "../../shared/logger.ts";
import { PI_SUBAGENT_CHILD, type ResolvedGuardsConfig } from "../../shared/types.ts";
import { registerGuardsGateHandlers } from "./gates/register.ts";
import { registerGuardsNoticeHandlers } from "./notices/register.ts";
import { isGuardsGateMode, shouldRunNoticeFlow } from "./policies/mode.ts";

export interface RegisterGuardsOptions {
  runner?: ExternalCommandRunner;
  logger?: Logger;
}

export function registerGuardsModule(
  pi: ExtensionAPI,
  config: ResolvedGuardsConfig,
  options: RegisterGuardsOptions = {}
): void {
  if (!shouldRunNoticeFlow(config)) return;
  if (process.env[PI_SUBAGENT_CHILD] === "1") return;

  const runner = options.runner ?? new NodeExternalCommandRunner();
  const logger = options.logger ?? createLogger({ module: "guards.register" });

  registerGuardsNoticeHandlers(pi, config, { runner, logger });

  if (isGuardsGateMode(config.mode)) {
    registerGuardsGateHandlers(pi, {
      mode: config.mode,
      nonInteractivePolicy: config.nonInteractivePolicy,
      blockMode: config.blockMode,
      logger,
    });
  }
}

export {
  extractShellCommand,
  isShellTool,
  isVerificationCommand,
} from "./command-classifier.ts";
export {
  GUARDS_ERROR_CODES,
  GuardsGateBlockedError,
  toDevkitGuardsErrorPayload,
} from "./errors.ts";
export { registerGuardsGateHandlers } from "./gates/register.ts";
export { formatFirstWriteNotice, formatGitContextNotice, getGitContext } from "./git-context.ts";
export { formatVerificationNotice, registerGuardsNoticeHandlers } from "./notices/register.ts";
export { isGuardsGateMode, shouldRunNoticeFlow } from "./policies/mode.ts";
export { createGuardsSessionState } from "./state.ts";
export { isPotentialWriteTool } from "./tool-classifier.ts";
export type { GitContext, GuardsSessionState } from "./types.ts";
