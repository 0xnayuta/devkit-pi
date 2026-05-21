/**
 * Shared error model for devkit-pi.
 *
 * Phase 4 introduces a normalized payload while preserving existing
 * module-specific error codes and error classes.
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

	// LSP errors
	LSP_SERVER_NOT_FOUND: "LSP_SERVER_NOT_FOUND",
	LSP_TIMEOUT: "LSP_TIMEOUT",
	LSP_ACTION_NOT_ALLOWED: "LSP_ACTION_NOT_ALLOWED",
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

export type DevkitErrorModule = "subagents" | "web" | "convert" | "lsp" | "commands" | "guards";

export interface DevkitErrorPayload {
	readonly code: string;
	readonly message: string;
	readonly module: DevkitErrorModule;
	readonly provider?: string;
	readonly causeSummary?: string;
	readonly retryable: boolean;
	readonly remediation?: string;
}

export interface CreateDevkitErrorPayloadInput {
	readonly code: string;
	readonly message: string;
	readonly module: DevkitErrorModule;
	readonly provider?: string;
	readonly causeSummary?: string;
	readonly retryable?: boolean;
	readonly remediation?: string;
}

export function createDevkitErrorPayload(input: CreateDevkitErrorPayloadInput): DevkitErrorPayload {
	return {
		code: input.code,
		message: input.message,
		module: input.module,
		provider: input.provider,
		causeSummary: input.causeSummary,
		retryable: input.retryable ?? false,
		remediation: input.remediation,
	};
}

export function toDevkitErrorPayload(
	error: unknown,
	options: { moduleHint?: DevkitErrorModule } = {}
): DevkitErrorPayload {
	if (error instanceof LspError) {
		return createDevkitErrorPayload({
			code: error.code,
			message: error.message,
			module: "lsp",
			retryable: false,
		});
	}

	const moduleHint = options.moduleHint ?? "commands";

	if (error instanceof Error) {
		return createDevkitErrorPayload({
			code: "INTERNAL_ERROR",
			message: error.message,
			module: moduleHint,
			retryable: false,
			causeSummary: error.name,
		});
	}

	return createDevkitErrorPayload({
		code: "INTERNAL_ERROR",
		message: typeof error === "string" ? error : "Unknown error",
		module: moduleHint,
		retryable: false,
	});
}

export class LspError extends Error {
	readonly code: ErrorCode;

	constructor(code: ErrorCode, message: string) {
		super(message);
		this.name = "LspError";
		this.code = code;
	}
}
