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

interface BraveSearchResult {
	title?: string;
	url?: string;
	description?: string;
	profile?: {
		name?: string;
	};
}

interface BraveSearchResponse {
	web?: {
		results?: BraveSearchResult[];
	};
}

function createSearchHttpError(status: number, statusText: string, responseText?: string): SearchHttpError {
	const err = new Error(`Brave returned HTTP ${status} ${statusText}`) as SearchHttpError;
	err.status = status;
	err.responseText = responseText;
	return err;
}

function getApiKey(config: ResolvedWebConfig): string | undefined {
	const value = process.env[config.brave.apiKeyEnv];
	if (typeof value !== "string") return undefined;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeResults(items: BraveSearchResult[], count: number): SearchResultItem[] {
	return items
		.map((item) => ({
			title: item.title ?? item.url ?? "Untitled",
			url: item.url ?? "",
			snippet: item.description,
			source: "brave",
		}))
		.filter((item) => item.url.length > 0)
		.slice(0, count);
}

async function search(params: ProviderSearchParams, config: ResolvedWebConfig): Promise<SearchResultItem[]> {
	const apiKey = getApiKey(config);
	if (!apiKey) {
		throw new Error(`${config.brave.apiKeyEnv} is required for web_search provider 'brave'`);
	}

	const endpoint = new URL(config.brave.baseUrl);
	endpoint.searchParams.set("q", params.query);
	endpoint.searchParams.set("count", String(params.numResults));

	try {
		const response = await fetchWithPinnedDns(endpoint, {
			method: "GET",
			signal: withTimeoutSignal(config.timeoutMs, params.signal),
			timeoutMs: config.timeoutMs,
			allowPrivateNetwork: config.allowPrivateNetwork,
			headers: {
				accept: "application/json",
				"accept-encoding": "gzip",
				"x-subscription-token": apiKey,
			},
		});

		if (!response.ok) {
			const responseText = await readLimitedText(response, {
				maxBytes: config.maxResponseBytes,
				context: "brave search error",
			}).catch(() => ({ text: "" }));
			throw createSearchHttpError(response.status, response.statusText, responseText.text.slice(0, 300));
		}

		const data = await readLimitedJson<BraveSearchResponse>(response, {
			maxBytes: config.maxResponseBytes,
			context: "brave search",
		});
		return normalizeResults(data.web?.results ?? [], params.numResults);
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
		const baseUrl = new URL(config.brave.baseUrl);
		if (baseUrl.protocol !== "http:" && baseUrl.protocol !== "https:") return false;
	} catch {
		return false;
	}
	return Boolean(getApiKey(config));
}

export const braveProvider: SearchProviderAdapter = {
	name: "brave",
	isAvailable,
	search,
};
