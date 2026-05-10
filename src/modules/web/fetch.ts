import type { ResolvedWebConfig } from "../../shared/types.ts";
import { isAbortLikeError, withTimeoutSignal } from "./abort.ts";
import { withThrottle } from "./concurrency.ts";
import {
  extractHeadingTitle,
  extractHtml,
  extractPlainText,
  shouldTryJinaFallback,
  truncateContent,
} from "./extract.ts";
import { pooledFetch } from "./http-pool.ts";
import { recordFetchActivity, webDebugLog } from "./observability.ts";
import { getWebSecurityLimits, validatePublicHttpUrl } from "./security.ts";
import { storeResult } from "./storage.ts";
import type { ExtractedContent, FetchContentInput, WebToolError } from "./types.ts";

export interface FetchContentSuccess {
  responseId: string;
  results: ExtractedContent[];
}

export type FetchContentResult = FetchContentSuccess | WebToolError;

const MAX_REDIRECTS = 5;
const JINA_READER_BASE = "https://r.jina.ai/";

function normalizeUrls(params: FetchContentInput): string[] {
  const urls = [params.url, ...(params.urls ?? [])]
    .filter((url): url is string => typeof url === "string")
    .map((url) => url.trim())
    .filter((url) => url.length > 0);
  return [...new Set(urls)];
}

function error(code: string, message: string): WebToolError {
  return { error: { code, message } };
}

function isSupportedContentType(contentType: string): "html" | "text" | null {
  const normalized = contentType.split(";")[0]?.trim().toLowerCase() ?? "";
  if (normalized === "text/html") return "html";
  if (normalized === "text/plain") return "text";
  return null;
}

async function readLimitedBody(
  response: Response,
  maxBytes: number
): Promise<{ body: Uint8Array; truncated: boolean }> {
  if (!response.body) return { body: new Uint8Array(), truncated: false };

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  let truncated = false;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      const remaining = maxBytes - totalBytes;
      if (remaining <= 0) {
        truncated = true;
        await reader.cancel();
        break;
      }

      if (value.byteLength > remaining) {
        chunks.push(value.slice(0, remaining));
        totalBytes += remaining;
        truncated = true;
        await reader.cancel();
        break;
      }

      chunks.push(value);
      totalBytes += value.byteLength;
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { body, truncated };
}

async function fetchWithRedirects(
  initialUrl: URL,
  timeoutMs: number,
  maxResponseBytes: number,
  signal?: AbortSignal
): Promise<{ response: Response; body: Uint8Array; finalUrl: string; bodyTruncated: boolean }> {
  let currentUrl = initialUrl;

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    const response = await pooledFetch(currentUrl.href, {
      method: "GET",
      redirect: "manual",
      signal: withTimeoutSignal(timeoutMs, signal),
      headers: {
        accept: "text/html,text/plain;q=0.9,*/*;q=0.1",
        "user-agent": "devkit-pi-web-tools/0.1",
      },
    });

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location) throw new Error(`Redirect without Location header: ${currentUrl.href}`);
      currentUrl = await validatePublicHttpUrl(new URL(location, currentUrl).href);
      continue;
    }

    const { body, truncated } = await readLimitedBody(response, maxResponseBytes);
    return { response, body, finalUrl: currentUrl.href, bodyTruncated: truncated };
  }

  throw new Error(`Too many redirects for ${initialUrl.href}`);
}

function truncateExtractedContent(
  result: ExtractedContent,
  maxContentChars: number
): ExtractedContent {
  const truncated = truncateContent(result.content, maxContentChars);
  return {
    ...result,
    ...truncated,
    truncated: result.truncated || truncated.truncated,
  };
}

async function fetchFromJinaReader(
  url: string,
  timeoutMs: number,
  signal?: AbortSignal
): Promise<{ title?: string; content: string } | null> {
  const response = await pooledFetch(`${JINA_READER_BASE}${url}`, {
    method: "GET",
    signal: withTimeoutSignal(timeoutMs, signal),
    headers: {
      accept: "text/plain,text/markdown;q=0.9,*/*;q=0.1",
      "x-no-cache": "true",
    },
  });

  if (!response.ok) return null;

  const raw = await response.text();
  const marker = "Markdown Content:";
  const content = raw.includes(marker)
    ? raw.split(marker).slice(1).join(marker).trim()
    : raw.trim();
  if (!content) return null;

  return {
    title: extractHeadingTitle(content),
    content,
  };
}

export async function fetchUrlContent(
  url: string,
  config: ResolvedWebConfig,
  signal?: AbortSignal
): Promise<ExtractedContent> {
  const limits = getWebSecurityLimits(config);
  const parsedUrl = await validatePublicHttpUrl(url);
  const { response, body, finalUrl, bodyTruncated } = await fetchWithRedirects(
    parsedUrl,
    limits.timeoutMs,
    limits.maxResponseBytes,
    signal
  );

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText} for ${finalUrl}`);
  }

  const contentType = response.headers.get("content-type") ?? "text/plain";
  const supportedType = isSupportedContentType(contentType);
  if (!supportedType) {
    throw new Error(`Unsupported content type for ${finalUrl}: ${contentType}`);
  }

  const text = new TextDecoder("utf-8", { fatal: false }).decode(body);
  const options = { maxContentChars: Number.MAX_SAFE_INTEGER, contentType };
  if (supportedType === "html") {
    const extracted = extractHtml(finalUrl, text, options);
    let finalResult = bodyTruncated ? { ...extracted, truncated: true } : extracted;

    if (config.enableJinaFallback && shouldTryJinaFallback(text, extracted.content)) {
      const jina = await fetchFromJinaReader(finalUrl, config.jinaTimeoutMs, signal);
      if (jina) {
        finalResult = {
          ...extractPlainText(finalUrl, jina.content, {
            maxContentChars: Number.MAX_SAFE_INTEGER,
            contentType: "text/markdown",
          }),
          title: jina.title ?? extracted.title,
          truncated: bodyTruncated,
          contentType: "text/markdown; source=jina",
        };
      }
    }

    return finalResult;
  }

  const extracted = extractPlainText(finalUrl, text, options);
  return bodyTruncated ? { ...extracted, truncated: true } : extracted;
}

export async function fetchContent(
  params: FetchContentInput,
  config: ResolvedWebConfig,
  signal?: AbortSignal
): Promise<FetchContentResult> {
  const urls = normalizeUrls(params);
  if (urls.length === 0) {
    return error("INVALID_INPUT", "fetch_content requires url or urls");
  }

  try {
    const storedResults: ExtractedContent[] = [];
    for (const url of urls) {
      storedResults.push(await withThrottle(() => fetchUrlContent(url, config, signal)));
    }

    const responseId = storeResult({ type: "fetch", urls: storedResults });
    const limits = getWebSecurityLimits(config);
    const results = storedResults.map((result) =>
      truncateExtractedContent(result, limits.maxContentChars)
    );
    recordFetchActivity("success");
    webDebugLog("fetch_content success", { urls: urls.length, responseId });
    return { responseId, results };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (isAbortLikeError(err)) {
      recordFetchActivity("error", "CONTENT_FETCH_TIMEOUT");
      return {
        error: {
          code: "CONTENT_FETCH_TIMEOUT",
          message: `fetch_content timed out or was aborted. Try fewer URLs or increase web.timeoutMs. (${message})`,
        },
      };
    }
    recordFetchActivity("error", "FETCH_CONTENT_FAILED");
    webDebugLog("fetch_content failed", { message, urls });
    return {
      error: {
        code: "FETCH_CONTENT_FAILED",
        message,
      },
    };
  }
}
