import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const sourceImportPattern = /from\s+["'](@earendil-works\/[^"']+)["']|import\s+["'](@earendil-works\/[^"']+)["']/g;

function collectTsFiles(dir: string): string[] {
	const files: string[] = [];
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const entryPath = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			files.push(...collectTsFiles(entryPath));
		} else if (entry.name.endsWith(".ts")) {
			files.push(entryPath);
		}
	}
	return files;
}

test("direct @earendil-works runtime imports are declared for CI installs", () => {
	const packageJson = JSON.parse(fs.readFileSync(path.join(projectRoot, "package.json"), "utf-8"));
	const declared = new Set([
		...Object.keys(packageJson.dependencies ?? {}),
		...Object.keys(packageJson.devDependencies ?? {}),
	]);
	const imported = new Set<string>();

	for (const file of [
		...collectTsFiles(path.join(projectRoot, "src")),
		...collectTsFiles(path.join(projectRoot, "tests")),
	]) {
		const source = fs.readFileSync(file, "utf-8");
		for (const match of source.matchAll(sourceImportPattern)) {
			imported.add(match[1] ?? match[2]!);
		}
	}

	const missing = [...imported].filter((specifier) => !declared.has(specifier)).sort();
	assert.deepEqual(missing, []);
});

test("package.json declares minimum supported Node.js runtime", () => {
	const packageJson = JSON.parse(fs.readFileSync(path.join(projectRoot, "package.json"), "utf-8"));
	assert.equal(typeof packageJson.engines?.node, "string");
	assert.match(packageJson.engines.node, /^>=\d+\.\d+\.\d+$/);
});
