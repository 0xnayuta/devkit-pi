import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, it } from "node:test";
import { createDevkitRuntime, ResourceScope } from "../../src/extension/runtime.ts";
import { getConnectionPool } from "../../src/modules/web/register.ts";

describe("runtime resource scope", () => {
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

describe("createDevkitRuntime dispose", () => {
  const originalHome = process.env.HOME;

  afterEach(() => {
    if (originalHome === undefined) {
      delete process.env.HOME;
      return;
    }
    process.env.HOME = originalHome;
  });

  it("releases registered runtime resources and is safe to call multiple times", async () => {
    const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), "devkit-pi-runtime-home-"));
    process.env.HOME = homeDir;

    const pi = {
      registerTool() {},
      registerCommand() {},
      on() {},
      appendEntry() {},
      registerMessageRenderer() {},
      sendMessage() {},
    };

    const runtime = createDevkitRuntime(pi as any, {
      logger: {
        debug() {},
        info() {},
        warn() {},
        error() {},
        child() {
          return this;
        },
      },
    });

    await runtime.activate();

    const poolBeforeDispose = getConnectionPool();
    await runtime.dispose();
    const poolAfterDispose = getConnectionPool();

    assert.notEqual(poolAfterDispose, poolBeforeDispose);
    await assert.doesNotReject(async () => runtime.dispose());
  });
});
