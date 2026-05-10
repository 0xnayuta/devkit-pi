/**
 * Serper Provider Tests
 * Phase 3 — Serper.dev Google Search API provider
 */

import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { mergeConfig } from "../../../src/config/load-config.ts";
import type { ResolvedWebConfig } from "../../../shared/types.ts";
import { serperProvider } from "../../../src/modules/web/providers/serper.ts";
import { resetConnectionPool } from "../../../src/modules/web/http-pool.ts";

const originalFetch = globalThis.fetch;
const ENV_KEY = "SERPER_API_KEY";

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

describe("serper - name", () => {
  it('has name "serper"', () => {
    assert.equal(serperProvider.name, "serper");
  });
});

// ---------------------------------------------------------------------------
// isAvailable
// ---------------------------------------------------------------------------

describe("serper - isAvailable", () => {
  // NOTE: serper.isAvailable does NOT check config.serper.enabled.
  // The enabled gate is handled at the selectSearchProvider level.
  it("returns true even when disabled, if baseUrl and key are valid", () => {
    setApiKey("test-key");
    assert.equal(
      serperProvider.isAvailable!(
        cfg({ serper: { enabled: false, baseUrl: "https://google.serper.dev/search", apiKeyEnv: ENV_KEY } })
      ),
      true
    );
  });

  it("returns false when API key is missing", () => {
    delete process.env[ENV_KEY];
    assert.equal(
      serperProvider.isAvailable!(
        cfg({ serper: { enabled: true, baseUrl: "https://google.serper.dev/search", apiKeyEnv: ENV_KEY } })
      ),
      false
    );
  });

  it("returns false when baseUrl is invalid", () => {
    setApiKey("test-key");
    assert.equal(
      serperProvider.isAvailable!(
        cfg({ serper: { enabled: true, baseUrl: "not-a-url", apiKeyEnv: ENV_KEY } })
      ),
      false
    );
  });

  it("returns false when baseUrl has non-http protocol", () => {
    setApiKey("test-key");
    assert.equal(
      serperProvider.isAvailable!(
        cfg({ serper: { enabled: true, baseUrl: "ftp://example.com", apiKeyEnv: ENV_KEY } })
      ),
      false
    );
  });

  it("returns true when enabled, valid baseUrl, and API key set", () => {
    setApiKey("test-key");
    assert.equal(
      serperProvider.isAvailable!(
        cfg({ serper: { enabled: true, baseUrl: "https://google.serper.dev/search", apiKeyEnv: ENV_KEY } })
      ),
      true
    );
  });
});

// ---------------------------------------------------------------------------
// search — happy path
// ---------------------------------------------------------------------------

describe("serper - search: happy path", () => {
  const serperCfg = cfg({
    serper: { enabled: true, baseUrl: "https://google.serper.dev/search", apiKeyEnv: ENV_KEY },
  });

  it("returns parsed results from Serper API response", async () => {
    setApiKey("test-key");

    const mockResponse = {
      organic: [
        { title: "Result 1", link: "https://example.com/1", snippet: "Snippet 1" },
        { title: "Result 2", link: "https://example.com/2", snippet: "Snippet 2" },
      ],
    };

    globalThis.fetch = (() =>
      Promise.resolve(
        new Response(JSON.stringify(mockResponse), { status: 200, headers: { "content-type": "application/json" } })
      )) as typeof fetch;

    const results = await serperProvider.search({ query: "test", numResults: 5 }, serperCfg);
    assert.equal(results.length, 2);
    assert.equal(results[0].title, "Result 1");
    assert.equal(results[0].url, "https://example.com/1");
    assert.equal(results[0].snippet, "Snippet 1");
    assert.equal(results[0].source, "serper");
  });

  it("sends POST request with correct body and headers", async () => {
    setApiKey("my-key");
    let capturedMethod = "";
    let capturedBody: any = null;
    let capturedHeaders: Record<string, string> = {};

    globalThis.fetch = ((_url: string, opts?: any) => {
      capturedMethod = opts?.method;
      capturedBody = JSON.parse(opts?.body ?? "{}");
      capturedHeaders = opts?.headers ?? {};
      return Promise.resolve(
        new Response(JSON.stringify({ organic: [] }), { status: 200 })
      );
    }) as typeof fetch;

    await serperProvider.search({ query: "hello", numResults: 3 }, serperCfg);

    assert.equal(capturedMethod, "POST");
    assert.equal(capturedBody.q, "hello");
    assert.equal(capturedBody.num, 3);
    assert.equal(capturedHeaders["x-api-key"], "my-key");
    assert.ok(capturedHeaders["content-type"]?.includes("application/json"));
  });

  it("respects numResults limit", async () => {
    setApiKey("test-key");
    const items = Array.from({ length: 10 }, (_, i) => ({
      title: `R${i}`,
      link: `https://example.com/${i}`,
      snippet: `S${i}`,
    }));

    globalThis.fetch = (() =>
      Promise.resolve(new Response(JSON.stringify({ organic: items }), { status: 200 }))) as typeof fetch;

    const results = await serperProvider.search({ query: "test", numResults: 3 }, serperCfg);
    assert.ok(results.length <= 3);
  });

  it("filters out items without link", async () => {
    setApiKey("test-key");
    const mockResponse = {
      organic: [
        { title: "Valid", link: "https://example.com/valid", snippet: "ok" },
        { title: "No Link" },
        { title: "Good", link: "https://example.com/good", snippet: "ok" },
      ],
    };

    globalThis.fetch = (() =>
      Promise.resolve(new Response(JSON.stringify(mockResponse), { status: 200 }))) as typeof fetch;

    const results = await serperProvider.search({ query: "test", numResults: 10 }, serperCfg);
    assert.equal(results.length, 2);
  });

  it("uses link field as url (not url field)", async () => {
    setApiKey("test-key");
    const mockResponse = {
      organic: [{ title: "T", link: "https://example.com/from-link" }],
    };

    globalThis.fetch = (() =>
      Promise.resolve(new Response(JSON.stringify(mockResponse), { status: 200 }))) as typeof fetch;

    const results = await serperProvider.search({ query: "test", numResults: 1 }, serperCfg);
    assert.equal(results[0].url, "https://example.com/from-link");
  });

  it("handles missing organic array gracefully", async () => {
    setApiKey("test-key");

    globalThis.fetch = (() =>
      Promise.resolve(new Response(JSON.stringify({}), { status: 200 }))) as typeof fetch;

    const results = await serperProvider.search({ query: "test", numResults: 5 }, serperCfg);
    assert.equal(results.length, 0);
  });
});

// ---------------------------------------------------------------------------
// search — error handling
// ---------------------------------------------------------------------------

describe("serper - search: error handling", () => {
  const serperCfg = cfg({
    serper: { enabled: true, baseUrl: "https://google.serper.dev/search", apiKeyEnv: ENV_KEY },
  });

  it("throws on HTTP 429 rate limit", async () => {
    setApiKey("test-key");

    globalThis.fetch = (() =>
      Promise.resolve(new Response("Rate limited", { status: 429, statusText: "Too Many Requests" }))) as typeof fetch;

    await assert.rejects(
      () => serperProvider.search({ query: "test", numResults: 1 }, serperCfg),
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
      () => serperProvider.search({ query: "test", numResults: 1 }, serperCfg),
      /ECONNREFUSED/
    );
  });
});
