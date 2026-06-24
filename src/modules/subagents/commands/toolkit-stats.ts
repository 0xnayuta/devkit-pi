/**
 * Toolkit Statistics Facade
 *
 * Single chokepoint for cross-module observability reads from web and convert
 * modules. Subagent commands import from here instead of deep-importing module
 * internals (web/observability.ts, convert/observability.ts).
 *
 * Whenever a new module exposes observable stats, add its read/reset functions
 * here — only this file crosses the module boundary for observability reads.
 */

import type { ToolkitActivityEntry } from "../../../shared/activity.ts";
import { clearToolkitActivityLog, getToolkitActivityLog } from "../../../shared/activity.ts";
import type { ProviderStats, WebToolStats } from "../../../shared/types.ts";
import { getConvertToolStats, resetConvertToolStats } from "../../convert/index.ts";
import { getWebToolStats, resetWebToolStats } from "../../web/register.ts";

// Re-export shared types
export type { ProviderStats, WebToolStats };

// Re-export activity entry type
export type ActivityEntry = ToolkitActivityEntry;

// ============================================================================
// Activity Log
// ============================================================================

export function getActivityLog(limit?: number): ActivityEntry[] {
	return getToolkitActivityLog(limit);
}

export function clearActivityLog(): void {
	clearToolkitActivityLog();
}

// ============================================================================
// Toolkit Stats (web + convert combined)
// ============================================================================

export function getToolkitStats(): WebToolStats {
	const web = getWebToolStats();
	const convert = getConvertToolStats();
	const totalRequests = web.totalRequests + convert.totalRequests;
	const weightedLatency = web.averageLatencyMs * web.totalRequests + convert.averageLatencyMs * convert.totalRequests;
	return {
		totalRequests,
		successCount: web.successCount + convert.successCount,
		errorCount: web.errorCount + convert.errorCount,
		rateLimitedCount: web.rateLimitedCount + convert.rateLimitedCount,
		averageLatencyMs: totalRequests > 0 ? Math.round(weightedLatency / totalRequests) : 0,
		providerStats: { ...web.providerStats, ...convert.providerStats },
	};
}

export function resetToolkitStats(): void {
	resetWebToolStats();
	resetConvertToolStats();
}
