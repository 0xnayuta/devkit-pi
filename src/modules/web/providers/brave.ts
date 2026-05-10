import type { ResolvedWebConfig } from "../../../shared/types.ts";
import { isAbortLikeError, withTimeoutSignal } from "../abort.ts";
import { pooledFetch } from "../http-pool.ts";
import type { SearchResultItem } from "../types.ts";
import type { ProviderSearchParams, SearchProviderAdapter } from "./types.ts";

const BRAVE_SEARCH_ENDPOINT = "https://api.search.brave.com/res/v1/web/search";

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

interface SearchHttpError extends Error {
  status: number;
  responseText?: string;
}

function createSearchHttpError(
  status: number,
  statusText: string,
  responseText?: string
): SearchHttpError {
  const err = new Error(
    `Brave Search API returned HTTP ${status} ${statusText}`
  ) as SearchHttpError;
  err.status = status;
  err.responseText = responseText;
  return err;
}

export function getBraveApiKey(): string | undefined {
  const value = process.env.BRAVE_SEARCH_API_KEY;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

async function search(
  params: ProviderSearchParams,
  config: ResolvedWebConfig
): Promise<SearchResultItem[]> {
  const apiKey = getBraveApiKey();
  if (!apiKey) {
    throw new Error("BRAVE_SEARCH_API_KEY is required for web_search provider 'brave'");
  }

  const url = new URL(BRAVE_SEARCH_ENDPOINT);
  url.searchParams.set("q", params.query);
  url.searchParams.set("count", String(params.numResults));

  try {
    const response = await pooledFetch(url, {
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

    return (data.web?.results ?? [])
      .filter((item) => typeof item.url === "string" && typeof item.title === "string")
      .slice(0, params.numResults)
      .map((item) => ({
        title: item.title ?? item.url ?? "Untitled",
        url: item.url ?? "",
        snippet: item.description,
        source: "brave",
      }));
  } catch (error) {
    if (isAbortLikeError(error)) {
      throw error;
    }
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

export const braveProvider: SearchProviderAdapter = {
  name: "brave",
  isAvailable() {
    return Boolean(getBraveApiKey());
  },
  search,
};
