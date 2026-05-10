import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import type { ExtractedContent, QueryResultData } from "../../src/modules/web/types.ts";
import {
  WEB_RESULTS_CUSTOM_TYPE,
  WEB_RESULTS_TTL_MS,
  clearResults,
  getSearchContent,
  restoreResultsFromSession,
  setSessionResultAppender,
  setStorageLimits,
  storeResult,
} from "../../src/modules/web/storage.ts";

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

describe("web storage get_search_content", () => {
  beforeEach(() => {
    clearResults();
    setSessionResultAppender(null);
    setStorageLimits({ maxStoredResults: 100, maxStoredContentChars: 200000 });
  });

  it("returns a clear error for unknown responseId", () => {
    const result = getSearchContent({ responseId: "missing" }, 30_000);
    assert.deepEqual(result, {
      error: {
        code: "NOT_FOUND",
        message: "No stored web result found for responseId: missing",
      },
    });
  });

  it("retrieves fetch content by urlIndex", () => {
    const responseId = storeResult(fetchResult);
    const result = getSearchContent({ responseId, urlIndex: 1 }, 30_000);
    assert.equal("result" in result, true);
    if ("result" in result) {
      assert.equal((result.result as { type?: string }).type, undefined);
      assert.equal((result.result as ExtractedContent).url, "https://example.com/b");
    }
  });

  it("retrieves fetch content by url", () => {
    const responseId = storeResult(fetchResult);
    const result = getSearchContent({ responseId, url: "https://example.com/a" }, 30_000);
    assert.equal("result" in result, true);
    if ("result" in result) {
      assert.equal((result.result as ExtractedContent).url, "https://example.com/a");
    }
  });

  it("retrieves search content by queryIndex", () => {
    const responseId = storeResult(searchResult);
    const result = getSearchContent({ responseId, queryIndex: 0 }, 30_000);
    assert.equal("result" in result, true);
    if ("result" in result) {
      assert.equal((result.result as QueryResultData).query, "alpha");
    }
  });

  it("retrieves search content by query", () => {
    const responseId = storeResult(searchResult);
    const result = getSearchContent({ responseId, query: "alpha" }, 30_000);
    assert.equal("result" in result, true);
    if ("result" in result) {
      assert.equal((result.result as QueryResultData).query, "alpha");
    }
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
      assert.match(missingQuery.error.message, /Query \"missing\" not found/);
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
    const restored = restoreResultsFromSession(branch, timestamp + 1000);
    assert.equal(restored, 1);

    const restoredResult = getSearchContent({ responseId, urlIndex: 0 }, 30_000);
    assert.equal("result" in restoredResult, true);

    clearResults();
    const expired = restoreResultsFromSession(branch, timestamp + WEB_RESULTS_TTL_MS + 1);
    assert.equal(expired, 0);

    const missing = getSearchContent({ responseId, urlIndex: 0 }, 30_000);
    assert.equal("error" in missing, true);
    if ("error" in missing) {
      assert.equal(missing.error.code, "NOT_FOUND");
    }
  });

  it("enforces storage max entries and per-item stored content size", () => {
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

    const first = getSearchContent({ responseId: firstId, urlIndex: 0 }, 30_000);
    assert.equal("error" in first, true);

    const second = getSearchContent({ responseId: secondId, urlIndex: 0 }, 30_000);
    const third = getSearchContent({ responseId: thirdId, urlIndex: 0 }, 30_000);
    assert.equal("result" in second, true);
    assert.equal("result" in third, true);

    if ("result" in second) {
      assert.equal((second.result as ExtractedContent).content, "22222");
      assert.equal((second.result as ExtractedContent).truncated, true);
    }
  });

  it("truncates returned content without mutating stored content", () => {
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
