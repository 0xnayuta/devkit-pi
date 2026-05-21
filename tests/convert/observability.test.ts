import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { mergeConfig } from "../../src/config/load-config.ts";
import { registerConvertTools } from "../../src/modules/convert/index.ts";
import { recordConvertActivity, resetConvertToolStats } from "../../src/modules/convert/observability.ts";
import { clearToolkitActivityLog, getToolkitActivityLog } from "../../src/shared/activity.ts";

const convertConfig = mergeConfig({}).convertContent;

interface MockExtensionAPI {
	eventHandlers: Map<string, Array<(event: unknown, ctx: unknown) => unknown>>;
	registerTool: (tool: unknown) => void;
	on: (event: string, handler: (event: unknown, ctx: unknown) => unknown) => void;
}

function createMockPi(): MockExtensionAPI {
	const eventHandlers = new Map<string, Array<(event: unknown, ctx: unknown) => unknown>>();
	return {
		eventHandlers,
		registerTool: () => undefined,
		on(event: string, handler: (event: unknown, ctx: unknown) => unknown) {
			const handlers = eventHandlers.get(event) ?? [];
			handlers.push(handler);
			eventHandlers.set(event, handlers);
		},
	};
}

async function emit(pi: MockExtensionAPI, eventName: string, event: unknown = {}, ctx: unknown = {}): Promise<void> {
	for (const handler of pi.eventHandlers.get(eventName) ?? []) {
		await handler(event, ctx);
	}
}

describe("convert observability - activity log", () => {
	afterEach(() => {
		resetConvertToolStats();
		clearToolkitActivityLog();
	});

	it("activity log is runtime-memory only and is not restored from session branch entries", async () => {
		clearToolkitActivityLog();
		recordConvertActivity("markitdown", "success", Date.now() - 25);
		const beforeCount = getToolkitActivityLog().length;
		assert.equal(beforeCount, 1);

		const pi = createMockPi();
		registerConvertTools(pi as unknown as Parameters<typeof registerConvertTools>[0], convertConfig);

		await assert.doesNotReject(async () => {
			await emit(pi, "session_start", {}, {
				sessionManager: {
					getBranch: () => {
						throw new Error("should not be called");
					},
				},
			});
		});

		assert.equal(getToolkitActivityLog().length, 0);
	});
});
