/**
 * Schema Validation Tests
 * Phase 4 — TypeBox schema validation for web tool parameters
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Value } from "typebox/value";
import {
  FetchContentParams,
  GetSearchContentParams,
  WebSearchParams,
} from "../../src/modules/web/schemas.ts";

// ---------------------------------------------------------------------------
// FetchContentParams
// ---------------------------------------------------------------------------

describe("schemas - FetchContentParams", () => {
  it("accepts object with url only", () => {
    assert.equal(Value.Check(FetchContentParams, { url: "https://example.com" }), true);
  });

  it("accepts object with urls only", () => {
    assert.equal(
      Value.Check(FetchContentParams, { urls: ["https://a.com", "https://b.com"] }),
      true
    );
  });

  it("accepts object with both url and urls", () => {
    assert.equal(
      Value.Check(FetchContentParams, { url: "https://a.com", urls: ["https://b.com"] }),
      true
    );
  });

  it("accepts empty object (both fields optional)", () => {
    assert.equal(Value.Check(FetchContentParams, {}), true);
  });

  it("rejects wrong types for fields", () => {
    assert.equal(Value.Check(FetchContentParams, { url: 123 }), false);
    assert.equal(Value.Check(FetchContentParams, { urls: "not-an-array" }), false);
    assert.equal(Value.Check(FetchContentParams, { urls: [123, true] }), false);
  });

  it("accepts extra properties (TypeBox does not enforce strict by default)", () => {
    assert.equal(
      Value.Check(FetchContentParams, { url: "https://a.com", extra: "field" }),
      true
    );
  });

  it("rejects null input", () => {
    assert.equal(Value.Check(FetchContentParams, null), false);
  });

  it("rejects array input", () => {
    assert.equal(Value.Check(FetchContentParams, ["https://a.com"]), false);
  });
});

// ---------------------------------------------------------------------------
// WebSearchParams
// ---------------------------------------------------------------------------

describe("schemas - WebSearchParams", () => {
  it("accepts object with query only", () => {
    assert.equal(Value.Check(WebSearchParams, { query: "hello" }), true);
  });

  it("accepts object with queries only", () => {
    assert.equal(
      Value.Check(WebSearchParams, { queries: ["hello", "world"] }),
      true
    );
  });

  it("accepts object with all fields", () => {
    assert.equal(
      Value.Check(WebSearchParams, {
        query: "hello",
        queries: ["a", "b"],
        numResults: 5,
        includeContent: true,
      }),
      true
    );
  });

  it("accepts empty object (all fields optional)", () => {
    assert.equal(Value.Check(WebSearchParams, {}), true);
  });

  it("accepts numResults as integer", () => {
    assert.equal(Value.Check(WebSearchParams, { query: "q", numResults: 10 }), true);
  });

  it("rejects wrong types for fields", () => {
    assert.equal(Value.Check(WebSearchParams, { query: 123 }), false);
    assert.equal(Value.Check(WebSearchParams, { queries: "single" }), false);
    assert.equal(Value.Check(WebSearchParams, { queries: [1, 2] }), false);
    assert.equal(Value.Check(WebSearchParams, { numResults: "five" }), false);
    assert.equal(Value.Check(WebSearchParams, { includeContent: "yes" }), false);
  });

  it("accepts extra properties (TypeBox does not enforce strict by default)", () => {
    assert.equal(
      Value.Check(WebSearchParams, { query: "q", unknownField: true }),
      true
    );
  });
});

// ---------------------------------------------------------------------------
// GetSearchContentParams
// ---------------------------------------------------------------------------

describe("schemas - GetSearchContentParams", () => {
  it("accepts object with responseId only (minimum required)", () => {
    assert.equal(
      Value.Check(GetSearchContentParams, { responseId: "abc-123" }),
      true
    );
  });

  it("accepts object with all fields", () => {
    assert.equal(
      Value.Check(GetSearchContentParams, {
        responseId: "abc-123",
        query: "test",
        queryIndex: 0,
        url: "https://example.com",
        urlIndex: 1,
      }),
      true
    );
  });

  it("rejects missing responseId (required field)", () => {
    assert.equal(Value.Check(GetSearchContentParams, {}), false);
  });

  it("rejects wrong types for fields", () => {
    assert.equal(Value.Check(GetSearchContentParams, { responseId: 123 }), false);
    assert.equal(Value.Check(GetSearchContentParams, { responseId: "x", query: 123 }), false);
    assert.equal(Value.Check(GetSearchContentParams, { responseId: "x", queryIndex: "0" }), false);
    assert.equal(Value.Check(GetSearchContentParams, { responseId: "x", url: 123 }), false);
    assert.equal(Value.Check(GetSearchContentParams, { responseId: "x", urlIndex: "1" }), false);
  });

  it("accepts extra properties (TypeBox does not enforce strict by default)", () => {
    assert.equal(
      Value.Check(GetSearchContentParams, { responseId: "x", extra: true }),
      true
    );
  });

  it("accepts partial optional fields", () => {
    assert.equal(
      Value.Check(GetSearchContentParams, { responseId: "x", query: "q" }),
      true
    );
    assert.equal(
      Value.Check(GetSearchContentParams, { responseId: "x", urlIndex: 0 }),
      true
    );
  });
});
