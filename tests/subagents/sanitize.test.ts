import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { containsSensitiveInfo, sanitizeOutput } from "../../src/modules/subagents/sanitize.ts";

describe("subagent output sanitizer", () => {
	it("redacts named API keys and tokens without preserving the secret value", () => {
		const secret = "abcdefghijklmnopqrstuvwxyz123456";
		const output = sanitizeOutput(`api_key=${secret}\naccess-token: '${secret}'`);

		assert.doesNotMatch(output, new RegExp(secret));
		assert.match(output, /api_key=\[REDACTED\]/);
		assert.match(output, /access-token=\[REDACTED\]/);
	});

	it("redacts AWS and common provider env secrets without replacement backreferences leaking", () => {
		const awsSecret = "ABCDEFGHIJKLMNOPQRSTUVWXYZ123456";
		const openAiSecret = "abcdefghijklmnopqrstuvwxyz123456";
		const output = sanitizeOutput([
			`AWS_SECRET_ACCESS_KEY=${awsSecret}`,
			`OPENAI_API_KEY=${openAiSecret}`,
		].join("\n"));

		assert.doesNotMatch(output, new RegExp(awsSecret));
		assert.doesNotMatch(output, new RegExp(openAiSecret));
		assert.doesNotMatch(output, /\$1/);
		assert.match(output, /AWS_SECRET_ACCESS_KEY=\[REDACTED\]/);
		assert.match(output, /OPENAI_API_KEY=\[REDACTED\]/);
	});

	it("redacts authorization headers, bearer tokens, GitHub tokens, and secret URL params", () => {
		const output = sanitizeOutput([
			"Authorization: secret-token-value",
			"Bearer abc.def.ghi",
			"ghp_abcdefghijklmnopqrstuvwxyzABCDEFGHIJ123456",
			"https://example.com?a=1&token=abcdefghijklmnopqrstuvwxyz",
		].join("\n"));

		assert.doesNotMatch(output, /secret-token-value|abc\.def\.ghi|ghp_abcdefghijklmnopqrstuvwxyzABCDEFGHIJ123456|abcdefghijklmnopqrstuvwxyz/);
		assert.match(output, /Authorization: \[REDACTED\]/);
		assert.match(output, /Bearer \[REDACTED\]/);
		assert.match(output, /\[GITHUB_TOKEN_REDACTED\]/);
		assert.match(output, /token=\[REDACTED\]/);
	});

	it("detects sensitive markers conservatively", () => {
		assert.equal(containsSensitiveInfo("api_key=maybe"), true);
		assert.equal(containsSensitiveInfo("plain output"), false);
	});
});
