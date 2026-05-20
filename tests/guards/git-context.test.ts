import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { mergeConfig } from "../../src/config/load-config.ts";
import {
  formatFirstWriteNotice,
  formatGitContextNotice,
  getGitContext,
  GuardsGateBlockedError,
  isPotentialWriteTool,
  isVerificationCommand,
  registerGuardsModule,
} from "../../src/modules/guards/index.ts";
import type { ExternalCommandResult, ExternalCommandRunner, ExternalCommandSpec, ExternalCommandRunOptions } from "../../src/shared/external-command.ts";
import { createLogger, createMemoryLoggerSink } from "../../src/shared/logger.ts";
import { PI_SUBAGENT_CHILD } from "../../src/shared/types.ts";

class FakeGitRunner implements ExternalCommandRunner {
  calls: string[][] = [];
  responses = new Map<string, ExternalCommandResult>();
  reject = false;

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async run(command: ExternalCommandSpec, _options: ExternalCommandRunOptions): Promise<ExternalCommandResult> {
    if (this.reject) throw new Error("git failed");
    const args = command.args ?? [];
    this.calls.push(args);
    const key = args.join(" ");
    return this.responses.get(key) ?? result(1, "", "failed");
  }
}

function result(exitCode: number, stdout: string, stderr = ""): ExternalCommandResult {
  return {
    exitCode,
    stdout,
    stderr,
    timedOut: false,
    outputTruncated: { stdout: false, stderr: false },
  };
}

function createRunner(options: { branch?: string; status?: string; inside?: boolean } = {}): FakeGitRunner {
  const runner = new FakeGitRunner();
  const branch = options.branch ?? "feature/guards";
  const inside = options.inside ?? true;
  runner.responses.set("rev-parse --is-inside-work-tree", result(inside ? 0 : 1, inside ? "true\n" : ""));
  runner.responses.set("rev-parse --show-toplevel", result(0, "/repo/devkit-pi\n"));
  runner.responses.set("rev-parse --abbrev-ref HEAD", result(0, branch ? `${branch}\n` : "HEAD\n"));
  runner.responses.set("branch --show-current", result(0, branch ? `${branch}\n` : ""));
  runner.responses.set("status --porcelain", result(0, options.status ?? ""));
  return runner;
}

function createPiMock(options: { confirm?: boolean | null } = {}) {
  const listeners: Record<string, Array<(event: unknown, ctx: unknown) => unknown>> = {};
  const notifications: Array<{ message: string; level: string }> = [];
  return {
    listeners,
    notifications,
    on(event: string, handler: (event: unknown, ctx: unknown) => unknown) {
      listeners[event] ??= [];
      listeners[event].push(handler);
    },
    ctx: {
      cwd: "/repo/devkit-pi",
      hasUI: true,
      ui: {
        notify(message: string, level: string) {
          notifications.push({ message, level });
        },
        ...(options.confirm === null
          ? {}
          : {
              confirm: (_message: string) => options.confirm ?? true,
            }),
      },
    },
  };
}

async function emit(pi: ReturnType<typeof createPiMock>, eventName: string, event: any = {}) {
  for (const listener of pi.listeners[eventName] ?? []) {
    await listener(event, pi.ctx);
  }
}

describe("guards git context", () => {
  const originalChild = process.env[PI_SUBAGENT_CHILD];

  afterEach(() => {
    if (originalChild === undefined) delete process.env[PI_SUBAGENT_CHILD];
    else process.env[PI_SUBAGENT_CHILD] = originalChild;
  });

  it("reads git context and formats dirty branch notice", async () => {
    const context = await getGitContext({ cwd: "/repo/devkit-pi", runner: createRunner({ status: " M src/index.ts\n" }) });

    assert.deepEqual(context, {
      repoRoot: "/repo/devkit-pi",
      branch: "feature/guards",
      worktree: "dirty",
      detachedHead: false,
    });
    assert.equal(
      formatGitContextNotice(context!),
      "[devkit-pi] Git context: branch=feature/guards, status=dirty, repo=devkit-pi."
    );
  });

  it("reports detached HEAD", async () => {
    const context = await getGitContext({ cwd: "/repo/devkit-pi", runner: createRunner({ branch: "" }) });

    assert.equal(context?.detachedHead, true);
    assert.equal(context?.branch, null);
    assert.match(formatGitContextNotice(context!), /branch=detached HEAD/);
  });

  it("classifies explicit and conservative shell write tools", () => {
    assert.equal(isPotentialWriteTool("write"), true);
    assert.equal(isPotentialWriteTool("functions.edit"), true);
    assert.equal(isPotentialWriteTool("read"), false);
    assert.equal(isPotentialWriteTool("bash", { command: "pnpm test" }), false);
    assert.equal(isPotentialWriteTool("bash", { command: "echo hello > out.txt" }), true);
    assert.equal(isPotentialWriteTool("shell", { command: "git reset --hard HEAD" }), true);
  });

  it("shows first write notice once before potential writes", async () => {
    const pi = createPiMock();
    registerGuardsModule(pi as any, mergeConfig({}).guards, {
      runner: createRunner({ status: " M README.md\n" }),
    });

    await emit(pi, "tool_call", { toolName: "read", input: { path: "README.md" } });
    await emit(pi, "tool_call", { toolName: "write", input: { path: "README.md" } });
    await emit(pi, "tool_call", { toolName: "edit", input: { path: "README.md" } });

    assert.equal(pi.notifications.length, 1);
    assert.equal(pi.notifications[0]?.level, "info");
    assert.match(pi.notifications[0]?.message ?? "", /First write in this session/);
    assert.match(pi.notifications[0]?.message ?? "", /Current branch: feature\/guards/);
    assert.match(pi.notifications[0]?.message ?? "", /working tree: dirty/);
  });

  it("formats first write notice for detached HEAD", async () => {
    const context = await getGitContext({
      cwd: "/repo/devkit-pi",
      runner: createRunner({ branch: "" }),
    });

    assert.match(formatFirstWriteNotice(context!), /Current branch: detached HEAD/);
  });

  it("does not show first write notice outside a git repo", async () => {
    const pi = createPiMock();
    registerGuardsModule(pi as any, mergeConfig({}).guards, { runner: createRunner({ inside: false }) });

    await emit(pi, "tool_call", { toolName: "write", input: { path: "README.md" } });

    assert.equal(pi.notifications.length, 0);
  });

  it("does not show first write notice when disabled", async () => {
    const pi = createPiMock();
    registerGuardsModule(pi as any, mergeConfig({ guards: { firstWriteReminder: false } }).guards, {
      runner: createRunner(),
    });

    await emit(pi, "tool_call", { toolName: "write", input: { path: "README.md" } });

    assert.equal(pi.notifications.length, 0);
  });

  it("classifies verification commands conservatively", () => {
    assert.equal(isVerificationCommand("pnpm test"), true);
    assert.equal(isVerificationCommand("npm run typecheck"), true);
    assert.equal(isVerificationCommand("tsc --noEmit"), true);
    assert.equal(isVerificationCommand("cargo check"), true);
    assert.equal(isVerificationCommand("uv run pytest"), true);
    assert.equal(isVerificationCommand("go test ./..."), true);
    assert.equal(isVerificationCommand("echo test"), false);
    assert.equal(isVerificationCommand("pnpm install"), false);
  });

  it("shows verification reminder after writes without verification", async () => {
    const pi = createPiMock();
    registerGuardsModule(pi as any, mergeConfig({}).guards, { runner: createRunner() });

    await emit(pi, "agent_start");
    await emit(pi, "tool_call", { toolName: "write", input: { path: "README.md" } });
    await emit(pi, "agent_end");

    assert.equal(pi.notifications.length, 2);
    assert.match(pi.notifications[0]?.message ?? "", /First write in this session/);
    assert.match(pi.notifications[1]?.message ?? "", /Verification status/);
    assert.match(pi.notifications[1]?.message ?? "", /no test\/lint\/typecheck\/build command was detected/);
  });

  it("does not show verification reminder when verification command is detected", async () => {
    const pi = createPiMock();
    registerGuardsModule(pi as any, mergeConfig({}).guards, { runner: createRunner() });

    await emit(pi, "agent_start");
    await emit(pi, "tool_call", { toolName: "write", input: { path: "README.md" } });
    await emit(pi, "tool_call", { toolName: "bash", input: { command: "pnpm test" } });
    await emit(pi, "agent_end");

    assert.equal(pi.notifications.length, 1);
    assert.match(pi.notifications[0]?.message ?? "", /First write in this session/);
  });

  it("resets verification tracking on agent_start", async () => {
    const pi = createPiMock();
    registerGuardsModule(pi as any, mergeConfig({}).guards, { runner: createRunner() });

    await emit(pi, "agent_start");
    await emit(pi, "tool_call", { toolName: "write", input: { path: "README.md" } });
    await emit(pi, "agent_start");
    await emit(pi, "agent_end");

    assert.equal(pi.notifications.length, 1);
    assert.match(pi.notifications[0]?.message ?? "", /First write in this session/);
  });

  it("does not show verification reminder when disabled", async () => {
    const pi = createPiMock();
    registerGuardsModule(pi as any, mergeConfig({ guards: { verificationReminder: false } }).guards, {
      runner: createRunner(),
    });

    await emit(pi, "agent_start");
    await emit(pi, "tool_call", { toolName: "write", input: { path: "README.md" } });
    await emit(pi, "agent_end");

    assert.equal(pi.notifications.length, 1);
    assert.match(pi.notifications[0]?.message ?? "", /First write in this session/);
  });

  it("shows git context once after the first tool result", async () => {
    const pi = createPiMock();
    registerGuardsModule(pi as any, mergeConfig({}).guards, { runner: createRunner({ status: " M README.md\n" }) });

    await emit(pi, "tool_result", { toolName: "read" });
    await emit(pi, "tool_result", { toolName: "read" });

    assert.equal(pi.notifications.length, 1);
    assert.equal(pi.notifications[0]?.level, "info");
    assert.match(pi.notifications[0]?.message ?? "", /status=dirty/);
  });

  it("does not notify outside a git repo", async () => {
    const pi = createPiMock();
    registerGuardsModule(pi as any, mergeConfig({}).guards, { runner: createRunner({ inside: false }) });

    await emit(pi, "tool_result", { toolName: "read" });

    assert.equal(pi.notifications.length, 0);
  });

  it("silently degrades when git commands fail", async () => {
    const pi = createPiMock();
    const runner = createRunner();
    runner.reject = true;
    registerGuardsModule(pi as any, mergeConfig({}).guards, { runner });

    await emit(pi, "tool_result", { toolName: "read" });

    assert.equal(pi.notifications.length, 0);
  });

  it("does not register when guards mode is off", () => {
    const pi = createPiMock();

    registerGuardsModule(pi as any, mergeConfig({ guards: { mode: "off" } }).guards, {
      runner: createRunner(),
    });

    assert.deepEqual(pi.listeners, {});
  });

  it("confirm mode uses interactive confirm and allows when approved", async () => {
    const pi = createPiMock({ confirm: true });
    registerGuardsModule(pi as any, mergeConfig({ guards: { mode: "confirm" } }).guards, {
      runner: createRunner(),
    });

    await emit(pi, "tool_call", { toolName: "write", input: { path: "README.md" } });

    assert.match(pi.notifications.map((item) => item.message).join("\n"), /Guard confirm: allowed/);
  });

  it("confirm mode non-interactive policy deny emits soft deny decision", async () => {
    const pi = createPiMock({ confirm: null });
    registerGuardsModule(
      pi as any,
      mergeConfig({ guards: { mode: "confirm", nonInteractivePolicy: "deny", blockMode: "soft" } })
        .guards,
      {
        runner: createRunner(),
      }
    );

    await emit(pi, "tool_call", { toolName: "write", input: { path: "README.md" } });

    assert.match(
      pi.notifications.map((item) => item.message).join("\n"),
      /non-interactive.*decision=deny_soft/
    );
  });

  it("block mode emits configurable soft deny notice", async () => {
    const pi = createPiMock();
    registerGuardsModule(
      pi as any,
      mergeConfig({ guards: { mode: "block", blockMode: "preview" } }).guards,
      {
        runner: createRunner(),
      }
    );

    await emit(pi, "tool_call", { toolName: "write", input: { path: "README.md" } });

    assert.match(pi.notifications.map((item) => item.message).join("\n"), /mode=block \(preview\)/);
    assert.match(pi.notifications.map((item) => item.message).join("\n"), /decision=deny_soft/);
  });

  it("confirm mode non-interactive deny + hard enforces hard block", async () => {
    const pi = createPiMock({ confirm: null });
    registerGuardsModule(
      pi as any,
      mergeConfig({ guards: { mode: "confirm", nonInteractivePolicy: "deny", blockMode: "hard" } })
        .guards,
      {
        runner: createRunner(),
      }
    );

    await assert.rejects(
      emit(pi, "tool_call", { toolName: "write", input: { path: "README.md" } }),
      (error: unknown) => error instanceof GuardsGateBlockedError && error.code === "GUARD_HARD_BLOCKED"
    );
  });

  it("block mode hard enforces hard block", async () => {
    const pi = createPiMock();
    registerGuardsModule(pi as any, mergeConfig({ guards: { mode: "block", blockMode: "hard" } }).guards, {
      runner: createRunner(),
    });

    await assert.rejects(
      emit(pi, "tool_call", { toolName: "write", input: { path: "README.md" } }),
      (error: unknown) => error instanceof GuardsGateBlockedError && error.code === "GUARD_HARD_BLOCKED"
    );
  });

  it("gate flow ignores non-write tools", async () => {
    const pi = createPiMock();
    registerGuardsModule(pi as any, mergeConfig({ guards: { mode: "confirm" } }).guards, {
      runner: createRunner(),
    });

    await emit(pi, "tool_call", { toolName: "read", input: { path: "README.md" } });

    assert.equal(
      pi.notifications.some((item) => item.message.includes("mode=confirm")),
      false
    );
  });

  it("does not register in subagent child processes", () => {
    process.env[PI_SUBAGENT_CHILD] = "1";
    const pi = createPiMock();

    registerGuardsModule(pi as any, mergeConfig({}).guards, { runner: createRunner() });

    assert.deepEqual(pi.listeners, {});
  });

  it("logs normalized payload when guard notification path throws", async () => {
    const pi = createPiMock();
    const sink = createMemoryLoggerSink();
    pi.ctx.ui.notify = () => {
      throw new Error("notify failed");
    };

    registerGuardsModule(pi as any, mergeConfig({}).guards, {
      runner: createRunner({ status: " M README.md\n" }),
      logger: createLogger({ module: "test.guards", sink }),
    });

    await emit(pi, "tool_result", { toolName: "read" });

    const event = sink.events.find((item) => item.event === "guards.error_payload");
    assert.ok(event);
    assert.equal(event?.level, "warn");
    const payload = event?.metadata?.payload as Record<string, unknown> | undefined;
    assert.equal(payload?.code, "INTERNAL_ERROR");
    assert.equal(payload?.module, "guards");
  });
});
