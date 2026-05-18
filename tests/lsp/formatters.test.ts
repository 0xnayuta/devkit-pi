import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Diagnostic, DocumentSymbol } from "vscode-languageserver-protocol";
import {
  collectSymbols,
  filterDiagnosticsBySeverity,
  formatDiagnostic,
} from "../../src/modules/lsp/formatters.ts";

describe("lsp formatters", () => {
  it("formats diagnostics with severity and 1-based positions", () => {
    const diag: Diagnostic = {
      range: {
        start: { line: 2, character: 4 },
        end: { line: 2, character: 8 },
      },
      message: "something went wrong",
      severity: 2,
    };

    assert.equal(formatDiagnostic(diag), "WARN [3:5] something went wrong");
  });

  it("filters diagnostics by severity", () => {
    const diags: Diagnostic[] = [
      {
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
        message: "error",
        severity: 1,
      },
      {
        range: { start: { line: 1, character: 0 }, end: { line: 1, character: 1 } },
        message: "warning",
        severity: 2,
      },
      {
        range: { start: { line: 2, character: 0 }, end: { line: 2, character: 1 } },
        message: "info",
        severity: 3,
      },
      {
        range: { start: { line: 3, character: 0 }, end: { line: 3, character: 1 } },
        message: "hint",
        severity: 4,
      },
    ];

    assert.equal(filterDiagnosticsBySeverity(diags, "all").length, 4);
    assert.deepEqual(filterDiagnosticsBySeverity(diags, "error").map((d) => d.message), ["error"]);
    assert.deepEqual(filterDiagnosticsBySeverity(diags, "warning").map((d) => d.message), [
      "error",
      "warning",
    ]);
    assert.deepEqual(filterDiagnosticsBySeverity(diags, "info").map((d) => d.message), [
      "error",
      "warning",
      "info",
    ]);
    assert.deepEqual(filterDiagnosticsBySeverity(diags, "hint").map((d) => d.message), [
      "error",
      "warning",
      "info",
      "hint",
    ]);
  });

  it("collects symbols with depth, query, and selectionRange fallback", () => {
    const symbols: DocumentSymbol[] = [
      {
        name: "RootClass",
        kind: 5,
        range: { start: { line: 0, character: 0 }, end: { line: 10, character: 0 } },
        selectionRange: { start: { line: 0, character: 6 }, end: { line: 0, character: 15 } },
        children: [
          {
            name: "methodOne",
            kind: 6,
            range: { start: { line: 2, character: 2 }, end: { line: 4, character: 2 } },
            selectionRange: { start: { line: 2, character: 4 }, end: { line: 2, character: 13 } },
          },
          {
            name: "fieldNoSelection",
            kind: 8,
            range: { start: { line: 5, character: 2 }, end: { line: 5, character: 20 } },
            selectionRange: undefined as any,
          },
        ],
      },
    ];

    const allLines = collectSymbols(symbols);
    assert.deepEqual(allLines, [
      "RootClass (1:7)",
      "  methodOne (3:5)",
      "  fieldNoSelection (6:3)",
    ]);

    const queryLines = collectSymbols(symbols, 0, [], "method");
    assert.deepEqual(queryLines, ["  methodOne (3:5)"]);
  });
});
