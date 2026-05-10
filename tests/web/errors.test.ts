/**
 * Error Module Tests
 * Phase 3: Test Framework - Error codes and recovery tests
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createWebError,
  ERROR_RECOVERY_MAP,
  formatWebError,
  getErrorSummary,
  mapHttpStatusToError,
  mapNetworkErrorToWebError,
  WEB_ERROR_CODES,
  type WebError,
} from "../../src/modules/web/errors.ts";

describe("errors - error codes", () => {
  it("should have all expected error codes", () => {
    assert.equal(WEB_ERROR_CODES.WEB_SEARCH_FAILED, "WEB_SEARCH_FAILED");
    assert.equal(WEB_ERROR_CODES.WEB_SEARCH_TIMEOUT, "WEB_SEARCH_TIMEOUT");
    assert.equal(WEB_ERROR_CODES.WEB_SEARCH_NO_RESULTS, "WEB_SEARCH_NO_RESULTS");
    assert.equal(WEB_ERROR_CODES.WEB_SEARCH_INVALID_QUERY, "WEB_SEARCH_INVALID_QUERY");
    assert.equal(WEB_ERROR_CODES.CONTENT_FETCH_FAILED, "CONTENT_FETCH_FAILED");
    assert.equal(WEB_ERROR_CODES.CONTENT_FETCH_TIMEOUT, "CONTENT_FETCH_TIMEOUT");
    assert.equal(WEB_ERROR_CODES.CONTENT_FETCH_INVALID_URL, "CONTENT_FETCH_INVALID_URL");
    assert.equal(WEB_ERROR_CODES.CONTENT_FETCH_TOO_LARGE, "CONTENT_FETCH_TOO_LARGE");
    assert.equal(WEB_ERROR_CODES.PROVIDER_RATE_LIMITED, "PROVIDER_RATE_LIMITED");
    assert.equal(WEB_ERROR_CODES.PROVIDER_UNAVAILABLE, "PROVIDER_UNAVAILABLE");
    assert.equal(WEB_ERROR_CODES.PROVIDER_AUTH_FAILED, "PROVIDER_AUTH_FAILED");
    assert.equal(WEB_ERROR_CODES.NETWORK_ERROR, "NETWORK_ERROR");
    assert.equal(WEB_ERROR_CODES.PARSE_ERROR, "PARSE_ERROR");
    assert.equal(WEB_ERROR_CODES.CACHE_ERROR, "CACHE_ERROR");
  });

  it("should have 14 error codes total", () => {
    const count = Object.keys(WEB_ERROR_CODES).length;
    assert.equal(count, 14);
  });
});

describe("errors - recovery map", () => {
  it("should have recovery for WEB_SEARCH_FAILED", () => {
    const recovery = ERROR_RECOVERY_MAP[WEB_ERROR_CODES.WEB_SEARCH_FAILED];
    assert.ok(recovery);
    assert.equal(recovery.action, "fallback");
    assert.equal(recovery.nextProvider, "auto");
  });

  it("should have recovery for PROVIDER_RATE_LIMITED", () => {
    const recovery = ERROR_RECOVERY_MAP[WEB_ERROR_CODES.PROVIDER_RATE_LIMITED];
    assert.ok(recovery);
    assert.equal(recovery.action, "retry");
    assert.ok(recovery.waitMs);
    assert.ok(recovery.waitMs! >= 1000);
  });

  it("should have recovery for PROVIDER_AUTH_FAILED", () => {
    const recovery = ERROR_RECOVERY_MAP[WEB_ERROR_CODES.PROVIDER_AUTH_FAILED];
    assert.ok(recovery);
    assert.equal(recovery.action, "abort");
  });

  it("should have recovery for CONTENT_FETCH_TIMEOUT", () => {
    const recovery = ERROR_RECOVERY_MAP[WEB_ERROR_CODES.CONTENT_FETCH_TIMEOUT];
    assert.ok(recovery);
    assert.equal(recovery.action, "fallback");
    assert.equal(recovery.nextProvider, "jina");
  });

  it("should have recovery for NETWORK_ERROR", () => {
    const recovery = ERROR_RECOVERY_MAP[WEB_ERROR_CODES.NETWORK_ERROR];
    assert.ok(recovery);
    assert.equal(recovery.action, "retry");
  });
});

describe("errors - createWebError", () => {
  it("should create basic error", () => {
    const error = createWebError(WEB_ERROR_CODES.WEB_SEARCH_FAILED, "Search failed");

    assert.equal(error.code, WEB_ERROR_CODES.WEB_SEARCH_FAILED);
    assert.equal(error.message, "Search failed");
    assert.equal(error.provider, undefined);
    assert.equal(error.originalError, undefined);
  });

  it("should include provider when specified", () => {
    const error = createWebError(WEB_ERROR_CODES.WEB_SEARCH_FAILED, "Failed", {
      provider: "ddgs",
    });

    assert.equal(error.provider, "ddgs");
  });

  it("should include original error when specified", () => {
    const original = new Error("Original error");
    const error = createWebError(WEB_ERROR_CODES.NETWORK_ERROR, "Network error", {
      originalError: original,
    });

    assert.equal(error.originalError, original);
  });

  it("should infer retryable from recovery action", () => {
    // Retry action should be retryable
    const retryError = createWebError(WEB_ERROR_CODES.NETWORK_ERROR, "Error");
    assert.equal(retryError.retryable, true);

    // Abort action should not be retryable
    const abortError = createWebError(WEB_ERROR_CODES.PROVIDER_AUTH_FAILED, "Auth failed");
    assert.equal(abortError.retryable, false);
  });

  it("should allow explicit retryable override", () => {
    const error = createWebError(WEB_ERROR_CODES.PROVIDER_AUTH_FAILED, "Auth failed", {
      retryable: true,
    });

    assert.equal(error.retryable, true);
  });

  it("should include recovery from map", () => {
    const error = createWebError(WEB_ERROR_CODES.WEB_SEARCH_TIMEOUT, "Timeout");
    assert.ok(error.recovery);
    assert.equal(error.recovery.action, "fallback");
  });
});

describe("errors - mapHttpStatusToError", () => {
  it("maps 401/403 to PROVIDER_AUTH_FAILED", () => {
    const e401 = mapHttpStatusToError(401);
    assert.equal(e401.code, WEB_ERROR_CODES.PROVIDER_AUTH_FAILED);
    assert.equal(e401.retryable, false);

    const e403 = mapHttpStatusToError(403);
    assert.equal(e403.code, WEB_ERROR_CODES.PROVIDER_AUTH_FAILED);
  });

  it("maps 429 to PROVIDER_RATE_LIMITED", () => {
    const error = mapHttpStatusToError(429);
    assert.equal(error.code, WEB_ERROR_CODES.PROVIDER_RATE_LIMITED);
    assert.equal(error.retryable, true);
  });

  it("maps 5xx to PROVIDER_UNAVAILABLE", () => {
    for (const status of [500, 502, 503, 504]) {
      const error = mapHttpStatusToError(status);
      assert.equal(error.code, WEB_ERROR_CODES.PROVIDER_UNAVAILABLE, `status ${status}`);
      assert.equal(error.retryable, true);
    }
  });

  it("maps unknown status to WEB_SEARCH_FAILED", () => {
    const error = mapHttpStatusToError(418);
    assert.equal(error.code, WEB_ERROR_CODES.WEB_SEARCH_FAILED);
  });

  it("includes provider and custom message", () => {
    const e1 = mapHttpStatusToError(401, "tavily");
    assert.equal(e1.provider, "tavily");

    const e2 = mapHttpStatusToError(401, undefined, "Custom auth error");
    assert.equal(e2.message, "Custom auth error");
  });
});

describe("errors - mapNetworkErrorToWebError", () => {
  it("should map fetch failed to NETWORK_ERROR", () => {
    const error = new Error("fetch failed: connection refused");
    const result = mapNetworkErrorToWebError(error);
    assert.equal(result.code, WEB_ERROR_CODES.NETWORK_ERROR);
    assert.equal(result.retryable, true);
  });

  it("should map ENOTFOUND to NETWORK_ERROR", () => {
    const error = new Error("getaddrinfo ENOTFOUND example.com");
    const result = mapNetworkErrorToWebError(error);
    assert.equal(result.code, WEB_ERROR_CODES.NETWORK_ERROR);
  });

  it("should map ECONN to NETWORK_ERROR", () => {
    const error = new Error("ECONNREFUSED");
    const result = mapNetworkErrorToWebError(error);
    assert.equal(result.code, WEB_ERROR_CODES.NETWORK_ERROR);
  });

  it("should map timeout to WEB_SEARCH_TIMEOUT", () => {
    const error = new Error("Request timeout");
    const result = mapNetworkErrorToWebError(error);
    assert.equal(result.code, WEB_ERROR_CODES.WEB_SEARCH_TIMEOUT);
    assert.equal(result.retryable, true);
  });

  it("should include original error", () => {
    const error = new Error("Network failure");
    const result = mapNetworkErrorToWebError(error);
    assert.equal(result.originalError, error);
  });

  it("should include provider when specified", () => {
    const error = new Error("fetch failed");
    const result = mapNetworkErrorToWebError(error, "ddgs");
    assert.equal(result.provider, "ddgs");
  });

  it("should map unknown error to WEB_SEARCH_FAILED", () => {
    const error = new Error("Some unknown error");
    const result = mapNetworkErrorToWebError(error);
    assert.equal(result.code, WEB_ERROR_CODES.WEB_SEARCH_FAILED);
    assert.equal(result.retryable, false);
  });
});

describe("errors - formatWebError", () => {
  it("should format basic error", () => {
    const error = createWebError(WEB_ERROR_CODES.WEB_SEARCH_FAILED, "Search failed");
    const formatted = formatWebError(error);

    assert.ok(formatted.includes("WEB_SEARCH_FAILED"));
    assert.ok(formatted.includes("Search failed"));
  });

  it("should include provider if present", () => {
    const error = createWebError(WEB_ERROR_CODES.WEB_SEARCH_FAILED, "Failed", {
      provider: "ddgs",
    });
    const formatted = formatWebError(error);

    assert.ok(formatted.includes("provider: ddgs"));
  });

  it("should include recovery suggestion if present", () => {
    const error = createWebError(WEB_ERROR_CODES.NETWORK_ERROR, "Network error");
    const formatted = formatWebError(error);

    assert.ok(formatted.includes("Suggestion:"));
  });
});

describe("errors - getErrorSummary", () => {
  it("counts errors by code and retryable", () => {
    const errors: WebError[] = [
      createWebError(WEB_ERROR_CODES.NETWORK_ERROR, "Error 1"),
      createWebError(WEB_ERROR_CODES.NETWORK_ERROR, "Error 2"),
      createWebError(WEB_ERROR_CODES.PROVIDER_AUTH_FAILED, "Error 3"),
    ];

    const summary = getErrorSummary(errors);
    assert.equal(summary.total, 3);
    assert.equal(summary.byCode.NETWORK_ERROR, 2);
    assert.equal(summary.byCode.PROVIDER_AUTH_FAILED, 1);
    assert.equal(summary.retryableCount, 2); // both NETWORK_ERROR are retryable
  });

  it("handles empty array", () => {
    const summary = getErrorSummary([]);
    assert.equal(summary.total, 0);
    assert.deepEqual(summary.byCode, {});
    assert.equal(summary.retryableCount, 0);
  });
});
