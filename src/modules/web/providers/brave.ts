import type { ResolvedWebConfig } from "../../../shared/types.ts";
import { withTimeoutSignal } from "../abort.ts";
import { pooledFetch } from "../http-pool.ts";
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

function createSearchHttpError(
  status: number,
  statusText: string,
  responseText?: string
): SearchHttpError {
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
    .filter((item) => typeof item.url === "string" && typeof item.title === "string")
    .slice(0, count)
    .map((item) => ({
      title: item.title ?? item.url ?? "Untitled",
      url: item.url ?? "",
      snippet: item.description,
      source: "brave",
    }));
}

async function search(
  params: ProviderSearchParams,
  config: ResolvedWebConfig
): Promise<SearchResultItem[]> {
  const apiKey = getApiKey(config);
  if (!apiKey) {
    throw new Error(`${config.brave.apiKeyEnv} is required for web_search provider 'brave'`);
  }

  const endpoint = new URL(config.brave.baseUrl);
  endpoint.searchParams.set("q", params.query);
  endpoint.searchParams.set("count", String(params.numResults));

  try {
    const response = await pooledFetch(endpoint, {
      method: "GET",
      signal: withTimeoutSignal(config.timeoutMs, params.signal),
      headers: {
        accept: "application/json",
        "accept-encoding": "gzip",
        "x-subscription-token": apiKey,
      },
    });

    if (!response.ok) {
      const responseText = await response.text().catch(() => "");
      throw createSearchHttpError(response.status, response.statusText, responseText.slice(0, 300));
    }

    const data = (await response.json()) as BraveSearchResponse;
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
