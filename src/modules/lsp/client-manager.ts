import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  createMessageConnection,
  StreamMessageReader,
  StreamMessageWriter,
} from "vscode-jsonrpc/node.js";
import {
  type Diagnostic,
  InitializedNotification,
  InitializeRequest,
} from "vscode-languageserver-protocol";
import type { LSPClient } from "./client-lifecycle.ts";

export interface SpawnedServerHandle {
  process: ChildProcessWithoutNullStreams;
  initOptions?: Record<string, unknown>;
}

export interface InitializeClientParams {
  handle: SpawnedServerHandle;
  root: string;
  serverId: string;
  initTimeoutMs: number;
  normalizeFsPath(filePath: string): string;
  onClientClosed(): void;
  onClientProcessError(): void;
}

export interface InitClientWithSpawnParams {
  root: string;
  serverId: string;
  initTimeoutMs: number;
  spawn(root: string): Promise<SpawnedServerHandle | undefined>;
  normalizeFsPath(filePath: string): string;
  onClientClosed(): void;
  onClientProcessError(): void;
  onInitFailed(): void;
  initializeClient?(params: InitializeClientParams): Promise<LSPClient>;
}

function timeout<T>(promise: Promise<T>, ms: number, name: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${name} timed out`)), ms);
    promise.then(
      (r) => {
        clearTimeout(timer);
        resolve(r);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      }
    );
  });
}

export async function initializeSpawnedClient(params: InitializeClientParams): Promise<LSPClient> {
  const {
    handle,
    root,
    serverId,
    initTimeoutMs,
    normalizeFsPath,
    onClientClosed,
    onClientProcessError,
  } = params;

  const reader = new StreamMessageReader(handle.process.stdout);
  const writer = new StreamMessageWriter(handle.process.stdin);
  const conn = createMessageConnection(reader, writer);

  // Prevent crashes from stream errors
  handle.process.stdin?.on("error", () => {});
  handle.process.stdout?.on("error", () => {});

  const stderr: string[] = [];
  const MAX_STDERR_LINES = 200;
  handle.process.stderr?.on("data", (chunk: Buffer) => {
    try {
      const text = chunk.toString("utf-8");
      for (const line of text.split(/\r?\n/)) {
        if (!line.trim()) continue;
        stderr.push(line);
        if (stderr.length > MAX_STDERR_LINES) stderr.splice(0, stderr.length - MAX_STDERR_LINES);
      }
    } catch {
      // ignore
    }
  });
  handle.process.stderr?.on("error", () => {});

  const client: LSPClient = {
    connection: conn,
    process: handle.process,
    diagnostics: new Map(),
    openFiles: new Map(),
    listeners: new Map(),
    stderr,
    root,
    closed: false,
  };

  conn.onNotification(
    "textDocument/publishDiagnostics",
    (payload: { uri: string; diagnostics: Diagnostic[] }) => {
      let rawPath = payload.uri;
      try {
        rawPath = fileURLToPath(payload.uri);
      } catch {
        try {
          rawPath = decodeURIComponent(new URL(payload.uri).pathname);
        } catch {
          rawPath = payload.uri;
        }
      }

      const normalizedPath = normalizeFsPath(rawPath);

      client.diagnostics.set(normalizedPath, payload.diagnostics);

      const listeners1 = client.listeners.get(normalizedPath);
      const listeners2 = normalizedPath !== rawPath ? client.listeners.get(rawPath) : undefined;

      listeners1?.slice().forEach((fn) => {
        try {
          fn();
        } catch {
          // ignore listener errors
        }
      });
      listeners2?.slice().forEach((fn) => {
        try {
          fn();
        } catch {
          // ignore listener errors
        }
      });
    }
  );

  conn.onError(() => {});
  conn.onClose(() => {
    client.closed = true;
    onClientClosed();
  });

  conn.onRequest("workspace/configuration", () => [handle.initOptions ?? {}]);
  conn.onRequest("window/workDoneProgress/create", () => null);
  conn.onRequest("client/registerCapability", () => {});
  conn.onRequest("client/unregisterCapability", () => {});
  conn.onRequest("workspace/workspaceFolders", () => [
    { name: "workspace", uri: pathToFileURL(root).href },
  ]);

  handle.process.on("exit", () => {
    client.closed = true;
    onClientClosed();
  });
  handle.process.on("error", () => {
    client.closed = true;
    onClientProcessError();
  });

  conn.listen();

  try {
    const initResult = await timeout(
      conn.sendRequest(InitializeRequest.method, {
        rootUri: pathToFileURL(root).href,
        rootPath: root,
        processId: process.pid,
        workspaceFolders: [{ name: "workspace", uri: pathToFileURL(root).href }],
        initializationOptions: handle.initOptions ?? {},
        capabilities: {
          window: { workDoneProgress: true },
          workspace: { configuration: true },
          textDocument: {
            synchronization: { didSave: true, didOpen: true, didChange: true, didClose: true },
            publishDiagnostics: { versionSupport: true },
            diagnostic: { dynamicRegistration: false, relatedDocumentSupport: false },
          },
        },
      }),
      initTimeoutMs,
      `${serverId} init`
    );

    client.capabilities = (initResult as any)?.capabilities;

    conn.sendNotification(InitializedNotification.method, {});
    if (handle.initOptions) {
      conn.sendNotification("workspace/didChangeConfiguration", { settings: handle.initOptions });
    }

    return client;
  } catch (error) {
    client.closed = true;
    try {
      conn.end();
    } catch {
      // ignore
    }
    cleanupSpawnedServerHandle(handle);
    throw error;
  }
}

function cleanupSpawnedServerHandle(handle: SpawnedServerHandle): void {
  try {
    handle.process.stdin.end();
  } catch {
    // ignore
  }

  try {
    handle.process.stdout.destroy();
  } catch {
    // ignore
  }

  try {
    handle.process.stderr.destroy();
  } catch {
    // ignore
  }

  try {
    handle.process.kill();
  } catch {
    // ignore
  }
}

export async function initClientWithSpawn(
  params: InitClientWithSpawnParams
): Promise<LSPClient | undefined> {
  const {
    root,
    serverId,
    initTimeoutMs,
    spawn,
    normalizeFsPath,
    onClientClosed,
    onClientProcessError,
    onInitFailed,
    initializeClient = initializeSpawnedClient,
  } = params;

  let handle: SpawnedServerHandle | undefined;

  try {
    handle = await spawn(root);
    if (!handle) {
      onInitFailed();
      return undefined;
    }

    return await initializeClient({
      handle,
      root,
      serverId,
      initTimeoutMs,
      normalizeFsPath,
      onClientClosed,
      onClientProcessError,
    });
  } catch {
    if (handle) cleanupSpawnedServerHandle(handle);
    onInitFailed();
    return undefined;
  }
}

export async function stopLspClient(client: LSPClient, shutdownTimeoutMs = 1000): Promise<void> {
  const wasClosed = client.closed;
  client.closed = true;

  if (!wasClosed) {
    try {
      await Promise.race([
        client.connection.sendRequest("shutdown"),
        new Promise((resolve) => setTimeout(resolve, shutdownTimeoutMs)),
      ]);
    } catch {
      // ignore
    }

    try {
      void client.connection.sendNotification("exit").catch(() => {});
    } catch {
      // ignore
    }
  }

  try {
    client.connection.end();
  } catch {
    // ignore
  }

  try {
    client.process.kill();
  } catch {
    // ignore
  }
}
