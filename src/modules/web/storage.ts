import { randomUUID } from "node:crypto";
import type {
  ExtractedContent,
  GetSearchContentInput,
  QueryResultData,
  StoredResult,
  WebToolError,
} from "./types.ts";

export const WEB_RESULTS_CUSTOM_TYPE = "web-tools-results";
export const WEB_RESULTS_TTL_MS = 60 * 60 * 1000;

interface StoredEnvelope {
  timestamp: number;
  result: StoredResult;
}

export interface PersistedStoredResult {
  id: string;
  type: "fetch" | "search";
  timestamp: number;
  urls?: ExtractedContent[];
  queries?: QueryResultData[];
}

const results = new Map<string, StoredEnvelope>();

let appendEntry: ((data: PersistedStoredResult) => void) | null = null;
let maxStoredResults = 100;
let maxStoredContentChars = 200000;

export interface GetSearchContentSuccess {
  responseId: string;
  result: StoredResult | ExtractedContent | QueryResultData;
}

export type GetSearchContentResult = GetSearchContentSuccess | WebToolError;

export function setSessionResultAppender(
  handler: ((data: PersistedStoredResult) => void) | null
): void {
  appendEntry = handler;
}

export function setStorageLimits(options: {
  maxStoredResults: number;
  maxStoredContentChars: number;
}): void {
  maxStoredResults = Math.max(1, Math.floor(options.maxStoredResults));
  maxStoredContentChars = Math.max(1, Math.floor(options.maxStoredContentChars));
}

function toPersistedStoredResult(id: string, envelope: StoredEnvelope): PersistedStoredResult {
  return {
    id,
    type: envelope.result.type,
    timestamp: envelope.timestamp,
    ...(envelope.result.type === "fetch"
      ? { urls: envelope.result.urls }
      : { queries: envelope.result.queries }),
  };
}

function truncateStoredContent(content: string): { content: string; truncated: boolean } {
  if (content.length <= maxStoredContentChars) return { content, truncated: false };
  return { content: content.slice(0, maxStoredContentChars), truncated: true };
}

function compactExtractedContent(item: ExtractedContent): ExtractedContent {
  const truncated = truncateStoredContent(item.content);
  return {
    ...item,
    ...truncated,
    truncated: item.truncated || truncated.truncated,
  };
}

function compactStoredResult(result: StoredResult): StoredResult {
  if (result.type === "fetch") {
    return {
      type: "fetch",
      urls: result.urls.map((item) => compactExtractedContent(item)),
    };
  }

  return {
    type: "search",
    queries: result.queries.map((query) => ({
      ...query,
      results: query.results.map((searchItem) => ({
        ...searchItem,
        content: searchItem.content ? compactExtractedContent(searchItem.content) : undefined,
      })),
    })),
  };
}

function enforceStorageLimit(): void {
  while (results.size > maxStoredResults) {
    const firstKey = results.keys().next().value;
    if (!firstKey) return;
    results.delete(firstKey);
  }
}

export function storeResult(result: StoredResult): string {
  const responseId = randomUUID();
  const envelope: StoredEnvelope = {
    timestamp: Date.now(),
    result: compactStoredResult(result),
  };
  results.set(responseId, envelope);
  enforceStorageLimit();
  appendEntry?.(toPersistedStoredResult(responseId, envelope));
  return responseId;
}

export function getResult(responseId: string): StoredResult | undefined {
  return results.get(responseId)?.result;
}

export function clearResults(): void {
  results.clear();
}

function isPersistedStoredResult(value: unknown): value is PersistedStoredResult {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  if (typeof v.id !== "string" || v.id.length === 0) return false;
  if (v.type !== "fetch" && v.type !== "search") return false;
  if (typeof v.timestamp !== "number" || !Number.isFinite(v.timestamp)) return false;
  if (v.type === "fetch" && !Array.isArray(v.urls)) return false;
  if (v.type === "search" && !Array.isArray(v.queries)) return false;
  return true;
}

export function restoreResultsFromSession(
  branch: unknown[],
  now = Date.now(),
  ttlMs = WEB_RESULTS_TTL_MS
): number {
  results.clear();
  let restored = 0;

  for (const entry of branch) {
    const maybeEntry = entry as {
      type?: unknown;
      customType?: unknown;
      data?: unknown;
    };

    if (maybeEntry?.type !== "custom") continue;
    if (maybeEntry.customType !== WEB_RESULTS_CUSTOM_TYPE) continue;
    if (!isPersistedStoredResult(maybeEntry.data)) continue;

    const data = maybeEntry.data;
    if (now - data.timestamp > ttlMs) continue;

    const result: StoredResult =
      data.type === "fetch"
        ? { type: "fetch", urls: data.urls ?? [] }
        : { type: "search", queries: data.queries ?? [] };

    results.set(data.id, {
      timestamp: data.timestamp,
      result: compactStoredResult(result),
    });
    enforceStorageLimit();
    restored += 1;
  }

  return restored;
}

function error(code: string, message: string): WebToolError {
  return { error: { code, message } };
}

function truncateText(
  value: string,
  maxContentChars: number
): { content: string; truncated: boolean } {
  if (value.length <= maxContentChars) return { content: value, truncated: false };
  return { content: value.slice(0, maxContentChars), truncated: true };
}

function limitExtractedContent(
  result: ExtractedContent,
  maxContentChars: number
): ExtractedContent {
  const truncated = truncateText(result.content, maxContentChars);
  return {
    ...result,
    ...truncated,
    truncated: result.truncated || truncated.truncated,
  };
}

function limitQueryResult(result: QueryResultData, maxContentChars: number): QueryResultData {
  return {
    ...result,
    results: result.results.map((item) => ({
      ...item,
      content: item.content ? limitExtractedContent(item.content, maxContentChars) : undefined,
    })),
  };
}

function limitStoredResult(result: StoredResult, maxContentChars: number): StoredResult {
  if (result.type === "fetch") {
    return {
      type: "fetch",
      urls: result.urls.map((item) => limitExtractedContent(item, maxContentChars)),
    };
  }

  return {
    type: "search",
    queries: result.queries.map((query) => limitQueryResult(query, maxContentChars)),
  };
}

function formatFetchSelectorHint(stored: ExtractedContent[]): string {
  const preview = stored
    .slice(0, 5)
    .map((item, i) => `${i}: ${item.url}`)
    .join("; ");
  return `Use url or urlIndex. Available: ${preview}${stored.length > 5 ? "; ..." : ""}`;
}

function formatSearchSelectorHint(stored: QueryResultData[]): string {
  const preview = stored
    .slice(0, 5)
    .map((item, i) => `${i}: "${item.query}"`)
    .join("; ");
  return `Use query or queryIndex. Available: ${preview}${stored.length > 5 ? "; ..." : ""}`;
}

function selectFetchResult(
  stored: ExtractedContent[],
  params: GetSearchContentInput
): ExtractedContent | WebToolError | undefined {
  if (typeof params.urlIndex === "number") {
    if (
      !Number.isInteger(params.urlIndex) ||
      params.urlIndex < 0 ||
      params.urlIndex >= stored.length
    ) {
      return error(
        "NOT_FOUND",
        `urlIndex ${params.urlIndex} out of range (0-${Math.max(stored.length - 1, 0)}). ${formatFetchSelectorHint(stored)}`
      );
    }
    return stored[params.urlIndex];
  }

  if (params.url) {
    const matched = stored.find((result) => result.url === params.url);
    if (!matched) {
      return error(
        "NOT_FOUND",
        `URL "${params.url}" not found. ${formatFetchSelectorHint(stored)}`
      );
    }
    return matched;
  }

  return undefined;
}

function selectSearchResult(
  stored: QueryResultData[],
  params: GetSearchContentInput
): QueryResultData | WebToolError | undefined {
  if (typeof params.queryIndex === "number") {
    if (
      !Number.isInteger(params.queryIndex) ||
      params.queryIndex < 0 ||
      params.queryIndex >= stored.length
    ) {
      return error(
        "NOT_FOUND",
        `queryIndex ${params.queryIndex} out of range (0-${Math.max(stored.length - 1, 0)}). ${formatSearchSelectorHint(stored)}`
      );
    }
    return stored[params.queryIndex];
  }

  if (params.query) {
    const matched = stored.find((result) => result.query === params.query);
    if (!matched) {
      return error(
        "NOT_FOUND",
        `Query "${params.query}" not found. ${formatSearchSelectorHint(stored)}`
      );
    }
    return matched;
  }

  return undefined;
}

export function getSearchContent(
  params: GetSearchContentInput,
  maxContentChars: number
): GetSearchContentResult {
  const responseId = typeof params.responseId === "string" ? params.responseId.trim() : "";
  if (!responseId) {
    return error("INVALID_INPUT", "get_search_content requires responseId");
  }

  const stored = getResult(responseId);
  if (!stored) {
    return error("NOT_FOUND", `No stored web result found for responseId: ${responseId}`);
  }

  if (stored.type === "fetch") {
    const selected = selectFetchResult(stored.urls, params);
    if (selected && "error" in selected) return selected;
    if (selected) {
      return { responseId, result: limitExtractedContent(selected, maxContentChars) };
    }
  }

  if (stored.type === "search") {
    const selected = selectSearchResult(stored.queries, params);
    if (selected && "error" in selected) return selected;
    if (selected) {
      return { responseId, result: limitQueryResult(selected, maxContentChars) };
    }
  }

  return { responseId, result: limitStoredResult(stored, maxContentChars) };
}
