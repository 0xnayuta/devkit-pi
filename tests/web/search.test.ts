import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { mergeConfig } from "../../src/config/load-config.ts";
import { webSearch } from "../../src/modules/web/search.ts";
import type { QueryResultData } from "../../src/modules/web/types.ts";
import { clearResults, getSearchContent } from "../../src/modules/web/storage.ts";

const mergeWebConfig = (config: Parameters<typeof mergeConfig>[0]) => mergeConfig(config).web;

const originalFetch = globalThis.fetch;
const originalApiKey = process.env.BRAVE_SEARCH_API_KEY;
const originalOpenSerpApiKey = process.env.OPENSERP_API_KEY;
const originalTavilyApiKey = process.env.TAVILY_API_KEY;
const originalSerperApiKey = process.env.SERPER_API_KEY;

function braveResponse(urls = ["https://example.com/a", "https://example.com/b"]): Response {
  return new Response(
    JSON.stringify({
      web: {
        results: urls.map((url, i) => ({
          title: `Result ${i + 1}`,
          url,
          description: `Snippet ${i + 1}`,
          ...(i === 0 ? { profile: { name: "Example" } } : {}),
        })),
      },
    }),
    {
      status: 200,
      headers: { "content-type": "application/json" },
    }
  );
}

function mockBraveFetch(calls: string[]) {
  globalThis.fetch = ((input: string | URL) => {
    calls.push(String(input));
    return Promise.resolve(braveResponse());
  }) as typeof fetch;
}

describe("web_search", () => {
  beforeEach(() => {
    clearResults();
    process.env.BRAVE_SEARCH_API_KEY = "test-key";
    delete process.env.OPENSERP_API_KEY;
    delete process.env.TAVILY_API_KEY;
    delete process.env.SERPER_API_KEY;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalApiKey === undefined) {
      delete process.env.BRAVE_SEARCH_API_KEY;
    } else {
      process.env.BRAVE_SEARCH_API_KEY = originalApiKey;
    }

    if (originalOpenSerpApiKey === undefined) {
      delete process.env.OPENSERP_API_KEY;
    } else {
      process.env.OPENSERP_API_KEY = originalOpenSerpApiKey;
    }

    if (originalTavilyApiKey === undefined) {
      delete process.env.TAVILY_API_KEY;
    } else {
      process.env.TAVILY_API_KEY = originalTavilyApiKey;
    }

    if (originalSerperApiKey === undefined) {
      delete process.env.SERPER_API_KEY;
    } else {
      process.env.SERPER_API_KEY = originalSerperApiKey;
    }
  });

  it("returns a structured error when query is missing", async () => {
    const result = await webSearch({}, mergeWebConfig({}));
    assert.deepEqual(result, {
      error: {
        code: "WEB_SEARCH_INVALID_QUERY",
        message: "web_search requires a non-empty query or queries",
      },
    });
  });

  it("rejects unsupported provider values at runtime", async () => {
    const config = mergeWebConfig({});
    const result = await webSearch(
      { query: "typescript" },
      {
        ...config,
        provider: "duckduckgo" as any,
      }
    );
    assert.equal("error" in result, true);
    if ("error" in result) {
      assert.equal(result.error.code, "INVALID_INPUT");
      assert.match(result.error.message, /Unsupported web_search provider/);
    }
  });

  it("requires BRAVE_SEARCH_API_KEY for brave provider", async () => {
    delete process.env.BRAVE_SEARCH_API_KEY;
    const result = await webSearch(
      { query: "typescript" },
      mergeWebConfig({ web: { provider: "brave", brave: { enabled: true } } })
    );
    assert.equal("error" in result, true);
    if ("error" in result) {
      assert.equal(result.error.code, "PROVIDER_AUTH_FAILED");
      assert.match(result.error.message, /authentication/i);
    }
  });

  it("uses ddgs fallback in auto mode when BRAVE_SEARCH_API_KEY is missing", async () => {
    delete process.env.BRAVE_SEARCH_API_KEY;

    const calls: string[] = [];
    globalThis.fetch = ((input: string | URL) => {
      calls.push(String(input));
      return Promise.resolve(
        new Response(
          `<html><body>
            <a href="/settings">Settings</a>
            <a href="https://duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fa">Result A</a>
            <a href="https://duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fb">Result B</a>
          </body></html>`,
          { status: 200, headers: { "content-type": "text/html" } }
        )
      );
    }) as typeof fetch;

    const result = await webSearch(
      { query: "typescript", numResults: 2 },
      mergeWebConfig({ web: { provider: "auto" } })
    );

    assert.equal("responseId" in result, true);
    if ("responseId" in result) {
      assert.equal(calls.length, 1);
      assert.match(calls[0], /lite\.duckduckgo\.com\/lite\//);
      assert.equal(result.queries[0].results.length, 2);
      assert.equal(result.queries[0].results[0].url, "https://example.com/a");
      assert.equal(result.queries[0].results[0].source, "fallback");
    }
  });

  it("prefers keyed commercial providers in auto mode", async () => {
    process.env.TAVILY_API_KEY = "tavily-test-key";

    const calls: string[] = [];
    globalThis.fetch = ((input: string | URL, init?: RequestInit) => {
      calls.push(String(input));
      assert.equal(init?.method, "POST");
      return Promise.resolve(
        new Response(
          JSON.stringify({
            results: [
              {
                title: "Tavily Result",
                url: "https://example.com/tavily-auto",
                content: "Tavily Snippet",
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      );
    }) as typeof fetch;

    const result = await webSearch(
      { query: "typescript", numResults: 1 },
      mergeWebConfig({ web: { provider: "auto", tavily: { enabled: true } } })
    );

    assert.equal("responseId" in result, true);
    if ("responseId" in result) {
      assert.equal(calls.length, 1);
      assert.match(calls[0], /api\.tavily\.com\/search/);
      assert.equal(result.queries[0].results[0].source, "tavily");
    }
  });

  it("classifies commercial provider missing key as auth required", async () => {
    delete process.env.TAVILY_API_KEY;

    const result = await webSearch(
      { query: "typescript", numResults: 1 },
      mergeWebConfig({ web: { provider: "tavily", tavily: { enabled: true } } })
    );

    assert.equal("error" in result, true);
    if ("error" in result) {
      assert.equal(result.error.code, "PROVIDER_AUTH_FAILED");
      assert.match(result.error.message, /authentication/i);
    }
  });

  it("returns actionable error when explicit provider is unavailable", async () => {
    delete process.env.OPENSERP_API_KEY;

    const result = await webSearch(
      { query: "typescript", numResults: 1 },
      mergeWebConfig({ web: { provider: "openserp" } })
    );

    assert.equal("error" in result, true);
    if ("error" in result) {
      assert.equal(result.error.code, "INVALID_INPUT");
      assert.match(result.error.message, /unavailable/i);
    }
  });

  it("respects auto providerPriority order", async () => {
    delete process.env.BRAVE_SEARCH_API_KEY;

    const calls: string[] = [];
    globalThis.fetch = ((input: string | URL) => {
      calls.push(String(input));
      if (String(input).includes("127.0.0.1:8080")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              results: [{ title: "SearXNG", url: "https://example.com/priority", content: "ok" }],
            }),
            { status: 200, headers: { "content-type": "application/json" } }
          )
        );
      }
      return Promise.resolve(new Response("not found", { status: 404 }));
    }) as typeof fetch;

    const result = await webSearch(
      { query: "typescript", numResults: 1 },
      mergeWebConfig({
        web: {
          provider: "auto",
          providerPriority: ["searxng", "ddgs"],
          searxng: { enabled: true, baseUrl: "http://127.0.0.1:8080" },
        },
      })
    );

    assert.equal("responseId" in result, true);
    if ("responseId" in result) {
      assert.match(calls[0], /127\.0\.0\.1:8080/);
      assert.equal(result.queries[0].results[0].url, "https://example.com/priority");
    }
  });

  it("normalizes multiple queries and stores search results", async () => {
    const calls: string[] = [];
    mockBraveFetch(calls);

    const result = await webSearch(
      { query: "typescript", queries: ["typescript", "node"], numResults: 2 },
      mergeWebConfig({ web: { provider: "brave", brave: { enabled: true } } })
    );

    assert.equal("responseId" in result, true);
    if ("responseId" in result) {
      assert.equal(result.queries.length, 2);
      assert.equal(result.queries[0].query, "typescript");
      assert.equal(result.queries[0].results.length, 2);
      assert.equal(result.queries[0].results[0].source, "brave");
      assert.equal(calls.length, 2);

      const stored = getSearchContent({ responseId: result.responseId, query: "node" }, 30_000);
      assert.equal("result" in stored, true);
      if ("result" in stored) {
        assert.equal((stored.result as QueryResultData).query, "node");
      }
    }
  });

  it("stores fetched content when includeContent is true", async () => {
    globalThis.fetch = ((input: string | URL) => {
      const url = String(input);
      if (url.startsWith("https://api.search.brave.com/")) {
        return Promise.resolve(braveResponse(["https://93.184.216.34/a", "https://93.184.216.34/b"]));
      }
      return Promise.resolve(
        new Response("<html><head><title>Fetched</title></head><body>Fetched content</body></html>", {
          status: 200,
          headers: { "content-type": "text/html" },
        })
      );
    }) as typeof fetch;

    const result = await webSearch(
      { query: "typescript", numResults: 1, includeContent: true },
      mergeWebConfig({ web: { provider: "brave", brave: { enabled: true }, maxContentChars: 7 } })
    );

    assert.equal("responseId" in result, true);
    if ("responseId" in result) {
      assert.equal(result.queries[0].results[0].content?.title, "Fetched");
      assert.equal(result.queries[0].results[0].content?.content, "Fetched");
      assert.equal(result.queries[0].results[0].content?.truncated, true);
    }
  });

  it("classifies provider rate limit errors", async () => {
    globalThis.fetch = (() =>
      Promise.resolve(new Response("Too Many Requests", { status: 429, statusText: "Too Many Requests" }))) as typeof fetch;

    const result = await webSearch(
      { query: "typescript" },
      mergeWebConfig({ web: { provider: "brave", brave: { enabled: true } } })
    );
    assert.equal("error" in result, true);
    if ("error" in result) {
      assert.equal(result.error.code, "PROVIDER_RATE_LIMITED");
      assert.match(result.error.message, /429/);
    }
  });

  it("classifies timeout/abort with actionable guidance", async () => {
    globalThis.fetch = (() =>
      new Promise((_resolve, reject) => {
        setTimeout(() => reject(new DOMException("The operation was aborted", "AbortError")), 5);
      })) as typeof fetch;

    const result = await webSearch(
      { query: "typescript" },
      mergeWebConfig({ web: { provider: "brave", brave: { enabled: true }, timeoutMs: 1 } })
    );
    assert.equal("error" in result, true);
    if ("error" in result) {
      assert.equal(result.error.code, "WEB_SEARCH_TIMEOUT");
      assert.match(result.error.message, /fewer queries|timeoutMs/i);
    }
  });

  it("limits includeContent fetch concurrency", async () => {
    let active = 0;
    let maxActive = 0;

    globalThis.fetch = ((input: string | URL) => {
      const url = String(input);
      if (url.startsWith("https://api.search.brave.com/")) {
        return Promise.resolve(
          braveResponse([
            "https://93.184.216.34/a",
            "https://93.184.216.34/b",
            "https://93.184.216.34/c",
            "https://93.184.216.34/d",
            "https://93.184.216.34/e",
          ])
        );
      }

      active += 1;
      maxActive = Math.max(maxActive, active);
      return new Promise((resolve) => {
        setTimeout(() => {
          active -= 1;
          resolve(
            new Response("<html><body>content</body></html>", {
              status: 200,
              headers: { "content-type": "text/html" },
            })
          );
        }, 15);
      });
    }) as typeof fetch;

    const result = await webSearch(
      { query: "typescript", numResults: 5, includeContent: true },
      mergeWebConfig({ web: { provider: "brave", brave: { enabled: true } } })
    );

    assert.equal("responseId" in result, true);
    assert.equal(maxActive <= 3, true);
    assert.equal(maxActive >= 2, true);
  });

  // ============================================================================
  // A.1: Single query zero-config (out-of-the-box DDGS)
  // ============================================================================

  it("uses ddgs by default when no commercial keys are set", async () => {
    delete process.env.BRAVE_SEARCH_API_KEY;
    delete process.env.TAVILY_API_KEY;
    delete process.env.SERPER_API_KEY;

    const calls: string[] = [];
    globalThis.fetch = ((input: string | URL) => {
      calls.push(String(input));
      return Promise.resolve(
        new Response(
          `<html><body>
            <a href="https://duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fdefault">Default Result</a>
          </body></html>`,
          { status: 200, headers: { "content-type": "text/html" } }
        )
      );
    }) as typeof fetch;

    // Use default config (no explicit provider)
    const result = await webSearch({ query: "typescript" }, mergeWebConfig({}));

    assert.equal("responseId" in result, true);
    if ("responseId" in result) {
      assert.match(calls[0], /lite\.duckduckgo\.com\/lite\//);
      assert.equal(result.queries[0].results[0].source, "fallback");
    }
  });

  it("treats no search results as a successful empty result", async () => {
    globalThis.fetch = (() =>
      Promise.resolve(
        new Response("<html><body>No results</body></html>", {
          status: 200,
          headers: { "content-type": "text/html" },
        })
      )) as typeof fetch;

    const result = await webSearch(
      { query: "unlikely empty query" },
      mergeWebConfig({ web: { provider: "ddgs" } })
    );

    assert.equal("responseId" in result, true);
    if ("responseId" in result) {
      assert.deepEqual(result.queries[0].results, []);
    }
  });

  // ============================================================================
  // B.4: SearXNG provider missing endpoint
  // ============================================================================

  it("rejects searxng provider when enabled but baseUrl is not configured", async () => {
    const result = await webSearch(
      { query: "typescript" },
      mergeWebConfig({ web: { provider: "searxng", searxng: { enabled: true } } })
    );

    assert.equal("error" in result, true);
    if ("error" in result) {
      assert.equal(result.error.code, "INVALID_INPUT");
      assert.match(result.error.message, /baseUrl/i);
    }
  });

  // ============================================================================
  // C.4: Explicit provider does not fall back
  // ============================================================================

  it("does not fall back to ddgs when explicit provider fails", async () => {
    const calls: string[] = [];
    globalThis.fetch = ((input: string | URL) => {
      calls.push(String(input));
      throw new Error("Connection refused");
    }) as typeof fetch;

    const result = await webSearch(
      { query: "typescript" },
      mergeWebConfig({
        web: {
          provider: "searxng",
          searxng: { enabled: true, baseUrl: "http://127.0.0.1:9999" },
        },
      })
    );

    assert.equal("error" in result, true);
    assert.equal(calls.length, 1);
    assert.match(calls[0], /127\.0\.0\.1:9999/);
  });

  // ============================================================================
  // C.5: DDGS result count upper limit protection
  // ============================================================================

  it("caps ddgs results at 5 regardless of numResults request", async () => {
    const calls: string[] = [];
    globalThis.fetch = ((input: string | URL) => {
      calls.push(String(input));
      // Simulate ddgs returning many links
      const manyLinks = Array.from({ length: 10 }, (_, i) =>
        `<a href="https://duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2F${i}">Result ${i}</a>`
      ).join("");
      return Promise.resolve(
        new Response(`<html><body>${manyLinks}</body></html>`, {
          status: 200,
          headers: { "content-type": "text/html" },
        })
      );
    }) as typeof fetch;

    const result = await webSearch(
      { query: "typescript", numResults: 10 },
      mergeWebConfig({ web: { provider: "ddgs" } })
    );

    assert.equal("responseId" in result, true);
    if ("responseId" in result) {
      // DDGS hard cap is 5, so at most 5 results regardless of numResults: 10
      assert.ok(result.queries[0].results.length <= 5);
      assert.equal(result.queries[0].results.length, 5);
    }
  });

  it("ddgs respects numResults when less than max cap", async () => {
    globalThis.fetch = (() =>
      Promise.resolve(
        new Response(
          `<html><body>
            <a href="https://duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2F1">Result 1</a>
            <a href="https://duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2F2">Result 2</a>
            <a href="https://duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2F3">Result 3</a>
          </body></html>`,
          { status: 200, headers: { "content-type": "text/html" } }
        )
      )) as typeof fetch;

    const result = await webSearch(
      { query: "typescript", numResults: 3 },
      mergeWebConfig({ web: { provider: "ddgs" } })
    );

    assert.equal("responseId" in result, true);
    if ("responseId" in result) {
      assert.equal(result.queries[0].results.length, 3);
    }
  });
});
