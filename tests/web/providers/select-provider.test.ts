/**
 * Select Provider Tests
 * Phase 1 — Provider selection logic
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mergeConfig } from "../../../src/config/load-config.ts";
import type { ResolvedWebConfig } from "../../../shared/types.ts";
import { selectSearchProvider } from "../../../src/modules/web/providers/select-provider.ts";

// Helper to create a ResolvedWebConfig with overrides
function webConfig(overrides: Partial<ResolvedWebConfig> = {}): ResolvedWebConfig {
  return { ...mergeConfig({}).web, ...overrides };
}

// ---------------------------------------------------------------------------
// Explicit mode — unsupported provider
// ---------------------------------------------------------------------------

describe("select-provider - explicit mode: unsupported provider", () => {
  it("rejects unknown provider name", async () => {
    const result = await selectSearchProvider(webConfig({ provider: "nonexistent" as any }));
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error.error.code, "INVALID_INPUT");
      assert.match(result.error.error.message, /Unsupported web_search provider/);
    }
  });
});

// ---------------------------------------------------------------------------
// Explicit mode — disabled providers (config-level gate, no env vars needed)
// ---------------------------------------------------------------------------

describe("select-provider - explicit mode: disabled providers", () => {
  it("rejects openserp when disabled", async () => {
    const config = webConfig({
      provider: "openserp",
      openserp: { enabled: false, baseUrl: "http://localhost", apiKeyEnv: "" },
    });
    const result = await selectSearchProvider(config);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error.error.code, "INVALID_INPUT");
      assert.match(result.error.error.message, /openserp.*unavailable/);
    }
  });

  it("rejects searxng when disabled", async () => {
    const config = webConfig({
      provider: "searxng",
      searxng: { enabled: false, baseUrl: "", defaultEngine: "google" },
    });
    const result = await selectSearchProvider(config);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error.error.code, "INVALID_INPUT");
      assert.match(result.error.error.message, /searxng.*unavailable/);
    }
  });

  it("rejects tavily when disabled", async () => {
    const config = webConfig({
      provider: "tavily",
      tavily: { enabled: false, baseUrl: "https://api.tavily.com", apiKeyEnv: "TAVILY_API_KEY" },
    });
    const result = await selectSearchProvider(config);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error.error.code, "INVALID_INPUT");
      assert.match(result.error.error.message, /tavily.*unavailable/);
    }
  });

  it("rejects serper when disabled", async () => {
    const config = webConfig({
      provider: "serper",
      serper: { enabled: false, baseUrl: "https://google.serper.dev", apiKeyEnv: "SERPER_API_KEY" },
    });
    const result = await selectSearchProvider(config);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error.error.code, "INVALID_INPUT");
      assert.match(result.error.error.message, /serper.*unavailable/);
    }
  });
});

// ---------------------------------------------------------------------------
// Explicit mode — ddgs (zero-config, always available)
// ---------------------------------------------------------------------------

describe("select-provider - explicit mode: ddgs", () => {
  it("selects ddgs provider when explicitly configured", async () => {
    const config = webConfig({ provider: "ddgs" });
    const result = await selectSearchProvider(config);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.provider.name, "ddgs");
      assert.equal(result.mode, "explicit");
      assert.equal(result.providers.length, 1);
    }
  });
});

// ---------------------------------------------------------------------------
// Explicit mode — searxng with invalid baseUrl
// ---------------------------------------------------------------------------

describe("select-provider - explicit mode: searxng baseUrl validation", () => {
  it("rejects searxng when enabled but baseUrl is empty (isAvailable fails)", async () => {
    const config = webConfig({
      provider: "searxng",
      searxng: { enabled: true, baseUrl: "", defaultEngine: "google" },
    });
    const result = await selectSearchProvider(config);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error.error.code, "INVALID_INPUT");
      assert.match(result.error.error.message, /searxng.*unavailable/);
    }
  });
});

// ---------------------------------------------------------------------------
// Auto mode
// ---------------------------------------------------------------------------

describe("select-provider - auto mode", () => {
  it("selects ddgs in auto mode (always available, zero-config)", async () => {
    const config = webConfig({ provider: "auto" });
    const result = await selectSearchProvider(config);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.mode, "auto");
      // ddgs should be among the available providers
      assert.ok(result.providers.length >= 1);
      assert.equal(result.provider.name, "ddgs");
    }
  });

  it("respects providerPriority ordering in auto mode", async () => {
    // ddgs is always available, so it should be first if prioritized
    const config = webConfig({
      provider: "auto",
      providerPriority: ["ddgs"],
    });
    const result = await selectSearchProvider(config);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.provider.name, "ddgs");
      assert.equal(result.mode, "auto");
    }
  });

  it("returns providers list with available providers in auto mode", async () => {
    const config = webConfig({ provider: "auto" });
    const result = await selectSearchProvider(config);
    assert.equal(result.ok, true);
    if (result.ok) {
      // At minimum ddgs should be available
      assert.ok(result.providers.length >= 1);
      assert.ok(result.providers.every((p) => typeof p.name === "string"));
    }
  });
});

// ---------------------------------------------------------------------------
// Return shape
// ---------------------------------------------------------------------------

describe("select-provider - result shape", () => {
  it("ok=true result has provider, providers, and mode fields", async () => {
    const result = await selectSearchProvider(webConfig({ provider: "ddgs" }));
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.ok("provider" in result);
      assert.ok("providers" in result);
      assert.ok("mode" in result);
      assert.equal(typeof result.provider.name, "string");
      assert.ok(Array.isArray(result.providers));
    }
  });

  it("ok=false result has error.code and error.message", async () => {
    const result = await selectSearchProvider(webConfig({ provider: "bad" as any }));
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.ok("error" in result);
      assert.equal(typeof result.error.error.code, "string");
      assert.equal(typeof result.error.error.message, "string");
    }
  });
});
