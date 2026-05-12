/**
 * Subagent execution timeout normalization tests.
 */

import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { performance } from "node:perf_hooks";
import { afterEach, describe, it } from "node:test";
import { mergeConfig } from "../../src/config/load-config.ts";
import { createSubagentExecutor } from "../../src/modules/subagents/executor.ts";
import { runSync } from "../../src/modules/subagents/execution.ts";
import { SUBAGENT_ERROR_CODES } from "../../src/shared/types.ts";

const tempDirs: string[] = [];
const itPosix = process.platform === "win32" ? it.skip : it;
const envSnapshot = {
	PATH: process.env.PATH,
	PI_SUBAGENT_DEPTH: process.env.PI_SUBAGENT_DEPTH,
	PI_SUBAGENT_MAX_DEPTH: process.env.PI_SUBAGENT_MAX_DEPTH,
};

function makeTempPiScript(): { dir: string; scriptPath: string } {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "devkit-pi-execution-"));
	tempDirs.push(dir);
	const scriptPath = path.join(dir, "pi");
	fs.writeFileSync(
		scriptPath,
		["#!/usr/bin/env bash", "trap 'exit 0' TERM", "while true; do sleep 0.05; done", ""].join("\n"),
		"utf-8",
	);
	fs.chmodSync(scriptPath, 0o755);
	return { dir, scriptPath };
}

afterEach(() => {
	if (envSnapshot.PATH === undefined) delete process.env.PATH;
	else process.env.PATH = envSnapshot.PATH;
	if (envSnapshot.PI_SUBAGENT_DEPTH === undefined) delete process.env.PI_SUBAGENT_DEPTH;
	else process.env.PI_SUBAGENT_DEPTH = envSnapshot.PI_SUBAGENT_DEPTH;
	if (envSnapshot.PI_SUBAGENT_MAX_DEPTH === undefined) delete process.env.PI_SUBAGENT_MAX_DEPTH;
	else process.env.PI_SUBAGENT_MAX_DEPTH = envSnapshot.PI_SUBAGENT_MAX_DEPTH;

	for (const dir of tempDirs.splice(0)) {
		fs.rmSync(dir, { recursive: true, force: true });
	}
});

describe("subagent execution timeout normalization", () => {
	itPosix("normalizes a timed-out long-running child process to exitCode 124", async () => {
		const { dir } = makeTempPiScript();
		const started = performance.now();
		const result = await runSync(path.dirname(dir), [], {
			timeoutMs: 75,
			env: {
				PATH: `${dir}${path.delimiter}${process.env.PATH ?? ""}`,
			},
		});
		const elapsed = performance.now() - started;

		assert.equal(result.timedOut, true);
		assert.equal(result.exitCode, 124);
		assert.equal(result.cancelled, false);
		assert.ok(elapsed < 2000, `expected timeout normalization to finish quickly, took ${elapsed}ms`);
	});

	itPosix("maps a timed-out child process to SUBAGENT_TIMEOUT at the executor layer", async () => {
		const { dir } = makeTempPiScript();
		process.env.PATH = `${dir}${path.delimiter}${process.env.PATH ?? ""}`;

		const sessionRoot = fs.mkdtempSync(path.join(os.tmpdir(), "devkit-pi-executor-session-"));
		tempDirs.push(sessionRoot);
		const config = mergeConfig({
			subagents: {
				timeoutMs: 75,
				retry: { enabled: false, maxAttempts: 1 },
			},
		}).subagents;
		const executor = createSubagentExecutor({
			pi: {} as any,
			state: { baseCwd: process.cwd(), currentSessionId: null, lastUiContext: null },
			config,
			getSubagentSessionRoot: () => sessionRoot,
			discoverAgents: () => ({
				agents: [
					{
						name: "slow-agent",
						description: "Long-running test agent",
						readonly: true,
						tools: [],
						systemPrompt: "You are intentionally slow.",
						source: "builtin",
						filePath: "agents/slow-agent.md",
					},
				],
			}),
		});

		const result = await executor.execute(
			"timeout-test",
			{ agent: "slow-agent", task: "Run until the executor timeout fires" },
			new AbortController().signal,
			undefined,
			{
				cwd: process.cwd(),
				sessionManager: { getSessionFile: () => null },
			} as any,
		);

		assert.equal(result.details.error?.code, SUBAGENT_ERROR_CODES.SUBAGENT_TIMEOUT);
		assert.equal(result.details.results[0]?.exitCode, 124);
		const firstContent = result.content[0];
		assert.equal(firstContent?.type, "text");
		assert.match(firstContent.text, /Subagent timed out after 75ms/);
	});
});
