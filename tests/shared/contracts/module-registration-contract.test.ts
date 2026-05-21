import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { mergeConfig } from "../../../src/config/load-config.ts";
import { registerConvertTools } from "../../../src/modules/convert/index.ts";
import { registerSubagentsModule } from "../../../src/modules/subagents/register.ts";
import { registerWebTools } from "../../../src/modules/web/register.ts";
import { PI_SUBAGENT_CHILD } from "../../../src/shared/types.ts";

interface RegisteredTool {
	name: string;
	label: string;
	description: string;
	promptSnippet?: string;
	promptGuidelines?: string[];
}

function createPiMock() {
	const tools: RegisteredTool[] = [];
	const listeners: string[] = [];
	return {
		tools,
		listeners,
		registerTool(tool: RegisteredTool) {
			tools.push(tool);
		},
		on(event: string) {
			listeners.push(event);
		},
		appendEntry() {},
		registerCommand() {},
	};
}

describe("module registration contract", () => {
	const originalChild = process.env[PI_SUBAGENT_CHILD];

	afterEach(() => {
		if (originalChild === undefined) delete process.env[PI_SUBAGENT_CHILD];
		else process.env[PI_SUBAGENT_CHILD] = originalChild;
	});

	it("web and convert register no tools when module is disabled", () => {
		const base = mergeConfig({});

		const webPi = createPiMock();
		registerWebTools(webPi as any, { ...base.web, enabled: false });
		assert.equal(webPi.tools.length, 0);

		const convertPi = createPiMock();
		registerConvertTools(convertPi as any, { ...base.convertContent, enabled: false });
		assert.equal(convertPi.tools.length, 0);
	});

	it("subagents register no tools when module is disabled", () => {
		const pi = createPiMock();
		const config = mergeConfig({ subagents: { enabled: false } });
		registerSubagentsModule(pi as any, config.subagents);
		assert.equal(pi.tools.length, 0);
	});

	it("subagents do not register tools in child process", () => {
		process.env[PI_SUBAGENT_CHILD] = "1";
		const pi = createPiMock();
		const config = mergeConfig({});
		registerSubagentsModule(pi as any, config.subagents);
		assert.equal(pi.tools.length, 0);
		assert.equal(pi.listeners.length, 0);
	});

	it("registered tools expose prompt snippet and guidelines", () => {
		const config = mergeConfig({});
		const pi = createPiMock();

		registerWebTools(pi as any, config.web);
		registerConvertTools(pi as any, config.convertContent);
		registerSubagentsModule(pi as any, config.subagents);

		for (const tool of pi.tools) {
			assert.equal(typeof tool.promptSnippet, "string", `${tool.name} promptSnippet should be a string`);
			assert.ok(Array.isArray(tool.promptGuidelines), `${tool.name} promptGuidelines should be an array`);
			assert.ok((tool.promptGuidelines?.length ?? 0) > 0, `${tool.name} promptGuidelines should not be empty`);
		}
	});
});
