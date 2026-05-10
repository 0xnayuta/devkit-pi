/**
 * Tavily Provider Tests
 * Phase 3 — Tavily Search API provider
 */

import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { mergeConfig } from "../../../src/config/load-config.ts";
import type { ResolvedWebConfig } from "../../../shared/types.ts";
import { tavilyProvider } from "../../../src/modules/web/providers/tavily.ts";
import { resetConnectionPool } from "../../../src/modules/web/http-pool.ts";

const originalFetch = globalThis.fetch;
const ENV_KEY = "TAVILY_API_KEY";

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

describe("tavily - name", () => {
  it('has name "tavily"', () => {
    assert.equal(tavilyProvider.name, "tavily");
  });
});

// ---------------------------------------------------------------------------
// isAvailable
// ---------------------------------------------------------------------------

describe("tavily - isAvailable", () => {
  // NOTE: tavily.isAvailable does NOT check config.tavily.enabled.
  // The enabled gate is handled at the selectSearchProvider level.
  it("returns true even when disabled, if baseUrl and key are valid", () => {
    setApiKey("test-key");
    assert.equal(
      tavilyProvider.isAvailable!(
        config({ tavily: { enabled: false, baseUrl: "https://api.tavily.com/search", apiKeyEnv: ENV_KEY } })
      ),
      true
    );
  });

  it("returns false when API key is missing", () => {
    delete process.env[ENV_KEY];
    assert.equal(
      tavilyProvider.isAvailable!(
        config({ tavily: { enabled: true, baseUrl: "https://api.tavily.com/search", apiKeyEnv: ENV_KEY } })
      ),
      false
    );
  });

  it("returns false when baseUrl is invalid", () => {
    setApiKey("test-key");
    assert.equal(
      tavilyProvider.isAvailable!(
        config({ tavily: { enabled: true, baseUrl: "not-a-url", apiKeyEnv: ENV_KEY } })
      ),
      false
    );
  });

  it("returns false when baseUrl has non-http protocol", () => {
    setApiKey("test-key");
    assert.equal(
      tavilyProvider.isAvailable!(
        config({ tavily: { enabled: true, baseUrl: "ftp://api.tavily.com/search", apiKeyEnv: ENV_KEY } })
      ),
      false
    );
  });

  it("returns true when enabled, valid baseUrl, and API key set", () => {
    setApiKey("test-key");
    assert.equal(
      tavilyProvider.isAvailable!(
        config({ tavily: { enabled: true, baseUrl: "https://api.tavily.com/search", apiKeyEnv: ENV_KEY } })
      ),
      true
    );
  });

  it("returns true with http:// baseUrl", () => {
    setApiKey("test-key");
    assert.equal(
      tavilyProvider.isAvailable!(
        config({ tavily: { enabled: true, baseUrl: "http://localhost:8080/search", apiKeyEnv: ENV_KEY } })
      ),
      true
    );
  });
});

// ---------------------------------------------------------------------------
// search — happy path
// ---------------------------------------------------------------------------

describe("tavily - search: happy path", () => {
  const tavilyConfig = config({
    tavily: { enabled: true, baseUrl: "https://api.tavily.com/search", apiKeyEnv: ENV_KEY },
  });

  it("returns parsed results from Tavily API response", async () => {
    setApiKey("test-key");

    const mockResponse = {
      results: [
        { title: "Result 1", url: "https://example.com/1", content: "Snippet 1" },
        { title: "Result 2", url: "https://example.com/2", content: "Snippet 2" },
      ],
    };

    globalThis.fetch = (() =>
      Promise.resolve(
        new Response(JSON.stringify(mockResponse), { status: 200, headers: { "content-type": "application/json" } })
      )) as typeof fetch;

    const results = await tavilyProvider.search({ query: "test", numResults: 5 }, tavilyConfig);
    assert.equal(results.length, 2);
    assert.equal(results[0].title, "Result 1");
    assert.equal(results[0].url, "https://example.com/1");
    assert.equal(results[0].snippet, "Snippet 1");
    assert.equal(results[0].source, "tavily");
  });

  it("sends POST request with correct body", async () => {
    setApiKey("my-key");
    let capturedMethod = "";
    let capturedBody: any = null;

    globalThis.fetch = ((_url: string, opts?: any) => {
      capturedMethod = opts?.method;
      capturedBody = JSON.parse(opts?.body ?? "{}");
      return Promise.resolve(
        new Response(JSON.stringify({ results: [] }), { status: 200 })
      );
    }) as typeof fetch;

    await tavilyProvider.search({ query: "hello", numResults: 3 }, tavilyConfig);

    assert.equal(capturedMethod, "POST");
    assert.equal(capturedBody.api_key, "my-key");
    assert.equal(capturedBody.query, "hello");
    assert.equal(capturedBody.max_results, 3);
  });

  it("respects numResults limit", async () => {
    setApiKey("test-key");
    const results = Array.from({ length: 10 }, (_, i) => ({
      title: `R${i}`,
      url: `https://example.com/${i}`,
      content: `S${i}`,
    }));

    globalThis.fetch = (() =>
      Promise.resolve(new Response(JSON.stringify({ results }), { status: 200 }))) as typeof fetch;

    const items = await tavilyProvider.search({ query: "test", numResults: 3 }, tavilyConfig);
    assert.ok(items.length <= 3);
  });

  it("filters out items without url", async () => {
    setApiKey("test-key");
    const mockResponse = {
      results: [
        { title: "Valid", url: "https://example.com/valid", content: "ok" },
        { title: "No URL" },
        { title: "Good", url: "https://example.com/good", content: "ok" },
      ],
    };

    globalThis.fetch = (() =>
      Promise.resolve(new Response(JSON.stringify(mockResponse), { status: 200 }))) as typeof fetch;

    const results = await tavilyProvider.search({ query: "test", numResults: 10 }, tavilyConfig);
    assert.equal(results.length, 2);
  });

  it("uses content as snippet", async () => {
    setApiKey("test-key");
    const mockResponse = {
      results: [{ title: "T", url: "https://example.com", content: "Content text" }],
    };

    globalThis.fetch = (() =>
      Promise.resolve(new Response(JSON.stringify(mockResponse), { status: 200 }))) as typeof fetch;

    const results = await tavilyProvider.search({ query: "test", numResults: 1 }, tavilyConfig);
    assert.equal(results[0].snippet, "Content text");
  });

  it("handles missing results array gracefully", async () => {
    setApiKey("test-key");

    globalThis.fetch = (() =>
      Promise.resolve(new Response(JSON.stringify({}), { status: 200 }))) as typeof fetch;

    const results = await tavilyProvider.search({ query: "test", numResults: 5 }, tavilyConfig);
    assert.equal(results.length, 0);
  });
});

// ---------------------------------------------------------------------------
// search — error handling
// ---------------------------------------------------------------------------

describe("tavily - search: error handling", () => {
  const tavilyConfig = config({
    tavily: { enabled: true, baseUrl: "https://api.tavily.com/search", apiKeyEnv: ENV_KEY },
  });

  it("throws on HTTP 429 rate limit", async () => {
    setApiKey("test-key");

    globalThis.fetch = (() =>
      Promise.resolve(new Response("Rate limited", { status: 429, statusText: "Too Many Requests" }))) as typeof fetch;

    await assert.rejects(
      () => tavilyProvider.search({ query: "test", numResults: 1 }, tavilyConfig),
      (error: any) => {
        assert.ok(error.message.includes("429") || error.status === 429);
        return true;
      }
    );
  });

  it("propagates network errors", async () => {
    setApiKey("test-key");
    globalThis.fetch = (() => Promise.reject(new Error("ECONNREFUSED"))) as typeof fetch;

    await assert.rejects(
      () => tavilyProvider.search({ query: "test", numResults: 1 }, tavilyConfig),
      /ECONNREFUSED/
    );
  });
});
