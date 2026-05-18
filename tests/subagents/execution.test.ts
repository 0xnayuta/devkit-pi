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

function makeTempPiNodeScript(source: string): { dir: string; scriptPath: string } {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "devkit-pi-execution-node-"));
	tempDirs.push(dir);
	const scriptPath = path.join(dir, "pi-child.mjs");
	fs.writeFileSync(scriptPath, source, "utf-8");
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
	it("filters high-frequency message_update events with a cross-platform node child", async () => {
		const { dir, scriptPath } = makeTempPiNodeScript(`
let text = "";
for (let i = 0; i < 200; i++) {
  text += "x".repeat(50);
  console.log(JSON.stringify({
    type: "message_update",
    message: { role: "assistant", content: [{ type: "text", text }] },
    assistantMessageEvent: {
      type: "text_delta",
      delta: "x",
      partial: { role: "assistant", content: [{ type: "text", text }] },
    },
  }));
}
console.log(JSON.stringify({
  type: "message_end",
  message: {
    role: "assistant",
    content: [{ type: "text", text: "cross-platform final" }],
    usage: { input: 3, output: 4, cost: 0.02 },
  },
}));
`);

		const result = await runSync(dir, [], {
			timeoutMs: 3000,
			maxStdoutBytes: 1024,
			maxJsonlLines: 10,
			maxTransientJsonlLines: 1000,
			spawnCommand: { command: process.execPath, args: [scriptPath] },
		});

		assert.equal(result.outputLimitExceeded, undefined);
		assert.equal(result.exitCode, 0);
		assert.equal(result.final, true);
		assert.equal(result.output, "cross-platform final");
		assert.equal(result.usage?.input, 3);
		assert.equal(result.usage?.output, 4);
	});

	it("enforces transient JSONL line limit separately from persisted JSONL line limit", async () => {
		const { dir, scriptPath } = makeTempPiNodeScript(`
for (let i = 0; i < 20; i++) {
  console.log(JSON.stringify({
    type: "message_update",
    message: { role: "assistant", content: [{ type: "text", text: "step " + i }] },
  }));
}
setTimeout(() => {}, 5000);
`);

		const result = await runSync(dir, [], {
			timeoutMs: 3000,
			maxStdoutBytes: 1024,
			maxJsonlLines: 1,
			maxTransientJsonlLines: 5,
			spawnCommand: { command: process.execPath, args: [scriptPath] },
		});

		assert.equal(result.outputLimitExceeded, "transientJsonlLines");
		assert.equal(result.exitCode, 1);
		assert.match(result.output, /transient JSONL line hard limit/);
	});

	it("enforces non-JSON stdout hard limit with a cross-platform node child", async () => {
		const { dir, scriptPath } = makeTempPiNodeScript(`
process.stdout.write("x".repeat(200000));
setTimeout(() => {}, 5000);
`);

		const result = await runSync(dir, [], {
			timeoutMs: 3000,
			maxStdoutBytes: 1024,
			spawnCommand: { command: process.execPath, args: [scriptPath] },
		});

		assert.equal(result.outputLimitExceeded, "stdout");
		assert.equal(result.exitCode, 1);
		assert.match(result.output, /stdout hard limit/);
		assert.ok(Buffer.byteLength(result.partialOutput ?? "") <= 1024);
	});

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
		assert.match(firstContent.text, /exceeded maximum runtime after 75ms/);
	});

	itPosix("idle timeout fires when no valid JSONL activity events are emitted", async () => {
		const { dir } = makeTempPiScript();
		// Replace the infinite loop script with one that emits only raw text (not JSONL)
		// so it never produces valid activity events for the idle timer to reset
		const scriptPath = path.join(dir, "pi");
		fs.writeFileSync(
			scriptPath,
			[
				"#!/usr/bin/env bash",
				"# Emit non-JSONL text in a loop — the idle timer should never reset",
				"while true; do",
				"  echo 'still running...' >&2",
				"  sleep 0.1",
				"done",
				"",
			].join("\n"),
			"utf-8",
		);
		fs.chmodSync(scriptPath, 0o755);

		const started = performance.now();
		const result = await runSync(path.dirname(dir), [], {
			timeoutMs: 3000,  // hard cap (not reached)
			idleTimeoutMs: 75, // idle timer fires first
			env: {
				PATH: `${dir}${path.delimiter}${process.env.PATH ?? ""}`,
			},
		});
		const elapsed = performance.now() - started;

		assert.equal(result.timedOut, true);
		assert.equal(result.timeoutReason, "idle");
		assert.equal(result.exitCode, 124);
		assert.equal(result.cancelled, false);
		assert.ok(elapsed < 2000, `expected idle timeout normalization to finish quickly, took ${elapsed}ms`);
	});

	itPosix("idle timeout resets on valid JSONL activity events (message_end)", async () => {
		const { dir } = makeTempPiScript();
		// Script that emits a valid message_end JSONL event every ~40ms, exceeding idleTimeoutMs
		// but staying under the hard timeout. The idle timer should be reset each time.
		const scriptPath = path.join(dir, "pi");
		fs.writeFileSync(
			scriptPath,
			[
				"#!/usr/bin/env bash",
				"# Emit valid message_end JSONL events to reset the idle timer",
				"for i in $(seq 1 100); do",
				"  echo \"{\\\"type\\\":\\\"message_end\\\",\\\"message\\\":{\\\"role\\\":\\\"assistant\\\",\\\"content\\\":[{\\\"type\\\":\\\"text\\\",\\\"text\\\":\\\"step $i\\\"}]}}\"",
				"  sleep 0.02",
				"done",
				"",
			].join("\n"),
			"utf-8",
		);
		fs.chmodSync(scriptPath, 0o755);

		const started = performance.now();
		const result = await runSync(path.dirname(dir), [], {
			timeoutMs: 1000, // hard cap reached before the script completes (~2s total)
			idleTimeoutMs: 200, // would fire after 200ms without activity
			env: {
				PATH: `${dir}${path.delimiter}${process.env.PATH ?? ""}`,
			},
		});
		const elapsed = performance.now() - started;

		// The hard timeout should have been reached before any idle timeout could fire
		// because each message_end resets the idle timer
		assert.equal(result.timedOut, true);
		assert.equal(result.timeoutReason, "runtime");
		assert.equal(result.exitCode, 124);
		assert.ok(elapsed >= 900, `expected hard timeout to fire, took ${elapsed}ms`);
		assert.ok(elapsed < 2000, `expected hard timeout to finish promptly, took ${elapsed}ms`);
	});

	itPosix("executor maps idle timeout to SUBAGENT_TIMEOUT with 'without activity' message", async () => {
		const { dir } = makeTempPiScript();
		// Script that only emits raw text (not valid JSONL activity events)
		const scriptPath = path.join(dir, "pi");
		fs.writeFileSync(
			scriptPath,
			[
				"#!/usr/bin/env bash",
				"while true; do",
				"  echo 'processing...' >&2",
				"  sleep 0.1",
				"done",
				"",
			].join("\n"),
			"utf-8",
		);
		fs.chmodSync(scriptPath, 0o755);
		process.env.PATH = `${dir}${path.delimiter}${process.env.PATH ?? ""}`;

		const sessionRoot = fs.mkdtempSync(path.join(os.tmpdir(), "devkit-pi-idle-executor-"));
		tempDirs.push(sessionRoot);
		const config = mergeConfig({
			subagents: {
				timeoutMs: 3000,
				idleTimeoutMs: 75,
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
						name: "idle-test-agent",
						description: "Idle timeout test agent",
						readonly: true,
						tools: [],
						systemPrompt: "You are an idle test agent.",
						source: "builtin",
						filePath: "agents/idle-test-agent.md",
					},
				],
			}),
		});

		const result = await executor.execute(
			"idle-timeout-test",
			{ agent: "idle-test-agent", task: "Run until idle timeout fires" },
			new AbortController().signal,
			undefined,
			{
				cwd: process.cwd(),
				sessionManager: { getSessionFile: () => null },
			} as any,
		);

		assert.equal(result.details.error?.code, SUBAGENT_ERROR_CODES.SUBAGENT_TIMEOUT);
		assert.equal(result.details.results[0]?.exitCode, 124);
		assert.equal(result.details.results[0]?.timeoutReason, "idle");
		const firstContent = result.content[0];
		assert.equal(firstContent?.type, "text");
		assert.match(firstContent.text, /without activity/);
	});

	itPosix("terminates child when stdout exceeds the hard byte limit", async () => {
		const { dir } = makeTempPiScript();
		const scriptPath = path.join(dir, "pi");
		fs.writeFileSync(
			scriptPath,
			[
				"#!/usr/bin/env bash",
				"printf '%*s' 200000 '' | tr ' ' x",
				"sleep 5",
				"",
			].join("\n"),
			"utf-8",
		);
		fs.chmodSync(scriptPath, 0o755);

		const result = await runSync(path.dirname(dir), [], {
			timeoutMs: 3000,
			maxStdoutBytes: 1024,
			env: {
				PATH: `${dir}${path.delimiter}${process.env.PATH ?? ""}`,
			},
		});

		assert.equal(result.outputLimitExceeded, "stdout");
		assert.equal(result.exitCode, 1);
		assert.match(result.output, /stdout hard limit/);
		assert.ok(Buffer.byteLength(result.partialOutput ?? "") <= 1024);
	});

	itPosix("does not persist high-frequency message_update events into stdout hard limit", async () => {
		const { dir } = makeTempPiScript();
		const scriptPath = path.join(dir, "pi");
		fs.writeFileSync(
			scriptPath,
			[
				"#!/usr/bin/env bash",
				"node <<'NODE'",
				"let text = '';",
				"for (let i = 0; i < 200; i++) {",
				"  text += 'x'.repeat(50);",
				"  console.log(JSON.stringify({",
				"    type: 'message_update',",
				"    message: { role: 'assistant', content: [{ type: 'text', text }] },",
				"    assistantMessageEvent: {",
				"      type: 'text_delta',",
				"      delta: 'x',",
				"      partial: { role: 'assistant', content: [{ type: 'text', text }] },",
				"    },",
				"  }));",
				"}",
				"console.log(JSON.stringify({",
				"  type: 'message_end',",
				"  message: {",
				"    role: 'assistant',",
				"    content: [{ type: 'text', text: 'final answer' }],",
				"    usage: { input: 1, output: 2, cost: 0.01 },",
				"  },",
				"}));",
				"NODE",
				"",
			].join("\n"),
			"utf-8",
		);
		fs.chmodSync(scriptPath, 0o755);

		const result = await runSync(path.dirname(dir), [], {
			timeoutMs: 3000,
			maxStdoutBytes: 1024,
			maxJsonlLines: 1000,
			env: {
				PATH: `${dir}${path.delimiter}${process.env.PATH ?? ""}`,
			},
		});

		assert.equal(result.outputLimitExceeded, undefined);
		assert.equal(result.exitCode, 0);
		assert.equal(result.final, true);
		assert.equal(result.output, "final answer");
		assert.equal(result.usage?.input, 1);
		assert.equal(result.usage?.output, 2);
	});

	itPosix("does not persist high-frequency tool_execution_update events into stdout hard limit", async () => {
		const { dir } = makeTempPiScript();
		const scriptPath = path.join(dir, "pi");
		fs.writeFileSync(
			scriptPath,
			[
				"#!/usr/bin/env bash",
				"node <<'NODE'",
				"let partialResult = '';",
				"for (let i = 0; i < 100; i++) {",
				"  partialResult += 'tool-output-'.repeat(20);",
				"  console.log(JSON.stringify({",
				"    type: 'tool_execution_update',",
				"    toolCallId: 'call-1',",
				"    partialResult,",
				"  }));",
				"}",
				"console.log(JSON.stringify({",
				"  type: 'tool_execution_end',",
				"  toolCallId: 'call-1',",
				"  result: 'ok',",
				"}));",
				"NODE",
				"",
			].join("\n"),
			"utf-8",
		);
		fs.chmodSync(scriptPath, 0o755);

		const result = await runSync(path.dirname(dir), [], {
			timeoutMs: 3000,
			maxStdoutBytes: 512,
			maxJsonlLines: 1000,
			env: {
				PATH: `${dir}${path.delimiter}${process.env.PATH ?? ""}`,
			},
		});

		assert.equal(result.outputLimitExceeded, undefined);
		assert.equal(result.exitCode, 0);
		assert.equal(result.final, false);
		assert.equal(result.lastEventType, "tool_execution_end");
		assert.match(result.output, /Tool executions completed: 1/);
	});

	itPosix("counts valid JSONL transient events toward the transient JSONL line hard limit", async () => {
		const { dir } = makeTempPiScript();
		const scriptPath = path.join(dir, "pi");
		fs.writeFileSync(
			scriptPath,
			[
				"#!/usr/bin/env bash",
				"node <<'NODE'",
				"for (let i = 0; i < 20; i++) {",
				"  console.log(JSON.stringify({",
				"    type: 'message_update',",
				"    message: { role: 'assistant', content: [{ type: 'text', text: `step ${i}` }] },",
				"  }));",
				"}",
				"NODE",
				"sleep 5",
				"",
			].join("\n"),
			"utf-8",
		);
		fs.chmodSync(scriptPath, 0o755);

		const result = await runSync(path.dirname(dir), [], {
			timeoutMs: 3000,
			maxStdoutBytes: 1024,
			maxJsonlLines: 100,
			maxTransientJsonlLines: 5,
			env: {
				PATH: `${dir}${path.delimiter}${process.env.PATH ?? ""}`,
			},
		});

		assert.equal(result.outputLimitExceeded, "transientJsonlLines");
		assert.equal(result.exitCode, 1);
		assert.match(result.output, /transient JSONL line hard limit/);
	});

	itPosix("terminates child when stderr exceeds the hard byte limit", async () => {
		const { dir } = makeTempPiScript();
		const scriptPath = path.join(dir, "pi");
		fs.writeFileSync(
			scriptPath,
			[
				"#!/usr/bin/env bash",
				"printf '%*s' 200000 '' | tr ' ' e >&2",
				"sleep 5",
				"",
			].join("\n"),
			"utf-8",
		);
		fs.chmodSync(scriptPath, 0o755);

		const result = await runSync(path.dirname(dir), [], {
			timeoutMs: 3000,
			maxStderrBytes: 1024,
			env: {
				PATH: `${dir}${path.delimiter}${process.env.PATH ?? ""}`,
			},
		});

		assert.equal(result.outputLimitExceeded, "stderr");
		assert.equal(result.exitCode, 1);
		assert.match(result.output, /stderr hard limit/);
		assert.ok(Buffer.byteLength(result.partialOutput ?? "") <= 1024);
	});

	itPosix("maps child output hard limit to SUBAGENT_OUTPUT_TRUNCATED at the executor layer", async () => {
		const { dir } = makeTempPiScript();
		const scriptPath = path.join(dir, "pi");
		fs.writeFileSync(
			scriptPath,
			[
				"#!/usr/bin/env bash",
				"printf '%*s' 200000 '' | tr ' ' x",
				"sleep 5",
				"",
			].join("\n"),
			"utf-8",
		);
		fs.chmodSync(scriptPath, 0o755);
		process.env.PATH = `${dir}${path.delimiter}${process.env.PATH ?? ""}`;

		const sessionRoot = fs.mkdtempSync(path.join(os.tmpdir(), "devkit-pi-output-limit-executor-"));
		tempDirs.push(sessionRoot);
		const config = mergeConfig({
			subagents: {
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
						name: "noisy-agent",
						description: "Output limit test agent",
						readonly: true,
						tools: [],
						systemPrompt: "You are intentionally noisy.",
						source: "builtin",
						filePath: "agents/noisy-agent.md",
					},
				],
			}),
		});

		const result = await executor.execute(
			"output-limit-test",
			{ agent: "noisy-agent", task: "Emit too much output" },
			new AbortController().signal,
			undefined,
			{
				cwd: process.cwd(),
				sessionManager: { getSessionFile: () => null },
			} as any,
		);

		assert.equal(result.details.error?.code, SUBAGENT_ERROR_CODES.SUBAGENT_OUTPUT_TRUNCATED);
		assert.equal(result.details.results[0]?.exitCode, 1);
		const firstContent = result.content[0];
		assert.equal(firstContent?.type, "text");
		assert.match(firstContent.text, /stdout hard limit/);
	});
});
