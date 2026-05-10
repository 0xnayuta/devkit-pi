/**
 * Configuration Loading for devkit-pi
 *
 * Loads toolkit config from ~/.pi/agent/extensions/devkit-pi/config.json
 * and merges with defaults.
 *
 * TODO: Phase 2 — extend with namespace config + legacy migration
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

export interface ToolkitConfig {
  enabled?: boolean;
  subagents?: {
    enabled?: boolean;
    maxDepth?: number;
    timeoutMs?: number;
    allowWrite?: boolean;
    injectDelegationPolicy?: boolean;
  };
  web?: {
    enabled?: boolean;
    provider?: string;
    timeoutMs?: number;
    maxResults?: number;
  };
  lsp?: {
    enabled?: boolean;
    tool?: {
      enabled?: boolean;
      allowMutatingActions?: boolean;
    };
    hook?: {
      enabled?: boolean;
      mode?: "edit_write" | "agent_end" | "disabled";
    };
  };
}

export const DEFAULT_CONFIG: Required<ToolkitConfig> = {
  enabled: true,
  subagents: {
    enabled: true,
    maxDepth: 1,
    timeoutMs: 120_000,
    allowWrite: false,
    injectDelegationPolicy: true,
  },
  web: {
    enabled: true,
    provider: "ddgs",
    timeoutMs: 10_000,
    maxResults: 5,
  },
  lsp: {
    enabled: true,
    tool: {
      enabled: true,
      allowMutatingActions: false,
    },
    hook: {
      enabled: true,
      mode: "agent_end",
    },
  },
};

function getConfigPath(): string {
  return path.join(
    process.env.HOME ?? os.homedir(),
    ".pi",
    "agent",
    "extensions",
    "devkit-pi",
    "config.json",
  );
}

export function loadConfig(configPath = getConfigPath()): ToolkitConfig {
  try {
    if (fs.existsSync(configPath)) {
      return JSON.parse(fs.readFileSync(configPath, "utf-8")) as ToolkitConfig;
    }
  } catch (error) {
    console.error(`Failed to load devkit-pi config from '${configPath}':`, error);
  }
  return {};
}

// TODO: Phase 2 — implement mergeConfig with full namespace resolution
// TODO: Phase 2 — implement legacy migration from pi-subagents config format
