import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createDevkitErrorPayload,
  ERROR_CODES,
  LspError,
  toDevkitErrorPayload,
} from "../../src/shared/errors.ts";

describe("shared errors payload", () => {
  it("creates normalized payload with conservative defaults", () => {
    const payload = createDevkitErrorPayload({
      code: ERROR_CODES.INVALID_INPUT,
      message: "invalid request",
      module: "subagents",
    });

    assert.deepEqual(payload, {
      code: ERROR_CODES.INVALID_INPUT,
      message: "invalid request",
      module: "subagents",
      provider: undefined,
      causeSummary: undefined,
      retryable: false,
      remediation: undefined,
    });
  });

  it("maps LspError to devkit payload", () => {
    const payload = toDevkitErrorPayload(
      new LspError(ERROR_CODES.LSP_ACTION_NOT_ALLOWED, "blocked")
    );

    assert.equal(payload.code, ERROR_CODES.LSP_ACTION_NOT_ALLOWED);
    assert.equal(payload.module, "lsp");
    assert.equal(payload.message, "blocked");
    assert.equal(payload.retryable, false);
  });

  it("maps unknown errors to INTERNAL_ERROR payload", () => {
    const fromError = toDevkitErrorPayload(new Error("boom"));
    assert.equal(fromError.code, "INTERNAL_ERROR");
    assert.equal(fromError.module, "commands");
    assert.equal(fromError.message, "boom");

    const fromString = toDevkitErrorPayload("oops");
    assert.equal(fromString.code, "INTERNAL_ERROR");
    assert.equal(fromString.message, "oops");
  });

  it("uses moduleHint for non-specialized errors and keeps LspError precedence", () => {
    const fromError = toDevkitErrorPayload(new Error("guard boom"), {
      moduleHint: "guards",
    });
    assert.equal(fromError.code, "INTERNAL_ERROR");
    assert.equal(fromError.module, "guards");

    const fromString = toDevkitErrorPayload("guard oops", { moduleHint: "guards" });
    assert.equal(fromString.code, "INTERNAL_ERROR");
    assert.equal(fromString.module, "guards");

    const lspPayload = toDevkitErrorPayload(
      new LspError(ERROR_CODES.LSP_TIMEOUT, "lsp timeout"),
      { moduleHint: "guards" }
    );
    assert.equal(lspPayload.module, "lsp");
    assert.equal(lspPayload.code, ERROR_CODES.LSP_TIMEOUT);
  });

  it("supports explicit module-scoped payloads for commands and guards", () => {
    const commandsPayload = createDevkitErrorPayload({
      code: "COMMAND_EXECUTION_FAILED",
      message: "toolkit command failed",
      module: "commands",
      retryable: false,
    });
    assert.equal(commandsPayload.module, "commands");
    assert.equal(commandsPayload.code, "COMMAND_EXECUTION_FAILED");

    const guardsPayload = createDevkitErrorPayload({
      code: "GUARD_RUNTIME_ERROR",
      message: "guard callback failed",
      module: "guards",
      retryable: true,
      remediation: "Retry in a clean session",
    });
    assert.equal(guardsPayload.module, "guards");
    assert.equal(guardsPayload.retryable, true);
    assert.equal(guardsPayload.remediation, "Retry in a clean session");
  });
});
