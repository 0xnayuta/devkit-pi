import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mergeConfig } from "../../src/config/load-config.ts";
import { DEVKIT_TOOL_MANIFEST } from "../../src/extension/manifest.ts";
import { registerConvertTools } from "../../src/modules/convert/index.ts";
import { registerLspModule } from "../../src/modules/lsp/register.ts";
import { registerSubagentsModule } from "../../src/modules/subagents/register.ts";
import { registerWebTools } from "../../src/modules/web/register.ts";

interface RegisteredToolShape {
	name: string;
	label: string;
	description: string;
	promptSnippet?: string;
	promptGuidelines?: string[];
}

function createPiMock() {
	const tools: RegisteredToolShape[] = [];
	return {
		tools,
		registerTool(tool: RegisteredToolShape) {
			tools.push(tool);
		},
		on() {},
		appendEntry() {},
		registerMessageRenderer() {},
		sendMessage() {},
	};
}

describe("tool registrations align with DEVKIT_TOOL_MANIFEST", () => {
	it("keeps name/label/description/prompt metadata consistent", () => {
		const config = mergeConfig({});
		const pi = createPiMock();

		registerSubagentsModule(pi as any, config.subagents);
		registerWebTools(pi as any, config.web);
		registerConvertTools(pi as any, config.convertContent);
		registerLspModule(pi as any, config.lsp);

		const byName = new Map(pi.tools.map((tool) => [tool.name, tool]));

		for (const meta of DEVKIT_TOOL_MANIFEST) {
			const tool = byName.get(meta.name);
			assert.ok(tool, `${meta.name} should be registered`);
			assert.equal(tool!.name, meta.name);
			assert.equal(tool!.label, meta.label);
			assert.equal(tool!.description, meta.description);
			assert.equal(tool!.promptSnippet, meta.promptSnippet);
			assert.deepEqual(tool!.promptGuidelines, [...meta.promptGuidelines]);
		}
	});
});
