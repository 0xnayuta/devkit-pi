import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, it } from "node:test";
import { LSPManager, LSP_SERVERS } from "../../src/modules/lsp/core.ts";
import type { LSPClient } from "../../src/modules/lsp/client-lifecycle.ts";

function makeClient(
  sendRequest: (method: string, params: any) => Promise<any>,
  capabilities: any = { diagnosticProvider: {} }
): LSPClient {
  return {
    connection: {
      sendRequest,
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
    root: "/tmp",
    closed: false,
    capabilities,
  } as any;
}

function makeDiag(message: string) {
  return {
    range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
    message,
    severity: 1,
  };
}

describe("lsp manager pull diagnostics fallback", () => {
  it("uses DocumentDiagnostic full report when available", async () => {
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "devkit-pi-lsp-pull-full-"));
    const file = path.join(workspace, "main.ts");
    fs.writeFileSync(file, "export const x = 1;\n", "utf-8");

    const manager = new LSPManager(workspace);
    const originalServers = [...LSP_SERVERS];

    const diag = makeDiag("full");
    const client = makeClient(async (method: string) => {
      if (method === "textDocument/diagnostic") return { kind: "full", items: [diag] };
      return null;
    });

    try {
      LSP_SERVERS.splice(0, LSP_SERVERS.length, {
        id: "typescript",
        extensions: [".ts"],
        findRoot: () => workspace,
        spawn: async () => undefined,
      });

      (manager as any).getClientsForFile = async () => [client];

      const result = await manager.touchFileAndWait(file, 1);
      assert.equal(result.receivedResponse, true);
      assert.equal(result.diagnostics.length, 1);
      assert.equal(result.diagnostics[0].message, "full");
    } finally {
      LSP_SERVERS.splice(0, LSP_SERVERS.length, ...originalServers);
      await manager.shutdown();
    }
  });

  it("treats DocumentDiagnostic unchanged report as responded with current cached snapshot", async () => {
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "devkit-pi-lsp-pull-unchanged-"));
    const file = path.join(workspace, "main.ts");
    fs.writeFileSync(file, "export const x = 1;\n", "utf-8");

    const manager = new LSPManager(workspace);
    const originalServers = [...LSP_SERVERS];

    const absPath = manager.resolveFilePath(file);
    const diag = makeDiag("cached");
    const client = makeClient(async (method: string) => {
      if (method === "textDocument/diagnostic") return { kind: "unchanged" };
      return null;
    });
    client.diagnostics.set(absPath, [diag as any]);

    try {
      LSP_SERVERS.splice(0, LSP_SERVERS.length, {
        id: "typescript",
        extensions: [".ts"],
        findRoot: () => workspace,
        spawn: async () => undefined,
      });

      (manager as any).getClientsForFile = async () => [client];

      const result = await manager.touchFileAndWait(file, 1);
      assert.equal(result.receivedResponse, true);
      assert.equal(result.diagnostics.length, 0);
    } finally {
      LSP_SERVERS.splice(0, LSP_SERVERS.length, ...originalServers);
      await manager.shutdown();
    }
  });

  it("falls back to WorkspaceDiagnostic when DocumentDiagnostic fails", async () => {
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "devkit-pi-lsp-pull-workspace-"));
    const file = path.join(workspace, "main.ts");
    fs.writeFileSync(file, "export const x = 1;\n", "utf-8");

    const manager = new LSPManager(workspace);
    const originalServers = [...LSP_SERVERS];

    const uri = pathToFileURL(file).href;
    const diag = makeDiag("workspace");
    const client = makeClient(async (method: string) => {
      if (method === "textDocument/diagnostic") throw new Error("document diagnostic failed");
      if (method === "workspace/diagnostic") {
        return { items: [{ uri, kind: "full", items: [diag] }] };
      }
      return null;
    });

    try {
      LSP_SERVERS.splice(0, LSP_SERVERS.length, {
        id: "typescript",
        extensions: [".ts"],
        findRoot: () => workspace,
        spawn: async () => undefined,
      });

      (manager as any).getClientsForFile = async () => [client];

      const result = await manager.touchFileAndWait(file, 1);
      assert.equal(result.receivedResponse, true);
      assert.equal(result.diagnostics.length, 1);
      assert.equal(result.diagnostics[0].message, "workspace");
    } finally {
      LSP_SERVERS.splice(0, LSP_SERVERS.length, ...originalServers);
      await manager.shutdown();
    }
  });

  it("returns responded=false when both DocumentDiagnostic and WorkspaceDiagnostic fail", async () => {
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "devkit-pi-lsp-pull-failed-"));
    const file = path.join(workspace, "main.ts");
    fs.writeFileSync(file, "export const x = 1;\n", "utf-8");

    const manager = new LSPManager(workspace);
    const originalServers = [...LSP_SERVERS];

    const client = makeClient(async (method: string) => {
      if (method === "textDocument/diagnostic") throw new Error("document diagnostic failed");
      if (method === "workspace/diagnostic") throw new Error("workspace diagnostic failed");
      return null;
    });

    try {
      LSP_SERVERS.splice(0, LSP_SERVERS.length, {
        id: "typescript",
        extensions: [".ts"],
        findRoot: () => workspace,
        spawn: async () => undefined,
      });

      (manager as any).getClientsForFile = async () => [client];

      const result = await manager.touchFileAndWait(file, 1);
      assert.equal(result.receivedResponse, false);
      assert.deepEqual(result.diagnostics, []);
    } finally {
      LSP_SERVERS.splice(0, LSP_SERVERS.length, ...originalServers);
      await manager.shutdown();
    }
  });
});
