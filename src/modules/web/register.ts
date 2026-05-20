import type { AgentToolResult } from "@earendil-works/pi-agent-core";
import { defineTool, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { getDevkitToolMetadata } from "../../extension/manifest.ts";
import { createDevkitErrorPayload } from "../../shared/errors.ts";
import { createLogger, type Logger } from "../../shared/logger.ts";
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
  toDevkitWebErrorPayload,
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
export function registerWebTools(
  pi: ExtensionAPI,
  config: ResolvedWebConfig,
  options: { logger?: Logger } = {}
): void {
  const logger = options.logger ?? createLogger({ module: "web.register" });
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

  setSessionResultAppender((data) => {
    pi.appendEntry(WEB_RESULTS_CUSTOM_TYPE, data);
  });

  pi.on("session_start", (_event, ctx) => {
    const branch = ctx?.sessionManager?.getBranch?.();
    if (Array.isArray(branch)) {
      restoreResultsFromSession(branch);
    } else {
      clearResults();
    }
    resetWebToolStats();
  });

  pi.on("session_shutdown", () => {
    clearResults();
    resetWebToolStats();
  });

  const webSearchMeta = getDevkitToolMetadata("web_search");
  const fetchContentMeta = getDevkitToolMetadata("fetch_content");
  const getSearchContentMeta = getDevkitToolMetadata("get_search_content");

  pi.registerTool(
    defineTool({
      name: webSearchMeta.name,
      label: webSearchMeta.label,
      description: webSearchMeta.description,
      promptSnippet: webSearchMeta.promptSnippet,
      promptGuidelines: [...webSearchMeta.promptGuidelines],
      parameters: WebSearchParams,
      async execute(_id: string, params: WebSearchInput, signal: AbortSignal | undefined) {
        const result = await webSearch(params, config, signal ?? new AbortController().signal);
        if ("error" in result) {
          logger.warn("web.error_payload", "web_search returned structured error", {
            payload: createDevkitErrorPayload({
              code: result.error.code,
              message: result.error.message,
              module: "web",
              retryable: false,
            }),
          });
        }
        return asToolResult(result);
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
      name: fetchContentMeta.name,
      label: fetchContentMeta.label,
      description: fetchContentMeta.description,
      promptSnippet: fetchContentMeta.promptSnippet,
      promptGuidelines: [...fetchContentMeta.promptGuidelines],
      parameters: FetchContentParams,
      async execute(_id: string, params: FetchContentInput, signal: AbortSignal | undefined) {
        const result = await fetchContent(params, config, signal ?? new AbortController().signal);
        if ("error" in result) {
          logger.warn("web.error_payload", "fetch_content returned structured error", {
            payload: createDevkitErrorPayload({
              code: result.error.code,
              message: result.error.message,
              module: "web",
              retryable: false,
            }),
          });
        }
        return asToolResult(result);
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
      name: getSearchContentMeta.name,
      label: getSearchContentMeta.label,
      description: getSearchContentMeta.description,
      promptSnippet: getSearchContentMeta.promptSnippet,
      promptGuidelines: [...getSearchContentMeta.promptGuidelines],
      parameters: GetSearchContentParams,
      async execute(_id: string, params: GetSearchContentInput) {
        const result = getSearchContent(params, config.maxContentChars);
        recordGetContentActivity(
          "error" in result ? "error" : "success",
          "error" in result ? result.error.code : undefined
        );
        if ("error" in result) {
          logger.warn("web.error_payload", "get_search_content returned structured error", {
            payload: createDevkitErrorPayload({
              code: result.error.code,
              message: result.error.message,
              module: "web",
              retryable: false,
            }),
          });
        }
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
