/**
 * List Command Tests
 * Phase 3: Test Framework - /subagents list tests
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatAgentList, formatAgentListJson, getAgentList } from "../../../src/modules/subagents/commands/list.ts";

describe("commands/list", () => {
  it("getAgentList returns correct structure", () => {
    const report = getAgentList(process.cwd());

    assert.ok(Array.isArray(report.builtin));
    assert.ok(Array.isArray(report.user));
    assert.ok(Array.isArray(report.project));
    assert.equal(typeof report.total, "number");
    assert.equal(report.total, report.builtin.length + report.user.length + report.project.length);
  });

  it("builtin agents have correct properties", () => {
    const report = getAgentList(process.cwd());
    assert.ok(report.builtin.length >= 5);

    const explorer = report.builtin.find((a) => a.name === "explorer");
    assert.ok(explorer);
    assert.equal(typeof explorer.name, "string");
    assert.equal(typeof explorer.description, "string");
    assert.equal(typeof explorer.readonly, "boolean");
    assert.equal(explorer.source, "builtin");
  });

  it("formatAgentList includes key sections", () => {
    const report = getAgentList(process.cwd());
    const output = formatAgentList(report);

    assert.ok(output.includes("Available Agents"));
    assert.ok(output.includes(report.total.toString()));
    assert.ok(output.includes("[builtin]"));
    assert.ok(output.includes("explorer"));
    assert.ok(output.includes("(readonly)"));
    assert.ok(output.includes("subagent({"));

    // lines are reasonably sized
    for (const line of output.split("\n")) {
      if (!line.includes("...")) {
        assert.ok(line.length <= 100, `Line too long: ${line}`);
      }
    }
  });

  it("formatAgentListJson returns valid JSON with same data", () => {
    const report = getAgentList(process.cwd());
    const output = formatAgentListJson(report);

    assert.doesNotThrow(() => JSON.parse(output));
    const parsed = JSON.parse(output);
    assert.ok(parsed.builtin);
    assert.ok(parsed.user);
    assert.ok(parsed.project);
    assert.equal(parsed.total, report.total);
    assert.equal(parsed.builtin.length, report.builtin.length);
    assert.equal(parsed.user.length, report.user.length);
    assert.equal(parsed.project.length, report.project.length);
  });
});
