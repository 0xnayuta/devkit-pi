import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import type { AgentToolResult } from "@earendil-works/pi-agent-core";
import { Value } from "typebox/value";
import { mergeConfig } from "../../src/config/load-config.ts";
import { resetConnectionPool } from "../../src/modules/web/http-pool.ts";
import { registerWebTools } from "../../src/modules/web/register.ts";
import {
	renderFetchContentCall,
	renderFetchContentResult,
	renderGetSearchContentCall,
	renderGetSearchContentResult,
	renderWebSearchCall,
	renderWebSearchResult,
	safeStringify,
	truncateText,
} from "../../src/modules/web/renderers.ts";
import { FetchContentParams, GetSearchContentParams, WebSearchParams } from "../../src/modules/web/schemas.ts";
import type { ResolvedWebConfig } from "../../shared/types.ts";

const webConfig = mergeConfig({}).web;
const theme = { fg: (_color: string, text: string) => text, bold: (text: string) => text };

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

function result(details: unknown): AgentToolResult<any> {
	return { content: [{ type: "text", text: JSON.stringify(details, null, 2) }], details } as AgentToolResult<any>;
}

function renderText(component: { render(width: number): string[] }): string {
	return component.render(240).join("\n");
}

afterEach(() => {
	resetConnectionPool();
});

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

describe("registerWebTools - tool registration", () => {
	let pi: MockExtensionAPI;

	beforeEach(() => {
		pi = createMockPi();
		registerWebTools(pi as any, webConfig);
	});

	it("registers the three public web tools with execution and renderer functions", () => {
		assert.equal(pi.registeredTools.length, 3);
		const expected = [
			["web_search", "Web Search", "Search the web"],
			["fetch_content", "Fetch Content", "Fetch HTTP/HTTPS"],
			["get_search_content", "Get Search Content", "Retrieve stored"],
		];
		for (const [name, label, description] of expected) {
			const tool = pi.registeredTools.find((candidate) => candidate.name === name);
			assert.ok(tool, `${name} tool should be registered`);
			assert.equal(tool.label, label);
			assert.ok(tool.description.includes(description));
			assert.equal(typeof tool.execute, "function");
			assert.equal(typeof tool.renderCall, "function");
			assert.equal(typeof tool.renderResult, "function");
		}
	});

	it("exposes expected tool parameter schema fields", () => {
		const webSearch = pi.registeredTools.find((tool) => tool.name === "web_search")!.parameters as any;
		for (const field of ["query", "queries", "numResults", "includeContent"]) assert.ok(field in webSearch.properties);

		const fetchContent = pi.registeredTools.find((tool) => tool.name === "fetch_content")!.parameters as any;
		assert.ok("url" in fetchContent.properties);
		assert.ok("urls" in fetchContent.properties);

		const getSearchContent = pi.registeredTools.find((tool) => tool.name === "get_search_content")!.parameters as any;
		assert.ok("responseId" in getSearchContent.properties);
		assert.ok(Array.isArray(getSearchContent.required) && getSearchContent.required.includes("responseId"));
	});
});

describe("registerWebTools - lifecycle integration", () => {
	it("registers session lifecycle handlers when pi.on is available", () => {
		const pi = createMockPi();
		registerWebTools(pi as any, webConfig);
		assert.ok(pi.eventHandlers.get("session_start")?.length);
		assert.ok(pi.eventHandlers.get("session_shutdown")?.length);
	});

	it("does not require pi.on or appendEntry", () => {
		const pi = createMockPi();
		delete (pi as any).on;
		delete (pi as any).appendEntry;
		assert.doesNotThrow(() => registerWebTools(pi as any, webConfig));
		assert.ok(pi.registeredTools.length > 0);

		const invalidPi = createMockPi();
		(invalidPi as any).on = "not-a-function";
		(invalidPi as any).appendEntry = "not-a-function";
		assert.doesNotThrow(() => registerWebTools(invalidPi as any, webConfig));
	});

	it("session handlers tolerate missing context and restore branch data", () => {
		const pi = createMockPi();
		registerWebTools(pi as any, webConfig);
		const start = pi.eventHandlers.get("session_start")![0];
		const shutdown = pi.eventHandlers.get("session_shutdown")![0];

		assert.doesNotThrow(() => start({}, undefined));
		assert.doesNotThrow(() => start({}, {}));
		assert.doesNotThrow(() => start({}, { sessionManager: {} }));
		assert.doesNotThrow(() => start({}, { sessionManager: { getBranch: () => undefined } }));
		assert.doesNotThrow(() => start({}, { sessionManager: { getBranch: () => [] } }));
		assert.doesNotThrow(() => shutdown());
	});
});

describe("web tool schemas", () => {
	it("validates fetch_content params", () => {
		assert.equal(Value.Check(FetchContentParams, { url: "https://example.com" }), true);
		assert.equal(Value.Check(FetchContentParams, { urls: ["https://a.com", "https://b.com"] }), true);
		assert.equal(Value.Check(FetchContentParams, { url: "https://a.com", urls: ["https://b.com"] }), true);
		assert.equal(Value.Check(FetchContentParams, {}), true);
		assert.equal(Value.Check(FetchContentParams, { url: 123 }), false);
		assert.equal(Value.Check(FetchContentParams, { urls: "not-an-array" }), false);
		assert.equal(Value.Check(FetchContentParams, { urls: [123, true] }), false);
		assert.equal(Value.Check(FetchContentParams, null), false);
		assert.equal(Value.Check(FetchContentParams, ["https://a.com"]), false);
	});

	it("validates web_search params", () => {
		assert.equal(Value.Check(WebSearchParams, { query: "hello" }), true);
		assert.equal(Value.Check(WebSearchParams, { queries: ["hello", "world"] }), true);
		assert.equal(Value.Check(WebSearchParams, { query: "hello", queries: ["a", "b"], numResults: 5, includeContent: true }), true);
		assert.equal(Value.Check(WebSearchParams, {}), true);
		assert.equal(Value.Check(WebSearchParams, { query: 123 }), false);
		assert.equal(Value.Check(WebSearchParams, { queries: "single" }), false);
		assert.equal(Value.Check(WebSearchParams, { numResults: "five" }), false);
		assert.equal(Value.Check(WebSearchParams, { includeContent: "yes" }), false);
	});

	it("validates get_search_content params", () => {
		assert.equal(Value.Check(GetSearchContentParams, { responseId: "abc-123" }), true);
		assert.equal(Value.Check(GetSearchContentParams, { responseId: "abc-123", query: "test", queryIndex: 0, url: "https://example.com", urlIndex: 1 }), true);
		assert.equal(Value.Check(GetSearchContentParams, {}), false);
		assert.equal(Value.Check(GetSearchContentParams, { responseId: 123 }), false);
		assert.equal(Value.Check(GetSearchContentParams, { responseId: "x", queryIndex: "0" }), false);
		assert.equal(Value.Check(GetSearchContentParams, { responseId: "x", urlIndex: "1" }), false);
	});
});

describe("web tool renderers", () => {
	it("renders web_search call and compact/expanded results", () => {
		const call = renderText(renderWebSearchCall({ query: "pi tool rendering", queries: ["subagents"], numResults: 5 }, theme));
		assert.match(call, /web_search/);
		assert.match(call, /pi tool rendering/);
		assert.match(call, /\+1 queries/);

		const compact = renderText(
			renderWebSearchResult(
				result({ responseId: "search-1", queries: [{ query: "pi tool rendering", results: ["A", "B", "C", "D"].map((title) => ({ title: `Result ${title}`, url: `https://example.com/${title.toLowerCase()}`, snippet: title.toLowerCase() })) }] }),
				{ expanded: false, isPartial: false },
				theme,
			),
		);
		assert.match(compact, /responseId: search-1/);
		assert.match(compact, /queries: 1, results: 4/);
		assert.match(compact, /Result A/);
		assert.match(compact, /\.\.\. \(1 more results,/);
		assert.match(compact, /to expand/);
		assert.doesNotMatch(compact, /chars/);

		const expanded = renderText(renderWebSearchResult(result({ responseId: "search-1", queries: [{ query: "q", results: [{ title: "Only", url: "https://example.com" }] }] }), { expanded: true, isPartial: false }, theme));
		assert.match(expanded, /"responseId": "search-1"/);
		assert.match(expanded, /"title": "Only"/);
		assert.doesNotMatch(expanded, /to expand/);
	});

	it("renders fetch_content and get_search_content compact summaries without full content", () => {
		const longContent = "alpha ".repeat(1000);
		const fetchCall = renderText(renderFetchContentCall({ url: "https://example.com/docs/page" }, theme));
		assert.match(fetchCall, /fetch_content/);
		assert.match(fetchCall, /example.com\/docs\/page/);

		const fetchCompact = renderText(renderFetchContentResult(result({ responseId: "fetch-1", results: [{ url: "https://example.com/docs/page", title: "Docs Page", content: longContent, truncated: false, contentType: "text/html" }] }), { expanded: false, isPartial: false }, theme));
		assert.match(fetchCompact, /responseId: fetch-1/);
		assert.match(fetchCompact, /urls: 1/);
		assert.match(fetchCompact, /Docs Page/);
		assert.match(fetchCompact, /content truncated/);
		assert.match(fetchCompact, /to expand/);
		assert.ok(fetchCompact.length < longContent.length / 2, "compact view should not print full content");

		const getCall = renderText(renderGetSearchContentCall({ responseId: "fetch-1", urlIndex: 0 }, theme));
		assert.match(getCall, /get_search_content/);
		assert.match(getCall, /urlIndex=0/);

		const getCompact = renderText(renderGetSearchContentResult(result({ responseId: "fetch-1", result: { url: "https://example.com/a", title: "A", content: "selected content", truncated: false } }), { expanded: false, isPartial: false }, theme));
		assert.match(getCompact, /responseId: fetch-1/);
		assert.match(getCompact, /selected content/);
		assert.match(getCompact, /details hidden/);
		assert.match(getCompact, /to expand/);
	});

	it("renders partial/error states and safe helper output", () => {
		assert.match(renderText(renderWebSearchResult(result({}), { expanded: false, isPartial: true }, theme)), /Searching/);
		assert.match(renderText(renderFetchContentResult(result({}), { expanded: false, isPartial: true }, theme)), /Fetching/);
		assert.match(renderText(renderGetSearchContentResult(result({}), { expanded: false, isPartial: true }, theme)), /Loading stored content/);

		const error = renderText(renderFetchContentResult(result({ error: { code: "CONTENT_FETCH_TIMEOUT", message: "timed out", recovery: { action: "retry" } } }), { expanded: false, isPartial: false }, theme));
		assert.match(error, /CONTENT_FETCH_TIMEOUT/);
		assert.match(error, /timed out/);
		assert.match(error, /Recovery/);

		assert.deepEqual(truncateText("abc", 10), { text: "abc", truncated: false });
		assert.equal(truncateText("abcdef", 4).text, "abc…");
		const circular: any = {};
		circular.self = circular;
		assert.match(safeStringify(circular), /Unserializable/);
	});
});
