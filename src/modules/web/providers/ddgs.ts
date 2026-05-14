import type { ResolvedWebConfig } from "../../../shared/types.ts";
import { withTimeoutSignal } from "../abort.ts";
import { normalizeWhitespace } from "../extract.ts";
import { pooledFetch } from "../http-pool.ts";
import { readLimitedText, readLimitedTextOrThrow } from "../read-limited.ts";
import type { SearchResultItem } from "../types.ts";
import type { ProviderSearchParams, SearchProviderAdapter } from "./types.ts";

const DDGS_LITE_ENDPOINT = "https://lite.duckduckgo.com/lite/";
const DDGS_MAX_RESULTS = 5;

interface SearchHttpError extends Error {
  status: number;
  responseText?: string;
}

function createSearchHttpError(
  status: number,
  statusText: string,
  responseText?: string
): SearchHttpError {
  const err = new Error(`DuckDuckGo Lite returned HTTP ${status} ${statusText}`) as SearchHttpError;
  err.status = status;
  err.responseText = responseText;
  return err;
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&#x2f;/gi, "/");
}

function extractUrl(rawHref: string): string | undefined {
  try {
    const href = decodeHtmlEntities(rawHref).trim();
    if (!href) return undefined;

    if (href.startsWith("http://") || href.startsWith("https://")) {
      if (href.includes("duckduckgo.com/l/?")) {
        const redirect = new URL(href);
        const uddg = redirect.searchParams.get("uddg");
        if (uddg) return decodeURIComponent(uddg);
      }
      return href;
    }

    if (href.startsWith("//duckduckgo.com/l/?")) {
      const redirect = new URL(`https:${href}`);
      const uddg = redirect.searchParams.get("uddg");
      if (uddg) return decodeURIComponent(uddg);
      return undefined;
    }

    if (href.startsWith("/l/?")) {
      const redirect = new URL(href, "https://duckduckgo.com");
      const uddg = redirect.searchParams.get("uddg");
      if (uddg) return decodeURIComponent(uddg);
    }

    return undefined;
  } catch {
    return undefined;
  }
}

function parseLiteResults(html: string, count: number): SearchResultItem[] {
  const anchorPattern = /<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  const seen = new Set<string>();
  const results: SearchResultItem[] = [];

  let match = anchorPattern.exec(html);
  while (match !== null) {
    const current = match;
    match = anchorPattern.exec(html);

    const url = extractUrl(current[1]);
    if (!url || seen.has(url)) continue;

    const title = normalizeWhitespace(
      decodeHtmlEntities(current[2].replace(/<[^>]+>/g, " ")).trim()
    );
    if (!title) continue;

    seen.add(url);
    results.push({
      title,
      url,
      source: "fallback",
    });

    if (results.length >= count) break;
  }

  return results;
}

async function search(
  params: ProviderSearchParams,
  config: ResolvedWebConfig
): Promise<SearchResultItem[]> {
  try {
    const url = new URL(DDGS_LITE_ENDPOINT);
    url.searchParams.set("q", params.query);

    const response = await pooledFetch(url, {
      method: "GET",
      signal: withTimeoutSignal(config.timeoutMs, params.signal),
      headers: {
        accept: "text/html,application/xhtml+xml",
      },
    });

    if (!response.ok) {
      const responseText = await readLimitedText(response, {
        maxBytes: config.maxResponseBytes,
        context: "ddgs search error",
      }).catch(() => ({ text: "" }));
      throw createSearchHttpError(
        response.status,
        response.statusText,
        responseText.text.slice(0, 300)
      );
    }

    const html = await readLimitedTextOrThrow(response, {
      maxBytes: config.maxResponseBytes,
      context: "ddgs search",
    });
    const results = parseLiteResults(html, Math.min(params.numResults, DDGS_MAX_RESULTS));
    return results;
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

export const ddgsProvider: SearchProviderAdapter = {
  name: "ddgs",
  isAvailable() {
    return true;
  },
  search,
};
