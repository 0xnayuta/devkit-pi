/**
 * Logs Command Tests
 * Phase 3: Test Framework - /subagents logs tests
 */

import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import {
  clearActivityLog,
  recordFetchActivity,
  recordSearchActivity,
  resetWebToolStats,
} from "../../../src/modules/web/observability.ts";
import {
  formatLogs,
  formatLogsJson,
  getRecentLogs,
} from "../../../src/modules/subagents/commands/logs.ts";

describe("commands/logs", () => {
  beforeEach(() => {
    resetWebToolStats();
    clearActivityLog();
  });

  afterEach(() => {
    resetWebToolStats();
    clearActivityLog();
  });

  it("getRecentLogs returns entries and stats", () => {
    const startTs = Date.now() - 100;
    recordSearchActivity("ddgs", "success", startTs);
    recordFetchActivity("success");

    const result = getRecentLogs();
    assert.ok(Array.isArray(result.entries));
    assert.ok(result.stats);
    assert.equal(result.entries.length, 2);
    assert.ok(typeof result.stats.totalRequests === "number");
    assert.ok(typeof result.stats.successCount === "number");
    assert.ok(typeof result.stats.errorCount === "number");
    assert.ok(typeof result.stats.rateLimitedCount === "number");
    assert.ok(typeof result.stats.averageLatencyMs === "number");
  });

  it("respects limit and type filter options", () => {
    const startTs = Date.now() - 1000;
    for (let i = 0; i < 10; i++) {
      recordSearchActivity("ddgs", "success", startTs + i);
    }
    recordFetchActivity("success");

    const limited = getRecentLogs({ limit: 5 });
    assert.ok(limited.entries.length <= 5);

    const searchOnly = getRecentLogs({ type: "search" });
    assert.ok(searchOnly.entries.every((e) => e.type === "search"));

    const fetchOnly = getRecentLogs({ type: "fetch" });
    assert.ok(fetchOnly.entries.every((e) => e.type === "fetch"));
  });

  it("formatLogs shows stats and entries", () => {
    const startTs = Date.now() - 100;
    recordSearchActivity("ddgs", "success", startTs);
    recordSearchActivity("ddgs", "error", startTs + 1, "WEB_SEARCH_FAILED");
    recordSearchActivity("ddgs", "rate_limited", startTs + 2);

    const output = formatLogs();
    assert.ok(typeof output === "string");
    assert.ok(output.includes("Activity") || output.includes("Recent"));
    assert.ok(output.includes("Statistics") || output.includes("Total Requests"));
    assert.ok(output.includes("ddgs"));
    assert.ok(output.includes("ms"));
    // status indicators
    assert.ok(output.includes("✓") || output.includes("success"));
    assert.ok(output.includes("✗") || output.includes("error"));
    assert.ok(output.includes("⚠") || output.includes("rate_limited"));
  });

  it("formatLogsJson returns valid JSON with correct structure", () => {
    const startTs = Date.now() - 100;
    recordSearchActivity("ddgs", "success", startTs);

    const output = formatLogsJson();
    assert.doesNotThrow(() => JSON.parse(output));
    const parsed = JSON.parse(output);

    assert.ok(parsed.entries);
    assert.ok(parsed.stats);
    assert.ok(parsed.entries.length > 0);

    const entry = parsed.entries[0];
    assert.ok(typeof entry.timestamp === "number");
    assert.ok(["search", "fetch", "get_content"].includes(entry.type));
    assert.ok(["pending", "success", "error", "rate_limited"].includes(entry.status));
    assert.ok(entry.requestId);

    const stats = parsed.stats;
    assert.ok(typeof stats.totalRequests === "number");
    assert.ok(typeof stats.successCount === "number");
    assert.ok(typeof stats.errorCount === "number");
    assert.ok(typeof stats.rateLimitedCount === "number");
    assert.ok(typeof stats.averageLatencyMs === "number");
  });
});
