import type { Diagnostic, DocumentSymbol } from "vscode-languageserver-protocol";

export type SeverityFilter = "all" | "error" | "warning" | "info" | "hint";

export function formatDiagnostic(d: Diagnostic): string {
	const sev = ["", "ERROR", "WARN", "INFO", "HINT"][d.severity || 1];
	return `${sev} [${d.range.start.line + 1}:${d.range.start.character + 1}] ${d.message}`;
}

export function filterDiagnosticsBySeverity(diags: Diagnostic[], filter: SeverityFilter): Diagnostic[] {
	if (filter === "all") return diags;
	const max = { error: 1, warning: 2, info: 3, hint: 4 }[filter];
	return diags.filter((d) => (d.severity || 1) <= max);
}

/**
 * Format a list of document symbols into display lines.
 *
 * Uses `selectionRange` (the identifier's own range) rather than `range` (the
 * full declaration span) so that the reported line:column points at the symbol
 * name itself — the position that hover, definition, and references requests
 * all expect. Falls back to `range` for servers that omit `selectionRange`.
 */
export function collectSymbols(symbols: DocumentSymbol[], depth = 0, lines: string[] = [], query?: string): string[] {
	for (const sym of symbols) {
		const name = sym.name ?? "<unknown>";
		if (query && !name.toLowerCase().includes(query.toLowerCase())) {
			if (sym.children?.length) collectSymbols(sym.children, depth + 1, lines, query);
			continue;
		}
		const startPos = sym.selectionRange?.start ?? sym.range?.start;
		const loc = startPos ? `${startPos.line + 1}:${startPos.character + 1}` : "";
		lines.push(`${"  ".repeat(depth)}${name}${loc ? ` (${loc})` : ""}`);
		if (sym.children?.length) collectSymbols(sym.children, depth + 1, lines, query);
	}
	return lines;
}
