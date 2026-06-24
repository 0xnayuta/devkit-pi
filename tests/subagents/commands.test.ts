import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { visibleWidth } from "@earendil-works/pi-tui";
import { mergeConfig } from "../../src/config/load-config.ts";
import { ActivityPanel, createActivityPanel } from "../../src/modules/subagents/commands/activity.ts";
import { type DoctorReport, formatDoctorReport, runDoctorChecks } from "../../src/modules/subagents/commands/doctor.ts";
import { formatAgentList, formatAgentListJson, getAgentList } from "../../src/modules/subagents/commands/list.ts";
import { formatLogs, formatLogsJson, getRecentLogs } from "../../src/modules/subagents/commands/logs.ts";
import { clearActivityLog, resetToolkitStats } from "../../src/modules/subagents/commands/toolkit-stats.ts";
import { recordFetchActivity, recordSearchActivity } from "../../src/modules/web/observability.ts";
import { SEARCH_PROVIDER_NAMES } from "../../src/modules/web/providers/metadata.ts";
import { addToolkitActivityEntry } from "../../src/shared/activity.ts";

function stripAnsi(value: string): string {
	// biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI escape stripping needs raw ESC char
	return value.replace(/\x1b\[[0-9;]*m/g, "");
}

describe("subagent commands - doctor", () => {
	it("returns a diagnostic report with required categories and valid summary", async () => {
		const report = await runDoctorChecks(process.cwd());

		assert.ok(Array.isArray(report.items));
		assert.ok(report.summary);
		for (const category of [
			"config",
			"agents",
			"subagents",
			"permissions",
			"web-tools",
			"lsp",
			"guards",
			"tool-metadata",
			"state-model",
		]) {
			assert.ok(
				report.items.find((item) => item.category === category),
				`missing ${category}`
			);
		}
		assert.ok(report.items.some((item) => item.category === "provider"));
		assert.ok(report.items.some((item) => item.message?.includes("DuckDuckGo")));
		assert.ok(report.items.some((item) => item.category === "guards"));
		assert.ok(report.items.some((item) => item.category === "tool-metadata" && item.status === "pass"));
		assert.ok(report.items.some((item) => item.category === "state-model" && item.status === "info"));

		for (const item of report.items) {
			assert.ok(["pass", "warn", "fail", "info"].includes(item.status), `Invalid status: ${item.status}`);
			assert.ok(item.message && item.message.length > 0);
		}
		assert.equal(report.summary.passed, report.items.filter((item) => item.status === "pass").length);
		assert.equal(report.summary.warnings, report.items.filter((item) => item.status === "warn").length);
		assert.equal(report.summary.failed, report.items.filter((item) => item.status === "fail").length);
	});

	it("formats doctor output with title, summary, status, and categories", async () => {
		const report = await runDoctorChecks(process.cwd());
		const output = formatDoctorReport(report);

		assert.ok(output.includes("Doctor"));
		assert.ok(output.includes("Diagnostic"));
		assert.ok(output.includes("Summary"));
		assert.ok(output.includes(report.summary.passed.toString()));
		assert.ok(output.includes("PASS") || output.includes("WARN") || output.includes("FAIL"));
		assert.ok(output.includes("CONFIG") || output.includes("config"));
		assert.ok(output.includes("AGENTS") || output.includes("agents"));
		assert.doesNotMatch(output, /[╔╗╚╝╠╣║═]/);
	});

	it("formats an empty doctor report", () => {
		const emptyReport: DoctorReport = { items: [], summary: { passed: 0, warnings: 0, failed: 0 } };
		const output = formatDoctorReport(emptyReport);

		assert.ok(output.includes("Summary"));
		assert.ok(output.includes("0"));
		assert.doesNotMatch(output, /[╔╗╚╝╠╣║═]/);
	});

	it("reports subagents phase6 strategy visibility in doctor output", async () => {
		const report = await runDoctorChecks(
			process.cwd(),
			mergeConfig({
				subagents: {
					projectAgentPolicy: "confirm",
					nonInteractivePolicy: "deny",
				},
			})
		);

		const strategyItem = report.items.find(
			(item) => item.category === "subagents" && item.message.includes("requires confirmation")
		);
		assert.ok(strategyItem);
		assert.equal(strategyItem?.status, "warn");
		assert.match(strategyItem?.details ?? "", /projectAgentPolicy=confirm/);
		assert.match(strategyItem?.details ?? "", /nonInteractivePolicy=deny/);

		const validationItem = report.items.find(
			(item) => item.category === "subagents" && item.message.includes("Frontmatter validation")
		);
		assert.ok(validationItem);
	});

	it("reports guards gate effective strategy in doctor output", async () => {
		const report = await runDoctorChecks(
			process.cwd(),
			mergeConfig({
				guards: {
					mode: "confirm",
					nonInteractivePolicy: "deny",
					blockMode: "hard",
				},
			})
		);

		const guardsItem = report.items.find((item) => item.category === "guards");
		assert.ok(guardsItem);
		assert.match(guardsItem?.message ?? "", /mode active/);
		assert.match(guardsItem?.details ?? "", /nonInteractivePolicy=deny/);
		assert.match(guardsItem?.details ?? "", /blockMode=hard/);

		const hardBlockHint = report.items.find(
			(item) => item.category === "guards" && item.message.includes("hard-block")
		);
		assert.ok(hardBlockHint);
		assert.equal(hardBlockHint?.status, "warn");
		assert.match(hardBlockHint?.details ?? "", /GUARD_HARD_BLOCKED/);
	});

	it("reports ddgs availability and disabled provider statuses safely", async () => {
		const report = await runDoctorChecks(process.cwd());
		const ddgsItem = report.items.find((item) => item.message?.includes("DuckDuckGo"));
		assert.ok(ddgsItem);
		assert.ok(["pass", "warn"].includes(ddgsItem.status));

		for (const provider of SEARCH_PROVIDER_NAMES.filter((name) => name !== "ddgs")) {
			const item = report.items.find((candidate) =>
				candidate.message?.toLowerCase().includes(provider.toLowerCase())
			);
			if (item) assert.ok(["pass", "warn", "info"].includes(item.status));
		}
	});
});

describe("subagent commands - list", () => {
	it("returns agent list structure and builtin agent properties", () => {
		const report = getAgentList(process.cwd());

		assert.ok(Array.isArray(report.builtin));
		assert.ok(Array.isArray(report.user));
		assert.ok(Array.isArray(report.project));
		assert.equal(report.total, report.builtin.length + report.user.length + report.project.length);

		const explorer = report.builtin.find((agent) => agent.name === "explorer");
		assert.ok(explorer);
		assert.equal(typeof explorer.name, "string");
		assert.equal(typeof explorer.description, "string");
		assert.equal(typeof explorer.readonly, "boolean");
		assert.equal(explorer.source, "builtin");
	});

	it("formats text and JSON agent lists", () => {
		const report = getAgentList(process.cwd());
		const output = formatAgentList(report);

		assert.ok(output.includes("Available Agents"));
		assert.ok(output.includes(report.total.toString()));
		assert.ok(output.includes("[BUILTIN]"));
		assert.ok(output.includes("explorer"));
		assert.ok(output.includes("(readonly)"));
		assert.ok(output.includes("subagent({"));
		for (const line of output.split("\n")) {
			if (!line.includes("...")) assert.ok(line.length <= 100, `Line too long: ${line}`);
		}

		const json = formatAgentListJson(report);
		assert.doesNotThrow(() => JSON.parse(json));
		const parsed = JSON.parse(json);
		assert.equal(parsed.total, report.total);
		assert.equal(parsed.builtin.length, report.builtin.length);
		assert.equal(parsed.user.length, report.user.length);
		assert.equal(parsed.project.length, report.project.length);
	});
});

describe("subagent commands - logs", () => {
	beforeEach(() => {
		resetToolkitStats();
		clearActivityLog();
	});

	afterEach(() => {
		resetToolkitStats();
		clearActivityLog();
	});

	it("returns recent logs with stats and supports limit/type filters", () => {
		const startTs = Date.now() - 1000;
		for (let i = 0; i < 10; i++) recordSearchActivity("ddgs", "success", startTs + i);
		recordFetchActivity("success");
		addToolkitActivityEntry({ timestamp: startTs + 11, type: "convert", status: "success", provider: "markitdown" });

		const result = getRecentLogs();
		assert.ok(Array.isArray(result.entries));
		assert.ok(result.stats);
		assert.ok(typeof result.stats.totalRequests === "number");
		assert.ok(typeof result.stats.successCount === "number");
		assert.ok(typeof result.stats.errorCount === "number");
		assert.ok(typeof result.stats.rateLimitedCount === "number");
		assert.ok(typeof result.stats.averageLatencyMs === "number");

		assert.ok(getRecentLogs({ limit: 5 }).entries.length <= 5);
		assert.ok(getRecentLogs({ type: "search" }).entries.every((entry) => entry.type === "search"));
		assert.ok(getRecentLogs({ type: "fetch" }).entries.every((entry) => entry.type === "fetch"));
		assert.ok(getRecentLogs({ type: "convert" }).entries.every((entry) => entry.type === "convert"));
	});

	it("formats text and JSON logs", () => {
		const startTs = Date.now() - 100;
		recordSearchActivity("ddgs", "success", startTs);
		recordSearchActivity("ddgs", "error", startTs + 1, "WEB_SEARCH_FAILED");
		recordSearchActivity("ddgs", "rate_limited", startTs + 2);

		const output = formatLogs();
		assert.ok(output.includes("Activity") || output.includes("Recent"));
		assert.ok(output.includes("Statistics") || output.includes("Total Requests"));
		assert.ok(output.includes("ddgs"));
		assert.ok(output.includes("ms"));

		const json = formatLogsJson();
		assert.doesNotThrow(() => JSON.parse(json));
		const parsed = JSON.parse(json);
		assert.ok(parsed.entries.length > 0);
		assert.ok(parsed.stats);
		assert.ok(["search", "fetch", "get_content"].includes(parsed.entries[0].type));
		assert.ok(["pending", "success", "error", "rate_limited"].includes(parsed.entries[0].status));
		assert.ok(parsed.entries[0].requestId);
	});
});

describe("subagent commands - activity panel", () => {
	let panel: ActivityPanel;

	beforeEach(() => {
		clearActivityLog();
		resetToolkitStats();
		panel = new ActivityPanel({ maxEntries: 10 });
	});

	afterEach(() => {
		panel.dispose();
		clearActivityLog();
		resetToolkitStats();
	});
	it("renders header, stats, help, empty state, and activity entries", () => {
		let lines = panel.render(80);
		assert.equal(visibleWidth(lines[0]!), 80);
		assert.equal(visibleWidth(lines.at(-1)!), 80);
		assert.ok(stripAnsi(lines[0]!).endsWith("╮"));
		assert.ok(stripAnsi(lines.at(-1)!).endsWith("╯"));
		assert.match(stripAnsi(lines.at(-1)!), /Esc close ─+─╯$/);
		assert.ok(lines[0]?.includes("Toolkit Activity"));
		assert.ok(lines.some((line) => line.includes("total:")));
		assert.ok(lines.some((line) => line.includes("success:")));
		assert.ok(lines.some((line) => line.includes("navigate")));
		assert.ok(lines.some((line) => line.includes("no recent activity")));

		recordSearchActivity({ requestId: "test-1", type: "search", status: "success", duration: 100, provider: "ddgs" });
		panel.refresh();
		lines = panel.render(80);
		assert.ok(lines.some((line) => line.includes("SEARCH")));
	});

	it("handles user input and factory creation", () => {
		let closed = false;
		panel.setOnClose(() => {
			closed = true;
		});
		panel.handleInput("escape");
		assert.equal(closed, true);

		recordSearchActivity({ requestId: "test-c", type: "search", status: "success", duration: 50 });
		panel.handleInput("c");
		assert.ok(panel.render(80).some((line) => line.includes("no recent activity")));

		recordSearchActivity({ requestId: "test-s", type: "search", status: "success", duration: 50 });
		panel.handleInput("s");
		assert.ok(panel.render(80).some((line) => line.includes("total:0")));

		panel.handleInput("\x1b[A");
		panel.handleInput("\x1b[B");
		panel.handleInput("r");

		const created = createActivityPanel({ maxEntries: 25, autoRefresh: true });
		assert.ok(created);
		created.dispose();
	});
});
