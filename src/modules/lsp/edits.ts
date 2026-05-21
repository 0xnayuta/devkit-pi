import * as path from "node:path";
import {
	type CodeAction,
	CodeActionKind,
	CodeActionRequest,
	type Command,
	type Diagnostic,
	RenameRequest,
	type WorkspaceEdit,
} from "vscode-languageserver-protocol";
import type { LSPClient } from "./client-lifecycle.ts";

export interface MutatingActionFileContext {
	clients: LSPClient[];
	uri: string;
	absPath: string;
	content: string;
}

function rangesOverlap(
	a: { start: { line: number; character: number }; end: { line: number; character: number } },
	b: { start: { line: number; character: number }; end: { line: number; character: number } }
): boolean {
	if (a.end.line < b.start.line || b.end.line < a.start.line) return false;
	if (a.end.line === b.start.line && a.end.character < b.start.character) return false;
	if (b.end.line === a.start.line && b.end.character < a.start.character) return false;
	return true;
}

type ActionLike = {
	title?: string;
	kind?: string;
	command?: { title?: string; command?: string } | string;
};

function getActionTitleAndKind(action: CodeAction | Command): { title: string; kind: string } {
	const value = action as ActionLike;
	const command = typeof value.command === "object" ? value.command : undefined;
	return {
		title: value.title || command?.title || "",
		kind: value.kind || command?.command || "",
	};
}

function dedupeActions(actions: (CodeAction | Command)[]): (CodeAction | Command)[] {
	const seen = new Set<string>();
	const out: (CodeAction | Command)[] = [];
	for (const action of actions) {
		const { title, kind } = getActionTitleAndKind(action);
		const key = `${title}::${kind}`;
		if (seen.has(key)) continue;
		seen.add(key);
		out.push(action);
	}
	return out;
}

function hasQuickFix(actions: (CodeAction | Command)[]): boolean {
	return actions.some((action) => {
		const { kind } = getActionTitleAndKind(action);
		return kind === CodeActionKind.QuickFix || kind.startsWith(`${CodeActionKind.QuickFix}.`);
	});
}

async function requestForRange(
	clients: LSPClient[],
	uri: string,
	range: { start: { line: number; character: number }; end: { line: number; character: number } },
	diagnostics: Diagnostic[]
): Promise<(CodeAction | Command)[]> {
	const results = await Promise.all(
		clients.map(async (c) => {
			if (c.closed) return [];
			try {
				const r = await c.connection.sendRequest(CodeActionRequest.method, {
					textDocument: { uri },
					range,
					context: {
						diagnostics,
						only: [CodeActionKind.QuickFix, CodeActionKind.Refactor, CodeActionKind.Source],
					},
				});
				return (r || []) as (CodeAction | Command)[];
			} catch {
				return [];
			}
		})
	);
	return results.flat();
}

function buildContextDiagnostics(
	clients: LSPClient[],
	absPath: string,
	range: { start: { line: number; character: number }; end: { line: number; character: number } }
): Diagnostic[] {
	const diagnostics: Diagnostic[] = [];
	for (const c of clients) {
		const fileDiags = c.diagnostics.get(absPath) || [];
		for (const d of fileDiags) {
			if (rangesOverlap(d.range, range)) diagnostics.push(d);
		}
	}
	return diagnostics;
}

export async function requestRename(
	context: MutatingActionFileContext,
	pos: { line: number; character: number },
	newName: string
): Promise<WorkspaceEdit | null> {
	for (const c of context.clients) {
		if (c.closed) continue;
		try {
			const r = await c.connection.sendRequest(RenameRequest.method, {
				textDocument: { uri: context.uri },
				position: pos,
				newName,
			});
			if (r) return r as WorkspaceEdit;
		} catch {
			// ignore
		}
	}
	return null;
}

export async function requestCodeActions(
	context: MutatingActionFileContext,
	start: { line: number; character: number },
	end: { line: number; character: number }
): Promise<(CodeAction | Command)[]> {
	const primaryRange = { start, end };
	const primaryDiagnostics = buildContextDiagnostics(context.clients, context.absPath, primaryRange);
	let actions = await requestForRange(context.clients, context.uri, primaryRange, primaryDiagnostics);

	const ext = path.extname(context.absPath).toLowerCase();
	const isCpp = [".c", ".cc", ".cpp", ".cxx", ".h", ".hpp", ".hxx", ".inc"].includes(ext);

	if (isCpp && (!actions.length || !hasQuickFix(actions))) {
		const overlappingDiagnostics = primaryDiagnostics.slice().sort((a, b) => {
			const aSpan =
				(a.range.end.line - a.range.start.line) * 10000 + (a.range.end.character - a.range.start.character);
			const bSpan =
				(b.range.end.line - b.range.start.line) * 10000 + (b.range.end.character - b.range.start.character);
			return aSpan - bSpan;
		});

		for (const diag of overlappingDiagnostics) {
			const diagActions = await requestForRange(context.clients, context.uri, diag.range, [diag]);
			if (diagActions.length) {
				actions = dedupeActions([...diagActions, ...actions]);
				if (hasQuickFix(actions)) break;
			}
		}

		if (!actions.length || !hasQuickFix(actions)) {
			const lineText = context.content.split(/\r?\n/)[Math.max(0, start.line)] ?? "";
			const lineRange = {
				start: { line: start.line, character: 0 },
				end: { line: start.line, character: Math.max(0, lineText.length) },
			};
			const lineDiagnostics = buildContextDiagnostics(context.clients, context.absPath, lineRange);
			const lineActions = await requestForRange(context.clients, context.uri, lineRange, lineDiagnostics);
			actions = dedupeActions([...lineActions, ...actions]);
		}
	}

	return dedupeActions(actions);
}
