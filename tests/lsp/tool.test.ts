import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, it } from "node:test";
import { mergeConfig } from "../../src/config/load-config.ts";
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
