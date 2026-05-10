import type { AgentToolResult } from "@earendil-works/pi-agent-core";
import { keyHint } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import type { FetchContentInput, GetSearchContentInput, WebSearchInput } from "./types.ts";

const SUMMARY_CHARS = 500;
const PREVIEW_ITEMS = 3;
const URL_MAX_CHARS = 80;

type ThemeLike = {
  fg?: (color: string, text: string) => string;
  bold?: (text: string) => string;
};

type RenderOptions = {
  expanded: boolean;
  isPartial: boolean;
};

export function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch (error) {
    return `[Unserializable result: ${error instanceof Error ? error.message : String(error)}]`;
  }
}

export function truncateText(
  text: string,
  maxChars = SUMMARY_CHARS
): { text: string; truncated: boolean } {
  if (text.length <= maxChars) return { text, truncated: false };
  return { text: `${text.slice(0, Math.max(0, maxChars - 1))}…`, truncated: true };
}

export function getTextContent(result: AgentToolResult<any>): string {
  return result.content
    .map((item) => (item.type === "text" && typeof item.text === "string" ? item.text : ""))
    .filter((text) => text.length > 0)
    .join("\n");
}

function fg(theme: ThemeLike, color: string, text: string): string {
  return typeof theme.fg === "function" ? theme.fg(color, text) : text;
}

function bold(theme: ThemeLike, text: string): string {
  return typeof theme.bold === "function" ? theme.bold(text) : text;
}

function title(theme: ThemeLike, text: string): string {
  return fg(theme, "toolTitle", bold(theme, text));
}

function component(text: string): Text {
  return new Text(text, 0, 0);
}

function parseTextDetails(result: AgentToolResult<any>): unknown {
  const text = getTextContent(result);
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function detailsOf(result: AgentToolResult<any>): unknown {
  return result.details ?? parseTextDetails(result);
}

function hasError(
  value: unknown
): value is { error: { code?: unknown; message?: unknown; recovery?: unknown } } {
  return Boolean(
    value &&
      typeof value === "object" &&
      "error" in value &&
      (value as { error?: unknown }).error &&
      typeof (value as { error?: unknown }).error === "object"
  );
}

function renderError(
  value: { error: { code?: unknown; message?: unknown; recovery?: unknown } },
  theme: ThemeLike
): Text {
  const code = typeof value.error.code === "string" ? value.error.code : "ERROR";
  const message =
    typeof value.error.message === "string"
      ? value.error.message
      : safeStringify(value.error.message);
  let text = fg(theme, "error", code);
  text += fg(theme, "dim", `: ${message}`);
  if (value.error.recovery) {
    const recovery =
      typeof value.error.recovery === "string"
        ? value.error.recovery
        : safeStringify(value.error.recovery);
    text += fg(theme, "warning", `\nRecovery: ${recovery}`);
  }
  return component(text);
}

function expandKeyHint(theme: ThemeLike): string {
  try {
    return keyHint("app.tools.expand", "to expand");
  } catch {
    return fg(theme, "dim", "ctrl+o") + fg(theme, "muted", " to expand");
  }
}

function hiddenHint(theme: ThemeLike, message: string): string {
  return fg(theme, "muted", `\n... (${message}, `) + expandKeyHint(theme) + fg(theme, "muted", ")");
}

function isContentPreviewTruncated(
  value: { content?: unknown },
  maxChars = SUMMARY_CHARS
): boolean {
  if (typeof value.content !== "string") return false;
  return value.content.replace(/\s+/g, " ").trim().length > maxChars;
}

function displayUrl(url: string, maxChars = URL_MAX_CHARS): string {
  try {
    const parsed = new URL(url);
    const compact = `${parsed.hostname}${parsed.pathname === "/" ? "" : parsed.pathname}`;
    return truncateText(compact, maxChars).text;
  } catch {
    return truncateText(url, maxChars).text;
  }
}

function normalizeQueries(args: WebSearchInput): string[] {
  return [args.query, ...(args.queries ?? [])]
    .filter((query): query is string => typeof query === "string")
    .map((query) => query.trim())
    .filter(Boolean);
}

function normalizeUrls(args: FetchContentInput): string[] {
  return [args.url, ...(args.urls ?? [])]
    .filter((url): url is string => typeof url === "string")
    .map((url) => url.trim())
    .filter(Boolean);
}

function selectorSummary(args: GetSearchContentInput): string {
  if (typeof args.urlIndex === "number") return `urlIndex=${args.urlIndex}`;
  if (args.url) return `url=${displayUrl(args.url)}`;
  if (typeof args.queryIndex === "number") return `queryIndex=${args.queryIndex}`;
  if (args.query) return `query=${args.query}`;
  return "all";
}

export function renderWebSearchCall(args: WebSearchInput, theme: ThemeLike): Text {
  const queries = normalizeQueries(args);
  let text = title(theme, "web_search ");
  text += fg(theme, "accent", queries[0] ?? "");
  if (queries.length > 1) text += fg(theme, "dim", ` +${queries.length - 1} queries`);
  if (typeof args.numResults === "number")
    text += fg(theme, "dim", ` (${args.numResults} results)`);
  if (args.includeContent) text += fg(theme, "dim", " includeContent");
  return component(text);
}

export function renderFetchContentCall(args: FetchContentInput, theme: ThemeLike): Text {
  const urls = normalizeUrls(args);
  let text = title(theme, "fetch_content ");
  text += fg(theme, "accent", displayUrl(urls[0] ?? ""));
  if (urls.length > 1) text += fg(theme, "dim", ` +${urls.length - 1} urls`);
  return component(text);
}

export function renderGetSearchContentCall(args: GetSearchContentInput, theme: ThemeLike): Text {
  let text = title(theme, "get_search_content ");
  text += fg(theme, "accent", args.responseId ?? "");
  text += fg(theme, "dim", ` (${selectorSummary(args)})`);
  return component(text);
}

export function renderWebSearchResult(
  result: AgentToolResult<any>,
  { expanded, isPartial }: RenderOptions,
  theme: ThemeLike
): Text {
  if (isPartial) return component(fg(theme, "warning", "Searching..."));

  const details = detailsOf(result);
  if (hasError(details)) return renderError(details, theme);
  if (expanded) return component(fg(theme, "toolOutput", safeStringify(details)));

  const data = details as {
    responseId?: string;
    queries?: Array<{ query?: string; results?: Array<any> }>;
  };
  const queries = Array.isArray(data.queries) ? data.queries : [];
  const totalResults = queries.reduce(
    (sum, query) => sum + (Array.isArray(query.results) ? query.results.length : 0),
    0
  );
  let text = fg(theme, "success", `responseId: ${data.responseId ?? "unknown"}`);
  text += fg(theme, "dim", `\nqueries: ${queries.length}, results: ${totalResults}`);

  const previewItems = queries.flatMap((query) =>
    (Array.isArray(query.results) ? query.results : []).map((item) => ({
      query: query.query,
      item,
    }))
  );

  for (const { query, item } of previewItems.slice(0, PREVIEW_ITEMS)) {
    const heading = typeof item.title === "string" ? item.title : "Untitled";
    const url = typeof item.url === "string" ? displayUrl(item.url) : "";
    text += `\n${fg(theme, "accent", "• ")}${heading}${url ? fg(theme, "dim", ` — ${url}`) : ""}`;
    if (query) text += fg(theme, "dim", ` [${query}]`);
  }
  const hiddenMessage =
    previewItems.length > PREVIEW_ITEMS
      ? `${previewItems.length - PREVIEW_ITEMS} more results`
      : "details hidden";

  return component(text + hiddenHint(theme, hiddenMessage));
}

export function renderFetchContentResult(
  result: AgentToolResult<any>,
  { expanded, isPartial }: RenderOptions,
  theme: ThemeLike
): Text {
  if (isPartial) return component(fg(theme, "warning", "Fetching..."));

  const details = detailsOf(result);
  if (hasError(details)) return renderError(details, theme);
  if (expanded) return component(fg(theme, "toolOutput", safeStringify(details)));

  const data = details as { responseId?: string; results?: Array<any> };
  const results = Array.isArray(data.results) ? data.results : [];
  let text = fg(theme, "success", `responseId: ${data.responseId ?? "unknown"}`);
  text += fg(theme, "dim", `\nurls: ${results.length}`);

  let hasTruncatedPreview = false;
  for (const item of results.slice(0, PREVIEW_ITEMS)) {
    const label =
      typeof item.title === "string" && item.title
        ? item.title
        : displayUrl(String(item.url ?? ""));
    const url = typeof item.url === "string" ? displayUrl(item.url) : "";
    const content = typeof item.content === "string" ? item.content : "";
    const preview = truncateText(
      content.replace(/\s+/g, " ").trim(),
      Math.max(120, Math.floor(SUMMARY_CHARS / Math.max(results.length, 1)))
    );
    text += `\n${fg(theme, "accent", "• ")}${label}${url ? fg(theme, "dim", ` — ${url}`) : ""}`;
    if (preview.text) text += fg(theme, "toolOutput", `\n  ${preview.text}`);
    if (preview.truncated) hasTruncatedPreview = true;
    if (item.truncated) text += fg(theme, "warning", " [truncated]");
  }
  const hiddenMessage =
    results.length > PREVIEW_ITEMS
      ? `${results.length - PREVIEW_ITEMS} more urls`
      : hasTruncatedPreview
        ? "content truncated"
        : "details hidden";

  return component(text + hiddenHint(theme, hiddenMessage));
}

function summarizeSearchContent(
  value: { query?: string; results?: Array<any> },
  theme: ThemeLike
): string {
  const results = Array.isArray(value.results) ? value.results : [];
  let text = fg(theme, "dim", `query: ${value.query ?? "unknown"}, results: ${results.length}`);
  for (const item of results.slice(0, PREVIEW_ITEMS)) {
    const titleText = typeof item.title === "string" ? item.title : "Untitled";
    const url = typeof item.url === "string" ? displayUrl(item.url) : "";
    text += `\n${fg(theme, "accent", "• ")}${titleText}${url ? fg(theme, "dim", ` — ${url}`) : ""}`;
  }
  if (results.length > PREVIEW_ITEMS)
    text += fg(theme, "muted", `\n... ${results.length - PREVIEW_ITEMS} more results`);
  return text;
}

function summarizeExtractedContent(
  value: { url?: string; title?: string; content?: string; truncated?: boolean },
  theme: ThemeLike
): string {
  const label = value.title || (value.url ? displayUrl(value.url) : "content");
  const preview = truncateText(
    String(value.content ?? "")
      .replace(/\s+/g, " ")
      .trim(),
    SUMMARY_CHARS
  );
  let text = `${fg(theme, "accent", label)}${value.url ? fg(theme, "dim", ` — ${displayUrl(value.url)}`) : ""}`;
  if (preview.text) text += fg(theme, "toolOutput", `\n${preview.text}`);
  if (value.truncated || preview.truncated) text += fg(theme, "warning", " [truncated]");
  return text;
}

export function renderGetSearchContentResult(
  result: AgentToolResult<any>,
  { expanded, isPartial }: RenderOptions,
  theme: ThemeLike
): Text {
  if (isPartial) return component(fg(theme, "warning", "Loading stored content..."));

  const details = detailsOf(result);
  if (hasError(details)) return renderError(details, theme);
  if (expanded) return component(fg(theme, "toolOutput", safeStringify(details)));

  const data = details as { responseId?: string; result?: any };
  const selected = data.result;
  let text = fg(theme, "success", `responseId: ${data.responseId ?? "unknown"}`);
  let hiddenMessage = "details hidden";

  if (selected?.type === "fetch" && Array.isArray(selected.urls)) {
    text += fg(theme, "dim", `\nfetch results: ${selected.urls.length}`);
    for (const item of selected.urls.slice(0, PREVIEW_ITEMS)) {
      text += `\n${summarizeExtractedContent(item, theme)}`;
    }
    if (selected.urls.length > PREVIEW_ITEMS) {
      hiddenMessage = `${selected.urls.length - PREVIEW_ITEMS} more urls`;
    } else if (
      selected.urls.some((item: { content?: unknown }) => isContentPreviewTruncated(item))
    ) {
      hiddenMessage = "content truncated";
    }
  } else if (selected?.type === "search" && Array.isArray(selected.queries)) {
    text += fg(theme, "dim", `\nsearch queries: ${selected.queries.length}`);
    for (const query of selected.queries.slice(0, PREVIEW_ITEMS)) {
      text += `\n${summarizeSearchContent(query, theme)}`;
    }
    if (selected.queries.length > PREVIEW_ITEMS) {
      hiddenMessage = `${selected.queries.length - PREVIEW_ITEMS} more queries`;
    }
  } else if (selected && typeof selected === "object" && "content" in selected) {
    text += `\n${summarizeExtractedContent(selected, theme)}`;
    if (isContentPreviewTruncated(selected)) hiddenMessage = "content truncated";
  } else if (selected && typeof selected === "object" && "results" in selected) {
    text += `\n${summarizeSearchContent(selected, theme)}`;
    const results = Array.isArray(selected.results) ? selected.results : [];
    if (results.length > PREVIEW_ITEMS)
      hiddenMessage = `${results.length - PREVIEW_ITEMS} more results`;
  } else {
    text += `\n${truncateText(safeStringify(selected), SUMMARY_CHARS).text}`;
  }

  return component(text + hiddenHint(theme, hiddenMessage));
}
