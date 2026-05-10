/**
 * SearXNG Provider Tests
 * Phase 3 — SearXNG self-hosted meta-search engine provider
 */

import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { mergeConfig } from "../../../src/config/load-config.ts";
import type { ResolvedWebConfig } from "../../../shared/types.ts";
import { searxngProvider } from "../../../src/modules/web/providers/searxng.ts";
import { resetConnectionPool } from "../../../src/modules/web/http-pool.ts";

const originalFetch = globalThis.fetch;

function cfg(overrides: Partial<ResolvedWebConfig> = {}): ResolvedWebConfig {
  return { ...mergeConfig({}).web, ...overrides };
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  resetConnectionPool();
});

// ---------------------------------------------------------------------------
// name
// ---------------------------------------------------------------------------

describe("searxng - name", () => {
  it('has name "searxng"', () => {
    assert.equal(searxngProvider.name, "searxng");
  });
});

// ---------------------------------------------------------------------------
// isAvailable
// ---------------------------------------------------------------------------

describe("searxng - isAvailable", () => {
  it("returns false when disabled in config", () => {
    assert.equal(
      searxngProvider.isAvailable!(
        cfg({ searxng: { enabled: false, baseUrl: "http://localhost:8888", defaultEngine: "google" } })
      ),
      false
    );
  });

  it("returns false when baseUrl is empty", () => {
    assert.equal(
      searxngProvider.isAvailable!(
        cfg({ searxng: { enabled: true, baseUrl: "", defaultEngine: "google" } })
      ),
      false
    );
  });

  it("returns false when baseUrl is invalid", () => {
    assert.equal(
      searxngProvider.isAvailable!(
        cfg({ searxng: { enabled: true, baseUrl: "not-a-url", defaultEngine: "google" } })
      ),
      false
    );
  });

  it("returns false when baseUrl has non-http protocol", () => {
    assert.equal(
      searxngProvider.isAvailable!(
        cfg({ searxng: { enabled: true, baseUrl: "ftp://example.com", defaultEngine: "google" } })
      ),
      false
    );
  });

  it("returns true when enabled with valid http baseUrl", () => {
    assert.equal(
      searxngProvider.isAvailable!(
        cfg({ searxng: { enabled: true, baseUrl: "http://localhost:8888", defaultEngine: "google" } })
      ),
      true
    );
  });

  it("returns true when enabled with valid https baseUrl", () => {
    assert.equal(
      searxngProvider.isAvailable!(
        cfg({ searxng: { enabled: true, baseUrl: "https://searxng.example.com", defaultEngine: "google" } })
      ),
      true
    );
  });

  it("does not require an API key", () => {
    // SearXNG is the only provider that doesn't need an API key
    delete process.env["SEARXNG_API_KEY"];
    assert.equal(
      searxngProvider.isAvailable!(
        cfg({ searxng: { enabled: true, baseUrl: "http://localhost:8888", defaultEngine: "google" } })
      ),
      true
    );
  });
});

// ---------------------------------------------------------------------------
// search — happy path
// ---------------------------------------------------------------------------

describe("searxng - search: happy path", () => {
  const searxngCfg = cfg({
    searxng: { enabled: true, baseUrl: "http://localhost:8888", defaultEngine: "google" },
  });

  it("returns parsed results from SearXNG response", async () => {
    const mockResponse = {
      results: [
        { title: "Result 1", url: "https://example.com/1", content: "Snippet 1", engine: "google" },
        { title: "Result 2", url: "https://example.com/2", content: "Snippet 2", engine: "bing" },
      ],
    };

    globalThis.fetch = (() =>
      Promise.resolve(
        new Response(JSON.stringify(mockResponse), { status: 200, headers: { "content-type": "application/json" } })
      )) as typeof fetch;

    const results = await searxngProvider.search({ query: "test", numResults: 5 }, searxngCfg);
    assert.equal(results.length, 2);
    assert.equal(results[0].title, "Result 1");
    assert.equal(results[0].url, "https://example.com/1");
    assert.equal(results[0].snippet, "Snippet 1");
    assert.equal(results[0].source, "google");
    assert.equal(results[1].source, "bing");
  });

  it("uses engine field as source, defaults to 'searxng'", async () => {
    const mockResponse = {
      results: [
        { title: "A", url: "https://example.com/a", content: "C", engine: "duckduckgo" },
        { title: "B", url: "https://example.com/b", content: "D" }, // no engine
      ],
    };

    globalThis.fetch = (() =>
      Promise.resolve(new Response(JSON.stringify(mockResponse), { status: 200 }))) as typeof fetch;

    const results = await searxngProvider.search({ query: "test", numResults: 5 }, searxngCfg);
    assert.equal(results[0].source, "duckduckgo");
    assert.equal(results[1].source, "searxng");
  });

  it("sends GET request with correct query params", async () => {
    let capturedUrl = "";
    let capturedMethod = "";

    globalThis.fetch = ((url: string, opts?: any) => {
      capturedUrl = url;
      capturedMethod = opts?.method;
      return Promise.resolve(
        new Response(JSON.stringify({ results: [] }), { status: 200 })
      );
    }) as typeof fetch;

    await searxngProvider.search({ query: "hello world", numResults: 5 }, searxngCfg);

    assert.equal(capturedMethod, "GET");
    const parsed = new URL(capturedUrl);
    assert.equal(parsed.searchParams.get("q"), "hello world");
    assert.equal(parsed.searchParams.get("format"), "json");
    assert.equal(parsed.searchParams.get("pageno"), "1");
    assert.equal(parsed.searchParams.get("language"), "en");
    assert.equal(parsed.searchParams.get("categories"), "general");
    assert.equal(parsed.searchParams.get("engines"), "google");
    assert.equal(parsed.searchParams.get("count"), "5");
  });

  it("adds /search path when baseUrl has root path", async () => {
    let capturedUrl = "";

    globalThis.fetch = ((url: string, _opts?: any) => {
      capturedUrl = url;
      return Promise.resolve(
        new Response(JSON.stringify({ results: [] }), { status: 200 })
      );
    }) as typeof fetch;

    await searxngProvider.search({ query: "test", numResults: 1 }, searxngCfg);

    assert.ok(capturedUrl.includes("/search"));
  });

  it("preserves existing path in baseUrl", async () => {
    const customCfg = cfg({
      searxng: { enabled: true, baseUrl: "http://localhost:8888/custom", defaultEngine: "google" },
    });
    let capturedUrl = "";

    globalThis.fetch = ((url: string, _opts?: any) => {
      capturedUrl = url;
      return Promise.resolve(
        new Response(JSON.stringify({ results: [] }), { status: 200 })
      );
    }) as typeof fetch;

    await searxngProvider.search({ query: "test", numResults: 1 }, customCfg);

    assert.ok(capturedUrl.includes("/custom"));
    assert.ok(!capturedUrl.includes("/search"));
  });

  it("respects numResults limit", async () => {
    const items = Array.from({ length: 10 }, (_, i) => ({
      title: `R${i}`,
      url: `https://example.com/${i}`,
      content: `S${i}`,
    }));

    globalThis.fetch = (() =>
      Promise.resolve(new Response(JSON.stringify({ results: items }), { status: 200 }))) as typeof fetch;

    const results = await searxngProvider.search({ query: "test", numResults: 3 }, searxngCfg);
    assert.ok(results.length <= 3);
  });

  it("filters out items without url", async () => {
    const mockResponse = {
      results: [
        { title: "Valid", url: "https://example.com/valid", content: "ok" },
        { title: "No URL" },
        { title: "Good", url: "https://example.com/good", content: "ok" },
      ],
    };

    globalThis.fetch = (() =>
      Promise.resolve(new Response(JSON.stringify(mockResponse), { status: 200 }))) as typeof fetch;

    const results = await searxngProvider.search({ query: "test", numResults: 10 }, searxngCfg);
    assert.equal(results.length, 2);
  });

  it("uses content as snippet", async () => {
    const mockResponse = {
      results: [{ title: "T", url: "https://example.com", content: "Content text" }],
    };

    globalThis.fetch = (() =>
      Promise.resolve(new Response(JSON.stringify(mockResponse), { status: 200 }))) as typeof fetch;

    const results = await searxngProvider.search({ query: "test", numResults: 1 }, searxngCfg);
    assert.equal(results[0].snippet, "Content text");
  });

  it("handles missing results array gracefully", async () => {
    globalThis.fetch = (() =>
      Promise.resolve(new Response(JSON.stringify({}), { status: 200 }))) as typeof fetch;

    const results = await searxngProvider.search({ query: "test", numResults: 5 }, searxngCfg);
    assert.equal(results.length, 0);
  });

  it("uses defaultEngine from config", async () => {
    const customCfg = cfg({
      searxng: { enabled: true, baseUrl: "http://localhost:8888", defaultEngine: "duckduckgo" },
    });
    let capturedUrl = "";

    globalThis.fetch = ((url: string, _opts?: any) => {
      capturedUrl = url;
      return Promise.resolve(
        new Response(JSON.stringify({ results: [] }), { status: 200 })
      );
    }) as typeof fetch;

    await searxngProvider.search({ query: "test", numResults: 1 }, customCfg);

    const parsed = new URL(capturedUrl);
    assert.equal(parsed.searchParams.get("engines"), "duckduckgo");
  });
});

// ---------------------------------------------------------------------------
// search — error handling
// ---------------------------------------------------------------------------

describe("searxng - search: error handling", () => {
  const searxngCfg = cfg({
    searxng: { enabled: true, baseUrl: "http://localhost:8888", defaultEngine: "google" },
  });

  it("throws on HTTP 429 rate limit", async () => {
    globalThis.fetch = (() =>
      Promise.resolve(new Response("Rate limited", { status: 429, statusText: "Too Many Requests" }))) as typeof fetch;

    await assert.rejects(
      () => searxngProvider.search({ query: "test", numResults: 1 }, searxngCfg),
      (error: any) => {
        assert.ok(error.message.includes("429") || error.status === 429);
        return true;
      }
    );
  });

  it("throws on HTTP 500 server error", async () => {
    globalThis.fetch = (() =>
      Promise.resolve(new Response("Internal Error", { status: 500, statusText: "Internal Server Error" }))) as typeof fetch;

    await assert.rejects(
      () => searxngProvider.search({ query: "test", numResults: 1 }, searxngCfg),
      (error: any) => {
        assert.ok(error.message.includes("500") || error.status === 500);
        return true;
      }
    );
  });

  it("propagates network errors", async () => {
    globalThis.fetch = (() => Promise.reject(new Error("ECONNREFUSED"))) as typeof fetch;

    await assert.rejects(
      () => searxngProvider.search({ query: "test", numResults: 1 }, searxngCfg),
      /ECONNREFUSED/
    );
  });
});
