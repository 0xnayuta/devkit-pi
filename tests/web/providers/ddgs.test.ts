/**
 * DDGS Provider Tests
 * Phase 2 — DuckDuckGo Lite search provider
 */

import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { mergeConfig } from "../../../src/config/load-config.ts";
import { ddgsProvider } from "../../../src/modules/web/providers/ddgs.ts";
import { resetConnectionPool } from "../../../src/modules/web/http-pool.ts";

const originalFetch = globalThis.fetch;
const webConfig = mergeConfig({}).web;

// Mock HTML with DDG Lite-style redirect anchors
function mockDdgHtml(results: { title: string; url: string }[]): string {
  return results
    .map(
      ({ title, url }) =>
        `<a href="https://duckduckgo.com/l/?uddg=${encodeURIComponent(url)}&amp;rut=abc123">${title}</a>`
    )
    .join("\n");
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  resetConnectionPool();
});

// ---------------------------------------------------------------------------
// isAvailable
// ---------------------------------------------------------------------------

describe("ddgs - isAvailable", () => {
  it("always returns true", () => {
    assert.equal(ddgsProvider.isAvailable!({} as any), true);
  });

  it("always returns true regardless of config", () => {
    assert.equal(ddgsProvider.isAvailable!(webConfig), true);
  });
});

// ---------------------------------------------------------------------------
// name
// ---------------------------------------------------------------------------

describe("ddgs - name", () => {
  it('has name "ddgs"', () => {
    assert.equal(ddgsProvider.name, "ddgs");
  });
});

// ---------------------------------------------------------------------------
// search — happy path
// ---------------------------------------------------------------------------

describe("ddgs - search: happy path", () => {
  it("returns parsed results from DDG Lite HTML", async () => {
    const html = mockDdgHtml([
      { title: "Example Domain", url: "https://example.com/" },
      { title: "Test Page", url: "https://example.com/test" },
    ]);

    globalThis.fetch = (() =>
      Promise.resolve(new Response(html, { status: 200 }))) as typeof fetch;

    const results = await ddgsProvider.search({ query: "test", numResults: 5 }, webConfig);
    assert.equal(results.length, 2);
    assert.equal(results[0].title, "Example Domain");
    assert.equal(results[0].url, "https://example.com/");
    assert.equal(results[0].source, "fallback");
    assert.equal(results[1].title, "Test Page");
    assert.equal(results[1].url, "https://example.com/test");
  });

  it("respects numResults limit", async () => {
    const html = mockDdgHtml([
      { title: "Result 1", url: "https://example.com/1" },
      { title: "Result 2", url: "https://example.com/2" },
      { title: "Result 3", url: "https://example.com/3" },
    ]);

    globalThis.fetch = (() =>
      Promise.resolve(new Response(html, { status: 200 }))) as typeof fetch;

    const results = await ddgsProvider.search({ query: "test", numResults: 2 }, webConfig);
    assert.ok(results.length <= 2);
  });

  it("caps results at DDGS_MAX_RESULTS (5)", async () => {
    const items = Array.from({ length: 10 }, (_, i) => ({
      title: `Result ${i + 1}`,
      url: `https://example.com/${i + 1}`,
    }));
    const html = mockDdgHtml(items);

    globalThis.fetch = (() =>
      Promise.resolve(new Response(html, { status: 200 }))) as typeof fetch;

    const results = await ddgsProvider.search({ query: "test", numResults: 10 }, webConfig);
    assert.ok(results.length <= 5);
  });

  it("sends correct request to DDG Lite endpoint", async () => {
    let capturedUrl: string | undefined;
    let capturedMethod: string | undefined;
    let capturedAccept: string | undefined;

    globalThis.fetch = ((url: string, opts?: any) => {
      capturedUrl = url;
      capturedMethod = opts?.method;
      capturedAccept = opts?.headers?.accept;
      return Promise.resolve(new Response("<html></html>", { status: 200 }));
    }) as typeof fetch;

    await ddgsProvider.search({ query: "hello world", numResults: 3 }, webConfig);

    assert.ok(capturedUrl?.includes("lite.duckduckgo.com/lite/"));
    assert.ok(capturedUrl?.includes("q=hello+world"));
    assert.equal(capturedMethod, "GET");
    assert.ok(capturedAccept?.includes("text/html"));
  });
});

// ---------------------------------------------------------------------------
// search — error handling
// ---------------------------------------------------------------------------

describe("ddgs - search: error handling", () => {
  it("throws on HTTP error responses", async () => {
    globalThis.fetch = (() =>
      Promise.resolve(
        new Response("Rate limited", { status: 429, statusText: "Too Many Requests" })
      )) as typeof fetch;

    await assert.rejects(
      () => ddgsProvider.search({ query: "test", numResults: 1 }, webConfig),
      (error: any) => {
        assert.ok(error instanceof Error);
        assert.ok(error.message.includes("429") || error.status === 429);
        return true;
      }
    );
  });

  it("throws on 500 server error", async () => {
    globalThis.fetch = (() =>
      Promise.resolve(
        new Response("Internal Server Error", { status: 500, statusText: "Internal Server Error" })
      )) as typeof fetch;

    await assert.rejects(
      () => ddgsProvider.search({ query: "test", numResults: 1 }, webConfig),
      (error: any) => {
        assert.ok(error.message.includes("500") || error.status === 500);
        return true;
      }
    );
  });

  it("propagates network errors", async () => {
    globalThis.fetch = (() => Promise.reject(new Error("ECONNREFUSED"))) as typeof fetch;

    await assert.rejects(
      () => ddgsProvider.search({ query: "test", numResults: 1 }, webConfig),
      /ECONNREFUSED/
    );
  });

  it("propagates abort errors", async () => {
    globalThis.fetch = (() =>
      Promise.reject(new DOMException("The operation was aborted", "AbortError"))) as typeof fetch;

    await assert.rejects(
      () => ddgsProvider.search({ query: "test", numResults: 1 }, webConfig),
      /aborted/i
    );
  });
});

// ---------------------------------------------------------------------------
// search — HTML parsing edge cases
// ---------------------------------------------------------------------------

describe("ddgs - search: HTML parsing", () => {
  it("returns empty array for HTML with no anchors", async () => {
    globalThis.fetch = (() =>
      Promise.resolve(new Response("<html><body>No results</body></html>", { status: 200 }))) as typeof fetch;

    const results = await ddgsProvider.search({ query: "nonexistent", numResults: 5 }, webConfig);
    assert.equal(results.length, 0);
  });

  it("skips anchors without valid URLs", async () => {
    const html = `
      <a href="/relative/path">No URL</a>
      <a href="https://duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fvalid&amp;rut=abc">Valid</a>
    `;

    globalThis.fetch = (() =>
      Promise.resolve(new Response(html, { status: 200 }))) as typeof fetch;

    const results = await ddgsProvider.search({ query: "test", numResults: 5 }, webConfig);
    assert.equal(results.length, 1);
    assert.equal(results[0].url, "https://example.com/valid");
  });

  it("deduplicates URLs", async () => {
    const html = `
      <a href="https://duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fsame&amp;rut=abc">First</a>
      <a href="https://duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fsame&amp;rut=def">Duplicate</a>
      <a href="https://duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fother&amp;rut=ghi">Other</a>
    `;

    globalThis.fetch = (() =>
      Promise.resolve(new Response(html, { status: 200 }))) as typeof fetch;

    const results = await ddgsProvider.search({ query: "test", numResults: 5 }, webConfig);
    assert.equal(results.length, 2);
    assert.equal(results[0].url, "https://example.com/same");
    assert.equal(results[1].url, "https://example.com/other");
  });

  it("decodes HTML entities in titles", async () => {
    const html = `<a href="https://duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2F&amp;rut=abc">Tom &amp; Jerry&#39;s Page</a>`;

    globalThis.fetch = (() =>
      Promise.resolve(new Response(html, { status: 200 }))) as typeof fetch;

    const results = await ddgsProvider.search({ query: "test", numResults: 5 }, webConfig);
    assert.equal(results.length, 1);
    assert.equal(results[0].title, "Tom & Jerry's Page");
  });

  it("skips anchors with empty titles", async () => {
    const html = `
      <a href="https://duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2F1&amp;rut=abc"></a>
      <a href="https://duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2F2&amp;rut=def">Has Title</a>
    `;

    globalThis.fetch = (() =>
      Promise.resolve(new Response(html, { status: 200 }))) as typeof fetch;

    const results = await ddgsProvider.search({ query: "test", numResults: 5 }, webConfig);
    assert.equal(results.length, 1);
    assert.equal(results[0].title, "Has Title");
  });

  it("decodes uddg parameter to get real URL", async () => {
    const realUrl = "https://www.example.com/path?q=hello&lang=en";
    const html = `<a href="https://duckduckgo.com/l/?uddg=${encodeURIComponent(realUrl)}&amp;rut=abc">Link</a>`;

    globalThis.fetch = (() =>
      Promise.resolve(new Response(html, { status: 200 }))) as typeof fetch;

    const results = await ddgsProvider.search({ query: "test", numResults: 5 }, webConfig);
    assert.equal(results.length, 1);
    assert.equal(results[0].url, realUrl);
  });
});
