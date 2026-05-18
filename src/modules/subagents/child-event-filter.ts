/**
 * Classification for child pi JSONL events crossing the subagent stdout boundary.
 *
 * The child pi `--mode json` stream can contain high-frequency streaming events
 * whose payloads include cumulative partial message snapshots. Persisting those
 * events in the final stdout buffer can grow O(N²) for long assistant output.
 * This filter keeps the final collector focused on low-frequency lifecycle
 * events while allowing transient events to be observed without persistence.
 */

export type ChildEventPersistence = "persist" | "transient" | "drop";

type JsonRecord = Record<string, unknown>;

const TRANSIENT_EVENT_TYPES = new Set([
  // High-frequency assistant streaming updates. These can carry cumulative
  // `message` and `assistantMessageEvent.partial` snapshots.
  "message_update",
  // High-frequency tool execution partial updates. Final result/error is kept
  // through tool_execution_end / tool_result_end.
  "tool_execution_update",
]);

const DROP_EVENT_TYPES = new Set([
  // Startup/current-state events are not needed for final result extraction and
  // may duplicate message snapshots.
  "message_start",
  // Queue updates are only useful for interactive UI and are not meaningful for
  // foreground single-shot subagent collection.
  "queue_update",
]);

/**
 * Decide whether a parsed child JSONL event should be persisted to the final
 * stdout buffer, treated as transient streaming state, or dropped.
 *
 * Unknown/non-object records are persisted for forward compatibility: final
 * collector and error extraction should continue to see new low-frequency event
 * types until this filter is taught otherwise.
 */
export function classifyChildJsonlEvent(event: unknown): ChildEventPersistence {
  if (!isRecord(event)) return "persist";

  const eventType = event.type;
  if (typeof eventType !== "string") return "persist";

  if (TRANSIENT_EVENT_TYPES.has(eventType)) return "transient";
  if (DROP_EVENT_TYPES.has(eventType)) return "drop";

  return "persist";
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
