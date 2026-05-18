import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { DocumentSymbol } from "vscode-languageserver-protocol";

export const DEFAULT_LSP_MAX_SOURCE_FILE_BYTES = 2 * 1024 * 1024;

export class LspFileTooLargeError extends Error {
  readonly filePath: string;
  readonly maxBytes: number;
  readonly sizeBytes: number;

  constructor(filePath: string, maxBytes: number, sizeBytes: number) {
    super(`LSP source file is too large (${sizeBytes} bytes; max ${maxBytes} bytes): ${filePath}`);
    this.name = "LspFileTooLargeError";
    this.filePath = filePath;
    this.maxBytes = maxBytes;
    this.sizeBytes = sizeBytes;
  }
}

export function readTextFileLimited(
  filePath: string,
  maxBytes = DEFAULT_LSP_MAX_SOURCE_FILE_BYTES
): string {
  const stat = fs.statSync(filePath);
  if (stat.size > maxBytes) {
    throw new LspFileTooLargeError(filePath, maxBytes, stat.size);
  }
  return fs.readFileSync(filePath, "utf-8");
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findBestSymbolMatch(
  symbols: DocumentSymbol[],
  query: string
): { pos: { line: number; character: number }; name: string } | null {
  const q = query.toLowerCase();
  let exact: { pos: { line: number; character: number }; name: string } | null = null;
  let partial: { pos: { line: number; character: number }; name: string } | null = null;

  const visit = (items: DocumentSymbol[]) => {
    for (const sym of items) {
      const rawName = String(sym?.name ?? "");
      const name = rawName.toLowerCase();
      const pos = sym?.selectionRange?.start ?? sym?.range?.start;
      if (pos && typeof pos.line === "number" && typeof pos.character === "number") {
        if (!exact && name === q) exact = { pos, name: rawName };
        if (!partial && name.includes(q)) partial = { pos, name: rawName };
      }
      if (sym?.children?.length) visit(sym.children);
    }
  };
  visit(symbols);
  return exact ?? partial;
}

export function findSymbolPosition(
  symbols: DocumentSymbol[],
  query: string
): { line: number; character: number } | null {
  return findBestSymbolMatch(symbols, query)?.pos ?? null;
}

function refineSymbolPositionFromSource(
  filePath: string,
  line: number,
  symbolName: string
): { line: number; character: number } | null {
  try {
    const content = readTextFileLimited(filePath);
    const lines = content.split(/\r?\n/);
    const token = new RegExp(`\\b${escapeRegExp(symbolName)}\\b`);

    const candidates = [line, line + 1, line + 2, line - 1].filter(
      (n, i, arr) => n >= 0 && n < lines.length && arr.indexOf(n) === i
    );
    for (const lineIndex of candidates) {
      const match = lines[lineIndex]?.match(token);
      if (match && typeof match.index === "number") {
        return { line: lineIndex, character: match.index };
      }
    }
  } catch {
    // ignore refinement failures and fall back to symbol-provided position
  }
  return null;
}

// URI utilities
export function uriToPath(uri: string): string {
  if (uri.startsWith("file://")) {
    try {
      return fileURLToPath(uri);
    } catch {
      try {
        const url = new URL(uri);
        const pathname = decodeURIComponent(url.pathname);

        // On Windows, some test inputs and some servers may still use POSIX-style
        // file URIs such as file:///Users/test/file.ts. Preserve that pathname shape
        // instead of falling back to the original URI string.
        if (process.platform === "win32") {
          if (/^\/[A-Za-z]:\//.test(pathname)) return pathname.slice(1).replace(/\//g, path.sep);
          return pathname;
        }

        return pathname;
      } catch {}
    }
  }
  return uri;
}

export interface PositionResolverManager {
  getDocumentSymbols(file: string): Promise<DocumentSymbol[]>;
  resolveFilePath(file: string): string;
}

export async function resolvePosition(
  manager: PositionResolverManager,
  file: string,
  query: string
): Promise<{ line: number; column: number } | null> {
  const symbols = await manager.getDocumentSymbols(file);
  const match = findBestSymbolMatch(symbols, query);
  if (!match) return null;

  const absPath = manager.resolveFilePath(file);
  const refined = refineSymbolPositionFromSource(absPath, match.pos.line, match.name);
  const pos = refined ?? match.pos;
  return { line: pos.line + 1, column: pos.character + 1 };
}
