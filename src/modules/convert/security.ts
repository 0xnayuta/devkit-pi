import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { isAbortLikeError, withTimeoutSignal } from "../../shared/abort.ts";
import { HttpSecurityError, validatePublicHttpUrl } from "../../shared/http-security.ts";
import { fetchWithPinnedDns } from "../../shared/pinned-fetch.ts";
import { CONVERT_ERROR_CODES, ConvertProviderError } from "./errors.ts";

const MAX_REDIRECTS = 5;
const USER_AGENT = "devkit-pi-convert/1.0";

export interface LocalPathValidationResult {
	path: string;
	stat: Awaited<ReturnType<typeof fs.stat>>;
}

export async function validateLocalFilePath(
	inputPath: string,
	workspaceRoot = process.cwd()
): Promise<LocalPathValidationResult> {
	const resolvedWorkspace = await fs.realpath(workspaceRoot);
	const resolvedInput = path.resolve(resolvedWorkspace, inputPath);
	const lexicalRelative = path.relative(resolvedWorkspace, resolvedInput);
	if (lexicalRelative.startsWith("..") || path.isAbsolute(lexicalRelative)) {
		throw new ConvertProviderError(
			CONVERT_ERROR_CODES.INVALID_INPUT,
			`Local path outside workspace is not allowed: ${inputPath}`
		);
	}

	let stat: Awaited<ReturnType<typeof fs.stat>>;
	try {
		stat = await fs.stat(resolvedInput);
	} catch {
		throw new ConvertProviderError(CONVERT_ERROR_CODES.FILE_NOT_FOUND, `File not found: ${resolvedInput}`);
	}

	if (!stat.isFile()) {
		throw new ConvertProviderError(CONVERT_ERROR_CODES.FILE_NOT_FOUND, `Path is not a file: ${resolvedInput}`);
	}

	const realInput = await fs.realpath(resolvedInput);
	const relative = path.relative(resolvedWorkspace, realInput);
	if (relative.startsWith("..") || path.isAbsolute(relative)) {
		throw new ConvertProviderError(
			CONVERT_ERROR_CODES.INVALID_INPUT,
			`Local path outside workspace is not allowed: ${inputPath}`
		);
	}

	return { path: realInput, stat };
}

export interface DownloadUrlOptions {
	timeoutMs: number;
	maxResponseBytes: number;
	allowPrivateNetwork: boolean;
	signal?: AbortSignal;
}

export interface DownloadedFile {
	path: string;
	sourceUrl: string;
	finalUrl: string;
	contentType?: string;
	fileName?: string;
	fileSize: number;
}

function classifyUrlValidationError(error: unknown): ConvertProviderError {
	const message = error instanceof Error ? error.message : String(error);
	if (error instanceof HttpSecurityError) {
		switch (error.code) {
			case "UNSUPPORTED_PROTOCOL":
				return new ConvertProviderError(CONVERT_ERROR_CODES.UNSUPPORTED_PROTOCOL, message);
			case "PRIVATE_NETWORK_BLOCKED":
				return new ConvertProviderError(CONVERT_ERROR_CODES.PRIVATE_NETWORK_BLOCKED, message);
			default:
				return new ConvertProviderError(CONVERT_ERROR_CODES.NETWORK_ERROR, message);
		}
	}
	return new ConvertProviderError(CONVERT_ERROR_CODES.NETWORK_ERROR, message);
}

function fileNameFromUrl(url: URL): string | undefined {
	const base = path.basename(decodeURIComponent(url.pathname));
	if (!base || base === "/" || base === ".") return undefined;
	return base.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function extensionFromContentType(contentType: string | null): string {
	const normalized = (contentType ?? "").split(";", 1)[0].trim().toLowerCase();
	switch (normalized) {
		case "application/pdf":
			return ".pdf";
		case "text/html":
			return ".html";
		case "text/markdown":
			return ".md";
		case "text/plain":
			return ".txt";
		case "application/json":
		case "application/ld+json":
			return ".json";
		case "text/csv":
			return ".csv";
		default:
			return "";
	}
}

function extensionFromUrlOrType(url: URL, contentType: string | null): string {
	const urlExt = path.extname(url.pathname);
	if (urlExt && /^[a-zA-Z0-9.]+$/.test(urlExt)) return urlExt.slice(0, 16);
	return extensionFromContentType(contentType);
}

function redirectTarget(currentUrl: URL, location: string | null): string {
	if (!location) {
		throw new ConvertProviderError(
			CONVERT_ERROR_CODES.NETWORK_ERROR,
			`Redirect response from ${currentUrl.toString()} did not include a Location header.`
		);
	}
	return new URL(location, currentUrl).toString();
}

async function validatedUrl(input: string, allowPrivateNetwork: boolean): Promise<URL> {
	try {
		return await validatePublicHttpUrl(input, { allowPrivateNetwork });
	} catch (error) {
		throw classifyUrlValidationError(error);
	}
}

async function readResponseBody(response: Response, maxResponseBytes: number): Promise<Uint8Array> {
	if (!response.body) return new Uint8Array();

	const reader = response.body.getReader();
	const chunks: Uint8Array[] = [];
	let total = 0;

	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		total += value.byteLength;
		if (total > maxResponseBytes) {
			await reader.cancel();
			throw new ConvertProviderError(
				CONVERT_ERROR_CODES.FILE_TOO_LARGE,
				`Downloaded content exceeds convertContent.maxResponseBytes (${total} > ${maxResponseBytes}).`
			);
		}
		chunks.push(value);
	}

	const output = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) {
		output.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return output;
}

export async function downloadUrlToTempFile(inputUrl: string, options: DownloadUrlOptions): Promise<DownloadedFile> {
	const sourceUrl = inputUrl;
	let currentUrl = await validatedUrl(inputUrl, options.allowPrivateNetwork);
	const signal = withTimeoutSignal(options.timeoutMs, options.signal);

	try {
		for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
			const response = await fetchWithPinnedDns(currentUrl, {
				redirect: "manual",
				signal,
				timeoutMs: options.timeoutMs,
				allowPrivateNetwork: options.allowPrivateNetwork,
				headers: { "user-agent": USER_AGENT },
			});

			if (response.status >= 300 && response.status < 400) {
				const location = response.headers.get("location");
				await response.body?.cancel();
				if (redirectCount === MAX_REDIRECTS) {
					throw new ConvertProviderError(
						CONVERT_ERROR_CODES.NETWORK_ERROR,
						`Too many redirects while downloading ${sourceUrl}.`
					);
				}
				currentUrl = await validatedUrl(redirectTarget(currentUrl, location), options.allowPrivateNetwork);
				continue;
			}

			if (!response.ok) {
				await response.body?.cancel();
				throw new ConvertProviderError(
					CONVERT_ERROR_CODES.NETWORK_ERROR,
					`Failed to download ${currentUrl.toString()}: HTTP ${response.status}.`
				);
			}

			const contentLength = response.headers.get("content-length");
			if (contentLength && Number(contentLength) > options.maxResponseBytes) {
				await response.body?.cancel();
				throw new ConvertProviderError(
					CONVERT_ERROR_CODES.FILE_TOO_LARGE,
					`Downloaded content exceeds convertContent.maxResponseBytes (${contentLength} > ${options.maxResponseBytes}).`
				);
			}

			const body = await readResponseBody(response, options.maxResponseBytes);
			const contentType = response.headers.get("content-type") ?? undefined;
			const ext = extensionFromUrlOrType(currentUrl, contentType ?? null);
			const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "devkit-pi-convert-"));
			const tempPath = path.join(tempDir, `download${ext}`);
			try {
				await fs.writeFile(tempPath, body);
			} catch (error) {
				await fs.rm(tempDir, { recursive: true, force: true });
				throw error;
			}

			return {
				path: tempPath,
				sourceUrl,
				finalUrl: currentUrl.toString(),
				contentType,
				fileName: fileNameFromUrl(currentUrl),
				fileSize: body.byteLength,
			};
		}
	} catch (error) {
		if (error instanceof ConvertProviderError) throw error;
		if (error instanceof HttpSecurityError) throw classifyUrlValidationError(error);
		if (isAbortLikeError(error)) {
			throw new ConvertProviderError(
				CONVERT_ERROR_CODES.CONVERT_TIMEOUT,
				`Download timed out after ${options.timeoutMs}ms.`
			);
		}
		const message = error instanceof Error ? error.message : String(error);
		throw new ConvertProviderError(CONVERT_ERROR_CODES.NETWORK_ERROR, `Download failed: ${message}`);
	}

	throw new ConvertProviderError(CONVERT_ERROR_CODES.NETWORK_ERROR, `Failed to download ${sourceUrl}.`);
}

export async function removeDownloadedFile(downloaded: Pick<DownloadedFile, "path">): Promise<void> {
	await fs.rm(path.dirname(downloaded.path), { recursive: true, force: true });
}
