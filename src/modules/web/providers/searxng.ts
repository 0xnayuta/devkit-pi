import type { ResolvedWebConfig } from "../../../shared/types.ts";
import { withTimeoutSignal } from "../abort.ts";
import { fetchWithPinnedDns } from "../network.ts";
import { readLimitedJson, readLimitedText } from "../read-limited.ts";
import type { SearchResultItem } from "../types.ts";
import type { ProviderSearchParams, SearchProviderAdapter } from "./types.ts";

interface SearchHttpError extends Error {
	status: number;
	responseText?: string;
}

interface SearxngResultItem {
	title?: string;
	url?: string;
	content?: string;
	engine?: string;
}

interface SearxngResponse {
	results?: SearxngResultItem[];
}

function createSearchHttpError(status: number, statusText: string, responseText?: string): SearchHttpError {
	const err = new Error(`SearXNG returned HTTP ${status} ${statusText}`) as SearchHttpError;
	err.status = status;
	err.responseText = responseText;
	return err;
}

function buildSearchUrl(config: ResolvedWebConfig, query: string, count: number): URL {
	const base = new URL(config.searxng.baseUrl);
	if (base.pathname === "/") {
		base.pathname = "/search";
	}
	base.searchParams.set("q", query);
	base.searchParams.set("format", "json");
	base.searchParams.set("pageno", "1");
	base.searchParams.set("language", "en");
	base.searchParams.set("categories", "general");
	base.searchParams.set("engines", config.searxng.defaultEngine);
	base.searchParams.set("count", String(count));
	return base;
}

function normalizeResults(items: SearxngResultItem[], count: number): SearchResultItem[] {
	return items
		.map((item) => ({
			title: item.title ?? item.url ?? "Untitled",
			url: item.url ?? "",
			snippet: item.content,
			source: item.engine ?? "searxng",
		}))
		.filter((item) => item.url.length > 0)
		.slice(0, count);
}

async function search(params: ProviderSearchParams, config: ResolvedWebConfig): Promise<SearchResultItem[]> {
	const endpoint = buildSearchUrl(config, params.query, params.numResults);

	try {
		const response = await fetchWithPinnedDns(endpoint, {
			method: "GET",
			signal: withTimeoutSignal(config.timeoutMs, params.signal),
			timeoutMs: config.timeoutMs,
			allowPrivateNetwork: config.allowPrivateNetwork,
			headers: {
				accept: "application/json",
			},
		});

		if (!response.ok) {
			const responseText = await readLimitedText(response, {
				maxBytes: config.maxResponseBytes,
				context: "searxng search error",
			}).catch(() => ({ text: "" }));
			throw createSearchHttpError(response.status, response.statusText, responseText.text.slice(0, 300));
		}

		const data = await readLimitedJson<SearxngResponse>(response, {
			maxBytes: config.maxResponseBytes,
			context: "searxng search",
		});
		return normalizeResults(data.results ?? [], params.numResults);
	} catch (error) {
		if (
			typeof error === "object" &&
			error !== null &&
			"status" in error &&
			typeof (error as { status?: unknown }).status === "number"
		) {
			throw error;
		}
		throw error;
	}
}

function isAvailable(config: ResolvedWebConfig): boolean {
	try {
		const baseUrl = new URL(config.searxng.baseUrl);
		return baseUrl.protocol === "http:" || baseUrl.protocol === "https:";
	} catch {
		return false;
	}
}

export const searxngProvider: SearchProviderAdapter = {
	name: "searxng",
	isAvailable,
	search,
};
