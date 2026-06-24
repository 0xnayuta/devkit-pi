import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, it } from "node:test";
import {
	createLspServers,
	getCppCompilationDbHint,
	LANGUAGE_IDS,
	type LspServerRegistryDeps,
} from "../../src/modules/lsp/server-registry.ts";

function createNoopDeps(): LspServerRegistryDeps {
	return {
		which: () => undefined,
		spawnSimple: () => async () => undefined,
		spawnKotlinLanguageServer: async () => undefined,
		spawnSourcekitLsp: async () => undefined,
		spawnProcess: () => {
			throw new Error("spawnProcess should not be called during registry construction");
		},
	};
}

describe("lsp server registry", () => {
	it("keeps LANGUAGE_IDS stable for core extensions", () => {
		assert.equal(LANGUAGE_IDS[".ts"], "typescript");
		assert.equal(LANGUAGE_IDS[".tsx"], "typescriptreact");
		assert.equal(LANGUAGE_IDS[".js"], "javascript");
		assert.equal(LANGUAGE_IDS[".py"], "python");
		assert.equal(LANGUAGE_IDS[".go"], "go");
		assert.equal(LANGUAGE_IDS[".kt"], "kotlin");
		assert.equal(LANGUAGE_IDS[".swift"], "swift");
		assert.equal(LANGUAGE_IDS[".rs"], "rust");
		assert.equal(LANGUAGE_IDS[".cpp"], "cpp");
	});

	it("keeps LSP server id inventory stable", () => {
		const servers = createLspServers(createNoopDeps());
		const ids = servers.map((s) => s.id).sort();

		assert.deepEqual(ids, [
			"clangd",
			"dart",
			"gopls",
			"kotlin",
			"pyright",
			"rust-analyzer",
			"svelte",
			"swift",
			"typescript",
			"vue",
		]);
	});

	it("typescript root detection skips deno projects", () => {
		const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "devkit-pi-lsp-reg-ts-"));
		const srcDir = path.join(workspace, "src");
		fs.mkdirSync(srcDir, { recursive: true });
		const file = path.join(srcDir, "main.ts");
		fs.writeFileSync(file, "export const x = 1;\n", "utf-8");

		fs.writeFileSync(path.join(workspace, "package.json"), "{}", "utf-8");
		fs.writeFileSync(path.join(workspace, "deno.json"), "{}", "utf-8");

		const tsServer = createLspServers(createNoopDeps()).find((s) => s.id === "typescript");
		assert.ok(tsServer);
		assert.equal(tsServer.findRoot(file, workspace), undefined);
	});

	it("clangd root detection finds C/C++ project markers", () => {
		const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "devkit-pi-lsp-reg-clangd-"));
		const srcDir = path.join(workspace, "src");
		fs.mkdirSync(srcDir, { recursive: true });
		const file = path.join(srcDir, "main.cpp");
		fs.writeFileSync(file, "int main() { return 0; }\n", "utf-8");
		fs.writeFileSync(path.join(workspace, "CMakeLists.txt"), "cmake_minimum_required(VERSION 3.16)\n", "utf-8");

		const clangdServer = createLspServers(createNoopDeps()).find((s) => s.id === "clangd");
		assert.ok(clangdServer);
		assert.equal(clangdServer.findRoot(file, workspace), workspace);
	});

	it("getCppCompilationDbHint returns actionable hint when compile_commands.json is missing", () => {
		const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "devkit-pi-lsp-reg-hint-missing-"));
		const srcDir = path.join(workspace, "src");
		fs.mkdirSync(srcDir, { recursive: true });
		fs.writeFileSync(path.join(workspace, "CMakeLists.txt"), "cmake_minimum_required(VERSION 3.16)\n", "utf-8");
		const file = path.join(srcDir, "main.cpp");
		fs.writeFileSync(file, "int main() { return 0; }\n", "utf-8");

		const hint = getCppCompilationDbHint(file, workspace);
		assert.ok(hint);
		assert.match(hint, /No compile_commands\.json found/i);
		assert.match(hint, /CMAKE_EXPORT_COMPILE_COMMANDS=1/);
	});

	it("getCppCompilationDbHint returns null when compile_commands.json exists", () => {
		const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "devkit-pi-lsp-reg-hint-present-"));
		const buildDir = path.join(workspace, "build");
		fs.mkdirSync(buildDir, { recursive: true });
		const srcDir = path.join(workspace, "src");
		fs.mkdirSync(srcDir, { recursive: true });
		fs.writeFileSync(path.join(workspace, "CMakeLists.txt"), "cmake_minimum_required(VERSION 3.16)\n", "utf-8");
		fs.writeFileSync(path.join(buildDir, "compile_commands.json"), "[]\n", "utf-8");
		const file = path.join(srcDir, "main.cpp");
		fs.writeFileSync(file, "int main() { return 0; }\n", "utf-8");

		assert.equal(getCppCompilationDbHint(file, workspace), null);
	});
});
