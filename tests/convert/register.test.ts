import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AgentToolResult } from "@earendil-works/pi-agent-core";
import { Value } from "typebox/value";
import { mergeConfig } from "../../src/config/load-config.ts";
import { CONVERT_ERROR_CODES, registerConvertTools } from "../../src/modules/convert/index.ts";
import { createLogger, createMemoryLoggerSink } from "../../src/shared/logger.ts";
import { ConvertContentParams } from "../../src/modules/convert/schemas.ts";

interface RegisteredTool {
  name: string;
  label: string;
  description: string;
  promptSnippet?: string;
  promptGuidelines?: string[];
  parameters: unknown;
  execute: Function;
  renderCall?: Function;
  renderResult?: Function;
}

interface MockExtensionAPI {
  registeredTools: RegisteredTool[];
  eventHandlers: Map<string, Function[]>;
  registerTool: (tool: any) => void;
  on: (event: string, handler: Function) => void;
}

function createMockPi(): MockExtensionAPI {
  const mock: MockExtensionAPI = {
    registeredTools: [],
    eventHandlers: new Map(),
    registerTool(tool: any) {
      mock.registeredTools.push({
        name: tool.name,
        label: tool.label,
        description: tool.description,
        promptSnippet: tool.promptSnippet,
        promptGuidelines: tool.promptGuidelines,
        parameters: tool.parameters,
        execute: tool.execute,
        renderCall: tool.renderCall,
        renderResult: tool.renderResult,
      });
    },
    on(event: string, handler: Function) {
      const handlers = mock.eventHandlers.get(event) ?? [];
      handlers.push(handler);
      mock.eventHandlers.set(event, handlers);
    },
  };
  return mock;
}

const convertConfig = mergeConfig({}).convertContent;

describe("registerConvertTools", () => {
  it("registers convert_content when enabled", () => {
    const pi = createMockPi();
    registerConvertTools(pi as any, convertConfig);

    assert.equal(pi.registeredTools.length, 1);
    const tool = pi.registeredTools[0];
    assert.equal(tool.name, "convert_content");
    assert.equal(tool.label, "Convert Content");
    assert.ok(tool.description.includes("Markdown"));
    assert.equal(typeof tool.execute, "function");
    assert.equal(typeof tool.renderCall, "function");
    assert.equal(typeof tool.renderResult, "function");
  });

  it("exposes expected parameter schema fields", () => {
    const pi = createMockPi();
    registerConvertTools(pi as any, convertConfig);
    const schema = pi.registeredTools[0].parameters as any;

    for (const field of ["path", "url", "maxContentChars", "timeoutMs"]) {
      assert.ok(field in schema.properties);
    }
    assert.equal(schema.properties.file_path, undefined);
  });

  it("execute returns structured invalid input errors", async () => {
    const pi = createMockPi();
    registerConvertTools(pi as any, convertConfig);
    const result = (await pi.registeredTools[0].execute(
      "call-1",
      {},
      undefined,
      undefined,
      { cwd: process.cwd() }
    )) as AgentToolResult<any>;

    assert.equal(result.details.error.code, CONVERT_ERROR_CODES.INVALID_INPUT);
  });

  it("logs convert.error_payload when convert_content returns structured error", async () => {
    const pi = createMockPi();
    const sink = createMemoryLoggerSink();
    registerConvertTools(pi as any, convertConfig, {
      logger: createLogger({ module: "test.convert", sink }),
    });

    await pi.registeredTools[0].execute("call-1", {}, undefined, undefined, { cwd: process.cwd() });

    const event = sink.events.find((item) => item.event === "convert.error_payload");
    assert.ok(event);
    assert.equal(event?.level, "warn");
    const payload = event?.metadata?.payload as Record<string, unknown> | undefined;
    assert.equal(payload?.module, "convert");
    assert.equal(payload?.code, CONVERT_ERROR_CODES.INVALID_INPUT);
  });
});

describe("ConvertContentParams schema", () => {
  it("validates public params and rejects legacy fields", () => {
    assert.equal(Value.Check(ConvertContentParams, { path: "/tmp/a.pdf" }), true);
    assert.equal(Value.Check(ConvertContentParams, { url: "https://example.com/a.pdf" }), true);
    assert.equal(
      Value.Check(ConvertContentParams, {
        path: "/tmp/a.pdf",
        maxContentChars: 1000,
        timeoutMs: 1000,
      }),
      true
    );
    assert.equal(Value.Check(ConvertContentParams, {}), true);
    assert.equal(Value.Check(ConvertContentParams, { path: 123 }), false);
    assert.equal(Value.Check(ConvertContentParams, { url: 123 }), false);
    assert.equal(Value.Check(ConvertContentParams, { maxContentChars: "1000" }), false);
    assert.equal(Value.Check(ConvertContentParams, { file_path: "/tmp/a.pdf" }), false);
  });
});
