import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { LSPClient } from "../../src/modules/lsp/client-lifecycle.ts";
import { createRequestOrchestrator, type FileRequestContext } from "../../src/modules/lsp/request-orchestrator.ts";

function fakeClient(): LSPClient {
	return {
		connection: {} as any,
		process: {} as any,
		diagnostics: new Map(),
		openFiles: new Map(),
		listeners: new Map(),
		stderr: [],
		root: "/tmp",
		closed: false,
	};
}

describe("lsp request orchestrator", () => {
	it("prepareFileContext proxies loadFile result", async () => {
		const context: FileRequestContext = {
			clients: [fakeClient()],
			absPath: "/tmp/a.ts",
			uri: "file:///tmp/a.ts",
			langId: "typescript",
			content: "export const a = 1;",
		};

		const orchestrator = createRequestOrchestrator({
			loadFile: async (filePath) => (filePath === "a.ts" ? context : null),
			openOrUpdate: async () => {},
		});

		const found = await orchestrator.prepareFileContext("a.ts");
		const missing = await orchestrator.prepareFileContext("missing.ts");

		assert.equal(found, context);
		assert.equal(missing, null);
	});

	it("syncFileToClients forwards context and evict option", async () => {
		const calls: Array<{ args: any[] }> = [];
		const context: FileRequestContext = {
			clients: [fakeClient()],
			absPath: "/tmp/b.ts",
			uri: "file:///tmp/b.ts",
			langId: "typescript",
			content: "export const b = 2;",
		};

		const orchestrator = createRequestOrchestrator({
			loadFile: async () => context,
			openOrUpdate: async (...args) => {
				calls.push({ args });
			},
		});

		await orchestrator.syncFileToClients(context);
		await orchestrator.syncFileToClients(context, false);

		assert.equal(calls.length, 2);
		assert.deepEqual(calls[0].args, [
			context.clients,
			context.absPath,
			context.uri,
			context.langId,
			context.content,
			true,
		]);
		assert.deepEqual(calls[1].args, [
			context.clients,
			context.absPath,
			context.uri,
			context.langId,
			context.content,
			false,
		]);
	});
});
