/**
 * Provider Registry Tests
 * Phase 2 — getSearchProvider
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SEARCH_PROVIDER_NAMES } from "../../../src/modules/web/providers/metadata.ts";
import { getSearchProvider } from "../../../src/modules/web/providers/registry.ts";

describe("registry - getSearchProvider", () => {
  for (const name of SEARCH_PROVIDER_NAMES) {
    it(`returns a provider object for "${name}"`, () => {
      const provider = getSearchProvider(name);
      assert.ok(provider !== null && typeof provider === "object");
      assert.equal(provider.name, name);
      assert.equal(typeof provider.search, "function");
    });
  }

  it("each provider has a string name", () => {
    for (const name of SEARCH_PROVIDER_NAMES) {
      const provider = getSearchProvider(name);
      assert.equal(typeof provider.name, "string");
    }
  });

  it("each provider has an async search function", () => {
    for (const name of SEARCH_PROVIDER_NAMES) {
      const provider = getSearchProvider(name);
      assert.equal(typeof provider.search, "function");
      assert.equal(provider.search.constructor.name, "AsyncFunction");
    }
  });

  it("ddgs provider is always available (isAvailable returns true)", () => {
    const provider = getSearchProvider("ddgs");
    assert.ok(provider.isAvailable !== undefined);
    assert.equal(provider.isAvailable!({} as any), true);
  });

  it("returns undefined for an unknown provider name", () => {
    const provider = getSearchProvider("nonexistent" as any);
    assert.equal(provider, undefined);
  });
});
