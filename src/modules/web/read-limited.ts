export interface LimitedTextResult {
	text: string;
	truncated: boolean;
	bytesRead: number;
	maxBytes: number;
}

export interface ReadLimitedTextOptions {
	maxBytes: number;
	context: string;
}

export class ResponseBodyTooLargeError extends Error {
	readonly code = "RESPONSE_BODY_TOO_LARGE";
	readonly context: string;
	readonly maxBytes: number;
	readonly bytesRead: number;

	constructor(context: string, maxBytes: number, bytesRead: number) {
		super(`${context} response body exceeded the configured maxResponseBytes limit (${maxBytes} bytes)`);
		this.name = "ResponseBodyTooLargeError";
		this.context = context;
		this.maxBytes = maxBytes;
		this.bytesRead = bytesRead;
	}
}

export async function readLimitedText(response: Response, options: ReadLimitedTextOptions): Promise<LimitedTextResult> {
	const maxBytes = Math.max(0, Math.floor(options.maxBytes));
	if (!response.body || maxBytes === 0) {
		return { text: "", truncated: Boolean(response.body), bytesRead: 0, maxBytes };
	}

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

	return {
		text: new TextDecoder().decode(body),
		truncated,
		bytesRead: totalBytes,
		maxBytes,
	};
}

export async function readLimitedTextOrThrow(response: Response, options: ReadLimitedTextOptions): Promise<string> {
	const result = await readLimitedText(response, options);
	if (result.truncated) {
		throw new ResponseBodyTooLargeError(options.context, result.maxBytes, result.bytesRead);
	}
	return result.text;
}

export async function readLimitedJson<T>(response: Response, options: ReadLimitedTextOptions): Promise<T> {
	const text = await readLimitedTextOrThrow(response, options);
	return JSON.parse(text) as T;
}
