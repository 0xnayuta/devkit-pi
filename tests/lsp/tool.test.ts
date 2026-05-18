import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, it } from "node:test";
import { mergeConfig } from "../../src/config/load-config.ts";
import * as lspCore from "../../src/modules/lsp/core.ts";
import {
  DEFAULT_LSP_MAX_SOURCE_FILE_BYTES,
  LspFileTooLargeError,
  readTextFileLimited,
} from "../../src/modules/lsp/core.ts";
import { registerLspModule } from "../../src/modules/lsp/register.ts";
import { LSP_ACTIONS } from "../../src/modules/lsp/tool.ts";
import {
  PI_SUBAGENT_ALLOW_LSP,
  PI_SUBAGENT_CHILD,
  PI_SUBAGENT_LSP_ACTIONS,
} from "../../src/shared/types.ts";

function createPiMock() {
  const tools: any[] = [];
  const listeners: Record<string, Array<(...args: unknown[]) => void>> = {};
  const renderers: string[] = [];
  const messages: any[] = [];
  return {
    tools,
    listeners,
    renderers,
    messages,
    registerTool(tool: any) {
      tools.push(tool);
    },
    registerMessageRenderer(name: string) {
      renderers.push(name);
    },
    sendMessage(message: any, options: any) {
      messages.push({ message, options });
    },
    on(event: string, handler: (...args: unknown[]) => void) {
      listeners[event] ??= [];
      listeners[event].push(handler);
    },
  };
}

function createFakeLspClient() {
  const calls = {
    shutdownRequests: 0,
    exitNotifications: 0,
    connectionEnds: 0,
    processKills: 0,
  };

  const client = {
    connection: {
      sendRequest(method: string) {
        if (method === "shutdown") calls.shutdownRequests += 1;
        return Promise.resolve(null);
      },
      sendNotification(method: string) {
        if (method === "exit") calls.exitNotifications += 1;
        return Promise.resolve();
      },
      end() {
        calls.connectionEnds += 1;
      },
    },
    process: {
      kill() {
        calls.processKills += 1;
      },
    },
    diagnostics: new Map(),
    openFiles: new Map(),
    listeners: new Map(),
    stderr: [],
    root: "/fake-root",
    closed: false,
  };

  return { client, calls };
}

describe("lsp module", () => {
  const originalChild = process.env[PI_SUBAGENT_CHILD];
  const originalAllowLsp = process.env[PI_SUBAGENT_ALLOW_LSP];
  const originalLspActions = process.env[PI_SUBAGENT_LSP_ACTIONS];

  afterEach(() => {
    if (originalChild === undefined) delete process.env[PI_SUBAGENT_CHILD];
    else process.env[PI_SUBAGENT_CHILD] = originalChild;
    if (originalAllowLsp === undefined) delete process.env[PI_SUBAGENT_ALLOW_LSP];
    else process.env[PI_SUBAGENT_ALLOW_LSP] = originalAllowLsp;
    if (originalLspActions === undefined) delete process.env[PI_SUBAGENT_LSP_ACTIONS];
    else process.env[PI_SUBAGENT_LSP_ACTIONS] = originalLspActions;
  });

  it("registers the lsp tool and default hook events when enabled", () => {
    const pi = createPiMock();
    registerLspModule(pi as any, mergeConfig({}).lsp);

    assert.deepEqual(pi.tools.map((tool) => tool.name), ["lsp"]);
    assert.equal(pi.listeners.agent_end?.length, 1);
    assert.equal(pi.listeners.tool_result?.length, 1);
    assert.equal(pi.listeners.session_shutdown?.length, 1);
    assert.deepEqual(pi.renderers, ["lsp-diagnostics"]);
  });

  it("does not register hook events when lsp hook is disabled", () => {
    const pi = createPiMock();
    registerLspModule(pi as any, mergeConfig({ lsp: { hook: { enabled: false } } }).lsp);

    assert.deepEqual(pi.tools.map((tool) => tool.name), ["lsp"]);
    assert.equal(pi.listeners.agent_end, undefined);
    assert.equal(pi.listeners.session_shutdown?.length, 1);
    assert.equal(pi.renderers.length, 0);
  });

  it("does not register hook events when lsp hook mode is disabled", () => {
    const pi = createPiMock();
    registerLspModule(pi as any, mergeConfig({ lsp: { hook: { mode: "disabled" } } }).lsp);

    assert.deepEqual(pi.tools.map((tool) => tool.name), ["lsp"]);
    assert.equal(pi.listeners.agent_end, undefined);
    assert.equal(pi.listeners.session_shutdown?.length, 1);
    assert.equal(pi.renderers.length, 0);
  });

  it("registers edit_write hook events without agent_end diagnostics", () => {
    const pi = createPiMock();
    registerLspModule(pi as any, mergeConfig({ lsp: { hook: { mode: "edit_write" } } }).lsp);

    assert.deepEqual(pi.tools.map((tool) => tool.name), ["lsp"]);
    assert.equal(pi.listeners.tool_result?.length, 1);
    assert.equal(pi.listeners.agent_end?.length, 1);
    assert.deepEqual(pi.renderers, ["lsp-diagnostics"]);
  });

  it("does not register hook events in subagent child processes", () => {
    process.env[PI_SUBAGENT_CHILD] = "1";
    const pi = createPiMock();
    registerLspModule(pi as any, mergeConfig({}).lsp);

    assert.deepEqual(pi.tools.map((tool) => tool.name), ["lsp"]);
    assert.equal(pi.listeners.agent_end, undefined);
    assert.equal(pi.listeners.session_shutdown?.length, 1);
  });

  it("does not register when lsp or lsp.tool is disabled", () => {
    const disabledModule = createPiMock();
    registerLspModule(disabledModule as any, mergeConfig({ lsp: { enabled: false } }).lsp);
    assert.equal(disabledModule.tools.length, 0);

    const disabledTool = createPiMock();
    registerLspModule(disabledTool as any, mergeConfig({ lsp: { tool: { enabled: false } } }).lsp);
    assert.equal(disabledTool.tools.length, 0);
  });

  it("lists server ids without starting a language server", async () => {
    const pi = createPiMock();
    registerLspModule(pi as any, mergeConfig({}).lsp);

    const result = await pi.tools[0].execute(
      "call-1",
      { action: "servers" },
      undefined,
      undefined,
      { cwd: process.cwd() }
    );

    assert.match(result.content[0].text, /action: servers/);
    assert.ok(result.details.servers.includes("typescript"));
  });

  it("deduplicates concurrent spawn for the same root", async () => {
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "devkit-pi-lsp-concurrency-"));
    const file = path.join(workspace, "main.ts");
    fs.writeFileSync(file, "export const x = 1;\n", "utf-8");
    fs.writeFileSync(path.join(workspace, "package.json"), "{}\n", "utf-8");

    const manager = new lspCore.LSPManager(workspace);
    const originalServers = [...lspCore.LSP_SERVERS];

    let initCalls = 0;
    const fakeClient = { id: "fake-client" };

    try {
      lspCore.LSP_SERVERS.splice(0, lspCore.LSP_SERVERS.length, {
        id: "typescript",
        extensions: [".ts"],
        findRoot: () => workspace,
        spawn: async () => undefined,
      });

      (manager as any).initClient = async () => {
        initCalls += 1;
        await new Promise((resolve) => setTimeout(resolve, 20));
        return fakeClient;
      };

      const [clientsA, clientsB] = await Promise.all([
        manager.getClientsForFile(file),
        manager.getClientsForFile(file),
      ]);

      assert.equal(initCalls, 1);
      assert.equal(clientsA.length, 1);
      assert.equal(clientsB.length, 1);
      assert.equal(clientsA[0], fakeClient);
      assert.equal(clientsB[0], fakeClient);
    } finally {
      lspCore.LSP_SERVERS.splice(0, lspCore.LSP_SERVERS.length, ...originalServers);
      await manager.shutdown();
    }
  });

  it("does not write back client after shutdown during in-flight spawn", async () => {
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "devkit-pi-lsp-shutdown-race-"));
    const file = path.join(workspace, "main.ts");
    fs.writeFileSync(file, "export const x = 1;\n", "utf-8");
    fs.writeFileSync(path.join(workspace, "package.json"), "{}\n", "utf-8");

    const manager = new lspCore.LSPManager(workspace);
    const originalServers = [...lspCore.LSP_SERVERS];

    let resolveInit: (client: any) => void = () => {
      throw new Error("init resolver was not captured");
    };
    const { client: fakeClient, calls } = createFakeLspClient();

    try {
      lspCore.LSP_SERVERS.splice(0, lspCore.LSP_SERVERS.length, {
        id: "typescript",
        extensions: [".ts"],
        findRoot: () => workspace,
        spawn: async () => undefined,
      });

      (manager as any).initClient = async () => {
        const client = await new Promise<any>((resolve) => {
          resolveInit = resolve;
        });
        return client;
      };

      const pending = manager.getClientsForFile(file);
      await new Promise((resolve) => setTimeout(resolve, 0));

      await manager.shutdown();
      resolveInit(fakeClient);
      await pending;

      assert.equal((manager as any).clients.size, 0);
      assert.equal(calls.shutdownRequests, 1);
      assert.equal(calls.exitNotifications, 1);
      assert.equal(calls.connectionEnds, 1);
      assert.equal(calls.processKills, 1);
    } finally {
      lspCore.LSP_SERVERS.splice(0, lspCore.LSP_SERVERS.length, ...originalServers);
      await manager.shutdown();
    }
  });

  it("does not write back client after restart during in-flight spawn", async () => {
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "devkit-pi-lsp-restart-race-"));
    const file = path.join(workspace, "main.ts");
    fs.writeFileSync(file, "export const x = 1;\n", "utf-8");
    fs.writeFileSync(path.join(workspace, "package.json"), "{}\n", "utf-8");

    const manager = new lspCore.LSPManager(workspace);
    const originalServers = [...lspCore.LSP_SERVERS];

    let resolveInit: (client: any) => void = () => {
      throw new Error("init resolver was not captured");
    };
    const { client: fakeClient, calls } = createFakeLspClient();

    try {
      lspCore.LSP_SERVERS.splice(0, lspCore.LSP_SERVERS.length, {
        id: "typescript",
        extensions: [".ts"],
        findRoot: () => workspace,
        spawn: async () => undefined,
      });

      (manager as any).initClient = async () => {
        return await new Promise<any>((resolve) => {
          resolveInit = resolve;
        });
      };

      const pending = manager.getClientsForFile(file);
      await new Promise((resolve) => setTimeout(resolve, 0));

      await manager.restartServers(["typescript"]);
      resolveInit(fakeClient);
      await pending;

      assert.equal((manager as any).clients.size, 0);
      assert.equal(calls.shutdownRequests, 1);
      assert.equal(calls.exitNotifications, 1);
      assert.equal(calls.connectionEnds, 1);
      assert.equal(calls.processKills, 1);
    } finally {
      lspCore.LSP_SERVERS.splice(0, lspCore.LSP_SERVERS.length, ...originalServers);
      await manager.shutdown();
    }
  });

  it("keeps broken state after failed in-flight spawn and retries only after restart", async () => {
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "devkit-pi-lsp-broken-retry-"));
    const file = path.join(workspace, "main.ts");
    fs.writeFileSync(file, "export const x = 1;\n", "utf-8");
    fs.writeFileSync(path.join(workspace, "package.json"), "{}\n", "utf-8");

    const manager = new lspCore.LSPManager(workspace);
    const originalServers = [...lspCore.LSP_SERVERS];

    let spawnCalls = 0;

    try {
      lspCore.LSP_SERVERS.splice(0, lspCore.LSP_SERVERS.length, {
        id: "typescript",
        extensions: [".ts"],
        findRoot: () => workspace,
        spawn: async () => {
          spawnCalls += 1;
          await new Promise((resolve) => setTimeout(resolve, 20));
          return undefined;
        },
      });

      const [clientsA, clientsB] = await Promise.all([
        manager.getClientsForFile(file),
        manager.getClientsForFile(file),
      ]);

      assert.equal(spawnCalls, 1);
      assert.deepEqual(clientsA, []);
      assert.deepEqual(clientsB, []);

      const clientsAfterBroken = await manager.getClientsForFile(file);
      assert.deepEqual(clientsAfterBroken, []);
      assert.equal(spawnCalls, 1);

      await manager.restartServers(["typescript"]);
      const clientsAfterRestart = await manager.getClientsForFile(file);
      assert.deepEqual(clientsAfterRestart, []);
      assert.equal(spawnCalls, 2);
    } finally {
      lspCore.LSP_SERVERS.splice(0, lspCore.LSP_SERVERS.length, ...originalServers);
      await manager.shutdown();
    }
  });

  it("blocks privileged actions by default", async () => {
    const pi = createPiMock();
    registerLspModule(pi as any, mergeConfig({}).lsp);

    await assert.rejects(
      () =>
        pi.tools[0].execute(
          "call-1",
          { action: "restart", server: "all" },
          undefined,
          undefined,
          { cwd: process.cwd() }
        ),
      /allowMutatingActions is false/
    );
  });

  it("rejects file paths outside the active workspace", async () => {
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "devkit-pi-lsp-workspace-"));
    const outside = path.join(os.tmpdir(), `devkit-pi-lsp-outside-${process.pid}.ts`);
    fs.writeFileSync(outside, "export const outside = true;\n");

    const pi = createPiMock();
    registerLspModule(pi as any, mergeConfig({}).lsp);

    await assert.rejects(
      () =>
        pi.tools[0].execute(
          "call-1",
          { action: "diagnostics", file: outside },
          undefined,
          undefined,
          { cwd: workspace }
        ),
      /outside workspace is not allowed/
    );
  });

  it("limits source file reads by byte size", () => {
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "devkit-pi-lsp-limit-"));
    const small = path.join(workspace, "small.ts");
    const large = path.join(workspace, "large.ts");
    fs.writeFileSync(small, "export const ok = true;\n");
    fs.writeFileSync(large, "x".repeat(33));

    assert.equal(readTextFileLimited(small, 32), "export const ok = true;\n");
    assert.throws(
      () => readTextFileLimited(large, 32),
      (error: unknown) => {
        assert.ok(error instanceof LspFileTooLargeError);
        assert.equal(error.maxBytes, 32);
        assert.equal(error.sizeBytes, 33);
        assert.equal(error.filePath, large);
        assert.match(error.message, /LSP source file is too large/);
        return true;
      }
    );
    assert.equal(DEFAULT_LSP_MAX_SOURCE_FILE_BYTES, 2 * 1024 * 1024);
  });

  it("does not treat empty files as read failures in workspace diagnostics", async () => {
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "devkit-pi-lsp-empty-file-"));
    const file = path.join(workspace, "empty.ts");
    fs.writeFileSync(file, "", "utf-8");
    fs.writeFileSync(path.join(workspace, "package.json"), "{}\n", "utf-8");

    const manager = new lspCore.LSPManager(workspace);
    const originalServers = [...lspCore.LSP_SERVERS];

    try {
      lspCore.LSP_SERVERS.splice(0, lspCore.LSP_SERVERS.length, {
        id: "typescript",
        extensions: [".ts"],
        findRoot: () => workspace,
        spawn: async () => undefined,
      });

      const result = await manager.getDiagnosticsForFiles([file], 1);

      assert.equal(result.items.length, 1);
      assert.equal(result.items[0].file, file);
      assert.equal(result.items[0].status, "unsupported");
      assert.notEqual(result.items[0].error, "Could not read file");
    } finally {
      lspCore.LSP_SERVERS.splice(0, lspCore.LSP_SERVERS.length, ...originalServers);
      await manager.shutdown();
    }
  });

  it("caps workspace-diagnostics file input", async () => {
    const pi = createPiMock();
    registerLspModule(pi as any, mergeConfig({}).lsp);

    await assert.rejects(
      () =>
        pi.tools[0].execute(
          "call-1",
          { action: "workspace-diagnostics", files: Array.from({ length: 65 }, (_, i) => `f${i}.ts`) },
          undefined,
          undefined,
          { cwd: process.cwd() }
        ),
      /at most 64 files/
    );
  });

  it("allows whitelisted readonly LSP actions in subagent processes", async () => {
    process.env[PI_SUBAGENT_CHILD] = "1";
    process.env[PI_SUBAGENT_ALLOW_LSP] = "1";
    process.env[PI_SUBAGENT_LSP_ACTIONS] = "servers,symbols,diagnostics";
    const pi = createPiMock();
    registerLspModule(pi as any, mergeConfig({}).lsp);

    const result = await pi.tools[0].execute(
      "call-1",
      { action: "servers" },
      undefined,
      undefined,
      { cwd: process.cwd() }
    );

    assert.match(result.content[0].text, /action: servers/);
  });

  it("blocks non-whitelisted LSP actions in subagent processes", async () => {
    process.env[PI_SUBAGENT_CHILD] = "1";
    process.env[PI_SUBAGENT_ALLOW_LSP] = "1";
    process.env[PI_SUBAGENT_LSP_ACTIONS] = "servers,symbols,diagnostics";
    const pi = createPiMock();
    registerLspModule(pi as any, mergeConfig({}).lsp);

    await assert.rejects(
      () =>
        pi.tools[0].execute(
          "call-1",
          { action: "references", file: "src/index.ts", line: 1, column: 1 },
          undefined,
          undefined,
          { cwd: process.cwd() }
        ),
      /not allowed for this subagent process/
    );
  });

  it("blocks privileged actions in subagent processes even when explicitly allowed", async () => {
    process.env[PI_SUBAGENT_CHILD] = "1";
    process.env[PI_SUBAGENT_ALLOW_LSP] = "1";
    process.env[PI_SUBAGENT_LSP_ACTIONS] = "restart";
    const pi = createPiMock();
    registerLspModule(
      pi as any,
      mergeConfig({ lsp: { tool: { allowMutatingActions: true } } }).lsp
    );

    await assert.rejects(
      () =>
        pi.tools[0].execute(
          "call-1",
          { action: "restart", server: "all" },
          undefined,
          undefined,
          { cwd: process.cwd() }
        ),
      /disabled in subagent processes/
    );
  });

  it("keeps lsp core facade export contract stable", () => {
    assert.equal(typeof lspCore.LSPManager, "function");
    assert.equal(typeof lspCore.getOrCreateManager, "function");
    assert.equal(typeof lspCore.shutdownManager, "function");

    assert.equal(typeof lspCore.LSP_SERVERS, "object");
    assert.equal(typeof lspCore.LANGUAGE_IDS, "object");

    assert.equal(typeof lspCore.diagnosticsWaitMsForFile, "function");
    assert.equal(typeof lspCore.filterDiagnosticsBySeverity, "function");
    assert.equal(typeof lspCore.formatDiagnostic, "function");
    assert.equal(typeof lspCore.collectSymbols, "function");

    assert.equal(typeof lspCore.findSymbolPosition, "function");
    assert.equal(typeof lspCore.resolvePosition, "function");
    assert.equal(typeof lspCore.uriToPath, "function");
    assert.equal(typeof lspCore.getCppCompilationDbHint, "function");

    assert.equal(typeof lspCore.DEFAULT_LSP_MAX_SOURCE_FILE_BYTES, "number");
    assert.equal(typeof lspCore.LspFileTooLargeError, "function");
    assert.equal(typeof lspCore.readTextFileLimited, "function");
  });

  it("exposes expected readonly and privileged action names", () => {
    assert.deepEqual([...LSP_ACTIONS].sort(), [
      "codeAction",
      "definition",
      "diagnostics",
      "hover",
      "references",
      "rename",
      "restart",
      "servers",
      "signature",
      "symbols",
      "workspace-diagnostics",
    ]);
  });
});
