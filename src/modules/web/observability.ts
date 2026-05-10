import type { DebugLevel } from "../../shared/types.ts";

export interface ActivityEntry {
  timestamp: number;
  type: "search" | "fetch" | "get_content";
  provider?: string;
  status: "pending" | "success" | "error" | "rate_limited";
  duration?: number;
  error?: string;
  requestId: string;
}

export interface ProviderStats {
  requests: number;
  errors: number;
  rateLimited: number;
  totalLatencyMs: number;
  successRate: number;
}

export interface WebToolStats {
  totalRequests: number;
  successCount: number;
  errorCount: number;
  rateLimitedCount: number;
  averageLatencyMs: number;
  providerStats: Record<string, ProviderStats>;
}

interface RawProviderStats {
  calls: number;
  success: number;
  failure: number;
  latencyMsTotal: number;
}

interface RawStats {
  search: { calls: number; success: number; failure: number };
  fetch: { calls: number; success: number; failure: number };
  getContent: { calls: number; success: number; failure: number };
  providers: Record<string, RawProviderStats>;
  errorCodes: Record<string, number>;
}

const stats: RawStats = {
  search: { calls: 0, success: 0, failure: 0 },
  fetch: { calls: 0, success: 0, failure: 0 },
  getContent: { calls: 0, success: 0, failure: 0 },
  providers: {},
  errorCodes: {},
};

let debugEnabled: DebugLevel = false;

// Activity log (ring buffer)
const MAX_ACTIVITY_ENTRIES = 100;
const activityLog: ActivityEntry[] = [];
let activityIndex = 0;

function ensureRawProvider(provider: string): RawProviderStats {
  if (!stats.providers[provider]) {
    stats.providers[provider] = { calls: 0, success: 0, failure: 0, latencyMsTotal: 0 };
  }
  return stats.providers[provider];
}

function addActivityEntry(
  entry: Omit<ActivityEntry, "requestId"> & { requestId?: string }
): string {
  const requestId =
    entry.requestId ?? `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const fullEntry: ActivityEntry = { ...entry, requestId };

  if (activityLog.length < MAX_ACTIVITY_ENTRIES) {
    activityLog.push(fullEntry);
  } else {
    activityLog[activityIndex] = fullEntry;
  }
  activityIndex = (activityIndex + 1) % MAX_ACTIVITY_ENTRIES;

  return requestId;
}

// ============================================================================
// Configuration
// ============================================================================

export function configureWebObservability(debug: DebugLevel): void {
  debugEnabled = debug;
}

export function getDebugLevel(): DebugLevel {
  return debugEnabled;
}

// ============================================================================
// Activity Log API
// ============================================================================

export function getActivityLog(limit?: number): ActivityEntry[] {
  if (activityLog.length === 0) return [];

  if (activityLog.length < MAX_ACTIVITY_ENTRIES) {
    const slice = limit ? activityLog.slice(-limit) : [...activityLog];
    return slice;
  }

  // Ring buffer: entries from activityIndex onwards, then from 0 to activityIndex
  const ordered: ActivityEntry[] = [
    ...activityLog.slice(activityIndex),
    ...activityLog.slice(0, activityIndex),
  ];

  return limit ? ordered.slice(-limit) : ordered;
}

export function clearActivityLog(): void {
  activityLog.length = 0;
  activityIndex = 0;
}

// ============================================================================
// Stats API
// ============================================================================

export function resetWebToolStats(): void {
  stats.search = { calls: 0, success: 0, failure: 0 };
  stats.fetch = { calls: 0, success: 0, failure: 0 };
  stats.getContent = { calls: 0, success: 0, failure: 0 };
  stats.providers = {};
  stats.errorCodes = {};
}

export function getWebToolStats(): WebToolStats {
  const total = stats.search.calls + stats.fetch.calls + stats.getContent.calls;
  const totalSuccess = stats.search.success + stats.fetch.success + stats.getContent.success;
  const totalError = stats.search.failure + stats.fetch.failure + stats.getContent.failure;

  // Calculate total latency from all providers
  let totalLatencyMs = 0;
  for (const p of Object.values(stats.providers)) {
    totalLatencyMs += p.latencyMsTotal;
  }

  const averageLatencyMs = total > 0 ? totalLatencyMs / total : 0;

  // Convert raw provider stats to structured format
  const providerStats: Record<string, ProviderStats> = {};
  for (const [name, p] of Object.entries(stats.providers)) {
    providerStats[name] = {
      requests: p.calls,
      errors: p.failure,
      rateLimited: stats.errorCodes.PROVIDER_RATE_LIMITED ?? 0,
      totalLatencyMs: p.latencyMsTotal,
      successRate: p.calls > 0 ? p.success / p.calls : 0,
    };
  }

  return {
    totalRequests: total,
    successCount: totalSuccess,
    errorCount: totalError,
    rateLimitedCount: stats.errorCodes.PROVIDER_RATE_LIMITED ?? 0,
    averageLatencyMs: Math.round(averageLatencyMs),
    providerStats,
  };
}

// ============================================================================
// Legacy Stats API (for backward compatibility)
// ============================================================================

export function recordSearchCall(provider: string): number {
  stats.search.calls += 1;
  const p = ensureRawProvider(provider);
  p.calls += 1;
  return Date.now();
}

export function recordSearchSuccess(provider: string, startTs: number): void {
  stats.search.success += 1;
  const p = ensureRawProvider(provider);
  p.success += 1;
  p.latencyMsTotal += Math.max(0, Date.now() - startTs);
}

export function recordSearchFailure(provider: string, code: string, startTs: number): void {
  stats.search.failure += 1;
  const p = ensureRawProvider(provider);
  p.failure += 1;
  p.latencyMsTotal += Math.max(0, Date.now() - startTs);
  stats.errorCodes[code] = (stats.errorCodes[code] ?? 0) + 1;
}

export function recordFetchCall(): void {
  stats.fetch.calls += 1;
}

export function recordFetchSuccess(): void {
  stats.fetch.success += 1;
}

export function recordFetchFailure(code: string): void {
  stats.fetch.failure += 1;
  stats.errorCodes[code] = (stats.errorCodes[code] ?? 0) + 1;
}

// ============================================================================
// Debug Logging (with levels)
// ============================================================================

function formatDebugMessage(level: DebugLevel, message: string, details?: unknown): string {
  const timestamp = new Date().toISOString().replace("T", " ").replace("Z", "");
  const prefix = `[web-tools] ${timestamp}`;

  if (details === undefined) {
    return `${prefix} ${message}`;
  }

  if (level === "minimal") {
    const detailStr =
      typeof details === "object" && details !== null ? JSON.stringify(details) : String(details);
    return `${prefix} ${message} ${detailStr}`;
  }

  // verbose
  return `${prefix} ${message}\n${JSON.stringify(details, null, 2)}`;
}

function isWarningOrErrorMessage(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("fail") ||
    normalized.includes("error") ||
    normalized.includes("warn") ||
    normalized.includes("timeout") ||
    normalized.includes("abort") ||
    normalized.includes("rate") ||
    normalized.includes("limit")
  );
}

export function webDebugLog(message: string, details?: unknown): void {
  if (debugEnabled === false) return;
  if (debugEnabled === "minimal" && !isWarningOrErrorMessage(message)) return;

  const formatted = formatDebugMessage(debugEnabled, message, details);
  console.log(formatted);
}

// ============================================================================
// High-level Activity Recording (combines legacy + activity log)
// ============================================================================

export function recordSearchActivity(
  entry: Omit<ActivityEntry, "timestamp"> & { timestamp?: number }
): void;
export function recordSearchActivity(
  provider: string,
  status: "success" | "error" | "rate_limited",
  startTs: number,
  errorCode?: string
): void;
export function recordSearchActivity(
  providerOrEntry: string | (Omit<ActivityEntry, "timestamp"> & { timestamp?: number }),
  status?: "success" | "error" | "rate_limited",
  startTs?: number,
  errorCode?: string
): void {
  if (typeof providerOrEntry === "object") {
    addActivityEntry({
      timestamp: providerOrEntry.timestamp ?? Date.now(),
      type: providerOrEntry.type,
      provider: providerOrEntry.provider,
      status: providerOrEntry.status,
      duration: providerOrEntry.duration,
      error: providerOrEntry.error,
      requestId: providerOrEntry.requestId,
    });
    return;
  }

  const provider = providerOrEntry;
  const effectiveStatus = status ?? "error";
  const effectiveStartTs = startTs ?? Date.now();
  const duration = Date.now() - effectiveStartTs;

  // Legacy stats - call must happen first to increment counter
  recordSearchCall(provider);
  if (effectiveStatus === "success") {
    recordSearchSuccess(provider, effectiveStartTs);
  } else {
    recordSearchFailure(provider, errorCode ?? "UNKNOWN", effectiveStartTs);
  }

  // Activity log
  const code =
    effectiveStatus === "rate_limited"
      ? "PROVIDER_RATE_LIMITED"
      : (errorCode ?? "WEB_SEARCH_FAILED");

  addActivityEntry({
    timestamp: effectiveStartTs,
    type: "search",
    provider,
    status: effectiveStatus,
    duration,
    error: effectiveStatus !== "success" ? code : undefined,
  });
}

export function recordFetchActivity(
  status: "success" | "error" | "rate_limited",
  errorCode?: string
): void {
  const startTs = Date.now();

  // Legacy stats - call must happen first to increment counter
  recordFetchCall();
  if (status === "success") {
    recordFetchSuccess();
  } else {
    recordFetchFailure(errorCode ?? "FETCH_CONTENT_FAILED");
  }

  // Activity log
  const code =
    status === "rate_limited" ? "PROVIDER_RATE_LIMITED" : (errorCode ?? "FETCH_CONTENT_FAILED");

  addActivityEntry({
    timestamp: startTs,
    type: "fetch",
    status,
    error: status !== "success" ? code : undefined,
  });
}

export function recordGetContentActivity(status: "success" | "error", errorCode?: string): void {
  stats.getContent.calls += 1;
  if (status === "success") {
    stats.getContent.success += 1;
  } else {
    stats.getContent.failure += 1;
    stats.errorCodes[errorCode ?? "GET_SEARCH_CONTENT_FAILED"] =
      (stats.errorCodes[errorCode ?? "GET_SEARCH_CONTENT_FAILED"] ?? 0) + 1;
  }

  addActivityEntry({
    timestamp: Date.now(),
    type: "get_content",
    status,
    error: status !== "success" ? (errorCode ?? "GET_SEARCH_CONTENT_FAILED") : undefined,
  });
}
