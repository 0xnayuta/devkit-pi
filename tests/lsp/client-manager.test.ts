import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import { describe, it } from "node:test";
import { initClientWithSpawn } from "../../src/modules/lsp/client-manager.ts";

function fakeProcess() {
  const stdin = new PassThrough();
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  let killed = false;

  const proc = {
    stdin,
    stdout,
    stderr,
    kill: () => {
      killed = true;
      return true;
    },
    on: () => proc,
  } as any;

  return {
    process: proc,
    get killed() {
      return killed;
    },
  };
}

describe("lsp client manager", () => {
  it("cleans up spawned process when initialize fails", async () => {
    const fake = fakeProcess();
    let initFailed = 0;

    const client = await initClientWithSpawn({
      root: "/tmp/devkit-pi-lsp-client-manager-test",
      serverId: "test-lsp",
      initTimeoutMs: 1,
      spawn: async () => ({ process: fake.process }),
      initializeClient: async () => {
        throw new Error("initialize failed");
      },
      normalizeFsPath: (filePath) => filePath,
      onClientClosed: () => {},
      onClientProcessError: () => {},
      onInitFailed: () => {
        initFailed += 1;
      },
    });

    assert.equal(client, undefined);
    assert.equal(initFailed, 1);
    assert.equal(fake.killed, true);
    assert.equal(fake.process.stdout.destroyed, true);
    assert.equal(fake.process.stderr.destroyed, true);
  });
});
