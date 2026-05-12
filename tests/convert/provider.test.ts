import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import {
  CONVERT_ERROR_CODES,
  ConvertProviderError,
  MarkItDownProvider,
} from "../../src/modules/convert/index.ts";

let tempDir = "";

function writeExecutable(name: string, content: string): string {
  const filePath = path.join(tempDir, name);
  fs.writeFileSync(filePath, content, "utf8");
  fs.chmodSync(filePath, 0o755);
  return filePath;
}

function writeInput(name = "input.pdf", content = "input"): string {
  const filePath = path.join(tempDir, name);
  fs.writeFileSync(filePath, content, "utf8");
  return filePath;
}

function provider(command: string): MarkItDownProvider {
  return new MarkItDownProvider({
    command,
    env: { ...process.env, PATH: `${tempDir}${path.delimiter}${process.env.PATH ?? ""}` },
  });
}

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "devkit-pi-convert-provider-"));
});

afterEach(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe("MarkItDownProvider", () => {
  it("reports command availability and caches the result", async () => {
    writeExecutable(
      "markitdown",
      `#!/usr/bin/env node\nconsole.log("available");\n`
    );
    const instance = provider("markitdown");

    assert.equal(await instance.isAvailable(), true);
    fs.rmSync(path.join(tempDir, "markitdown"));
    assert.equal(await instance.isAvailable(), true);
  });

  it("reports missing commands as unavailable", async () => {
    const instance = provider("missing-markitdown");
    assert.equal(await instance.isAvailable(), false);
  });

  it("converts a file by invoking the CLI and returns metadata", async () => {
    const command = writeExecutable(
      "mock-markitdown",
      `#!/usr/bin/env node\nconsole.log("# Converted");\nconsole.log(process.argv[2]);\n`
    );
    const input = writeInput("doc.pdf", "pdf bytes");

    const result = await provider(command).convertFile(input, {
      maxResponseBytes: 1024,
      timeoutMs: 1000,
      maxContentChars: 1000,
    });

    assert.match(result.content, /# Converted/);
    assert.match(result.content, /doc\.pdf/);
    assert.equal(result.truncated, false);
    assert.equal(result.metadata?.fileName, "doc.pdf");
    assert.equal(result.metadata?.fileSize, Buffer.byteLength("pdf bytes"));
    assert.equal(typeof result.metadata?.durationMs, "number");
  });

  it("throws COMMAND_NOT_FOUND for missing commands", async () => {
    const input = writeInput();
    await assert.rejects(
      () =>
        provider("missing-markitdown").convertFile(input, {
          maxResponseBytes: 1024,
          timeoutMs: 1000,
          maxContentChars: 1000,
        }),
      (error: unknown) =>
        error instanceof ConvertProviderError &&
        error.code === CONVERT_ERROR_CODES.COMMAND_NOT_FOUND &&
        /not found/.test(error.message)
    );
  });

  it("throws FILE_TOO_LARGE when input exceeds maxResponseBytes", async () => {
    const command = writeExecutable("mock-markitdown", `#!/usr/bin/env node\nconsole.log("ok");\n`);
    const input = writeInput("large.pdf", "1234567890");

    await assert.rejects(
      () =>
        provider(command).convertFile(input, {
          maxResponseBytes: 5,
          timeoutMs: 1000,
          maxContentChars: 1000,
        }),
      (error: unknown) =>
        error instanceof ConvertProviderError && error.code === CONVERT_ERROR_CODES.FILE_TOO_LARGE
    );
  });

  it("throws CONVERT_TIMEOUT when the CLI exceeds timeout", async () => {
    const command = writeExecutable(
      "mock-markitdown",
      `#!/usr/bin/env node\nsetTimeout(() => console.log("late"), 2000);\n`
    );
    const input = writeInput();

    await assert.rejects(
      () =>
        provider(command).convertFile(input, {
          maxResponseBytes: 1024,
          timeoutMs: 50,
          maxContentChars: 1000,
        }),
      (error: unknown) =>
        error instanceof ConvertProviderError && error.code === CONVERT_ERROR_CODES.CONVERT_TIMEOUT
    );
  });

  it("throws CONVERT_FAILED with stderr summary on non-zero exit", async () => {
    const command = writeExecutable(
      "mock-markitdown",
      `#!/usr/bin/env node\nconsole.error("very bad conversion failure");\nprocess.exit(7);\n`
    );
    const input = writeInput();

    await assert.rejects(
      () =>
        provider(command).convertFile(input, {
          maxResponseBytes: 1024,
          timeoutMs: 1000,
          maxContentChars: 1000,
        }),
      (error: unknown) =>
        error instanceof ConvertProviderError &&
        error.code === CONVERT_ERROR_CODES.CONVERT_FAILED &&
        /exit code 7/.test(error.message) &&
        /very bad conversion failure/.test(error.message) &&
        error.causeSummary === "very bad conversion failure"
    );
  });

  it("truncates stdout to maxContentChars", async () => {
    const command = writeExecutable(
      "mock-markitdown",
      `#!/usr/bin/env node\nprocess.stdout.write("abcdefghijklmnopqrstuvwxyz");\n`
    );
    const input = writeInput();

    const result = await provider(command).convertFile(input, {
      maxResponseBytes: 1024,
      timeoutMs: 1000,
      maxContentChars: 10,
    });

    assert.equal(result.content, "abcdefghij");
    assert.equal(result.truncated, true);
  });
});
