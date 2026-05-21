export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogEvent {
	level: LogLevel;
	module: string;
	event: string;
	message: string;
	metadata?: Record<string, unknown>;
	error?: {
		name?: string;
		message?: string;
		code?: string;
	};
}

export interface LoggerSink {
	log(event: LogEvent): void;
}

export interface Logger {
	debug(event: string, message: string, metadata?: Record<string, unknown>): void;
	info(event: string, message: string, metadata?: Record<string, unknown>): void;
	warn(event: string, message: string, metadata?: Record<string, unknown>): void;
	error(event: string, message: string, metadata?: Record<string, unknown>, error?: unknown): void;
	child(module: string): Logger;
}

export interface LoggerOptions {
	module: string;
	sink?: LoggerSink;
	maxMetadataKeys?: number;
	maxMetadataDepth?: number;
	maxStringLength?: number;
}

export interface ConsoleLogWriter {
	debug?: (line: string) => void;
	info?: (line: string) => void;
	warn?: (line: string) => void;
	error?: (line: string) => void;
}

const DEFAULT_MAX_METADATA_KEYS = 50;
const DEFAULT_MAX_METADATA_DEPTH = 3;
const DEFAULT_MAX_STRING_LENGTH = 300;
const REDACTED = "[REDACTED]";
const TRUNCATED_SUFFIX = "…[truncated]";
const SENSITIVE_KEY_PATTERNS = ["token", "apikey", "api_key", "authorization", "password", "secret", "cookie"] as const;

class NoopLoggerSink implements LoggerSink {
	log(): void {}
}

export const noopLoggerSink: LoggerSink = new NoopLoggerSink();

export const noopLogger: Logger = createLogger({ module: "noop", sink: noopLoggerSink });

function normalizeModuleName(parent: string, child: string): string {
	const normalizedChild = child.trim();
	if (!normalizedChild) return parent;
	return `${parent}.${normalizedChild}`;
}

function truncateString(value: string, maxLength: number): string {
	if (value.length <= maxLength) return value;
	return `${value.slice(0, maxLength)}${TRUNCATED_SUFFIX}`;
}

function shouldRedactKey(key: string): boolean {
	const normalized = key
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9_]/g, "");
	return SENSITIVE_KEY_PATTERNS.some((pattern) => normalized.includes(pattern));
}

function sanitizeError(error: unknown, maxStringLength: number): LogEvent["error"] | undefined {
	if (!error) return undefined;

	if (error instanceof Error) {
		const errorWithCode = error as Error & { code?: unknown };
		return {
			name: truncateString(error.name, maxStringLength),
			message: truncateString(error.message, maxStringLength),
			code: typeof errorWithCode.code === "string" ? truncateString(errorWithCode.code, maxStringLength) : undefined,
		};
	}

	if (typeof error === "string") {
		return { message: truncateString(error, maxStringLength) };
	}

	return { message: truncateString(String(error), maxStringLength) };
}

function sanitizeValue(
	value: unknown,
	opts: {
		depth: number;
		maxDepth: number;
		maxKeys: number;
		maxStringLength: number;
	}
): unknown {
	if (value == null) return value;

	if (typeof value === "string") {
		return truncateString(value, opts.maxStringLength);
	}

	if (typeof value === "number" || typeof value === "boolean") {
		return value;
	}

	if (typeof value === "bigint") {
		return truncateString(value.toString(), opts.maxStringLength);
	}

	if (typeof value === "function") {
		return "[Function]";
	}

	if (value instanceof Error) {
		return sanitizeError(value, opts.maxStringLength);
	}

	if (Array.isArray(value)) {
		if (opts.depth >= opts.maxDepth) return "[Array]";
		return value.slice(0, opts.maxKeys).map((item) =>
			sanitizeValue(item, {
				...opts,
				depth: opts.depth + 1,
			})
		);
	}

	if (typeof value === "object") {
		if (opts.depth >= opts.maxDepth) return "[Object]";
		const entries = Object.entries(value as Record<string, unknown>).slice(0, opts.maxKeys);
		const result: Record<string, unknown> = {};
		for (const [key, entryValue] of entries) {
			if (shouldRedactKey(key)) {
				result[key] = REDACTED;
				continue;
			}
			result[key] = sanitizeValue(entryValue, {
				...opts,
				depth: opts.depth + 1,
			});
		}
		return result;
	}

	return truncateString(String(value), opts.maxStringLength);
}

function sanitizeMetadata(
	metadata: Record<string, unknown> | undefined,
	options: {
		maxMetadataKeys: number;
		maxMetadataDepth: number;
		maxStringLength: number;
	}
): Record<string, unknown> | undefined {
	if (!metadata) return undefined;
	const result = sanitizeValue(metadata, {
		depth: 0,
		maxDepth: options.maxMetadataDepth,
		maxKeys: options.maxMetadataKeys,
		maxStringLength: options.maxStringLength,
	});
	return (result as Record<string, unknown>) ?? undefined;
}

function buildLogLine(event: LogEvent): string {
	const base = `[${event.level.toUpperCase()}] [${event.module}] ${event.event}: ${event.message}`;
	if (!event.metadata && !event.error) return base;
	return `${base} ${JSON.stringify({ metadata: event.metadata, error: event.error })}`;
}

export function createConsoleLoggerSink(writer: ConsoleLogWriter = {}): LoggerSink {
	return {
		log(event: LogEvent): void {
			const line = buildLogLine(event);
			if (event.level === "debug") {
				(writer.debug ?? console.debug)(line);
				return;
			}
			if (event.level === "info") {
				(writer.info ?? console.info)(line);
				return;
			}
			if (event.level === "warn") {
				(writer.warn ?? console.warn)(line);
				return;
			}
			(writer.error ?? console.error)(line);
		},
	};
}

export interface MemoryLoggerSink extends LoggerSink {
	readonly events: LogEvent[];
	clear(): void;
}

export function createMemoryLoggerSink(): MemoryLoggerSink {
	const events: LogEvent[] = [];
	return {
		events,
		log(event: LogEvent): void {
			events.push(event);
		},
		clear(): void {
			events.length = 0;
		},
	};
}

export function createLogger(options: LoggerOptions): Logger {
	const module = options.module.trim() || "unknown";
	const sink = options.sink ?? noopLoggerSink;
	const maxMetadataKeys = options.maxMetadataKeys ?? DEFAULT_MAX_METADATA_KEYS;
	const maxMetadataDepth = options.maxMetadataDepth ?? DEFAULT_MAX_METADATA_DEPTH;
	const maxStringLength = options.maxStringLength ?? DEFAULT_MAX_STRING_LENGTH;

	const emit = (
		level: LogLevel,
		event: string,
		message: string,
		metadata?: Record<string, unknown>,
		error?: unknown
	): void => {
		sink.log({
			level,
			module,
			event,
			message,
			metadata: sanitizeMetadata(metadata, {
				maxMetadataKeys,
				maxMetadataDepth,
				maxStringLength,
			}),
			error: sanitizeError(error, maxStringLength),
		});
	};

	return {
		debug(event, message, metadata) {
			emit("debug", event, message, metadata);
		},
		info(event, message, metadata) {
			emit("info", event, message, metadata);
		},
		warn(event, message, metadata) {
			emit("warn", event, message, metadata);
		},
		error(event, message, metadata, error) {
			emit("error", event, message, metadata, error);
		},
		child(childModule: string) {
			return createLogger({
				module: normalizeModuleName(module, childModule),
				sink,
				maxMetadataKeys,
				maxMetadataDepth,
				maxStringLength,
			});
		},
	};
}
