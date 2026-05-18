import type { LSPClient } from "./client-lifecycle.ts";

/**
 * Keeps the file-preparation and sync call boundary centralized.
 *
 * Per ADR-0007, the timing-sensitive loadFile/openOrUpdate implementation
 * remains in core.ts until explicit white-box sync ordering tests exist.
 * Diagnostics currently route file sync through syncFileToClients(), but keep
 * their own prepare/load status handling in core.ts to preserve fine-grained
 * file-not-found/read-error/unsupported/timeout result semantics.
 */

export interface FileRequestContext {
  clients: LSPClient[];
  absPath: string;
  uri: string;
  langId: string;
  content: string;
}

export interface RequestOrchestratorDeps {
  loadFile(filePath: string): Promise<FileRequestContext | null>;
  openOrUpdate(
    clients: LSPClient[],
    absPath: string,
    uri: string,
    langId: string,
    content: string,
    evict?: boolean
  ): Promise<void>;
}

export interface RequestOrchestrator {
  prepareFileContext(filePath: string): Promise<FileRequestContext | null>;
  syncFileToClients(context: FileRequestContext, evict?: boolean): Promise<void>;
}

export function createRequestOrchestrator(deps: RequestOrchestratorDeps): RequestOrchestrator {
  return {
    prepareFileContext(filePath: string): Promise<FileRequestContext | null> {
      return deps.loadFile(filePath);
    },

    syncFileToClients(context: FileRequestContext, evict = true): Promise<void> {
      return deps.openOrUpdate(
        context.clients,
        context.absPath,
        context.uri,
        context.langId,
        context.content,
        evict
      );
    },
  };
}
