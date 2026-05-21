/**
 * LSP Tool Extension for pi-coding-agent
 *
 * Provides Language Server Protocol tool for:
 * - definitions, references, hover, signature help
 * - document symbols, diagnostics, workspace diagnostics
 * - readonly code intelligence
 *
 * Supported languages:
 *   - Dart/Flutter (dart language-server)
 *   - TypeScript/JavaScript (typescript-language-server)
 *   - Vue (vue-language-server)
 *   - Svelte (svelteserver)
 *   - Python (pyright-langserver)
 *   - Go (gopls)
 *   - Kotlin (kotlin-ls)
 *   - Swift (sourcekit-lsp)
 *   - Rust (rust-analyzer)
 *   - C/C++ (clangd)
 *
 * Phase 3 intentionally registers only the explicit tool, not the hook.
 */

import * as path from "node:path";
import { defineTool, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { getDevkitToolMetadata } from "../../extension/manifest.ts";
import { ERROR_CODES, LspError, toDevkitErrorPayload } from "../../shared/errors.ts";
import { createLogger, type Logger } from "../../shared/logger.ts";
import type { LspToolConfig } from "../../shared/types.ts";
import { PI_SUBAGENT_ALLOW_LSP, PI_SUBAGENT_CHILD, PI_SUBAGENT_LSP_ACTIONS } from "../../shared/types.ts";
import {
	collectSymbols,
	diagnosticsWaitMsForFile,
	filterDiagnosticsBySeverity,
	formatDiagnostic,
	getCppCompilationDbHint,
	getOrCreateManager,
	LSP_SERVERS,
	resolvePosition,
	type SeverityFilter,
	shutdownManager,
	uriToPath,
} from "./core.ts";
import { LspParams, type LspParamsType, MAX_WORKSPACE_DIAGNOSTIC_FILES } from "./schemas.ts";

export { LSP_ACTIONS, LspParams, type LspParamsType } from "./schemas.ts";

const PREVIEW_LINES = 10;
const MAX_RESULT_CHARS = 60_000;
const MAX_LIST_ITEMS = 200;
const PRIVILEGED_ACTIONS = new Set<string>(["rename", "codeAction", "restart"]);
const SERVER_IDS = new Set(LSP_SERVERS.map((s) => s.id));

function capItems<T>(items: T[], maxItems = MAX_LIST_ITEMS): { items: T[]; truncated: boolean } {
	return { items: items.slice(0, maxItems), truncated: items.length > maxItems };
}

function capText(text: string, maxChars = MAX_RESULT_CHARS): string {
	if (text.length <= maxChars) return text;
	return `${text.slice(0, maxChars)}\n\n[TRUNCATED: showing first ${maxChars} of ${text.length} characters]`;
}

function abortable<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
	if (!signal) return promise;
	if (signal.aborted) return Promise.reject(new Error("aborted"));

	return new Promise<T>((resolve, reject) => {
		const onAbort = () => {
			cleanup();
			reject(new Error("aborted"));
		};

		const cleanup = () => {
			signal.removeEventListener("abort", onAbort);
		};

		signal.addEventListener("abort", onAbort, { once: true });

		promise.then(
			(value) => {
				cleanup();
				resolve(value);
			},
			(err) => {
				cleanup();
				reject(err);
			}
		);
	});
}

function isAbortedError(e: unknown): boolean {
	return e instanceof Error && e.message === "aborted";
}

function cancelledToolResult() {
	return {
		content: [{ type: "text" as const, text: "Cancelled" }],
		details: { cancelled: true },
	};
}

type ExecuteArgs = {
	signal: AbortSignal | undefined;
	onUpdate:
		| ((update: { content: Array<{ type: "text"; text: string }>; details?: Record<string, unknown> }) => void)
		| undefined;
	ctx: { cwd: string };
};

function isAbortSignalLike(value: unknown): value is AbortSignal {
	if (!value || typeof value !== "object") return false;
	const candidate = value as { aborted?: unknown; addEventListener?: unknown };
	return typeof candidate.aborted === "boolean" && typeof candidate.addEventListener === "function";
}

function isContextLike(value: unknown): value is { cwd: string } {
	if (!value || typeof value !== "object") return false;
	const candidate = value as { cwd?: unknown };
	return typeof candidate.cwd === "string";
}

function normalizeExecuteArgs(onUpdateArg: unknown, ctxArg: unknown, signalArg: unknown): ExecuteArgs {
	// Runtime >= 0.51: (signal, onUpdate, ctx)
	if (isContextLike(signalArg)) {
		return {
			signal: isAbortSignalLike(onUpdateArg) ? onUpdateArg : undefined,
			onUpdate: typeof ctxArg === "function" ? (ctxArg as ExecuteArgs["onUpdate"]) : undefined,
			ctx: signalArg,
		};
	}

	// Runtime <= 0.50: (onUpdate, ctx, signal)
	if (isContextLike(ctxArg)) {
		return {
			signal: isAbortSignalLike(signalArg) ? signalArg : undefined,
			onUpdate: typeof onUpdateArg === "function" ? (onUpdateArg as ExecuteArgs["onUpdate"]) : undefined,
			ctx: ctxArg,
		};
	}

	throw new Error("Invalid tool execution context");
}

function formatLocation(
	loc: { uri: string; range?: { start?: { line: number; character: number } } },
	cwd?: string
): string {
	const abs = uriToPath(loc.uri);
	const display = cwd && path.isAbsolute(abs) ? path.relative(cwd, abs) : abs;
	const { line, character: col } = loc.range?.start ?? {};
	return typeof line === "number" && typeof col === "number" ? `${display}:${line + 1}:${col + 1}` : display;
}

function formatHover(contents: unknown): string {
	if (typeof contents === "string") return contents;
	if (Array.isArray(contents))
		return contents
			.map((c) => {
				if (typeof c === "string") return c;
				if (c && typeof c === "object" && "value" in c) return String((c as { value?: unknown }).value ?? "");
				return "";
			})
			.filter(Boolean)
			.join("\n\n");
	if (contents && typeof contents === "object" && "value" in contents)
		return String((contents as { value?: unknown }).value);
	return "";
}

type SignatureHelpLike = {
	signatures?: Array<{
		label?: string;
		documentation?: string | { value?: string };
		parameters?: Array<{ label?: string | [number, number] }>;
	}>;
	activeSignature?: number;
};

function formatSignature(help: SignatureHelpLike | null | undefined): string {
	if (!help?.signatures?.length) return "No signature help available.";
	const sig = help.signatures[help.activeSignature ?? 0] ?? help.signatures[0];
	let text = sig.label ?? "Signature";
	if (sig.documentation)
		text += `\n${typeof sig.documentation === "string" ? sig.documentation : (sig.documentation?.value ?? "")}`;
	if (sig.parameters?.length) {
		const params = sig.parameters
			.map((p) => (typeof p.label === "string" ? p.label : Array.isArray(p.label) ? p.label.join("-") : ""))
			.filter(Boolean);
		if (params.length) text += `\nParameters: ${params.join(", ")}`;
	}
	return text;
}

function formatWorkspaceEdit(edit: unknown, cwd?: string): string {
	const lines: string[] = [];
	if (!edit || typeof edit !== "object") return "No edits.";
	const record = edit as {
		documentChanges?: Array<{
			textDocument?: { uri?: string };
			edits?: Array<{ range: { start: { line: number; character: number } }; newText: string }>;
		}>;
		changes?: Record<string, Array<{ range: { start: { line: number; character: number } }; newText: string }>>;
	};

	if (record.documentChanges?.length) {
		for (const change of record.documentChanges) {
			if (change.textDocument?.uri) {
				const fp = uriToPath(change.textDocument.uri);
				const display = cwd && path.isAbsolute(fp) ? path.relative(cwd, fp) : fp;
				lines.push(`${display}:`);
				for (const e of change.edits || []) {
					const loc = `${e.range.start.line + 1}:${e.range.start.character + 1}`;
					lines.push(`  [${loc}] → "${e.newText}"`);
				}
			}
		}
	}

	if (record.changes) {
		for (const [uri, edits] of Object.entries(record.changes)) {
			const fp = uriToPath(uri);
			const display = cwd && path.isAbsolute(fp) ? path.relative(cwd, fp) : fp;
			lines.push(`${display}:`);
			for (const e of edits) {
				const loc = `${e.range.start.line + 1}:${e.range.start.character + 1}`;
				lines.push(`  [${loc}] → "${e.newText}"`);
			}
		}
	}

	return lines.length ? lines.join("\n") : "No edits.";
}

type CodeActionLike = {
	title?: string;
	kind?: string;
	isPreferred?: boolean;
	command?: { title?: string } | string;
};

function formatCodeActions(actions: CodeActionLike[]): string[] {
	return actions.map((a, i) => {
		const commandTitle = typeof a.command === "object" ? a.command?.title : undefined;
		const title = a.title || commandTitle || "Untitled action";
		const kind = a.kind ? ` (${a.kind})` : "";
		const isPreferred = a.isPreferred ? " ★" : "";
		return `${i + 1}. ${title}${kind}${isPreferred}`;
	});
}

function isSubagentChild(): boolean {
	return process.env[PI_SUBAGENT_CHILD] === "1";
}

function canRunPrivilegedAction(config: Required<LspToolConfig>): boolean {
	return config.allowMutatingActions && !isSubagentChild();
}

function assertSubagentLspActionAllowed(action: string): void {
	if (!isSubagentChild()) return;

	if (process.env[PI_SUBAGENT_ALLOW_LSP] !== "1") {
		throw new LspError(ERROR_CODES.LSP_ACTION_NOT_ALLOWED, "LSP tool is disabled for this subagent process.");
	}

	const allowedActions = new Set(
		(process.env[PI_SUBAGENT_LSP_ACTIONS] ?? "")
			.split(",")
			.map((item) => item.trim())
			.filter(Boolean)
	);

	if (!allowedActions.has(action)) {
		throw new LspError(
			ERROR_CODES.LSP_ACTION_NOT_ALLOWED,
			`LSP action "${action}" is not allowed for this subagent process.`
		);
	}
}

export function registerLspTool(
	pi: ExtensionAPI,
	config: Required<LspToolConfig>,
	options: { logger?: Logger } = {}
): void {
	const logger = options.logger ?? createLogger({ module: "lsp.tool" });
	if (!config.enabled) return;

	const lspMeta = getDevkitToolMetadata("lsp");

	pi.registerTool(
		defineTool({
			name: lspMeta.name,
			label: lspMeta.label,
			description: lspMeta.description,
			promptSnippet: lspMeta.promptSnippet,
			promptGuidelines: [...lspMeta.promptGuidelines],
			parameters: LspParams,

			async execute(_toolCallId, params, signalArg, onUpdateArg, ctxArg) {
				try {
					const { signal, ctx } = normalizeExecuteArgs(onUpdateArg, ctxArg, signalArg);
					if (signal?.aborted) return cancelledToolResult();
					const { action, file, files, line, column, endLine, endColumn, query, newName, severity, server } =
						params as LspParamsType;
					assertSubagentLspActionAllowed(action);
					if (PRIVILEGED_ACTIONS.has(action) && !canRunPrivilegedAction(config)) {
						const reason = isSubagentChild()
							? "privileged LSP actions are disabled in subagent processes"
							: "lsp.tool.allowMutatingActions is false";
						throw new LspError(ERROR_CODES.LSP_ACTION_NOT_ALLOWED, `Action "${action}" is disabled: ${reason}.`);
					}
					const manager = getOrCreateManager(ctx.cwd);
					const sevFilter: SeverityFilter = severity || "all";
					const needsFile = action !== "workspace-diagnostics" && action !== "restart" && action !== "servers";
					const needsPos = ["definition", "references", "hover", "signature", "rename", "codeAction"].includes(
						action
					);

					try {
						if (action === "servers") {
							const ids = Array.from(SERVER_IDS).sort();
							return {
								content: [{ type: "text", text: `action: servers\n${ids.join("\n")}` }],
								details: { servers: ids },
							};
						}

						if (action === "restart") {
							const target = (server || "all").trim();
							if (target !== "all" && !SERVER_IDS.has(target)) {
								throw new LspError(
									ERROR_CODES.LSP_SERVER_NOT_FOUND,
									`Unknown server "${target}". Use one of: all, ${Array.from(SERVER_IDS).join(", ")}`
								);
							}

							if (target === "all") {
								await abortable(shutdownManager(), signal);
								// Recreate manager immediately so follow-up actions are responsive.
								getOrCreateManager(ctx.cwd);
								return {
									content: [{ type: "text", text: "action: restart\nserver: all\nLSP manager restarted." }],
									details: { restarted: true, server: "all" },
								};
							}

							const restartedCount = await abortable(manager.restartServers([target]), signal);
							return {
								content: [
									{
										type: "text",
										text: `action: restart\nserver: ${target}\nRestarted ${restartedCount} client(s).`,
									},
								],
								details: { restarted: true, server: target, restartedCount },
							};
						}

						if (needsFile && !file)
							throw new LspError(ERROR_CODES.INVALID_INPUT, `Action "${action}" requires a file path.`);

						let rLine = line,
							rCol = column,
							fromQuery = false;
						if (needsPos && (rLine === undefined || rCol === undefined) && query && file) {
							const resolved = await abortable(resolvePosition(manager, file, query), signal);
							if (resolved) {
								rLine = resolved.line;
								rCol = resolved.column;
								fromQuery = true;
							}
						}
						if (needsPos && (rLine === undefined || rCol === undefined)) {
							throw new LspError(
								ERROR_CODES.INVALID_INPUT,
								`Action "${action}" requires line/column or a query matching a symbol.`
							);
						}

						const qLine = query ? `query: ${query}\n` : "";
						const sevLine = sevFilter !== "all" ? `severity: ${sevFilter}\n` : "";
						const posLine = fromQuery && rLine && rCol ? `resolvedPosition: ${rLine}:${rCol}\n` : "";

						switch (action) {
							case "definition": {
								const results = await abortable(manager.getDefinition(file!, rLine!, rCol!), signal);
								const capped = capItems(results);
								const locs = capped.items.map((l) => formatLocation(l, ctx?.cwd));
								const truncatedLine = capped.truncated
									? `\n[TRUNCATED: showing first ${capped.items.length} of ${results.length} definitions]`
									: "";
								const payload = locs.length
									? `${locs.join("\n")}${truncatedLine}`
									: fromQuery
										? `${file}:${rLine}:${rCol}`
										: "No definitions found.";
								return {
									content: [
										{
											type: "text",
											text: capText(`action: definition\n${qLine}${posLine}${payload}`),
										},
									],
									details: {
										results: capped.items,
										truncated: capped.truncated,
										total: results.length,
									},
								};
							}
							case "references": {
								const results = await abortable(manager.getReferences(file!, rLine!, rCol!), signal);
								const capped = capItems(results);
								const locs = capped.items.map((l) => formatLocation(l, ctx?.cwd));
								const truncatedLine = capped.truncated
									? `\n[TRUNCATED: showing first ${capped.items.length} of ${results.length} references]`
									: "";
								return {
									content: [
										{
											type: "text",
											text: capText(
												`action: references\n${qLine}${posLine}${locs.length ? `${locs.join("\n")}${truncatedLine}` : "No references found."}`
											),
										},
									],
									details: {
										results: capped.items,
										truncated: capped.truncated,
										total: results.length,
									},
								};
							}
							case "hover": {
								const result = await abortable(manager.getHover(file!, rLine!, rCol!), signal);
								const payload = result
									? formatHover(result.contents) || "No hover information."
									: "No hover information.";
								return {
									content: [{ type: "text", text: capText(`action: hover\n${qLine}${posLine}${payload}`) }],
									details: result ?? null,
								};
							}
							case "symbols": {
								const symbols = await abortable(manager.getDocumentSymbols(file!), signal);
								const lines = collectSymbols(symbols, 0, [], query);
								const capped = capItems(lines);
								const truncatedLine = capped.truncated
									? `\n[TRUNCATED: showing first ${capped.items.length} of ${lines.length} symbols]`
									: "";
								const payload = capped.items.length
									? `${capped.items.join("\n")}${truncatedLine}`
									: query
										? `No symbols matching "${query}".`
										: "No symbols found.";
								return {
									content: [{ type: "text", text: capText(`action: symbols\n${qLine}${payload}`) }],
									details: {
										lines: capped.items,
										truncated: capped.truncated,
										total: lines.length,
									},
								};
							}
							case "diagnostics": {
								const result = await abortable(
									manager.touchFileAndWait(file!, diagnosticsWaitMsForFile(file!)),
									signal
								);
								const filtered = filterDiagnosticsBySeverity(result.diagnostics, sevFilter);
								const capped = capItems(filtered);
								const hint = getCppCompilationDbHint(file!, ctx.cwd);
								const truncatedLine = capped.truncated
									? `\n[TRUNCATED: showing first ${capped.items.length} of ${filtered.length} diagnostics]`
									: "";
								const unsupportedResult = result as { unsupported?: boolean; error?: string };
								const payload = unsupportedResult.unsupported
									? `Unsupported: ${unsupportedResult.error || "No LSP for this file."}`
									: !result.receivedResponse
										? "Timeout: LSP server did not respond. Try again."
										: capped.items.length
											? `${capped.items.map(formatDiagnostic).join("\n")}${truncatedLine}`
											: "No diagnostics.";
								const hintLine = hint ? `\n\n${hint}` : "";
								return {
									content: [
										{
											type: "text",
											text: capText(`action: diagnostics\n${sevLine}${payload}${hintLine}`),
										},
									],
									details: {
										...result,
										diagnostics: capped.items,
										diagnosticsTruncated: capped.truncated,
										diagnosticsTotal: filtered.length,
									},
								};
							}
							case "workspace-diagnostics": {
								if (!files?.length)
									throw new LspError(
										ERROR_CODES.INVALID_INPUT,
										'Action "workspace-diagnostics" requires a "files" array.'
									);
								if (files.length > MAX_WORKSPACE_DIAGNOSTIC_FILES) {
									throw new LspError(
										ERROR_CODES.INVALID_INPUT,
										`Action "workspace-diagnostics" accepts at most ${MAX_WORKSPACE_DIAGNOSTIC_FILES} files.`
									);
								}
								const waitMs = Math.max(...files.map(diagnosticsWaitMsForFile));
								const result = await abortable(manager.getDiagnosticsForFiles(files, waitMs), signal);
								const out: string[] = [];
								let errors = 0,
									warnings = 0,
									filesWithIssues = 0;

								const hints: string[] = [];
								for (const item of result.items) {
									const display =
										ctx?.cwd && path.isAbsolute(item.file) ? path.relative(ctx.cwd, item.file) : item.file;
									if (item.status !== "ok") {
										out.push(`${display}: ${item.error || item.status}`);
										continue;
									}
									const filtered = filterDiagnosticsBySeverity(item.diagnostics, sevFilter);
									const capped = capItems(filtered);
									if (filtered.length) {
										filesWithIssues++;
										out.push(`${display}:`);
										for (const d of capped.items) {
											if (d.severity === 1) errors++;
											else if (d.severity === 2) warnings++;
											out.push(`  ${formatDiagnostic(d)}`);
										}
										if (capped.truncated) {
											out.push(
												`  [TRUNCATED: showing first ${capped.items.length} of ${filtered.length} diagnostics]`
											);
										}
									}
									const hint = getCppCompilationDbHint(item.file, ctx.cwd);
									if (hint && !hints.includes(hint)) hints.push(hint);
								}

								const summary = `Analyzed ${result.items.length} file(s): ${errors} error(s), ${warnings} warning(s) in ${filesWithIssues} file(s)`;
								const hintBlock = hints.length ? `\n\n${hints.join("\n\n")}` : "";
								const cappedItems = result.items.map((item) => {
									const filtered = filterDiagnosticsBySeverity(item.diagnostics, sevFilter);
									const capped = capItems(filtered);
									return {
										...item,
										diagnostics: capped.items,
										diagnosticsTruncated: capped.truncated,
										diagnosticsTotal: filtered.length,
									};
								});
								return {
									content: [
										{
											type: "text",
											text: capText(
												`action: workspace-diagnostics\n${sevLine}${summary}\n\n${out.length ? out.join("\n") : "No diagnostics."}${hintBlock}`
											),
										},
									],
									details: { items: cappedItems },
								};
							}
							case "signature": {
								const result = await abortable(manager.getSignatureHelp(file!, rLine!, rCol!), signal);
								return {
									content: [
										{
											type: "text",
											text: capText(`action: signature\n${qLine}${posLine}${formatSignature(result)}`),
										},
									],
									details: result ?? null,
								};
							}
							case "rename": {
								if (!newName)
									throw new LspError(
										ERROR_CODES.INVALID_INPUT,
										'Action "rename" requires a "newName" parameter.'
									);
								const result = await abortable(manager.rename(file!, rLine!, rCol!, newName), signal);
								if (!result)
									return {
										content: [
											{
												type: "text",
												text: capText(
													`action: rename\n${qLine}${posLine}No rename available at this position.`
												),
											},
										],
										details: null,
									};
								const edits = formatWorkspaceEdit(result, ctx?.cwd);
								return {
									content: [
										{
											type: "text",
											text: capText(`action: rename\n${qLine}${posLine}newName: ${newName}\n\n${edits}`),
										},
									],
									details: result,
								};
							}
							case "codeAction": {
								const result = await abortable(
									manager.getCodeActions(file!, rLine!, rCol!, endLine, endColumn),
									signal
								);
								const capped = capItems(result);
								const actions = formatCodeActions(capped.items);
								const truncatedLine = capped.truncated
									? `\n[TRUNCATED: showing first ${capped.items.length} of ${result.length} code actions]`
									: "";
								return {
									content: [
										{
											type: "text",
											text: capText(
												`action: codeAction\n${qLine}${posLine}${actions.length ? `${actions.join("\n")}${truncatedLine}` : "No code actions available."}`
											),
										},
									],
									details: {
										actions: capped.items,
										truncated: capped.truncated,
										total: result.length,
									},
								};
							}
						}
					} catch (e) {
						if (signal?.aborted || isAbortedError(e)) return cancelledToolResult();
						throw e;
					}
				} catch (error) {
					const payload = toDevkitErrorPayload(error, { moduleHint: "lsp" });
					if (error instanceof LspError) {
						logger.warn("lsp.error_payload", "LSP tool returned structured error", { payload });
					} else {
						logger.error("lsp.error_payload", "LSP tool execution failed", { payload }, error);
					}
					throw error;
				}
			},

			renderCall(args, theme) {
				const params = args as LspParamsType;
				let text = theme.fg("toolTitle", theme.bold("lsp ")) + theme.fg("accent", params.action || "...");
				if (params.file) text += ` ${theme.fg("muted", params.file)}`;
				else if (params.files?.length) text += ` ${theme.fg("muted", `${params.files.length} file(s)`)}`;
				if (params.query) text += ` ${theme.fg("dim", `query="${params.query}"`)}`;
				else if (params.line !== undefined && params.column !== undefined)
					text += theme.fg("warning", `:${params.line}:${params.column}`);
				if (params.severity && params.severity !== "all") text += ` ${theme.fg("dim", `[${params.severity}]`)}`;
				if (params.server) text += ` ${theme.fg("dim", `server=${params.server}`)}`;
				return new Text(text, 0, 0);
			},

			renderResult(result, options, theme) {
				if (options.isPartial) return new Text("", 0, 0);

				const textItem = result.content?.find((c) => c.type === "text");
				const textContent = textItem && typeof textItem.text === "string" ? textItem.text : "";
				const lines = textContent.split("\n");

				let headerEnd = 0;
				for (let i = 0; i < lines.length; i++) {
					if (/^(action|query|severity|resolvedPosition):/.test(lines[i])) headerEnd = i + 1;
					else break;
				}

				const header = lines.slice(0, headerEnd);
				const content = lines.slice(headerEnd);
				const maxLines = options.expanded ? content.length : PREVIEW_LINES;
				const display = content.slice(0, maxLines);
				const remaining = content.length - maxLines;

				let out = header.map((l: string) => theme.fg("muted", l)).join("\n");
				if (display.length) {
					if (out) out += "\n";
					out += display.map((l: string) => theme.fg("toolOutput", l)).join("\n");
				}
				if (remaining > 0) out += theme.fg("dim", `\n... (${remaining} more lines)`);

				return new Text(out, 0, 0);
			},
		})
	);
}
