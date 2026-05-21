import type { AgentToolResult } from "@earendil-works/pi-agent-core";
import { keyHint } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import type { ConvertContentInput } from "./types.ts";

const SUMMARY_CHARS = 500;
const SOURCE_MAX_CHARS = 80;

type ThemeLike = {
	fg?: (color: string, text: string) => string;
	bold?: (text: string) => string;
};

type RenderOptions = {
	expanded: boolean;
	isPartial: boolean;
};

function fg(theme: ThemeLike, color: string, text: string): string {
	return typeof theme.fg === "function" ? theme.fg(color, text) : text;
}

function bold(theme: ThemeLike, text: string): string {
	return typeof theme.bold === "function" ? theme.bold(text) : text;
}

function component(text: string): Text {
	return new Text(text, 0, 0);
}

function safeStringify(value: unknown): string {
	try {
		return JSON.stringify(value, null, 2);
	} catch (error) {
		return `[Unserializable result: ${error instanceof Error ? error.message : String(error)}]`;
	}
}

function getTextContent(result: AgentToolResult<unknown>): string {
	return result.content
		.map((item) => (item.type === "text" && typeof item.text === "string" ? item.text : ""))
		.filter((text) => text.length > 0)
		.join("\n");
}

function detailsOf(result: AgentToolResult<unknown>): unknown {
	if (result.details !== undefined) return result.details;
	const text = getTextContent(result);
	if (!text) return undefined;
	try {
		return JSON.parse(text);
	} catch {
		return text;
	}
}

function truncateText(text: string, maxChars = SUMMARY_CHARS): { text: string; truncated: boolean } {
	if (text.length <= maxChars) return { text, truncated: false };
	return { text: `${text.slice(0, Math.max(0, maxChars - 1))}…`, truncated: true };
}

function displaySource(source: string, maxChars = SOURCE_MAX_CHARS): string {
	try {
		const parsed = new URL(source);
		const compact = `${parsed.hostname}${parsed.pathname === "/" ? "" : parsed.pathname}`;
		return truncateText(compact, maxChars).text;
	} catch {
		return truncateText(source, maxChars).text;
	}
}

function hasError(value: unknown): value is { error: { code?: unknown; message?: unknown } } {
	return Boolean(
		value &&
			typeof value === "object" &&
			"error" in value &&
			(value as { error?: unknown }).error &&
			typeof (value as { error?: unknown }).error === "object"
	);
}

function expandKeyHint(theme: ThemeLike): string {
	try {
		return keyHint("app.tools.expand", "to expand");
	} catch {
		return fg(theme, "dim", "ctrl+o") + fg(theme, "muted", " to expand");
	}
}

export function renderConvertContentCall(args: ConvertContentInput, theme: ThemeLike): Text {
	const source = typeof args.path === "string" && args.path.trim() ? args.path : (args.url ?? "");
	let text = fg(theme, "toolTitle", bold(theme, "convert_content "));
	text += fg(theme, "accent", displaySource(source));
	if (typeof args.maxContentChars === "number") {
		text += fg(theme, "dim", ` (${args.maxContentChars} chars)`);
	}
	return component(text);
}

export function renderConvertContentResult(
	result: AgentToolResult<unknown>,
	{ expanded, isPartial }: RenderOptions,
	theme: ThemeLike
): Text {
	if (isPartial) return component(fg(theme, "warning", "Converting..."));

	const details = detailsOf(result);
	if (hasError(details)) {
		const code = typeof details.error.code === "string" ? details.error.code : "CONVERT_FAILED";
		const message =
			typeof details.error.message === "string" ? details.error.message : safeStringify(details.error.message);
		return component(`${fg(theme, "error", code)}${fg(theme, "dim", `: ${message}`)}`);
	}

	if (expanded) return component(fg(theme, "toolOutput", safeStringify(details)));

	const data = details as {
		source?: string;
		provider?: string;
		content?: string;
		truncated?: boolean;
		metadata?: { contentType?: string; fileName?: string; fileSize?: number; durationMs?: number };
	};
	const preview = truncateText(
		String(data.content ?? "")
			.replace(/\s+/g, " ")
			.trim(),
		SUMMARY_CHARS
	);

	let text = fg(theme, "success", `converted: ${displaySource(String(data.source ?? "unknown"))}`);
	text += fg(theme, "dim", `\nprovider: ${data.provider ?? "unknown"}`);
	if (data.metadata?.contentType) text += fg(theme, "dim", `  type: ${data.metadata.contentType}`);
	if (typeof data.metadata?.fileSize === "number") {
		text += fg(theme, "dim", `  bytes: ${data.metadata.fileSize}`);
	}
	if (preview.text) text += fg(theme, "toolOutput", `\n${preview.text}`);
	if (data.truncated || preview.truncated) text += fg(theme, "warning", " [truncated]");
	text += fg(theme, "muted", "\n... (content hidden, ") + expandKeyHint(theme) + fg(theme, "muted", ")");
	return component(text);
}
