import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import {
	getSearchCache,
	initializeSearchCache,
	resetSearchCache,
	SearchResultCache,
} from "../../src/modules/web/cache.ts";
import {
	clearResults,
	getSearchContent,
	restoreResultsFromSession,
	setSessionResultAppender,
	setStorageLimits,
	storeResult,
	WEB_RESULTS_CUSTOM_TYPE,
	WEB_RESULTS_TTL_MS,
} from "../../src/modules/web/storage.ts";
import type { ExtractedContent, QueryResultData } from "../../src/modules/web/types.ts";

const fetchResult = {
	type: "fetch" as const,
	urls: [
		{
			url: "https://example.com/a",
			title: "A",
			content: "alpha content",
			truncated: false,
			contentType: "text/html",
		},
		{
			url: "https://example.com/b",
			title: "B",
			content: "beta content",
			truncated: false,
			contentType: "text/plain",
		},
	],
};

const searchResult = {
	type: "search" as const,
	queries: [
		{
			query: "alpha",
			results: [
				{
					title: "Alpha",
					url: "https://example.com/a",
					snippet: "snippet",
					source: "test",
					content: fetchResult.urls[0],
				},
			],
		},
	],
};

describe("web search result cache", () => {
	let cache: SearchResultCache;

	beforeEach(() => {
		resetSearchCache();
		cache = new SearchResultCache({ enabled: true, maxEntries: 10, ttlMs: 60000 });
	});

	afterEach(() => {
		cache.clear();
		resetSearchCache();
	});

	it("stores, retrieves, misses, clears, invalidates, and respects disabled mode", () => {
		const defaultCache = new SearchResultCache();
		assert.equal(defaultCache.getConfig().enabled, false);

		const disabledCache = new SearchResultCache({ enabled: false });
		disabledCache.set("test", "ddgs", 5, [{ query: "test", results: [] }]);
		assert.equal(disabledCache.get("test", "ddgs", 5), null);

		const results = [{ query: "test", results: [{ title: "Test", url: "https://example.com/test" }] }];
		cache.set("test", "ddgs", 5, results);
		assert.equal(cache.get("test", "ddgs", 5)?.[0].query, "test");
		assert.equal(cache.get("nonexistent", "ddgs", 5), null);

		cache.clear();
		assert.equal(cache.get("test", "ddgs", 5), null);

		cache.set("test", "ddgs", 5, results);
		assert.ok(cache.get("test", "ddgs", 5));
		cache.invalidate("test", "ddgs", 5);
		assert.equal(cache.get("test", "ddgs", 5), null);
	});

	it("keys entries by provider/result count, normalizes query case, and evicts LRU", () => {
		cache.set("test", "ddgs", 5, [{ query: "test", results: [{ title: "DDGS", url: "https://example.com/ddgs" }] }]);
		cache.set("test", "tavily", 5, [
			{ query: "test", results: [{ title: "Tavily", url: "https://example.com/tavily" }] },
		]);
		cache.set("test", "ddgs", 10, [
			{ query: "test", results: [{ title: "10 results", url: "https://example.com/10" }] },
		]);
		assert.equal(cache.get("test", "ddgs", 5)?.[0].results[0].title, "DDGS");
		assert.equal(cache.get("test", "tavily", 5)?.[0].results[0].title, "Tavily");
		assert.equal(cache.get("test", "ddgs", 10)?.[0].results[0].title, "10 results");

		cache.set("TEST", "ddgs", 5, [{ query: "test", results: [] }]);
		assert.ok(cache.get("test", "ddgs", 5));

		const smallCache = new SearchResultCache({ enabled: true, maxEntries: 3, ttlMs: 60000 });
		for (const query of ["a", "b", "c", "d"]) smallCache.set(query, "ddgs", 5, [{ query, results: [] }]);
		assert.equal(smallCache.get("a", "ddgs", 5), null);
		for (const query of ["b", "c", "d"]) assert.ok(smallCache.get(query, "ddgs", 5));
	});

	it("tracks stats and exposes a configurable global instance", () => {
		cache.set("test", "ddgs", 5, [{ query: "test", results: [] }]);
		cache.get("test", "ddgs", 5);
		cache.get("test", "ddgs", 5);
		cache.get("missing", "ddgs", 5);

		const stats = cache.getStats();
		assert.equal(stats.hits, 2);
		assert.equal(stats.misses, 1);
		assert.ok(stats.hitRate > 0.5);

		assert.equal(getSearchCache(), getSearchCache());
		initializeSearchCache({ enabled: true, maxEntries: 100 });
		assert.equal(getSearchCache().getConfig().enabled, true);
		assert.equal(getSearchCache().getConfig().maxEntries, 100);
	});
});

describe("web storage get_search_content", () => {
	beforeEach(() => {
		clearResults();
		setSessionResultAppender(null);
		setStorageLimits({ maxStoredResults: 100, maxStoredContentChars: 200000 });
	});

	it("returns a clear error for unknown responseId", () => {
		assert.deepEqual(getSearchContent({ responseId: "missing" }, 30_000), {
			error: { code: "NOT_FOUND", message: "No stored web result found for responseId: missing" },
		});
	});

	it("retrieves fetch content by index or URL", () => {
		const responseId = storeResult(fetchResult);
		const byIndex = getSearchContent({ responseId, urlIndex: 1 }, 30_000);
		assert.equal("result" in byIndex, true);
		if ("result" in byIndex) {
			assert.equal((byIndex.result as { type?: string }).type, undefined);
			assert.equal((byIndex.result as ExtractedContent).url, "https://example.com/b");
		}

		const byUrl = getSearchContent({ responseId, url: "https://example.com/a" }, 30_000);
		assert.equal("result" in byUrl, true);
		if ("result" in byUrl) assert.equal((byUrl.result as ExtractedContent).url, "https://example.com/a");
	});

	it("retrieves search content by index or query", () => {
		const responseId = storeResult(searchResult);
		const byIndex = getSearchContent({ responseId, queryIndex: 0 }, 30_000);
		assert.equal("result" in byIndex, true);
		if ("result" in byIndex) assert.equal((byIndex.result as QueryResultData).query, "alpha");

		const byQuery = getSearchContent({ responseId, query: "alpha" }, 30_000);
		assert.equal("result" in byQuery, true);
		if ("result" in byQuery) assert.equal((byQuery.result as QueryResultData).query, "alpha");
	});

	it("returns actionable hints for selector errors", () => {
		const responseId = storeResult(fetchResult);
		const outOfRange = getSearchContent({ responseId, urlIndex: 9 }, 30_000);
		assert.equal("error" in outOfRange, true);
		if ("error" in outOfRange) {
			assert.match(outOfRange.error.message, /urlIndex 9 out of range/);
			assert.match(outOfRange.error.message, /Available:/);
		}

		const missingQuery = getSearchContent({ responseId: storeResult(searchResult), query: "missing" }, 30_000);
		assert.equal("error" in missingQuery, true);
		if ("error" in missingQuery) {
			assert.match(missingQuery.error.message, /Query "missing" not found/);
			assert.match(missingQuery.error.message, /Available:/);
		}
	});

	it("restores recent session entries and ignores expired entries", () => {
		const branch: Array<{ type: string; customType: string; data: unknown }> = [];
		setSessionResultAppender((data) => {
			branch.push({ type: "custom", customType: WEB_RESULTS_CUSTOM_TYPE, data });
		});

		const responseId = storeResult(fetchResult);
		const timestamp = (branch[0].data as { timestamp: number }).timestamp;

		clearResults();
		assert.equal(restoreResultsFromSession(branch, timestamp + 1000), 1);
		assert.equal("result" in getSearchContent({ responseId, urlIndex: 0 }, 30_000), true);

		clearResults();
		assert.equal(restoreResultsFromSession(branch, timestamp + WEB_RESULTS_TTL_MS + 1), 0);
		const missing = getSearchContent({ responseId, urlIndex: 0 }, 30_000);
		assert.equal("error" in missing, true);
		if ("error" in missing) assert.equal(missing.error.code, "NOT_FOUND");
	});

	it("enforces storage max entries and stored/returned content truncation", () => {
		setStorageLimits({ maxStoredResults: 2, maxStoredContentChars: 5 });
		const firstId = storeResult({
			type: "fetch",
			urls: [{ url: "https://example.com/1", content: "111111", truncated: false }],
		});
		const secondId = storeResult({
			type: "fetch",
			urls: [{ url: "https://example.com/2", content: "222222", truncated: false }],
		});
		const thirdId = storeResult({
			type: "fetch",
			urls: [{ url: "https://example.com/3", content: "333333", truncated: false }],
		});

		assert.equal("error" in getSearchContent({ responseId: firstId, urlIndex: 0 }, 30_000), true);
		const second = getSearchContent({ responseId: secondId, urlIndex: 0 }, 30_000);
		assert.equal("result" in second, true);
		assert.equal("result" in getSearchContent({ responseId: thirdId, urlIndex: 0 }, 30_000), true);
		if ("result" in second) {
			assert.equal((second.result as ExtractedContent).content, "22222");
			assert.equal((second.result as ExtractedContent).truncated, true);
		}

		setStorageLimits({ maxStoredResults: 100, maxStoredContentChars: 200000 });
		const responseId = storeResult({
			type: "fetch",
			urls: [{ url: "https://example.com", content: "0123456789", truncated: false }],
		});
		const truncated = getSearchContent({ responseId, urlIndex: 0 }, 5);
		const full = getSearchContent({ responseId, urlIndex: 0 }, 30_000);
		assert.equal("result" in truncated, true);
		assert.equal("result" in full, true);
		if ("result" in truncated && "result" in full) {
			assert.equal((truncated.result as ExtractedContent).content, "01234");
			assert.equal((truncated.result as ExtractedContent).truncated, true);
			assert.equal((full.result as ExtractedContent).content, "0123456789");
			assert.equal((full.result as ExtractedContent).truncated, false);
		}
	});
});
