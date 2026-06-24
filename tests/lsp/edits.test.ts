import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { LSPClient } from "../../src/modules/lsp/client-lifecycle.ts";
import { requestCodeActions, requestRename } from "../../src/modules/lsp/edits.ts";

function fakeClient(sendRequest: (method: string, params: any) => Promise<any>, closed = false): LSPClient {
	return {
		connection: { sendRequest } as any,
		process: {} as any,
		diagnostics: new Map(),
		openFiles: new Map(),
		listeners: new Map(),
		stderr: [],
		root: "/tmp",
		closed,
	};
}

describe("lsp edits", () => {
	it("requestRename returns first successful workspace edit", async () => {
		const closedClient = fakeClient(async () => {
			throw new Error("should not call");
		}, true);
		const failingClient = fakeClient(async () => {
			throw new Error("rename failed");
		});
		const expectedEdit = { changes: { "file:///tmp/a.ts": [] } };
		const okClient = fakeClient(async () => expectedEdit);

		const result = await requestRename(
			{
				clients: [closedClient, failingClient, okClient],
				uri: "file:///tmp/a.ts",
				absPath: "/tmp/a.ts",
				content: "const a = 1;",
			},
			{ line: 0, character: 1 },
			"renamed"
		);

		assert.deepEqual(result, expectedEdit);
	});

	it("requestCodeActions retries cpp line range and dedupes actions", async () => {
		let callCount = 0;
		const client = fakeClient(async (_method, params) => {
			callCount += 1;
			if (callCount === 1) return [];
			if (params?.range?.start?.character === 0) {
				return [
					{ title: "Fix include", kind: "quickfix" },
					{ title: "Fix include", kind: "quickfix" },
				];
			}
			return [];
		});

		const result = await requestCodeActions(
			{
				clients: [client],
				uri: "file:///tmp/main.cpp",
				absPath: "/tmp/main.cpp",
				content: "int main() { return 0; }\n",
			},
			{ line: 0, character: 5 },
			{ line: 0, character: 8 }
		);

		assert.equal(callCount >= 2, true);
		assert.equal(result.length, 1);
		assert.equal((result[0] as any).title, "Fix include");
	});
});
