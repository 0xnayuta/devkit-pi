import { createDevkitErrorPayload, type DevkitErrorPayload } from "../../shared/errors.ts";

export const GUARDS_ERROR_CODES = {
  GUARD_HARD_BLOCKED: "GUARD_HARD_BLOCKED",
} as const;

export type GuardsErrorCode = (typeof GUARDS_ERROR_CODES)[keyof typeof GUARDS_ERROR_CODES];

export class GuardsGateBlockedError extends Error {
  readonly code: GuardsErrorCode;
  readonly mode: "confirm" | "block";
  readonly toolName: string;

  constructor(options: { mode: "confirm" | "block"; toolName: string; message?: string }) {
    super(
      options.message ??
        `[devkit-pi] Guard ${options.mode} hard-blocked potential write tool '${options.toolName}'.`
    );
    this.name = "GuardsGateBlockedError";
    this.code = GUARDS_ERROR_CODES.GUARD_HARD_BLOCKED;
    this.mode = options.mode;
    this.toolName = options.toolName;
  }
}

export function toDevkitGuardsErrorPayload(error: GuardsGateBlockedError): DevkitErrorPayload {
  return createDevkitErrorPayload({
    code: error.code,
    message: error.message,
    module: "guards",
    retryable: false,
    remediation: "Switch guards.blockMode to 'soft'/'preview' or approve the gated write action.",
    causeSummary: `mode=${error.mode},tool=${error.toolName}`,
  });
}
