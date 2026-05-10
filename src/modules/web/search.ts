import type { ResolvedWebConfig } from "../../shared/types.ts";
import { isAbortLikeError } from "./abort.ts";
import { getSearchCache } from "./cache.ts";
import { withThrottle } from "./concurrency.ts";
import { mapHttpStatusToError, mapNetworkErrorToWebError, WEB_ERROR_CODES } from "./errors.ts";
import { truncateContent } from "./extract.ts";
import { fetchUrlContent } from "./fetch.ts";
import { recordSearchActivity, webDebugLog } from "./observability.ts";
import { selectSearchProvider } from "./providers/select-provider.ts";
import { storeResult } from "./storage.ts";
import type { QueryResultData, SearchResultItem, WebSearchInput, WebToolError } from "./types.ts";

export interface WebSearchSuccess {
  responseId: string;
  queries: QueryResultData[];
}

export type WebSearchResult = WebSearchSuccess | WebToolError;

const MAX_QUERIES = 5;

function error(code: string, message: string): WebToolError {
  return { error: { code, message } };
}

function normalizeQueries(params: WebSearchInput): string[] {
  const queries = [params.query, ...(params.queries ?? [])]
    .filter((query): query is string => typeof query === "string")
    .map((query) => query.trim())
    .filter((query) => query.length > 0);
  return [...new Set(queries)].slice(0, MAX_QUERIES);
}

function normalizeNumResults(params: WebSearchInput, config: ResolvedWebConfig): number {
  const requested = params.numResults;
  if (typeof requested !== "number" || !Number.isFinite(requested)) {
    return config.maxResults;
  }
  return Math.min(Math.max(Math.floor(requested), 1), config.maxResults);
}

function limitSearchOutput(queries: QueryResultData[], maxContentChars: number): QueryResultData[] {
  return queries.map((query) => ({
    ...query,
    results: query.results.map((result) => ({
      ...result,
      content: result.content
        ? {
            ...result.content,
            ...truncateContent(result.content.content, maxContentChars),
          }
        : undefined,
    })),
  }));
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  if (items.length === 0) return [];

  const safeConcurrency = Math.max(1, Math.floor(concurrency));
  const output = new Array<R>(items.length);
  let nextIndex = 0;

  async function runWorker(): Promise<void> {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) return;
      output[index] = await worker(items[index], index);
    }
  }

  const workerCount = Math.min(safeConcurrency, items.length);
  await Promise.all(Array.from({ length: workerCount }, () => runWorker()));
  return output;
}

async function attachContent(
  queries: QueryResultData[],
  config: ResolvedWebConfig,
  signal?: AbortSignal
): Promise<QueryResultData[]> {
  const output: QueryResultData[] = [];

  for (const query of queries) {
    const results = await mapWithConcurrency(
      query.results,
      config.concurrency.maxConcurrent,
      async (result): Promise<SearchResultItem> => {
        try {
          return {
            ...result,
            content: await withThrottle(() => fetchUrlContent(result.url, config, signal)),
          };
        } catch {
          return result;
        }
      }
    );

    output.push({ ...query, results });
  }

  return output;
}

function providerDisplayName(providerName: string): string {
  if (providerName === "brave") return "Brave Search";
  if (providerName === "ddgs") return "DuckDuckGo Lite";
  if (providerName === "openserp") return "OpenSERP";
  if (providerName === "searxng") return "SearXNG";
  if (providerName === "tavily") return "Tavily";
  if (providerName === "serper") return "Serper";
  return providerName;
}

function classifySearchError(err: unknown, providerName: string, startTs: number): WebToolError {
  const displayName = providerDisplayName(providerName);

  if (isAbortLikeError(err)) {
    recordSearchActivity(providerName, "error", startTs, WEB_ERROR_CODES.WEB_SEARCH_TIMEOUT);
    return {
      error: {
        code: WEB_ERROR_CODES.WEB_SEARCH_TIMEOUT,
        message:
          "web_search timed out or was aborted. Try fewer queries, smaller numResults, or increase web.timeoutMs.",
      },
    };
  }

  const message = err instanceof Error ? err.message : String(err);

  const errStatus =
    typeof err === "object" && err !== null && "status" in err
      ? typeof (err as { status?: unknown }).status === "number"
        ? (err as { status: number }).status
        : undefined
      : undefined;

  // Check for auth errors
  if (
    message.includes("BRAVE_SEARCH_API_KEY") ||
    message.includes("is required for web_search provider") ||
    errStatus === 401 ||
    errStatus === 403
  ) {
    const status = errStatus ?? 403;
    const webError = mapHttpStatusToError(
      status,
      providerName,
      `${displayName} authentication failed`
    );
    recordSearchActivity(providerName, "error", startTs, webError.code);
    return {
      error: {
        code: webError.code,
        message: webError.message,
      },
    };
  }

  if (errStatus === 429) {
    recordSearchActivity(
      providerName,
      "rate_limited",
      startTs,
      WEB_ERROR_CODES.PROVIDER_RATE_LIMITED
    );
    return {
      error: {
        code: WEB_ERROR_CODES.PROVIDER_RATE_LIMITED,
        message: `${displayName} rate limit reached (HTTP 429). Retry later or reduce query frequency.`,
      },
    };
  }

  if (typeof errStatus === "number" && errStatus >= 500) {
    const webError = mapHttpStatusToError(errStatus, providerName);
    recordSearchActivity(providerName, "error", startTs, webError.code);
    return {
      error: {
        code: webError.code,
        message: webError.message,
      },
    };
  }

  const lower = message.toLowerCase();
  if (lower.includes("fetch failed") || lower.includes("enotfound") || lower.includes("econn")) {
    const webError = mapNetworkErrorToWebError(
      err instanceof Error ? err : new Error(message),
      providerName
    );
    recordSearchActivity(providerName, "error", startTs, webError.code);
    return {
      error: {
        code: webError.code,
        message: webError.message,
      },
    };
  }

  recordSearchActivity(providerName, "error", startTs, WEB_ERROR_CODES.WEB_SEARCH_FAILED);
  return {
    error: {
      code: WEB_ERROR_CODES.WEB_SEARCH_FAILED,
      message,
    },
  };
}

export async function webSearch(
  params: WebSearchInput,
  config: ResolvedWebConfig,
  signal?: AbortSignal
): Promise<WebSearchResult> {
  const queries = normalizeQueries(params);
  if (queries.length === 0) {
    return error("INVALID_INPUT", "web_search requires query or queries");
  }

  const selection = await selectSearchProvider(config);
  if (!selection.ok) {
    return selection.error;
  }

  const numResults = normalizeNumResults(params, config);
  let lastError: WebToolError | undefined;

  for (const provider of selection.providers) {
    const startTs = Date.now();
    try {
      let queryResults: QueryResultData[] = [];
      const cache = getSearchCache();
      for (const query of queries) {
        const cached = cache.get(query, provider.name, numResults);
        if (cached) {
          queryResults.push(...cached);
          continue;
        }

        const queryResult: QueryResultData = {
          query,
          results: await withThrottle(() => provider.search({ query, numResults, signal }, config)),
        };
        cache.set(query, provider.name, numResults, [queryResult]);
        queryResults.push(queryResult);
      }

      if (params.includeContent === true) {
        queryResults = await attachContent(queryResults, config, signal);
      }

      const responseId = storeResult({ type: "search", queries: queryResults });
      recordSearchActivity(provider.name, "success", startTs);
      webDebugLog("web_search success", {
        provider: provider.name,
        mode: selection.mode,
        queries: queryResults.length,
        responseId,
        includeContent: params.includeContent === true,
      });
      return {
        responseId,
        queries: limitSearchOutput(queryResults, config.maxContentChars),
      };
    } catch (err) {
      const classified = classifySearchError(err, provider.name, startTs);
      lastError = classified;
      webDebugLog("web_search failed", {
        provider: provider.name,
        mode: selection.mode,
        code: classified.error.code,
        message: classified.error.message,
      });

      if (selection.mode === "explicit") {
        return classified;
      }
    }
  }

  return lastError ?? error("WEB_SEARCH_FAILED", "No web_search provider completed successfully.");
}
