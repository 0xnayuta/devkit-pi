/**
 * Output collection from pi subprocess
 */

import type { Usage } from "../../shared/types.ts";

type JsonRecord = Record<string, unknown>;

interface OutputMessage extends JsonRecord {
  type?: string;
  content?: unknown;
  output?: string;
  usage?: unknown;
  error?: string;
  message?: unknown;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/**
 * Parse JSON lines from pi output
 */
export function parseJsonLines(output: string): OutputMessage[] {
  const messages: OutputMessage[] = [];
  const lines = output.split("\n").filter((line) => line.trim());

  for (const line of lines) {
    try {
      const parsed = JSON.parse(line);
      if (isRecord(parsed)) messages.push(parsed as OutputMessage);
    } catch {
      // Not valid JSON, skip
    }
  }

  return messages;
}

function extractTextFromContent(content: unknown): string {
  if (!Array.isArray(content)) return "";

  const parts: string[] = [];
  for (const block of content) {
    if (!isRecord(block)) continue;
    if (block.type === "text") {
      const text = asString(block.text);
      if (text) parts.push(text);
    }
  }

  return parts.join("\n").trim();
}

function extractAssistantText(message: unknown): string {
  if (!isRecord(message) || message.role !== "assistant") return "";
  return extractTextFromContent(message.content);
}

function extractTextFromMessageEvent(message: OutputMessage): string {
  if (message.type !== "turn_end" && message.type !== "message_end") return "";
  return extractAssistantText(message.message);
}

/**
 * Extract final assistant output from pi messages
 */
function extractTextFromSessionMessage(message: OutputMessage): string {
  if (message.type !== "message") return "";
  return extractAssistantText(message.message);
}

function extractTextFromAnyAssistantMessage(message: OutputMessage): string {
  return extractTextFromMessageEvent(message) || extractTextFromSessionMessage(message);
}

function isFinalAssistantMessage(message: OutputMessage): boolean {
  if (message.type === "result") return true;
  if (message.type !== "turn_end" && message.type !== "message_end" && message.type !== "message") {
    return false;
  }

  const nested = isRecord(message.message) ? message.message : undefined;
  if (!nested || nested.role !== "assistant") return false;

  const stopReason = asString(nested.stopReason);
  if (stopReason === "toolUse") return false;

  const content = Array.isArray(nested.content) ? nested.content : [];
  const text = extractTextFromContent(content);
  if (text && PROVIDER_ERROR_PATTERN.test(text)) return false;
  return Boolean(text);
}

export function extractFinalOutput(messages: OutputMessage[]): string {
  // Prefer completed assistant messages from the real pi JSONL event stream.
  for (let i = messages.length - 1; i >= 0; i--) {
    if (!isFinalAssistantMessage(messages[i])) continue;
    const text = extractTextFromAnyAssistantMessage(messages[i]);
    if (text) return text;
  }

  // Backward-compatible support for older/mock result messages.
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message.type === "result" && typeof message.output === "string" && message.output.trim()) {
      return message.output.trim();
    }
  }

  return "";
}

const PROVIDER_ERROR_PATTERN =
  /(?:Error Code|internal_server_error|stream error|INTERNAL_ERROR|ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|rate limit|rate_limit|overloaded|provider error|server error|API error|network error|timeout)/i;

function formatErrorObject(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (!isRecord(value)) return "";

  const code = asString(value.code) ?? asString(value.name) ?? asString(value.type);
  const message = asString(value.message) ?? asString(value.error) ?? asString(value.details);
  if (code && message) return `${code}: ${message}`.trim();
  return (message ?? code ?? "").trim();
}

function extractErrorFromContent(content: unknown): string {
  const text = extractTextFromContent(content);
  return PROVIDER_ERROR_PATTERN.test(text) ? text : "";
}

function extractLastNonErrorAssistantText(messages: OutputMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const text = extractTextFromAnyAssistantMessage(messages[i]);
    if (text && !PROVIDER_ERROR_PATTERN.test(text)) return text;
  }
  return "";
}

export function extractProviderError(messages: OutputMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];

    const directError = formatErrorObject(message.error);
    if (directError) return directError;

    if (isRecord(message.message)) {
      const nestedError = formatErrorObject(message.message.error);
      if (nestedError) return nestedError;

      const nestedTextError = extractErrorFromContent(message.message.content);
      if (nestedTextError) return nestedTextError;

      const nestedMessage = asString(message.message.message);
      if (nestedMessage && PROVIDER_ERROR_PATTERN.test(nestedMessage)) return nestedMessage.trim();
    }

    const directMessage = asString(message.message);
    if (directMessage && PROVIDER_ERROR_PATTERN.test(directMessage)) return directMessage.trim();
  }

  return "";
}

function normalizeUsage(value: unknown, turns: number): Usage | undefined {
  if (!isRecord(value)) return undefined;

  const costValue = isRecord(value.cost) ? asNumber(value.cost.total) : asNumber(value.cost);
  return {
    input: asNumber(value.input) ?? 0,
    output: asNumber(value.output) ?? 0,
    cacheRead: asNumber(value.cacheRead) ?? 0,
    cacheWrite: asNumber(value.cacheWrite) ?? 0,
    cost: costValue ?? 0,
    turns,
  };
}

function getUsageCandidate(message: OutputMessage): unknown {
  if (message.usage) return message.usage;
  if (isRecord(message.message) && message.message.usage) return message.message.usage;
  return undefined;
}

/**
 * Extract usage from pi messages
 */
export function extractUsage(messages: OutputMessage[]): Usage | undefined {
  const turns = messages.filter((message) => message.type === "turn_end").length;

  for (let i = messages.length - 1; i >= 0; i--) {
    const usage = normalizeUsage(getUsageCandidate(messages[i]), turns);
    if (usage) return usage;
  }

  return undefined;
}

function summarizeJsonlWithoutFinalText(messages: OutputMessage[]): string {
  const lastType = messages.at(-1)?.type ?? "unknown";
  const lastAssistant = [...messages]
    .reverse()
    .map((message) => (isRecord(message.message) ? message.message : undefined))
    .find((message) => isRecord(message) && message.role === "assistant") as JsonRecord | undefined;
  const stopReason = asString(lastAssistant?.stopReason);
  const toolExecutions = messages.filter((message) => message.type === "tool_execution_end").length;

  return [
    "Subagent produced JSONL events but no final assistant text could be extracted.",
    `Last event type: ${lastType}.`,
    stopReason ? `Last assistant stop reason: ${stopReason}.` : "",
    toolExecutions > 0 ? `Tool executions completed: ${toolExecutions}.` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Collect and process output from pi subprocess
 */
export interface CollectedOutput {
  output: string;
  usage?: Usage;
  truncated: boolean;
  /** True when output came from a completed assistant/result message. */
  final: boolean;
  /** Provider/runtime error extracted from JSONL events when present. */
  error?: string;
  /** Last assistant text when no completed final answer was found. */
  partialOutput?: string;
  lastEventType?: string;
}

/**
 * Collect and process output from pi subprocess
 */
export function collectOutput(rawOutput: string): CollectedOutput {
  const messages = parseJsonLines(rawOutput);
  const output = extractFinalOutput(messages);
  const usage = extractUsage(messages);
  const error = extractProviderError(messages) || undefined;
  const lastEventType = messages.at(-1)?.type;

  if (output) {
    return { output, usage, truncated: false, final: true, error, lastEventType };
  }

  if (messages.length > 0) {
    const partialOutput = extractLastNonErrorAssistantText(messages) || undefined;
    const fallbackOutput = error ?? partialOutput ?? summarizeJsonlWithoutFinalText(messages);
    return {
      output: fallbackOutput,
      usage,
      truncated: false,
      final: false,
      error,
      partialOutput,
      lastEventType,
    };
  }

  return {
    output: rawOutput.trim(),
    usage,
    truncated: false,
    final: Boolean(rawOutput.trim()),
  };
}
