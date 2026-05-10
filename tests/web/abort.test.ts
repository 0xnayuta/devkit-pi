/**
 * Abort Module Tests
 * Phase 2 — withTimeoutSignal and isAbortLikeError
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isAbortLikeError, withTimeoutSignal } from "../../src/modules/web/abort.ts";

// ---------------------------------------------------------------------------
// withTimeoutSignal
// ---------------------------------------------------------------------------

describe("abort - withTimeoutSignal", () => {
  it("returns an AbortSignal", () => {
    const signal = withTimeoutSignal(5000);
    assert.ok(signal instanceof AbortSignal);
  });

  it("signal is not aborted initially", () => {
    const signal = withTimeoutSignal(60_000);
    assert.equal(signal.aborted, false);
  });

  it("signal aborts after timeout", async () => {
    const signal = withTimeoutSignal(10);
    // Wait longer than the timeout
    await new Promise((r) => setTimeout(r, 50));
    assert.equal(signal.aborted, true);
  });

  it("combined signal aborts when parent signal aborts", async () => {
    const controller = new AbortController();
    const signal = withTimeoutSignal(60_000, controller.signal);
    assert.equal(signal.aborted, false);

    controller.abort();
    // AbortSignal.any is microtask-based; give it a tick
    await new Promise((r) => setTimeout(r, 10));
    assert.equal(signal.aborted, true);
  });

  it("combined signal aborts when timeout fires before parent", async () => {
    const controller = new AbortController();
    const signal = withTimeoutSignal(10, controller.signal);

    await new Promise((r) => setTimeout(r, 50));
    assert.equal(signal.aborted, true);
    // Parent should still be intact (not aborted by the timeout)
    assert.equal(controller.signal.aborted, false);
  });

  it("signal without parent has no reason initially", () => {
    const signal = withTimeoutSignal(60_000);
    assert.equal(signal.reason, undefined);
  });
});

// ---------------------------------------------------------------------------
// isAbortLikeError — DOMException
// ---------------------------------------------------------------------------

describe("abort - isAbortLikeError: DOMException", () => {
  it("returns true for DOMException AbortError", () => {
    const error = new DOMException("The operation was aborted", "AbortError");
    assert.equal(isAbortLikeError(error), true);
  });

  it("returns true for DOMException TimeoutError", () => {
    const error = new DOMException("The operation timed out", "TimeoutError");
    assert.equal(isAbortLikeError(error), true);
  });

  it("returns false for DOMException with other name", () => {
    const error = new DOMException("Something else", "DataError");
    assert.equal(isAbortLikeError(error), false);
  });
});

// ---------------------------------------------------------------------------
// isAbortLikeError — Error
// ---------------------------------------------------------------------------

describe("abort - isAbortLikeError: Error", () => {
  it("returns true for Error with 'abort' in name", () => {
    const error = new Error("something");
    error.name = "AbortError";
    assert.equal(isAbortLikeError(error), true);
  });

  it("returns true for Error with 'abort' in message", () => {
    const error = new Error("request was aborted by the user");
    assert.equal(isAbortLikeError(error), true);
  });

  it("returns true for Error with 'timeout' in name", () => {
    const error = new Error("took too long");
    error.name = "TimeoutError";
    assert.equal(isAbortLikeError(error), true);
  });

  it("returns true for Error with 'timeout' in message", () => {
    const error = new Error("connection timeout after 30s");
    assert.equal(isAbortLikeError(error), true);
  });

  it("is case-insensitive", () => {
    const error = new Error("ABORT detected");
    assert.equal(isAbortLikeError(error), true);
  });

  it("returns false for unrelated Error", () => {
    const error = new Error("ECONNREFUSED");
    assert.equal(isAbortLikeError(error), false);
  });
});

// ---------------------------------------------------------------------------
// isAbortLikeError — string and other
// ---------------------------------------------------------------------------

describe("abort - isAbortLikeError: string and other types", () => {
  it("returns true for string containing 'abort'", () => {
    assert.equal(isAbortLikeError("operation aborted"), true);
  });

  it("returns true for string containing 'timeout'", () => {
    assert.equal(isAbortLikeError("Request timeout"), true);
  });

  it("returns false for unrelated string", () => {
    assert.equal(isAbortLikeError("something went wrong"), false);
  });

  it("returns false for null", () => {
    assert.equal(isAbortLikeError(null), false);
  });

  it("returns false for number", () => {
    assert.equal(isAbortLikeError(42), false);
  });

  it("returns false for undefined", () => {
    assert.equal(isAbortLikeError(undefined), false);
  });
});
