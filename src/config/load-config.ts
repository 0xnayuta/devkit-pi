import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type {
  CommandsConfig,
  DebugLevel,
  LspConfig,
  LspReadonlyAction,
  ResolvedSubagentsConfig,
  ResolvedToolkitConfig,
  ResolvedWebConfig,
  SubagentsConfig,
  ToolkitConfig,
  WebConfig,
  WebSearchProviderName,
} from "../shared/types.ts";

export const DEFAULT_WEB_CONFIG: ResolvedWebConfig = {
  enabled: true,
  provider: "ddgs",
  providerPriority: ["tavily", "serper", "brave", "openserp", "searxng", "ddgs"],
  timeoutMs: 10000,
  maxResponseBytes: 1048576,
  maxContentChars: 30000,
  maxResults: 5,
  enableJinaFallback: false,
  jinaTimeoutMs: 8000,
  maxStoredResults: 100,
  maxStoredContentChars: 200000,
  allowPrivateNetwork: false,
  jinaTriggers: ["short-html", "js-heavy-html"],
  debug: false,
  cache: {
    enabled: false,
    maxEntries: 50,
    ttlMs: 300000,
  },
  concurrency: {
    maxConcurrent: 3,
    maxQueueSize: 10,
  },
  connectionPool: {
    maxSockets: 10,
    maxFreeSockets: 5,
    timeout: 60000,
  },
  openserp: {
    enabled: false,
    baseUrl: "https://api.openserp.com/search",
    apiKeyEnv: "OPENSERP_API_KEY",
  },
  searxng: {
    enabled: false,
    baseUrl: "",
    defaultEngine: "google",
  },
  tavily: {
    enabled: false,
    baseUrl: "https://api.tavily.com/search",
    apiKeyEnv: "TAVILY_API_KEY",
  },
  serper: {
    enabled: false,
    baseUrl: "https://google.serper.dev/search",
    apiKeyEnv: "SERPER_API_KEY",
  },
};

export const DEFAULT_SUBAGENT_LSP_ACTIONS: LspReadonlyAction[] = [
  "definition",
  "references",
  "hover",
  "signature",
  "symbols",
  "diagnostics",
  "workspace-diagnostics",
  "servers",
];

export const DEFAULT_SUBAGENTS_CONFIG: ResolvedSubagentsConfig = {
  enabled: true,
  maxDepth: 1,
  timeoutMs: 120000,
  allowWrite: false,
  allowLspTools: true,
  allowedLspActions: DEFAULT_SUBAGENT_LSP_ACTIONS,
  injectDelegationPolicy: true,
  retry: {
    enabled: true,
    maxAttempts: 2,
  },
};

export const DEFAULT_CONFIG: ResolvedToolkitConfig = {
  enabled: true,
  subagents: DEFAULT_SUBAGENTS_CONFIG,
  web: DEFAULT_WEB_CONFIG,
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
  commands: {
    enabled: true,
  },
};

export function getConfigPath(): string {
  return path.join(
    process.env.HOME ?? os.homedir(),
    ".pi",
    "agent",
    "extensions",
    "devkit-pi",
    "config.json"
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

function positiveInteger(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : fallback;
}

function nonNegativeInteger(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : fallback;
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

const PROVIDER_NAMES: Exclude<WebSearchProviderName, "auto">[] = [
  "tavily",
  "serper",
  "brave",
  "openserp",
  "searxng",
  "ddgs",
];

function normalizeProvider(value: unknown): ResolvedWebConfig["provider"] {
  return value === "brave" ||
    value === "ddgs" ||
    value === "auto" ||
    value === "openserp" ||
    value === "searxng" ||
    value === "tavily" ||
    value === "serper"
    ? value
    : DEFAULT_WEB_CONFIG.provider;
}

function normalizeProviderPriority(value: unknown): ResolvedWebConfig["providerPriority"] {
  if (!Array.isArray(value)) {
    return [...DEFAULT_WEB_CONFIG.providerPriority];
  }

  const filtered = value.filter(
    (item): item is Exclude<WebSearchProviderName, "auto"> =>
      typeof item === "string" &&
      PROVIDER_NAMES.includes(item as Exclude<WebSearchProviderName, "auto">)
  );

  if (filtered.length === 0) {
    return [...DEFAULT_WEB_CONFIG.providerPriority];
  }

  return [...new Set(filtered)];
}

function normalizeDebugLevel(value: unknown): DebugLevel {
  if (value === false || value === "minimal" || value === "verbose") {
    return value;
  }
  if (value === true) return "minimal";
  return DEFAULT_WEB_CONFIG.debug;
}

function nonEmptyString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
}

function trimString(value: unknown, fallback: string): string {
  return typeof value === "string" ? value.trim() : fallback;
}

function normalizeJinaTriggers(value: unknown): string[] {
  if (!Array.isArray(value)) return [...DEFAULT_WEB_CONFIG.jinaTriggers];
  return [
    ...new Set(
      value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    ),
  ];
}

function normalizeWebConfig(base: WebConfig | undefined): ResolvedWebConfig {
  return {
    enabled: booleanValue(base?.enabled, DEFAULT_WEB_CONFIG.enabled),
    provider: normalizeProvider(base?.provider),
    providerPriority: normalizeProviderPriority(base?.providerPriority),
    timeoutMs: positiveInteger(base?.timeoutMs, DEFAULT_WEB_CONFIG.timeoutMs),
    maxResponseBytes: positiveInteger(base?.maxResponseBytes, DEFAULT_WEB_CONFIG.maxResponseBytes),
    maxContentChars: positiveInteger(base?.maxContentChars, DEFAULT_WEB_CONFIG.maxContentChars),
    maxResults: positiveInteger(base?.maxResults, DEFAULT_WEB_CONFIG.maxResults),
    enableJinaFallback: booleanValue(
      base?.enableJinaFallback,
      DEFAULT_WEB_CONFIG.enableJinaFallback
    ),
    jinaTimeoutMs: positiveInteger(base?.jinaTimeoutMs, DEFAULT_WEB_CONFIG.jinaTimeoutMs),
    maxStoredResults: positiveInteger(base?.maxStoredResults, DEFAULT_WEB_CONFIG.maxStoredResults),
    maxStoredContentChars: positiveInteger(
      base?.maxStoredContentChars,
      DEFAULT_WEB_CONFIG.maxStoredContentChars
    ),
    allowPrivateNetwork: booleanValue(
      base?.allowPrivateNetwork,
      DEFAULT_WEB_CONFIG.allowPrivateNetwork
    ),
    jinaTriggers: normalizeJinaTriggers(base?.jinaTriggers),
    debug: normalizeDebugLevel(base?.debug),
    cache: {
      enabled: booleanValue(base?.cache?.enabled, DEFAULT_WEB_CONFIG.cache.enabled),
      maxEntries: positiveInteger(base?.cache?.maxEntries, DEFAULT_WEB_CONFIG.cache.maxEntries),
      ttlMs: positiveInteger(base?.cache?.ttlMs, DEFAULT_WEB_CONFIG.cache.ttlMs),
    },
    concurrency: {
      maxConcurrent: positiveInteger(
        base?.concurrency?.maxConcurrent,
        DEFAULT_WEB_CONFIG.concurrency.maxConcurrent
      ),
      maxQueueSize: positiveInteger(
        base?.concurrency?.maxQueueSize,
        DEFAULT_WEB_CONFIG.concurrency.maxQueueSize
      ),
    },
    connectionPool: {
      maxSockets: positiveInteger(
        base?.connectionPool?.maxSockets,
        DEFAULT_WEB_CONFIG.connectionPool.maxSockets
      ),
      maxFreeSockets: positiveInteger(
        base?.connectionPool?.maxFreeSockets,
        DEFAULT_WEB_CONFIG.connectionPool.maxFreeSockets
      ),
      timeout: positiveInteger(
        base?.connectionPool?.timeout,
        DEFAULT_WEB_CONFIG.connectionPool.timeout
      ),
    },
    openserp: {
      enabled: booleanValue(base?.openserp?.enabled, DEFAULT_WEB_CONFIG.openserp.enabled),
      baseUrl: nonEmptyString(base?.openserp?.baseUrl, DEFAULT_WEB_CONFIG.openserp.baseUrl),
      apiKeyEnv: nonEmptyString(base?.openserp?.apiKeyEnv, DEFAULT_WEB_CONFIG.openserp.apiKeyEnv),
    },
    searxng: {
      enabled: booleanValue(base?.searxng?.enabled, DEFAULT_WEB_CONFIG.searxng.enabled),
      baseUrl: trimString(base?.searxng?.baseUrl, DEFAULT_WEB_CONFIG.searxng.baseUrl),
      defaultEngine: nonEmptyString(
        base?.searxng?.defaultEngine,
        DEFAULT_WEB_CONFIG.searxng.defaultEngine
      ),
    },
    tavily: {
      enabled: booleanValue(base?.tavily?.enabled, DEFAULT_WEB_CONFIG.tavily.enabled),
      baseUrl: nonEmptyString(base?.tavily?.baseUrl, DEFAULT_WEB_CONFIG.tavily.baseUrl),
      apiKeyEnv: nonEmptyString(base?.tavily?.apiKeyEnv, DEFAULT_WEB_CONFIG.tavily.apiKeyEnv),
    },
    serper: {
      enabled: booleanValue(base?.serper?.enabled, DEFAULT_WEB_CONFIG.serper.enabled),
      baseUrl: nonEmptyString(base?.serper?.baseUrl, DEFAULT_WEB_CONFIG.serper.baseUrl),
      apiKeyEnv: nonEmptyString(base?.serper?.apiKeyEnv, DEFAULT_WEB_CONFIG.serper.apiKeyEnv),
    },
  };
}

function normalizeLspReadonlyActions(value: unknown): LspReadonlyAction[] {
  if (!Array.isArray(value)) return [...DEFAULT_SUBAGENT_LSP_ACTIONS];
  const allowed = new Set<LspReadonlyAction>(DEFAULT_SUBAGENT_LSP_ACTIONS);
  const filtered = value.filter(
    (item): item is LspReadonlyAction =>
      typeof item === "string" && allowed.has(item as LspReadonlyAction)
  );
  return [...new Set(filtered)];
}

function normalizeSubagentsConfig(base: SubagentsConfig | undefined): ResolvedSubagentsConfig {
  return {
    enabled: booleanValue(base?.enabled, DEFAULT_SUBAGENTS_CONFIG.enabled),
    maxDepth: nonNegativeInteger(base?.maxDepth, DEFAULT_SUBAGENTS_CONFIG.maxDepth),
    timeoutMs: positiveInteger(base?.timeoutMs, DEFAULT_SUBAGENTS_CONFIG.timeoutMs),
    allowWrite: booleanValue(base?.allowWrite, DEFAULT_SUBAGENTS_CONFIG.allowWrite),
    allowLspTools: booleanValue(base?.allowLspTools, DEFAULT_SUBAGENTS_CONFIG.allowLspTools),
    allowedLspActions: normalizeLspReadonlyActions(base?.allowedLspActions),
    injectDelegationPolicy: booleanValue(
      base?.injectDelegationPolicy,
      DEFAULT_SUBAGENTS_CONFIG.injectDelegationPolicy
    ),
    retry: {
      enabled: booleanValue(base?.retry?.enabled, DEFAULT_SUBAGENTS_CONFIG.retry.enabled),
      maxAttempts: positiveInteger(
        base?.retry?.maxAttempts,
        DEFAULT_SUBAGENTS_CONFIG.retry.maxAttempts
      ),
    },
  };
}

function normalizeLspHookMode(value: unknown): ResolvedToolkitConfig["lsp"]["hook"]["mode"] {
  if (value === "agent_end" || value === "edit_write" || value === "disabled") return value;
  return DEFAULT_CONFIG.lsp.hook.mode;
}

function normalizeLspConfig(base: LspConfig | undefined): ResolvedToolkitConfig["lsp"] {
  const mode = normalizeLspHookMode(base?.hook?.mode);
  const enabled = booleanValue(base?.hook?.enabled, DEFAULT_CONFIG.lsp.hook.enabled);

  return {
    enabled: booleanValue(base?.enabled, DEFAULT_CONFIG.lsp.enabled),
    tool: {
      enabled: booleanValue(base?.tool?.enabled, DEFAULT_CONFIG.lsp.tool.enabled),
      allowMutatingActions: booleanValue(
        base?.tool?.allowMutatingActions,
        DEFAULT_CONFIG.lsp.tool.allowMutatingActions
      ),
    },
    hook: {
      enabled: enabled && mode !== "disabled",
      mode: enabled ? mode : "disabled",
    },
  };
}

function normalizeCommandsConfig(
  base: CommandsConfig | undefined
): ResolvedToolkitConfig["commands"] {
  return {
    enabled: booleanValue(base?.enabled, DEFAULT_CONFIG.commands.enabled),
  };
}

export function mergeConfig(base: ToolkitConfig): ResolvedToolkitConfig {
  return {
    enabled: booleanValue(base.enabled, DEFAULT_CONFIG.enabled),
    subagents: normalizeSubagentsConfig(base.subagents),
    web: normalizeWebConfig(base.web),
    lsp: normalizeLspConfig(base.lsp),
    commands: normalizeCommandsConfig(base.commands),
  };
}
