import type { ResolvedWebConfig } from "../../shared/types.ts";
import { isAbortLikeError, withTimeoutSignal } from "./abort.ts";
import { withThrottle } from "./concurrency.ts";
import type { WebErrorCode } from "./errors.ts";
import { WEB_ERROR_CODES } from "./errors.ts";
import { detectJinaTrigger, extractHeadingTitle, extractPlainText, truncateContent } from "./extract.ts";
import { getHandler, runHandler } from "./handlers.ts";
import { fetchWithPinnedDns } from "./network.ts";
import { recordFetchActivity, webDebugLog } from "./observability.ts";
import { getWebSecurityLimits, isPrivateNetworkHostname, validatePublicHttpUrl } from "./security.ts";
import { storeResult } from "./storage.ts";
import type { DetectedContentType, ExtractedContent, FetchContentInput, WebToolError } from "./types.ts";

export interface FetchContentSuccess {
	responseId: string;
	results: ExtractedContent[];
}

export type FetchContentResult = FetchContentSuccess | WebToolError;

// ============================================================================
// Phase 1: Content-Type detection types
// ============================================================================

interface ContentDetectionResult {
	type: DetectedContentType;
	source: "header" | "extension" | "fallback" | "magic-bytes";
	unsupportedReason?: string;
}

const MAX_REDIRECTS = 5;
const JINA_READER_BASE = "https://r.jina.ai/";

const CONVERT_CONTENT_HINT_EXTENSIONS = new Set([
	".pdf",
	".doc",
	".docx",
	".xls",
	".xlsx",
	".ppt",
	".pptx",
	".odt",
	".ods",
	".odp",
]);

const CONVERT_CONTENT_HINT_TYPES = new Set([
	"application/pdf",
	"application/msword",
	"application/vnd.ms-excel",
	"application/vnd.ms-powerpoint",
	"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
	"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
	"application/vnd.openxmlformats-officedocument.presentationml.presentation",
	"application/vnd.oasis.opendocument.text",
	"application/vnd.oasis.opendocument.spreadsheet",
	"application/vnd.oasis.opendocument.presentation",
]);

function normalizeUrls(params: FetchContentInput): string[] {
	const urls = [params.url, ...(params.urls ?? [])]
		.filter((url): url is string => typeof url === "string")
		.map((url) => url.trim())
		.filter((url) => url.length > 0);
	return [...new Set(urls)];
}

function error(code: WebErrorCode, message: string): WebToolError {
	return { error: { code, message } };
}

// ============================================================================
// Phase 1: Content-Type detection with URL extension fallback
// ============================================================================

/**
 * Extract the file extension from a URL pathname.
 * Returns lowercase extension including the dot, or empty string if none.
 */
function getExtensionFromUrl(url: string): string {
	try {
		const pathname = new URL(url).pathname;
		const lastSlash = pathname.lastIndexOf("/");
		const filename = lastSlash >= 0 ? pathname.slice(lastSlash + 1) : pathname;
		const dotIndex = filename.lastIndexOf(".");
		if (dotIndex < 0) return "";
		return filename.slice(dotIndex).toLowerCase();
	} catch {
		return "";
	}
}

/**
 * Map URL extension to a detected content type.
 * Returns null if the extension is not recognized.
 */
function detectTypeFromExtension(ext: string): DetectedContentType | null {
	switch (ext) {
		// HTML
		case ".html":
		case ".htm":
			return "html";
		// Markdown
		case ".md":
		case ".markdown":
			return "markdown";
		// JSON
		case ".json":
			return "json";
		// CSV / TSV
		case ".csv":
		case ".tsv":
			return "csv";
		// XML / RSS / Atom
		case ".xml":
		case ".rss":
		case ".atom":
			return "xml";
		// YAML
		case ".yml":
		case ".yaml":
			return "yaml";
		// Source text (JS, TS, CSS, etc.)
		case ".js":
		case ".mjs":
		case ".cjs":
		case ".ts":
		case ".mts":
		case ".cts":
		case ".jsx":
		case ".tsx":
		case ".css":
		case ".scss":
		case ".less":
		case ".vue":
		case ".svelte":
		case ".py":
		case ".rb":
		case ".rs":
		case ".go":
		case ".java":
		case ".c":
		case ".cpp":
		case ".h":
		case ".hpp":
		case ".sh":
		case ".bash":
		case ".zsh":
		case ".fish":
		case ".sql":
		case ".r":
		case ".lua":
		case ".php":
		case ".swift":
		case ".kt":
		case ".scala":
		case ".clj":
		case ".ex":
		case ".exs":
		case ".toml":
		case ".ini":
		case ".cfg":
		case ".conf":
		case ".env":
		case ".txt":
		case ".log":
		case ".text":
			return "text";
		// Unsupported (binary / document formats)
		case ".pdf":
		case ".doc":
		case ".docx":
		case ".xls":
		case ".xlsx":
		case ".ppt":
		case ".pptx":
		case ".odt":
		case ".ods":
		case ".odp":
		case ".zip":
		case ".tar":
		case ".gz":
		case ".bz2":
		case ".xz":
		case ".rar":
		case ".7z":
		case ".exe":
		case ".dll":
		case ".so":
		case ".dylib":
		case ".bin":
		case ".dat":
		case ".iso":
		case ".img":
		case ".dmg":
		case ".msi":
		case ".deb":
		case ".rpm":
		case ".apk":
		case ".war":
		case ".jar":
		case ".class":
			return "unsupported";
		default:
			return null;
	}
}

/**
 * Common binary magic bytes signatures (first 4-8 bytes).
 * Used as a lightweight check when Content-Type and extension are inconclusive.
 */
const BINARY_SIGNATURES: Array<{ bytes: number[]; name: string; offset?: number }> = [
	{ bytes: [0x25, 0x50, 0x44, 0x46], name: "PDF" }, // %PDF
	{ bytes: [0x50, 0x4b, 0x03, 0x04], name: "ZIP/Office" }, // PK (ZIP, DOCX, XLSX, PPTX, JAR, APK)
	{ bytes: [0x50, 0x4b, 0x05, 0x06], name: "ZIP (empty)" }, // PK empty archive
	{ bytes: [0x50, 0x4b, 0x07, 0x08], name: "ZIP (spanned)" }, // PK spanned
	{ bytes: [0x1f, 0x8b], name: "GZIP" }, // GZIP
	{ bytes: [0x42, 0x5a, 0x68], name: "BZIP2" }, // BZh
	{ bytes: [0xfd, 0x37, 0x7a, 0x58, 0x5a, 0x00], name: "XZ" }, // XZ
	{ bytes: [0x7f, 0x45, 0x4c, 0x46], name: "ELF" }, // ELF binary
	{ bytes: [0x4d, 0x5a], name: "PE/EXE" }, // MZ (Windows EXE/DLL)
	{ bytes: [0xca, 0xfe, 0xba, 0xbe], name: "Mach-O/Fat" }, // Mach-O fat binary / Java class
	{ bytes: [0xfe, 0xed, 0xfa, 0xce], name: "Mach-O (32-bit)" }, // Mach-O 32-bit
	{ bytes: [0xfe, 0xed, 0xfa, 0xcf], name: "Mach-O (64-bit)" }, // Mach-O 64-bit
	{ bytes: [0xff, 0xd8, 0xff], name: "JPEG" }, // JPEG
	{ bytes: [0x89, 0x50, 0x4e, 0x47], name: "PNG" }, // PNG
	{ bytes: [0x47, 0x49, 0x46, 0x38], name: "GIF" }, // GIF
	{ bytes: [0x42, 0x4d], name: "BMP" }, // BMP
	{ bytes: [0x00, 0x00, 0x01, 0x00], name: "ICO" }, // ICO
	{ bytes: [0x52, 0x49, 0x46, 0x46], name: "RIFF" }, // RIFF (WebP, AVI, WAV)
	{ bytes: [0x4f, 0x67, 0x67, 0x53], name: "OGG" }, // OGG
	{ bytes: [0x66, 0x4c, 0x61, 0x43], name: "FLAC" }, // FLAC
	{ bytes: [0x49, 0x44, 0x33], name: "MP3 (ID3)" }, // MP3 with ID3
	{ bytes: [0xff, 0xfb], name: "MP3" }, // MP3
	{ bytes: [0x1a, 0x45, 0xdf, 0xa3], name: "MKV/WebM" }, // Matroska/WebM
	{ bytes: [0x66, 0x74, 0x79, 0x70], name: "MP4/MOV", offset: 4 }, // ftyp (MP4/MOV)
];

/**
 * Check if the body starts with known binary magic bytes.
 * Only checks the first 8 bytes for performance.
 */
function isBinaryContent(body: Uint8Array): boolean {
	if (body.length < 2) return false;
	for (const sig of BINARY_SIGNATURES) {
		const offset = sig.offset ?? 0;
		if (body.length < offset + sig.bytes.length) continue;
		let match = true;
		for (let i = 0; i < sig.bytes.length; i++) {
			if (body[offset + i] !== sig.bytes[i]) {
				match = false;
				break;
			}
		}
		if (match) return true;
	}
	return false;
}

/**
 * Map a header Content-Type to a detected type.
 * Returns null if the Content-Type is not recognized or is generic.
 */
function detectTypeFromHeader(rawContentType: string): DetectedContentType | null {
	const normalized = rawContentType.split(";")[0]?.trim().toLowerCase() ?? "";
	switch (normalized) {
		case "text/html":
			return "html";
		case "text/plain":
			return "text";
		case "text/markdown":
		case "text/x-markdown":
			return "markdown";
		case "text/css":
		case "text/javascript":
		case "application/javascript":
		case "application/typescript":
			return "text";
		case "application/json":
			return "json";
		case "text/csv":
		case "text/tab-separated-values":
			return "csv";
		case "application/xml":
		case "text/xml":
		case "application/rss+xml":
		case "application/atom+xml":
			return "xml";
		case "text/yaml":
		case "text/x-yaml":
		case "application/yaml":
		case "application/x-yaml":
			return "yaml";
		default:
			// application/*+json (e.g., application/vnd.api+json)
			if (normalized.startsWith("application/") && normalized.endsWith("+json")) {
				return "json";
			}
			// Clearly binary media types — reject early via header
			if (normalized.startsWith("image/") || normalized.startsWith("audio/") || normalized.startsWith("video/")) {
				return "unsupported";
			}
			// Known binary application types
			if (
				normalized === "application/pdf" ||
				normalized === "application/zip" ||
				normalized === "application/x-7z-compressed" ||
				normalized === "application/x-tar" ||
				normalized === "application/gzip" ||
				normalized === "application/java-archive" ||
				normalized === "application/x-executable" ||
				normalized === "application/x-msdownload" ||
				normalized === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
				normalized === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
				normalized === "application/vnd.openxmlformats-officedocument.presentationml.presentation" ||
				normalized === "application/msword" ||
				normalized === "application/vnd.ms-excel" ||
				normalized === "application/vnd.ms-powerpoint"
			) {
				return "unsupported";
			}
			// text/* fallback — unknown text subtypes are treated as plain text
			if (normalized.startsWith("text/")) {
				return "text";
			}
			// application/octet-stream and other generic types — return null to fall through
			// to extension check, magic bytes, and text fallback
			return null;
	}
}

function buildConvertContentHint(url: string, rawContentType: string | null): string | null {
	const ext = getExtensionFromUrl(url);
	const normalizedContentType = rawContentType?.split(";")[0]?.trim().toLowerCase() ?? "";

	if (!CONVERT_CONTENT_HINT_EXTENSIONS.has(ext) && !CONVERT_CONTENT_HINT_TYPES.has(normalizedContentType)) {
		return null;
	}

	return 'This looks like a document format; try convert_content with the same URL, for example convert_content({ url: "..." }). convert_content safely downloads the URL first and requires the optional MarkItDown CLI provider.';
}

function isWeakHeaderContentType(rawContentType: string): boolean {
	const normalized = rawContentType.split(";")[0]?.trim().toLowerCase() ?? "";
	return (
		normalized === "" ||
		normalized === "text/plain" ||
		normalized === "application/octet-stream" ||
		(normalized.startsWith("text/") &&
			normalized !== "text/html" &&
			normalized !== "text/markdown" &&
			normalized !== "text/x-markdown" &&
			normalized !== "text/csv" &&
			normalized !== "text/tab-separated-values" &&
			normalized !== "text/xml" &&
			normalized !== "text/yaml" &&
			normalized !== "text/x-yaml")
	);
}

/**
 * Unified content type detection with priority:
 *  1. HTTP Content-Type header
 *  2. URL pathname extension
 *  3. Magic bytes (binary detection)
 *  4. text/* fallback (for generic text Content-Types)
 *  5. Fallback to plain text for application/octet-stream and other generic types
 */
function detectSupportedContent(
	headerContentType: string | null,
	url: string,
	body: Uint8Array
): ContentDetectionResult {
	const rawHeader = headerContentType ?? "";

	const ext = getExtensionFromUrl(url);
	const extType = ext ? detectTypeFromExtension(ext) : null;

	// 1. Try Content-Type header first. Weak/generic text headers deliberately allow
	//    URL suffixes to override them (for servers returning text/plain for .json/.csv/etc.).
	const headerType = detectTypeFromHeader(rawHeader);
	if (headerType === "unsupported") {
		return {
			type: "unsupported",
			source: "header",
			unsupportedReason: `Unsupported content type: ${rawHeader}`,
		};
	}
	if (headerType !== null && !isWeakHeaderContentType(rawHeader)) {
		return { type: headerType, source: "header" };
	}

	// 2. Try URL extension
	if (ext) {
		if (extType === "unsupported") {
			return {
				type: "unsupported",
				source: "extension",
				unsupportedReason: `Unsupported file type: ${ext} files are not supported for text extraction`,
			};
		}
		if (extType !== null) {
			return { type: extType, source: "extension" };
		}
	}

	if (headerType !== null) {
		return { type: headerType, source: "header" };
	}

	// 3. Binary magic bytes check — reject known binary formats early
	if (isBinaryContent(body)) {
		return {
			type: "unsupported",
			source: "magic-bytes",
			unsupportedReason: "Binary content detected (magic bytes). Only text-based content is supported",
		};
	}

	// 4. text/* fallback — if the header was a generic text/* type not caught above
	const normalized = rawHeader.split(";")[0]?.trim().toLowerCase() ?? "";
	if (normalized.startsWith("text/")) {
		return { type: "text", source: "fallback" };
	}

	// 5. For application/octet-stream and other generic/unknown types,
	//    fallback to plain text rather than rejecting.
	//    This handles cases where servers return wrong Content-Type.
	return { type: "text", source: "fallback" };
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
	signal: AbortSignal | undefined,
	allowPrivateNetwork: boolean
): Promise<{ response: Response; body: Uint8Array; finalUrl: string; bodyTruncated: boolean }> {
	let currentUrl = initialUrl;

	for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
		const response = await fetchWithPinnedDns(currentUrl.href, {
			method: "GET",
			redirect: "manual",
			signal: withTimeoutSignal(timeoutMs, signal),
			timeoutMs,
			allowPrivateNetwork,
			headers: {
				accept: "text/html,text/plain;q=0.9,*/*;q=0.1",
				"user-agent": "devkit-pi-web-tools/0.1",
			},
		});

		if ([301, 302, 303, 307, 308].includes(response.status)) {
			const location = response.headers.get("location");
			await response.body?.cancel();
			if (!location) throw new Error(`Redirect without Location header: ${currentUrl.href}`);
			currentUrl = await validatePublicHttpUrl(new URL(location, currentUrl).href, {
				allowPrivateNetwork,
			});
			continue;
		}

		const { body, truncated } = await readLimitedBody(response, maxResponseBytes);
		return { response, body, finalUrl: currentUrl.href, bodyTruncated: truncated };
	}

	throw new Error(`Too many redirects for ${initialUrl.href}`);
}

function truncateExtractedContent(result: ExtractedContent, maxContentChars: number): ExtractedContent {
	const truncated = truncateContent(result.content, maxContentChars);
	return {
		...result,
		...truncated,
		truncated: result.truncated || truncated.truncated,
	};
}

function isPrivateNetworkUrl(url: string): boolean {
	try {
		return isPrivateNetworkHostname(new URL(url).hostname);
	} catch {
		return true;
	}
}

async function fetchFromJinaReader(
	url: string,
	timeoutMs: number,
	maxResponseBytes: number,
	signal?: AbortSignal
): Promise<{ title?: string; content: string; truncated: boolean } | null> {
	const response = await fetchWithPinnedDns(`${JINA_READER_BASE}${url}`, {
		method: "GET",
		signal: withTimeoutSignal(timeoutMs, signal),
		timeoutMs,
		allowPrivateNetwork: false,
		headers: {
			accept: "text/plain,text/markdown;q=0.9,*/*;q=0.1",
			"x-no-cache": "true",
		},
	});

	if (!response.ok) {
		await response.body?.cancel();
		return null;
	}

	const { body, truncated } = await readLimitedBody(response, maxResponseBytes);
	const raw = new TextDecoder("utf-8", { fatal: false }).decode(body);
	const marker = "Markdown Content:";
	const content = raw.includes(marker) ? raw.split(marker).slice(1).join(marker).trim() : raw.trim();
	if (!content) return null;

	return {
		title: extractHeadingTitle(content),
		content,
		truncated,
	};
}

export async function fetchUrlContent(
	url: string,
	config: ResolvedWebConfig,
	signal?: AbortSignal,
	preferReader?: boolean
): Promise<ExtractedContent> {
	const limits = getWebSecurityLimits(config);
	const parsedUrl = await validatePublicHttpUrl(url, {
		allowPrivateNetwork: limits.allowPrivateNetwork,
	});
	const { response, body, finalUrl, bodyTruncated } = await fetchWithRedirects(
		parsedUrl,
		limits.timeoutMs,
		limits.maxResponseBytes,
		signal,
		limits.allowPrivateNetwork
	);

	if (!response.ok) {
		throw new Error(`HTTP ${response.status} ${response.statusText} for ${finalUrl}`);
	}

	const contentTypeHeader = response.headers.get("content-type");
	const detected = detectSupportedContent(contentTypeHeader, finalUrl, body);

	if (detected.type === "unsupported") {
		const baseMessage = detected.unsupportedReason ?? `Unsupported content type for ${finalUrl}`;
		const hint = buildConvertContentHint(finalUrl, contentTypeHeader);
		throw new Error(hint ? `${baseMessage}. ${hint}` : baseMessage);
	}

	// Phase 2: handler dispatch — select handler by detected type, run with fallback
	const handler = getHandler(detected.type);
	const text = new TextDecoder("utf-8", { fatal: false }).decode(body);
	const handlerResult = runHandler(handler, text, finalUrl, detected.type);

	// Phase 5: Jina fallback with configurable triggers and user-request support
	if (detected.type === "html" && config.enableJinaFallback) {
		let shouldUseJina = false;
		if (preferReader) {
			// User explicitly requested Jina — honored when Jina is enabled and URL is public.
			shouldUseJina = true;
		} else {
			// Check automatic triggers against configured trigger list
			const trigger = detectJinaTrigger(text, handlerResult.content);
			if (trigger && config.jinaTriggers.includes(trigger)) {
				shouldUseJina = true;
			}
		}

		if (shouldUseJina && !isPrivateNetworkUrl(finalUrl)) {
			const jina = await fetchFromJinaReader(finalUrl, config.jinaTimeoutMs, limits.maxResponseBytes, signal);
			if (jina) {
				const jinaExtracted = extractPlainText(finalUrl, jina.content, {
					maxContentChars: Number.MAX_SAFE_INTEGER,
					contentType: "text/markdown",
				});
				return {
					...jinaExtracted,
					title: jina.title ?? handlerResult.title,
					truncated: bodyTruncated || jina.truncated,
					contentType: "text/markdown; source=jina",
				};
			}
		}
	}

	return {
		url: finalUrl,
		title: handlerResult.title,
		content: handlerResult.content,
		truncated: bodyTruncated,
		contentType: handlerResult.contentType ?? contentTypeHeader ?? undefined,
		parseWarning: handlerResult.parseWarning,
	};
}

export async function fetchContent(
	params: FetchContentInput,
	config: ResolvedWebConfig,
	signal?: AbortSignal
): Promise<FetchContentResult> {
	const urls = normalizeUrls(params);
	if (urls.length === 0) {
		return error(WEB_ERROR_CODES.INVALID_INPUT, "fetch_content requires url or urls");
	}

	try {
		const storedResults: ExtractedContent[] = [];
		for (const url of urls) {
			storedResults.push(await withThrottle(() => fetchUrlContent(url, config, signal, params.preferReader)));
		}

		const responseId = storeResult({ type: "fetch", urls: storedResults });
		const limits = getWebSecurityLimits(config);
		const results = storedResults.map((result) => truncateExtractedContent(result, limits.maxContentChars));
		recordFetchActivity("success");
		webDebugLog("fetch_content success", { urls: urls.length, responseId });
		return { responseId, results };
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		if (isAbortLikeError(err)) {
			recordFetchActivity("error", WEB_ERROR_CODES.CONTENT_FETCH_TIMEOUT);
			return {
				error: {
					code: WEB_ERROR_CODES.CONTENT_FETCH_TIMEOUT,
					message: `fetch_content timed out or was aborted. Try fewer URLs or increase web.timeoutMs. (${message})`,
				},
			};
		}

		if (message.startsWith("Invalid URL:") || message.startsWith("Unsupported URL protocol:")) {
			recordFetchActivity("error", WEB_ERROR_CODES.CONTENT_FETCH_INVALID_URL);
			return {
				error: {
					code: WEB_ERROR_CODES.CONTENT_FETCH_INVALID_URL,
					message,
				},
			};
		}

		// Queue saturation is currently treated as a generic fetch failure. It is
		// caused by local throttling rather than the URL/content itself, and there
		// is no dedicated canonical QUEUE_* code.
		const code = WEB_ERROR_CODES.CONTENT_FETCH_FAILED;
		recordFetchActivity("error", code);
		webDebugLog("fetch_content failed", { message, urls });
		return {
			error: {
				code,
				message,
			},
		};
	}
}
