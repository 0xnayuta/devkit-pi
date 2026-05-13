import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import {
  type ExternalCommandResolveOptions,
  type ExternalCommandResult,
  type ExternalCommandRunner,
  type ExternalCommandSpec,
} from "../../src/shared/external-command.ts";
import {
  CONVERT_ERROR_CODES,
  ConvertProviderError,
  MarkItDownProvider,
} from "../../src/modules/convert/index.ts";

let tempDir = "";

interface RunnerCall {
  command: ExternalCommandSpec;
  options?: ExternalCommandResolveOptions;
}

function writeInput(name = "input.pdf", content = "input"): string {
  const filePath = path.join(tempDir, name);
  fs.writeFileSync(filePath, content, "utf8");
  return filePath;
}

function createRunner(options: {
  available?: boolean;
  result?: ExternalCommandResult;
  error?: NodeJS.ErrnoException;
}): ExternalCommandRunner & { availabilityCalls: RunnerCall[]; runCalls: RunnerCall[] } {
  const availabilityCalls: RunnerCall[] = [];
  const runCalls: RunnerCall[] = [];
  return {
    availabilityCalls,
    runCalls,
    async isAvailable(command, resolveOptions) {
      availabilityCalls.push({ command, options: resolveOptions });
      return options.available ?? true;
    },
    async run(command, runOptions) {
      runCalls.push({ command, options: runOptions });
      if (options.error) throw options.error;
      return (
        options.result ?? {
          exitCode: 0,
          stdout: "# Converted\n",
          stderr: "",
          timedOut: false,
        }
      );
    },
  };
}

function provider(
  runner: ExternalCommandRunner,
  command: string | ExternalCommandSpec = "markitdown"
): MarkItDownProvider {
  return new MarkItDownProvider({
    command,
    runner,
    env: { ...process.env, TEST_PROVIDER_ENV: "1" },
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
    const runner = createRunner({ available: true });
    const instance = provider(runner);

    assert.equal(await instance.isAvailable(), true);
    assert.equal(await instance.isAvailable(), true);
    assert.equal(runner.availabilityCalls.length, 1);
  });

  it("reports missing commands as unavailable", async () => {
    const runner = createRunner({ available: false });
    const instance = provider(runner, "missing-markitdown");

    assert.equal(await instance.isAvailable(), false);
  });

  it("converts a file by invoking the configured command and returns metadata", async () => {
    const runner = createRunner({
      result: { exitCode: 0, stdout: "# Converted\ndoc.pdf\n", stderr: "", timedOut: false },
    });
    const input = writeInput("doc.pdf", "pdf bytes");

    const result = await provider(runner, { executable: "markitdown", args: ["--format", "md"] }).convertFile(
      input,
      {
        maxResponseBytes: 1024,
        timeoutMs: 1000,
        maxContentChars: 1000,
      }
    );

    assert.match(result.content, /# Converted/);
    assert.match(result.content, /doc\.pdf/);
    assert.equal(result.truncated, false);
    assert.equal(result.metadata?.fileName, "doc.pdf");
    assert.equal(result.metadata?.fileSize, Buffer.byteLength("pdf bytes"));
    assert.equal(typeof result.metadata?.durationMs, "number");
    assert.deepEqual(runner.runCalls[0]?.command, {
      executable: "markitdown",
      args: ["--format", "md", input],
    });
  });

  it("throws COMMAND_NOT_FOUND for missing commands", async () => {
    const runner = createRunner({ available: false });
    const input = writeInput();

    await assert.rejects(
      () =>
        provider(runner, "missing-markitdown").convertFile(input, {
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

  it("throws FILE_TOO_LARGE when input exceeds maxResponseBytes before invoking the runner", async () => {
    const runner = createRunner({ available: true });
    const input = writeInput("large.pdf", "1234567890");

    await assert.rejects(
      () =>
        provider(runner).convertFile(input, {
          maxResponseBytes: 5,
          timeoutMs: 1000,
          maxContentChars: 1000,
        }),
      (error: unknown) =>
        error instanceof ConvertProviderError && error.code === CONVERT_ERROR_CODES.FILE_TOO_LARGE
    );
    assert.equal(runner.runCalls.length, 0);
  });

  it("throws CONVERT_TIMEOUT when the CLI exceeds timeout", async () => {
    const runner = createRunner({
      result: { exitCode: null, stdout: "", stderr: "", timedOut: true },
    });
    const input = writeInput();

    await assert.rejects(
      () =>
        provider(runner).convertFile(input, {
          maxResponseBytes: 1024,
          timeoutMs: 50,
          maxContentChars: 1000,
        }),
      (error: unknown) =>
        error instanceof ConvertProviderError && error.code === CONVERT_ERROR_CODES.CONVERT_TIMEOUT
    );
  });

  it("throws CONVERT_FAILED with stderr summary on non-zero exit", async () => {
    const runner = createRunner({
      result: {
        exitCode: 7,
        stdout: "",
        stderr: "very bad conversion failure",
        timedOut: false,
      },
    });
    const input = writeInput();

    await assert.rejects(
      () =>
        provider(runner).convertFile(input, {
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
    const runner = createRunner({
      result: {
        exitCode: 0,
        stdout: "abcdefghijklmnopqrstuvwxyz",
        stderr: "",
        timedOut: false,
      },
    });
    const input = writeInput();

    const result = await provider(runner).convertFile(input, {
      maxResponseBytes: 1024,
      timeoutMs: 1000,
      maxContentChars: 10,
    });

    assert.equal(result.content, "abcdefghij");
    assert.equal(result.truncated, true);
  });
});
