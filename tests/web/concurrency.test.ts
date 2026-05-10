/**
 * Concurrency Module Tests
 * Phase 4: Performance Optimization - Throttler tests
 */

import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  RequestThrottler,
  QueueFullError,
  initializeRequestThrottler,
  getRequestThrottler,
  resetRequestThrottler,
} from "../../src/modules/web/concurrency.ts";

describe("concurrency - RequestThrottler", () => {
  let throttler: RequestThrottler;

  afterEach(() => {
    throttler?.reset();
    resetRequestThrottler();
  });

  it("has correct default config and updates config", () => {
    throttler = new RequestThrottler();
    const config = throttler.getConfig();
    assert.equal(config.maxConcurrent, 3);
    assert.equal(config.maxQueueSize, 10);

    throttler.updateConfig({ maxConcurrent: 5, maxQueueSize: 20 });
    const updated = throttler.getConfig();
    assert.equal(updated.maxConcurrent, 5);
    assert.equal(updated.maxQueueSize, 20);
  });

  it("executes immediately when below limit", async () => {
    throttler = new RequestThrottler({ maxConcurrent: 3, maxQueueSize: 10 });
    let executed = false;
    await throttler.execute(async () => {
      executed = true;
    });
    assert.equal(executed, true);
  });

  it("executes multiple in parallel up to limit", async () => {
    throttler = new RequestThrottler({ maxConcurrent: 3, maxQueueSize: 10 });
    const results = await Promise.all([
      throttler.execute(async () => "a"),
      throttler.execute(async () => "b"),
      throttler.execute(async () => "c"),
    ]);
    assert.deepEqual(results, ["a", "b", "c"]);
  });

  it("tracks active count and total processed", async () => {
    throttler = new RequestThrottler({ maxConcurrent: 1, maxQueueSize: 5 });

    let resolver: () => void;
    const promise = new Promise<void>((r) => {
      resolver = r;
    });

    const p1 = throttler.execute(async () => {
      await promise;
    });
    assert.equal(throttler.getStats().active, 1);

    resolver!();
    await p1;
    assert.equal(throttler.getStats().active, 0);

    await throttler.execute(async () => {});
    await throttler.execute(async () => {});
    assert.equal(throttler.getStats().totalProcessed, 3);
  });

  it("rejects when queue is full", async () => {
    throttler = new RequestThrottler({ maxConcurrent: 1, maxQueueSize: 2 });

    let resolveActive: () => void;
    throttler.execute(async () => {
      await new Promise<void>((r) => {
        resolveActive = r;
      });
    });

    throttler.execute(async () => {});
    throttler.execute(async () => {});

    await assert.rejects(
      throttler.execute(async () => {}),
      (err: Error) => err instanceof QueueFullError
    );

    resolveActive!();
    await throttler.waitForIdle();
  });

  it("waits for idle and resets stats", async () => {
    throttler = new RequestThrottler({ maxConcurrent: 1, maxQueueSize: 5 });

    let resolver: () => void;
    throttler.execute(async () => {
      await new Promise<void>((r) => {
        resolver = r;
      });
    });
    assert.equal(throttler.getStats().active, 1);

    resolver!();
    await throttler.waitForIdle();
    assert.equal(throttler.getStats().active, 0);

    throttler.reset();
    assert.equal(throttler.getStats().totalProcessed, 0);
  });

  it("global instance is shared and configurable", () => {
    const t1 = getRequestThrottler();
    const t2 = getRequestThrottler();
    assert.equal(t1, t2);

    initializeRequestThrottler({ maxConcurrent: 5 });
    assert.equal(getRequestThrottler().getConfig().maxConcurrent, 5);
  });
});
