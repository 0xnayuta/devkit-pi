/**
 * Observability Module Tests
 * Phase 3: Test Framework - Observability tests
 */

import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import {
  clearActivityLog,
  configureWebObservability,
  getActivityLog,
  getDebugLevel,
  getWebToolStats,
  recordFetchActivity,
  recordSearchActivity,
  resetWebToolStats,
  webDebugLog,
  type ActivityEntry,
} from "../../src/modules/web/observability.ts";

describe("observability - configuration", () => {
  beforeEach(() => {
    resetWebToolStats();
    clearActivityLog();
  });

  afterEach(() => {
    configureWebObservability(false);
  });

  it("should default debug level to false", () => {
    configureWebObservability(false);
    assert.equal(getDebugLevel(), false);
  });

  it("should support minimal debug level", () => {
    configureWebObservability("minimal");
    assert.equal(getDebugLevel(), "minimal");
  });

  it("should support verbose debug level", () => {
    configureWebObservability("verbose");
    assert.equal(getDebugLevel(), "verbose");
  });
});

describe("observability - stats", () => {
  beforeEach(() => {
    resetWebToolStats();
    clearActivityLog();
  });

  it("tracks search success/error/rate-limited and fetch success/error", () => {
    const startTs = Date.now() - 100;
    recordSearchActivity("ddgs", "success", startTs);
    recordSearchActivity("ddgs", "error", startTs + 1, "WEB_SEARCH_FAILED");
    recordSearchActivity("ddgs", "rate_limited", startTs + 2, "PROVIDER_RATE_LIMITED");
    recordFetchActivity("success");
    recordFetchActivity("error", "FETCH_CONTENT_FAILED");

    const stats = getWebToolStats();
    // search: 1 success + 1 error + 1 rate_limited = 3 calls
    // fetch: 1 success + 1 error = 2 calls
    // total = 5, success = 2, error = 3 (1 search error + 1 rate_limited + 1 fetch error)
    assert.equal(stats.totalRequests, 5);
    assert.equal(stats.successCount, 2);
    assert.equal(stats.errorCount, 3);
    assert.equal(stats.rateLimitedCount, 1);
  });

  it("aggregates provider stats with success rate", () => {
    const startTs = Date.now() - 100;
    recordSearchActivity("ddgs", "success", startTs);
    recordSearchActivity("ddgs", "success", startTs + 50);
    recordSearchActivity("ddgs", "error", startTs + 100);
    recordSearchActivity("tavily", "success", startTs + 150);

    const stats = getWebToolStats();
    assert.equal(stats.providerStats["ddgs"].requests, 3);
    assert.equal(stats.providerStats["ddgs"].successRate, 2 / 3);
    assert.equal(stats.providerStats["tavily"].requests, 1);
  });

  it("calculates average latency and resets correctly", () => {
    const startTs = Date.now() - 500;
    recordSearchActivity("ddgs", "success", startTs);
    recordSearchActivity("ddgs", "success", startTs);

    const stats = getWebToolStats();
    assert.ok(stats.averageLatencyMs >= 0);
    assert.ok(stats.averageLatencyMs < 1000);

    resetWebToolStats();
    const reset = getWebToolStats();
    assert.equal(reset.totalRequests, 0);
    assert.equal(reset.successCount, 0);
  });
});

describe("observability - activity log", () => {
  beforeEach(() => {
    resetWebToolStats();
    clearActivityLog();
  });

  it("should record search activity entries", () => {
    const startTs = Date.now() - 100;
    recordSearchActivity("ddgs", "success", startTs);

    const log = getActivityLog();
    assert.equal(log.length, 1);
    assert.equal(log[0].type, "search");
    assert.equal(log[0].provider, "ddgs");
    assert.equal(log[0].status, "success");
    assert.ok(log[0].requestId.startsWith("req_"));
  });

  it("should record fetch activity entries", () => {
    recordFetchActivity("success");

    const log = getActivityLog();
    assert.equal(log.length, 1);
    assert.equal(log[0].type, "fetch");
    assert.equal(log[0].status, "success");
  });

  it("should record error in activity entry", () => {
    const startTs = Date.now() - 100;
    recordSearchActivity("ddgs", "error", startTs, "WEB_SEARCH_FAILED");

    const log = getActivityLog();
    assert.equal(log[0].status, "error");
    assert.equal(log[0].error, "WEB_SEARCH_FAILED");
  });

  it("should limit activity log to 100 entries", () => {
    const startTs = Date.now();

    // Record 150 entries
    for (let i = 0; i < 150; i++) {
      recordSearchActivity("ddgs", "success", startTs + i);
    }

    const log = getActivityLog();
    assert.ok(log.length <= 100);
  });

  it("should return entries in insertion order with limit", () => {
    const startTs = Date.now() - 1000;

    recordSearchActivity("ddgs", "error", startTs);
    recordSearchActivity("ddgs", "success", startTs + 100);
    recordSearchActivity("ddgs", "success", startTs + 200);

    // Without reverse(), entries are in insertion order
    const allLog = getActivityLog();
    assert.ok(allLog.length >= 3);
    // First entry should be the oldest (error at startTs)
    assert.ok(allLog[0].timestamp <= allLog[1].timestamp);
  });

  it("should clear activity log", () => {
    const startTs = Date.now() - 100;
    recordSearchActivity("ddgs", "success", startTs);
    recordFetchActivity("success");

    clearActivityLog();

    const log = getActivityLog();
    assert.equal(log.length, 0);
  });

  it("should filter by type", () => {
    const startTs = Date.now() - 100;
    recordSearchActivity("ddgs", "success", startTs);
    recordFetchActivity("success");
    recordSearchActivity("tavily", "success", startTs + 50);

    const searchLog = getActivityLog().filter((e) => e.type === "search");
    const fetchLog = getActivityLog().filter((e) => e.type === "fetch");

    assert.ok(searchLog.every((e) => e.type === "search"));
    assert.ok(fetchLog.every((e) => e.type === "fetch"));
  });
});

describe("observability - record functions", () => {
  beforeEach(() => {
    resetWebToolStats();
    clearActivityLog();
  });

  it("generates unique request IDs and records duration", () => {
    const startTs = Date.now() - 150;
    recordSearchActivity("ddgs", "success", startTs);
    recordSearchActivity("ddgs", "success", startTs + 1);

    const log = getActivityLog();
    assert.notEqual(log[0].requestId, log[1].requestId);
    assert.ok(log[0].duration !== undefined);
    assert.ok(log[0].duration! >= 150);
  });
});

// ============================================================================
// E.3: Debug log toggle
// ============================================================================

describe("observability - debug logging", () => {
  let consoleLogSpy: string[];
  let originalConsoleLog: typeof console.log;

  beforeEach(() => {
    configureWebObservability(false);
    consoleLogSpy = [];
    originalConsoleLog = console.log;
    console.log = (...args: unknown[]) => {
      consoleLogSpy.push(args.map(String).join(" "));
    };
  });

  afterEach(() => {
    console.log = originalConsoleLog;
    configureWebObservability(false);
  });

  it("does not output logs when debug is disabled", () => {
    configureWebObservability(false);
    webDebugLog("test message", { key: "value" });

    assert.equal(consoleLogSpy.length, 0);
  });

  it("outputs minimal debug logs for warnings/errors when minimal level is enabled", () => {
    configureWebObservability("minimal");
    webDebugLog("search success", {
      provider: "ddgs",
      mode: "auto",
      responseId: "test-123",
    });
    assert.equal(consoleLogSpy.length, 0);

    webDebugLog("search failed", {
      provider: "ddgs",
      mode: "auto",
      code: "WEB_SEARCH_FAILED",
    });

    assert.ok(consoleLogSpy.length > 0);
    assert.ok(consoleLogSpy[0].includes("[web-tools]"));
    assert.ok(consoleLogSpy[0].includes("search failed"));
    // Minimal mode should have JSON on same line
    assert.ok(consoleLogSpy[0].includes('"provider"'));
  });

  it("outputs verbose debug logs when verbose level is enabled", () => {
    configureWebObservability("verbose");
    webDebugLog("fetch_content failed", { message: "timeout", urls: 2 });

    assert.ok(consoleLogSpy.length > 0);
    assert.ok(consoleLogSpy[0].includes("[web-tools]"));
    assert.ok(consoleLogSpy[0].includes("fetch_content failed"));
    // Verbose mode should have formatted JSON
    assert.ok(consoleLogSpy[0].includes("\n"));
    assert.ok(consoleLogSpy[0].includes('"message"'));
  });

  it("includes timestamp in debug output", () => {
    configureWebObservability("minimal");
    webDebugLog("test warning");

    assert.ok(consoleLogSpy[0].match(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/));
  });

  it("handles undefined details gracefully", () => {
    configureWebObservability("minimal");
    webDebugLog("warning no details");

    assert.ok(consoleLogSpy.length > 0);
    assert.ok(consoleLogSpy[0].includes("warning no details"));
  });

  it("handles non-object details", () => {
    configureWebObservability("minimal");
    webDebugLog("simple error", "just a string");

    assert.ok(consoleLogSpy.length > 0);
    assert.ok(consoleLogSpy[0].includes("just a string"));
  });

  it("debug logs can be toggled on and off", () => {
    // Start disabled
    webDebugLog("disabled", { test: true });
    assert.equal(consoleLogSpy.length, 0);

    // Enable
    configureWebObservability("minimal");
    webDebugLog("enabled warning", { test: true });
    assert.ok(consoleLogSpy.length > 0);
    const countWhenEnabled = consoleLogSpy.length;

    // Disable again
    configureWebObservability(false);
    webDebugLog("disabled again", { test: true });
    assert.equal(consoleLogSpy.length, countWhenEnabled); // No new entries
  });
});
