import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Diagnostic } from "vscode-languageserver-protocol";
import type { LSPClient } from "../../src/modules/lsp/client-lifecycle.ts";
import { runDiagnosticsCycle } from "../../src/modules/lsp/diagnostics.ts";

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

describe("lsp diagnostics cycle", () => {
	it("collects pushed diagnostics after open/update", async () => {
		const client = fakeClient();
		const pushed: Diagnostic[] = [
			{
				range: {
					start: { line: 0, character: 0 },
					end: { line: 0, character: 1 },
				},
				message: "x",
				severity: 1,
			},
		];

		const result = await runDiagnosticsCycle({
			clients: [client],
			absPath: "/tmp/a.ts",
			uri: "file:///tmp/a.ts",
			langId: "typescript",
			content: "x",
			timeoutMs: 100,
			isNew: true,
			waitForDiagnostics: async () => true,
			openOrUpdate: async (clients, absPath) => {
				clients[0].diagnostics.set(absPath, pushed);
			},
			pullDiagnostics: async () => ({ diagnostics: [], responded: false }),
		});

		assert.equal(result.responded, true);
		assert.deepEqual(result.diagnostics, pushed);
	});

	it("falls back to pulled diagnostics when pushed diagnostics are absent", async () => {
		const client = fakeClient();
		const pulled: Diagnostic[] = [
			{
				range: {
					start: { line: 1, character: 2 },
					end: { line: 1, character: 3 },
				},
				message: "pulled",
				severity: 2,
			},
		];

		const result = await runDiagnosticsCycle({
			clients: [client],
			absPath: "/tmp/b.ts",
			uri: "file:///tmp/b.ts",
			langId: "typescript",
			content: "b",
			timeoutMs: 100,
			isNew: false,
			waitForDiagnostics: async () => false,
			openOrUpdate: async () => {},
			pullDiagnostics: async () => ({ diagnostics: pulled, responded: true }),
		});

		assert.equal(result.responded, true);
		assert.deepEqual(result.diagnostics, pulled);
		assert.deepEqual(client.diagnostics.get("/tmp/b.ts"), pulled);
	});

	it("LSP-TIME-002 returns stable empty result when push and pull both miss", async () => {
		const client = fakeClient();
		const absPath = "/tmp/c.ts";
		client.diagnostics.set(absPath, [
			{
				range: {
					start: { line: 0, character: 0 },
					end: { line: 0, character: 1 },
				},
				message: "stale",
			},
		] as Diagnostic[]);

		const result = await runDiagnosticsCycle({
			clients: [client],
			absPath,
			uri: "file:///tmp/c.ts",
			langId: "typescript",
			content: "c",
			timeoutMs: 50,
			isNew: false,
			waitForDiagnostics: async () => false,
			openOrUpdate: async () => {},
			pullDiagnostics: async () => ({ diagnostics: [], responded: false }),
		});

		assert.equal(result.responded, false);
		assert.deepEqual(result.diagnostics, []);
		assert.equal(client.diagnostics.has(absPath), false);
	});
});
