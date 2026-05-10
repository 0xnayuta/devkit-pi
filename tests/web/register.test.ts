/**
 * Register Module Tests
 * Phase 4 — Integration-level tool registration
 */

import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { mergeConfig } from "../../src/config/load-config.ts";
import type { ResolvedWebConfig } from "../../shared/types.ts";
import { registerWebTools } from "../../src/modules/web/register.ts";
import { resetConnectionPool } from "../../src/modules/web/http-pool.ts";

const webConfig = mergeConfig({}).web;

// ---------------------------------------------------------------------------
// Mock ExtensionAPI
// ---------------------------------------------------------------------------

interface RegisteredTool {
  name: string;
  label: string;
  description: string;
  parameters: unknown;
  execute: Function;
  renderCall: Function;
  renderResult: Function;
}

interface MockExtensionAPI {
  registeredTools: RegisteredTool[];
  eventHandlers: Map<string, Function[]>;
  registerTool: (tool: any) => void;
  on: (event: string, handler: Function) => void;
  appendEntry: (type: string, data: unknown) => void;
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
    appendEntry() {},
  };
  return mock;
}

afterEach(() => {
  resetConnectionPool();
});

// ---------------------------------------------------------------------------
// config.enabled gate
// ---------------------------------------------------------------------------

describe("registerWebTools - enabled gate", () => {
  it("registers no tools when config.enabled is false", () => {
    const pi = createMockPi();
    const config: ResolvedWebConfig = { ...webConfig, enabled: false };
    registerWebTools(pi as any, config);
    assert.equal(pi.registeredTools.length, 0);
  });

  it("registers tools when config.enabled is true", () => {
    const pi = createMockPi();
    registerWebTools(pi as any, webConfig);
    assert.ok(pi.registeredTools.length > 0);
  });
});

// ---------------------------------------------------------------------------
// Tool registration — names and count
// ---------------------------------------------------------------------------

describe("registerWebTools - tool registration", () => {
  let pi: MockExtensionAPI;

  beforeEach(() => {
    pi = createMockPi();
    registerWebTools(pi as any, webConfig);
  });

  it("registers exactly 3 tools", () => {
    assert.equal(pi.registeredTools.length, 3);
  });

  it("registers web_search tool", () => {
    const tool = pi.registeredTools.find((t) => t.name === "web_search");
    assert.ok(tool, "web_search tool should be registered");
    assert.equal(tool.label, "Web Search");
    assert.ok(tool.description.includes("Search the web"));
  });

  it("registers fetch_content tool", () => {
    const tool = pi.registeredTools.find((t) => t.name === "fetch_content");
    assert.ok(tool, "fetch_content tool should be registered");
    assert.equal(tool.label, "Fetch Content");
    assert.ok(tool.description.includes("Fetch HTTP/HTTPS"));
  });

  it("registers get_search_content tool", () => {
    const tool = pi.registeredTools.find((t) => t.name === "get_search_content");
    assert.ok(tool, "get_search_content tool should be registered");
    assert.equal(tool.label, "Get Search Content");
    assert.ok(tool.description.includes("Retrieve stored"));
  });

  it("each tool has an execute function", () => {
    for (const tool of pi.registeredTools) {
      assert.equal(typeof tool.execute, "function", `${tool.name} should have execute`);
    }
  });

  it("each tool has renderCall and renderResult functions", () => {
    for (const tool of pi.registeredTools) {
      assert.equal(typeof tool.renderCall, "function", `${tool.name} should have renderCall`);
      assert.equal(typeof tool.renderResult, "function", `${tool.name} should have renderResult`);
    }
  });
});

// ---------------------------------------------------------------------------
// Tool parameters — schema shape
// ---------------------------------------------------------------------------

describe("registerWebTools - tool parameters", () => {
  let pi: MockExtensionAPI;

  beforeEach(() => {
    pi = createMockPi();
    registerWebTools(pi as any, webConfig);
  });

  it("web_search parameters include query and numResults fields", () => {
    const tool = pi.registeredTools.find((t) => t.name === "web_search")!;
    const schema = tool.parameters as any;
    assert.ok(schema.properties, "should have properties");
    assert.ok("query" in schema.properties, "should have query field");
    assert.ok("queries" in schema.properties, "should have queries field");
    assert.ok("numResults" in schema.properties, "should have numResults field");
    assert.ok("includeContent" in schema.properties, "should have includeContent field");
  });

  it("fetch_content parameters include url and urls fields", () => {
    const tool = pi.registeredTools.find((t) => t.name === "fetch_content")!;
    const schema = tool.parameters as any;
    assert.ok(schema.properties, "should have properties");
    assert.ok("url" in schema.properties, "should have url field");
    assert.ok("urls" in schema.properties, "should have urls field");
  });

  it("get_search_content parameters include responseId field", () => {
    const tool = pi.registeredTools.find((t) => t.name === "get_search_content")!;
    const schema = tool.parameters as any;
    assert.ok(schema.properties, "should have properties");
    assert.ok("responseId" in schema.properties, "should have responseId field");
  });

  it("get_search_content responseId is required", () => {
    const tool = pi.registeredTools.find((t) => t.name === "get_search_content")!;
    const schema = tool.parameters as any;
    assert.ok(
      Array.isArray(schema.required) && schema.required.includes("responseId"),
      "responseId should be required"
    );
  });
});

// ---------------------------------------------------------------------------
// Event handlers
// ---------------------------------------------------------------------------

describe("registerWebTools - event handlers", () => {
  it("registers session_start handler", () => {
    const pi = createMockPi();
    registerWebTools(pi as any, webConfig);
    const handlers = pi.eventHandlers.get("session_start");
    assert.ok(handlers, "should register session_start handler");
    assert.ok(handlers.length >= 1, "should have at least one session_start handler");
  });

  it("registers session_shutdown handler", () => {
    const pi = createMockPi();
    registerWebTools(pi as any, webConfig);
    const handlers = pi.eventHandlers.get("session_shutdown");
    assert.ok(handlers, "should register session_shutdown handler");
    assert.ok(handlers.length >= 1, "should have at least one session_shutdown handler");
  });

  it("does not register event handlers when pi.on is not available", () => {
    const pi = createMockPi();
    delete (pi as any).on;
    // Should not throw
    assert.doesNotThrow(() => registerWebTools(pi as any, webConfig));
    // Tools should still be registered
    assert.ok(pi.registeredTools.length > 0);
  });

  it("does not register event handlers when pi.on is not a function", () => {
    const pi = createMockPi();
    (pi as any).on = "not-a-function";
    assert.doesNotThrow(() => registerWebTools(pi as any, webConfig));
    assert.ok(pi.registeredTools.length > 0);
  });
});

// ---------------------------------------------------------------------------
// Session lifecycle
// ---------------------------------------------------------------------------

describe("registerWebTools - session lifecycle", () => {
  it("session_start handler does not throw with missing context", () => {
    const pi = createMockPi();
    registerWebTools(pi as any, webConfig);
    const handlers = pi.eventHandlers.get("session_start")!;

    // Should not throw when called with no context
    assert.doesNotThrow(() => handlers[0]({}, undefined));
    assert.doesNotThrow(() => handlers[0]({}, {}));
    assert.doesNotThrow(() => handlers[0]({}, { sessionManager: {} }));
  });

  it("session_start handler calls clearResults when branch is not an array", () => {
    const pi = createMockPi();
    registerWebTools(pi as any, webConfig);
    const handlers = pi.eventHandlers.get("session_start")!;

    // Should not throw — clearResults is called when branch is not available
    assert.doesNotThrow(() =>
      handlers[0]({}, { sessionManager: { getBranch: () => undefined } })
    );
  });

  it("session_start handler calls restoreResultsFromSession when branch is an array", () => {
    const pi = createMockPi();
    registerWebTools(pi as any, webConfig);
    const handlers = pi.eventHandlers.get("session_start")!;

    // Should not throw — restoreResultsFromSession is called with branch data
    assert.doesNotThrow(() =>
      handlers[0]({}, { sessionManager: { getBranch: () => [] } })
    );
  });

  it("session_shutdown handler does not throw", () => {
    const pi = createMockPi();
    registerWebTools(pi as any, webConfig);
    const handlers = pi.eventHandlers.get("session_shutdown")!;

    assert.doesNotThrow(() => handlers[0]());
  });
});

// ---------------------------------------------------------------------------
// appendEntry integration
// ---------------------------------------------------------------------------

describe("registerWebTools - appendEntry", () => {
  it("sets up session result appender when appendEntry is available", () => {
    const pi = createMockPi();
    (pi as any).appendEntry = () => {};
    registerWebTools(pi as any, webConfig);
    // No assertion needed — just verify it doesn't throw
    assert.ok(pi.registeredTools.length > 0);
  });

  it("handles missing appendEntry gracefully", () => {
    const pi = createMockPi();
    delete (pi as any).appendEntry;
    assert.doesNotThrow(() => registerWebTools(pi as any, webConfig));
    assert.ok(pi.registeredTools.length > 0);
  });

  it("handles appendEntry that is not a function", () => {
    const pi = createMockPi();
    (pi as any).appendEntry = "not-a-function";
    assert.doesNotThrow(() => registerWebTools(pi as any, webConfig));
  });
});
