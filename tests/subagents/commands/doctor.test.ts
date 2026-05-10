/**
 * Doctor Command Tests
 * Phase 3: Test Framework - /subagents doctor tests
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatDoctorReport,
  runDoctorChecks,
  type DoctorReport,
} from "../../../src/modules/subagents/commands/doctor.ts";

describe("commands/doctor - runDoctorChecks", () => {
  it("returns valid report structure", async () => {
    const report = await runDoctorChecks(process.cwd());

    assert.ok(Array.isArray(report.items));
    assert.ok(report.summary);
    assert.equal(typeof report.summary.passed, "number");
    assert.equal(typeof report.summary.warnings, "number");
    assert.equal(typeof report.summary.failed, "number");
  });

  it("includes all required check categories", async () => {
    const report = await runDoctorChecks(process.cwd());

    const categories = ["config", "agents", "permissions", "web-tools", "lsp"];
    for (const cat of categories) {
      assert.ok(report.items.find((i) => i.category === cat), `missing ${cat}`);
    }

    // provider category should exist
    assert.ok(report.items.filter((i) => i.category === "provider").length > 0);
  });

  it("has valid status values and messages for all items", async () => {
    const report = await runDoctorChecks(process.cwd());

    for (const item of report.items) {
      assert.ok(["pass", "warn", "fail", "info"].includes(item.status), `Invalid status: ${item.status}`);
      assert.ok(item.message && item.message.length > 0);
    }

    const expectedPassed = report.items.filter((i) => i.status === "pass").length;
    const expectedWarnings = report.items.filter((i) => i.status === "warn").length;
    const expectedFailed = report.items.filter((i) => i.status === "fail").length;
    assert.equal(report.summary.passed, expectedPassed);
    assert.equal(report.summary.warnings, expectedWarnings);
    assert.equal(report.summary.failed, expectedFailed);
  });

  it("includes ddgs in provider checks", async () => {
    const report = await runDoctorChecks(process.cwd());
    assert.ok(report.items.find((i) => i.message?.includes("DuckDuckGo")));
  });
});

describe("commands/doctor - formatDoctorReport", () => {
  it("should format report as text", async () => {
    const report = await runDoctorChecks(process.cwd());
    const output = formatDoctorReport(report);

    assert.ok(typeof output === "string");
    assert.ok(output.length > 0);
  });

  it("should include report title", async () => {
    const report = await runDoctorChecks(process.cwd());
    const output = formatDoctorReport(report);

    assert.ok(output.includes("Doctor"));
    assert.ok(output.includes("Diagnostic"));
  });

  it("should include summary", async () => {
    const report = await runDoctorChecks(process.cwd());
    const output = formatDoctorReport(report);

    assert.ok(output.includes("Summary"));
    assert.ok(output.includes(report.summary.passed.toString()));
  });

  it("should include status indicators", async () => {
    const report = await runDoctorChecks(process.cwd());
    const output = formatDoctorReport(report);

    assert.ok(output.includes("PASS") || output.includes("WARN") || output.includes("FAIL"));
  });

  it("should include categories", async () => {
    const report = await runDoctorChecks(process.cwd());
    const output = formatDoctorReport(report);

    assert.ok(output.includes("CONFIG") || output.includes("config"));
    assert.ok(output.includes("AGENTS") || output.includes("agents"));
  });

  it("should use box-drawing characters", async () => {
    const report = await runDoctorChecks(process.cwd());
    const output = formatDoctorReport(report);

    // Should have box-drawing characters for the table
    assert.ok(output.includes("═") || output.includes("─"));
  });

  it("should format empty report correctly", () => {
    const emptyReport: DoctorReport = {
      items: [],
      summary: { passed: 0, warnings: 0, failed: 0 },
    };
    const output = formatDoctorReport(emptyReport);

    assert.ok(output.includes("Summary"));
    assert.ok(output.includes("0"));
  });
});

describe("commands/doctor - diagnostic status", () => {
  it("ddgs is available, disabled providers show info", async () => {
    const report = await runDoctorChecks(process.cwd());

    const ddgsItem = report.items.find((i) => i.message?.includes("DuckDuckGo"));
    assert.ok(ddgsItem);
    assert.ok(["pass", "warn"].includes(ddgsItem.status));

    // disabled providers are info
    for (const provider of ["tavily", "serper", "brave", "openserp", "searxng"]) {
      const item = report.items.find((i) => i.message?.toLowerCase().includes(provider.toLowerCase()));
      if (item) {
        assert.ok(["pass", "warn", "info"].includes(item.status));
      }
    }
  });
});
