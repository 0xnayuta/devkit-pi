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
	keyHint,
	type Theme,
} from "@earendil-works/pi-coding-agent";
import { Container, Markdown, Spacer, Text } from "@earendil-works/pi-tui";
import { getDevkitToolMetadata } from "../../extension/manifest.ts";
import type { ResourceScope } from "../../extension/runtime.ts";
import { DELEGATION_EXAMPLES, DELEGATION_POLICY } from "../../shared/delegation-policy.ts";
import { createLogger, type Logger } from "../../shared/logger.ts";
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
import { toDevkitSubagentErrorPayload } from "./errors.ts";
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
	fg: (color: Parameters<ToolTheme["fg"]>[0], text: string) => string
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

type RenderItem = { type: "text"; text: string } | { type: "toolCall"; name: string; args: Record<string, unknown> };
type ToolTheme = Theme;
type RenderContext = { isError?: boolean };

const PREVIEW_TOOL_CALLS = 5;
const PREVIEW_LINES = 5;

function formatStatusLabel(status: "running" | "success" | "failed", theme: ToolTheme): string {
	if (status === "running") return theme.fg("warning", "running");
	if (status === "failed") return theme.fg("error", "failed");
	return theme.fg("success", "success");
}

function expandKeyHintFn(theme: ToolTheme): string {
	try {
		return keyHint("app.tools.expand", "to expand");
	} catch {
		return theme.fg("dim", "ctrl+o") + theme.fg("muted", " to expand");
	}
}

function hiddenHintFn(theme: ToolTheme, message: string): string {
	return theme.fg("muted", `\n... (${message}, `) + expandKeyHintFn(theme) + theme.fg("muted", ")");
}

function truncateLines(text: string, maxLines: number): { text: string; truncated: boolean } {
	const lines = text.split("\n");
	if (lines.length <= maxLines) return { text, truncated: false };
	return { text: lines.slice(0, maxLines).join("\n"), truncated: true };
}

function getTextContent(result: AgentToolResult<unknown>): string {
	return result.content
		.map((item) => (item.type === "text" && typeof item.text === "string" ? item.text : ""))
		.filter((text) => text.length > 0)
		.join("\n");
}

function renderToolCalls(items: RenderItem[], theme: ToolTheme, limit?: number): string {
	const calls = items.filter((i) => i.type === "toolCall");
	const toShow = limit ? calls.slice(-limit) : calls;
	const skipped = limit && calls.length > limit ? calls.length - limit : 0;
	let text = "";
	if (skipped > 0) text += theme.fg("muted", `... ${skipped} earlier`);
	for (const item of toShow) {
		if (item.type === "toolCall") {
			const line = theme.fg("muted", "→ ") + formatToolCall(item.name, item.args, theme.fg.bind(theme));
			text += text ? `\n${line}` : line;
		}
	}
	return text;
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

export function registerSubagentsModule(
	pi: ExtensionAPI,
	config: ResolvedSubagentsConfig,
	options: { logger?: Logger; resources?: ResourceScope } = {}
): void {
	const logger = options.logger ?? createLogger({ module: "subagents.register" });
	// Prevent child processes from registering the subagent tool.
	if (process.env[PI_SUBAGENT_CHILD] === "1") return;

	// Ensure results directory exists
	ensureAccessibleDir(RESULTS_DIR);

	// Check if subagents are disabled
	if (config.enabled === false) {
		logger.info("module.disabled", "Subagent extension is disabled in config");
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

	const activeControllers = new Set<AbortController>();

	const executeSubagent = (
		id: string,
		params: SubagentParamsLike,
		signal: AbortSignal,
		onUpdate: ((result: AgentToolResult<Details>) => void) | undefined,
		ctx: ExtensionContext
	): Promise<AgentToolResult<Details>> => {
		const logSubagentErrorPayload = (details: Details | undefined) => {
			if (!details?.error) return;
			const payload = toDevkitSubagentErrorPayload(details.error, { provider: "pi" });
			logger.warn("subagents.error_payload", "Subagent execution returned structured error", {
				payload,
			});
		};
		// Check recursion depth
		const depthCheck = checkSubagentDepth(config.maxDepth);
		if (depthCheck.blocked) {
			const result: AgentToolResult<Details> = {
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
			};
			logSubagentErrorPayload(result.details);
			return Promise.resolve(result);
		}

		// Collapse UI when executing
		if (ctx.hasUI) {
			ctx.ui.setToolsExpanded(false);
		}

		const executionController = new AbortController();
		activeControllers.add(executionController);
		const forwardAbort = () => {
			executionController.abort();
		};
		signal.addEventListener("abort", forwardAbort, { once: true });

		return executor
			.execute(id, params, executionController.signal, onUpdate, ctx)
			.then((result) => {
				logSubagentErrorPayload(result.details as Details | undefined);
				return result;
			})
			.finally(() => {
				signal.removeEventListener("abort", forwardAbort);
				activeControllers.delete(executionController);
			});
	};

	// Define the subagent tool
	const subagentMeta = getDevkitToolMetadata("subagent");
	const tool = defineTool({
		name: subagentMeta.name,
		label: subagentMeta.label,
		description: subagentMeta.description,
		promptSnippet: subagentMeta.promptSnippet,
		promptGuidelines: [...subagentMeta.promptGuidelines],
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

		renderCall(args: SubagentParamsLike, theme) {
			const agentName = args.agent || "...";
			const taskText = args.task || "...";
			const text =
				theme.fg("toolTitle", theme.bold("subagent ")) +
				theme.fg("accent", agentName) +
				`\n  ${theme.fg("dim", taskText)}`;
			return new Text(text, 0, 0);
		},

		renderResult(
			result: AgentToolResult<Details>,
			{ expanded }: { expanded?: boolean },
			theme,
			_context: RenderContext
		) {
			const details = result.details as Details | undefined;

			// --- Streaming (partial execution) ---
			if (details?.streaming) {
				const sd: StreamingDisplay = details.streaming;
				const toolCalls: RenderItem[] = sd.displayItems.filter((i: RenderItem) => i.type === "toolCall");

				let text = `Status: ${formatStatusLabel("running", theme)}`;
				const callsText = renderToolCalls(toolCalls, theme, PREVIEW_TOOL_CALLS);
				if (callsText) text += `\n${callsText}`;

				const usageStr = formatUsageStats(sd.usage);
				if (usageStr) text += `\n${theme.fg("dim", usageStr)}`;

				return new Text(text, 0, 0);
			}

			// --- Final result ---
			const r = details?.results?.[0] as SingleResult | undefined;
			if (!r) {
				const content = getTextContent(result);
				return new Text(content || "(no output)", 0, 0);
			}

			const isError = _context?.isError || r.exitCode !== 0 || Boolean(details?.error);
			const statusLabel = isError ? formatStatusLabel("failed", theme) : formatStatusLabel("success", theme);
			const statusLine = `Status: ${statusLabel}${isError ? ` ${theme.fg("error", `[exit ${r.exitCode}]`)}` : ""}`;
			const agentLine = `Agent: ${theme.fg("toolTitle", theme.bold(r.agent))}`;
			const taskLine = r.task ? `Task: ${theme.fg("dim", r.task)}` : undefined;
			const toolCalls: RenderItem[] = (r.displayItems || []).filter((i: RenderItem) => i.type === "toolCall");

			// --- Collapsed ---
			if (!expanded) {
				let text = [statusLine, agentLine, taskLine].filter((line) => typeof line === "string").join("\n");

				// Tool calls summary
				const callsText = renderToolCalls(toolCalls, theme, PREVIEW_TOOL_CALLS);
				if (callsText) text += `\n${callsText}`;

				// Output preview or error
				if (r.error && !r.output) {
					text += `\n${theme.fg("error", r.error.split("\n")[0])}`;
				} else if (r.output) {
					const preview = truncateLines(r.output, PREVIEW_LINES);
					text += `\n${theme.fg("toolOutput", preview.text)}`;
					if (preview.truncated) {
						const totalLines = r.output.split("\n").length;
						text += hiddenHintFn(theme, `${totalLines - PREVIEW_LINES} more lines`);
					}
				}

				// Usage
				const usageStr = formatUsageStats(r.usage);
				if (usageStr) text += `\n${theme.fg("dim", usageStr)}`;

				return new Text(text, 0, 0);
			}

			// --- Expanded ---
			const container = new Container();
			const mdTheme = getMarkdownTheme();

			container.addChild(new Text(statusLine, 0, 0));
			container.addChild(new Text(agentLine, 0, 0));
			if (taskLine) {
				container.addChild(new Text(taskLine, 0, 0));
			}

			// Tool calls
			if (toolCalls.length > 0) {
				container.addChild(new Spacer(1));
				for (const item of toolCalls) {
					if (item.type === "toolCall") {
						container.addChild(
							new Text(
								theme.fg("muted", "→ ") + formatToolCall(item.name, item.args, theme.fg.bind(theme)),
								0,
								0
							)
						);
					}
				}
			}

			// Output
			if (r.output) {
				container.addChild(new Spacer(1));
				container.addChild(new Markdown(r.output.trim(), 0, 0, mdTheme));
			} else if (r.error) {
				container.addChild(new Spacer(1));
				container.addChild(new Text(theme.fg("error", r.error), 0, 0));
			}

			// Usage
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
		for (const controller of activeControllers) {
			controller.abort();
		}
		activeControllers.clear();
		state.lastUiContext = null;
		state.currentSessionId = null;
	});

	options.resources?.add({
		dispose() {
			for (const controller of activeControllers) {
				controller.abort();
			}
			activeControllers.clear();
		},
	});
}
