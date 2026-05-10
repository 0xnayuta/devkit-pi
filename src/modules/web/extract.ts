import type { ExtractedContent } from "./types.ts";

const MIN_USEFUL_HTML_CONTENT = 200;

export interface ExtractOptions {
  maxContentChars: number;
  contentType?: string;
}

export function truncateContent(
  content: string,
  maxContentChars: number
): Pick<ExtractedContent, "content" | "truncated"> {
  if (content.length <= maxContentChars) {
    return { content, truncated: false };
  }
  return { content: content.slice(0, maxContentChars), truncated: true };
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

export function normalizeWhitespace(value: string): string {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractTitle(html: string): string | undefined {
  const match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  if (!match) return undefined;
  const title = normalizeWhitespace(decodeHtmlEntities(match[1].replace(/<[^>]+>/g, "")));
  return title || undefined;
}

export function extractHeadingTitle(text: string): string | undefined {
  const match = text.match(/^#{1,2}\s+(.+)/m);
  if (!match) return undefined;
  return normalizeWhitespace(match[1].replace(/[*_`]/g, "")) || undefined;
}

function htmlToText(html: string): string {
  const withoutNoise = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");

  const withBreaks = withoutNoise
    .replace(/<\s*br\s*\/?\s*>/gi, "\n")
    .replace(/<\/(p|div|section|article|header|footer|main|li|h[1-6]|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, " ");

  return normalizeWhitespace(decodeHtmlEntities(withBreaks));
}

export function isLikelyJsRendered(html: string): boolean {
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (!bodyMatch) return false;

  const bodyHtml = bodyMatch[1];
  const textContent = normalizeWhitespace(
    bodyHtml
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
  );
  const scriptCount = (html.match(/<script/gi) || []).length;

  return textContent.length < MIN_USEFUL_HTML_CONTENT && scriptCount > 3;
}

export function shouldTryJinaFallback(html: string, extractedContent: string): boolean {
  if (extractedContent.length < MIN_USEFUL_HTML_CONTENT) return true;
  return isLikelyJsRendered(html);
}

export function extractPlainText(
  url: string,
  text: string,
  options: ExtractOptions
): ExtractedContent {
  return {
    url,
    contentType: options.contentType,
    ...truncateContent(normalizeWhitespace(text), options.maxContentChars),
  };
}

export function extractHtml(url: string, html: string, options: ExtractOptions): ExtractedContent {
  return {
    url,
    title: extractTitle(html),
    contentType: options.contentType,
    ...truncateContent(htmlToText(html), options.maxContentChars),
  };
}
