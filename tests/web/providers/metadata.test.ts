/**
 * Search provider metadata tests
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mergeConfig } from "../../../src/config/load-config.ts";
import {
  getProviderApiKeyEnv,
  getProviderDisplayName,
  isProviderEnabled,
  providerNamesByTier,
  SEARCH_PROVIDER_METADATA,
  SEARCH_PROVIDER_NAMES,
} from "../../../src/modules/web/providers/metadata.ts";
import type { WebSearchProviderName } from "../../../src/modules/web/providers/types.ts";
import type { ResolvedWebConfig } from "../../../src/shared/types.ts";

function webConfig(overrides: Partial<ResolvedWebConfig> = {}): ResolvedWebConfig {
  return { ...mergeConfig({}).web, ...overrides };
}

describe("search provider metadata - provider names", () => {
  it("contains every supported search provider exactly once", () => {
    assert.deepEqual([...SEARCH_PROVIDER_NAMES].sort(), [
      "brave",
      "ddgs",
      "openserp",
      "searxng",
      "serper",
      "tavily",
    ] satisfies WebSearchProviderName[]);
  });

  it("metadata records are keyed by their provider name", () => {
    for (const name of SEARCH_PROVIDER_NAMES) {
      assert.equal(SEARCH_PROVIDER_METADATA[name].name, name);
    }
  });
});

describe("search provider metadata - tiers", () => {
  it("groups commercial providers", () => {
    assert.deepEqual(providerNamesByTier("commercial"), ["brave", "tavily", "serper"]);
  });

  it("groups self-host or open providers", () => {
    assert.deepEqual(providerNamesByTier("self-host-or-open"), ["openserp", "searxng"]);
  });

  it("groups zero-config providers", () => {
    assert.deepEqual(providerNamesByTier("zero-config"), ["ddgs"]);
  });
});

describe("search provider metadata - display names", () => {
  it("returns configured display names for known providers", () => {
    assert.equal(getProviderDisplayName("brave"), "Brave Search");
    assert.equal(getProviderDisplayName("ddgs"), "DuckDuckGo Lite");
    assert.equal(getProviderDisplayName("openserp"), "OpenSERP");
    assert.equal(getProviderDisplayName("searxng"), "SearXNG");
    assert.equal(getProviderDisplayName("tavily"), "Tavily");
    assert.equal(getProviderDisplayName("serper"), "Serper");
  });

  it("returns unknown names unchanged", () => {
    assert.equal(getProviderDisplayName("unknown"), "unknown");
  });
});

describe("search provider metadata - enabled helper", () => {
  it("always treats ddgs as enabled because it has no provider config namespace", () => {
    assert.equal(isProviderEnabled(webConfig(), "ddgs"), true);
  });

  it("reads enabled gates from provider config namespaces", () => {
    const config = webConfig({
      brave: { enabled: true, baseUrl: "https://brave.example/search", apiKeyEnv: "BRAVE_KEY" },
      openserp: { enabled: true, baseUrl: "https://openserp.example/search", apiKeyEnv: "OPENSERP_KEY" },
      searxng: { enabled: true, baseUrl: "https://searxng.example", defaultEngine: "google" },
      tavily: { enabled: false, baseUrl: "https://tavily.example/search", apiKeyEnv: "TAVILY_KEY" },
      serper: { enabled: false, baseUrl: "https://serper.example/search", apiKeyEnv: "SERPER_KEY" },
    });

    assert.equal(isProviderEnabled(config, "brave"), true);
    assert.equal(isProviderEnabled(config, "openserp"), true);
    assert.equal(isProviderEnabled(config, "searxng"), true);
    assert.equal(isProviderEnabled(config, "tavily"), false);
    assert.equal(isProviderEnabled(config, "serper"), false);
  });
});

describe("search provider metadata - API key env helper", () => {
  it("returns configured API key environment variables for keyed providers", () => {
    const config = webConfig({
      brave: { enabled: false, baseUrl: "https://brave.example/search", apiKeyEnv: "CUSTOM_BRAVE_KEY" },
      openserp: { enabled: false, baseUrl: "https://openserp.example/search", apiKeyEnv: "CUSTOM_OPENSERP_KEY" },
      tavily: { enabled: false, baseUrl: "https://tavily.example/search", apiKeyEnv: "CUSTOM_TAVILY_KEY" },
      serper: { enabled: false, baseUrl: "https://serper.example/search", apiKeyEnv: "CUSTOM_SERPER_KEY" },
    });

    assert.equal(getProviderApiKeyEnv(config, "brave"), "CUSTOM_BRAVE_KEY");
    assert.equal(getProviderApiKeyEnv(config, "openserp"), "CUSTOM_OPENSERP_KEY");
    assert.equal(getProviderApiKeyEnv(config, "tavily"), "CUSTOM_TAVILY_KEY");
    assert.equal(getProviderApiKeyEnv(config, "serper"), "CUSTOM_SERPER_KEY");
  });

  it("returns undefined for providers that do not require API keys", () => {
    const config = webConfig();

    assert.equal(getProviderApiKeyEnv(config, "ddgs"), undefined);
    assert.equal(getProviderApiKeyEnv(config, "searxng"), undefined);
  });
});
