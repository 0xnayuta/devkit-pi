import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyRestartStateForClient,
  beginSpawnGeneration,
  clearBrokenForMatches,
  clearSpawningForMatches,
  extractServerIdFromKey,
  invalidateAndClearAllSpawning,
  invalidateSpawnGeneration,
  isSpawnGenerationCurrent,
  selectRestartTargets,
  takeAllClients,
  type LSPClient,
} from "../../src/modules/lsp/client-lifecycle.ts";

function fakeClient(id: string): LSPClient {
  const noop = () => {};
  return {
    connection: {
      sendRequest: async () => undefined,
      sendNotification: async () => undefined,
      end: noop,
      onNotification: noop,
      onError: noop,
      onClose: noop,
      onRequest: noop,
      listen: noop,
    } as any,
    process: { kill: noop } as any,
    diagnostics: new Map(),
    openFiles: new Map(),
    listeners: new Map(),
    stderr: [],
    root: `/tmp/${id}`,
    closed: false,
  };
}

describe("lsp client lifecycle helpers", () => {
  it("manages spawn generation lifecycle", () => {
    const generations = new Map<string, number>();

    const g1 = beginSpawnGeneration(generations, "typescript:/repo");
    assert.equal(g1, 1);
    assert.equal(isSpawnGenerationCurrent(generations, "typescript:/repo", 1), true);

    invalidateSpawnGeneration(generations, "typescript:/repo");
    assert.equal(isSpawnGenerationCurrent(generations, "typescript:/repo", 1), false);
    assert.equal(isSpawnGenerationCurrent(generations, "typescript:/repo", 2), true);
  });

  it("extracts server id from manager key", () => {
    assert.equal(extractServerIdFromKey("typescript:/repo"), "typescript");
    assert.equal(extractServerIdFromKey("clangd:/repo/build"), "clangd");
    assert.equal(extractServerIdFromKey("no-colon"), "no-colon");
  });

  it("selects restart targets and applies per-client restart state", () => {
    const clients = new Map<string, LSPClient>([
      ["typescript:/repo", fakeClient("ts")],
      ["clangd:/repo", fakeClient("clang")],
    ]);
    const spawning = new Map<string, Promise<LSPClient | undefined>>([
      ["typescript:/repo", Promise.resolve(undefined)],
      ["clangd:/repo", Promise.resolve(undefined)],
    ]);
    const broken = new Set<string>(["typescript:/repo", "clangd:/repo"]);
    const generations = new Map<string, number>([
      ["typescript:/repo", 5],
      ["clangd:/repo", 2],
    ]);

    const matchesTs = (key: string) => extractServerIdFromKey(key) === "typescript";
    const targets = selectRestartTargets(clients, matchesTs);

    assert.equal(targets.length, 1);
    assert.equal(targets[0][0], "typescript:/repo");

    applyRestartStateForClient(clients, broken, spawning, generations, "typescript:/repo");

    assert.equal(clients.has("typescript:/repo"), false);
    assert.equal(spawning.has("typescript:/repo"), false);
    assert.equal(broken.has("typescript:/repo"), false);
    assert.equal(generations.get("typescript:/repo"), 6);

    assert.equal(clients.has("clangd:/repo"), true);
    assert.equal(spawning.has("clangd:/repo"), true);
    assert.equal(broken.has("clangd:/repo"), true);
  });

  it("clears broken/spawning states for matches only", () => {
    const broken = new Set<string>(["typescript:/repo", "clangd:/repo"]);
    const spawning = new Map<string, Promise<LSPClient | undefined>>([
      ["typescript:/repo", Promise.resolve(undefined)],
      ["clangd:/repo", Promise.resolve(undefined)],
    ]);
    const generations = new Map<string, number>([
      ["typescript:/repo", 10],
      ["clangd:/repo", 3],
    ]);

    const matchesTs = (key: string) => extractServerIdFromKey(key) === "typescript";

    clearBrokenForMatches(broken, matchesTs);
    clearSpawningForMatches(spawning, generations, matchesTs);

    assert.equal(broken.has("typescript:/repo"), false);
    assert.equal(broken.has("clangd:/repo"), true);

    assert.equal(spawning.has("typescript:/repo"), false);
    assert.equal(spawning.has("clangd:/repo"), true);
    assert.equal(generations.get("typescript:/repo"), 11);
    assert.equal(generations.get("clangd:/repo"), 3);
  });

  it("takes all clients and invalidates+clears all spawning", () => {
    const clients = new Map<string, LSPClient>([
      ["typescript:/repo", fakeClient("ts")],
      ["clangd:/repo", fakeClient("clang")],
    ]);
    const spawning = new Map<string, Promise<LSPClient | undefined>>([
      ["typescript:/repo", Promise.resolve(undefined)],
      ["clangd:/repo", Promise.resolve(undefined)],
    ]);
    const generations = new Map<string, number>([
      ["typescript:/repo", 1],
      ["clangd:/repo", 7],
    ]);

    const allClients = takeAllClients(clients);
    assert.equal(allClients.length, 2);
    assert.equal(clients.size, 0);

    invalidateAndClearAllSpawning(spawning, generations);
    assert.equal(spawning.size, 0);
    assert.equal(generations.get("typescript:/repo"), 2);
    assert.equal(generations.get("clangd:/repo"), 8);
  });
});
