import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_CONFIG, DEFAULT_CONVERT_CONTENT_CONFIG, mergeConfig } from "../../src/config/load-config.ts";

const DEFAULTS = DEFAULT_CONVERT_CONTENT_CONFIG;

describe("convertContent config", () => {
	it("is included in DEFAULT_CONFIG", () => {
		assert.deepEqual(DEFAULT_CONFIG.convertContent, DEFAULTS);
	});

	it("normalizes empty config to defaults", () => {
		assert.deepEqual(mergeConfig({ convertContent: {} }).convertContent, DEFAULTS);
	});

	it("merges valid fields", () => {
		const config = mergeConfig({
			convertContent: {
				enabled: false,
				provider: "markitdown",
				command: "/usr/local/bin/markitdown",
				timeoutMs: 1234,
				maxResponseBytes: 2048,
				maxContentChars: 4096,
				allowPrivateNetwork: true,
			},
		});

		assert.deepEqual(config.convertContent, {
			enabled: false,
			provider: "markitdown",
			command: "/usr/local/bin/markitdown",
			timeoutMs: 1234,
			maxResponseBytes: 2048,
			maxContentChars: 4096,
			allowPrivateNetwork: true,
		});
	});

	it("falls back for invalid fields", () => {
		const config = mergeConfig({
			convertContent: {
				enabled: "yes" as any,
				provider: "pandoc" as any,
				command: "   ",
				timeoutMs: 0,
				maxResponseBytes: -1,
				maxContentChars: 1.5,
				allowPrivateNetwork: "true" as any,
			},
		});

		assert.deepEqual(config.convertContent, DEFAULTS);
	});
});
