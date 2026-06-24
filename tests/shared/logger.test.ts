import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createConsoleLoggerSink, createLogger, createMemoryLoggerSink } from "../../src/shared/logger.ts";

describe("shared logger", () => {
	it("OBS-LOG-001 emits normalized event shape", () => {
		const sink = createMemoryLoggerSink();
		const logger = createLogger({ module: "web", sink });

		logger.info("search.start", "search started", { query: "pi" });

		assert.equal(sink.events.length, 1);
		assert.deepEqual(sink.events[0], {
			level: "info",
			module: "web",
			event: "search.start",
			message: "search started",
			metadata: { query: "pi" },
			error: undefined,
		});
	});

	it("OBS-LOG-002 child logger composes module path", () => {
		const sink = createMemoryLoggerSink();
		const logger = createLogger({ module: "root", sink }).child("subagents");

		logger.warn("register.degraded", "degraded mode", { reason: "missing-ui" });

		assert.equal(sink.events[0]?.module, "root.subagents");
	});

	it("OBS-LOG-003 redacts sensitive metadata keys", () => {
		const sink = createMemoryLoggerSink();
		const logger = createLogger({ module: "auth", sink });

		logger.info("token.loaded", "loaded", {
			token: "abc",
			apiKey: "def",
			nested: { authorization: "Bearer xxx", safe: "ok" },
		});

		assert.deepEqual(sink.events[0]?.metadata, {
			token: "[REDACTED]",
			apiKey: "[REDACTED]",
			nested: { authorization: "[REDACTED]", safe: "ok" },
		});
	});

	it("OBS-LOG-004 error summary does not leak stack by default", () => {
		const sink = createMemoryLoggerSink();
		const logger = createLogger({ module: "convert", sink });

		const err = new Error("boom");
		err.stack = "boom stack should not be logged";
		logger.error("convert.failed", "convert failed", { file: "x.pdf" }, err);

		assert.equal(sink.events[0]?.error?.name, "Error");
		assert.equal(sink.events[0]?.error?.message, "boom");
		assert.equal((sink.events[0]?.error as Record<string, unknown>).stack, undefined);
	});

	it("OBS-LOG-005 console sink supports injected writers", () => {
		const lines: string[] = [];
		const sink = createConsoleLoggerSink({
			info: (line) => lines.push(`info:${line}`),
			error: (line) => lines.push(`error:${line}`),
		});

		const logger = createLogger({ module: "index", sink });
		logger.info("config.warn", "invalid config", { password: "123" });
		logger.error("register.fail", "failed", undefined, new Error("x"));

		assert.equal(lines.length, 2);
		assert.match(lines[0] ?? "", /^info:\[INFO\] \[index\] config.warn: invalid config /);
		assert.match(lines[1] ?? "", /^error:\[ERROR\] \[index\] register.fail: failed /);
		assert.ok((lines[0] ?? "").includes("[REDACTED]"));
	});
});
