import type { ChildProcessWithoutNullStreams } from "node:child_process";
import type { MessageConnection } from "vscode-jsonrpc/node.js";
import type { Diagnostic } from "vscode-languageserver-protocol";

export interface OpenFile {
  version: number;
  lastAccess: number;
}

export interface LSPClient {
  connection: MessageConnection;
  process: ChildProcessWithoutNullStreams;
  diagnostics: Map<string, Diagnostic[]>;
  openFiles: Map<string, OpenFile>;
  listeners: Map<string, Array<() => void>>;
  stderr: string[];
  capabilities?: any;
  root: string;
  closed: boolean;
}

export interface FileDiagnosticItem {
  file: string;
  diagnostics: Diagnostic[];
  status: "ok" | "timeout" | "error" | "unsupported";
  error?: string;
}

export interface FileDiagnosticsResult {
  items: FileDiagnosticItem[];
}

export function beginSpawnGeneration(spawnGeneration: Map<string, number>, key: string): number {
  const next = (spawnGeneration.get(key) ?? 0) + 1;
  spawnGeneration.set(key, next);
  return next;
}

export function invalidateSpawnGeneration(spawnGeneration: Map<string, number>, key: string): void {
  spawnGeneration.set(key, (spawnGeneration.get(key) ?? 0) + 1);
}

export function isSpawnGenerationCurrent(
  spawnGeneration: Map<string, number>,
  key: string,
  generation: number
): boolean {
  return (spawnGeneration.get(key) ?? 0) === generation;
}

export function extractServerIdFromKey(key: string): string {
  const idx = key.indexOf(":");
  return idx === -1 ? key : key.slice(0, idx);
}

export function selectRestartTargets(
  clients: Map<string, LSPClient>,
  matches: (key: string) => boolean
): Array<[string, LSPClient]> {
  return Array.from(clients.entries()).filter(([key]) => matches(key));
}

export function applyRestartStateForClient(
  clients: Map<string, LSPClient>,
  broken: Set<string>,
  spawning: Map<string, Promise<LSPClient | undefined>>,
  spawnGeneration: Map<string, number>,
  key: string
): void {
  clients.delete(key);
  broken.delete(key);
  spawning.delete(key);
  invalidateSpawnGeneration(spawnGeneration, key);
}

export function clearBrokenForMatches(
  broken: Set<string>,
  matches: (key: string) => boolean
): void {
  for (const key of Array.from(broken)) {
    if (matches(key)) broken.delete(key);
  }
}

export function clearSpawningForMatches(
  spawning: Map<string, Promise<LSPClient | undefined>>,
  spawnGeneration: Map<string, number>,
  matches: (key: string) => boolean
): void {
  for (const key of Array.from(spawning.keys())) {
    if (!matches(key)) continue;
    spawning.delete(key);
    invalidateSpawnGeneration(spawnGeneration, key);
  }
}

export function takeAllClients(clients: Map<string, LSPClient>): LSPClient[] {
  const values = Array.from(clients.values());
  clients.clear();
  return values;
}

export function invalidateAndClearAllSpawning(
  spawning: Map<string, Promise<LSPClient | undefined>>,
  spawnGeneration: Map<string, number>
): void {
  for (const key of spawning.keys()) {
    invalidateSpawnGeneration(spawnGeneration, key);
  }
  spawning.clear();
}
