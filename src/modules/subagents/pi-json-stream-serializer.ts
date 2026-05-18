/**
 * Reference serializer for a future upstream pi compact JSON stream mode.
 *
 * This module is not wired into the local child process transport directly. It
 * exists as a tested reference implementation of the proposed upstream
 * `--mode json --json-stream compact` behavior so devkit-pi can:
 * - validate the intended wire shape locally;
 * - simulate compact event streams in tests;
 * - keep fallback/compatibility logic aligned with the proposed upstream PR.
 */

import type { PiJsonStreamProfile } from "./pi-json-stream.ts";

export function serializePiJsonStreamEvent(
  event: unknown,
  profile: PiJsonStreamProfile
): unknown | undefined {
  if (profile === "full") return event;
  return compactAgentSessionEvent(event);
}

export function compactAgentSessionEvent(event: unknown): unknown | undefined {
  if (!isRecord(event)) return event;

  const eventType = event.type;
  if (typeof eventType !== "string") return event;

  switch (eventType) {
    case "message_update": {
      const compactAssistantEvent = compactAssistantMessageEvent(event.assistantMessageEvent);
      return compactAssistantEvent
        ? {
            type: "message_update",
            assistantMessageEvent: compactAssistantEvent,
          }
        : { type: "message_update" };
    }
    case "tool_execution_update":
      return undefined;
    default:
      return event;
  }
}

export function compactAssistantMessageEvent(event: unknown): unknown {
  if (!isRecord(event)) return event;

  const eventType = event.type;
  if (typeof eventType !== "string") return stripAssistantMessageEventNoise(event);

  switch (eventType) {
    case "text_delta":
    case "thinking_delta":
    case "toolcall_delta":
      return pickDefined(event, ["type", "contentIndex", "delta"]);
    default:
      return stripAssistantMessageEventNoise(event);
  }
}

function stripAssistantMessageEventNoise(event: Record<string, unknown>): Record<string, unknown> {
  const cleaned = omitKeys(event, ["partial", "message", "provider", "model", "api", "timestamp"]);

  if (isZeroUsage(cleaned.usage)) {
    delete cleaned.usage;
  }

  return cleaned;
}

function omitKeys(
  record: Record<string, unknown>,
  keys: readonly string[]
): Record<string, unknown> {
  const clone = { ...record };
  for (const key of keys) delete clone[key];
  return clone;
}

function pickDefined(
  record: Record<string, unknown>,
  keys: readonly string[]
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of keys) {
    if (record[key] !== undefined) result[key] = record[key];
  }
  return result;
}

function isZeroUsage(value: unknown): boolean {
  if (!isRecord(value)) return false;

  const directKeys = ["input", "output", "cacheRead", "cacheWrite", "totalTokens"];
  for (const key of directKeys) {
    const current = value[key];
    if (typeof current === "number" && current !== 0) return false;
    if (current !== undefined && typeof current !== "number") return false;
  }

  if (value.cost !== undefined) {
    if (!isRecord(value.cost)) return false;
    for (const current of Object.values(value.cost)) {
      if (typeof current === "number" && current !== 0) return false;
      if (current !== undefined && typeof current !== "number") return false;
    }
  }

  return true;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
