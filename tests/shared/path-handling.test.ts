import assert from "node:assert/strict";
import * as path from "node:path";
import { describe, it } from "node:test";

/**
 * Tests for cross-platform path handling patterns used throughout the codebase.
 * These tests document the correct patterns after fixes were applied.
 *
 * Fixed locations:
 * - chain-execution.ts — uses path.isAbsolute() for absolute path detection
 * - settings.ts — uses path.join() for path construction
 */

describe("path handling", () => {
	it("path.isAbsolute is correct cross-platform check", () => {
		// Relative paths
		assert.equal(path.isAbsolute("output.md"), false);
		assert.equal(path.isAbsolute("subdir/output.md"), false);

		// startsWith('/') misses Windows paths
		assert.equal("C:\\dev\\output.md".startsWith("/"), false);
		assert.equal("C:/dev/output.md".startsWith("/"), false);

		// path.isAbsolute is platform-aware
		if (process.platform === "win32") {
			assert.equal(path.isAbsolute("C:\\output.md"), true);
			assert.equal(path.isAbsolute("C:/output.md"), true);
		}
		assert.equal(path.isAbsolute("/home/user/output.md"), true);
	});

	it("path.join produces consistent separators", () => {
		const chainDir = "C:\\Users\\marc\\temp\\chain-abc";
		const file = "progress.md";

		// Template produces mixed separators on Windows
		const templateResult = `${chainDir}/${file}`;
		assert.equal(templateResult, "C:\\Users\\marc\\temp\\chain-abc/progress.md");

		// path.join uses native separator
		const joinResult = path.join(chainDir, file);
		if (process.platform === "win32") {
			assert.equal(joinResult, "C:\\Users\\marc\\temp\\chain-abc\\progress.md");
			assert.notEqual(templateResult, joinResult);
		}
	});

	it("parallel subdir uses native separators", () => {
		const windowsSubdir = path.join("parallel-0", "0-_code-reviewer");
		const result = path.join(windowsSubdir, "review.md");
		assert.equal(result, path.join("parallel-0", "0-_code-reviewer", "review.md"));
	});
});

