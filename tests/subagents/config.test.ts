/**
 * Namespace configuration loading for devkit-pi.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_CONFIG, mergeConfig } from "../../src/config/load-config.ts";
import { SUBAGENT_ERROR_CODES } from "../../src/shared/types.ts";
import { SubagentParams } from "../../src/modules/subagents/schemas.ts";

describe("Devkit Config Loading", () => {
	describe("Default Configuration", () => {
		it("has correct default values", () => {
			assert.equal(DEFAULT_CONFIG.enabled, true);
			assert.equal(DEFAULT_CONFIG.subagents.enabled, true);
			assert.equal(DEFAULT_CONFIG.subagents.maxDepth, 1);
			assert.equal(DEFAULT_CONFIG.subagents.timeoutMs, 120_000);
			assert.equal(DEFAULT_CONFIG.subagents.allowWrite, false);
			assert.equal(DEFAULT_CONFIG.web.enabled, true);
			assert.equal(DEFAULT_CONFIG.web.provider, "ddgs");
			assert.equal(DEFAULT_CONFIG.lsp.enabled, true);
			assert.equal(DEFAULT_CONFIG.lsp.tool.enabled, true);
			assert.equal(DEFAULT_CONFIG.lsp.tool.allowMutatingActions, false);
			assert.equal(DEFAULT_CONFIG.lsp.hook.enabled, false);
			assert.equal(DEFAULT_CONFIG.lsp.hook.mode, "disabled");
			assert.equal(DEFAULT_CONFIG.commands.enabled, true);
		});

		it("has correct web providerPriority", () => {
			assert.deepEqual(DEFAULT_CONFIG.web.providerPriority, [
				"tavily", "serper", "brave", "openserp", "searxng", "ddgs",
			]);
		});
	});

	describe("Web Tools Configuration", () => {
		it("merges partial web config with defaults", () => {
			const config = mergeConfig({
				web: {
					enabled: false,
					provider: "auto",
					providerPriority: ["searxng", "ddgs"],
					maxResults: 3,
					searxng: { enabled: true, baseUrl: "http://127.0.0.1:9090" },
				},
			});
			assert.equal(config.web.enabled, false);
			assert.equal(config.web.provider, "auto");
			assert.deepEqual(config.web.providerPriority, ["searxng", "ddgs"]);
			assert.equal(config.web.maxResults, 3);
			assert.equal(config.web.searxng.enabled, true);
			assert.equal(config.web.searxng.baseUrl, "http://127.0.0.1:9090");
		});

		it("accepts valid provider, rejects invalid values", () => {
			const valid = mergeConfig({ web: { provider: "ddgs" } });
			assert.equal(valid.web.provider, "ddgs");

			const invalid = mergeConfig({
				web: { enabled: "no" as any, provider: "duckduckgo" as any },
			});
			assert.deepEqual(invalid.web, DEFAULT_CONFIG.web);
		});
	});

	describe("Config Field Validation", () => {
		it("normalizes LSP hook config to disabled during Phase 3", () => {
			const config = mergeConfig({
				lsp: {
					hook: { enabled: true, mode: "agent_end" as any },
				},
			});

			assert.equal(config.lsp.hook.enabled, false);
			assert.equal(config.lsp.hook.mode, "disabled");
		});

		it("normalizes invalid subagent fields through mergeConfig", () => {
			const config = mergeConfig({
				subagents: {
					maxDepth: -1,
					timeoutMs: 0,
					retry: { maxAttempts: 0 },
				},
			});

			assert.equal(config.subagents.maxDepth, DEFAULT_CONFIG.subagents.maxDepth);
			assert.equal(config.subagents.timeoutMs, DEFAULT_CONFIG.subagents.timeoutMs);
			assert.equal(config.subagents.retry.maxAttempts, DEFAULT_CONFIG.subagents.retry.maxAttempts);
		});
	});

	describe("Subagent Error Codes", () => {
		it("has exactly 8 error codes", () => {
			assert.equal(Object.keys(SUBAGENT_ERROR_CODES).length, 8);
		});

		it("includes all required error codes", () => {
			assert.equal(SUBAGENT_ERROR_CODES.INVALID_INPUT, "INVALID_INPUT");
			assert.equal(SUBAGENT_ERROR_CODES.SUBAGENTS_DISABLED, "SUBAGENTS_DISABLED");
			assert.equal(SUBAGENT_ERROR_CODES.UNKNOWN_AGENT, "UNKNOWN_AGENT");
			assert.equal(SUBAGENT_ERROR_CODES.SUBAGENT_DISABLED, "SUBAGENT_DISABLED");
			assert.equal(SUBAGENT_ERROR_CODES.SUBAGENT_DEPTH_EXCEEDED, "SUBAGENT_DEPTH_EXCEEDED");
			assert.equal(SUBAGENT_ERROR_CODES.SUBAGENT_TIMEOUT, "SUBAGENT_TIMEOUT");
			assert.equal(SUBAGENT_ERROR_CODES.SUBAGENT_FAILED, "SUBAGENT_FAILED");
			assert.equal(SUBAGENT_ERROR_CODES.SUBAGENT_OUTPUT_TRUNCATED, "SUBAGENT_OUTPUT_TRUNCATED");
		});
	});

	describe("SubagentParams Schema", () => {
		it("has required agent and task, excludes legacy params", () => {
			assert.equal(SubagentParams.properties.agent.type, "string");
			assert.equal(SubagentParams.properties.task.type, "string");

			const legacy = ["chain", "tasks", "async", "share", "worktree", "action", "id", "sessionDir", "control", "model", "skills"];
			for (const key of legacy) {
				assert.equal(SubagentParams.properties[key as keyof typeof SubagentParams.properties], undefined);
			}
		});
	});
});
