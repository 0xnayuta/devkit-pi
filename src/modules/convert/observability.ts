import { addToolkitActivityEntry } from "../../shared/activity.ts";
import type { ProviderStats, WebToolStats } from "../web/observability.ts";

interface ConvertStats {
	calls: number;
	success: number;
	failure: number;
	latencyMsTotal: number;
	errors: Record<string, number>;
	providers: Record<string, { calls: number; success: number; failure: number; latencyMsTotal: number }>;
}

const stats: ConvertStats = {
	calls: 0,
	success: 0,
	failure: 0,
	latencyMsTotal: 0,
	errors: {},
	providers: {},
};

function ensureProvider(provider: string): ConvertStats["providers"][string] {
	if (!stats.providers[provider]) {
		stats.providers[provider] = { calls: 0, success: 0, failure: 0, latencyMsTotal: 0 };
	}
	return stats.providers[provider];
}

export function resetConvertToolStats(): void {
	stats.calls = 0;
	stats.success = 0;
	stats.failure = 0;
	stats.latencyMsTotal = 0;
	stats.errors = {};
	stats.providers = {};
}

export function getConvertToolStats(): WebToolStats {
	const providerStats: Record<string, ProviderStats> = {};
	for (const [provider, raw] of Object.entries(stats.providers)) {
		providerStats[provider] = {
			requests: raw.calls,
			errors: raw.failure,
			rateLimited: 0,
			totalLatencyMs: raw.latencyMsTotal,
			successRate: raw.calls > 0 ? raw.success / raw.calls : 0,
		};
	}

	return {
		totalRequests: stats.calls,
		successCount: stats.success,
		errorCount: stats.failure,
		rateLimitedCount: 0,
		averageLatencyMs: stats.calls > 0 ? Math.round(stats.latencyMsTotal / stats.calls) : 0,
		providerStats,
	};
}

export function recordConvertActivity(
	provider: string,
	status: "success" | "error",
	startTs: number,
	errorCode?: string
): void {
	const duration = Math.max(0, Date.now() - startTs);
	const providerStats = ensureProvider(provider);

	stats.calls += 1;
	stats.latencyMsTotal += duration;
	providerStats.calls += 1;
	providerStats.latencyMsTotal += duration;

	if (status === "success") {
		stats.success += 1;
		providerStats.success += 1;
	} else {
		const code = errorCode ?? "CONVERT_FAILED";
		stats.failure += 1;
		providerStats.failure += 1;
		stats.errors[code] = (stats.errors[code] ?? 0) + 1;
	}

	addToolkitActivityEntry({
		timestamp: startTs,
		type: "convert",
		provider,
		status,
		duration,
		error: status === "error" ? (errorCode ?? "CONVERT_FAILED") : undefined,
	});
}
