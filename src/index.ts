/**
 * devkit-pi — Personal all-in-one pi coding toolkit
 *
 * Thin entry point. Registers three modules:
 * - subagents: task delegation to specialized readonly agents
 * - web: search, fetch, and external research tools
 * - lsp: language server protocol code intelligence
 *
 * Each module is independently toggleable via config.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { loadConfig } from "./config/load-config.ts";
// TODO: Phase 2 — import and call module registrations
// import { registerSubagentsModule } from "./modules/subagents/register.ts";
// import { registerWebModule } from "./modules/web/register.ts";
// import { registerLspModule } from "./modules/lsp/register.ts";

export default function registerExtension(pi: ExtensionAPI): void {
  const config = loadConfig();

  if (!config.enabled) {
    console.log("devkit-pi is disabled in config");
    return;
  }

  // TODO: Phase 2 — uncomment module registrations
  // registerSubagentsModule(pi, config.subagents);
  // registerWebModule(pi, config.web);
  // registerLspModule(pi, config.lsp);
}
