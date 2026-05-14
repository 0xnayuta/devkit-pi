import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import {
  NodeExternalCommandRunner,
  resolveExternalCommand,
  resolveExternalExecutable,
} from "../../src/shared/external-command.ts";

let tempDir = "";

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "devkit-pi-external-command-"));
});

afterEach(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe("external command runner", () => {
  it("resolves an absolute executable path without parsing spaces as arguments", () => {
    const resolved = resolveExternalCommand({ executable: process.execPath, args: ["--version"] });

    assert.equal(resolved?.executable, process.execPath);
    assert.deepEqual(resolved?.args, ["--version"]);
  });

  it("resolves commands from PATH and preserves structured arguments", () => {
    const binDir = path.join(tempDir, "bin");
    fs.mkdirSync(binDir);
    const commandName = process.platform === "win32" ? "tool.cmd" : "tool";
    const commandPath = path.join(binDir, commandName);
    fs.writeFileSync(commandPath, process.platform === "win32" ? "@echo off\r\n" : "#!/bin/sh\n", "utf8");
    if (process.platform !== "win32") fs.chmodSync(commandPath, 0o755);

    const resolved = resolveExternalCommand(
      { executable: "tool", args: ["one", "two words"] },
      { env: { PATH: binDir } }
    );

    assert.equal(resolved?.executable, commandPath);
    assert.deepEqual(resolved?.args, ["one", "two words"]);
  });

  it("resolves commands from explicit extra search paths", () => {
    const binDir = path.join(tempDir, "extra-bin");
    fs.mkdirSync(binDir);
    const commandName = process.platform === "win32" ? "extra-tool.cmd" : "extra-tool";
    const commandPath = path.join(binDir, commandName);
    fs.writeFileSync(commandPath, process.platform === "win32" ? "@echo off\r\n" : "#!/bin/sh\n", "utf8");
    if (process.platform !== "win32") fs.chmodSync(commandPath, 0o755);

    const resolved = resolveExternalExecutable("extra-tool", {
      env: { PATH: "" },
      extraSearchPaths: [binDir],
    });

    assert.equal(resolved, commandPath);
  });

  it("runs a command with structured arguments", async () => {
    const runner = new NodeExternalCommandRunner();

    const result = await runner.run(
      { executable: process.execPath, args: ["-e", "console.log(process.argv[1])", "hello world"] },
      { timeoutMs: 1000 }
    );

    assert.equal(result.exitCode, 0);
    assert.equal(result.stdout.trim(), "hello world");
    assert.equal(result.stderr, "");
    assert.equal(result.timedOut, false);
  });

  it("runs a command in the requested cwd", async () => {
    const runner = new NodeExternalCommandRunner();

    const result = await runner.run(
      { executable: process.execPath, args: ["-e", "console.log(process.cwd())"] },
      { cwd: tempDir, timeoutMs: 1000 }
    );

    assert.equal(result.exitCode, 0);
    assert.equal(path.normalize(result.stdout.trim()), path.normalize(tempDir));
  });

  it("caps stdout and marks the stream truncated", async () => {
    const runner = new NodeExternalCommandRunner();

    const result = await runner.run(
      { executable: process.execPath, args: ["-e", "process.stdout.write('x'.repeat(200000))"] },
      { timeoutMs: 1000, maxStdoutBytes: 1024 }
    );

    assert.equal(Buffer.byteLength(result.stdout), 1024);
    assert.equal(result.outputTruncated.stdout, true);
    assert.equal(result.outputTruncated.stderr, false);
  });

  it("caps stderr and marks the stream truncated", async () => {
    const runner = new NodeExternalCommandRunner();

    const result = await runner.run(
      { executable: process.execPath, args: ["-e", "process.stderr.write('e'.repeat(200000))"] },
      { timeoutMs: 1000, maxStderrBytes: 1024 }
    );

    assert.equal(Buffer.byteLength(result.stderr), 1024);
    assert.equal(result.outputTruncated.stdout, false);
    assert.equal(result.outputTruncated.stderr, true);
  });

  it("reports timeout without shell interpolation", async () => {
    const runner = new NodeExternalCommandRunner();

    const result = await runner.run(
      { executable: process.execPath, args: ["-e", "setTimeout(() => {}, 2000)"] },
      { timeoutMs: 50 }
    );

    assert.equal(result.exitCode, null);
    assert.equal(result.timedOut, true);
  });

  it("rejects missing commands with ENOENT", async () => {
    const runner = new NodeExternalCommandRunner();

    await assert.rejects(
      () => runner.run({ executable: "definitely-missing-devkit-pi-command" }, { timeoutMs: 1000 }),
      (error: unknown) => (error as NodeJS.ErrnoException).code === "ENOENT"
    );
  });
});
