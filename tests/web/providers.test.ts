import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { mergeConfig } from "../../src/config/load-config.ts";
import { resetConnectionPool } from "../../src/modules/web/http-pool.ts";
import { braveProvider } from "../../src/modules/web/providers/brave.ts";
import { ddgsProvider } from "../../src/modules/web/providers/ddgs.ts";
import {
	getProviderApiKeyEnv,
	getProviderDisplayName,
	isProviderEnabled,
	providerNamesByTier,
	SEARCH_PROVIDER_METADATA,
	SEARCH_PROVIDER_NAMES,
} from "../../src/modules/web/providers/metadata.ts";
import { openserpProvider } from "../../src/modules/web/providers/openserp.ts";
import { getSearchProvider } from "../../src/modules/web/providers/registry.ts";
import { searxngProvider } from "../../src/modules/web/providers/searxng.ts";
import { selectSearchProvider } from "../../src/modules/web/providers/select-provider.ts";
import { serperProvider } from "../../src/modules/web/providers/serper.ts";
import { tavilyProvider } from "../../src/modules/web/providers/tavily.ts";
import type { SearchProviderAdapter, WebSearchProviderName } from "../../src/modules/web/providers/types.ts";
import type { ResolvedWebConfig } from "../../src/shared/types.ts";

const originalFetch = globalThis.fetch;
const ENV = {
	brave: "BRAVE_SEARCH_API_KEY",
	openserp: "OPENSERP_API_KEY",
	serper: "SERPER_API_KEY",
	tavily: "TAVILY_API_KEY",
};

function webConfig(overrides: Partial<ResolvedWebConfig> = {}): ResolvedWebConfig {
	return { ...mergeConfig({}).web, ...overrides };
}

const BRAVE_CONFIG = webConfig({ brave: { enabled: true, baseUrl: "https://api.search.brave.com/res/v1/web/search", apiKeyEnv: ENV.brave } });
const OPENSERP_CONFIG = webConfig({ openserp: { enabled: true, baseUrl: "http://localhost:7000", apiKeyEnv: ENV.openserp } });
const SEARXNG_CONFIG = webConfig({ searxng: { enabled: true, baseUrl: "http://localhost:8888", defaultEngine: "google" } });
const SERPER_CONFIG = webConfig({ serper: { enabled: true, baseUrl: "https://google.serper.dev/search", apiKeyEnv: ENV.serper } });
const TAVILY_CONFIG = webConfig({ tavily: { enabled: true, baseUrl: "https://api.tavily.com/search", apiKeyEnv: ENV.tavily } });

function setApiKey(envName: string, value = "test-key") {
	process.env[envName] = value;
}

function clearApiKeys() {
	for (const envName of Object.values(ENV)) delete process.env[envName];
	delete process.env.SELECT_PROVIDER_TEST_KEY;
}

function jsonResponse(value: unknown, status = 200): Response {
	return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
}

function mockDdgHtml(results: { title: string; url: string }[]): string {
	return results
		.map(({ title, url }) => `<a href="https://duckduckgo.com/l/?uddg=${encodeURIComponent(url)}&amp;rut=abc123">${title}</a>`)
		.join("\n");
}

async function assertProviderHttpError(provider: SearchProviderAdapter, config: ResolvedWebConfig) {
	globalThis.fetch = (() => Promise.resolve(new Response("Rate limited", { status: 429, statusText: "Too Many Requests" }))) as typeof fetch;
	await assert.rejects(
		() => provider.search({ query: "test", numResults: 1 }, config),
		(error: any) => {
			assert.ok(error.message.includes("429") || error.status === 429);
			return true;
		},
	);
}

async function assertProviderNetworkError(provider: SearchProviderAdapter, config: ResolvedWebConfig) {
	globalThis.fetch = (() => Promise.reject(new Error("ECONNREFUSED"))) as typeof fetch;
	await assert.rejects(() => provider.search({ query: "test", numResults: 1 }, config), /ECONNREFUSED/);
}

async function assertProviderEmptyAndCommonErrors(
	provider: SearchProviderAdapter,
	config: ResolvedWebConfig,
	setup?: () => void
) {
	setup?.();
	globalThis.fetch = (() => Promise.resolve(jsonResponse({}))) as typeof fetch;
	assert.equal((await provider.search({ query: "test", numResults: 5 }, config)).length, 0);
	await assertProviderHttpError(provider, config);
	await assertProviderNetworkError(provider, config);
}

afterEach(() => {
	globalThis.fetch = originalFetch;
	resetConnectionPool();
	clearApiKeys();
});

describe("search provider metadata and registry", () => {
	it("contains every supported provider exactly once and exposes registry entries", () => {
		assert.deepEqual([...SEARCH_PROVIDER_NAMES].sort(), ["brave", "ddgs", "openserp", "searxng", "serper", "tavily"] satisfies WebSearchProviderName[]);
		for (const name of SEARCH_PROVIDER_NAMES) {
			assert.equal(SEARCH_PROVIDER_METADATA[name].name, name);
			const provider = getSearchProvider(name);
			assert.equal(provider.name, name);
			assert.equal(typeof provider.search, "function");
		}
		assert.equal(getSearchProvider("nonexistent" as any), undefined);
	});

	it("groups providers by tier and reports display names/API key envs", () => {
		assert.deepEqual(providerNamesByTier("commercial"), ["brave", "tavily", "serper"]);
		assert.deepEqual(providerNamesByTier("self-host-or-open"), ["openserp", "searxng"]);
		assert.deepEqual(providerNamesByTier("zero-config"), ["ddgs"]);
		assert.equal(getProviderDisplayName("brave"), "Brave Search");
		assert.equal(getProviderDisplayName("ddgs"), "DuckDuckGo Lite");
		assert.equal(getProviderDisplayName("unknown"), "unknown");

		const config = webConfig({
			brave: { enabled: true, baseUrl: "https://brave.example/search", apiKeyEnv: "CUSTOM_BRAVE_KEY" },
			openserp: { enabled: true, baseUrl: "https://openserp.example/search", apiKeyEnv: "CUSTOM_OPENSERP_KEY" },
			searxng: { enabled: true, baseUrl: "https://searxng.example", defaultEngine: "google" },
			tavily: { enabled: false, baseUrl: "https://tavily.example/search", apiKeyEnv: "CUSTOM_TAVILY_KEY" },
			serper: { enabled: false, baseUrl: "https://serper.example/search", apiKeyEnv: "CUSTOM_SERPER_KEY" },
		});
		assert.equal(isProviderEnabled(config, "ddgs"), true);
		assert.equal(isProviderEnabled(config, "brave"), true);
		assert.equal(isProviderEnabled(config, "tavily"), false);
		assert.equal(getProviderApiKeyEnv(config, "brave"), "CUSTOM_BRAVE_KEY");
		assert.equal(getProviderApiKeyEnv(config, "openserp"), "CUSTOM_OPENSERP_KEY");
		assert.equal(getProviderApiKeyEnv(config, "tavily"), "CUSTOM_TAVILY_KEY");
		assert.equal(getProviderApiKeyEnv(config, "serper"), "CUSTOM_SERPER_KEY");
		assert.equal(getProviderApiKeyEnv(config, "ddgs"), undefined);
		assert.equal(getProviderApiKeyEnv(config, "searxng"), undefined);
	});
});

describe("search provider selection", () => {
	it("rejects unsupported, disabled, and technically unavailable explicit providers", async () => {
		const unsupported = await selectSearchProvider(webConfig({ provider: "nonexistent" as any }));
		assert.equal(unsupported.ok, false);
		if (!unsupported.ok) assert.equal(unsupported.error.error.code, "INVALID_INPUT");

		for (const provider of ["openserp", "searxng", "tavily", "serper"] as const) {
			const disabled = await selectSearchProvider(webConfig({ provider, [provider]: { ...((webConfig() as any)[provider] ?? {}), enabled: false } } as any));
			assert.equal(disabled.ok, false);
			if (!disabled.ok) assert.equal(disabled.error.error.code, "INVALID_INPUT");
		}

		const missingBaseUrl = await selectSearchProvider(webConfig({ provider: "searxng", searxng: { enabled: true, baseUrl: "", defaultEngine: "google" } }));
		assert.equal(missingBaseUrl.ok, false);
		if (!missingBaseUrl.ok) assert.match(missingBaseUrl.error.error.message, /baseUrl/);

		const missingKey = await selectSearchProvider(webConfig({ provider: "brave", brave: { enabled: true, baseUrl: "https://api.search.brave.com/res/v1/web/search", apiKeyEnv: "SELECT_PROVIDER_TEST_KEY" } }));
		assert.equal(missingKey.ok, false);
		if (!missingKey.ok) assert.equal(missingKey.error.error.code, "PROVIDER_AUTH_FAILED");
	});

	it("selects ddgs explicitly and in auto mode with stable result shape", async () => {
		const explicit = await selectSearchProvider(webConfig({ provider: "ddgs" }));
		assert.equal(explicit.ok, true);
		if (explicit.ok) {
			assert.equal(explicit.provider.name, "ddgs");
			assert.equal(explicit.mode, "explicit");
			assert.equal(explicit.providers.length, 1);
		}

		const auto = await selectSearchProvider(webConfig({ provider: "auto", providerPriority: ["searxng", "ddgs"], searxng: { enabled: false, baseUrl: "http://localhost:8888", defaultEngine: "google" } }));
		assert.equal(auto.ok, true);
		if (auto.ok) {
			assert.equal(auto.mode, "auto");
			assert.equal(auto.provider.name, "ddgs");
			assert.deepEqual(auto.providers.map((provider) => provider.name), ["ddgs"]);
		}
	});
});

describe("ddgs provider", () => {
	it("is zero-config and parses DuckDuckGo Lite HTML safely", async () => {
		assert.equal(ddgsProvider.name, "ddgs");
		assert.equal(ddgsProvider.isAvailable?.(webConfig()), true);
		const html = [
			mockDdgHtml([
				{ title: "Example Domain", url: "https://example.com/" },
				{ title: "Duplicate", url: "https://example.com/" },
				{ title: "Tom &amp; Jerry&#39;s Page", url: "https://example.com/tom" },
			]),
			'<a href="/relative/path">No URL</a>',
			'<a href="https://duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fempty&amp;rut=abc"></a>',
		].join("\n");
		globalThis.fetch = (() => Promise.resolve(new Response(html, { status: 200 }))) as typeof fetch;

		const results = await ddgsProvider.search({ query: "test", numResults: 10 }, webConfig());
		assert.equal(results.length, 2);
		assert.equal(results[0].title, "Example Domain");
		assert.equal(results[0].url, "https://example.com/");
		assert.equal(results[0].source, "fallback");
		assert.equal(results[1].title, "Tom & Jerry's Page");
		assert.equal(results[1].url, "https://example.com/tom");
	});

	it("caps results, sends the Lite request, and propagates errors", async () => {
		let capturedUrl = "";
		let capturedMethod = "";
		let capturedAccept = "";
		globalThis.fetch = ((url: string, opts?: any) => {
			capturedUrl = url;
			capturedMethod = opts?.method;
			capturedAccept = opts?.headers?.accept;
			return Promise.resolve(new Response(mockDdgHtml(Array.from({ length: 10 }, (_, i) => ({ title: `R${i}`, url: `https://example.com/${i}` }))), { status: 200 }));
		}) as typeof fetch;

		const results = await ddgsProvider.search({ query: "hello world", numResults: 10 }, webConfig());
		assert.ok(results.length <= 5);
		assert.ok(capturedUrl.includes("lite.duckduckgo.com/lite/"));
		assert.ok(capturedUrl.includes("q=hello+world"));
		assert.equal(capturedMethod, "GET");
		assert.ok(capturedAccept.includes("text/html"));

		await assertProviderHttpError(ddgsProvider, webConfig());
		await assertProviderNetworkError(ddgsProvider, webConfig());
	});
});

describe("provider response body limits", () => {
	it("rejects oversized ddgs HTML before parsing", async () => {
		globalThis.fetch = (() => Promise.resolve(new Response(`${"x".repeat(128)}${mockDdgHtml([{ title: "Late", url: "https://example.com/late" }])}`, { status: 200 }))) as typeof fetch;

		await assert.rejects(
			() => ddgsProvider.search({ query: "test", numResults: 1 }, webConfig({ maxResponseBytes: 32 })),
			/response body exceeded the configured maxResponseBytes limit \(32 bytes\)/,
		);
	});

	it("rejects oversized JSON provider responses before parsing", async () => {
		const providers = [
			{ provider: braveProvider, env: ENV.brave, config: webConfig({ brave: { enabled: true, baseUrl: "https://api.search.brave.com/res/v1/web/search", apiKeyEnv: ENV.brave }, maxResponseBytes: 8 }) },
			{ provider: openserpProvider, env: ENV.openserp, config: webConfig({ openserp: { enabled: true, baseUrl: "https://api.openserp.com", apiKeyEnv: ENV.openserp }, maxResponseBytes: 8 }) },
			{ provider: searxngProvider, config: webConfig({ searxng: { enabled: true, baseUrl: "http://localhost:8888", defaultEngine: "google" }, maxResponseBytes: 8 }) },
			{ provider: serperProvider, env: ENV.serper, config: webConfig({ serper: { enabled: true, baseUrl: "https://google.serper.dev/search", apiKeyEnv: ENV.serper }, maxResponseBytes: 8 }) },
			{ provider: tavilyProvider, env: ENV.tavily, config: webConfig({ tavily: { enabled: true, baseUrl: "https://api.tavily.com/search", apiKeyEnv: ENV.tavily }, maxResponseBytes: 8 }) },
		];

		for (const item of providers) {
			clearApiKeys();
			if (item.env) setApiKey(item.env);
			globalThis.fetch = (() => Promise.resolve(jsonResponse({ results: [], web: { results: [] }, organic: [], organic_results: [] }))) as typeof fetch;
			await assert.rejects(
				() => item.provider.search({ query: "test", numResults: 1 }, item.config),
				/response body exceeded the configured maxResponseBytes limit \(8 bytes\)/,
				`${item.provider.name} should reject oversized responses`,
			);
		}
	});
});

describe("provider common empty/error behavior (matrix)", () => {
	const cases: Array<{
		name: string;
		provider: SearchProviderAdapter;
		config: ResolvedWebConfig;
		setup?: () => void;
	}> = [
		{ name: "brave", provider: braveProvider, config: BRAVE_CONFIG, setup: () => setApiKey(ENV.brave) },
		{ name: "openserp", provider: openserpProvider, config: OPENSERP_CONFIG, setup: () => setApiKey(ENV.openserp) },
		{ name: "searxng", provider: searxngProvider, config: SEARXNG_CONFIG },
		{ name: "serper", provider: serperProvider, config: SERPER_CONFIG, setup: () => setApiKey(ENV.serper) },
		{ name: "tavily", provider: tavilyProvider, config: TAVILY_CONFIG, setup: () => setApiKey(ENV.tavily) },
	];

	for (const t of cases) {
		it(`${t.name} handles empty response and common errors`, async () => {
			await assertProviderEmptyAndCommonErrors(t.provider, t.config, t.setup);
		});
	}
});

describe("keyed provider availability", () => {
	it("validates API keys and base URLs consistently", () => {
		const cases = [
			{ name: "brave", provider: braveProvider, env: ENV.brave, config: { brave: { enabled: true, baseUrl: "https://api.search.brave.com/res/v1/web/search", apiKeyEnv: ENV.brave } } },
			{ name: "openserp", provider: openserpProvider, env: ENV.openserp, config: { openserp: { enabled: true, baseUrl: "https://api.openserp.com", apiKeyEnv: ENV.openserp } } },
			{ name: "serper", provider: serperProvider, env: ENV.serper, config: { serper: { enabled: true, baseUrl: "https://google.serper.dev/search", apiKeyEnv: ENV.serper } } },
			{ name: "tavily", provider: tavilyProvider, env: ENV.tavily, config: { tavily: { enabled: true, baseUrl: "https://api.tavily.com/search", apiKeyEnv: ENV.tavily } } },
		] as const;

		for (const item of cases) {
			clearApiKeys();
			assert.equal(item.provider.name, item.name);
			assert.equal(item.provider.isAvailable?.(webConfig(item.config as any)), false, `${item.name} should require API key`);
			setApiKey(item.env);
			assert.equal(item.provider.isAvailable?.(webConfig(item.config as any)), true, `${item.name} should accept valid config`);
			const providerKey = item.name as "brave" | "openserp" | "serper" | "tavily";
			assert.equal(item.provider.isAvailable?.(webConfig({ [providerKey]: { ...((item.config as any)[providerKey]), baseUrl: "not-a-url" } } as any)), false);
			assert.equal(item.provider.isAvailable?.(webConfig({ [providerKey]: { ...((item.config as any)[providerKey]), baseUrl: "ftp://example.com" } } as any)), false);
		}
	});

	it("validates searxng availability without API keys", () => {
		assert.equal(searxngProvider.name, "searxng");
		assert.equal(searxngProvider.isAvailable?.(webConfig({ searxng: { enabled: true, baseUrl: "http://localhost:8888", defaultEngine: "google" } })), true);
		assert.equal(searxngProvider.isAvailable?.(webConfig({ searxng: { enabled: true, baseUrl: "", defaultEngine: "google" } })), false);
		assert.equal(searxngProvider.isAvailable?.(webConfig({ searxng: { enabled: true, baseUrl: "ftp://example.com", defaultEngine: "google" } })), false);
	});
});

describe("brave provider", () => {
	const config = BRAVE_CONFIG;

	it("sends GET request and normalizes Brave results", async () => {
		setApiKey(ENV.brave, "my-secret-key");
		let capturedUrl = "";
		let capturedHeaders: Record<string, string> = {};
		globalThis.fetch = ((url: string, opts?: any) => {
			capturedUrl = String(url);
			capturedHeaders = opts?.headers ?? {};
			return Promise.resolve(jsonResponse({ web: { results: [
				{ title: "Result 1", url: "https://example.com/1", description: "Snippet 1" },
				{ url: "https://example.com/no-title", description: "Snippet 2" },
				{ title: "No URL" },
			] } }));
		}) as typeof fetch;

		const results = await braveProvider.search({ query: "hello", numResults: 3 }, config);
		assert.equal(new URL(capturedUrl).searchParams.get("q"), "hello");
		assert.equal(new URL(capturedUrl).searchParams.get("count"), "3");
		assert.equal(capturedHeaders["x-subscription-token"], "my-secret-key");
		assert.equal(results.length, 2);
		assert.deepEqual(results[0], { title: "Result 1", url: "https://example.com/1", snippet: "Snippet 1", source: "brave" });
		assert.equal(results[1].title, "https://example.com/no-title");
	});

});

describe("openserp provider", () => {
	const config = OPENSERP_CONFIG;

	it("sends GET request and normalizes OpenSERP organic/results payloads", async () => {
		setApiKey(ENV.openserp, "my-key");
		let capturedUrl = "";
		let capturedHeaders: Record<string, string> = {};
		globalThis.fetch = ((url: string, opts?: any) => {
			capturedUrl = url;
			capturedHeaders = opts?.headers ?? {};
			return Promise.resolve(jsonResponse({ organic_results: [
				{ title: "A", url: "https://example.com/url-field", link: "https://example.com/link-field", snippet: "Snip", description: "Desc" },
				{ title: "B", link: "https://example.com/link-only", description: "Desc only" },
				{ title: "No URL" },
			] }));
		}) as typeof fetch;

		const results = await openserpProvider.search({ query: "hello world", numResults: 5 }, config);
		const parsed = new URL(capturedUrl);
		assert.equal(parsed.searchParams.get("q"), "hello world");
		assert.equal(parsed.searchParams.get("num"), "5");
		assert.equal(capturedHeaders.authorization, "Bearer my-key");
		assert.equal(capturedHeaders["x-api-key"], "my-key");
		assert.equal(results.length, 2);
		assert.equal(results[0].url, "https://example.com/url-field");
		assert.equal(results[0].snippet, "Snip");
		assert.equal(results[0].source, "openserp");
		assert.equal(results[1].url, "https://example.com/link-only");
		assert.equal(results[1].snippet, "Desc only");

		globalThis.fetch = (() => Promise.resolve(jsonResponse({ results: [{ title: "Fallback", link: "https://example.com/fallback", description: "Desc" }] }))) as typeof fetch;
		assert.equal((await openserpProvider.search({ query: "test", numResults: 5 }, config))[0].url, "https://example.com/fallback");
	});

});

describe("searxng provider", () => {
	const config = SEARXNG_CONFIG;

	it("sends GET request, preserves path semantics, and normalizes results", async () => {
		let capturedUrl = "";
		globalThis.fetch = ((url: string) => {
			capturedUrl = url;
			return Promise.resolve(jsonResponse({ results: [
				{ title: "Result 1", url: "https://example.com/1", content: "Snippet 1", engine: "google" },
				{ title: "Result 2", url: "https://example.com/2", content: "Snippet 2" },
				{ title: "No URL" },
			] }));
		}) as typeof fetch;

		const results = await searxngProvider.search({ query: "hello world", numResults: 5 }, config);
		const parsed = new URL(capturedUrl);
		assert.ok(capturedUrl.includes("/search"));
		assert.equal(parsed.searchParams.get("q"), "hello world");
		assert.equal(parsed.searchParams.get("format"), "json");
		assert.equal(parsed.searchParams.get("engines"), "google");
		assert.equal(parsed.searchParams.get("count"), "5");
		assert.equal(results.length, 2);
		assert.equal(results[0].source, "google");
		assert.equal(results[1].source, "searxng");
		assert.equal(results[0].snippet, "Snippet 1");

		const customConfig = webConfig({ searxng: { enabled: true, baseUrl: "http://localhost:8888/custom", defaultEngine: "duckduckgo" } });
		globalThis.fetch = ((url: string) => {
			capturedUrl = url;
			return Promise.resolve(jsonResponse({ results: [] }));
		}) as typeof fetch;
		await searxngProvider.search({ query: "test", numResults: 1 }, customConfig);
		assert.ok(capturedUrl.includes("/custom"));
		assert.ok(!capturedUrl.includes("/search"));
		assert.equal(new URL(capturedUrl).searchParams.get("engines"), "duckduckgo");
	});

});

describe("serper provider", () => {
	const config = SERPER_CONFIG;

	it("sends POST request and normalizes Serper organic results", async () => {
		setApiKey(ENV.serper, "my-key");
		let capturedMethod = "";
		let capturedBody: any = null;
		let capturedHeaders: Record<string, string> = {};
		globalThis.fetch = ((_url: string, opts?: any) => {
			capturedMethod = opts?.method;
			capturedBody = JSON.parse(opts?.body ?? "{}");
			capturedHeaders = opts?.headers ?? {};
			return Promise.resolve(jsonResponse({ organic: [
				{ title: "Result 1", link: "https://example.com/1", snippet: "Snippet 1" },
				{ title: "No Link" },
			] }));
		}) as typeof fetch;

		const results = await serperProvider.search({ query: "hello", numResults: 3 }, config);
		assert.equal(capturedMethod, "POST");
		assert.equal(capturedBody.q, "hello");
		assert.equal(capturedBody.num, 3);
		assert.equal(capturedHeaders["x-api-key"], "my-key");
		assert.equal(results.length, 1);
		assert.deepEqual(results[0], { title: "Result 1", url: "https://example.com/1", snippet: "Snippet 1", source: "serper" });
	});

});

describe("tavily provider", () => {
	const config = TAVILY_CONFIG;

	it("sends POST request and normalizes Tavily results", async () => {
		setApiKey(ENV.tavily, "my-key");
		let capturedMethod = "";
		let capturedBody: any = null;
		globalThis.fetch = ((_url: string, opts?: any) => {
			capturedMethod = opts?.method;
			capturedBody = JSON.parse(opts?.body ?? "{}");
			return Promise.resolve(jsonResponse({ results: [
				{ title: "Result 1", url: "https://example.com/1", content: "Snippet 1" },
				{ title: "No URL" },
			] }));
		}) as typeof fetch;

		const results = await tavilyProvider.search({ query: "hello", numResults: 3 }, config);
		assert.equal(capturedMethod, "POST");
		assert.equal(capturedBody.api_key, "my-key");
		assert.equal(capturedBody.query, "hello");
		assert.equal(capturedBody.max_results, 3);
		assert.equal(results.length, 1);
		assert.deepEqual(results[0], { title: "Result 1", url: "https://example.com/1", snippet: "Snippet 1", source: "tavily" });
	});

});
