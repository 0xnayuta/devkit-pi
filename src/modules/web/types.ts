import type { Static } from "typebox";
import type { WebErrorCode } from "./errors.ts";
import type { FetchContentParams, GetSearchContentParams, WebSearchParams } from "./schemas.ts";

export type WebToolName = "web_search" | "fetch_content" | "get_search_content";

/** Specific content types for fetch_content handler dispatch. */
export type DetectedContentType =
  | "html"
  | "markdown"
  | "json"
  | "csv"
  | "xml"
  | "yaml"
  | "text"
  | "unsupported";

export type FetchContentInput = Static<typeof FetchContentParams>;
export type WebSearchInput = Static<typeof WebSearchParams>;
export type GetSearchContentInput = Static<typeof GetSearchContentParams>;

export interface ExtractedContent {
  url: string;
  title?: string;
  content: string;
  truncated: boolean;
  contentType?: string;
  /** Phase 2: set by handler when parse falls back to plain text. */
  parseWarning?: string;
}

export interface SearchResultItem {
  title: string;
  url: string;
  snippet?: string;
  source?: string;
  content?: ExtractedContent;
}

export interface QueryResultData {
  query: string;
  results: SearchResultItem[];
}

export type StoredResult =
  | { type: "fetch"; urls: ExtractedContent[] }
  | { type: "search"; queries: QueryResultData[] };

export interface WebToolError {
  error: {
    code: WebErrorCode;
    message: string;
  };
}
