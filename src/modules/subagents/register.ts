/**
 * Subagents Module Registration
 *
 * Registers:
 * - "subagent" tool — delegates tasks to specialized readonly agents
 * - Developer commands: doctor, list, logs, activity
 * - Event handlers: before_agent_start (delegation policy), session_start, session_shutdown
 *
 * Subagents module registration
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { AgentToolResult } from "@earendil-works/pi-agent-core";
import {
  defineTool,
  type ExtensionAPI,
  type ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { DELEGATION_EXAMPLES, DELEGATION_POLICY } from "../../shared/delegation-policy.ts";
import { resolveCurrentSessionId } from "../../shared/session-identity.ts";
import {
  type CommandsConfig,
  checkSubagentDepth,
  type Details,
  PI_SUBAGENT_CHILD,
  RESULTS_DIR,
  type ResolvedSubagentsConfig,
  SUBAGENT_ERROR_CODES,
  type SubagentState,
} from "../../shared/types.ts";
import { discoverAgents } from "./agents.ts";
import { createActivityPanel } from "./commands/activity.ts";
import { formatDoctorReport, runDoctorChecks } from "./commands/doctor.ts";
import { formatAgentList, getAgentList } from "./commands/list.ts";
import { formatLogs, type LogsOptions } from "./commands/logs.ts";
import { createSubagentExecutor, type SubagentParamsLike } from "./executor.ts";
import { SubagentParams } from "./schemas.ts";

// ============================================================================
// Helpers
// ============================================================================

/**
 * Derive subagent session base directory from parent session file.
 */
function getSubagentSessionRoot(parentSessionFile: string | null): string {
  if (parentSessionFile) {
    const baseName = path.basename(parentSessionFile, ".jsonl");
    const sessionsDir = path.dirname(parentSessionFile);
    return path.join(sessionsDir, baseName);
  }
  return path.join(RESULTS_DIR, "sessions");
}

/**
 * Ensure directory exists and is accessible.
 */
function ensureAccessibleDir(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}

// ============================================================================
// Module Registration
// ============================================================================

export function registerSubagentsModule(
  pi: ExtensionAPI,
  config: ResolvedSubagentsConfig,
  commandsConfig: Required<CommandsConfig> = { enabled: true }
): void {
  // Prevent child processes from registering the subagent tool.
  if (process.env[PI_SUBAGENT_CHILD] === "1") return;

  // Ensure results directory exists
  ensureAccessibleDir(RESULTS_DIR);

  // Check if subagents are disabled
  if (config.enabled === false) {
    console.log("Subagent extension is disabled in config");
    return;
  }

  // Initialize state
  const state: SubagentState = {
    baseCwd: process.cwd(),
    currentSessionId: null,
    lastUiContext: null,
  };

  // Create executor
  const executor = createSubagentExecutor({
    pi,
    state,
    config,
    getSubagentSessionRoot,
    discoverAgents,
  });

  const executeSubagent = (
    id: string,
    params: SubagentParamsLike,
    signal: AbortSignal,
    onUpdate: ((result: AgentToolResult<Details>) => void) | undefined,
    ctx: ExtensionContext
  ): Promise<AgentToolResult<Details>> => {
    // Check recursion depth
    const depthCheck = checkSubagentDepth(config.maxDepth);
    if (depthCheck.blocked) {
      return Promise.resolve({
        content: [
          {
            type: "text",
            text: `Subagent depth exceeded (${depthCheck.depth}/${depthCheck.maxDepth}). Nested subagents are not allowed.`,
          },
        ],
        details: {
          mode: "management",
          results: [],
          error: {
            code: SUBAGENT_ERROR_CODES.SUBAGENT_DEPTH_EXCEEDED,
            message: `Subagent depth exceeded (${depthCheck.depth}/${depthCheck.maxDepth}). Nested subagents are not allowed.`,
          },
        },
      });
    }

    // Collapse UI when executing
    if (ctx.hasUI) {
      ctx.ui.setToolsExpanded(false);
    }

    return executor.execute(id, params, signal, onUpdate, ctx);
  };

  // Define the subagent tool
  const tool = defineTool({
    name: "subagent",
    label: "Subagent",
    description: `Delegate a focused task to a specialized readonly agent.

Available agents:
• explorer - Codebase navigation and file search (readonly)
• researcher - Web research and information synthesis (readonly)
• reviewer - Code review and quality assessment (readonly)
• implementer - Implementation planning (readonly)
• tester - Test planning and strategy (readonly)

Parameters:
• agent: Agent name to use
• task: Task description

Example:
  subagent({ agent: "explorer", task: "Find where authentication is implemented" })`,
    parameters: SubagentParams,
    execute(
      id: string,
      params: SubagentParamsLike,
      signal: AbortSignal,
      onUpdate: ((result: AgentToolResult<Details>) => void) | undefined,
      ctx: ExtensionContext
    ) {
      return executeSubagent(id, params, signal ?? new AbortController().signal, onUpdate, ctx);
    },

    renderCall(args: any, theme: any) {
      const label = `${theme.fg("toolTitle", theme.bold("subagent "))}${theme.fg("accent", args.agent || "?")}`;
      return new Text(label, 0, 0);
    },

    renderResult(result: any, _options: any, theme: any, context: any) {
      const content = result.content
        .filter((item: any): item is { type: "text"; text: string } => item.type === "text")
        .map((item: any) => item.text)
        .join("\n");

      const hasManagedError =
        Boolean(result.details?.error) ||
        Boolean(
          result.details?.results?.some(
            (r: any) => typeof r.exitCode === "number" && r.exitCode !== 0
          )
        );
      const prefix =
        context?.isError || hasManagedError ? theme.fg("error", "✗") : theme.fg("success", "✓");
      const displayText = content || result.details?.error?.message || "(no output)";
      return new Text(`${prefix} ${displayText}`, 0, 0);
    },
  });

  // Register the tool
  pi.registerTool(tool);

  // Register developer commands
  if (commandsConfig.enabled) {
    registerDeveloperCommands(pi);
  }

  // Inject delegation policy into parent agent's system prompt
  pi.on("before_agent_start", async (event) => {
    if (!config.injectDelegationPolicy) return;

    // Only inject into parent agent, not child subagents
    if (process.env[PI_SUBAGENT_CHILD] === "1") return;

    const policy = `${DELEGATION_POLICY}\n\n${DELEGATION_EXAMPLES}`;
    const newPrompt = `${event.systemPrompt}\n\n${policy}`;

    return { systemPrompt: newPrompt };
  });

  // Session lifecycle handlers
  const resetSessionState = (ctx: ExtensionContext) => {
    state.baseCwd = ctx.cwd;
    state.currentSessionId = resolveCurrentSessionId(ctx.sessionManager);
    state.lastUiContext = ctx;
  };

  pi.on("session_start", (_event, ctx) => {
    resetSessionState(ctx);
  });

  pi.on("session_shutdown", () => {
    state.lastUiContext = null;
    state.currentSessionId = null;
  });
}

// ============================================================================
// Developer Commands
// ============================================================================

function registerDeveloperCommands(pi: ExtensionAPI): void {
  // /subagents doctor - Diagnostic check
  pi.registerCommand("doctor", {
    description: "Check subagent configuration, agents, and providers",
    handler: async (_args: string, ctx) => {
      const cwd = ctx.cwd;
      try {
        const report = await runDoctorChecks(cwd);
        const output = formatDoctorReport(report);
        console.log(output);
        ctx.ui.notify(
          `Doctor: ${report.summary.passed} passed, ${report.summary.warnings} warnings, ${report.summary.failed} failed`,
          "info"
        );
      } catch (error) {
        ctx.ui.notify(
          `Doctor check failed: ${error instanceof Error ? error.message : error}`,
          "error"
        );
      }
    },
  });

  // /subagents list - List available agents
  pi.registerCommand("list", {
    description: "List all available subagents",
    handler: async (_args: string, ctx) => {
      try {
        const report = getAgentList(ctx.cwd);
        const output = formatAgentList(report);
        console.log(output);
        ctx.ui.notify(`Found ${report.total} agents`, "info");
      } catch (error) {
        ctx.ui.notify(`List failed: ${error instanceof Error ? error.message : error}`, "error");
      }
    },
  });

  // /subagents logs - Show recent activity logs
  pi.registerCommand("logs", {
    description: "Show recent web tool activity logs",
    handler: async (args: string, ctx) => {
      try {
        const options: LogsOptions = {};
        if (args.includes("--search")) {
          options.type = "search";
        } else if (args.includes("--fetch")) {
          options.type = "fetch";
        }
        const match = args.match(/--limit\s+(\d+)/);
        if (match) {
          options.limit = Number.parseInt(match[1], 10);
        }

        const output = formatLogs(options);
        console.log(output);
        ctx.ui.notify("Activity logs printed to console", "info");
      } catch (error) {
        ctx.ui.notify(`Logs failed: ${error instanceof Error ? error.message : error}`, "error");
      }
    },
  });

  // /subagents activity - Show interactive activity panel (TUI)
  pi.registerCommand("activity", {
    description: "Show interactive activity panel (TUI)",
    handler: async (_args: string, ctx) => {
      try {
        const panel = createActivityPanel({ maxEntries: 15, autoRefresh: true });

        await ctx.ui.custom<void>((tui, _theme, _keybindings, done) => {
          panel.setOnClose(() => done());

          return {
            render: (width: number) => panel.render(width),
            invalidate: () => panel.invalidate(),
            handleInput: (data: string) => {
              panel.handleInput(data);
              tui.requestRender();
            },
            dispose: () => panel.dispose(),
          };
        });

        ctx.ui.notify("Activity panel closed", "info");
      } catch (error) {
        ctx.ui.notify(
          `Activity panel error: ${error instanceof Error ? error.message : error}`,
          "error"
        );
      }
    },
  });
}
