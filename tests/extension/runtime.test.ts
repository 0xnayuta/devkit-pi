import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, it } from "node:test";
import { activateDevkitExtension } from "../../src/extension/activate.ts";
import { ResourceScope } from "../../src/extension/runtime.ts";

describe("ResourceScope", () => {
  it("disposes resources in reverse registration order", async () => {
    const calls: string[] = [];
    const scope = new ResourceScope();

    scope.add({
      dispose() {
        calls.push("first");
      },
    });
    scope.add({
      dispose() {
        calls.push("second");
      },
    });

    await scope.disposeAll();
    assert.deepEqual(calls, ["second", "first"]);
  });
});

describe("activateDevkitExtension", () => {
  const originalHome = process.env.HOME;

  afterEach(() => {
    if (originalHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = originalHome;
    }
  });

  it("registers session_shutdown handler even when extension is disabled", async () => {
    const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), "devkit-pi-test-home-"));
    const configPath = path.join(
      homeDir,
      ".pi",
      "agent",
      "extensions",
      "devkit-pi",
      "config.json"
    );
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify({ enabled: false }), "utf-8");
    process.env.HOME = homeDir;

    const handlers: Record<string, Function[]> = {};
    const tools: string[] = [];
    const commands: string[] = [];

    const pi = {
      registerTool(tool: { name: string }) {
        tools.push(tool.name);
      },
      registerCommand(name: string) {
        commands.push(name);
      },
      on(event: string, handler: Function) {
        handlers[event] = handlers[event] ?? [];
        handlers[event].push(handler);
      },
      appendEntry() {},
      registerMessageRenderer() {},
      sendMessage() {},
    };

    await activateDevkitExtension(pi as any);

    assert.equal(tools.length, 0);
    assert.equal(commands.length, 0);
    assert.ok(Array.isArray(handlers.session_shutdown));
    assert.ok(handlers.session_shutdown.length > 0);
  });
});
