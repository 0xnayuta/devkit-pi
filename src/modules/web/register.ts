import type { AgentToolResult } from "@earendil-works/pi-agent-core";
import { defineTool, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { ResolvedWebConfig } from "../../shared/types.ts";
import { initializeSearchCache } from "./cache.ts";
import { initializeRequestThrottler } from "./concurrency.ts";
import { fetchContent } from "./fetch.ts";
import { initializeConnectionPool } from "./http-pool.ts";
import {
  configureWebObservability,
  recordGetContentActivity,
  resetWebToolStats,
} from "./observability.ts";
import {
  renderFetchContentCall,
  renderFetchContentResult,
  renderGetSearchContentCall,
  renderGetSearchContentResult,
  renderWebSearchCall,
  renderWebSearchResult,
} from "./renderers.ts";
import { FetchContentParams, GetSearchContentParams, WebSearchParams } from "./schemas.ts";
import { webSearch } from "./search.ts";
import {
  clearResults,
  getSearchContent,
  restoreResultsFromSession,
  setSessionResultAppender,
  setStorageLimits,
  WEB_RESULTS_CUSTOM_TYPE,
} from "./storage.ts";
import type { FetchContentInput, GetSearchContentInput, WebSearchInput } from "./types.ts";

// Re-export performance optimization APIs
export {
  type CacheConfig,
  type CacheStats,
  getSearchCache,
  initializeSearchCache,
  resetSearchCache,
  SearchResultCache,
} from "./cache.ts";
export {
  type ConcurrencyConfig,
  getRequestThrottler,
  initializeRequestThrottler,
  QueueFullError,
  RequestThrottler,
  resetRequestThrottler,
  type ThrottlerStats,
  withThrottle,
} from "./concurrency.ts";
export {
  createWebError,
  formatWebError,
  getErrorSummary,
  mapHttpStatusToError,
  mapNetworkErrorToWebError,
  type RecoverySuggestion,
  WEB_ERROR_CODES,
  type WebError,
  type WebErrorCode,
} from "./errors.ts";
export {
  type ConnectionPoolConfig,
  getConnectionPool,
  HttpConnectionPool,
  initializeConnectionPool,
  type PoolStats,
  pooledFetch,
  resetConnectionPool,
} from "./http-pool.ts";
// Re-export observability and error APIs for external access
export {
  type ActivityEntry,
  getActivityLog,
  getDebugLevel,
  getWebToolStats,
  type ProviderStats,
  recordFetchActivity,
  recordGetContentActivity,
  recordSearchActivity,
  type WebToolStats,
} from "./observability.ts";

function asToolResult(details: unknown): AgentToolResult<any> {
  return {
    content: [{ type: "text", text: JSON.stringify(details, null, 2) }],
    details,
  };
}

/**
 * Register bundled readonly web tools.
 */
export function registerWebTools(pi: ExtensionAPI, config: ResolvedWebConfig): void {
  if (!config.enabled) return;

  // Initialize performance optimization modules
  initializeSearchCache(config.cache);
  initializeRequestThrottler(config.concurrency);
  initializeConnectionPool(config.connectionPool);

  configureWebObservability(config.debug);
  setStorageLimits({
    maxStoredResults: config.maxStoredResults,
    maxStoredContentChars: config.maxStoredContentChars,
  });

  const piAny = pi as any;
  if (typeof piAny.appendEntry === "function") {
    setSessionResultAppender((data) => {
      piAny.appendEntry(WEB_RESULTS_CUSTOM_TYPE, data);
    });
  } else {
    setSessionResultAppender(null);
  }

  if (typeof piAny.on === "function") {
    piAny.on("session_start", (_event: unknown, ctx: any) => {
      const branch = ctx?.sessionManager?.getBranch?.();
      if (Array.isArray(branch)) {
        restoreResultsFromSession(branch);
      } else {
        clearResults();
      }
      resetWebToolStats();
    });

    piAny.on("session_shutdown", () => {
      clearResults();
      resetWebToolStats();
    });
  }

  pi.registerTool(
    defineTool({
      name: "web_search",
      label: "Web Search",
      description: "Search the web with the configured readonly search provider.",
      parameters: WebSearchParams,
      execute(_id: string, params: WebSearchInput, signal: AbortSignal | undefined) {
        return webSearch(params, config, signal ?? new AbortController().signal).then(asToolResult);
      },
      renderCall(args: WebSearchInput, theme: any) {
        return renderWebSearchCall(args, theme);
      },
      renderResult(
        result: AgentToolResult<any>,
        options: { expanded: boolean; isPartial: boolean },
        theme: any
      ) {
        return renderWebSearchResult(result, options, theme);
      },
    })
  );

  pi.registerTool(
    defineTool({
      name: "fetch_content",
      label: "Fetch Content",
      description: "Fetch HTTP/HTTPS URL content and extract readable text. Readonly.",
      parameters: FetchContentParams,
      execute(_id: string, params: FetchContentInput, signal: AbortSignal | undefined) {
        return fetchContent(params, config, signal ?? new AbortController().signal).then(
          asToolResult
        );
      },
      renderCall(args: FetchContentInput, theme: any) {
        return renderFetchContentCall(args, theme);
      },
      renderResult(
        result: AgentToolResult<any>,
        options: { expanded: boolean; isPartial: boolean },
        theme: any
      ) {
        return renderFetchContentResult(result, options, theme);
      },
    })
  );

  pi.registerTool(
    defineTool({
      name: "get_search_content",
      label: "Get Search Content",
      description: "Retrieve stored web_search or fetch_content results by responseId. Readonly.",
      parameters: GetSearchContentParams,
      async execute(_id: string, params: GetSearchContentInput) {
        const result = getSearchContent(params, config.maxContentChars);
        recordGetContentActivity(
          "error" in result ? "error" : "success",
          "error" in result ? result.error.code : undefined
        );
        return asToolResult(result);
      },
      renderCall(args: GetSearchContentInput, theme: any) {
        return renderGetSearchContentCall(args, theme);
      },
      renderResult(
        result: AgentToolResult<any>,
        options: { expanded: boolean; isPartial: boolean },
        theme: any
      ) {
        return renderGetSearchContentResult(result, options, theme);
      },
    })
  );
}

export type { FetchContentInput, GetSearchContentInput, WebSearchInput };
export { FetchContentParams, GetSearchContentParams, WebSearchParams };
