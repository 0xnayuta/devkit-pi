/**
 * Brave Provider Tests
 * Phase 3 — Brave Search API provider
 */

import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { mergeConfig } from "../../../src/config/load-config.ts";
import type { ResolvedWebConfig } from "../../../shared/types.ts";
import { braveProvider } from "../../../src/modules/web/providers/brave.ts";
import { resetConnectionPool } from "../../../src/modules/web/http-pool.ts";

const originalFetch = globalThis.fetch;
const ENV_KEY = "BRAVE_SEARCH_API_KEY";

function config(overrides: Partial<ResolvedWebConfig> = {}): ResolvedWebConfig {
  return { ...mergeConfig({}).web, ...overrides };
}

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
// isAvailable
// ---------------------------------------------------------------------------

describe("brave - isAvailable", () => {
  // NOTE: brave.isAvailable does NOT check config.brave.enabled.
  // The enabled gate is handled at the selectSearchProvider level.
  it("returns true even when disabled, if baseUrl and key are valid", () => {
    setApiKey("test-key");
    assert.equal(
      braveProvider.isAvailable!(
        config({ brave: { enabled: false, baseUrl: "https://api.search.brave.com/res/v1/web/search", apiKeyEnv: ENV_KEY } })
      ),
      true
    );
  });

  it("returns false when API key is missing", () => {
    delete process.env[ENV_KEY];
    assert.equal(
      braveProvider.isAvailable!(
        config({ brave: { enabled: true, baseUrl: "https://api.search.brave.com/res/v1/web/search", apiKeyEnv: ENV_KEY } })
      ),
      false
    );
  });

  it("returns false when baseUrl is invalid", () => {
    setApiKey("test-key");
    assert.equal(
      braveProvider.isAvailable!(
        config({ brave: { enabled: true, baseUrl: "not-a-url", apiKeyEnv: ENV_KEY } })
      ),
      false
    );
  });

  it("returns false when baseUrl has non-http protocol", () => {
    setApiKey("test-key");
    assert.equal(
      braveProvider.isAvailable!(
        config({ brave: { enabled: true, baseUrl: "ftp://api.search.brave.com/res/v1/web/search", apiKeyEnv: ENV_KEY } })
      ),
      false
    );
  });

  it("returns true when enabled, valid baseUrl, and API key set", () => {
    setApiKey("test-key");
    assert.equal(
      braveProvider.isAvailable!(
        config({ brave: { enabled: true, baseUrl: "https://api.search.brave.com/res/v1/web/search", apiKeyEnv: ENV_KEY } })
      ),
      true
    );
  });

  it("returns true with http:// baseUrl", () => {
    setApiKey("test-key");
    assert.equal(
      braveProvider.isAvailable!(
        config({ brave: { enabled: true, baseUrl: "http://localhost:8080/search", apiKeyEnv: ENV_KEY } })
      ),
      true
    );
  });
});

// ---------------------------------------------------------------------------
// search — happy path
// ---------------------------------------------------------------------------

describe("brave - search: happy path", () => {
  const braveConfig = config({
    brave: { enabled: true, baseUrl: "https://api.search.brave.com/res/v1/web/search", apiKeyEnv: ENV_KEY },
  });

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
        new Response(JSON.stringify(mockResponse), { status: 200, headers: { "content-type": "application/json" } })
      )) as typeof fetch;

    const results = await braveProvider.search({ query: "test", numResults: 5 }, braveConfig);
    assert.equal(results.length, 2);
    assert.equal(results[0].title, "Result 1");
    assert.equal(results[0].url, "https://example.com/1");
    assert.equal(results[0].snippet, "Snippet 1");
    assert.equal(results[0].source, "brave");
  });

  it("sends GET request with correct query params", async () => {
    setApiKey("my-key");
    let capturedUrl = "";

    globalThis.fetch = ((url: string, _opts?: any) => {
      capturedUrl = String(url);
      return Promise.resolve(
        new Response(JSON.stringify({ web: { results: [] } }), { status: 200 })
      );
    }) as typeof fetch;

    await braveProvider.search({ query: "hello", numResults: 3 }, braveConfig);

    const parsed = new URL(capturedUrl);
    assert.equal(parsed.searchParams.get("q"), "hello");
    assert.equal(parsed.searchParams.get("count"), "3");
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

    await braveProvider.search({ query: "hello", numResults: 3 }, braveConfig);

    assert.equal(capturedHeaders["x-subscription-token"], "my-secret-key");
    assert.ok(capturedHeaders["accept"]?.includes("application/json"));
  });

  it("respects numResults limit", async () => {
    setApiKey("test-key");
    const results = Array.from({ length: 10 }, (_, i) => ({
      title: `R${i}`,
      url: `https://example.com/${i}`,
      description: `S${i}`,
    }));

    globalThis.fetch = (() =>
      Promise.resolve(new Response(JSON.stringify({ web: { results } }), { status: 200 }))) as typeof fetch;

    const items = await braveProvider.search({ query: "test", numResults: 3 }, braveConfig);
    assert.ok(items.length <= 3);
  });

  it("filters out items without url or title", async () => {
    setApiKey("test-key");
    const mockResponse = {
      web: {
        results: [
          { title: "Valid", url: "https://example.com/valid" },
          { url: "https://example.com/no-title" },
          { title: "No URL" },
          { title: "Good", url: "https://example.com/good" },
        ],
      },
    };

    globalThis.fetch = (() =>
      Promise.resolve(new Response(JSON.stringify(mockResponse), { status: 200 }))) as typeof fetch;

    const results = await braveProvider.search({ query: "test", numResults: 10 }, braveConfig);
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

    const results = await braveProvider.search({ query: "test", numResults: 1 }, braveConfig);
    assert.equal(results[0].snippet, "Desc text");
  });

  it("handles missing web.results gracefully", async () => {
    setApiKey("test-key");

    globalThis.fetch = (() =>
      Promise.resolve(new Response(JSON.stringify({}), { status: 200 }))) as typeof fetch;

    const results = await braveProvider.search({ query: "test", numResults: 5 }, braveConfig);
    assert.equal(results.length, 0);
  });
});

// ---------------------------------------------------------------------------
// search — error handling
// ---------------------------------------------------------------------------

describe("brave - search: error handling", () => {
  const braveConfig = config({
    brave: { enabled: true, baseUrl: "https://api.search.brave.com/res/v1/web/search", apiKeyEnv: ENV_KEY },
  });

  it("throws on HTTP 429 rate limit", async () => {
    setApiKey("test-key");

    globalThis.fetch = (() =>
      Promise.resolve(new Response("Rate limited", { status: 429, statusText: "Too Many Requests" }))) as typeof fetch;

    await assert.rejects(
      () => braveProvider.search({ query: "test", numResults: 1 }, braveConfig),
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
      () => braveProvider.search({ query: "test", numResults: 1 }, braveConfig),
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
      () => braveProvider.search({ query: "test", numResults: 1 }, braveConfig),
      /ECONNREFUSED/
    );
  });
});
