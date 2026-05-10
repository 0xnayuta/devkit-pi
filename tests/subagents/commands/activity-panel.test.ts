/**
 * Activity Panel Tests
 * Phase 6: UI Integration - Activity panel component tests
 */

import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import {
  ActivityPanel,
  createActivityPanel,
  type ActivityPanelOptions,
} from "../../../src/modules/subagents/commands/activity.ts";
import {
  clearActivityLog,
  recordSearchActivity,
  resetWebToolStats,
} from "../../../src/modules/web/observability.ts";

describe("activity panel - ActivityPanel", () => {
  let panel: ActivityPanel;

  beforeEach(() => {
    clearActivityLog();
    resetWebToolStats();
    panel = new ActivityPanel({ maxEntries: 10 });
  });

  afterEach(() => {
    panel.dispose();
  });

  it("creates with default and custom options", () => {
    const defaultPanel = new ActivityPanel();
    assert.ok(defaultPanel);
    defaultPanel.dispose();

    const customPanel = new ActivityPanel({
      maxEntries: 20,
      showStats: true,
      autoRefresh: false,
    });
    assert.ok(customPanel);
    customPanel.dispose();
  });

  it("renders header, stats bar, help bar, and empty state", () => {
    const lines = panel.render(80);
    assert.ok(lines.length > 0);
    assert.ok(lines[0]!.includes("Web Tool Activity"));
    assert.ok(lines.some((line) => line.includes("total:")));
    assert.ok(lines.some((line) => line.includes("success:")));
    assert.ok(lines.some((line) => line.includes("navigate")));
    assert.ok(lines.some((line) => line.includes("no recent activity")));
  });

  it("renders activity entries after activity is recorded", () => {
    recordSearchActivity({
      requestId: "test-1",
      type: "search",
      status: "success",
      duration: 100,
      provider: "ddgs",
    });
    panel.refresh();

    const lines = panel.render(80);
    assert.ok(lines.some((line) => line.includes("SEARCH")));
  });

  it("handles keyboard input", () => {
    // escape to close
    let closed = false;
    panel.setOnClose(() => {
      closed = true;
    });
    panel.handleInput("escape");
    assert.equal(closed, true);

    // c to clear
    recordSearchActivity({
      requestId: "test-c",
      type: "search",
      status: "success",
      duration: 50,
    });
    panel.handleInput("c");
    assert.ok(panel.render(80).some((line) => line.includes("no recent activity")));

    // s to reset stats
    recordSearchActivity({
      requestId: "test-s",
      type: "search",
      status: "success",
      duration: 50,
    });
    panel.handleInput("s");
    assert.ok(panel.render(80).some((line) => line.includes("total:0")));

    // arrow keys don't crash
    for (let i = 0; i < 5; i++) {
      recordSearchActivity({ requestId: `test-${i}`, type: "search", status: "success", duration: 50 });
    }
    panel.refresh();
    panel.handleInput("\x1b[A"); // up
    panel.handleInput("\x1b[B"); // down
    panel.handleInput("r"); // refresh
  });

  it("caches and invalidates rendered lines", () => {
    const lines1 = panel.render(80);
    const lines2 = panel.render(80);
    assert.deepEqual(lines1, lines2); // cached

    panel.invalidate();
    const lines3 = panel.render(80);
    assert.ok(lines3.length > 0); // recalculated
  });
});

describe("activity panel - createActivityPanel factory", () => {
  afterEach(() => {
    clearActivityLog();
    resetWebToolStats();
  });

  it("creates panel with default and custom options", () => {
    const panel1 = createActivityPanel();
    assert.ok(panel1);
    panel1.dispose();

    const panel2 = createActivityPanel({ maxEntries: 25, autoRefresh: true });
    assert.ok(panel2);
    panel2.dispose();
  });
});
