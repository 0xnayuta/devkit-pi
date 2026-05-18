import type { Diagnostic } from "vscode-languageserver-protocol";
import type { LSPClient } from "./client-lifecycle.ts";

export interface DiagnosticsCycleParams {
  clients: LSPClient[];
  absPath: string;
  uri: string;
  langId: string;
  content: string;
  timeoutMs: number;
  isNew: boolean;
  evict?: boolean;
  waitForDiagnostics(
    client: LSPClient,
    absPath: string,
    timeoutMs: number,
    isNew: boolean
  ): Promise<boolean>;
  openOrUpdate(
    clients: LSPClient[],
    absPath: string,
    uri: string,
    langId: string,
    content: string,
    evict?: boolean
  ): Promise<void>;
  pullDiagnostics(
    client: LSPClient,
    absPath: string,
    uri: string
  ): Promise<{ diagnostics: Diagnostic[]; responded: boolean }>;
}

export function collectClientDiagnosticsForPath(
  clients: LSPClient[],
  absPath: string
): Diagnostic[] {
  const diags: Diagnostic[] = [];
  for (const c of clients) {
    const d = c.diagnostics.get(absPath);
    if (d) diags.push(...d);
  }
  return diags;
}

export async function runDiagnosticsCycle(
  params: DiagnosticsCycleParams
): Promise<{ diagnostics: Diagnostic[]; responded: boolean }> {
  const {
    clients,
    absPath,
    uri,
    langId,
    content,
    timeoutMs,
    isNew,
    evict = true,
    waitForDiagnostics,
    openOrUpdate,
    pullDiagnostics,
  } = params;

  for (const c of clients) c.diagnostics.delete(absPath);

  const waits = clients.map((c) => waitForDiagnostics(c, absPath, timeoutMs, isNew));
  await openOrUpdate(clients, absPath, uri, langId, content, evict);
  const waitResults = await Promise.all(waits);

  let responded = waitResults.some((r) => r);
  const diags = collectClientDiagnosticsForPath(clients, absPath);

  if (!responded || diags.length === 0) {
    const pulled = await Promise.all(clients.map((c) => pullDiagnostics(c, absPath, uri)));
    for (let i = 0; i < clients.length; i++) {
      const r = pulled[i];
      if (r.responded) responded = true;
      if (r.diagnostics.length) {
        clients[i].diagnostics.set(absPath, r.diagnostics);
        diags.push(...r.diagnostics);
      }
    }
  }

  return { diagnostics: diags, responded };
}
