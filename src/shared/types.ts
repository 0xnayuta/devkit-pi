/**
 * Shared type definitions for devkit-pi.
 */

import * as os from "node:os";
import * as path from "node:path";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

// ============================================================================
// Basic Types
// ============================================================================

export type BuiltinSubagentName = "explorer" | "researcher" | "reviewer" | "implementer" | "tester";

export type DebugLevel = false | "minimal" | "verbose";

export interface MaxOutputConfig {
  bytes?: number;
  lines?: number;
}

export interface Usage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  cost: number;
  turns: number;
}

// ============================================================================
// Agent Definition
// ============================================================================

export interface AgentDefinition {
  name: string;
  description: string;
  readonly: boolean;
  tools: string[];
  prompt: string;
  source: "builtin" | "user" | "project";
  filePath: string;
}

// ============================================================================
// Subagent Error Codes
// ============================================================================

export const SUBAGENT_ERROR_CODES = {
  INVALID_INPUT: "INVALID_INPUT",
  SUBAGENTS_DISABLED: "SUBAGENTS_DISABLED",
  UNKNOWN_AGENT: "UNKNOWN_AGENT",
  SUBAGENT_DISABLED: "SUBAGENT_DISABLED",
  SUBAGENT_DEPTH_EXCEEDED: "SUBAGENT_DEPTH_EXCEEDED",
  SUBAGENT_TIMEOUT: "SUBAGENT_TIMEOUT",
  SUBAGENT_FAILED: "SUBAGENT_FAILED",
  SUBAGENT_OUTPUT_TRUNCATED: "SUBAGENT_OUTPUT_TRUNCATED",
} as const;

export type SubagentErrorCode = (typeof SUBAGENT_ERROR_CODES)[keyof typeof SUBAGENT_ERROR_CODES];

// ============================================================================
// Results
// ============================================================================

export interface SubagentSuccessResult {
  ok: true;
  output: string;
  usage?: Usage;
}

export interface SubagentErrorResult {
  ok: false;
  error: {
    code: string;
    message: string;
  };
}

export type SubagentResult = SubagentSuccessResult | SubagentErrorResult;

export interface SingleResult {
  agent: string;
  task: string;
  exitCode: number;
  usage: Usage;
  error?: string;
  sessionFile?: string;
  output?: string;
  /** Display items from assistant messages (tool calls, text blocks). */
  displayItems?: Array<
    | { type: "text"; text: string }
    | { type: "toolCall"; name: string; args: Record<string, unknown> }
  >;
  /** Why the execution was terminated. Present when timedOut === true. */
  timeoutReason?: "runtime" | "idle";
}

// ---------------------------------------------------------------------------
// Streaming display (passed via onUpdate during execution)
// ---------------------------------------------------------------------------

export interface StreamingDisplay {
  displayItems: Array<
    | { type: "text"; text: string }
    | { type: "toolCall"; name: string; args: Record<string, unknown> }
  >;
  usage: Usage;
  turnCount: number;
}

// ============================================================================
// Execution
// ============================================================================

export type DetailsMode = "single" | "management";

export interface Details {
  mode: DetailsMode;
  runId?: string;
  results: SingleResult[];
  // Optional structured result for error handling
  error?: {
    code: SubagentErrorCode;
    message: string;
  };
  /** Streaming display state (present during execution, absent in final result). */
  streaming?: StreamingDisplay;
}

// TextContent type (copied from pi-agent-core for local use)
export interface TextContent {
  type: "text";
  text: string;
}

// ImageContent type (copied from pi-agent-core for local use)
export interface ImageContent {
  type: "image";
  data: string;
  mimeType?: string;
}

// ============================================================================
// State
// ============================================================================

export interface SubagentState {
  baseCwd: string;
  currentSessionId: string | null;
  lastUiContext: ExtensionContext | null;
}

// ============================================================================
// Config
// ============================================================================

export type WebSearchProviderName =
  | "auto"
  | "brave"
  | "ddgs"
  | "openserp"
  | "searxng"
  | "tavily"
  | "serper";

export interface OpenSerpProviderConfig {
  enabled?: boolean;
  baseUrl?: string;
  apiKeyEnv?: string;
}

export interface SearxngProviderConfig {
  enabled?: boolean;
  baseUrl?: string;
  defaultEngine?: string;
}

export interface ApiKeyProviderConfig {
  enabled?: boolean;
  baseUrl?: string;
  apiKeyEnv?: string;
}

export interface CacheConfig {
  enabled?: boolean;
  maxEntries?: number;
  ttlMs?: number;
}

export interface ConcurrencyConfig {
  maxConcurrent?: number;
  maxQueueSize?: number;
}

export interface ConnectionPoolConfig {
  maxSockets?: number;
  maxFreeSockets?: number;
  timeout?: number;
}

export interface WebConfig {
  enabled?: boolean;
  provider?: WebSearchProviderName;
  providerPriority?: Exclude<WebSearchProviderName, "auto">[];
  timeoutMs?: number;
  maxResponseBytes?: number;
  maxContentChars?: number;
  maxResults?: number;
  enableJinaFallback?: boolean;
  jinaTimeoutMs?: number;
  maxStoredResults?: number;
  maxStoredContentChars?: number;
  /** Phase 4: allow fetching from localhost / private IPs. Default: false. */
  allowPrivateNetwork?: boolean;
  /** Phase 5: which conditions trigger Jina Reader fallback. Default: ["short-html", "js-heavy-html"]. */
  jinaTriggers?: string[];
  debug?: DebugLevel;
  cache?: CacheConfig;
  concurrency?: ConcurrencyConfig;
  connectionPool?: ConnectionPoolConfig;
  openserp?: OpenSerpProviderConfig;
  searxng?: SearxngProviderConfig;
  brave?: ApiKeyProviderConfig;
  tavily?: ApiKeyProviderConfig;
  serper?: ApiKeyProviderConfig;
}

export interface SubagentRetryConfig {
  enabled?: boolean;
  maxAttempts?: number;
}

export type LspReadonlyAction =
  | "definition"
  | "references"
  | "hover"
  | "signature"
  | "symbols"
  | "diagnostics"
  | "workspace-diagnostics"
  | "servers";

export interface SubagentsConfig {
  enabled?: boolean;
  maxDepth?: number;
  timeoutMs?: number;
  /** Maximum idle time (ms) since the last valid activity event before the child is terminated. */
  idleTimeoutMs?: number;
  allowWrite?: boolean;
  allowLspTools?: boolean;
  allowedLspActions?: LspReadonlyAction[];
  retry?: SubagentRetryConfig;
  /**
   * Inject delegation policy + few-shot examples into the parent agent's
   * system prompt. Guides the model to delegate focused tasks to specialized
   * subagents instead of handling everything directly.
   *
   * Default: true
   */
  injectDelegationPolicy?: boolean;
}

export interface LspToolConfig {
  enabled?: boolean;
  allowMutatingActions?: boolean;
}

export type LspHookMode = "agent_end" | "edit_write" | "disabled";

export interface LspHookConfig {
  enabled?: boolean;
  mode?: LspHookMode;
}

export interface LspConfig {
  enabled?: boolean;
  tool?: LspToolConfig;
  hook?: LspHookConfig;
}

export interface CommandsConfig {
  enabled?: boolean;
}

export interface ConvertContentConfig {
  enabled?: boolean;
  provider?: "markitdown";
  command?: string;
  timeoutMs?: number;
  maxResponseBytes?: number;
  maxContentChars?: number;
  allowPrivateNetwork?: boolean;
}

export interface ToolkitConfig {
  enabled?: boolean;
  subagents?: SubagentsConfig;
  web?: WebConfig;
  lsp?: LspConfig;
  commands?: CommandsConfig;
  convertContent?: ConvertContentConfig;
}

export type ResolvedSubagentsConfig = Required<Omit<SubagentsConfig, "retry">> & {
  retry: Required<SubagentRetryConfig>;
};

export type ResolvedWebConfig = Required<
  Omit<
    WebConfig,
    | "openserp"
    | "searxng"
    | "brave"
    | "tavily"
    | "serper"
    | "cache"
    | "concurrency"
    | "connectionPool"
  >
> & {
  openserp: Required<OpenSerpProviderConfig>;
  searxng: Required<SearxngProviderConfig>;
  brave: Required<ApiKeyProviderConfig>;
  tavily: Required<ApiKeyProviderConfig>;
  serper: Required<ApiKeyProviderConfig>;
  cache: Required<CacheConfig>;
  concurrency: Required<ConcurrencyConfig>;
  connectionPool: Required<ConnectionPoolConfig>;
};

export type RequiredLspHookConfig = Required<LspHookConfig>;

export type ResolvedConvertContentConfig = Required<ConvertContentConfig>;

export type ResolvedLspConfig = Required<Omit<LspConfig, "tool" | "hook">> & {
  tool: Required<LspToolConfig>;
  hook: RequiredLspHookConfig;
};

export interface ResolvedToolkitConfig {
  enabled: boolean;
  subagents: ResolvedSubagentsConfig;
  web: ResolvedWebConfig;
  lsp: ResolvedLspConfig;
  commands: Required<CommandsConfig>;
  convertContent: ResolvedConvertContentConfig;
}

// ============================================================================
// Constants
// ============================================================================

export const DEFAULT_SUBAGENT_MAX_DEPTH = 1;
export const DEFAULT_TIMEOUT_MS = 300000;

export const TEMP_ROOT_DIR = path.join(os.tmpdir(), `devkit-pi-${resolveTempScopeId()}`);
export const RESULTS_DIR = path.join(TEMP_ROOT_DIR, "results");

export const SUBAGENT_ACTIONS = ["list", "get", "doctor"] as const;

export const PI_SUBAGENT_CHILD = "PI_SUBAGENT_CHILD";
export const PI_SUBAGENT_DEPTH = "PI_SUBAGENT_DEPTH";
export const PI_SUBAGENT_MAX_DEPTH = "PI_SUBAGENT_MAX_DEPTH";
export const PI_SUBAGENT_ALLOW_LSP = "PI_SUBAGENT_ALLOW_LSP";
export const PI_SUBAGENT_LSP_ACTIONS = "PI_SUBAGENT_LSP_ACTIONS";

export const DEFAULT_FORK_PREAMBLE =
  "You are a delegated subagent running from a fork of the parent session. " +
  "Treat the inherited conversation as reference-only context, not a live thread to continue. " +
  "Do not continue or answer prior messages as if they are waiting for a reply. " +
  "Your sole job is to execute the task below and return a focused result for that task using your tools.";

// ============================================================================
// Recursion Depth Guard
// ============================================================================

export function normalizeMaxSubagentDepth(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isInteger(parsed) && parsed >= 0) return parsed;
  }
  return undefined;
}

export function resolveCurrentMaxSubagentDepth(configMaxDepth?: number): number {
  return (
    normalizeMaxSubagentDepth(process.env[PI_SUBAGENT_MAX_DEPTH]) ??
    normalizeMaxSubagentDepth(configMaxDepth) ??
    DEFAULT_SUBAGENT_MAX_DEPTH
  );
}

export function checkSubagentDepth(configMaxDepth?: number): {
  blocked: boolean;
  depth: number;
  maxDepth: number;
} {
  const depth = Number(process.env[PI_SUBAGENT_DEPTH] ?? "0");
  const maxDepth = resolveCurrentMaxSubagentDepth(configMaxDepth);
  const blocked = Number.isFinite(depth) && depth >= maxDepth;
  return { blocked, depth, maxDepth };
}

export function getSubagentDepthEnv(maxDepth?: number): Record<string, string> {
  const parentDepth = Number(process.env[PI_SUBAGENT_DEPTH] ?? "0");
  const nextDepth = Number.isFinite(parentDepth) ? parentDepth + 1 : 1;
  return {
    [PI_SUBAGENT_DEPTH]: String(nextDepth),
    [PI_SUBAGENT_MAX_DEPTH]: String(
      normalizeMaxSubagentDepth(maxDepth) ?? resolveCurrentMaxSubagentDepth()
    ),
  };
}

// ============================================================================
// Temp Scope
// ============================================================================

function sanitizeTempScopeSegment(value: string): string {
  const sanitized = value
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return sanitized || "unknown";
}

export function resolveTempScopeId(options?: {
  env?: NodeJS.ProcessEnv;
  getuid?: (() => number) | undefined;
  userInfo?: (() => { username?: string | null }) | undefined;
  homedir?: (() => string) | undefined;
}): string {
  const env = options?.env ?? process.env;
  const getuid =
    options && Object.hasOwn(options, "getuid") ? options.getuid : process.getuid?.bind(process);
  if (typeof getuid === "function") {
    return `uid-${getuid()}`;
  }

  for (const key of ["USERNAME", "USER", "LOGNAME"] as const) {
    const value = env[key];
    if (value) return `user-${sanitizeTempScopeSegment(value)}`;
  }

  const homedir = env.USERPROFILE ?? env.HOME;
  if (homedir) return `home-${sanitizeTempScopeSegment(homedir)}`;

  return "shared";
}

// ============================================================================
// Output
// ============================================================================

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

interface TruncationResult {
  text: string;
  truncated: boolean;
  originalBytes?: number;
  originalLines?: number;
  keptBytes?: number;
  keptLines?: number;
}

export const DEFAULT_MAX_OUTPUT: Required<MaxOutputConfig> = {
  bytes: 200 * 1024,
  lines: 5000,
};

export function truncateOutput(
  output: string,
  config: Required<MaxOutputConfig>
): TruncationResult {
  const lines = output.split("\n");
  const bytes = Buffer.byteLength(output, "utf-8");

  if (bytes <= config.bytes && lines.length <= config.lines) {
    return { text: output, truncated: false };
  }

  let truncatedLines = lines;
  if (lines.length > config.lines) {
    truncatedLines = lines.slice(0, config.lines);
  }

  let result = truncatedLines.join("\n");
  if (Buffer.byteLength(result, "utf-8") > config.bytes) {
    let low = 0;
    let high = result.length;
    while (low < high) {
      const mid = Math.floor((low + high + 1) / 2);
      if (Buffer.byteLength(result.slice(0, mid), "utf-8") <= config.bytes) {
        low = mid;
      } else {
        high = mid - 1;
      }
    }
    result = result.slice(0, low);
  }

  const keptLines = result.split("\n").length;
  const keptBytes = Buffer.byteLength(result);
  return {
    text: `[TRUNCATED: showing first ${keptLines} of ${lines.length} lines, ${formatBytes(keptBytes)} of ${formatBytes(bytes)}]\n${result}`,
    truncated: true,
    originalBytes: bytes,
    originalLines: lines.length,
    keptBytes,
    keptLines,
  };
}
