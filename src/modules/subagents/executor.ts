/**
 * Minimal subagent executor
 * Only supports: foreground single execution
 */

import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import type { AgentToolResult } from "@earendil-works/pi-agent-core";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
  checkSubagentDepth,
  DEFAULT_MAX_OUTPUT,
  type Details,
  PI_SUBAGENT_ALLOW_LSP,
  PI_SUBAGENT_CHILD,
  PI_SUBAGENT_DEPTH,
  PI_SUBAGENT_LSP_ACTIONS,
  PI_SUBAGENT_MAX_DEPTH,
  type ResolvedSubagentsConfig,
  type SingleResult,
  SUBAGENT_ERROR_CODES,
  type SubagentErrorCode,
  type SubagentState,
  truncateOutput,
  type Usage,
} from "../../shared/types.ts";
import type { AgentConfig, AgentScope } from "./agents.ts";
import { collectOutput } from "./collect-output.ts";
import { type DisplayItem, type RunSyncResult, runSync, type StreamingState } from "./execution.ts";
import { buildSubagentChildArgs, cleanupTempDir } from "./pi-args.ts";
import {
  getPreferredPiJsonStreamProfiles,
  notePiJsonStreamProfileSuccess,
  notePiJsonStreamProfileUnsupported,
  shouldFallbackFromCompactJsonStreamFailure,
} from "./pi-json-stream.ts";
import { buildChildPrompt } from "./prompt-runtime.ts";
import { sanitizeOutput } from "./sanitize.ts";

export interface SubagentParamsLike {
  agent: string;
  task: string;
}

interface ExecutorDeps {
  pi: ExtensionAPI;
  state: SubagentState;
  config: ResolvedSubagentsConfig;
  getSubagentSessionRoot: (parentSessionFile: string | null) => string;
  discoverAgents: (cwd: string, scope: AgentScope) => { agents: AgentConfig[] };
  runSyncImpl?: typeof runSync;
}

function findAgent(agents: AgentConfig[], name: string): AgentConfig | undefined {
  return agents.find((a) => a.name === name);
}

function loadAgent(
  agentName: string,
  cwd: string,
  deps: ExecutorDeps
): AgentToolResult<Details> | AgentConfig {
  const scope: AgentScope = "both";
  const discovered = deps.discoverAgents(cwd, scope).agents;
  const agent = findAgent(discovered, agentName);

  if (!agent) {
    return {
      content: [
        {
          type: "text",
          text: `Unknown agent: ${agentName}. Available agents: ${discovered.map((a) => a.name).join(", ")}`,
        },
      ],
      details: {
        mode: "single",
        results: [],
        error: {
          code: SUBAGENT_ERROR_CODES.UNKNOWN_AGENT,
          message: `Unknown agent: ${agentName}. Available agents: ${discovered.map((a) => a.name).join(", ")}`,
        },
      },
    };
  }

  return agent;
}

export function filterToolsForReadonly(
  agent: AgentConfig,
  config: ResolvedSubagentsConfig
): string[] {
  const readonlyTools = new Set([
    "read",
    "grep",
    "find",
    "ls",
    "web_search",
    "fetch_content",
    "get_search_content",
    "convert_content",
  ]);
  if (config.allowLspTools && config.allowedLspActions.length > 0) {
    readonlyTools.add("lsp");
  }

  const configuredTools = agent.tools ?? [];

  if (agent.readonly) {
    return configuredTools.filter((tool) => readonlyTools.has(tool));
  }

  if (!config.allowWrite) {
    return configuredTools.filter((tool) => readonlyTools.has(tool));
  }

  return configuredTools;
}

const TRANSIENT_SUBAGENT_ERROR_PATTERN =
  /(?:internal_server_error|stream error|INTERNAL_ERROR|ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|rate limit|rate_limit|overloaded|temporarily unavailable|timeout)/i;

function isTransientSubagentError(text: string | undefined): boolean {
  return Boolean(text && TRANSIENT_SUBAGENT_ERROR_PATTERN.test(text));
}

function readSessionDiagnostics(sessionFile: string): { error?: string; partialOutput?: string } {
  try {
    if (!fs.existsSync(sessionFile)) return {};
    const collected = collectOutput(fs.readFileSync(sessionFile, "utf-8"));
    return {
      error: collected.error,
      partialOutput: collected.partialOutput ?? (!collected.final ? collected.output : undefined),
    };
  } catch {
    return {};
  }
}

function getUiConfirm(
  ui: ExtensionContext["ui"] | undefined
): ((message: string) => Promise<boolean>) | null {
  const candidate = (ui as unknown as { confirm?: unknown } | undefined)?.confirm;
  return typeof candidate === "function"
    ? (message: string) =>
        Promise.resolve(
          (candidate as (message: string) => boolean | Promise<boolean>)(message)
        ).then(Boolean)
    : null;
}

async function shouldAllowProjectAgentExecution(
  agent: AgentConfig,
  ctx: ExtensionContext,
  config: ResolvedSubagentsConfig
): Promise<boolean> {
  if (agent.source !== "project") return true;
  if (config.projectAgentPolicy === "allow") return true;

  const confirm = getUiConfirm(ctx.ui);
  if (ctx.hasUI && confirm) {
    return confirm(
      `Allow execution of project-local agent '${agent.name}' from ${agent.filePath}?`
    );
  }

  return config.nonInteractivePolicy === "allow";
}

function mergeUniqueText(...values: Array<string | undefined>): string | undefined {
  const parts: string[] = [];
  for (const value of values) {
    const text = value?.trim();
    if (text && !parts.includes(text)) parts.push(text);
  }
  return parts.length > 0 ? parts.join("\n") : undefined;
}

function formatSubagentFailure(input: {
  exitCode: number;
  error?: string;
  partialOutput?: string;
  output?: string;
  sessionFile: string;
  attempts: number;
}): string {
  const sections = [`Subagent failed with exit code ${input.exitCode}.`];
  if (input.attempts > 1) sections.push(`Attempts: ${input.attempts}.`);
  if (input.error) sections.push(`Error:\n${input.error}`);

  const partial =
    input.partialOutput && input.partialOutput !== input.error ? input.partialOutput : undefined;
  const fallback =
    !partial && input.output && input.output !== input.error ? input.output : undefined;
  if (partial) sections.push(`Partial output:\n${partial}`);
  else if (fallback) sections.push(`Last captured output:\n${fallback}`);

  sections.push(`Session file:\n${input.sessionFile}`);
  return sections.join("\n\n");
}

export function createSubagentExecutor(deps: ExecutorDeps): {
  execute: (
    id: string,
    params: SubagentParamsLike,
    signal: AbortSignal,
    onUpdate: ((r: AgentToolResult<Details>) => void) | undefined,
    ctx: ExtensionContext
  ) => Promise<AgentToolResult<Details>>;
} {
  const execute = async (
    _id: string,
    params: SubagentParamsLike,
    signal: AbortSignal,
    onUpdate: ((r: AgentToolResult<Details>) => void) | undefined,
    ctx: ExtensionContext
  ): Promise<AgentToolResult<Details>> => {
    const cwd = ctx.cwd;
    const { depth, maxDepth } = checkSubagentDepth(deps.config.maxDepth);

    // Check if subagents are disabled
    if (!deps.config.enabled) {
      return {
        content: [{ type: "text", text: "Subagents are disabled in configuration" }],
        details: {
          mode: "single",
          results: [],
          error: {
            code: SUBAGENT_ERROR_CODES.SUBAGENTS_DISABLED,
            message: "Subagents are disabled in configuration",
          },
        },
      };
    }

    // Check depth
    if (depth >= maxDepth) {
      return {
        content: [
          {
            type: "text",
            text: `Maximum subagent depth (${maxDepth}) exceeded. Subagents cannot call other subagents.`,
          },
        ],
        details: {
          mode: "single",
          results: [],
          error: {
            code: SUBAGENT_ERROR_CODES.SUBAGENT_DEPTH_EXCEEDED,
            message: `Maximum subagent depth (${maxDepth}) exceeded. Subagents cannot call other subagents.`,
          },
        },
      };
    }

    // Validate inputs
    if (!params.agent) {
      return {
        content: [{ type: "text", text: "Missing required parameter: agent" }],
        details: {
          mode: "single",
          results: [],
          error: {
            code: SUBAGENT_ERROR_CODES.INVALID_INPUT,
            message: "Missing required parameter: agent",
          },
        },
      };
    }

    if (!params.task) {
      return {
        content: [{ type: "text", text: "Missing required parameter: task" }],
        details: {
          mode: "single",
          results: [],
          error: {
            code: SUBAGENT_ERROR_CODES.INVALID_INPUT,
            message: "Missing required parameter: task",
          },
        },
      };
    }

    // Load and validate agent
    const agentResult = loadAgent(params.agent, cwd, deps);
    if (!("name" in agentResult)) {
      return agentResult;
    }

    const agent = agentResult;

    if (!(await shouldAllowProjectAgentExecution(agent, ctx, deps.config))) {
      const message =
        deps.config.nonInteractivePolicy === "deny"
          ? `Project-local agent execution denied by non-interactive policy: ${agent.name}`
          : `Project-local agent execution cancelled: ${agent.name}`;
      return {
        content: [{ type: "text", text: message }],
        details: {
          mode: "single",
          results: [],
          error: {
            code: SUBAGENT_ERROR_CODES.SUBAGENT_DISABLED,
            message,
          },
        },
      };
    }

    const runId = randomUUID().slice(0, 8);
    const parentSessionFile = ctx.sessionManager.getSessionFile() ?? null;

    // Determine tools based on readonly status
    const tools = filterToolsForReadonly(agent, deps.config);

    // Build child prompt
    const systemPrompt = buildChildPrompt({
      agentName: agent.name,
      agentDescription: agent.description,
      agentSystemPrompt: agent.systemPrompt,
      agentTools: tools,
      task: params.task,
      parentMessages: [],
      childDepth: depth + 1,
      maxDepth: maxDepth,
      isReadonly: agent.readonly || !deps.config.allowWrite,
    });

    // Set up environment
    const childEnv: Record<string, string> = {
      ...process.env,
      [PI_SUBAGENT_CHILD]: "1",
      [PI_SUBAGENT_DEPTH]: String(depth + 1),
      [PI_SUBAGENT_MAX_DEPTH]: String(maxDepth),
      [PI_SUBAGENT_ALLOW_LSP]: deps.config.allowLspTools ? "1" : "0",
      [PI_SUBAGENT_LSP_ACTIONS]: deps.config.allowedLspActions.join(","),
    };

    // Build session directory
    const sessionRoot = deps.getSubagentSessionRoot(parentSessionFile);
    const sessionDir = path.join(sessionRoot, runId);

    try {
      fs.mkdirSync(sessionDir, { recursive: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      return {
        content: [{ type: "text", text: `Failed to create session directory: ${message}` }],
        details: {
          mode: "single",
          results: [],
          error: {
            code: SUBAGENT_ERROR_CODES.SUBAGENT_FAILED,
            message: `Failed to create session directory: ${message}`,
          },
        },
      };
    }

    const maxAttempts = deps.config.retry.enabled ? deps.config.retry.maxAttempts : 1;
    const timeoutMs = deps.config.timeoutMs;
    const idleTimeoutMs = deps.config.idleTimeoutMs;
    const runSyncImpl = deps.runSyncImpl ?? runSync;

    let exitCode = 1;
    let output = "";
    let usage: Usage | undefined;
    let providerError: string | undefined;
    let partialOutput: string | undefined;
    let sessionFile = path.join(sessionDir, "session.jsonl");
    let attemptsUsed = 0;
    let finalDisplayItems: DisplayItem[] | undefined;
    let finalTimeoutReason: "runtime" | "idle" | undefined;
    let outputLimitExceeded: RunSyncResult["outputLimitExceeded"];

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      attemptsUsed = attempt;
      sessionFile = path.join(
        sessionDir,
        attempt === 1 ? "session.jsonl" : `session-attempt-${attempt}.jsonl`
      );

      const jsonStreamProfiles = getPreferredPiJsonStreamProfiles();

      for (const jsonStreamProfile of jsonStreamProfiles) {
        const piArgs = buildSubagentChildArgs({
          mode: "json",
          jsonStreamProfile,
          systemPrompt,
          task: params.task,
          cwd,
          sessionFile,
          model: agent.model,
          tools,
          env: childEnv,
        });

        try {
          const result: RunSyncResult = await runSyncImpl(cwd, piArgs.args, {
            signal,
            timeoutMs,
            idleTimeoutMs,
            env: piArgs.env,
            onStreamingUpdate: (state: StreamingState) => {
              if (!onUpdate) return;
              onUpdate({
                content: [
                  {
                    type: "text",
                    text: state.lastAssistantText || "(running...)",
                  },
                ],
                details: {
                  mode: "single",
                  results: [],
                  streaming: {
                    displayItems: buildDisplayItems(state),
                    usage: state.usage,
                    turnCount: state.usage.turns,
                  },
                },
              });
            },
          });

          if (
            jsonStreamProfile === "compact" &&
            shouldFallbackFromCompactJsonStreamFailure({
              exitCode: result.exitCode,
              output: result.output,
              error: result.error,
              partialOutput: result.partialOutput,
            })
          ) {
            notePiJsonStreamProfileUnsupported(jsonStreamProfile);
            continue;
          }

          if (jsonStreamProfile === "compact") {
            notePiJsonStreamProfileSuccess(jsonStreamProfile);
          }

          exitCode = result.exitCode;
          output = result.output || "";
          usage = result.usage;
          providerError = result.error;
          partialOutput = result.partialOutput;
          finalDisplayItems = result.displayItems;
          finalTimeoutReason = result.timeoutReason;
          outputLimitExceeded = result.outputLimitExceeded;
          if (result.outputLimitExceeded) {
            output =
              result.output ||
              "Subagent child output exceeded the configured hard limit and was stopped.";
            providerError = output;
          } else if (result.timedOut) {
            if (result.timeoutReason === "idle") {
              output = `Subagent timed out after ${idleTimeoutMs}ms without activity.`;
            } else {
              output = `Subagent exceeded maximum runtime after ${timeoutMs}ms.`;
            }
            providerError = output;
          } else if (result.cancelled && signal.aborted) {
            output = "Subagent execution was cancelled by user.";
            providerError = output;
          }
          break;
        } catch (error) {
          if (error instanceof Error && error.name === "AbortError") {
            if (signal.aborted) {
              output = "Subagent execution was cancelled by user.";
            } else {
              exitCode = 124;
              output = `Subagent timed out after ${timeoutMs}ms.`;
              providerError = output;
            }
          } else {
            const message = error instanceof Error ? error.message : String(error);
            output = `Subagent execution failed: ${message}`;
            providerError = output;
          }
          break;
        } finally {
          cleanupTempDir(piArgs.tempDir);
        }
      }

      if (exitCode !== 0) {
        const sessionDiagnostics = readSessionDiagnostics(sessionFile);
        providerError = mergeUniqueText(providerError, sessionDiagnostics.error);
        partialOutput = mergeUniqueText(partialOutput, sessionDiagnostics.partialOutput);
      }

      const retrySignalText = mergeUniqueText(providerError, output, partialOutput);
      if (
        exitCode !== 0 &&
        attempt < maxAttempts &&
        !signal.aborted &&
        exitCode !== 124 &&
        isTransientSubagentError(retrySignalText)
      ) {
        continue;
      }

      break;
    }

    if (exitCode !== 0) {
      output = formatSubagentFailure({
        exitCode,
        error: providerError,
        partialOutput,
        output,
        sessionFile,
        attempts: attemptsUsed,
      });
    }

    // Determine error code if execution failed
    let errorCode: SubagentErrorCode | undefined;
    if (outputLimitExceeded) {
      errorCode = SUBAGENT_ERROR_CODES.SUBAGENT_OUTPUT_TRUNCATED;
    } else if (exitCode === 124) {
      errorCode = SUBAGENT_ERROR_CODES.SUBAGENT_TIMEOUT;
    } else if (exitCode !== 0) {
      errorCode = SUBAGENT_ERROR_CODES.SUBAGENT_FAILED;
    }

    // Sanitize output
    const sanitizedOutput = sanitizeOutput(output);

    // Truncate if needed
    const truncationResult = truncateOutput(sanitizedOutput, DEFAULT_MAX_OUTPUT);

    // Build result
    const singleResult: SingleResult = {
      agent: agent.name,
      task: params.task,
      exitCode,
      usage: usage || { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, turns: 0 },
      error: exitCode !== 0 ? sanitizedOutput : undefined,
      sessionFile,
      output: sanitizedOutput,
      displayItems: finalDisplayItems,
      timeoutReason: finalTimeoutReason,
    };

    // Determine if truncation occurred
    let truncationError:
      | { code: typeof SUBAGENT_ERROR_CODES.SUBAGENT_OUTPUT_TRUNCATED; message: string }
      | undefined;
    if (truncationResult.truncated) {
      truncationError = {
        code: SUBAGENT_ERROR_CODES.SUBAGENT_OUTPUT_TRUNCATED,
        message: `Output truncated: showing ${truncationResult.keptLines} of ${truncationResult.originalLines} lines`,
      };
    }

    const details: Details = {
      mode: "single",
      runId,
      results: [singleResult],
    };

    // Add error info if execution failed
    if (errorCode) {
      details.error = {
        code: errorCode,
        message: sanitizedOutput,
      };
    }

    if (exitCode !== 0) {
      return {
        content: [{ type: "text", text: sanitizedOutput }],
        details,
      };
    }

    // Add truncation warning if applicable
    if (truncationError) {
      details.error = truncationError;
    }

    return {
      content: [{ type: "text", text: truncationResult.text }],
      details,
    };
  };

  return { execute };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build display items from a streaming state snapshot.
 * Deduplicates: only emits items not already sent in a previous snapshot.
 * For simplicity, we rebuild the full list each time (the TUI replaces
 * the display in-place, so duplicates are not visible).
 */
function buildDisplayItems(
  state: StreamingState
): Array<
  { type: "text"; text: string } | { type: "toolCall"; name: string; args: Record<string, unknown> }
> {
  const items: Array<
    | { type: "text"; text: string }
    | { type: "toolCall"; name: string; args: Record<string, unknown> }
  > = [];

  // Add tool calls from the streaming state
  for (const tc of state.toolCalls) {
    items.push({ type: "toolCall", name: tc.name, args: tc.args });
  }

  // Add the latest assistant text
  if (state.lastAssistantText) {
    items.push({ type: "text", text: state.lastAssistantText });
  }

  return items;
}
