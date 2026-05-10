/**
 * devkit-pi — Personal all-in-one pi coding toolkit
 *
 * Thin entry point. Registers modules:
 * - subagents: task delegation to specialized readonly agents
 * - web: search, fetch, and external research tools
 * - lsp: language server protocol code intelligence (Phase 3)
 *
 * Each module is independently toggleable via config.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { loadConfig, mergeConfig } from "./config/load-config.ts";
import { registerSubagentsModule } from "./modules/subagents/register.ts";
import { registerWebTools } from "./modules/web/register.ts";
// TODO: Phase 3 — import { registerLspModule } from "./modules/lsp/register.ts";

export default function registerExtension(pi: ExtensionAPI): void {
  const config = loadConfig();
  const effectiveConfig = mergeConfig(config);

  if (!effectiveConfig.enabled) return;

  // Web tools are available in both parent and child processes.
  registerWebTools(pi, effectiveConfig.web);

  // Subagents module handles PI_SUBAGENT_CHILD check internally.
  registerSubagentsModule(pi, effectiveConfig.subagents);

  // TODO: Phase 3 — registerLspModule(pi, effectiveConfig.lsp);
}
