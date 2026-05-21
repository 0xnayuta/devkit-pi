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
  toDevkitConvertErrorPayload,
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

function commandResult(overrides: Partial<ExternalCommandResult> = {}): ExternalCommandResult {
  return {
    exitCode: 0,
    stdout: "# Converted\n",
    stderr: "",
    timedOut: false,
    outputTruncated: { stdout: false, stderr: false },
    ...overrides,
  };
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
      return options.result ?? commandResult();
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
      result: commandResult({ stdout: "# Converted\ndoc.pdf\n" }),
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
      result: commandResult({ exitCode: null, stdout: "", timedOut: true }),
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

  it("throws CONVERT_FAILED with redacted stderr summary on non-zero exit", async () => {
    const secret = "abcdefghijklmnopqrstuvwxyz123456";
    const runner = createRunner({
      result: commandResult({
        exitCode: 7,
        stdout: "",
        stderr: `very bad conversion failure api_key=${secret} https://example.com/doc.pdf?token=${secret}`,
      }),
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
        !error.message.includes(secret) &&
        error.message.includes("api_key=[REDACTED]") &&
        error.message.includes("token=[REDACTED]") &&
        error.causeSummary === "very bad conversion failure api_key=[REDACTED] https://example.com/doc.pdf?token=[REDACTED]"
    );
  });

  it("throws CONVERT_FAILED when external command output hits the hard byte limit", async () => {
    const runner = createRunner({
      result: commandResult({
        exitCode: null,
        stdout: "partial output",
        outputTruncated: { stdout: true, stderr: false },
      }),
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
        /stdout size limit/.test(error.message)
    );
  });

  it("truncates stdout to maxContentChars", async () => {
    const runner = createRunner({
      result: commandResult({ stdout: "abcdefghijklmnopqrstuvwxyz" }),
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

  it("bridges ConvertProviderError to DevkitErrorPayload without breaking current shape", () => {
    const error = new ConvertProviderError(
      CONVERT_ERROR_CODES.CONVERT_FAILED,
      "conversion failed",
      "stderr: parser crashed"
    );

    const payload = toDevkitConvertErrorPayload(error, {
      provider: "markitdown",
      remediation: "Verify input format and retry with a smaller file",
    });

    assert.equal(payload.module, "convert");
    assert.equal(payload.code, CONVERT_ERROR_CODES.CONVERT_FAILED);
    assert.equal(payload.message, "conversion failed");
    assert.equal(payload.provider, "markitdown");
    assert.equal(payload.causeSummary, "stderr: parser crashed");
    assert.equal(payload.retryable, false);
    assert.match(payload.remediation ?? "", /Verify input format/);
  });
});
