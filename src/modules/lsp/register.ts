/**
 * LSP Module Registration
 *
 * Registers:
 * - "lsp" tool — query language server for code intelligence
 * - LSP hook — automatic diagnostics feedback (default: agent_end)
 * - "/lsp" developer command — hook mode settings
 *
 * TODO: Phase 3 — migrate code from pi-lsp
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export interface LspConfig {
  enabled?: boolean;
  tool?: {
    enabled?: boolean;
    allowMutatingActions?: boolean;
  };
  hook?: {
    enabled?: boolean;
    mode?: "edit_write" | "agent_end" | "disabled";
  };
}

export function registerLspModule(_pi: ExtensionAPI, _config: LspConfig): void {
  // TODO: Phase 3
  // 1. Register "lsp" tool (from lsp-tool.ts)
  // 2. Register LSP hook (from lsp.ts)
  // 3. Register "/lsp" command
  // 4. Register session_shutdown for LSP server cleanup
}
