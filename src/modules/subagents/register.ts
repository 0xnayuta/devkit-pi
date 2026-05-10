/**
 * Subagents Module Registration
 *
 * Registers:
 * - "subagent" tool — delegates tasks to specialized readonly agents
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
  getMarkdownTheme,
} from "@earendil-works/pi-coding-agent";
import { Container, Markdown, Spacer, Text } from "@earendil-works/pi-tui";
import { DELEGATION_EXAMPLES, DELEGATION_POLICY } from "../../shared/delegation-policy.ts";
import { resolveCurrentSessionId } from "../../shared/session-identity.ts";
import {
  checkSubagentDepth,
  type Details,
  PI_SUBAGENT_CHILD,
  RESULTS_DIR,
  type ResolvedSubagentsConfig,
  type SingleResult,
  type StreamingDisplay,
  SUBAGENT_ERROR_CODES,
  type SubagentState,
  type Usage,
} from "../../shared/types.ts";
import { discoverAgents } from "./agents.ts";
import { createSubagentExecutor, type SubagentParamsLike } from "./executor.ts";
import { SubagentParams } from "./schemas.ts";

// ============================================================================
// Display helpers
// ============================================================================

function formatTokens(count: number): string {
  if (count < 1000) return count.toString();
  if (count < 10000) return `${(count / 1000).toFixed(1)}k`;
  if (count < 1000000) return `${Math.round(count / 1000)}k`;
  return `${(count / (1000 * 1000)).toFixed(1)}M`;
}

function formatUsageStats(usage: Usage): string {
  const parts: string[] = [];
  if (usage.turns) parts.push(`${usage.turns} turn${usage.turns > 1 ? "s" : ""}`);
  if (usage.input) parts.push(`↑${formatTokens(usage.input)}`);
  if (usage.output) parts.push(`↓${formatTokens(usage.output)}`);
  if (usage.cacheRead) parts.push(`R${formatTokens(usage.cacheRead)}`);
  if (usage.cacheWrite) parts.push(`W${formatTokens(usage.cacheWrite)}`);
  if (usage.cost) parts.push(`$${usage.cost.toFixed(4)}`);
  return parts.join(" ");
}

function formatToolCall(
  name: string,
  args: Record<string, unknown>,
  fg: (color: string, text: string) => string
): string {
  switch (name) {
    case "bash": {
      const command = (args.command as string) || "...";
      const preview = command.length > 60 ? `${command.slice(0, 60)}...` : command;
      return fg("muted", "$ ") + fg("toolOutput", preview);
    }
    case "read": {
      const filePath = (args.file_path || args.path || "...") as string;
      return fg("muted", "read ") + fg("accent", filePath);
    }
    case "write": {
      const filePath = (args.file_path || args.path || "...") as string;
      const content = (args.content || "") as string;
      const lines = content.split("\n").length;
      let text = fg("muted", "write ") + fg("accent", filePath);
      if (lines > 1) text += fg("dim", ` (${lines} lines)`);
      return text;
    }
    case "edit": {
      const filePath = (args.file_path || args.path || "...") as string;
      return fg("muted", "edit ") + fg("accent", filePath);
    }
    case "ls": {
      const p = (args.path || ".") as string;
      return fg("muted", "ls ") + fg("accent", p);
    }
    case "find": {
      const pattern = (args.pattern || "*") as string;
      return fg("muted", "find ") + fg("accent", pattern);
    }
    case "grep": {
      const pattern = (args.pattern || "") as string;
      return fg("muted", "grep ") + fg("accent", `/${pattern}/`);
    }
    default: {
      const argsStr = JSON.stringify(args);
      const preview = argsStr.length > 50 ? `${argsStr.slice(0, 50)}...` : argsStr;
      return fg("accent", name) + fg("dim", ` ${preview}`);
    }
  }
}

type RenderItem =
  | { type: "text"; text: string }
  | { type: "toolCall"; name: string; args: Record<string, unknown> };

function renderDisplayItems(
  items: RenderItem[],
  fg: (color: string, text: string) => string,
  limit?: number
): string {
  const toShow = limit ? items.slice(-limit) : items;
  const skipped = limit && items.length > limit ? items.length - limit : 0;
  let text = "";
  if (skipped > 0) text += fg("muted", `... ${skipped} earlier items\n`);
  for (const item of toShow) {
    if (item.type === "text") {
      const preview = item.text.split("\n").slice(0, 3).join("\n");
      text += `${fg("toolOutput", preview)}\n`;
    } else {
      text += `${fg("muted", "→ ") + formatToolCall(item.name, item.args, fg)}\n`;
    }
  }
  return text.trimEnd();
}

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

export function registerSubagentsModule(pi: ExtensionAPI, config: ResolvedSubagentsConfig): void {
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
      const agentName = args.agent || "...";
      const preview = args.task
        ? args.task.length > 60
          ? `${args.task.slice(0, 60)}...`
          : args.task
        : "...";
      let text = theme.fg("toolTitle", theme.bold("subagent ")) + theme.fg("accent", agentName);
      text += `\n  ${theme.fg("dim", preview)}`;
      return new Text(text, 0, 0);
    },

    renderResult(result: any, { expanded }: { expanded?: boolean }, theme: any, _context: any) {
      const details = result.details as Details | undefined;

      // --- Streaming view (during execution) ---
      if (details?.streaming) {
        const icon = theme.fg("warning", "⏳");
        const sd: StreamingDisplay = details.streaming;
        const displayItems: RenderItem[] = sd.displayItems;

        let text = `${icon} ${theme.fg("toolTitle", theme.bold("subagent "))}${theme.fg("accent", details.results[0]?.agent || "...")}${theme.fg("warning", " (running...)")}`;

        if (displayItems.length > 0) {
          text += `\n${renderDisplayItems(displayItems, theme.fg.bind(theme), 10)}`;
        }

        const usageStr = formatUsageStats(sd.usage);
        if (usageStr) text += `\n${theme.fg("dim", usageStr)}`;

        return new Text(text, 0, 0);
      }

      // --- Final result ---
      const isError =
        _context?.isError ||
        Boolean(details?.error) ||
        Boolean(details?.results?.some((r: SingleResult) => r.exitCode !== 0));
      const icon = isError ? theme.fg("error", "✗") : theme.fg("success", "✓");

      const r = details?.results?.[0] as SingleResult | undefined;
      if (!r) {
        const content = result.content
          .filter((item: any): item is { type: "text"; text: string } => item.type === "text")
          .map((item: any) => item.text)
          .join("\n");
        return new Text(`${icon} ${content || "(no output)"}`, 0, 0);
      }

      const displayItems: RenderItem[] = r.displayItems || [];
      const agentLabel =
        theme.fg("toolTitle", theme.bold(r.agent)) +
        (r.exitCode !== 0 ? ` ${theme.fg("error", `[exit ${r.exitCode}]`)}` : "");

      // Collapsed: agent + recent tool calls + usage
      if (!expanded) {
        let text = `${icon} ${agentLabel}`;

        if (r.error) {
          text += `\n${theme.fg("error", r.error.split("\n")[0])}`;
        } else if (displayItems.length > 0) {
          text += `\n${renderDisplayItems(displayItems, theme.fg.bind(theme), 8)}`;
        } else {
          const preview = (r.output || "").split("\n").slice(0, 3).join("\n");
          if (preview) text += `\n${theme.fg("toolOutput", preview)}`;
        }

        const usageStr = formatUsageStats(r.usage);
        if (usageStr) text += `\n${theme.fg("dim", usageStr)}`;

        if (displayItems.length > 8 || (r.output || "").split("\n").length > 3) {
          text += `\n${theme.fg("muted", "(Ctrl+O to expand)")}`;
        }

        return new Text(text, 0, 0);
      }

      // Expanded: full detail with markdown rendering
      const container = new Container();
      const mdTheme = getMarkdownTheme();

      container.addChild(new Text(`${icon} ${agentLabel}`, 0, 0));

      if (r.task) {
        container.addChild(new Spacer(1));
        container.addChild(new Text(theme.fg("muted", "─── Task ───"), 0, 0));
        container.addChild(new Text(theme.fg("dim", r.task), 0, 0));
      }

      if (r.error) {
        container.addChild(new Spacer(1));
        container.addChild(new Text(theme.fg("muted", "─── Error ───"), 0, 0));
        container.addChild(new Text(theme.fg("error", r.error), 0, 0));
      } else if (displayItems.length > 0) {
        container.addChild(new Spacer(1));
        container.addChild(new Text(theme.fg("muted", "─── Execution ───"), 0, 0));
        for (const item of displayItems) {
          if (item.type === "toolCall") {
            container.addChild(
              new Text(
                theme.fg("muted", "→ ") +
                  formatToolCall(item.name, item.args, theme.fg.bind(theme)),
                0,
                0
              )
            );
          }
        }
      }

      const outputText = r.output || "";
      if (outputText) {
        container.addChild(new Spacer(1));
        container.addChild(new Text(theme.fg("muted", "─── Output ───"), 0, 0));
        container.addChild(new Markdown(outputText.trim(), 0, 0, mdTheme));
      }

      const usageStr = formatUsageStats(r.usage);
      if (usageStr) {
        container.addChild(new Spacer(1));
        container.addChild(new Text(theme.fg("dim", usageStr), 0, 0));
      }

      return container;
    },
  });

  // Register the tool
  pi.registerTool(tool);

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
