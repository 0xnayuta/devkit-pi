/**
 * LSP Core - Language Server Protocol client management
 */
import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import {
	type CodeAction,
	type Command,
	type Diagnostic,
	DidChangeTextDocumentNotification,
	DidCloseTextDocumentNotification,
	DidOpenTextDocumentNotification,
	DidSaveTextDocumentNotification,
	DocumentDiagnosticReportKind,
	DocumentDiagnosticRequest,
	type DocumentSymbol,
	type Hover,
	type Location,
	type LocationLink,
	type SignatureHelp,
	type SymbolInformation,
	WorkspaceDiagnosticRequest,
	type WorkspaceEdit,
} from "vscode-languageserver-protocol";
import { NodeExternalCommandRunner, resolveExternalExecutable } from "../../shared/external-command.ts";
import {
	requestDefinitions,
	requestDocumentSymbols,
	requestHover,
	requestReferences,
	requestSignatureHelp,
} from "./actions.ts";
import {
	applyRestartStateForClient,
	beginSpawnGeneration,
	clearBrokenForMatches,
	clearSpawningForMatches,
	extractServerIdFromKey,
	type FileDiagnosticItem,
	type FileDiagnosticsResult,
	invalidateAndClearAllSpawning,
	isSpawnGenerationCurrent,
	type LSPClient,
	selectRestartTargets,
	takeAllClients,
} from "./client-lifecycle.ts";
import { initClientWithSpawn, stopLspClient } from "./client-manager.ts";
import { runDiagnosticsCycle } from "./diagnostics.ts";
import { requestCodeActions, requestRename } from "./edits.ts";
import { createRequestOrchestrator, type RequestOrchestrator } from "./request-orchestrator.ts";
import {
	createLspServers,
	findRootKotlin,
	findRootSwift,
	LANGUAGE_IDS,
	type LSPServerConfig,
} from "./server-registry.ts";
import { LspFileTooLargeError, readTextFileLimited } from "./source-files.ts";

// Config
const INIT_TIMEOUT_MS = 30000;
const MAX_OPEN_FILES = 30;
const IDLE_TIMEOUT_MS = 60_000;
const CLEANUP_INTERVAL_MS = 30_000;
const DIAGNOSTICS_WAIT_MS_DEFAULT = 3000;
const LSP_EXTERNAL_COMMAND_TIMEOUT_MS = 120_000;

export function diagnosticsWaitMsForFile(filePath: string): number {
	const ext = path.extname(filePath).toLowerCase();
	if (ext === ".kt" || ext === ".kts") return 30000;
	if (ext === ".swift") return 20000;
	if (ext === ".rs") return 20000;
	if ([".c", ".cc", ".cpp", ".cxx", ".h", ".hpp", ".hxx", ".inc"].includes(ext)) return 20000;
	return DIAGNOSTICS_WAIT_MS_DEFAULT;
}

export { getCppCompilationDbHint, LANGUAGE_IDS } from "./server-registry.ts";

// Utilities
const LSP_EXTRA_SEARCH_PATHS = [
	"/usr/local/bin",
	"/opt/homebrew/bin",
	`${process.env.HOME}/.pub-cache/bin`,
	`${process.env.HOME}/fvm/default/bin`,
	`${process.env.HOME}/go/bin`,
	`${process.env.HOME}/.cargo/bin`,
];

const lspExternalCommandRunner = new NodeExternalCommandRunner();

function which(cmd: string): string | undefined {
	return resolveExternalExecutable(cmd, { extraSearchPaths: LSP_EXTRA_SEARCH_PATHS });
}

function normalizeFsPath(p: string): string {
	try {
		// realpathSync.native is faster on some platforms, but not always present
		const realpathWithNative = fs.realpathSync as typeof fs.realpathSync & {
			native?: (path: fs.PathLike) => string;
		};
		const fn = realpathWithNative.native ?? fs.realpathSync;
		return fn(p);
	} catch {
		return path.resolve(p);
	}
}

function isPathInside(parent: string, child: string): boolean {
	const relative = path.relative(parent, child);
	return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function simpleSpawn(bin: string, args: string[] = ["--stdio"]) {
	return async (root: string) => {
		const cmd = which(bin);
		if (!cmd) return undefined;
		return { process: spawn(cmd, args, { cwd: root, stdio: ["pipe", "pipe", "pipe"] }) };
	};
}

async function spawnChecked(
	cmd: string,
	args: string[],
	cwd: string
): Promise<ChildProcessWithoutNullStreams | undefined> {
	try {
		const child = spawn(cmd, args, { cwd, stdio: ["pipe", "pipe", "pipe"] });

		// If the process exits immediately (e.g. unsupported flag), treat it as a failure
		return await new Promise((resolve) => {
			let settled = false;

			const cleanup = () => {
				child.removeListener("exit", onExit);
				child.removeListener("error", onError);
			};

			let timer: NodeJS.Timeout | null = null;

			const finish = (value: ChildProcessWithoutNullStreams | undefined) => {
				if (settled) return;
				settled = true;
				if (timer) clearTimeout(timer);
				cleanup();
				resolve(value);
			};

			const onExit = () => finish(undefined);
			const onError = () => finish(undefined);

			child.once("exit", onExit);
			child.once("error", onError);

			timer = setTimeout(() => finish(child), 200);
			timer.unref?.();
		});
	} catch {
		return undefined;
	}
}

async function spawnWithFallback(
	cmd: string,
	argsVariants: string[][],
	cwd: string
): Promise<ChildProcessWithoutNullStreams | undefined> {
	for (const args of argsVariants) {
		const child = await spawnChecked(cmd, args, cwd);
		if (child) return child;
	}
	return undefined;
}

async function runCommand(cmd: string, args: string[], cwd: string): Promise<boolean> {
	try {
		const result = await lspExternalCommandRunner.run(
			{ executable: cmd, args },
			{ cwd, timeoutMs: LSP_EXTERNAL_COMMAND_TIMEOUT_MS }
		);
		return !result.timedOut && result.exitCode === 0;
	} catch {
		return false;
	}
}

async function ensureJetBrainsKotlinLspInstalled(): Promise<string | undefined> {
	// Opt-in download (to avoid surprising network activity)
	const allowDownload =
		process.env.PI_LSP_AUTO_DOWNLOAD_KOTLIN_LSP === "1" || process.env.PI_LSP_AUTO_DOWNLOAD_KOTLIN_LSP === "true";
	const installDir = path.join(os.homedir(), ".pi", "agent", "lsp", "kotlin-ls");
	const launcher =
		process.platform === "win32" ? path.join(installDir, "kotlin-lsp.cmd") : path.join(installDir, "kotlin-lsp.sh");

	if (fs.existsSync(launcher)) return launcher;
	if (!allowDownload) return undefined;

	const curl = which("curl");
	const unzip = which("unzip");
	if (!curl || !unzip) return undefined;

	try {
		// Determine latest version
		const res = await fetch("https://api.github.com/repos/Kotlin/kotlin-lsp/releases/latest", {
			headers: { "User-Agent": "pi-lsp" },
		});
		if (!res.ok) return undefined;
		const release = (await res.json()) as { name?: unknown; tag_name?: unknown };
		const versionRaw = (release.name || release.tag_name || "").toString();
		const version = versionRaw.replace(/^v/, "");
		if (!version) return undefined;

		// Map platform/arch to JetBrains naming
		const platform = process.platform;
		const arch = process.arch;

		let kotlinArch: string = arch;
		if (arch === "arm64") kotlinArch = "aarch64";
		else if (arch === "x64") kotlinArch = "x64";

		let kotlinPlatform: string = platform;
		if (platform === "darwin") kotlinPlatform = "mac";
		else if (platform === "linux") kotlinPlatform = "linux";
		else if (platform === "win32") kotlinPlatform = "win";

		const supportedCombos = new Set([
			"mac-x64",
			"mac-aarch64",
			"linux-x64",
			"linux-aarch64",
			"win-x64",
			"win-aarch64",
		]);
		const combo = `${kotlinPlatform}-${kotlinArch}`;
		if (!supportedCombos.has(combo)) return undefined;

		const assetName = `kotlin-lsp-${version}-${kotlinPlatform}-${kotlinArch}.zip`;
		const url = `https://download-cdn.jetbrains.com/kotlin-lsp/${version}/${assetName}`;

		fs.mkdirSync(installDir, { recursive: true });
		const zipPath = path.join(installDir, "kotlin-lsp.zip");

		const okDownload = await runCommand(curl, ["-L", "-o", zipPath, url], installDir);
		if (!okDownload || !fs.existsSync(zipPath)) return undefined;

		const okUnzip = await runCommand(unzip, ["-o", zipPath, "-d", installDir], installDir);
		try {
			fs.rmSync(zipPath, { force: true });
		} catch {}
		if (!okUnzip) return undefined;

		if (process.platform !== "win32") {
			try {
				fs.chmodSync(launcher, 0o755);
			} catch {}
		}

		return fs.existsSync(launcher) ? launcher : undefined;
	} catch {
		return undefined;
	}
}

async function spawnKotlinLanguageServer(root: string): Promise<ChildProcessWithoutNullStreams | undefined> {
	// Prefer JetBrains Kotlin LSP (Kotlin/kotlin-lsp) – better diagnostics for Gradle/Android projects.
	const explicit = process.env.PI_LSP_KOTLIN_LSP_PATH;
	if (explicit && fs.existsSync(explicit)) {
		return spawnWithFallback(explicit, [["--stdio"]], root);
	}

	const jetbrains =
		which("kotlin-lsp") ||
		which("kotlin-lsp.sh") ||
		which("kotlin-lsp.cmd") ||
		(await ensureJetBrainsKotlinLspInstalled());
	if (jetbrains) {
		return spawnWithFallback(jetbrains, [["--stdio"]], root);
	}

	// Fallback: org.javacs/kotlin-language-server (often lacks diagnostics without full classpath)
	const kls = which("kotlin-language-server");
	if (!kls) return undefined;
	return spawnWithFallback(kls, [[]], root);
}

async function spawnSourcekitLsp(root: string): Promise<ChildProcessWithoutNullStreams | undefined> {
	const direct = which("sourcekit-lsp");
	if (direct) return spawnWithFallback(direct, [[], ["--stdio"]], root);

	// macOS/Xcode: sourcekit-lsp is often available via xcrun
	const xcrun = which("xcrun");
	if (!xcrun) return undefined;
	return spawnWithFallback(xcrun, [["sourcekit-lsp"], ["sourcekit-lsp", "--stdio"]], root);
}

// Server Configs
export const LSP_SERVERS: LSPServerConfig[] = createLspServers({
	which,
	spawnSimple: simpleSpawn,
	spawnKotlinLanguageServer,
	spawnSourcekitLsp,
	spawnProcess: (cmd, args, cwd) => spawn(cmd, args, { cwd, stdio: ["pipe", "pipe", "pipe"] }),
});

// Singleton Manager
let sharedManager: LSPManager | null = null;
let managerCwd: string | null = null;

export function getOrCreateManager(cwd: string): LSPManager {
	if (!sharedManager || managerCwd !== cwd) {
		sharedManager?.shutdown().catch(() => {});
		sharedManager = new LSPManager(cwd);
		managerCwd = cwd;
	}
	return sharedManager;
}

export async function shutdownManager(): Promise<void> {
	const manager = sharedManager;
	if (!manager) return;

	// Clear singleton pointers first so new requests never receive a manager
	// that's currently being shut down.
	sharedManager = null;
	managerCwd = null;

	await manager.shutdown();
}

// LSP Manager
export class LSPManager {
	private clients = new Map<string, LSPClient>();
	private spawning = new Map<string, Promise<LSPClient | undefined>>();
	private spawnGeneration = new Map<string, number>();
	private broken = new Set<string>();
	private cwd: string;
	private cleanupTimer: NodeJS.Timeout | null = null;
	private readonly requestOrchestrator: RequestOrchestrator;

	constructor(cwd: string) {
		this.cwd = normalizeFsPath(path.resolve(cwd));
		this.requestOrchestrator = createRequestOrchestrator({
			loadFile: (filePath) => this.loadFile(filePath),
			openOrUpdate: (clients, absPath, uri, langId, content, evict) =>
				this.openOrUpdate(clients, absPath, uri, langId, content, evict),
		});
		this.cleanupTimer = setInterval(() => this.cleanupIdleFiles(), CLEANUP_INTERVAL_MS);
		this.cleanupTimer.unref();
	}

	private cleanupIdleFiles() {
		const now = Date.now();
		for (const client of this.clients.values()) {
			for (const [fp, state] of client.openFiles) {
				if (now - state.lastAccess > IDLE_TIMEOUT_MS) this.closeFile(client, fp);
			}
		}
	}

	private closeFile(client: LSPClient, absPath: string) {
		if (!client.openFiles.has(absPath)) return;
		client.openFiles.delete(absPath);
		if (client.closed) return;
		try {
			void client.connection
				.sendNotification(DidCloseTextDocumentNotification.method, {
					textDocument: { uri: pathToFileURL(absPath).href },
				})
				.catch(() => {});
		} catch {}
	}

	private evictLRU(client: LSPClient) {
		if (client.openFiles.size <= MAX_OPEN_FILES) return;
		let oldest: { path: string; time: number } | null = null;
		for (const [fp, s] of client.openFiles) {
			if (!oldest || s.lastAccess < oldest.time) oldest = { path: fp, time: s.lastAccess };
		}
		if (oldest) this.closeFile(client, oldest.path);
	}

	private key(id: string, root: string) {
		return `${id}:${root}`;
	}

	private async initClient(config: LSPServerConfig, root: string): Promise<LSPClient | undefined> {
		const k = this.key(config.id, root);
		return initClientWithSpawn({
			root,
			serverId: config.id,
			initTimeoutMs: INIT_TIMEOUT_MS,
			spawn: config.spawn,
			normalizeFsPath,
			onClientClosed: () => {
				this.clients.delete(k);
			},
			onClientProcessError: () => {
				this.clients.delete(k);
				this.broken.add(k);
			},
			onInitFailed: () => {
				this.broken.add(k);
			},
		});
	}

	async getClientsForFile(filePath: string): Promise<LSPClient[]> {
		const absPath = this.resolveFilePath(filePath);
		const ext = path.extname(absPath);
		const clients: LSPClient[] = [];

		for (const config of LSP_SERVERS) {
			if (!config.extensions.includes(ext)) continue;
			const root = config.findRoot(absPath, this.cwd);
			if (!root) continue;
			const k = this.key(config.id, root);
			if (this.broken.has(k)) continue;

			const existing = this.clients.get(k);
			if (existing) {
				clients.push(existing);
				continue;
			}

			let generation = this.spawnGeneration.get(k) ?? 0;
			if (!this.spawning.has(k)) {
				generation = beginSpawnGeneration(this.spawnGeneration, k);
				const p = this.initClient(config, root);
				this.spawning.set(k, p);
				p.finally(() => {
					if (this.spawning.get(k) === p) this.spawning.delete(k);
				});
			}

			const pending = this.spawning.get(k);
			const client = pending ? await pending : undefined;
			if (!client) continue;

			if (isSpawnGenerationCurrent(this.spawnGeneration, k, generation)) {
				this.clients.set(k, client);
				clients.push(client);
			} else {
				await stopLspClient(client);
			}
		}
		return clients;
	}

	resolveFilePath(fp: string) {
		const abs = normalizeFsPath(path.isAbsolute(fp) ? fp : path.resolve(this.cwd, fp));
		if (!isPathInside(this.cwd, abs)) {
			throw new Error(`LSP file access outside workspace is not allowed: ${fp}`);
		}
		return abs;
	}

	private resolve(fp: string) {
		return this.resolveFilePath(fp);
	}
	private langId(fp: string) {
		return LANGUAGE_IDS[path.extname(fp)] || "plaintext";
	}
	private readFile(fp: string): string | null {
		try {
			return readTextFileLimited(fp);
		} catch (error) {
			if (error instanceof LspFileTooLargeError) throw error;
			return null;
		}
	}

	private explainNoLsp(absPath: string): string {
		const ext = path.extname(absPath);

		if (ext === ".kt" || ext === ".kts") {
			const root = findRootKotlin(absPath, this.cwd);
			if (!root)
				return `No Kotlin project root detected (looked for settings.gradle(.kts), build.gradle(.kts), gradlew, pom.xml under cwd)`;

			const hasJetbrains = !!(
				which("kotlin-lsp") ||
				which("kotlin-lsp.sh") ||
				which("kotlin-lsp.cmd") ||
				process.env.PI_LSP_KOTLIN_LSP_PATH
			);
			const hasKls = !!which("kotlin-language-server");

			if (!hasJetbrains && !hasKls) {
				return "No Kotlin LSP binary found. Install Kotlin/kotlin-lsp (recommended) or org.javacs/kotlin-language-server.";
			}

			const k = this.key("kotlin", root);
			if (this.broken.has(k)) return `Kotlin LSP failed to initialize for root: ${root}`;

			if (!hasJetbrains && hasKls) {
				return "Kotlin LSP is running via kotlin-language-server, but that server often does not produce diagnostics for Gradle/Android projects. Prefer Kotlin/kotlin-lsp.";
			}

			return `Kotlin LSP unavailable for root: ${root}`;
		}

		if (ext === ".swift") {
			const root = findRootSwift(absPath, this.cwd);
			if (!root)
				return `No Swift project root detected (looked for Package.swift, *.xcodeproj, *.xcworkspace under cwd)`;
			if (!which("sourcekit-lsp") && !which("xcrun")) return "sourcekit-lsp not found (and xcrun missing)";
			const k = this.key("swift", root);
			if (this.broken.has(k)) return `sourcekit-lsp failed to initialize for root: ${root}`;
			return `Swift LSP unavailable for root: ${root}`;
		}

		return `No LSP for ${ext}`;
	}

	private toPos(line: number, col: number) {
		return { line: Math.max(0, line - 1), character: Math.max(0, col - 1) };
	}

	private normalizeLocs(result: Location | Location[] | LocationLink[] | null | undefined): Location[] {
		if (!result) return [];
		const items = Array.isArray(result) ? result : [result];
		if (!items.length) return [];
		if ("uri" in items[0] && "range" in items[0]) return items as Location[];
		return (items as LocationLink[]).map((l) => ({
			uri: l.targetUri,
			range: l.targetSelectionRange ?? l.targetRange,
		}));
	}

	private normalizeSymbols(result: DocumentSymbol[] | SymbolInformation[] | null | undefined): DocumentSymbol[] {
		if (!result?.length) return [];
		const first = result[0];
		if ("location" in first) {
			return (result as SymbolInformation[]).map((s) => ({
				name: s.name,
				kind: s.kind,
				range: s.location.range,
				selectionRange: s.location.range,
				detail: s.containerName,
				tags: s.tags,
				deprecated: s.deprecated,
				children: [],
			}));
		}
		return result as DocumentSymbol[];
	}

	private async openOrUpdate(
		clients: LSPClient[],
		absPath: string,
		uri: string,
		langId: string,
		content: string,
		evict = true
	) {
		const now = Date.now();
		for (const client of clients) {
			if (client.closed) continue;
			const state = client.openFiles.get(absPath);
			try {
				if (state) {
					const v = state.version + 1;
					client.openFiles.set(absPath, { version: v, lastAccess: now });
					void client.connection
						.sendNotification(DidChangeTextDocumentNotification.method, {
							textDocument: { uri, version: v },
							contentChanges: [{ text: content }],
						})
						.catch(() => {});
				} else {
					// For some servers (e.g. kotlin-language-server), diagnostics only start flowing after a didChange.
					// We open at version 0, then immediately send a full-content didChange at version 1.
					client.openFiles.set(absPath, { version: 1, lastAccess: now });
					void client.connection
						.sendNotification(DidOpenTextDocumentNotification.method, {
							textDocument: { uri, languageId: langId, version: 0, text: content },
						})
						.catch(() => {});
					void client.connection
						.sendNotification(DidChangeTextDocumentNotification.method, {
							textDocument: { uri, version: 1 },
							contentChanges: [{ text: content }],
						})
						.catch(() => {});
					if (evict) this.evictLRU(client);
				}
				// Send didSave to trigger analysis (important for TypeScript)
				void client.connection
					.sendNotification(DidSaveTextDocumentNotification.method, {
						textDocument: { uri },
						text: content,
					})
					.catch(() => {});
			} catch {}
		}
	}

	private async loadFile(filePath: string) {
		const absPath = this.resolve(filePath);
		const content = this.readFile(absPath);
		if (content === null) return null;
		const clients = await this.getClientsForFile(absPath);
		if (!clients.length) return null;
		return {
			clients,
			absPath,
			uri: pathToFileURL(absPath).href,
			langId: this.langId(absPath),
			content,
		};
	}

	private waitForDiagnostics(client: LSPClient, absPath: string, timeoutMs: number, isNew: boolean): Promise<boolean> {
		return new Promise((resolve) => {
			if (client.closed) return resolve(false);

			let resolved = false;
			let settleTimer: NodeJS.Timeout | null = null;
			let listener: () => void = () => {};

			const cleanupListener = () => {
				const listeners = client.listeners.get(absPath);
				if (!listeners) return;
				const idx = listeners.indexOf(listener);
				if (idx !== -1) listeners.splice(idx, 1);
				if (listeners.length === 0) client.listeners.delete(absPath);
			};

			const finish = (value: boolean) => {
				if (resolved) return;
				resolved = true;
				if (settleTimer) clearTimeout(settleTimer);
				clearTimeout(timer);
				cleanupListener();
				resolve(value);
			};

			// Some servers publish diagnostics multiple times (often empty first, then real results).
			// For new documents, if diagnostics are still empty, debounce a bit.
			listener = () => {
				if (resolved) return;

				const current = client.diagnostics.get(absPath);
				if (current && current.length > 0) return finish(true);

				if (!isNew) return finish(true);

				if (settleTimer) clearTimeout(settleTimer);
				settleTimer = setTimeout(() => finish(true), 2500);
				settleTimer.unref?.();
			};

			const timer = setTimeout(() => finish(false), timeoutMs);
			timer.unref?.();

			const listeners = client.listeners.get(absPath) || [];
			listeners.push(listener);
			client.listeners.set(absPath, listeners);
		});
	}

	private async pullDiagnostics(
		client: LSPClient,
		absPath: string,
		uri: string
	): Promise<{ diagnostics: Diagnostic[]; responded: boolean }> {
		if (client.closed) return { diagnostics: [], responded: false };

		// Only attempt Pull Diagnostics if the server advertises support.
		// (Some servers throw and log noisy errors if we call these methods.)
		if (!client.capabilities || !(client.capabilities as { diagnosticProvider?: unknown }).diagnosticProvider) {
			return { diagnostics: [], responded: false };
		}

		// Prefer new Pull Diagnostics if supported by the server
		try {
			const res = (await client.connection.sendRequest(DocumentDiagnosticRequest.method, {
				textDocument: { uri },
			})) as { kind?: unknown; items?: unknown };

			if (res.kind === DocumentDiagnosticReportKind.Full) {
				return { diagnostics: Array.isArray(res.items) ? (res.items as Diagnostic[]) : [], responded: true };
			}
			if (res.kind === DocumentDiagnosticReportKind.Unchanged) {
				return { diagnostics: client.diagnostics.get(absPath) || [], responded: true };
			}
			if (Array.isArray(res.items)) {
				return { diagnostics: res.items as Diagnostic[], responded: true };
			}
			return { diagnostics: [], responded: true };
		} catch {
			// ignore
		}

		// Fallback: some servers only support WorkspaceDiagnosticRequest
		try {
			const res = (await client.connection.sendRequest(WorkspaceDiagnosticRequest.method, {
				previousResultIds: [],
			})) as { items?: unknown };

			const items = Array.isArray(res.items) ? res.items : [];
			const match = items.find((it) => {
				if (!it || typeof it !== "object") return false;
				return (it as { uri?: unknown }).uri === uri;
			}) as { kind?: unknown; items?: unknown } | undefined;
			if (match?.kind === DocumentDiagnosticReportKind.Full) {
				return { diagnostics: Array.isArray(match.items) ? (match.items as Diagnostic[]) : [], responded: true };
			}
			if (Array.isArray(match?.items)) {
				return { diagnostics: match.items as Diagnostic[], responded: true };
			}
			return { diagnostics: [], responded: true };
		} catch {
			return { diagnostics: [], responded: false };
		}
	}

	async touchFileAndWait(
		filePath: string,
		timeoutMs: number
	): Promise<{
		diagnostics: Diagnostic[];
		receivedResponse: boolean;
		unsupported?: boolean;
		error?: string;
	}> {
		const absPath = this.resolve(filePath);

		if (!fs.existsSync(absPath)) {
			return {
				diagnostics: [],
				receivedResponse: false,
				unsupported: true,
				error: "File not found",
			};
		}

		const content = this.readFile(absPath);
		if (content === null) {
			return {
				diagnostics: [],
				receivedResponse: false,
				unsupported: true,
				error: "Could not read file",
			};
		}

		const clients = await this.getClientsForFile(absPath);
		if (!clients.length) {
			return {
				diagnostics: [],
				receivedResponse: false,
				unsupported: true,
				error: this.explainNoLsp(absPath),
			};
		}

		const uri = pathToFileURL(absPath).href;
		const langId = this.langId(absPath);
		const isNew = clients.some((c) => !c.openFiles.has(absPath));

		const { diagnostics, responded } = await runDiagnosticsCycle({
			clients,
			absPath,
			uri,
			langId,
			content,
			timeoutMs,
			isNew,
			waitForDiagnostics: (client, file, waitMs, newFile) => this.waitForDiagnostics(client, file, waitMs, newFile),
			openOrUpdate: (targetClients, file, fileUri, languageId, text, evict) =>
				this.requestOrchestrator.syncFileToClients(
					{
						clients: targetClients,
						absPath: file,
						uri: fileUri,
						langId: languageId,
						content: text,
					},
					evict
				),
			pullDiagnostics: (client, file, fileUri) => this.pullDiagnostics(client, file, fileUri),
		});

		return { diagnostics, receivedResponse: responded };
	}

	async getDiagnosticsForFiles(files: string[], timeoutMs: number): Promise<FileDiagnosticsResult> {
		const unique = [...new Set(files.map((f) => this.resolve(f)))];
		const results: FileDiagnosticItem[] = [];
		const toClose: Map<LSPClient, string[]> = new Map();

		for (const absPath of unique) {
			if (!fs.existsSync(absPath)) {
				results.push({ file: absPath, diagnostics: [], status: "error", error: "File not found" });
				continue;
			}

			let content: string | null;
			try {
				content = this.readFile(absPath);
			} catch (error) {
				if (error instanceof LspFileTooLargeError) {
					results.push({
						file: absPath,
						diagnostics: [],
						status: "error",
						error: error.message,
					});
					continue;
				}
				throw error;
			}
			if (content === null) {
				results.push({
					file: absPath,
					diagnostics: [],
					status: "error",
					error: "Could not read file",
				});
				continue;
			}

			let clients: LSPClient[];
			try {
				clients = await this.getClientsForFile(absPath);
			} catch (e) {
				results.push({ file: absPath, diagnostics: [], status: "error", error: String(e) });
				continue;
			}

			if (!clients.length) {
				results.push({
					file: absPath,
					diagnostics: [],
					status: "unsupported",
					error: this.explainNoLsp(absPath),
				});
				continue;
			}

			const uri = pathToFileURL(absPath).href;
			const langId = this.langId(absPath);
			const isNew = clients.some((c) => !c.openFiles.has(absPath));

			for (const c of clients) {
				if (!c.openFiles.has(absPath)) {
					if (!toClose.has(c)) toClose.set(c, []);
					toClose.get(c)!.push(absPath);
				}
			}

			const { diagnostics: diags, responded } = await runDiagnosticsCycle({
				clients,
				absPath,
				uri,
				langId,
				content,
				timeoutMs,
				isNew,
				evict: false,
				waitForDiagnostics: (client, file, waitMs, newFile) =>
					this.waitForDiagnostics(client, file, waitMs, newFile),
				openOrUpdate: (targetClients, file, fileUri, languageId, text, evict) =>
					this.requestOrchestrator.syncFileToClients(
						{
							clients: targetClients,
							absPath: file,
							uri: fileUri,
							langId: languageId,
							content: text,
						},
						evict
					),
				pullDiagnostics: (client, file, fileUri) => this.pullDiagnostics(client, file, fileUri),
			});

			if (!responded && !diags.length) {
				results.push({
					file: absPath,
					diagnostics: [],
					status: "timeout",
					error: "LSP did not respond",
				});
			} else {
				results.push({ file: absPath, diagnostics: diags, status: "ok" });
			}
		}

		// Cleanup opened files
		for (const [c, fps] of toClose) {
			for (const fp of fps) this.closeFile(c, fp);
		}
		for (const c of this.clients.values()) {
			while (c.openFiles.size > MAX_OPEN_FILES) this.evictLRU(c);
		}

		return { items: results };
	}

	async getDefinition(fp: string, line: number, col: number): Promise<Location[]> {
		const l = await this.requestOrchestrator.prepareFileContext(fp);
		if (!l) return [];
		await this.requestOrchestrator.syncFileToClients(l);
		const pos = this.toPos(line, col);
		return requestDefinitions({ clients: l.clients, uri: l.uri }, pos, (raw) => this.normalizeLocs(raw));
	}

	async getReferences(fp: string, line: number, col: number): Promise<Location[]> {
		const l = await this.requestOrchestrator.prepareFileContext(fp);
		if (!l) return [];
		await this.requestOrchestrator.syncFileToClients(l);
		const pos = this.toPos(line, col);
		return requestReferences({ clients: l.clients, uri: l.uri }, pos, (raw) => this.normalizeLocs(raw));
	}

	async getHover(fp: string, line: number, col: number): Promise<Hover | null> {
		const l = await this.requestOrchestrator.prepareFileContext(fp);
		if (!l) return null;
		await this.requestOrchestrator.syncFileToClients(l);
		const pos = this.toPos(line, col);
		return requestHover({ clients: l.clients, uri: l.uri }, pos);
	}

	async getSignatureHelp(fp: string, line: number, col: number): Promise<SignatureHelp | null> {
		const l = await this.requestOrchestrator.prepareFileContext(fp);
		if (!l) return null;
		await this.requestOrchestrator.syncFileToClients(l);
		const pos = this.toPos(line, col);
		return requestSignatureHelp({ clients: l.clients, uri: l.uri }, pos);
	}

	async getDocumentSymbols(fp: string): Promise<DocumentSymbol[]> {
		const l = await this.requestOrchestrator.prepareFileContext(fp);
		if (!l) return [];
		await this.requestOrchestrator.syncFileToClients(l);
		return requestDocumentSymbols({ clients: l.clients, uri: l.uri }, (raw) =>
			this.normalizeSymbols(raw as DocumentSymbol[] | SymbolInformation[] | null | undefined)
		);
	}

	async rename(fp: string, line: number, col: number, newName: string): Promise<WorkspaceEdit | null> {
		const l = await this.requestOrchestrator.prepareFileContext(fp);
		if (!l) return null;
		await this.requestOrchestrator.syncFileToClients(l);
		const pos = this.toPos(line, col);
		return requestRename({ clients: l.clients, uri: l.uri, absPath: l.absPath, content: l.content }, pos, newName);
	}

	async getCodeActions(
		fp: string,
		startLine: number,
		startCol: number,
		endLine?: number,
		endCol?: number
	): Promise<(CodeAction | Command)[]> {
		const l = await this.requestOrchestrator.prepareFileContext(fp);
		if (!l) return [];
		await this.requestOrchestrator.syncFileToClients(l);

		const start = this.toPos(startLine, startCol);
		const end = this.toPos(endLine ?? startLine, endCol ?? startCol);
		return requestCodeActions({ clients: l.clients, uri: l.uri, absPath: l.absPath, content: l.content }, start, end);
	}

	async restartServers(serverIds?: string[]): Promise<number> {
		const ids = new Set((serverIds || []).filter(Boolean));
		if (ids.size === 0) return 0;

		const matches = (key: string) => ids.has(extractServerIdFromKey(key));

		let restarted = 0;
		const targets = selectRestartTargets(this.clients, matches);

		for (const [key, client] of targets) {
			applyRestartStateForClient(this.clients, this.broken, this.spawning, this.spawnGeneration, key);
			restarted++;
			await stopLspClient(client);
		}

		clearBrokenForMatches(this.broken, matches);
		clearSpawningForMatches(this.spawning, this.spawnGeneration, matches);

		return restarted;
	}

	async shutdown() {
		if (this.cleanupTimer) {
			clearInterval(this.cleanupTimer);
			this.cleanupTimer = null;
		}
		const clients = takeAllClients(this.clients);
		invalidateAndClearAllSpawning(this.spawning, this.spawnGeneration);
		this.broken.clear();
		for (const c of clients) await stopLspClient(c);
	}
}

// Diagnostic formatting facade exports
export {
	collectSymbols,
	filterDiagnosticsBySeverity,
	formatDiagnostic,
	type SeverityFilter,
} from "./formatters.ts";
// Source file facade exports
export {
	DEFAULT_LSP_MAX_SOURCE_FILE_BYTES,
	findSymbolPosition,
	LspFileTooLargeError,
	readTextFileLimited,
	resolvePosition,
	uriToPath,
} from "./source-files.ts";
