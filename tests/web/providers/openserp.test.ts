/**
 * OpenSERP Provider Tests
 * Phase 3 — OpenSERP search engine provider
 */

import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { mergeConfig } from "../../../src/config/load-config.ts";
import type { ResolvedWebConfig } from "../../../shared/types.ts";
import { openserpProvider } from "../../../src/modules/web/providers/openserp.ts";
import { resetConnectionPool } from "../../../src/modules/web/http-pool.ts";

const originalFetch = globalThis.fetch;
const ENV_KEY = "OPENSERP_API_KEY";

function cfg(overrides: Partial<ResolvedWebConfig> = {}): ResolvedWebConfig {
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

describe("openserp - name", () => {
  it('has name "openserp"', () => {
    assert.equal(openserpProvider.name, "openserp");
  });
});

// ---------------------------------------------------------------------------
// isAvailable
// ---------------------------------------------------------------------------

describe("openserp - isAvailable", () => {
  it("returns false when disabled in config", () => {
    setApiKey("test-key");
    assert.equal(
      openserpProvider.isAvailable!(
        cfg({ openserp: { enabled: false, baseUrl: "http://localhost:7000", apiKeyEnv: ENV_KEY } })
      ),
      false
    );
  });

  it("returns false when API key is missing", () => {
    delete process.env[ENV_KEY];
    assert.equal(
      openserpProvider.isAvailable!(
        cfg({ openserp: { enabled: true, baseUrl: "http://localhost:7000", apiKeyEnv: ENV_KEY } })
      ),
      false
    );
  });

  it("returns false when baseUrl is invalid", () => {
    setApiKey("test-key");
    assert.equal(
      openserpProvider.isAvailable!(
        cfg({ openserp: { enabled: true, baseUrl: "not-a-url", apiKeyEnv: ENV_KEY } })
      ),
      false
    );
  });

  it("returns false when baseUrl has non-http protocol", () => {
    setApiKey("test-key");
    assert.equal(
      openserpProvider.isAvailable!(
        cfg({ openserp: { enabled: true, baseUrl: "ftp://example.com", apiKeyEnv: ENV_KEY } })
      ),
      false
    );
  });

  it("returns true when enabled, valid baseUrl, and API key set", () => {
    setApiKey("test-key");
    assert.equal(
      openserpProvider.isAvailable!(
        cfg({ openserp: { enabled: true, baseUrl: "http://localhost:7000", apiKeyEnv: ENV_KEY } })
      ),
      true
    );
  });

  it("returns true with https:// baseUrl", () => {
    setApiKey("test-key");
    assert.equal(
      openserpProvider.isAvailable!(
        cfg({ openserp: { enabled: true, baseUrl: "https://api.openserp.com", apiKeyEnv: ENV_KEY } })
      ),
      true
    );
  });
});

// ---------------------------------------------------------------------------
// search — happy path
// ---------------------------------------------------------------------------

describe("openserp - search: happy path", () => {
  const openserpCfg = cfg({
    openserp: { enabled: true, baseUrl: "http://localhost:7000", apiKeyEnv: ENV_KEY },
  });

  it("returns parsed results from organic_results array", async () => {
    setApiKey("test-key");

    const mockResponse = {
      organic_results: [
        { title: "Result 1", url: "https://example.com/1", snippet: "Snippet 1" },
        { title: "Result 2", url: "https://example.com/2", snippet: "Snippet 2" },
      ],
    };

    globalThis.fetch = (() =>
      Promise.resolve(
        new Response(JSON.stringify(mockResponse), { status: 200, headers: { "content-type": "application/json" } })
      )) as typeof fetch;

    const results = await openserpProvider.search({ query: "test", numResults: 5 }, openserpCfg);
    assert.equal(results.length, 2);
    assert.equal(results[0].title, "Result 1");
    assert.equal(results[0].url, "https://example.com/1");
    assert.equal(results[0].snippet, "Snippet 1");
    assert.equal(results[0].source, "openserp");
  });

  it("falls back to results array when organic_results is missing", async () => {
    setApiKey("test-key");

    const mockResponse = {
      results: [
        { title: "Fallback", link: "https://example.com/fallback", description: "Desc" },
      ],
    };

    globalThis.fetch = (() =>
      Promise.resolve(new Response(JSON.stringify(mockResponse), { status: 200 }))) as typeof fetch;

    const results = await openserpProvider.search({ query: "test", numResults: 5 }, openserpCfg);
    assert.equal(results.length, 1);
    assert.equal(results[0].title, "Fallback");
    assert.equal(results[0].url, "https://example.com/fallback");
  });

  it("sends GET request with correct query params and headers", async () => {
    setApiKey("my-key");
    let capturedUrl = "";
    let capturedMethod = "";
    let capturedHeaders: Record<string, string> = {};

    globalThis.fetch = ((url: string, opts?: any) => {
      capturedUrl = url;
      capturedMethod = opts?.method;
      capturedHeaders = opts?.headers ?? {};
      return Promise.resolve(
        new Response(JSON.stringify({ organic_results: [] }), { status: 200 })
      );
    }) as typeof fetch;

    await openserpProvider.search({ query: "hello world", numResults: 5 }, openserpCfg);

    assert.equal(capturedMethod, "GET");
    const parsed = new URL(capturedUrl);
    assert.equal(parsed.searchParams.get("q"), "hello world");
    assert.equal(parsed.searchParams.get("num"), "5");
    assert.equal(capturedHeaders["authorization"], "Bearer my-key");
    assert.equal(capturedHeaders["x-api-key"], "my-key");
    assert.ok(capturedHeaders["accept"]?.includes("application/json"));
  });

  it("respects numResults limit", async () => {
    setApiKey("test-key");
    const items = Array.from({ length: 10 }, (_, i) => ({
      title: `R${i}`,
      url: `https://example.com/${i}`,
      snippet: `S${i}`,
    }));

    globalThis.fetch = (() =>
      Promise.resolve(new Response(JSON.stringify({ organic_results: items }), { status: 200 }))) as typeof fetch;

    const results = await openserpProvider.search({ query: "test", numResults: 3 }, openserpCfg);
    assert.ok(results.length <= 3);
  });

  it("prefers url over link field", async () => {
    setApiKey("test-key");
    const mockResponse = {
      organic_results: [{ title: "T", url: "https://example.com/url-field", link: "https://example.com/link-field" }],
    };

    globalThis.fetch = (() =>
      Promise.resolve(new Response(JSON.stringify(mockResponse), { status: 200 }))) as typeof fetch;

    const results = await openserpProvider.search({ query: "test", numResults: 1 }, openserpCfg);
    assert.equal(results[0].url, "https://example.com/url-field");
  });

  it("falls back to link when url is missing", async () => {
    setApiKey("test-key");
    const mockResponse = {
      organic_results: [{ title: "T", link: "https://example.com/link-only" }],
    };

    globalThis.fetch = (() =>
      Promise.resolve(new Response(JSON.stringify(mockResponse), { status: 200 }))) as typeof fetch;

    const results = await openserpProvider.search({ query: "test", numResults: 1 }, openserpCfg);
    assert.equal(results[0].url, "https://example.com/link-only");
  });

  it("prefers snippet over description field", async () => {
    setApiKey("test-key");
    const mockResponse = {
      organic_results: [{ title: "T", url: "https://example.com", snippet: "Snip", description: "Desc" }],
    };

    globalThis.fetch = (() =>
      Promise.resolve(new Response(JSON.stringify(mockResponse), { status: 200 }))) as typeof fetch;

    const results = await openserpProvider.search({ query: "test", numResults: 1 }, openserpCfg);
    assert.equal(results[0].snippet, "Snip");
  });

  it("falls back to description when snippet is missing", async () => {
    setApiKey("test-key");
    const mockResponse = {
      organic_results: [{ title: "T", url: "https://example.com", description: "Desc only" }],
    };

    globalThis.fetch = (() =>
      Promise.resolve(new Response(JSON.stringify(mockResponse), { status: 200 }))) as typeof fetch;

    const results = await openserpProvider.search({ query: "test", numResults: 1 }, openserpCfg);
    assert.equal(results[0].snippet, "Desc only");
  });

  it("handles empty response gracefully", async () => {
    setApiKey("test-key");

    globalThis.fetch = (() =>
      Promise.resolve(new Response(JSON.stringify({}), { status: 200 }))) as typeof fetch;

    const results = await openserpProvider.search({ query: "test", numResults: 5 }, openserpCfg);
    assert.equal(results.length, 0);
  });

  it("filters out items without url or link", async () => {
    setApiKey("test-key");
    const mockResponse = {
      organic_results: [
        { title: "Valid", url: "https://example.com/valid" },
        { title: "No URL" },
        { title: "Good", link: "https://example.com/good" },
      ],
    };

    globalThis.fetch = (() =>
      Promise.resolve(new Response(JSON.stringify(mockResponse), { status: 200 }))) as typeof fetch;

    const results = await openserpProvider.search({ query: "test", numResults: 10 }, openserpCfg);
    assert.equal(results.length, 2);
  });
});

// ---------------------------------------------------------------------------
// search — error handling
// ---------------------------------------------------------------------------

describe("openserp - search: error handling", () => {
  const openserpCfg = cfg({
    openserp: { enabled: true, baseUrl: "http://localhost:7000", apiKeyEnv: ENV_KEY },
  });

  it("throws on HTTP 429 rate limit", async () => {
    setApiKey("test-key");

    globalThis.fetch = (() =>
      Promise.resolve(new Response("Rate limited", { status: 429, statusText: "Too Many Requests" }))) as typeof fetch;

    await assert.rejects(
      () => openserpProvider.search({ query: "test", numResults: 1 }, openserpCfg),
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
      () => openserpProvider.search({ query: "test", numResults: 1 }, openserpCfg),
      /ECONNREFUSED/
    );
  });
});
