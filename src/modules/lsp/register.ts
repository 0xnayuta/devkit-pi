/**
 * LSP Module Registration
 *
 * Phase 3 registers only the explicit `lsp` tool. Hook-driven automatic
 * diagnostics are intentionally not enabled in this phase.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { ResolvedLspConfig } from "../../shared/types.ts";
import { shutdownManager } from "./core.ts";
import { registerLspTool } from "./tool.ts";

export function registerLspModule(pi: ExtensionAPI, config: ResolvedLspConfig): void {
  if (!config.enabled) return;

  registerLspTool(pi, config.tool);

  const piAny = pi as any;
  if (typeof piAny.on === "function") {
    piAny.on("session_shutdown", () => {
      void shutdownManager();
    });
  }
}
