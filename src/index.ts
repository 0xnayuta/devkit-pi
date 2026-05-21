/**
 * devkit-pi — Personal all-in-one pi coding toolkit
 *
 * Thin entry point. Registers modules:
 * - subagents: task delegation to specialized readonly agents
 * - web: search, fetch, and external research tools
 * - lsp: language server protocol code intelligence
 * - convert: document conversion to Markdown
 * - commands: unified toolkit command center
 *
 * Each module is independently toggleable via config.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { loadConfig, mergeConfig } from "./config/load-config.ts";
import { registerToolkitCommands } from "./modules/commands/register.ts";
import { registerConvertTools } from "./modules/convert/index.ts";
import { registerGuardsModule } from "./modules/guards/index.ts";
import { registerLspModule } from "./modules/lsp/register.ts";
import { registerSubagentsModule } from "./modules/subagents/register.ts";
import { registerWebTools } from "./modules/web/register.ts";
import {
  createConsoleLoggerSink,
  createLogger,
  type Logger,
  type LoggerSink,
} from "./shared/logger.ts";

export default function registerExtension(
  pi: ExtensionAPI,
  options: { logger?: Logger; loggerSink?: LoggerSink } = {}
): void {
  const baseLogger =
    options.logger ??
    createLogger({
      module: "extension",
      sink: options.loggerSink ?? createConsoleLoggerSink(),
    });
  const logger = baseLogger.child("index");

  const { config, errors } = loadConfig();
  if (errors.length > 0) {
    for (const msg of errors) {
      logger.error("config.load_error", msg);
    }
  }
  const effectiveConfig = mergeConfig(config);

  if (!effectiveConfig.enabled) return;

  // Web tools are available in both parent and child processes.
  registerWebTools(pi, effectiveConfig.web);

  // LSP tool is available in both parent and child processes; privileged actions
  // are gated by lsp.tool.allowMutatingActions and are disabled for subagents.
  registerLspModule(pi, effectiveConfig.lsp);

  const subagentsConfig = {
    ...effectiveConfig.subagents,
    allowLspTools:
      effectiveConfig.subagents.allowLspTools &&
      effectiveConfig.lsp.enabled &&
      effectiveConfig.lsp.tool.enabled,
  };

  // Subagents module handles PI_SUBAGENT_CHILD check internally.
  registerSubagentsModule(pi, subagentsConfig, { logger: logger.child("subagents") });

  // Convert tool is available in both parent and child processes.
  registerConvertTools(pi, effectiveConfig.convertContent);

  // Guards are main-process-only soft notices; they do not block tool calls.
  registerGuardsModule(pi, effectiveConfig.guards);

  // Commands module is main-process only and controlled by commands.enabled.
  registerToolkitCommands(pi, effectiveConfig);
}
