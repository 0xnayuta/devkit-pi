/**
 * LSP Module Registration
 *
 * Registers the explicit `lsp` tool and optional automatic diagnostics hook.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { PI_SUBAGENT_CHILD, type ResolvedLspConfig } from "../../shared/types.ts";
import { shutdownManager } from "./core.ts";
import { registerLspHook } from "./hook.ts";
import { registerLspTool } from "./tool.ts";

export function registerLspModule(pi: ExtensionAPI, config: ResolvedLspConfig): void {
  if (!config.enabled) return;

  registerLspTool(pi, config.tool);
  if (process.env[PI_SUBAGENT_CHILD] !== "1") {
    registerLspHook(pi, config.hook);
  }

  const piAny = pi as any;
  if (typeof piAny.on === "function") {
    piAny.on("session_shutdown", () => {
      void shutdownManager();
    });
  }
}
