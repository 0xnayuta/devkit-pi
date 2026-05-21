import { createDevkitErrorPayload, type DevkitErrorPayload } from "../../shared/errors.ts";
import { SUBAGENT_ERROR_CODES, type SubagentErrorCode } from "../../shared/types.ts";

const SUBAGENT_REMEDIATION_MAP: Record<SubagentErrorCode, string | undefined> = {
	INVALID_INPUT: "Provide both agent and task, then retry.",
	SUBAGENTS_DISABLED: "Enable subagents.enabled in config before invoking subagent.",
	UNKNOWN_AGENT: "Use /toolkit agents list to find a valid agent name, then retry.",
	SUBAGENT_DISABLED: "Enable this agent in config or select an enabled agent.",
	SUBAGENT_DEPTH_EXCEEDED: "Reduce nesting depth or increase subagents.maxDepth if your workflow requires it.",
	SUBAGENT_TIMEOUT: "Increase subagents.timeoutMs or narrow the delegated task scope.",
	SUBAGENT_FAILED: "Inspect child session output and retry with a narrower task.",
	SUBAGENT_OUTPUT_TRUNCATED: "Reduce output volume, split the task, or increase subagent output limits.",
};

function isSubagentRetryable(code: SubagentErrorCode): boolean {
	return (
		code === SUBAGENT_ERROR_CODES.SUBAGENT_TIMEOUT ||
		code === SUBAGENT_ERROR_CODES.SUBAGENT_FAILED ||
		code === SUBAGENT_ERROR_CODES.SUBAGENT_OUTPUT_TRUNCATED
	);
}

export function toDevkitSubagentErrorPayload(
	error: { code: SubagentErrorCode; message: string },
	options: {
		provider?: string;
		causeSummary?: string;
		retryable?: boolean;
		remediation?: string;
	} = {}
): DevkitErrorPayload {
	return createDevkitErrorPayload({
		code: error.code,
		message: error.message,
		module: "subagents",
		provider: options.provider,
		causeSummary: options.causeSummary,
		retryable: options.retryable ?? isSubagentRetryable(error.code),
		remediation: options.remediation ?? SUBAGENT_REMEDIATION_MAP[error.code],
	});
}
