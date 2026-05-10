/**
 * Cache Module Tests
 * Phase 4: Performance Optimization - Cache tests
 */

import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import {
  SearchResultCache,
  initializeSearchCache,
  getSearchCache,
  resetSearchCache,
} from "../../src/modules/web/cache.ts";

describe("cache - SearchResultCache", () => {
  let cache: SearchResultCache;

  beforeEach(() => {
    resetSearchCache();
    cache = new SearchResultCache({ enabled: true, maxEntries: 10, ttlMs: 60000 });
  });

  afterEach(() => {
    cache.clear();
  });

  it("basic operations: store, retrieve, miss, clear, invalidate", () => {
    // disabled by default
    const defaultCache = new SearchResultCache();
    assert.equal(defaultCache.getConfig().enabled, false);

    // not cached when disabled
    const disabledCache = new SearchResultCache({ enabled: false });
    disabledCache.set("test", "ddgs", 5, [{ query: "test", results: [] }]);
    assert.equal(disabledCache.get("test", "ddgs", 5), null);

    // store and retrieve
    const results = [{ query: "test", results: [{ title: "Test", url: "https://example.com/test" }] }];
    cache.set("test", "ddgs", 5, results);
    const cached = cache.get("test", "ddgs", 5);
    assert.ok(cached);
    assert.equal(cached![0].query, "test");

    // miss
    assert.equal(cache.get("nonexistent", "ddgs", 5), null);

    // clear
    cache.clear();
    assert.equal(cache.get("test", "ddgs", 5), null);

    // re-add and invalidate
    cache.set("test", "ddgs", 5, results);
    assert.ok(cache.get("test", "ddgs", 5));
    cache.invalidate("test", "ddgs", 5);
    assert.equal(cache.get("test", "ddgs", 5), null);
  });

  it("differentiates by provider and numResults, normalizes case", () => {
    cache.set("test", "ddgs", 5, [{ query: "test", results: [{ title: "DDGS", url: "https://example.com/ddgs" }] }]);
    cache.set("test", "tavily", 5, [{ query: "test", results: [{ title: "Tavily", url: "https://example.com/tavily" }] }]);
    cache.set("test", "ddgs", 10, [{ query: "test", results: [{ title: "10 results", url: "https://example.com/10" }] }]);

    assert.equal(cache.get("test", "ddgs", 5)![0].results[0].title, "DDGS");
    assert.equal(cache.get("test", "tavily", 5)![0].results[0].title, "Tavily");
    assert.equal(cache.get("test", "ddgs", 10)![0].results[0].title, "10 results");

    // case normalization
    cache.set("TEST", "ddgs", 5, [{ query: "test", results: [] }]);
    assert.ok(cache.get("test", "ddgs", 5));
  });

  it("evicts LRU entry when full", () => {
    const smallCache = new SearchResultCache({ enabled: true, maxEntries: 3, ttlMs: 60000 });
    smallCache.set("a", "ddgs", 5, [{ query: "a", results: [] }]);
    smallCache.set("b", "ddgs", 5, [{ query: "b", results: [] }]);
    smallCache.set("c", "ddgs", 5, [{ query: "c", results: [] }]);

    smallCache.set("d", "ddgs", 5, [{ query: "d", results: [] }]); // evicts "a"

    assert.equal(smallCache.get("a", "ddgs", 5), null);
    assert.ok(smallCache.get("b", "ddgs", 5));
    assert.ok(smallCache.get("c", "ddgs", 5));
    assert.ok(smallCache.get("d", "ddgs", 5));
  });

  it("tracks hits and misses", () => {
    cache.set("test", "ddgs", 5, [{ query: "test", results: [] }]);
    cache.get("test", "ddgs", 5);
    cache.get("test", "ddgs", 5);
    cache.get("missing", "ddgs", 5);

    const stats = cache.getStats();
    assert.equal(stats.hits, 2);
    assert.equal(stats.misses, 1);
    assert.ok(stats.hitRate > 0.5);
  });

  it("global instance is shared and configurable", () => {
    const cache1 = getSearchCache();
    const cache2 = getSearchCache();
    assert.equal(cache1, cache2);

    initializeSearchCache({ enabled: true, maxEntries: 100 });
    assert.equal(getSearchCache().getConfig().enabled, true);
    assert.equal(getSearchCache().getConfig().maxEntries, 100);
  });
});
