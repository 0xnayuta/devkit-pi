/**
 * Brave Provider Tests
 * Phase 3 — Brave Search API provider
 */

import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { mergeConfig } from "../../../src/config/load-config.ts";
import {
  braveProvider,
  getBraveApiKey,
} from "../../../src/modules/web/providers/brave.ts";
import { resetConnectionPool } from "../../../src/modules/web/http-pool.ts";

const originalFetch = globalThis.fetch;
const webConfig = mergeConfig({}).web;
const ENV_KEY = "BRAVE_SEARCH_API_KEY";

function setApiKey(value: string | undefined) {
  if (value === undefined) delete process.env[ENV_KEY];
  else process.env[ENV_KEY] = value;
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  resetConnectionPool();
  delete process.env[ENV_KEY];
});

// ---------------------------------------------------------------------------
// name
// ---------------------------------------------------------------------------

describe("brave - name", () => {
  it('has name "brave"', () => {
    assert.equal(braveProvider.name, "brave");
  });
});

// ---------------------------------------------------------------------------
// getBraveApiKey
// ---------------------------------------------------------------------------

describe("brave - getBraveApiKey", () => {
  it("returns undefined when env var is not set", () => {
    delete process.env[ENV_KEY];
    assert.equal(getBraveApiKey(), undefined);
  });

  it("returns undefined when env var is empty string", () => {
    process.env[ENV_KEY] = "";
    assert.equal(getBraveApiKey(), undefined);
  });

  it("returns undefined when env var is whitespace only", () => {
    process.env[ENV_KEY] = "   ";
    assert.equal(getBraveApiKey(), undefined);
  });

  it("returns trimmed key when env var is set", () => {
    process.env[ENV_KEY] = "  my-api-key  ";
    assert.equal(getBraveApiKey(), "my-api-key");
  });
});

// ---------------------------------------------------------------------------
// isAvailable
// ---------------------------------------------------------------------------

describe("brave - isAvailable", () => {
  it("returns false when API key is not set", () => {
    delete process.env[ENV_KEY];
    assert.equal(braveProvider.isAvailable!(webConfig), false);
  });

  it("returns true when API key is set", () => {
    process.env[ENV_KEY] = "test-key";
    assert.equal(braveProvider.isAvailable!(webConfig), true);
  });

  it("returns false when API key is whitespace only", () => {
    process.env[ENV_KEY] = "   ";
    assert.equal(braveProvider.isAvailable!(webConfig), false);
  });
});

// ---------------------------------------------------------------------------
// search — happy path
// ---------------------------------------------------------------------------

describe("brave - search: happy path", () => {
  it("returns parsed results from Brave API response", async () => {
    setApiKey("test-key");

    const mockResponse = {
      web: {
        results: [
          { title: "Result 1", url: "https://example.com/1", description: "Snippet 1" },
          { title: "Result 2", url: "https://example.com/2", description: "Snippet 2" },
        ],
      },
    };

    globalThis.fetch = (() =>
      Promise.resolve(
        new Response(JSON.stringify(mockResponse), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      )) as typeof fetch;

    const results = await braveProvider.search({ query: "test", numResults: 5 }, webConfig);
    assert.equal(results.length, 2);
    assert.equal(results[0].title, "Result 1");
    assert.equal(results[0].url, "https://example.com/1");
    assert.equal(results[0].snippet, "Snippet 1");
    assert.equal(results[0].source, "brave");
  });

  it("sends correct request headers", async () => {
    setApiKey("my-secret-key");
    let capturedHeaders: Record<string, string> = {};

    globalThis.fetch = ((_url: string, opts?: any) => {
      capturedHeaders = opts?.headers ?? {};
      return Promise.resolve(
        new Response(JSON.stringify({ web: { results: [] } }), { status: 200 })
      );
    }) as typeof fetch;

    await braveProvider.search({ query: "hello", numResults: 3 }, webConfig);

    assert.equal(capturedHeaders["x-subscription-token"], "my-secret-key");
    assert.ok(capturedHeaders["accept"]?.includes("application/json"));
  });

  it("includes query and count in URL params", async () => {
    setApiKey("test-key");
    let capturedUrl = "";

    globalThis.fetch = ((url: string, _opts?: any) => {
      capturedUrl = url;
      return Promise.resolve(
        new Response(JSON.stringify({ web: { results: [] } }), { status: 200 })
      );
    }) as typeof fetch;

    await braveProvider.search({ query: "brave search", numResults: 7 }, webConfig);

    const parsed = new URL(capturedUrl);
    assert.equal(parsed.searchParams.get("q"), "brave search");
    assert.equal(parsed.searchParams.get("count"), "7");
  });

  it("respects numResults limit", async () => {
    setApiKey("test-key");
    const results = Array.from({ length: 10 }, (_, i) => ({
      title: `R${i}`,
      url: `https://example.com/${i}`,
      description: `S${i}`,
    }));

    globalThis.fetch = (() =>
      Promise.resolve(
        new Response(JSON.stringify({ web: { results } }), { status: 200 })
      )) as typeof fetch;

    const items = await braveProvider.search({ query: "test", numResults: 3 }, webConfig);
    assert.ok(items.length <= 3);
  });

  it("filters out items without url or title", async () => {
    setApiKey("test-key");
    const mockResponse = {
      web: {
        results: [
          { title: "Valid", url: "https://example.com/valid" },
          { url: "https://example.com/no-title" },  // no title
          { title: "No URL" },  // no url
          { title: "Good", url: "https://example.com/good" },
        ],
      },
    };

    globalThis.fetch = (() =>
      Promise.resolve(
        new Response(JSON.stringify(mockResponse), { status: 200 })
      )) as typeof fetch;

    const results = await braveProvider.search({ query: "test", numResults: 10 }, webConfig);
    assert.equal(results.length, 2);
    assert.equal(results[0].title, "Valid");
    assert.equal(results[1].title, "Good");
  });

  it("uses description as snippet", async () => {
    setApiKey("test-key");
    const mockResponse = {
      web: { results: [{ title: "T", url: "https://example.com", description: "Desc text" }] },
    };

    globalThis.fetch = (() =>
      Promise.resolve(new Response(JSON.stringify(mockResponse), { status: 200 }))) as typeof fetch;

    const results = await braveProvider.search({ query: "test", numResults: 1 }, webConfig);
    assert.equal(results[0].snippet, "Desc text");
  });

  it("handles missing web.results gracefully", async () => {
    setApiKey("test-key");

    globalThis.fetch = (() =>
      Promise.resolve(new Response(JSON.stringify({}), { status: 200 }))) as typeof fetch;

    const results = await braveProvider.search({ query: "test", numResults: 5 }, webConfig);
    assert.equal(results.length, 0);
  });
});

// ---------------------------------------------------------------------------
// search — error handling
// ---------------------------------------------------------------------------

describe("brave - search: error handling", () => {
  it("throws on HTTP 429 rate limit", async () => {
    setApiKey("test-key");

    globalThis.fetch = (() =>
      Promise.resolve(new Response("Rate limited", { status: 429, statusText: "Too Many Requests" }))) as typeof fetch;

    await assert.rejects(
      () => braveProvider.search({ query: "test", numResults: 1 }, webConfig),
      (error: any) => {
        assert.ok(error.message.includes("429") || error.status === 429);
        return true;
      }
    );
  });

  it("throws on HTTP 401 unauthorized", async () => {
    setApiKey("bad-key");

    globalThis.fetch = (() =>
      Promise.resolve(new Response("Unauthorized", { status: 401, statusText: "Unauthorized" }))) as typeof fetch;

    await assert.rejects(
      () => braveProvider.search({ query: "test", numResults: 1 }, webConfig),
      (error: any) => {
        assert.ok(error.message.includes("401") || error.status === 401);
        return true;
      }
    );
  });

  it("propagates network errors", async () => {
    setApiKey("test-key");
    globalThis.fetch = (() => Promise.reject(new Error("ECONNREFUSED"))) as typeof fetch;

    await assert.rejects(
      () => braveProvider.search({ query: "test", numResults: 1 }, webConfig),
      /ECONNREFUSED/
    );
  });
});
