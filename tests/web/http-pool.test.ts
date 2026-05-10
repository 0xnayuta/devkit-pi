/**
 * HTTP Connection Pool Tests
 * Phase 2 — HttpConnectionPool class and global pool helpers
 */

import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import {
  DEFAULT_POOL_CONFIG,
  HttpConnectionPool,
  getConnectionPool,
  initializeConnectionPool,
  pooledFetch,
  resetConnectionPool,
} from "../../src/modules/web/http-pool.ts";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

describe("http-pool - DEFAULT_POOL_CONFIG", () => {
  it("has expected default values", () => {
    assert.equal(DEFAULT_POOL_CONFIG.maxSockets, 10);
    assert.equal(DEFAULT_POOL_CONFIG.maxFreeSockets, 5);
    assert.equal(DEFAULT_POOL_CONFIG.timeout, 60000);
    assert.equal(DEFAULT_POOL_CONFIG.scheduling, "fifo");
  });
});

// ---------------------------------------------------------------------------
// HttpConnectionPool — constructor & getConfig
// ---------------------------------------------------------------------------

describe("http-pool - constructor and getConfig", () => {
  it("uses defaults when no config provided", () => {
    const pool = new HttpConnectionPool();
    const config = pool.getConfig();
    assert.equal(config.maxSockets, 10);
    assert.equal(config.maxFreeSockets, 5);
    assert.equal(config.timeout, 60000);
    assert.equal(config.scheduling, "fifo");
    pool.destroy();
  });

  it("accepts partial config overrides", () => {
    const pool = new HttpConnectionPool({ maxSockets: 25, timeout: 5000 });
    const config = pool.getConfig();
    assert.equal(config.maxSockets, 25);
    assert.equal(config.timeout, 5000);
    assert.equal(config.maxFreeSockets, 5); // default
    assert.equal(config.scheduling, "fifo"); // default
    pool.destroy();
  });

  it("accepts full config", () => {
    const pool = new HttpConnectionPool({
      maxSockets: 3,
      maxFreeSockets: 1,
      timeout: 1000,
      scheduling: "lifo",
    });
    const config = pool.getConfig();
    assert.equal(config.maxSockets, 3);
    assert.equal(config.maxFreeSockets, 1);
    assert.equal(config.timeout, 1000);
    assert.equal(config.scheduling, "lifo");
    pool.destroy();
  });
});

// ---------------------------------------------------------------------------
// HttpConnectionPool — getStats
// ---------------------------------------------------------------------------

describe("http-pool - getStats", () => {
  it("starts with zero counters", () => {
    const pool = new HttpConnectionPool();
    const stats = pool.getStats();
    assert.equal(stats.totalRequests, 0);
    assert.equal(stats.failedRequests, 0);
    assert.equal(stats.failureRate, 0);
    pool.destroy();
  });
});

// ---------------------------------------------------------------------------
// HttpConnectionPool — resetStats
// ---------------------------------------------------------------------------

describe("http-pool - resetStats", () => {
  it("resets counters to zero", () => {
    const pool = new HttpConnectionPool();
    // Simulate internal state by making a failed request
    const originalFetch = globalThis.fetch;
    globalThis.fetch = () => Promise.reject(new Error("test"));
    pool.fetch("http://localhost:1").catch(() => {});
    // Give the request time to fail
    setTimeout(() => {
      pool.resetStats();
      const stats = pool.getStats();
      assert.equal(stats.totalRequests, 0);
      assert.equal(stats.failedRequests, 0);
      globalThis.fetch = originalFetch;
      pool.destroy();
    }, 50);
  });
});

// ---------------------------------------------------------------------------
// HttpConnectionPool — updateConfig
// ---------------------------------------------------------------------------

describe("http-pool - updateConfig", () => {
  it("updates non-socket config without recreating agents", () => {
    const pool = new HttpConnectionPool();
    pool.updateConfig({ timeout: 999 });
    assert.equal(pool.getConfig().timeout, 999);
    assert.equal(pool.getConfig().maxSockets, 10); // unchanged
    pool.destroy();
  });

  it("updates socket limits (recreates agents internally)", () => {
    const pool = new HttpConnectionPool({ maxSockets: 10 });
    pool.updateConfig({ maxSockets: 20 });
    assert.equal(pool.getConfig().maxSockets, 20);
    pool.destroy();
  });
});

// ---------------------------------------------------------------------------
// HttpConnectionPool — destroy
// ---------------------------------------------------------------------------

describe("http-pool - destroy", () => {
  it("can be called without throwing", () => {
    const pool = new HttpConnectionPool();
    assert.doesNotThrow(() => pool.destroy());
  });

  it("can be called multiple times", () => {
    const pool = new HttpConnectionPool();
    pool.destroy();
    assert.doesNotThrow(() => pool.destroy());
  });
});

// ---------------------------------------------------------------------------
// Global pool — getConnectionPool singleton
// ---------------------------------------------------------------------------

describe("http-pool - global pool functions", () => {
  beforeEach(() => {
    resetConnectionPool();
  });

  afterEach(() => {
    resetConnectionPool();
  });

  it("getConnectionPool returns an HttpConnectionPool instance", () => {
    const pool = getConnectionPool();
    assert.ok(pool instanceof HttpConnectionPool);
  });

  it("getConnectionPool returns the same instance on repeated calls", () => {
    const a = getConnectionPool();
    const b = getConnectionPool();
    assert.equal(a, b);
  });

  it("initializeConnectionPool creates the global pool", () => {
    initializeConnectionPool({ maxSockets: 5 });
    const pool = getConnectionPool();
    assert.equal(pool.getConfig().maxSockets, 5);
  });

  it("initializeConnectionPool updates existing pool config", () => {
    initializeConnectionPool({ maxSockets: 5 });
    initializeConnectionPool({ maxSockets: 15 });
    const pool = getConnectionPool();
    assert.equal(pool.getConfig().maxSockets, 15);
  });

  it("resetConnectionPool destroys and clears the global pool", () => {
    initializeConnectionPool();
    resetConnectionPool();
    // Next getConnectionPool should create a fresh instance
    const pool = getConnectionPool();
    assert.equal(pool.getStats().totalRequests, 0);
  });
});

// ---------------------------------------------------------------------------
// pooledFetch
// ---------------------------------------------------------------------------

describe("http-pool - pooledFetch", () => {
  beforeEach(() => {
    resetConnectionPool();
  });

  afterEach(() => {
    resetConnectionPool();
  });

  it("is a function", () => {
    assert.equal(typeof pooledFetch, "function");
  });

  it("delegates to the global pool's fetch method", async () => {
    const originalFetch = globalThis.fetch;
    const calls: string[] = [];
    globalThis.fetch = ((url: string, _opts?: any) => {
      calls.push(url);
      return Promise.resolve(new Response("ok", { status: 200 }));
    }) as typeof fetch;

    try {
      const response = await pooledFetch("http://example.com/test");
      assert.equal(response.status, 200);
      assert.equal(calls.length, 1);
      assert.equal(calls[0], "http://example.com/test");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("increments totalRequests counter on the global pool", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (() =>
      Promise.resolve(new Response("ok", { status: 200 }))) as typeof fetch;

    try {
      await pooledFetch("http://example.com/");
      const stats = getConnectionPool().getStats();
      assert.equal(stats.totalRequests, 1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("increments failedRequests counter when fetch rejects", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (() => Promise.reject(new Error("network fail"))) as typeof fetch;

    try {
      await assert.rejects(() => pooledFetch("http://example.com/"), /network fail/);
      const stats = getConnectionPool().getStats();
      assert.equal(stats.failedRequests, 1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
