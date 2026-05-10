import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { collectOutput, extractFinalOutput, extractProviderError, extractUsage, parseJsonLines } from "../../src/modules/subagents/collect-output.ts";

function line(value: unknown): string {
	return `${JSON.stringify(value)}\n`;
}

describe("collect output", () => {
	it("extracts final assistant text from turn_end JSONL events", () => {
		const raw = [
			line({ type: "session", id: "abc" }),
			line({ type: "tool_execution_end", toolName: "grep" }),
			line({
				type: "turn_end",
				message: {
					role: "assistant",
					content: [
						{ type: "thinking", thinking: "hidden" },
						{ type: "text", text: "## Findings\n- src/modules/subagents/sanitize.ts" },
					],
					usage: {
						input: 10,
						output: 5,
						cacheRead: 2,
						cacheWrite: 1,
						cost: { total: 0.123 },
					},
				},
			}),
		].join("");

		const result = collectOutput(raw);
		assert.equal(result.output, "## Findings\n- src/modules/subagents/sanitize.ts");
		assert.deepEqual(result.usage, {
			input: 10,
			output: 5,
			cacheRead: 2,
			cacheWrite: 1,
			cost: 0.123,
			turns: 1,
		});
	});

	it("falls back to result.output for legacy/mock messages", () => {
		const messages = parseJsonLines(line({ type: "result", output: "legacy result" }));
		assert.equal(extractFinalOutput(messages), "legacy result");
	});

	it("returns a short diagnostic instead of raw JSONL when no final text exists", () => {
		const raw = [
			line({ type: "session", id: "abc" }),
			line({
				type: "turn_end",
				message: {
					role: "assistant",
					content: [{ type: "toolCall", name: "grep" }],
					stopReason: "toolUse",
				},
			}),
		].join("");

		const result = collectOutput(raw);
		assert.match(result.output, /no final assistant text/i);
		assert.match(result.output, /toolUse/);
		assert.ok(!result.output.includes('"type":"session"'));
	});

	it("extracts provider errors from session message records", () => {
		const messages = parseJsonLines(
			line({
				type: "message",
				message: {
					role: "assistant",
					content: [{ type: "text", text: "Error Code internal_server_error: stream error: stream ID 9367; INTERNAL_ERROR;" }],
				},
			}),
		);

		assert.equal(
			extractProviderError(messages),
			"Error Code internal_server_error: stream error: stream ID 9367; INTERNAL_ERROR;",
		);
	});

	it("separates provider error from partial assistant output", () => {
		const raw = [
			line({
				type: "message_end",
				message: {
					role: "assistant",
					content: [{ type: "text", text: "Let me check the docs first." }],
					stopReason: "toolUse",
				},
			}),
			line({
				type: "message",
				message: {
					role: "assistant",
					content: [{ type: "text", text: "Error Code internal_server_error: stream error: INTERNAL_ERROR" }],
				},
			}),
		].join("");

		const result = collectOutput(raw);
		assert.equal(result.final, false);
		assert.equal(result.error, "Error Code internal_server_error: stream error: INTERNAL_ERROR");
		assert.equal(result.partialOutput, "Let me check the docs first.");
	});

	it("preserves non-JSON output", () => {
		const result = collectOutput("plain text output\n");
		assert.equal(result.output, "plain text output");
		assert.equal(result.final, true);
	});

	it("extracts usage from the last usage-bearing message", () => {
		const messages = parseJsonLines(
			[
				line({ type: "message_end", message: { role: "assistant", usage: { input: 1, output: 2, cacheRead: 3, cacheWrite: 4, cost: 5 } } }),
				line({ type: "turn_end", message: { role: "assistant", usage: { input: 6, output: 7, cacheRead: 8, cacheWrite: 9, cost: { total: 10 } } } }),
			].join(""),
		);

		assert.deepEqual(extractUsage(messages), {
			input: 6,
			output: 7,
			cacheRead: 8,
			cacheWrite: 9,
			cost: 10,
			turns: 1,
		});
	});
});
