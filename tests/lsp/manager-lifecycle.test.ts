import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, it } from "node:test";
import type { LSPClient } from "../../src/modules/lsp/client-lifecycle.ts";
import { LSPManager } from "../../src/modules/lsp/core.ts";

function fakeClient(root: string): LSPClient {
	return {
		connection: {
			sendRequest: async () => null,
			sendNotification: async () => undefined,
			end: () => {},
			onNotification: () => {},
			onError: () => {},
			onClose: () => {},
			onRequest: () => {},
			listen: () => {},
		} as any,
		process: {
			kill: () => true,
			on: () => {},
		} as any,
		diagnostics: new Map(),
		openFiles: new Map(),
		listeners: new Map(),
		stderr: [],
		root,
		closed: false,
	};
}

describe("lsp manager lifecycle races", () => {
	it("LSP-RACE-002 shutdown racing with getDiagnosticsForFiles settles without hanging", async () => {
		const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "devkit-pi-lsp-manager-race-"));
		const file = path.join(workspace, "main.ts");
		fs.writeFileSync(file, "export const x = 1;\n", "utf-8");

		const manager = new LSPManager(workspace);
		const client = fakeClient(workspace);
		const managerAny = manager as any;

		managerAny.getClientsForFile = async (filePath: string) => {
			const absPath = manager.resolveFilePath(filePath);
			client.openFiles.set(absPath, { version: 1, lastAccess: Date.now() });
			managerAny.clients.set(`typescript:${workspace}`, client);
			return [client];
		};

		const diagnosticsPromise = manager.getDiagnosticsForFiles([file], 80);
		await new Promise((resolve) => setTimeout(resolve, 0));
		const shutdownPromise = manager.shutdown();

		const [diagnosticsResult, shutdownResult] = await Promise.allSettled([diagnosticsPromise, shutdownPromise]);

		assert.equal(shutdownResult.status, "fulfilled");
		assert.equal(diagnosticsResult.status, "fulfilled");

		const output = diagnosticsResult.status === "fulfilled" ? diagnosticsResult.value : null;
		assert.ok(output);
		assert.equal(output.items.length, 1);
		assert.equal(output.items[0].file, file);
		assert.equal(["timeout", "unsupported", "error", "ok"].includes(output.items[0].status), true);

		assert.equal(managerAny.clients.size, 0);
		assert.equal(managerAny.spawning.size, 0);
	});
});
