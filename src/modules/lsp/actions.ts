import {
	DefinitionRequest,
	type DocumentSymbol,
	DocumentSymbolRequest,
	type Hover,
	HoverRequest,
	type Location,
	ReferencesRequest,
	type SignatureHelp,
	SignatureHelpRequest,
} from "vscode-languageserver-protocol";
import type { LSPClient } from "./client-lifecycle.ts";

export interface ReadonlyActionFileContext {
	clients: LSPClient[];
	uri: string;
}

export async function requestDefinitions(
	context: ReadonlyActionFileContext,
	pos: { line: number; character: number },
	normalizeLocs: (raw: Location | Location[] | null | undefined) => Location[]
): Promise<Location[]> {
	const results = await Promise.all(
		context.clients.map(async (c) => {
			if (c.closed) return [];
			try {
				return normalizeLocs(
					await c.connection.sendRequest(DefinitionRequest.method, {
						textDocument: { uri: context.uri },
						position: pos,
					})
				);
			} catch {
				return [];
			}
		})
	);
	return results.flat();
}

export async function requestReferences(
	context: ReadonlyActionFileContext,
	pos: { line: number; character: number },
	normalizeLocs: (raw: Location | Location[] | null | undefined) => Location[]
): Promise<Location[]> {
	const results = await Promise.all(
		context.clients.map(async (c) => {
			if (c.closed) return [];
			try {
				return normalizeLocs(
					await c.connection.sendRequest(ReferencesRequest.method, {
						textDocument: { uri: context.uri },
						position: pos,
						context: { includeDeclaration: true },
					})
				);
			} catch {
				return [];
			}
		})
	);
	return results.flat();
}

export async function requestHover(
	context: ReadonlyActionFileContext,
	pos: { line: number; character: number }
): Promise<Hover | null> {
	for (const c of context.clients) {
		if (c.closed) continue;
		try {
			const r = await c.connection.sendRequest(HoverRequest.method, {
				textDocument: { uri: context.uri },
				position: pos,
			});
			if (r) return r as Hover;
		} catch {
			// ignore
		}
	}
	return null;
}

export async function requestSignatureHelp(
	context: ReadonlyActionFileContext,
	pos: { line: number; character: number }
): Promise<SignatureHelp | null> {
	for (const c of context.clients) {
		if (c.closed) continue;
		try {
			const r = await c.connection.sendRequest(SignatureHelpRequest.method, {
				textDocument: { uri: context.uri },
				position: pos,
			});
			if (r) return r as SignatureHelp;
		} catch {
			// ignore
		}
	}
	return null;
}

export async function requestDocumentSymbols(
	context: ReadonlyActionFileContext,
	normalizeSymbols: (raw: unknown) => DocumentSymbol[]
): Promise<DocumentSymbol[]> {
	const results = await Promise.all(
		context.clients.map(async (c) => {
			if (c.closed) return [];
			try {
				return normalizeSymbols(
					await c.connection.sendRequest(DocumentSymbolRequest.method, {
						textDocument: { uri: context.uri },
					})
				);
			} catch {
				return [];
			}
		})
	);
	return results.flat();
}
