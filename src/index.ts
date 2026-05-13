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
import { registerLspModule } from "./modules/lsp/register.ts";
import { registerSubagentsModule } from "./modules/subagents/register.ts";
import { registerWebTools } from "./modules/web/register.ts";

export default function registerExtension(pi: ExtensionAPI): void {
  const { config, errors } = loadConfig();
  if (errors.length > 0) {
    for (const msg of errors) {
      console.error(msg);
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
  registerSubagentsModule(pi, subagentsConfig);

  // Convert tool is available in both parent and child processes.
  registerConvertTools(pi, effectiveConfig.convertContent);

  // Commands module is main-process only and controlled by commands.enabled.
  registerToolkitCommands(pi, effectiveConfig);
}
