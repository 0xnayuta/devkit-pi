import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { toDevkitSubagentErrorPayload } from "../../src/modules/subagents/errors.ts";
import { SUBAGENT_ERROR_CODES } from "../../src/shared/types.ts";

describe("subagent error payload bridge", () => {
	it("bridges details.error shape to DevkitErrorPayload without changing legacy shape", () => {
		const legacyError = {
			code: SUBAGENT_ERROR_CODES.UNKNOWN_AGENT,
			message: "Unknown agent: ghost-agent",
		};

		const payload = toDevkitSubagentErrorPayload(legacyError);

		assert.equal(payload.module, "subagents");
		assert.equal(payload.code, SUBAGENT_ERROR_CODES.UNKNOWN_AGENT);
		assert.equal(payload.message, "Unknown agent: ghost-agent");
		assert.equal(payload.retryable, false);
		assert.match(payload.remediation ?? "", /agents list/i);
	});

	it("marks timeout as retryable and supports explicit overrides", () => {
		const timeoutError = {
			code: SUBAGENT_ERROR_CODES.SUBAGENT_TIMEOUT,
			message: "Subagent exceeded maximum runtime",
		};

		const payload = toDevkitSubagentErrorPayload(timeoutError, {
			provider: "pi",
			causeSummary: "child runtime timeout",
			retryable: false,
			remediation: "Retry with a narrower task.",
		});

		assert.equal(payload.module, "subagents");
		assert.equal(payload.code, SUBAGENT_ERROR_CODES.SUBAGENT_TIMEOUT);
		assert.equal(payload.provider, "pi");
		assert.equal(payload.causeSummary, "child runtime timeout");
		assert.equal(payload.retryable, false);
		assert.equal(payload.remediation, "Retry with a narrower task.");
	});
});
