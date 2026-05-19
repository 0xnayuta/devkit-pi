import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import { describe, it } from "node:test";
import { initClientWithSpawn, stopLspClient } from "../../src/modules/lsp/client-manager.ts";

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
  it("stopLspClient skips shutdown/exit when client is already closed but still ends and kills", async () => {
    const calls = {
      shutdown: 0,
      exit: 0,
      end: 0,
      kill: 0,
    };

    const client = {
      closed: true,
      connection: {
        sendRequest: async () => {
          calls.shutdown += 1;
          return null;
        },
        sendNotification: async () => {
          calls.exit += 1;
          return undefined;
        },
        end: () => {
          calls.end += 1;
        },
      },
      process: {
        kill: () => {
          calls.kill += 1;
          return true;
        },
      },
    } as any;

    await stopLspClient(client);

    assert.equal(calls.shutdown, 0);
    assert.equal(calls.exit, 0);
    assert.equal(calls.end, 1);
    assert.equal(calls.kill, 1);
  });

  it("stopLspClient continues cleanup when shutdown request fails", async () => {
    const calls = {
      shutdown: 0,
      exit: 0,
      end: 0,
      kill: 0,
    };

    const client = {
      closed: false,
      connection: {
        sendRequest: async () => {
          calls.shutdown += 1;
          throw new Error("shutdown failed");
        },
        sendNotification: async () => {
          calls.exit += 1;
          throw new Error("exit failed");
        },
        end: () => {
          calls.end += 1;
          throw new Error("end failed");
        },
      },
      process: {
        kill: () => {
          calls.kill += 1;
          throw new Error("kill failed");
        },
      },
    } as any;

    await stopLspClient(client);

    assert.equal(client.closed, true);
    assert.equal(calls.shutdown, 1);
    assert.equal(calls.exit, 1);
    assert.equal(calls.end, 1);
    assert.equal(calls.kill, 1);
  });

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

  it("LSP-TIME-001 init timeout triggers cleanup and init failure callback", async () => {
    const fake = fakeProcess();
    let initFailed = 0;

    const startedAt = Date.now();
    const client = await initClientWithSpawn({
      root: "/tmp/devkit-pi-lsp-client-manager-timeout-test",
      serverId: "test-timeout-lsp",
      initTimeoutMs: 20,
      spawn: async () => ({ process: fake.process }),
      normalizeFsPath: (filePath) => filePath,
      onClientClosed: () => {},
      onClientProcessError: () => {},
      onInitFailed: () => {
        initFailed += 1;
      },
    });
    const elapsedMs = Date.now() - startedAt;

    assert.equal(client, undefined);
    assert.equal(initFailed, 1);
    assert.equal(fake.killed, true);
    assert.equal(fake.process.stdout.destroyed, true);
    assert.equal(fake.process.stderr.destroyed, true);
    assert.equal(elapsedMs >= 10, true);
  });
});
