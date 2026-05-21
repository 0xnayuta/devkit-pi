import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { mergeConfig } from "../../src/config/load-config.ts";
import { SearchResultCache } from "../../src/modules/web/cache.ts";
import { registerWebTools } from "../../src/modules/web/register.ts";
import {
	clearResults,
	getSearchContent,
	restoreResultsFromSession,
	setStorageLimits,
	storeResult,
	WEB_RESULTS_CUSTOM_TYPE,
	WEB_RESULTS_TTL_MS,
} from "../../src/modules/web/storage.ts";

function createMockPi() {
	const eventHandlers = new Map<string, Array<(...args: unknown[]) => unknown>>();
	return {
		eventHandlers,
		registerTool() {},
		on(event: string, handler: (...args: unknown[]) => unknown) {
			const handlers = eventHandlers.get(event) ?? [];
			handlers.push(handler);
			eventHandlers.set(event, handlers);
		},
		appendEntry() {},
	};
}

describe("phase3 state model - web responseId layers", () => {
	beforeEach(() => {
		clearResults();
		setStorageLimits({ maxStoredResults: 100, maxStoredContentChars: 200000 });
	});

	afterEach(() => {
		clearResults();
	});

	it("memory: session shutdown clears in-memory responseId map", () => {
		const pi = createMockPi();
		registerWebTools(pi as any, mergeConfig({}).web);
		const shutdown = pi.eventHandlers.get("session_shutdown")?.[0];
		assert.ok(shutdown);

		const responseId = storeResult({
			type: "fetch",
			urls: [{ url: "https://example.com/a", content: "alpha", truncated: false }],
		});
		assert.equal("result" in getSearchContent({ responseId, urlIndex: 0 }, 30000), true);

		shutdown?.();
		const afterShutdown = getSearchContent({ responseId, urlIndex: 0 }, 30000);
		assert.equal("error" in afterShutdown, true);
		if ("error" in afterShutdown) assert.equal(afterShutdown.error.code, "NOT_FOUND");
	});

	it("session entry: restoreResultsFromSession restores only valid current-branch entries", () => {
		const now = Date.now();
		const validId = "valid-fetch-id";
		const expiredId = "expired-fetch-id";
		const branch = [
			{
				type: "custom",
				customType: WEB_RESULTS_CUSTOM_TYPE,
				data: {
					id: validId,
					type: "fetch",
					timestamp: now,
					urls: [{ url: "https://example.com/valid", content: "valid", truncated: false }],
				},
			},
			{
				type: "custom",
				customType: WEB_RESULTS_CUSTOM_TYPE,
				data: {
					id: expiredId,
					type: "fetch",
					timestamp: now - WEB_RESULTS_TTL_MS - 1,
					urls: [{ url: "https://example.com/expired", content: "expired", truncated: false }],
				},
			},
			{
				type: "custom",
				customType: "other-custom-type",
				data: {
					id: "other-type-id",
					type: "fetch",
					timestamp: now,
					urls: [{ url: "https://example.com/other", content: "other", truncated: false }],
				},
			},
			{
				type: "custom",
				customType: WEB_RESULTS_CUSTOM_TYPE,
				data: {
					id: "malformed",
					wrong: true,
				},
			},
		];

		const restored = restoreResultsFromSession(branch as unknown[]);
		assert.equal(restored, 1);

		const valid = getSearchContent({ responseId: validId, urlIndex: 0 }, 30000);
		assert.equal("result" in valid, true);
		const expired = getSearchContent({ responseId: expiredId, urlIndex: 0 }, 30000);
		assert.equal("error" in expired, true);
	});

	it("session entry: malformed payloads are ignored without throwing", () => {
		const now = Date.now();
		const branch = [
			null,
			{},
			{ type: "tool_result", customType: WEB_RESULTS_CUSTOM_TYPE, data: {} },
			{ type: "custom", customType: WEB_RESULTS_CUSTOM_TYPE, data: null },
			{ type: "custom", customType: WEB_RESULTS_CUSTOM_TYPE, data: { id: "x", type: "fetch", timestamp: Number.NaN, urls: [] } },
			{ type: "custom", customType: WEB_RESULTS_CUSTOM_TYPE, data: { id: "x", type: "fetch", timestamp: now, urls: "not-array" } },
			{ type: "custom", customType: WEB_RESULTS_CUSTOM_TYPE, data: { id: "x", type: "search", timestamp: now, queries: "not-array" } },
			{ type: "custom", customType: WEB_RESULTS_CUSTOM_TYPE, data: { id: "ok", type: "fetch", timestamp: now, urls: [{ url: "https://example.com", content: "ok", truncated: false }] } },
		];

		assert.doesNotThrow(() => restoreResultsFromSession(branch as unknown[]));
		const restored = restoreResultsFromSession(branch as unknown[]);
		assert.equal(restored, 1);
		assert.equal("result" in getSearchContent({ responseId: "ok", urlIndex: 0 }, 30000), true);
		assert.equal("error" in getSearchContent({ responseId: "x" }, 30000), true);
	});

	it("provider cache: cache hit semantics remain independent from session restore", () => {
		const cache = new SearchResultCache({ enabled: true, maxEntries: 10, ttlMs: 60000 });
		cache.set("alpha", "ddgs", 5, [{ query: "alpha", results: [] }]);
		assert.ok(cache.get("alpha", "ddgs", 5));

		clearResults();
		restoreResultsFromSession([]);

		assert.ok(cache.get("alpha", "ddgs", 5));
		assert.equal("error" in getSearchContent({ responseId: "missing" }, 30000), true);
	});
});
