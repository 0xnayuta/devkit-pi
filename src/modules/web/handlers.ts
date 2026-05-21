/**
 * Phase 2: Content Handler Registry
 *
 * Pluggable handler architecture for fetch_content.
 * Each handler knows how to parse and format a specific content type.
 * On parse failure, handlers fall back to plain text and set parseWarning.
 */

import { extractHtml, extractPlainText, normalizeWhitespace } from "./extract.ts";
import type { DetectedContentType } from "./types.ts";

// ============================================================================
// Interfaces
// ============================================================================

/** Result returned by a content handler after processing raw text. */
export interface HandlerResult {
	content: string;
	title?: string;
	contentType?: string;
	parseWarning?: string;
}

/** A content handler processes raw text into a readable format. */
export interface ContentHandler {
	process(rawText: string, url: string): HandlerResult;
}

// ============================================================================
// CSV utilities (lightweight, zero-dependency)
// ============================================================================

const MAX_CSV_ROWS = 100;
const MAX_CSV_COLUMNS = 20;
const MAX_CELL_CHARS = 80;
const MAX_TABLE_WIDTH = 1200;

const MAX_JSON_ARRAY_ITEMS = 50;
const MAX_JSON_OUTPUT = 50_000;
const MAX_JSONLD_BODY = 2000;

const MAX_RSS_ITEMS = 20;
const MAX_DESCRIPTION_CHARS = 300;

/**
 * Parse a single CSV/TSV line, handling quoted fields.
 * Supports double-quote escaping ("") but not embedded newlines in quotes.
 */
function parseCsvLine(line: string, delimiter: string): string[] {
	const cells: string[] = [];
	let current = "";
	let inQuotes = false;

	for (let i = 0; i < line.length; i++) {
		const ch = line[i]!;
		if (inQuotes) {
			if (ch === '"') {
				if (i + 1 < line.length && line[i + 1] === '"') {
					current += '"';
					i++;
				} else {
					inQuotes = false;
				}
			} else {
				current += ch;
			}
		} else {
			if (ch === '"') {
				inQuotes = true;
			} else if (ch === delimiter) {
				cells.push(current);
				current = "";
			} else {
				current += ch;
			}
		}
	}
	cells.push(current);
	return cells;
}

/** Detect whether the content uses tabs or commas as delimiter. */
function detectCsvDelimiter(raw: string): string {
	const firstLines = raw.split(/\r?\n/).slice(0, 5).join("\n");
	const tabCount = (firstLines.match(/\t/g) || []).length;
	const commaCount = (firstLines.match(/,/g) || []).length;
	return tabCount > commaCount ? "\t" : ",";
}

/** Truncate a cell value for display. */
function truncateCell(value: string): string {
	if (value.length <= MAX_CELL_CHARS) return value;
	return `${value.slice(0, MAX_CELL_CHARS - 1)}\u2026`;
}

/** Format parsed rows as a Markdown table. */
function toMarkdownTable(rows: string[][]): string {
	if (rows.length === 0) return "";

	const numCols = Math.max(...rows.map((r) => r.length));
	if (numCols === 0) return "";

	// Calculate column widths (capped)
	const widths: number[] = Array.from({ length: numCols }, () => 3);
	for (const row of rows) {
		for (let i = 0; i < Math.min(row.length, numCols); i++) {
			widths[i] = Math.max(widths[i]!, Math.min(truncateCell(row[i]!).length, 40));
		}
	}

	const formatRow = (cells: string[]) => {
		const padded = Array.from({ length: numCols }, (_, i) => truncateCell(cells[i] ?? "").padEnd(widths[i]!));
		return `| ${padded.join(" | ")} |`;
	};

	const header = formatRow(rows[0]!);
	const separator = `| ${widths.map((w) => "-".repeat(w)).join(" | ")} |`;
	const body = rows.slice(1).map(formatRow);
	const table = [header, separator, ...body].join("\n");

	// Guard against excessively wide tables
	if (table.length > MAX_TABLE_WIDTH) {
		return `${table.slice(0, MAX_TABLE_WIDTH)}\n... (table truncated)`;
	}
	return table;
}

// ============================================================================
// JSON utilities
// ============================================================================

/** Try to extract structured fields from JSON-LD (schema.org) content. */
function tryExtractJsonLd(parsed: unknown): string | null {
	const obj = Array.isArray(parsed) ? parsed[0] : parsed;
	if (!obj || typeof obj !== "object") return null;

	const record = obj as Record<string, unknown>;
	const context = record["@context"];
	if (typeof context !== "string" || !context.includes("schema.org")) return null;

	const parts: string[] = [];
	if (record["@type"]) parts.push(`Type: ${record["@type"]}`);
	if (typeof record.headline === "string") parts.push(`Title: ${record.headline}`);
	if (typeof record.name === "string") parts.push(`Name: ${record.name}`);
	if (typeof record.description === "string") parts.push(`Description: ${record.description}`);
	if (typeof record.url === "string") parts.push(`URL: ${record.url}`);
	if (typeof record.datePublished === "string") parts.push(`Published: ${record.datePublished}`);

	if (record.author) {
		const author =
			typeof record.author === "object" && record.author !== null && "name" in record.author
				? String((record.author as Record<string, unknown>).name)
				: String(record.author);
		parts.push(`Author: ${author}`);
	}

	if (typeof record.articleBody === "string") {
		const body = record.articleBody;
		parts.push(
			`Content: ${body.length > MAX_JSONLD_BODY ? `${body.slice(0, MAX_JSONLD_BODY)}\n... (truncated)` : body}`
		);
	}

	return parts.length >= 2 ? parts.join("\n") : null;
}

/** Format a JSON array with item limiting for large arrays. */
function formatJsonArray(arr: unknown[]): string {
	if (arr.length <= MAX_JSON_ARRAY_ITEMS) {
		return JSON.stringify(arr, null, 2);
	}

	const truncated = arr.slice(0, MAX_JSON_ARRAY_ITEMS);
	const formatted = JSON.stringify(truncated, null, 2);
	return `${formatted}\n... (${arr.length - MAX_JSON_ARRAY_ITEMS} more items)`;
}

// ============================================================================
// XML / RSS / Atom utilities (lightweight, regex-based)
// ============================================================================

/** Decode common XML/HTML entities. */
function decodeXmlEntities(text: string): string {
	return text
		.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
		.replace(/&amp;/g, "&")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&#39;|&apos;/g, "'");
}

/** Extract text content from the first occurrence of a tag within a scope. */
function extractTag(scope: string, tag: string): string | null {
	const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
	const match = re.exec(scope);
	return match ? decodeXmlEntities(match[1]!.trim()) : null;
}

/** Extract the href from an Atom <link> element (self-closing or content). */
function extractAtomLink(entry: string): string | null {
	const selfClosing = /<link[^>]*href="([^"]*)"[^>]*\/?\s*>/i.exec(entry);
	if (selfClosing) return selfClosing[1]!;
	const content = /<link[^>]*>([^<]*)<\/link>/i.exec(entry);
	return content ? content[1]!.trim() : null;
}

/** Truncate text for display. */
function truncateText(text: string, maxChars: number): string {
	const clean = text.replace(/\s+/g, " ").trim();
	return clean.length > maxChars ? `${clean.slice(0, maxChars)}\u2026` : clean;
}

/** Try to extract RSS feed items from XML. */
function tryExtractRss(xml: string): { title: string | null; entries: string[] } | null {
	if (!/<rss[\s>]/i.test(xml) && !/<channel[\s>]/i.test(xml)) return null;

	const channelMatch = /<channel[\s>]([\s\S]*?)<\/channel>/i.exec(xml);
	const channel = channelMatch ? channelMatch[1]! : xml;
	const feedTitle = extractTag(channel, "title");

	const itemRe = /<item[\s>]([\s\S]*?)<\/item>/gi;
	const entries: string[] = [];
	for (const match of itemRe[Symbol.matchAll](channel)) {
		if (entries.length >= MAX_RSS_ITEMS) break;
		const item = match[1]!;
		const itemTitle = extractTag(item, "title") || "Untitled";
		const link = extractTag(item, "link") || "";
		const pubDate = extractTag(item, "pubDate") || "";
		const desc = extractTag(item, "description");

		let entry = `\u2022 ${itemTitle}`;
		if (pubDate) entry += ` (${pubDate})`;
		if (link) entry += `\n  ${link}`;
		if (desc) entry += `\n  ${truncateText(desc, MAX_DESCRIPTION_CHARS)}`;
		entries.push(entry);
	}

	return entries.length > 0 ? { title: feedTitle, entries } : null;
}

/** Try to extract Atom feed entries from XML. */
function tryExtractAtom(xml: string): { title: string | null; entries: string[] } | null {
	if (!/<feed[\s>]/i.test(xml)) return null;

	const feedTitle = extractTag(xml, "title");

	const entryRe = /<entry[\s>]([\s\S]*?)<\/entry>/gi;
	const entries: string[] = [];
	for (const match of entryRe[Symbol.matchAll](xml)) {
		if (entries.length >= MAX_RSS_ITEMS) break;
		const entry = match[1]!;
		const entryTitle = extractTag(entry, "title") || "Untitled";
		const link = extractAtomLink(entry) || "";
		const published = extractTag(entry, "published") || extractTag(entry, "updated") || "";
		const summary = extractTag(entry, "summary") || extractTag(entry, "content");

		let line = `\u2022 ${entryTitle}`;
		if (published) line += ` (${published})`;
		if (link) line += `\n  ${link}`;
		if (summary) line += `\n  ${truncateText(summary, MAX_DESCRIPTION_CHARS)}`;
		entries.push(line);
	}

	return entries.length > 0 ? { title: feedTitle, entries } : null;
}

// ============================================================================
// Handlers
// ============================================================================

/** text/html — delegates to extractHtml (existing HTML-to-text extraction). */
const htmlHandler: ContentHandler = {
	process(rawText, url) {
		const result = extractHtml(url, rawText, {
			maxContentChars: Number.MAX_SAFE_INTEGER,
		});
		return {
			content: result.content,
			title: result.title,
			contentType: result.contentType,
		};
	},
};

/**
 * PlainTextHandler — used for text/plain, text/markdown, text/css,
 * text/javascript, application/javascript, application/typescript,
 * YAML, and any other text/* fallback.
 * Delegates to extractPlainText (normalize whitespace).
 */
const plainTextHandler: ContentHandler = {
	process(rawText, url) {
		const result = extractPlainText(url, rawText, {
			maxContentChars: Number.MAX_SAFE_INTEGER,
		});
		return {
			content: result.content,
			contentType: result.contentType,
		};
	},
};

/**
 * JsonHandler — pretty-prints JSON with smart handling for arrays and JSON-LD.
 * On invalid JSON, falls back to plain text with parseWarning.
 */
const jsonHandler: ContentHandler = {
	process(rawText, _url) {
		try {
			const parsed: unknown = JSON.parse(rawText);

			// Try JSON-LD extraction first (schema.org structured data)
			const jsonLd = tryExtractJsonLd(parsed);
			if (jsonLd) {
				return { content: jsonLd, contentType: "application/json" };
			}

			// Format with array item limiting
			let formatted: string;
			if (Array.isArray(parsed)) {
				formatted = formatJsonArray(parsed);
			} else {
				formatted = JSON.stringify(parsed, null, 2);
			}

			// Truncate if output exceeds max length
			if (formatted.length > MAX_JSON_OUTPUT) {
				formatted = `${formatted.slice(0, MAX_JSON_OUTPUT)}\n... (JSON truncated)`;
			}

			return { content: formatted, contentType: "application/json" };
		} catch {
			return {
				content: normalizeWhitespace(rawText),
				contentType: "application/json",
				parseWarning: "Invalid JSON, returned as plain text",
			};
		}
	},
};

/**
 * CsvTsvHandler — parses CSV/TSV into a Markdown table.
 * On failure, falls back to plain text with parseWarning.
 */
const csvTsvHandler: ContentHandler = {
	process(rawText, _url) {
		try {
			const delimiter = detectCsvDelimiter(rawText);
			const lines = rawText.split(/\r?\n/);
			const nonEmpty = lines.filter((l) => l.trim() !== "");

			if (nonEmpty.length === 0) {
				return {
					content: "",
					contentType: delimiter === "\t" ? "text/tab-separated-values" : "text/csv",
				};
			}

			const rows = nonEmpty
				.slice(0, MAX_CSV_ROWS)
				.map((line) => parseCsvLine(line, delimiter).slice(0, MAX_CSV_COLUMNS));
			let content = toMarkdownTable(rows);

			if (nonEmpty.length > MAX_CSV_ROWS) {
				content += `\n\n... (${nonEmpty.length - MAX_CSV_ROWS} more rows truncated)`;
			}

			return {
				content,
				contentType: delimiter === "\t" ? "text/tab-separated-values" : "text/csv",
			};
		} catch {
			// Parse failure fallback
			return {
				content: normalizeWhitespace(rawText),
				contentType: "text/csv",
				parseWarning: "Failed to parse CSV/TSV, returned as plain text",
			};
		}
	},
};

/**
 * XmlHandler — extracts RSS/Atom feeds or returns formatted XML.
 * RSS/Atom: extracts feed title + entries (title, link, date, summary).
 * Regular XML: whitespace-normalized raw text.
 * On failure, falls back to raw text with parseWarning.
 */
const xmlHandler: ContentHandler = {
	process(rawText, _url) {
		try {
			// Try RSS extraction
			const rss = tryExtractRss(rawText);
			if (rss) {
				const parts: string[] = [];
				if (rss.title) parts.push(`Feed: ${rss.title}`);
				parts.push("");
				parts.push(...rss.entries);
				return {
					content: parts.join("\n"),
					contentType: "application/rss+xml",
				};
			}

			// Try Atom extraction
			const atom = tryExtractAtom(rawText);
			if (atom) {
				const parts: string[] = [];
				if (atom.title) parts.push(`Feed: ${atom.title}`);
				parts.push("");
				parts.push(...atom.entries);
				return {
					content: parts.join("\n"),
					contentType: "application/atom+xml",
				};
			}

			// Regular XML — normalize whitespace, preserve structure
			const normalized = rawText.replace(/\r\n/g, "\n").replace(/\t/g, "  ").trim();
			return {
				content: normalized,
				contentType: "application/xml",
			};
		} catch {
			return {
				content: normalizeWhitespace(rawText),
				contentType: "application/xml",
				parseWarning: "Failed to process XML, returned as plain text",
			};
		}
	},
};

/**
 * YamlHandler — treated as plain text (preserve original, normalize whitespace).
 * Phase 3 may add structured extraction.
 */
const yamlHandler: ContentHandler = {
	process(rawText, _url) {
		return {
			content: normalizeWhitespace(rawText),
			contentType: "text/yaml",
		};
	},
};

/**
 * UnsupportedHandler — safety net for content types that should never reach
 * the handler dispatch. Throws immediately.
 */
const unsupportedHandler: ContentHandler = {
	process(_rawText, _url) {
		throw new Error("Unsupported content type: no handler available");
	},
};

// ============================================================================
// Registry
// ============================================================================

/**
 * Select the appropriate content handler for a detected content type.
 */
export function getHandler(type: DetectedContentType): ContentHandler {
	switch (type) {
		case "html":
			return htmlHandler;
		case "text":
		case "markdown":
			return plainTextHandler;
		case "json":
			return jsonHandler;
		case "csv":
			return csvTsvHandler;
		case "xml":
			return xmlHandler;
		case "yaml":
			return yamlHandler;
		case "unsupported":
			return unsupportedHandler;
	}
}

/**
 * Run a handler with parse-failure fallback.
 * If the handler throws, falls back to plain text with a parseWarning.
 */
export function runHandler(
	handler: ContentHandler,
	rawText: string,
	url: string,
	detectedType: DetectedContentType
): HandlerResult {
	try {
		return handler.process(rawText, url);
	} catch {
		// Global safety net: handler threw unexpectedly — fall back to plain text
		const fallback = plainTextHandler.process(rawText, url);
		return {
			...fallback,
			parseWarning: `Failed to process as ${detectedType}, returned as plain text`,
		};
	}
}
