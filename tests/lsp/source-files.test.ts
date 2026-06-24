import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, it } from "node:test";
import type { DocumentSymbol } from "vscode-languageserver-protocol";
import {
	findSymbolPosition,
	LspFileTooLargeError,
	type PositionResolverManager,
	readTextFileLimited,
	resolvePosition,
	uriToPath,
} from "../../src/modules/lsp/source-files.ts";

describe("lsp source-files", () => {
	it("findSymbolPosition prefers exact match over partial match", () => {
		const symbols: DocumentSymbol[] = [
			{
				name: "helperMethod",
				kind: 6,
				range: { start: { line: 3, character: 2 }, end: { line: 3, character: 20 } },
				selectionRange: { start: { line: 3, character: 2 }, end: { line: 3, character: 14 } },
			},
			{
				name: "method",
				kind: 6,
				range: { start: { line: 8, character: 2 }, end: { line: 8, character: 12 } },
				selectionRange: { start: { line: 8, character: 2 }, end: { line: 8, character: 8 } },
			},
		];

		assert.deepEqual(findSymbolPosition(symbols, "method"), { line: 8, character: 2 });
		assert.deepEqual(findSymbolPosition(symbols, "helper"), { line: 3, character: 2 });
		assert.equal(findSymbolPosition(symbols, "missing"), null);
	});

	it("resolvePosition refines symbol position from source content", async () => {
		const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "devkit-pi-lsp-source-files-"));
		const file = path.join(workspace, "sample.ts");
		fs.writeFileSync(
			file,
			["export class Demo {", "  // comment", "  public targetMethod() {", "    return 1;", "  }", "}", ""].join(
				"\n"
			),
			"utf-8"
		);

		const symbols: DocumentSymbol[] = [
			{
				name: "targetMethod",
				kind: 6,
				range: { start: { line: 1, character: 0 }, end: { line: 3, character: 3 } },
				selectionRange: { start: { line: 1, character: 0 }, end: { line: 1, character: 12 } },
			},
		];

		const manager: PositionResolverManager = {
			async getDocumentSymbols() {
				return symbols;
			},
			resolveFilePath() {
				return file;
			},
		};

		const resolved = await resolvePosition(manager, "sample.ts", "targetMethod");
		assert.deepEqual(resolved, { line: 3, column: 10 });
	});

	it("resolvePosition falls back to symbol position when source refinement cannot run", async () => {
		const symbols: DocumentSymbol[] = [
			{
				name: "targetMethod",
				kind: 6,
				range: { start: { line: 5, character: 1 }, end: { line: 7, character: 1 } },
				selectionRange: { start: { line: 5, character: 4 }, end: { line: 5, character: 16 } },
			},
		];

		const manager: PositionResolverManager = {
			async getDocumentSymbols() {
				return symbols;
			},
			resolveFilePath() {
				return path.join(os.tmpdir(), `missing-${Date.now()}.ts`);
			},
		};

		const resolved = await resolvePosition(manager, "missing.ts", "targetMethod");
		assert.deepEqual(resolved, { line: 6, column: 5 });
	});

	it("readTextFileLimited reads small files", () => {
		const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "devkit-pi-lsp-source-read-"));
		const file = path.join(workspace, "small.txt");
		fs.writeFileSync(file, "hello", "utf-8");

		assert.equal(readTextFileLimited(file, 16), "hello");
	});

	it("readTextFileLimited throws LspFileTooLargeError with stable metadata", () => {
		const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "devkit-pi-lsp-source-large-"));
		const file = path.join(workspace, "large.txt");
		fs.writeFileSync(file, "0123456789", "utf-8");

		assert.throws(
			() => readTextFileLimited(file, 4),
			(error: unknown) => {
				assert.ok(error instanceof LspFileTooLargeError);
				assert.equal(error.filePath, file);
				assert.equal(error.maxBytes, 4);
				assert.equal(error.sizeBytes, 10);
				assert.equal(error.message, `LSP source file is too large (10 bytes; max 4 bytes): ${file}`);
				return true;
			}
		);
	});

	it("resolvePosition falls back when source refinement hits file size limit", async () => {
		const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "devkit-pi-lsp-source-refine-"));
		const file = path.join(workspace, "oversized.ts");
		fs.writeFileSync(file, "x".repeat(3 * 1024 * 1024), "utf-8");

		const symbols: DocumentSymbol[] = [
			{
				name: "targetMethod",
				kind: 6,
				range: { start: { line: 20, character: 1 }, end: { line: 21, character: 1 } },
				selectionRange: { start: { line: 20, character: 7 }, end: { line: 20, character: 19 } },
			},
		];

		const manager: PositionResolverManager = {
			async getDocumentSymbols() {
				return symbols;
			},
			resolveFilePath() {
				return file;
			},
		};

		const resolved = await resolvePosition(manager, "oversized.ts", "targetMethod");
		assert.deepEqual(resolved, { line: 21, column: 8 });
	});

	it("uriToPath handles file URLs and non-file inputs", () => {
		assert.equal(uriToPath("file:///tmp/demo%20file.ts"), "/tmp/demo file.ts");
		assert.equal(uriToPath("https://example.com/a.ts"), "https://example.com/a.ts");
		assert.equal(uriToPath("file:///%E0%A4%A"), "file:///%E0%A4%A");
	});
});
