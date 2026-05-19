import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, it } from "node:test";
import { LSPManager, LSP_SERVERS } from "../../src/modules/lsp/core.ts";

function fakeClient(definitionResult?: any) {
  const closed = { value: false };
  const connection = {
    sendRequest: async (method: string) => {
      if (method === "textDocument/definition") return definitionResult ?? [];
      return null;
    },
    sendNotification: async () => undefined,
    end: () => {},
    onNotification: () => {},
    onError: () => {},
    onClose: () => {},
    onRequest: () => {},
    listen: () => {},
  };
  const client = {
    connection,
    process: { kill: () => true, on: () => undefined },
    diagnostics: new Map(),
    openFiles: new Map(),
    listeners: new Map(),
    stderr: [] as string[],
    root: "/tmp",
    closed: false,
  } as any;

  return {
    client,
    triggerClosed: () => {
      closed.value = true;
      client.closed = true;
    },
    closed,
  };
}

describe("lsp manager recovery", () => {
  it("LSP-REC-002 rebuilds client after connection closed instead of reusing stale client", async () => {
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "devkit-pi-lsp-rec-002-"));
    const file = path.join(workspace, "main.ts");
    fs.writeFileSync(file, "export const x = 1;\n", "utf-8");
    fs.writeFileSync(path.join(workspace, "package.json"), "{}\n", "utf-8");

    const manager = new LSPManager(workspace);
    const originalServers = [...LSP_SERVERS];

    let initCalls = 0;
    const first = fakeClient([]);
    const second = fakeClient([]);

    try {
      LSP_SERVERS.splice(0, LSP_SERVERS.length, {
        id: "typescript",
        extensions: [".ts"],
        findRoot: () => workspace,
        spawn: async () => undefined,
      });

      (manager as any).initClient = async () => {
        initCalls += 1;
        return initCalls === 1 ? first.client : second.client;
      };

      const firstResult = await manager.getDefinition(file, 1, 1);
      assert.deepEqual(firstResult, []);
      assert.equal(initCalls, 1);
      assert.equal((manager as any).clients.size, 1);

      first.triggerClosed();
      (manager as any).clients.delete(`typescript:${workspace}`);

      const secondResult = await manager.getDefinition(file, 1, 1);
      assert.deepEqual(secondResult, []);
      assert.equal(initCalls, 2);
      assert.equal((manager as any).clients.size, 1);
      assert.equal((manager as any).clients.get(`typescript:${workspace}`), second.client);
    } finally {
      LSP_SERVERS.splice(0, LSP_SERVERS.length, ...originalServers);
      await manager.shutdown();
    }
  });
});
