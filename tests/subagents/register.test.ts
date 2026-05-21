import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { mergeConfig } from "../../src/config/load-config.ts";
import { registerSubagentsModule } from "../../src/modules/subagents/register.ts";
import { createMemoryLoggerSink, createLogger } from "../../src/shared/logger.ts";
import { PI_SUBAGENT_CHILD } from "../../src/shared/types.ts";

function createPiMock() {
  const tools: any[] = [];
  const commands: string[] = [];
  const listeners: string[] = [];
  return {
    tools,
    commands,
    listeners,
    registerTool(tool: any) {
      tools.push(tool);
    },
    registerCommand(name: string) {
      commands.push(name);
    },
    on(event: string) {
      listeners.push(event);
    },
  };
}

function createExecutionContext() {
  return {
    cwd: process.cwd(),
    hasUI: false,
    sessionManager: {
      getSessionFile: () => null,
    },
  };
}

describe("subagents module registration", () => {
  const originalChild = process.env[PI_SUBAGENT_CHILD];

  afterEach(() => {
    if (originalChild === undefined) delete process.env[PI_SUBAGENT_CHILD];
    else process.env[PI_SUBAGENT_CHILD] = originalChild;
  });

  it("registers subagent tool in main process", () => {
    const pi = createPiMock();
    const config = mergeConfig({});

    registerSubagentsModule(pi as any, config.subagents);

    assert.deepEqual(pi.tools.map((tool) => tool.name), ["subagent"]);
    assert.deepEqual(pi.commands, []);
  });

  it("logs disabled status through injected shared logger", () => {
    const pi = createPiMock();
    const config = mergeConfig({ subagents: { enabled: false } });
    const sink = createMemoryLoggerSink();
    const logger = createLogger({ module: "test", sink });

    registerSubagentsModule(pi as any, config.subagents, { logger });

    assert.equal(pi.tools.length, 0);
    assert.equal(sink.events.length, 1);
    assert.equal(sink.events[0]?.level, "info");
    assert.equal(sink.events[0]?.event, "module.disabled");
  });

  it("emits bridged subagent error payload in execution path without changing tool result shape", async () => {
    const pi = createPiMock();
    const config = mergeConfig({});
    const sink = createMemoryLoggerSink();
    const logger = createLogger({ module: "test", sink });

    registerSubagentsModule(pi as any, config.subagents, { logger });

    const subagentTool = pi.tools.find((tool) => tool.name === "subagent");
    assert.ok(subagentTool);

    const result = await subagentTool.execute(
      "subagent-error-payload-test",
      { agent: "", task: "hello" },
      new AbortController().signal,
      undefined,
      createExecutionContext()
    );

    assert.equal(result.details?.error?.code, "INVALID_INPUT");
    assert.equal(typeof result.details?.error?.message, "string");

    const payloadEvent = sink.events.find((event) => event.event === "subagents.error_payload");
    assert.ok(payloadEvent);
    assert.equal(payloadEvent?.level, "warn");
    const payload = payloadEvent?.metadata?.payload as Record<string, unknown> | undefined;
    assert.equal(payload?.module, "subagents");
    assert.equal(payload?.code, "INVALID_INPUT");
    assert.equal(payload?.provider, "pi");
  });
});
