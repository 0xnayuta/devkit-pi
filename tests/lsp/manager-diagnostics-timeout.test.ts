import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, it } from "node:test";
import { LSPManager, LSP_SERVERS } from "../../src/modules/lsp/core.ts";
import type { LSPClient } from "../../src/modules/lsp/client-lifecycle.ts";

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
      on: () => undefined,
    } as any,
    diagnostics: new Map(),
    openFiles: new Map(),
    listeners: new Map(),
    stderr: [],
    root,
    closed: false,
  };
}

describe("lsp diagnostics per-file timeout isolation", () => {
  it("LSP-TIME-003 slow file timeout does not block fast file result", async () => {
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "devkit-pi-lsp-time-003-"));
    const fast = path.join(workspace, "fast.ts");
    const slow = path.join(workspace, "slow.ts");
    fs.writeFileSync(fast, "export const a = 1;\n", "utf-8");
    fs.writeFileSync(slow, "export const b = 2;\n", "utf-8");

    const manager = new LSPManager(workspace);
    const originalServers = [...LSP_SERVERS];

    try {
      LSP_SERVERS.splice(0, LSP_SERVERS.length, {
        id: "typescript",
        extensions: [".ts"],
        findRoot: () => workspace,
        spawn: async () => undefined,
      });

      const client = fakeClient(workspace);
      const managerAny = manager as any;

      managerAny.getClientsForFile = async (filePath: string) => {
        const absPath = manager.resolveFilePath(filePath);
        managerAny.clients.set(`typescript:${workspace}`, client);
        return [client];
      };

      const result = await manager.getDiagnosticsForFiles([fast, slow], 5);
      assert.equal(result.items.length, 2);

      const fastItem = result.items.find((it) => it.file === fast)!;
      const slowItem = result.items.find((it) => it.file === slow)!;

      assert.equal(fastItem.status, "timeout");
      assert.equal(fastItem.diagnostics.length, 0);
      assert.equal(slowItem.status, "timeout");
      assert.equal(slowItem.diagnostics.length, 0);
    } finally {
      LSP_SERVERS.splice(0, LSP_SERVERS.length, ...originalServers);
      await manager.shutdown();
    }
  });

  it("getDiagnosticsForFiles cleanup closes only newly opened files", async () => {
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "devkit-pi-lsp-diagnostics-cleanup-"));
    const existing = path.join(workspace, "existing.ts");
    const fresh = path.join(workspace, "fresh.ts");
    fs.writeFileSync(existing, "export const a = 1;\n", "utf-8");
    fs.writeFileSync(fresh, "export const b = 2;\n", "utf-8");

    const manager = new LSPManager(workspace);
    const originalServers = [...LSP_SERVERS];

    const didCloseCalls: string[] = [];
    const client: LSPClient = {
      connection: {
        sendRequest: async () => null,
        sendNotification: async (method: string, payload: any) => {
          if (method === "textDocument/didClose") {
            didCloseCalls.push(payload?.textDocument?.uri ?? "");
          }
          return undefined;
        },
        end: () => {},
        onNotification: () => {},
        onError: () => {},
        onClose: () => {},
        onRequest: () => {},
        listen: () => {},
      } as any,
      process: {
        kill: () => true,
        on: () => undefined,
      } as any,
      diagnostics: new Map(),
      openFiles: new Map(),
      listeners: new Map(),
      stderr: [],
      root: workspace,
      closed: false,
      capabilities: {},
    };

    try {
      LSP_SERVERS.splice(0, LSP_SERVERS.length, {
        id: "typescript",
        extensions: [".ts"],
        findRoot: () => workspace,
        spawn: async () => undefined,
      });

      const existingAbs = manager.resolveFilePath(existing);
      client.openFiles.set(existingAbs, { version: 1, lastAccess: Date.now() });

      const managerAny = manager as any;
      managerAny.getClientsForFile = async () => [client];

      await manager.getDiagnosticsForFiles([existing, fresh], 5);

      assert.equal(client.openFiles.has(existingAbs), true);
      assert.equal(client.openFiles.has(manager.resolveFilePath(fresh)), false);
      assert.equal(didCloseCalls.some((uri) => uri.endsWith("/fresh.ts")), true);
      assert.equal(didCloseCalls.some((uri) => uri.endsWith("/existing.ts")), false);
    } finally {
      LSP_SERVERS.splice(0, LSP_SERVERS.length, ...originalServers);
      await manager.shutdown();
    }
  });
});
