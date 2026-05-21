/**
 * /subagents doctor - Diagnostic check for subagent configuration
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { getConfigPath, loadConfig, mergeConfig } from "../../../config/load-config.ts";
import { DEVKIT_TOOL_MANIFEST } from "../../../extension/manifest.ts";
import {
	RESULTS_DIR,
	type ResolvedToolkitConfig,
	type ResolvedWebConfig,
	type ToolkitConfig,
} from "../../../shared/types.ts";
import {
	getProviderApiKeyEnv,
	getProviderDisplayName,
	isProviderEnabled,
	SEARCH_PROVIDER_NAMES,
} from "../../web/providers/metadata.ts";
import { getSearchProvider } from "../../web/providers/registry.ts";
import type { SearchProviderAdapter, WebSearchProviderName } from "../../web/providers/types.ts";
import { discoverAgents } from "../agents.ts";

// ============================================================================
// Types
// ============================================================================

export type DiagnosticStatus = "pass" | "warn" | "fail" | "info";

export interface DiagnosticItem {
	status: DiagnosticStatus;
	category: string;
	message: string;
	details?: string;
}

export interface DoctorReport {
	items: DiagnosticItem[];
	summary: {
		passed: number;
		warnings: number;
		failed: number;
	};
}

// ============================================================================
// Provider Checks
// ============================================================================

async function checkProvider(
	name: WebSearchProviderName,
	provider: SearchProviderAdapter,
	config: ResolvedWebConfig
): Promise<DiagnosticItem> {
	const displayName = getProviderDisplayName(name);

	// Check if provider is enabled in config
	if (!isProviderEnabled(config, name)) {
		return {
			status: "info",
			category: "provider",
			message: `${displayName} is not enabled`,
		};
	}

	// Check API key if required
	const apiKeyEnv = getProviderApiKeyEnv(config, name);

	if (apiKeyEnv && !process.env[apiKeyEnv]) {
		return {
			status: "warn",
			category: "provider",
			message: `${displayName} requires ${apiKeyEnv}`,
			details: "Set the environment variable to enable this provider",
		};
	}

	// Try to check availability
	try {
		if (provider.isAvailable) {
			const available = await provider.isAvailable(config);
			if (available) {
				return {
					status: "pass",
					category: "provider",
					message: `${displayName} responds correctly`,
				};
			}
			return {
				status: "warn",
				category: "provider",
				message: `${displayName} may have issues`,
				details: "Provider exists but availability check failed",
			};
		}
		return {
			status: "pass",
			category: "provider",
			message: `${displayName} is configured`,
		};
	} catch (error) {
		return {
			status: "fail",
			category: "provider",
			message: `${displayName} error`,
			details: error instanceof Error ? error.message : String(error),
		};
	}
}

// ============================================================================
// Main Diagnostic Function
// ============================================================================

export async function runDoctorChecks(cwd: string, resolvedConfig?: ResolvedToolkitConfig): Promise<DoctorReport> {
	const items: DiagnosticItem[] = [];
	let discoveredAgentsDiagnosticsCount = 0;

	// 1. Configuration check
	try {
		const configPath = getConfigPath();

		if (fs.existsSync(configPath)) {
			JSON.parse(fs.readFileSync(configPath, "utf-8"));
			items.push({
				status: "pass",
				category: "config",
				message: "Configuration loaded",
				details: configPath,
			});
		} else {
			items.push({
				status: "info",
				category: "config",
				message: "Using default configuration",
				details: "No config file found, using defaults",
			});
		}
	} catch (error) {
		items.push({
			status: "fail",
			category: "config",
			message: "Configuration error",
			details: error instanceof Error ? error.message : String(error),
		});
	}

	// 2. Agent discovery check
	try {
		const { agents: allAgents, diagnostics } = discoverAgents(cwd, "both");
		discoveredAgentsDiagnosticsCount = diagnostics.length;
		const builtinAgents = allAgents.filter((a) => a.source === "builtin");
		const userAgents = allAgents.filter((a) => a.source === "user");
		const projectAgents = allAgents.filter((a) => a.source === "project");

		items.push({
			status: "pass",
			category: "agents",
			message: `${builtinAgents.length} builtin agents discovered`,
		});

		if (userAgents.length > 0) {
			items.push({
				status: "info",
				category: "agents",
				message: `${userAgents.length} user agents found`,
				details: userAgents.map((a) => a.name).join(", "),
			});
		}

		if (projectAgents.length > 0) {
			items.push({
				status: "info",
				category: "agents",
				message: `${projectAgents.length} project agents found`,
				details: projectAgents.map((a) => a.name).join(", "),
			});
		}

		if (discoveredAgentsDiagnosticsCount > 0) {
			items.push({
				status: "warn",
				category: "agents",
				message: `${discoveredAgentsDiagnosticsCount} agent definitions skipped (frontmatter/file validation)`,
			});
		}
	} catch (error) {
		items.push({
			status: "fail",
			category: "agents",
			message: "Agent discovery failed",
			details: error instanceof Error ? error.message : String(error),
		});
	}

	// 3. Provider checks
	const { config } = (
		resolvedConfig ? { config: resolvedConfig as ToolkitConfig, errors: [] as string[] } : loadConfig()
	) as { config: ToolkitConfig; errors: string[] };
	const resolved = mergeConfig(config);

	// Check ddgs first (always available if installed)
	const ddgsProvider = getSearchProvider("ddgs");
	try {
		if (ddgsProvider.isAvailable) {
			const available = await ddgsProvider.isAvailable(resolved.web);
			items.push({
				status: available ? "pass" : "warn",
				category: "provider",
				message: available ? "DuckDuckGo Lite responds correctly" : "DuckDuckGo Lite may have issues",
			});
		}
	} catch {
		items.push({
			status: "warn",
			category: "provider",
			message: "DuckDuckGo Lite not available",
			details: "May need to install duckduckgo-search package",
		});
	}

	// Check other providers based on config
	const providerNames = SEARCH_PROVIDER_NAMES.filter((name) => name !== "ddgs");
	for (const name of providerNames) {
		const provider = getSearchProvider(name);
		const result = await checkProvider(name, provider, resolved.web);
		items.push(result);
	}

	// 4. Directory permissions check
	try {
		const resultsDir = RESULTS_DIR;
		if (!fs.existsSync(resultsDir)) {
			fs.mkdirSync(resultsDir, { recursive: true });
		}
		const testFile = path.join(resultsDir, `.test-${Date.now()}`);
		fs.writeFileSync(testFile, "test");
		fs.unlinkSync(testFile);
		items.push({
			status: "pass",
			category: "permissions",
			message: "Results directory writable",
		});
	} catch (error) {
		items.push({
			status: "fail",
			category: "permissions",
			message: "Results directory not writable",
			details: error instanceof Error ? error.message : String(error),
		});
	}

	// 5. Web tools enabled check
	items.push({
		status: resolved.web.enabled ? "pass" : "warn",
		category: "web-tools",
		message: resolved.web.enabled ? "Web tools enabled" : "Web tools disabled",
		details: resolved.web.enabled
			? `Provider: ${resolved.web.provider}, Debug: ${resolved.web.debug}`
			: "Enable web.enabled in config to use web_search and fetch_content",
	});

	// 6. LSP diagnostics/tool status
	if (!resolved.lsp.enabled) {
		items.push({
			status: "warn",
			category: "lsp",
			message: "LSP module disabled",
			details: "Enable lsp.enabled in config to use lsp tool and diagnostics hook",
		});
	} else {
		items.push({
			status: resolved.lsp.tool.enabled ? "pass" : "warn",
			category: "lsp",
			message: resolved.lsp.tool.enabled ? "LSP tool enabled" : "LSP tool disabled",
			details: resolved.lsp.tool.allowMutatingActions
				? "Mutating actions allowed in main process"
				: "Mutating actions blocked by default",
		});

		items.push({
			status: resolved.lsp.hook.enabled ? "pass" : "info",
			category: "lsp",
			message: resolved.lsp.hook.enabled
				? `LSP diagnostics hook enabled (${resolved.lsp.hook.mode})`
				: "LSP diagnostics hook disabled",
		});
	}

	// 7. Subagents strategy visibility (Phase 6)
	items.push({
		status: "info",
		category: "subagents",
		message: "Subagent scope semantics aligned (user/project/both)",
		details: "Discovery supports user-only, project-only, and both scopes.",
	});

	items.push({
		status: resolved.subagents.projectAgentPolicy === "confirm" ? "warn" : "pass",
		category: "subagents",
		message:
			resolved.subagents.projectAgentPolicy === "confirm"
				? "Project-local agent execution requires confirmation"
				: "Project-local agent execution allows direct run",
		details: `projectAgentPolicy=${resolved.subagents.projectAgentPolicy}, nonInteractivePolicy=${resolved.subagents.nonInteractivePolicy}`,
	});

	items.push({
		status: discoveredAgentsDiagnosticsCount > 0 ? "warn" : "pass",
		category: "subagents",
		message:
			discoveredAgentsDiagnosticsCount > 0
				? "Frontmatter validation found invalid agent files"
				: "Frontmatter validation passed for discovered agent files",
		details: `diagnostics=${discoveredAgentsDiagnosticsCount}`,
	});

	// 8. Guards gate mode visibility (Phase 5)
	if (!resolved.guards.enabled || resolved.guards.mode === "off") {
		items.push({
			status: "info",
			category: "guards",
			message: "Guards gate disabled",
			details: `enabled=${resolved.guards.enabled}, mode=${resolved.guards.mode}`,
		});
	} else {
		const gateModeActive = resolved.guards.mode !== "notice";
		const hardBlockActive = gateModeActive && resolved.guards.blockMode === "hard";

		items.push({
			status: hardBlockActive ? "warn" : resolved.guards.mode === "notice" ? "info" : "pass",
			category: "guards",
			message:
				resolved.guards.mode === "notice"
					? "Guards running in notice mode"
					: `Guards gate mode active (${resolved.guards.mode})`,
			details:
				resolved.guards.mode === "notice"
					? "No gate decision is enforced in notice mode"
					: `nonInteractivePolicy=${resolved.guards.nonInteractivePolicy}, blockMode=${resolved.guards.blockMode}`,
		});

		if (hardBlockActive) {
			items.push({
				status: "warn",
				category: "guards",
				message: "Guards hard-block is active and may block write tool calls",
				details:
					"Current config can throw GUARD_HARD_BLOCKED on deny decisions. Use blockMode=soft/preview to avoid hard blocking.",
			});
		}
	}

	// 9. Tool metadata health check
	const duplicateNames = new Set<string>();
	const seenNames = new Set<string>();
	for (const tool of DEVKIT_TOOL_MANIFEST) {
		if (seenNames.has(tool.name)) duplicateNames.add(tool.name);
		seenNames.add(tool.name);
	}

	if (duplicateNames.size > 0) {
		items.push({
			status: "fail",
			category: "tool-metadata",
			message: "Tool manifest contains duplicate tool names",
			details: [...duplicateNames].sort().join(", "),
		});
	} else if (DEVKIT_TOOL_MANIFEST.length === 0) {
		items.push({
			status: "fail",
			category: "tool-metadata",
			message: "Tool manifest is empty",
		});
	} else {
		const invalidEntries = DEVKIT_TOOL_MANIFEST.filter(
			(tool) =>
				tool.name.trim().length === 0 ||
				tool.label.trim().length === 0 ||
				tool.description.trim().length === 0 ||
				tool.promptSnippet.trim().length === 0 ||
				tool.promptGuidelines.length === 0 ||
				tool.promptGuidelines.some((line) => line.trim().length === 0)
		);

		if (invalidEntries.length > 0) {
			items.push({
				status: "fail",
				category: "tool-metadata",
				message: "Tool manifest has incomplete metadata",
				details: invalidEntries.map((tool) => tool.name).join(", "),
			});
		} else {
			items.push({
				status: "pass",
				category: "tool-metadata",
				message: `${DEVKIT_TOOL_MANIFEST.length} tools have complete metadata`,
			});
		}
	}

	// 10. State-model semantics (Phase 3 minimal visibility)
	items.push({
		status: "info",
		category: "state-model",
		message: "Web responseId state uses memory + session-entry restore",
		details:
			"In-memory results are cleared on session shutdown; branch restore uses custom entries (web-tools-results) with TTL filtering.",
	});

	items.push({
		status: "info",
		category: "state-model",
		message: "Subagent execution restore is details-driven",
		details:
			"Stable recovery fields come from tool result details (mode/results/error); streaming is execution-only and optional in final results.",
	});

	// Calculate summary
	const summary = {
		passed: items.filter((i) => i.status === "pass").length,
		warnings: items.filter((i) => i.status === "warn").length,
		failed: items.filter((i) => i.status === "fail").length,
	};

	return { items, summary };
}

// ============================================================================
// Formatter
// ============================================================================

export function formatDoctorReport(report: DoctorReport): string {
	const lines: string[] = [];

	lines.push("Toolkit Doctor - Diagnostic Report");
	lines.push("");
	lines.push(
		`Summary: ${report.summary.passed} passed, ${report.summary.warnings} warnings, ${report.summary.failed} failed`
	);

	// Group by category. The surrounding ToolkitReportPanel owns the visual frame,
	// so this formatter intentionally emits semantic text only (no nested box art).
	const categories = [...new Set(report.items.map((i) => i.category))];

	for (const category of categories) {
		const categoryItems = report.items.filter((i) => i.category === category);
		lines.push("");
		lines.push(`[${category.toUpperCase()}]`);

		for (const item of categoryItems) {
			const status =
				item.status === "pass"
					? "PASS"
					: item.status === "warn"
						? "WARN"
						: item.status === "fail"
							? "FAIL"
							: "INFO";

			lines.push(`  [${status}] ${item.message}`);

			if (item.details) {
				lines.push(`         ${item.details}`);
			}
		}
	}

	return lines.join("\n");
}
