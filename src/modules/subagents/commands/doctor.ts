/**
 * /subagents doctor - Diagnostic check for subagent configuration
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { getConfigPath, loadConfig, mergeConfig } from "../../../config/load-config.ts";
import {
  RESULTS_DIR,
  type ResolvedToolkitConfig,
  type ResolvedWebConfig,
} from "../../../shared/types.ts";
import { getSearchProvider } from "../../web/providers/registry.ts";
import type { SearchProviderAdapter } from "../../web/providers/types.ts";
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
  name: string,
  provider: SearchProviderAdapter,
  config: ResolvedWebConfig
): Promise<DiagnosticItem> {
  const displayName =
    name === "brave"
      ? "Brave Search"
      : name === "ddgs"
        ? "DuckDuckGo Lite"
        : name === "openserp"
          ? "OpenSERP"
          : name === "searxng"
            ? "SearXNG"
            : name === "tavily"
              ? "Tavily"
              : name === "serper"
                ? "Serper"
                : name;

  // Check if provider is enabled in config
  const providerConfig = config;
  const isEnabled =
    name === "openserp"
      ? providerConfig.openserp.enabled
      : name === "searxng"
        ? providerConfig.searxng.enabled
        : name === "tavily"
          ? providerConfig.tavily.enabled
          : name === "serper"
            ? providerConfig.serper.enabled
            : true;

  if (!isEnabled) {
    return {
      status: "info",
      category: "provider",
      message: `${displayName} is not enabled`,
    };
  }

  // Check API key if required
  const apiKeyEnv =
    name === "openserp"
      ? providerConfig.openserp.apiKeyEnv
      : name === "tavily"
        ? providerConfig.tavily.apiKeyEnv
        : name === "serper"
          ? providerConfig.serper.apiKeyEnv
          : name === "brave"
            ? "BRAVE_SEARCH_API_KEY"
            : null;

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

export async function runDoctorChecks(
  cwd: string,
  resolvedConfig?: ResolvedToolkitConfig
): Promise<DoctorReport> {
  const items: DiagnosticItem[] = [];

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
    const { agents: allAgents } = discoverAgents(cwd, "both");
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

    // Check for parse errors in user/project agents
    const userAgentsDir = path.join(os.homedir(), ".pi", "agent", "agents");
    if (fs.existsSync(userAgentsDir)) {
      const files = fs
        .readdirSync(userAgentsDir)
        .filter((f) => f.endsWith(".md") || f.endsWith(".markdown"));
      const skippedCount = files.length - userAgents.length;
      if (skippedCount > 0) {
        items.push({
          status: "warn",
          category: "agents",
          message: `${skippedCount} user agents skipped (parse error)`,
        });
      }
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
  const config = resolvedConfig ?? mergeConfig(loadConfig());

  // Check ddgs first (always available if installed)
  const ddgsProvider = getSearchProvider("ddgs");
  try {
    if (ddgsProvider.isAvailable) {
      const available = await ddgsProvider.isAvailable(config.web);
      items.push({
        status: available ? "pass" : "warn",
        category: "provider",
        message: available
          ? "DuckDuckGo Lite responds correctly"
          : "DuckDuckGo Lite may have issues",
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
  const providerNames = ["tavily", "serper", "brave", "openserp", "searxng"] as const;
  for (const name of providerNames) {
    const provider = getSearchProvider(name);
    const result = await checkProvider(name, provider, config.web);
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
    status: config.web.enabled ? "pass" : "warn",
    category: "web-tools",
    message: config.web.enabled ? "Web tools enabled" : "Web tools disabled",
    details: config.web.enabled
      ? `Provider: ${config.web.provider}, Debug: ${config.web.debug}`
      : "Enable web.enabled in config to use web_search and fetch_content",
  });

  // 6. LSP diagnostics/tool status
  if (!config.lsp.enabled) {
    items.push({
      status: "warn",
      category: "lsp",
      message: "LSP module disabled",
      details: "Enable lsp.enabled in config to use lsp tool and diagnostics hook",
    });
  } else {
    items.push({
      status: config.lsp.tool.enabled ? "pass" : "warn",
      category: "lsp",
      message: config.lsp.tool.enabled ? "LSP tool enabled" : "LSP tool disabled",
      details: config.lsp.tool.allowMutatingActions
        ? "Mutating actions allowed in main process"
        : "Mutating actions blocked by default",
    });

    items.push({
      status: config.lsp.hook.enabled ? "pass" : "info",
      category: "lsp",
      message: config.lsp.hook.enabled
        ? `LSP diagnostics hook enabled (${config.lsp.hook.mode})`
        : "LSP diagnostics hook disabled",
    });
  }

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
  const width = 64;

  // Header
  lines.push(`╔${"═".repeat(width)}╗`);
  lines.push(`║${" Toolkit Doctor - Diagnostic Report ".padEnd(width)}║`);
  lines.push(`╠${"═".repeat(width)}╣`);

  // Group by category
  const categories = [...new Set(report.items.map((i) => i.category))];

  for (const category of categories) {
    const categoryItems = report.items.filter((i) => i.category === category);
    lines.push(`║  [${category.toUpperCase()}]`);

    for (const item of categoryItems) {
      const icon =
        item.status === "pass"
          ? "PASS"
          : item.status === "warn"
            ? "WARN"
            : item.status === "fail"
              ? "FAIL"
              : "INFO";
      const iconColored = icon;
      const message =
        item.message.length > width - 12 ? `${item.message.slice(0, width - 15)}...` : item.message;
      lines.push(`║    [${iconColored}]  ${message}`);

      if (item.details) {
        const details =
          item.details.length > width - 12
            ? `${item.details.slice(0, width - 15)}...`
            : item.details;
        lines.push(`║              ${details}`);
      }
    }
    lines.push("║");
  }

  // Summary
  lines.push(`╠${"═".repeat(width)}╣`);
  const summaryLine = `  Summary: ${report.summary.passed} passed, ${report.summary.warnings} warnings, ${report.summary.failed} failed  `;
  lines.push(`║${summaryLine.padEnd(width)}║`);
  lines.push(`╚${"═".repeat(width)}╝`);

  return lines.join("\n");
}
