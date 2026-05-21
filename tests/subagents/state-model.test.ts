import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mergeConfig } from "../../src/config/load-config.ts";
import { registerSubagentsModule } from "../../src/modules/subagents/register.ts";
import { SUBAGENT_ERROR_CODES } from "../../src/shared/types.ts";

function createPiMock() {
	const tools: any[] = [];
	return {
		tools,
		registerTool(tool: any) {
			tools.push(tool);
		},
		on() {},
	};
}

function createExecuteContext() {
	return {
		cwd: process.cwd(),
		hasUI: false,
		ui: { setToolsExpanded() {} },
		sessionManager: {
			getSessionFile: () => undefined,
			getSessionId: () => "test-session",
		},
	};
}

function createTheme() {
	return {
		fg: (_color: string, text: string) => text,
		bold: (text: string) => text,
	};
}

function renderText(component: { render(width: number): string[] }): string {
	return component
		.render(160)
		.map((line) => line.trimEnd())
		.join("\n");
}

describe("state model - subagent details restoration", () => {
	it("details minimal shape includes stable mode/results and error fields", async () => {
		const pi = createPiMock();
		registerSubagentsModule(pi as any, mergeConfig({}).subagents);
		const tool = pi.tools.find((candidate) => candidate.name === "subagent");
		assert.ok(tool);

		const result = await tool.execute(
			"id-1",
			{ agent: "explorer", task: "" },
			new AbortController().signal,
			undefined,
			createExecuteContext()
		);

		assert.equal(typeof result, "object");
		assert.ok(result.details);
		assert.equal(result.details.mode, "single");
		assert.ok(Array.isArray(result.details.results));
		assert.equal(result.details.results.length, 0);
		assert.ok(result.details.error);
		assert.equal(result.details.error.code, SUBAGENT_ERROR_CODES.INVALID_INPUT);
		assert.equal(typeof result.details.error.message, "string");
		assert.ok(result.details.error.message.length > 0);
	});

	it("details error shape keeps stable code/message semantics for unknown agent", async () => {
		const pi = createPiMock();
		registerSubagentsModule(pi as any, mergeConfig({}).subagents);
		const tool = pi.tools.find((candidate) => candidate.name === "subagent");
		assert.ok(tool);

		const result = await tool.execute(
			"id-2",
			{ agent: "not-exists", task: "find code" },
			new AbortController().signal,
			undefined,
			createExecuteContext()
		);

		assert.ok(result.details?.error);
		assert.equal(result.details.mode, "single");
		assert.equal(result.details.error.code, SUBAGENT_ERROR_CODES.UNKNOWN_AGENT);
		assert.equal(typeof result.details.error.message, "string");
		assert.match(result.details.error.message, /Unknown agent:/);
	});

	it("legacy details reader degrades gracefully when optional fields are missing", () => {
		const pi = createPiMock();
		registerSubagentsModule(pi as any, mergeConfig({}).subagents);
		const tool = pi.tools.find((candidate) => candidate.name === "subagent");
		assert.ok(tool);

		const legacyLikeResult = {
			content: [{ type: "text", text: "legacy output" }],
			details: {
				mode: "single",
				results: [
					{
						agent: "explorer",
						exitCode: 0,
						output: "legacy output",
						usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, turns: 0 },
					},
				],
			},
		};

		const collapsed = renderText(
			tool.renderResult(legacyLikeResult, { expanded: false }, createTheme(), { isError: false })
		);
		assert.match(collapsed, /explorer/);
		assert.match(collapsed, /legacy output/);

		const expanded = renderText(
			tool.renderResult(legacyLikeResult, { expanded: true }, createTheme(), { isError: false })
		);
		assert.match(expanded, /legacy output/);
	});

	it("render alignment snapshot includes status/agent/task/tool-calls/usage fields", () => {
		const pi = createPiMock();
		registerSubagentsModule(pi as any, mergeConfig({}).subagents);
		const tool = pi.tools.find((candidate) => candidate.name === "subagent");
		assert.ok(tool);

		const collapsedResult = {
			content: [{ type: "text", text: "ok" }],
			details: {
				mode: "single",
				results: [
					{
						agent: "explorer",
						task: "Find auth flow",
						exitCode: 0,
						usage: { input: 1200, output: 240, cacheRead: 0, cacheWrite: 0, cost: 0, turns: 2 },
						output: "Found auth in src/auth/index.ts",
						displayItems: [{ type: "toolCall", name: "read", args: { path: "src/auth/index.ts" } }],
					},
				],
			},
		};

		const collapsed = renderText(
			tool.renderResult(collapsedResult, { expanded: false }, createTheme(), { isError: false })
		);
		assert.equal(
			collapsed,
			[
				"Status: success",
				"Agent: explorer",
				"Task: Find auth flow",
				"→ read src/auth/index.ts",
				"Found auth in src/auth/index.ts",
				"2 turns ↑1.2k ↓240",
			].join("\n")
		);

		const streamingResult = {
			content: [{ type: "text", text: "running" }],
			details: {
				mode: "single",
				results: [],
				streaming: {
					displayItems: [{ type: "toolCall", name: "read", args: { path: "README.md" } }],
					usage: { input: 10, output: 5, cacheRead: 0, cacheWrite: 0, cost: 0, turns: 1 },
					turnCount: 1,
				},
			},
		};
		const streaming = renderText(
			tool.renderResult(streamingResult, { expanded: false }, createTheme(), { isError: false })
		);
		assert.equal(streaming, ["Status: running", "→ read README.md", "1 turn ↑10 ↓5"].join("\n"));
	});

	it("streaming is execution-only and optional in final persisted details", async () => {
		const pi = createPiMock();
		registerSubagentsModule(pi as any, mergeConfig({}).subagents);
		const tool = pi.tools.find((candidate) => candidate.name === "subagent");
		assert.ok(tool);

		const streamingResult = {
			content: [{ type: "text", text: "running" }],
			details: {
				mode: "single",
				results: [],
				streaming: {
					displayItems: [{ type: "toolCall", name: "read", args: { path: "README.md" } }],
					usage: { input: 1, output: 2, cacheRead: 0, cacheWrite: 0, cost: 0, turns: 1 },
					turnCount: 1,
				},
			},
		};
		const partialText = renderText(
			tool.renderResult(streamingResult, { expanded: false }, createTheme(), { isError: false })
		);
		assert.match(partialText, /Status: running/);

		const finalResult = await tool.execute(
			"id-3",
			{ agent: "not-exists", task: "find" },
			new AbortController().signal,
			undefined,
			createExecuteContext()
		);
		assert.equal(finalResult.details?.streaming, undefined);
	});

	it("render gracefully handles malformed legacy details shape", () => {
		const pi = createPiMock();
		registerSubagentsModule(pi as any, mergeConfig({}).subagents);
		const tool = pi.tools.find((candidate) => candidate.name === "subagent");
		assert.ok(tool);

		const malformedLegacyResult = {
			content: [{ type: "text", text: "fallback output" }],
			details: {
				mode: "single",
				results: null,
			},
		};

		assert.doesNotThrow(() => {
			renderText(tool.renderResult(malformedLegacyResult, { expanded: false }, createTheme(), { isError: false }));
		});
	});
});
