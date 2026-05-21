import assert from "node:assert/strict";
import * as fs from "node:fs";
import http from "node:http";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, it, mock } from "node:test";
import { mergeConfig } from "../../src/config/load-config.ts";
import { getConvertToolStats, resetConvertToolStats } from "../../src/modules/convert/observability.ts";
import { clearActivityLog, getActivityLog } from "../../src/modules/web/observability.ts";
import { CONVERT_ERROR_CODES, ConvertProviderError } from "../../src/modules/convert/index.ts";
import type { ConvertProvider, ConvertResult } from "../../src/modules/convert/provider.ts";
import { convertContent } from "../../src/modules/convert/tool.ts";

class MockProvider implements ConvertProvider {
  readonly name = "markitdown";

  calls: Array<{ filePath: string; timeoutMs: number; maxContentChars: number; maxResponseBytes: number }> = [];

  result: ConvertResult = {
    content: "# Converted",
    truncated: false,
    metadata: { contentType: "application/pdf" },
  };

  error: unknown;

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async convertFile(
    filePath: string,
    options: { maxResponseBytes: number; timeoutMs: number; maxContentChars: number }
  ): Promise<ConvertResult> {
    this.calls.push({ filePath, ...options });
    if (this.error) throw this.error;
    return this.result;
  }
}

let tempDir = "";
let originalCwd = "";

function writeFile(name: string, content: string): string {
  const filePath = path.join(tempDir, name);
  fs.writeFileSync(filePath, content, "utf8");
  return filePath;
}

function errorCode(result: Awaited<ReturnType<typeof convertContent>>): string | undefined {
  return "error" in result ? result.error.code : undefined;
}

function errorMessage(result: Awaited<ReturnType<typeof convertContent>>): string | undefined {
  return "error" in result ? result.error.message : undefined;
}

beforeEach(() => {
  clearActivityLog();
  resetConvertToolStats();
  originalCwd = process.cwd();
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "devkit-pi-convert-tool-"));
  process.chdir(tempDir);
});

afterEach(() => {
  process.chdir(originalCwd);
  fs.rmSync(tempDir, { recursive: true, force: true });
  resetConvertToolStats();
});

describe("convertContent local path", () => {
  it("rejects missing or conflicting sources", async () => {
    const provider = new MockProvider();
    const config = mergeConfig({}).convertContent;

    const missing = await convertContent({}, config, undefined, provider);
    assert.equal(errorCode(missing), CONVERT_ERROR_CODES.INVALID_INPUT);

    const both = await convertContent(
      { path: "/tmp/a.pdf", url: "https://example.com/a.pdf" },
      config,
      undefined,
      provider
    );
    assert.equal(errorCode(both), CONVERT_ERROR_CODES.INVALID_INPUT);
    assert.equal(getActivityLog().filter((entry) => entry.type === "convert").length, 2);
    assert.equal(getConvertToolStats().errorCount, 2);
  });

  it("returns FILE_NOT_FOUND for missing paths and directories", async () => {
    const provider = new MockProvider();
    const config = mergeConfig({}).convertContent;

    const missing = await convertContent({ path: path.join(tempDir, "missing.pdf") }, config, undefined, provider);
    assert.equal(errorCode(missing), CONVERT_ERROR_CODES.FILE_NOT_FOUND);

    const directory = await convertContent({ path: "." }, config, undefined, provider);
    assert.equal(errorCode(directory), CONVERT_ERROR_CODES.FILE_NOT_FOUND);
  });

  it("rejects local paths outside the workspace", async () => {
    const provider = new MockProvider();
    const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), "devkit-pi-convert-outside-"));
    try {
      const outsideFile = path.join(outsideDir, "outside.pdf");
      fs.writeFileSync(outsideFile, "pdf", "utf8");
      const config = mergeConfig({}).convertContent;

      const result = await convertContent({ path: outsideFile }, config, undefined, provider);

      assert.equal(errorCode(result), CONVERT_ERROR_CODES.INVALID_INPUT);
      assert.match(errorMessage(result) ?? "", /outside workspace/);
      assert.equal(provider.calls.length, 0);
    } finally {
      fs.rmSync(outsideDir, { recursive: true, force: true });
    }
  });

  it("returns FILE_TOO_LARGE before calling provider", async () => {
    const provider = new MockProvider();
    const filePath = writeFile("large.pdf", "1234567890");
    const config = mergeConfig({ convertContent: { maxResponseBytes: 5 } }).convertContent;

    const result = await convertContent({ path: filePath }, config, undefined, provider);

    assert.equal(errorCode(result), CONVERT_ERROR_CODES.FILE_TOO_LARGE);
    assert.equal(provider.calls.length, 0);
  });

  it("converts local path and applies per-call option overrides", async () => {
    const provider = new MockProvider();
    provider.result = {
      content: "# Converted local file",
      truncated: true,
      metadata: { fileName: "doc.pdf", fileSize: 3, durationMs: 12 },
    };
    const filePath = writeFile("doc.pdf", "pdf");
    const config = mergeConfig({}).convertContent;

    const result = await convertContent(
      { path: filePath, timeoutMs: 1111, maxContentChars: 2222 },
      config,
      undefined,
      provider
    );

    assert.equal("error" in result, false);
    if ("error" in result) return;
    assert.equal(result.source, path.resolve(filePath));
    assert.equal(result.provider, "markitdown");
    assert.equal(result.content, "# Converted local file");
    assert.equal(result.truncated, true);
    assert.deepEqual(result.metadata, { fileName: "doc.pdf", fileSize: 3, durationMs: 12 });
    assert.equal(provider.calls.length, 1);
    assert.equal(provider.calls[0].filePath, path.resolve(filePath));
    assert.equal(provider.calls[0].timeoutMs, 1111);
    assert.equal(provider.calls[0].maxContentChars, 2222);
    const entries = getActivityLog();
    assert.equal(entries.at(-1)?.type, "convert");
    assert.equal(entries.at(-1)?.status, "success");
    assert.equal(getConvertToolStats().successCount, 1);
  });

  it("maps provider errors to tool errors", async () => {
    const provider = new MockProvider();
    provider.error = new ConvertProviderError(CONVERT_ERROR_CODES.COMMAND_NOT_FOUND, "missing markitdown");
    const filePath = writeFile("doc.pdf", "pdf");
    const config = mergeConfig({}).convertContent;

    const result = await convertContent({ path: filePath }, config, undefined, provider);

    assert.equal(errorCode(result), CONVERT_ERROR_CODES.COMMAND_NOT_FOUND);
    assert.equal(errorMessage(result), "missing markitdown");
    const entries = getActivityLog();
    assert.equal(entries.at(-1)?.type, "convert");
    assert.equal(entries.at(-1)?.status, "error");
    assert.equal(entries.at(-1)?.error, CONVERT_ERROR_CODES.COMMAND_NOT_FOUND);
    assert.equal(getConvertToolStats().errorCount, 1);
  });

  it("downloads URL input safely before converting and removes the temp file", async () => {
    const provider = new MockProvider();
    const seenTempPaths: string[] = [];
    provider.result = { content: "# URL converted", truncated: false, metadata: { durationMs: 7 } };
    provider.convertFile = async (filePath, options) => {
      seenTempPaths.push(filePath);
      assert.equal(fs.readFileSync(filePath, "utf8"), "remote pdf");
      provider.calls.push({ filePath, ...options });
      return provider.result;
    };

    const server = http.createServer((req, res) => {
      assert.equal(req.url, "/doc.pdf");
      res.writeHead(200, { "content-type": "application/pdf" });
      res.end("remote pdf");
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const address = server.address();
      assert.ok(address && typeof address === "object");
      const url = `http://127.0.0.1:${address.port}/doc.pdf`;
      const config = mergeConfig({ convertContent: { allowPrivateNetwork: true } }).convertContent;

      const result = await convertContent({ url }, config, undefined, provider);

      assert.equal("error" in result, false);
      if ("error" in result) return;
      assert.equal(result.source, url);
      assert.equal(result.content, "# URL converted");
      assert.equal(result.metadata?.contentType, "application/pdf");
      assert.equal(result.metadata?.fileName, "doc.pdf");
      assert.equal(result.metadata?.fileSize, "remote pdf".length);
      assert.equal(provider.calls.length, 1);
      assert.equal(fs.existsSync(seenTempPaths[0]), false);
    } finally {
      server.close();
    }
  });

  it("blocks private network URLs by default", async () => {
    const provider = new MockProvider();
    const config = mergeConfig({}).convertContent;

    const result = await convertContent({ url: "http://127.0.0.1/doc.pdf" }, config, undefined, provider);

    assert.equal(errorCode(result), CONVERT_ERROR_CODES.PRIVATE_NETWORK_BLOCKED);
    assert.equal(provider.calls.length, 0);
  });

  it("blocks redirects to private network URLs", async () => {
    const provider = new MockProvider();
    const fetchMock = mock.method(globalThis, "fetch", async () => {
      return new Response(null, { status: 302, headers: { location: "http://127.0.0.1/secret.pdf" } });
    });
    const config = mergeConfig({}).convertContent;

    try {
      const result = await convertContent({ url: "https://93.184.216.34/doc.pdf" }, config, undefined, provider);

      assert.equal(errorCode(result), CONVERT_ERROR_CODES.PRIVATE_NETWORK_BLOCKED);
      assert.equal(provider.calls.length, 0);
      assert.equal(fetchMock.mock.callCount(), 1);
    } finally {
      fetchMock.mock.restore();
    }
  });

  it("follows manual redirects and converts the final downloaded file", async () => {
    const provider = new MockProvider();
    const calls: string[] = [];
    const fetchMock = mock.method(globalThis, "fetch", async (input: string | URL | Request) => {
      const url = String(input);
      calls.push(url);
      if (url === "https://93.184.216.34/start.pdf") {
        return new Response(null, { status: 302, headers: { location: "/final.pdf" } });
      }
      if (url === "https://93.184.216.34/final.pdf") {
        return new Response("final remote pdf", {
          status: 200,
          headers: { "content-type": "application/pdf" },
        });
      }
      return new Response("unexpected", { status: 500 });
    });
    const config = mergeConfig({}).convertContent;

    try {
      const result = await convertContent(
        { url: "https://93.184.216.34/start.pdf" },
        config,
        undefined,
        provider
      );

      assert.equal("error" in result, false);
      if ("error" in result) return;
      assert.equal(result.source, "https://93.184.216.34/start.pdf");
      assert.equal(provider.calls.length, 1);
      assert.deepEqual(calls, [
        "https://93.184.216.34/start.pdf",
        "https://93.184.216.34/final.pdf",
      ]);
    } finally {
      fetchMock.mock.restore();
    }
  });

  it("removes the downloaded temp file when URL conversion fails", async () => {
    const provider = new MockProvider();
    const seenTempPaths: string[] = [];
    provider.convertFile = async (filePath, options) => {
      seenTempPaths.push(filePath);
      provider.calls.push({ filePath, ...options });
      throw new ConvertProviderError(CONVERT_ERROR_CODES.CONVERT_FAILED, "provider failed");
    };

    const server = http.createServer((_req, res) => {
      res.writeHead(200, { "content-type": "application/pdf" });
      res.end("remote pdf");
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const address = server.address();
      assert.ok(address && typeof address === "object");
      const url = `http://127.0.0.1:${address.port}/doc.pdf`;
      const config = mergeConfig({ convertContent: { allowPrivateNetwork: true } }).convertContent;

      const result = await convertContent({ url }, config, undefined, provider);

      assert.equal(errorCode(result), CONVERT_ERROR_CODES.CONVERT_FAILED);
      assert.equal(provider.calls.length, 1);
      assert.equal(fs.existsSync(seenTempPaths[0]), false);
    } finally {
      server.close();
    }
  });

  it("rejects unsupported URL protocols before fetching", async () => {
    const provider = new MockProvider();
    const config = mergeConfig({}).convertContent;

    const result = await convertContent({ url: "file:///tmp/doc.pdf" }, config, undefined, provider);

    assert.equal(errorCode(result), CONVERT_ERROR_CODES.UNSUPPORTED_PROTOCOL);
    assert.equal(provider.calls.length, 0);
  });

  it("maps URL download timeout to CONVERT_TIMEOUT", async () => {
    const provider = new MockProvider();
    const fetchMock = mock.method(globalThis, "fetch", async (_input: string | URL | Request, init?: RequestInit) => {
      return await new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("The operation timed out.", "TimeoutError"));
        });
      });
    });
    const config = mergeConfig({}).convertContent;

    try {
      const result = await convertContent(
        { url: "https://93.184.216.34/doc.pdf", timeoutMs: 1 },
        config,
        undefined,
        provider
      );

      assert.equal(errorCode(result), CONVERT_ERROR_CODES.CONVERT_TIMEOUT);
      assert.equal(provider.calls.length, 0);
    } finally {
      fetchMock.mock.restore();
    }
  });

  it("maps redirect-loop overflow to NETWORK_ERROR", async () => {
    const provider = new MockProvider();
    const fetchMock = mock.method(globalThis, "fetch", async (input: string | URL | Request) => {
      const url = String(input);
      return new Response(null, { status: 302, headers: { location: `${url}?next=1` } });
    });
    const config = mergeConfig({}).convertContent;

    try {
      const result = await convertContent({ url: "https://93.184.216.34/loop.pdf" }, config, undefined, provider);

      assert.equal(errorCode(result), CONVERT_ERROR_CODES.NETWORK_ERROR);
      assert.match(errorMessage(result) ?? "", /Too many redirects/);
      assert.equal(provider.calls.length, 0);
      assert.equal(fetchMock.mock.callCount(), 6);
    } finally {
      fetchMock.mock.restore();
    }
  });

  it("cancels non-OK URL download response bodies", async () => {
    const provider = new MockProvider();
    let cancelCount = 0;
    const fetchMock = mock.method(globalThis, "fetch", async () => {
      return new Response(new ReadableStream<Uint8Array>({ cancel() { cancelCount += 1; } }), {
        status: 500,
      });
    });
    const config = mergeConfig({}).convertContent;

    try {
      const result = await convertContent({ url: "https://93.184.216.34/doc.pdf" }, config, undefined, provider);

      assert.equal(errorCode(result), CONVERT_ERROR_CODES.NETWORK_ERROR);
      assert.equal(provider.calls.length, 0);
      assert.equal(cancelCount, 1);
    } finally {
      fetchMock.mock.restore();
    }
  });

  it("enforces URL download size limits before converting", async () => {
    const provider = new MockProvider();
    let cancelCount = 0;
    const fetchMock = mock.method(globalThis, "fetch", async () => {
      return new Response(new ReadableStream<Uint8Array>({ cancel() { cancelCount += 1; } }), {
        status: 200,
        headers: { "content-length": "9" },
      });
    });
    const config = mergeConfig({ convertContent: { maxResponseBytes: 5 } }).convertContent;

    try {
      const result = await convertContent({ url: "https://93.184.216.34/doc.pdf" }, config, undefined, provider);

      assert.equal(errorCode(result), CONVERT_ERROR_CODES.FILE_TOO_LARGE);
      assert.equal(provider.calls.length, 0);
      assert.equal(cancelCount, 1);
    } finally {
      fetchMock.mock.restore();
    }
  });
});
