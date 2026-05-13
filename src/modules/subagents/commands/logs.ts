/**
 * /subagents logs - Show recent tool activity logs
 */

import { getConvertToolStats } from "../../convert/observability.ts";
import type { ActivityEntry, WebToolStats } from "../../web/observability.ts";
import { getActivityLog, getWebToolStats } from "../../web/observability.ts";

// ============================================================================
// Types
// ============================================================================

export interface LogsOptions {
  limit?: number;
  format?: "text" | "json";
  type?: "search" | "fetch" | "convert" | "all";
}

// ============================================================================
// Main Functions
// ============================================================================

function combineStats(web: WebToolStats, convert: WebToolStats): WebToolStats {
  const totalRequests = web.totalRequests + convert.totalRequests;
  const weightedLatency =
    web.averageLatencyMs * web.totalRequests + convert.averageLatencyMs * convert.totalRequests;
  return {
    totalRequests,
    successCount: web.successCount + convert.successCount,
    errorCount: web.errorCount + convert.errorCount,
    rateLimitedCount: web.rateLimitedCount + convert.rateLimitedCount,
    averageLatencyMs: totalRequests > 0 ? Math.round(weightedLatency / totalRequests) : 0,
    providerStats: { ...web.providerStats, ...convert.providerStats },
  };
}

export function getRecentLogs(options: LogsOptions = {}): {
  entries: ActivityEntry[];
  stats: WebToolStats;
} {
  const { limit = 20, type = "all" } = options;

  let entries = getActivityLog(limit);

  // Filter by type if specified
  if (type !== "all") {
    entries = entries.filter((e) => e.type === type);
  }

  return {
    entries,
    stats: combineStats(getWebToolStats(), getConvertToolStats()),
  };
}

// ============================================================================
// Formatters
// ============================================================================

export function formatLogs(options: LogsOptions = {}): string {
  const { limit = 20, type = "all" } = options;
  const { entries, stats } = getRecentLogs({ limit, type });

  const lines: string[] = [];

  // Header
  lines.push(`Recent Activity (last ${entries.length})`);
  lines.push("");

  if (entries.length === 0) {
    lines.push("  (no recent activity)");
  } else {
    for (const entry of entries.reverse()) {
      const timestamp = formatTimestamp(entry.timestamp);
      const typeTag =
        entry.type === "search"
          ? "web_search"
          : entry.type === "fetch"
            ? "fetch"
            : entry.type === "convert"
              ? "convert"
              : "get_content";
      const provider = entry.provider ? entry.provider.padEnd(8) : "".padEnd(8);
      const duration =
        entry.duration !== undefined ? `${entry.duration}ms`.padEnd(7) : "".padEnd(7);
      const statusIcon =
        entry.status === "success"
          ? "✓"
          : entry.status === "rate_limited"
            ? "⚠"
            : entry.status === "error"
              ? "✗"
              : "○";
      const statusText =
        entry.status === "success"
          ? "success"
          : entry.status === "rate_limited"
            ? "rate_limited"
            : entry.status === "error"
              ? (entry.error ?? "error")
              : "pending";

      lines.push(
        `${timestamp}  ${typeTag.padEnd(10)} ${provider} ${statusIcon} ${statusText}${duration ? ` (${duration})` : ""}`
      );
    }
  }

  // Stats summary
  lines.push("");
  lines.push("[STATISTICS]");
  lines.push(`  Total Requests:  ${stats.totalRequests}`);
  lines.push(`  Success:         ${stats.successCount}`);
  lines.push(`  Errors:          ${stats.errorCount}`);
  lines.push(`  Rate Limited:    ${stats.rateLimitedCount}`);
  lines.push(`  Avg Latency:     ${stats.averageLatencyMs}ms`);

  if (Object.keys(stats.providerStats).length > 0) {
    lines.push("");
    lines.push("  Provider Stats:");
    for (const [name, providerStats] of Object.entries(stats.providerStats)) {
      const successRate = (providerStats.successRate * 100).toFixed(1);
      lines.push(
        `    ${name.padEnd(10)} ${providerStats.requests} requests, ${successRate}% success`
      );
    }
  }

  return lines.join("\n");
}

export function formatLogsJson(options: LogsOptions = {}): string {
  const result = getRecentLogs(options);
  return JSON.stringify(result, null, 2);
}

// ============================================================================
// Helpers
// ============================================================================

export function formatTimestamp(ts: number): string {
  const date = new Date(ts);
  return date.toTimeString().split(" ")[0]; // HH:MM:SS
}
