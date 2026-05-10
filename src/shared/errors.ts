/**
 * Unified Error Codes for devkit-pi
 *
 * Consolidates error codes from subagents and lsp modules.
 *
 * Unified error codes for devkit-pi
 */

export const ERROR_CODES = {
  // Subagent errors
  INVALID_INPUT: "INVALID_INPUT",
  SUBAGENTS_DISABLED: "SUBAGENTS_DISABLED",
  UNKNOWN_AGENT: "UNKNOWN_AGENT",
  SUBAGENT_DISABLED: "SUBAGENT_DISABLED",
  SUBAGENT_DEPTH_EXCEEDED: "SUBAGENT_DEPTH_EXCEEDED",
  SUBAGENT_TIMEOUT: "SUBAGENT_TIMEOUT",
  SUBAGENT_FAILED: "SUBAGENT_FAILED",
  SUBAGENT_OUTPUT_TRUNCATED: "SUBAGENT_OUTPUT_TRUNCATED",

  // LSP errors (placeholder for Phase 3)
  LSP_SERVER_NOT_FOUND: "LSP_SERVER_NOT_FOUND",
  LSP_TIMEOUT: "LSP_TIMEOUT",
  LSP_ACTION_NOT_ALLOWED: "LSP_ACTION_NOT_ALLOWED",
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

export class LspError extends Error {
  readonly code: ErrorCode;

  constructor(code: ErrorCode, message: string) {
    super(message);
    this.name = "LspError";
    this.code = code;
  }
}
