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

interface SerperResultItem {
	title?: string;
	link?: string;
	snippet?: string;
}

interface SerperResponse {
	organic?: SerperResultItem[];
}

function createSearchHttpError(status: number, statusText: string, responseText?: string): SearchHttpError {
	const err = new Error(`Serper returned HTTP ${status} ${statusText}`) as SearchHttpError;
	err.status = status;
	err.responseText = responseText;
	return err;
}

function getApiKey(config: ResolvedWebConfig): string | undefined {
	const value = process.env[config.serper.apiKeyEnv];
	if (typeof value !== "string") return undefined;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeResults(items: SerperResultItem[], count: number): SearchResultItem[] {
	return items
		.map((item) => {
			const url = item.link ?? "";
			return {
				title: item.title ?? url,
				url,
				snippet: item.snippet,
				source: "serper",
			};
		})
		.filter((item) => item.url.length > 0)
		.slice(0, count);
}

async function search(params: ProviderSearchParams, config: ResolvedWebConfig): Promise<SearchResultItem[]> {
	const apiKey = getApiKey(config);
	if (!apiKey) {
		throw new Error(`${config.serper.apiKeyEnv} is required for web_search provider 'serper'`);
	}

	try {
		const response = await fetchWithPinnedDns(config.serper.baseUrl, {
			method: "POST",
			signal: withTimeoutSignal(config.timeoutMs, params.signal),
			timeoutMs: config.timeoutMs,
			allowPrivateNetwork: config.allowPrivateNetwork,
			headers: {
				accept: "application/json",
				"content-type": "application/json",
				"x-api-key": apiKey,
			},
			body: JSON.stringify({
				q: params.query,
				num: params.numResults,
			}),
		});

		if (!response.ok) {
			const responseText = await readLimitedText(response, {
				maxBytes: config.maxResponseBytes,
				context: "serper search error",
			}).catch(() => ({ text: "" }));
			throw createSearchHttpError(response.status, response.statusText, responseText.text.slice(0, 300));
		}

		const data = await readLimitedJson<SerperResponse>(response, {
			maxBytes: config.maxResponseBytes,
			context: "serper search",
		});
		return normalizeResults(data.organic ?? [], params.numResults);
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
		const baseUrl = new URL(config.serper.baseUrl);
		if (baseUrl.protocol !== "http:" && baseUrl.protocol !== "https:") return false;
	} catch {
		return false;
	}
	return Boolean(getApiKey(config));
}

export const serperProvider: SearchProviderAdapter = {
	name: "serper",
	isAvailable,
	search,
};
