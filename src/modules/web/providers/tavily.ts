import type { ResolvedWebConfig } from "../../../shared/types.ts";
import { withTimeoutSignal } from "../abort.ts";
import { pooledFetch } from "../http-pool.ts";
import { readLimitedJson, readLimitedText } from "../read-limited.ts";
import type { SearchResultItem } from "../types.ts";
import type { ProviderSearchParams, SearchProviderAdapter } from "./types.ts";

interface SearchHttpError extends Error {
	status: number;
	responseText?: string;
}

interface TavilyResultItem {
	title?: string;
	url?: string;
	content?: string;
}

interface TavilyResponse {
	results?: TavilyResultItem[];
}

function createSearchHttpError(status: number, statusText: string, responseText?: string): SearchHttpError {
	const err = new Error(`Tavily returned HTTP ${status} ${statusText}`) as SearchHttpError;
	err.status = status;
	err.responseText = responseText;
	return err;
}

function getApiKey(config: ResolvedWebConfig): string | undefined {
	const value = process.env[config.tavily.apiKeyEnv];
	if (typeof value !== "string") return undefined;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeResults(items: TavilyResultItem[], count: number): SearchResultItem[] {
	return items
		.map((item) => ({
			title: item.title ?? item.url ?? "Untitled",
			url: item.url ?? "",
			snippet: item.content,
			source: "tavily",
		}))
		.filter((item) => item.url.length > 0)
		.slice(0, count);
}

async function search(params: ProviderSearchParams, config: ResolvedWebConfig): Promise<SearchResultItem[]> {
	const apiKey = getApiKey(config);
	if (!apiKey) {
		throw new Error(`${config.tavily.apiKeyEnv} is required for web_search provider 'tavily'`);
	}

	try {
		const response = await pooledFetch(config.tavily.baseUrl, {
			method: "POST",
			signal: withTimeoutSignal(config.timeoutMs, params.signal),
			headers: {
				accept: "application/json",
				"content-type": "application/json",
			},
			body: JSON.stringify({
				api_key: apiKey,
				query: params.query,
				max_results: params.numResults,
			}),
		});

		if (!response.ok) {
			const responseText = await readLimitedText(response, {
				maxBytes: config.maxResponseBytes,
				context: "tavily search error",
			}).catch(() => ({ text: "" }));
			throw createSearchHttpError(response.status, response.statusText, responseText.text.slice(0, 300));
		}

		const data = await readLimitedJson<TavilyResponse>(response, {
			maxBytes: config.maxResponseBytes,
			context: "tavily search",
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
		const baseUrl = new URL(config.tavily.baseUrl);
		if (baseUrl.protocol !== "http:" && baseUrl.protocol !== "https:") return false;
	} catch {
		return false;
	}
	return Boolean(getApiKey(config));
}

export const tavilyProvider: SearchProviderAdapter = {
	name: "tavily",
	isAvailable,
	search,
};
