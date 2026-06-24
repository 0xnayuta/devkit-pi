import assert from "node:assert/strict";
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, it } from "node:test";
import type { MessageConnection } from "vscode-jsonrpc/node.js";
import { mergeConfig } from "../../src/config/load-config.ts";
import type { LSPClient } from "../../src/modules/lsp/client-lifecycle.ts";
import * as lspCore from "../../src/modules/lsp/core.ts";
import {
	DEFAULT_LSP_MAX_SOURCE_FILE_BYTES,
	LspFileTooLargeError,
	readTextFileLimited,
} from "../../src/modules/lsp/core.ts";
import { registerLspModule } from "../../src/modules/lsp/register.ts";
import { LSP_ACTIONS } from "../../src/modules/lsp/tool.ts";
import { createLogger, createMemoryLoggerSink } from "../../src/shared/logger.ts";
import { PI_SUBAGENT_ALLOW_LSP, PI_SUBAGENT_CHILD, PI_SUBAGENT_LSP_ACTIONS } from "../../src/shared/types.ts";

function createPiMock() {
	const tools: any[] = [];
	const listeners: Record<string, Array<(...args: unknown[]) => void>> = {};
	const renderers: string[] = [];
	const messages: any[] = [];
	return {
		tools,
		listeners,
		renderers,
		messages,
		registerTool(tool: any) {
			tools.push(tool);
		},
		registerMessageRenderer(name: string) {
			renderers.push(name);
		},
		sendMessage(message: any, options: any) {
			messages.push({ message, options });
		},
		on(event: string, handler: (...args: unknown[]) => void) {
			listeners[event] ??= [];
			listeners[event].push(handler);
		},
	};
}

async function emit(
	pi: ReturnType<typeof createPiMock>,
	eventName: string,
	event: unknown = {},
	ctx: unknown = {}
): Promise<void> {
	for (const listener of pi.listeners[eventName] ?? []) {
		await listener(event, ctx);
	}
}

function createFakeLspClient(definitionResult?: unknown): {
	client: LSPClient;
	calls: {
		shutdownRequests: number;
		exitNotifications: number;
		connectionEnds: number;
		processKills: number;
	};
} {
	const calls = {
		shutdownRequests: 0,
		exitNotifications: 0,
		connectionEnds: 0,
		processKills: 0,
	};

	const connection = {
		sendRequest(method: string) {
			if (method === "shutdown") {
				calls.shutdownRequests += 1;
				return Promise.resolve(null);
			}
			if (method === "textDocument/definition") {
				return Promise.resolve(definitionResult ?? []);
			}
			return Promise.resolve(null);
		},
		sendNotification(method: string) {
			if (method === "exit") calls.exitNotifications += 1;
			return Promise.resolve();
		},
		end() {
			calls.connectionEnds += 1;
		},
		onNotification() {},
		onError() {},
		onClose() {},
		onRequest() {},
		listen() {},
	} as unknown as MessageConnection;

	const process = {
		kill() {
			calls.processKills += 1;
			return true;
		},
		on() {
			return undefined;
		},
	} as unknown as ChildProcessWithoutNullStreams;

	const client: LSPClient = {
		connection,
		process,
		diagnostics: new Map(),
		openFiles: new Map(),
		listeners: new Map(),
		stderr: [],
		root: "/fake-root",
		closed: false,
	};

	return { client, calls };
}

describe("lsp module", () => {
	const originalChild = process.env[PI_SUBAGENT_CHILD];
	const originalAllowLsp = process.env[PI_SUBAGENT_ALLOW_LSP];
	const originalLspActions = process.env[PI_SUBAGENT_LSP_ACTIONS];

	afterEach(() => {
		if (originalChild === undefined) delete process.env[PI_SUBAGENT_CHILD];
		else process.env[PI_SUBAGENT_CHILD] = originalChild;
		if (originalAllowLsp === undefined) delete process.env[PI_SUBAGENT_ALLOW_LSP];
		else process.env[PI_SUBAGENT_ALLOW_LSP] = originalAllowLsp;
		if (originalLspActions === undefined) delete process.env[PI_SUBAGENT_LSP_ACTIONS];
		else process.env[PI_SUBAGENT_LSP_ACTIONS] = originalLspActions;
	});

	it("registers the lsp tool and default hook events when enabled", () => {
		const pi = createPiMock();
		registerLspModule(pi as any, mergeConfig({}).lsp);

		assert.deepEqual(
			pi.tools.map((tool) => tool.name),
			["lsp"]
		);
		assert.equal(pi.listeners.agent_end?.length, 1);
		assert.equal(pi.listeners.tool_result?.length, 1);
		assert.equal(pi.listeners.session_shutdown?.length, 1);
		assert.deepEqual(pi.renderers, ["lsp-diagnostics"]);
	});

	it("does not register hook events when lsp hook is disabled", () => {
		const pi = createPiMock();
		registerLspModule(pi as any, mergeConfig({ lsp: { hook: { enabled: false } } }).lsp);

		assert.deepEqual(
			pi.tools.map((tool) => tool.name),
			["lsp"]
		);
		assert.equal(pi.listeners.agent_end, undefined);
		assert.equal(pi.listeners.session_shutdown?.length, 1);
		assert.equal(pi.renderers.length, 0);
	});

	it("session_start handler is branch-agnostic for lsp runtime state", async () => {
		const pi = createPiMock();
		registerLspModule(pi as any, mergeConfig({}).lsp);

		assert.ok((pi.listeners.session_start?.length ?? 0) >= 1);
		assert.equal(pi.listeners.session_shutdown?.length, 1);

		await assert.doesNotReject(async () => {
			await emit(
				pi,
				"session_start",
				{},
				{
					cwd: process.cwd(),
					sessionManager: {
						getBranch: () => {
							throw new Error("should not be called");
						},
					},
				}
			);
		});
	});

	it("session_shutdown handler is branch-agnostic and safe across repeated calls", async () => {
		const pi = createPiMock();
		registerLspModule(pi as any, mergeConfig({}).lsp);

		await assert.doesNotReject(async () => {
			await emit(pi, "session_shutdown", {}, { sessionManager: { getBranch: () => [{ type: "tool_result" }] } });
			await emit(
				pi,
				"session_shutdown",
				{},
				{
					sessionManager: {
						getBranch: () => {
							throw new Error("should not be called");
						},
					},
				}
			);
		});
	});

	it("does not register hook events when lsp hook mode is disabled", () => {
		const pi = createPiMock();
		registerLspModule(pi as any, mergeConfig({ lsp: { hook: { mode: "disabled" } } }).lsp);

		assert.deepEqual(
			pi.tools.map((tool) => tool.name),
			["lsp"]
		);
		assert.equal(pi.listeners.agent_end, undefined);
		assert.equal(pi.listeners.session_shutdown?.length, 1);
		assert.equal(pi.renderers.length, 0);
	});

	it("registers edit_write hook events without agent_end diagnostics", () => {
		const pi = createPiMock();
		registerLspModule(pi as any, mergeConfig({ lsp: { hook: { mode: "edit_write" } } }).lsp);

		assert.deepEqual(
			pi.tools.map((tool) => tool.name),
			["lsp"]
		);
		assert.equal(pi.listeners.tool_result?.length, 1);
		assert.equal(pi.listeners.agent_end?.length, 1);
		assert.deepEqual(pi.renderers, ["lsp-diagnostics"]);
	});

	it("does not register hook events in subagent child processes", () => {
		process.env[PI_SUBAGENT_CHILD] = "1";
		const pi = createPiMock();
		registerLspModule(pi as any, mergeConfig({}).lsp);

		assert.deepEqual(
			pi.tools.map((tool) => tool.name),
			["lsp"]
		);
		assert.equal(pi.listeners.agent_end, undefined);
		assert.equal(pi.listeners.session_shutdown?.length, 1);
	});

	it("does not register when lsp or lsp.tool is disabled", () => {
		const disabledModule = createPiMock();
		registerLspModule(disabledModule as any, mergeConfig({ lsp: { enabled: false } }).lsp);
		assert.equal(disabledModule.tools.length, 0);

		const disabledTool = createPiMock();
		registerLspModule(disabledTool as any, mergeConfig({ lsp: { tool: { enabled: false } } }).lsp);
		assert.equal(disabledTool.tools.length, 0);
	});

	it("lists server ids without starting a language server", async () => {
		const pi = createPiMock();
		registerLspModule(pi as any, mergeConfig({}).lsp);

		const result = await pi.tools[0].execute("call-1", { action: "servers" }, undefined, undefined, {
			cwd: process.cwd(),
		});

		assert.match(result.content[0].text, /action: servers/);
		assert.ok(result.details.servers.includes("typescript"));
	});

	it("deduplicates concurrent spawn for the same root", async () => {
		const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "devkit-pi-lsp-concurrency-"));
		const file = path.join(workspace, "main.ts");
		fs.writeFileSync(file, "export const x = 1;\n", "utf-8");
		fs.writeFileSync(path.join(workspace, "package.json"), "{}\n", "utf-8");

		const manager = new lspCore.LSPManager(workspace);
		const originalServers = [...lspCore.LSP_SERVERS];

		let initCalls = 0;
		const fakeClient = { id: "fake-client" };

		try {
			lspCore.LSP_SERVERS.splice(0, lspCore.LSP_SERVERS.length, {
				id: "typescript",
				extensions: [".ts"],
				findRoot: () => workspace,
				spawn: async () => undefined,
			});

			(manager as any).initClient = async () => {
				initCalls += 1;
				await new Promise((resolve) => setTimeout(resolve, 20));
				return fakeClient;
			};

			const [clientsA, clientsB] = await Promise.all([
				manager.getClientsForFile(file),
				manager.getClientsForFile(file),
			]);

			assert.equal(initCalls, 1);
			assert.equal(clientsA.length, 1);
			assert.equal(clientsB.length, 1);
			assert.equal(clientsA[0], fakeClient);
			assert.equal(clientsB[0], fakeClient);
		} finally {
			lspCore.LSP_SERVERS.splice(0, lspCore.LSP_SERVERS.length, ...originalServers);
			await manager.shutdown();
		}
	});

	it("does not write back client after shutdown during in-flight spawn", async () => {
		const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "devkit-pi-lsp-shutdown-race-"));
		const file = path.join(workspace, "main.ts");
		fs.writeFileSync(file, "export const x = 1;\n", "utf-8");
		fs.writeFileSync(path.join(workspace, "package.json"), "{}\n", "utf-8");

		const manager = new lspCore.LSPManager(workspace);
		const originalServers = [...lspCore.LSP_SERVERS];

		let resolveInit: (client: any) => void = () => {
			throw new Error("init resolver was not captured");
		};
		const { client: fakeClient, calls } = createFakeLspClient();

		try {
			lspCore.LSP_SERVERS.splice(0, lspCore.LSP_SERVERS.length, {
				id: "typescript",
				extensions: [".ts"],
				findRoot: () => workspace,
				spawn: async () => undefined,
			});

			(manager as any).initClient = async () => {
				const client = await new Promise<any>((resolve) => {
					resolveInit = resolve;
				});
				return client;
			};

			const pending = manager.getClientsForFile(file);
			await new Promise((resolve) => setTimeout(resolve, 0));

			await manager.shutdown();
			resolveInit(fakeClient);
			await pending;

			assert.equal((manager as any).clients.size, 0);
			assert.equal(calls.shutdownRequests, 1);
			assert.equal(calls.exitNotifications, 1);
			assert.equal(calls.connectionEnds, 1);
			assert.equal(calls.processKills, 1);
		} finally {
			lspCore.LSP_SERVERS.splice(0, lspCore.LSP_SERVERS.length, ...originalServers);
			await manager.shutdown();
		}
	});

	it("does not write back client after restart during in-flight spawn", async () => {
		const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "devkit-pi-lsp-restart-race-"));
		const file = path.join(workspace, "main.ts");
		fs.writeFileSync(file, "export const x = 1;\n", "utf-8");
		fs.writeFileSync(path.join(workspace, "package.json"), "{}\n", "utf-8");

		const manager = new lspCore.LSPManager(workspace);
		const originalServers = [...lspCore.LSP_SERVERS];

		let resolveInit: (client: any) => void = () => {
			throw new Error("init resolver was not captured");
		};
		const { client: fakeClient, calls } = createFakeLspClient();

		try {
			lspCore.LSP_SERVERS.splice(0, lspCore.LSP_SERVERS.length, {
				id: "typescript",
				extensions: [".ts"],
				findRoot: () => workspace,
				spawn: async () => undefined,
			});

			(manager as any).initClient = async () => {
				return await new Promise<any>((resolve) => {
					resolveInit = resolve;
				});
			};

			const pending = manager.getClientsForFile(file);
			await new Promise((resolve) => setTimeout(resolve, 0));

			await manager.restartServers(["typescript"]);
			resolveInit(fakeClient);
			await pending;

			assert.equal((manager as any).clients.size, 0);
			assert.equal(calls.shutdownRequests, 1);
			assert.equal(calls.exitNotifications, 1);
			assert.equal(calls.connectionEnds, 1);
			assert.equal(calls.processKills, 1);
		} finally {
			lspCore.LSP_SERVERS.splice(0, lspCore.LSP_SERVERS.length, ...originalServers);
			await manager.shutdown();
		}
	});

	it("keeps broken state after failed in-flight spawn and retries only after restart", async () => {
		const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "devkit-pi-lsp-broken-retry-"));
		const file = path.join(workspace, "main.ts");
		fs.writeFileSync(file, "export const x = 1;\n", "utf-8");
		fs.writeFileSync(path.join(workspace, "package.json"), "{}\n", "utf-8");

		const manager = new lspCore.LSPManager(workspace);
		const originalServers = [...lspCore.LSP_SERVERS];

		let spawnCalls = 0;

		try {
			lspCore.LSP_SERVERS.splice(0, lspCore.LSP_SERVERS.length, {
				id: "typescript",
				extensions: [".ts"],
				findRoot: () => workspace,
				spawn: async () => {
					spawnCalls += 1;
					await new Promise((resolve) => setTimeout(resolve, 20));
					return undefined;
				},
			});

			const [clientsA, clientsB] = await Promise.all([
				manager.getClientsForFile(file),
				manager.getClientsForFile(file),
			]);

			assert.equal(spawnCalls, 1);
			assert.deepEqual(clientsA, []);
			assert.deepEqual(clientsB, []);

			const clientsAfterBroken = await manager.getClientsForFile(file);
			assert.deepEqual(clientsAfterBroken, []);
			assert.equal(spawnCalls, 1);

			await manager.restartServers(["typescript"]);
			const clientsAfterRestart = await manager.getClientsForFile(file);
			assert.deepEqual(clientsAfterRestart, []);
			assert.equal(spawnCalls, 2);
		} finally {
			lspCore.LSP_SERVERS.splice(0, lspCore.LSP_SERVERS.length, ...originalServers);
			await manager.shutdown();
		}
	});

	it("LSP-RACE-001 restart + getClientsForFile race does not write stale generation client", async () => {
		const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "devkit-pi-lsp-race-001-"));
		const file = path.join(workspace, "main.ts");
		fs.writeFileSync(file, "export const x = 1;\n", "utf-8");
		fs.writeFileSync(path.join(workspace, "package.json"), "{}\n", "utf-8");

		const manager = new lspCore.LSPManager(workspace);
		const originalServers = [...lspCore.LSP_SERVERS];

		let resolveInit: (client: any) => void = () => {
			throw new Error("init resolver was not captured");
		};
		let initCalls = 0;
		const first = createFakeLspClient();
		const second = createFakeLspClient();

		try {
			lspCore.LSP_SERVERS.splice(0, lspCore.LSP_SERVERS.length, {
				id: "typescript",
				extensions: [".ts"],
				findRoot: () => workspace,
				spawn: async () => undefined,
			});

			(manager as any).initClient = async () => {
				initCalls += 1;
				if (initCalls === 1) {
					return await new Promise<any>((resolve) => {
						resolveInit = resolve;
					});
				}
				return second.client;
			};

			const pending = manager.getClientsForFile(file);
			await new Promise((resolve) => setTimeout(resolve, 0));

			await manager.restartServers(["typescript"]);
			resolveInit(first.client);
			const staleResult = await pending;
			const freshResult = await manager.getClientsForFile(file);

			assert.deepEqual(staleResult, []);
			assert.equal(freshResult.length, 1);
			assert.equal(freshResult[0], second.client);
			assert.equal(initCalls, 2);
			assert.equal((manager as any).clients.size, 1);

			assert.equal(first.calls.shutdownRequests, 1);
			assert.equal(first.calls.exitNotifications, 1);
			assert.equal(first.calls.connectionEnds, 1);
			assert.equal(first.calls.processKills, 1);
		} finally {
			lspCore.LSP_SERVERS.splice(0, lspCore.LSP_SERVERS.length, ...originalServers);
			await manager.shutdown();
		}
	});

	it("LSP-RACE-003 restarting one server id does not affect other server clients", async () => {
		const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "devkit-pi-lsp-race-003-"));
		const file = path.join(workspace, "main.ts");
		fs.writeFileSync(file, "export const x = 1;\n", "utf-8");
		fs.writeFileSync(path.join(workspace, "package.json"), "{}\n", "utf-8");

		const manager = new lspCore.LSPManager(workspace);
		const originalServers = [...lspCore.LSP_SERVERS];

		const stableClient = createFakeLspClient();
		const restartedOldClient = createFakeLspClient();
		const restartedNewClient = createFakeLspClient();
		let alphaInitCalls = 0;

		try {
			lspCore.LSP_SERVERS.splice(
				0,
				lspCore.LSP_SERVERS.length,
				{
					id: "alpha",
					extensions: [".ts"],
					findRoot: () => workspace,
					spawn: async () => undefined,
				},
				{
					id: "beta",
					extensions: [".ts"],
					findRoot: () => workspace,
					spawn: async () => undefined,
				}
			);

			(manager as any).initClient = async (config: any) => {
				if (config.id === "alpha") {
					alphaInitCalls += 1;
					return alphaInitCalls === 1 ? restartedOldClient.client : restartedNewClient.client;
				}
				return stableClient.client;
			};

			const firstClients = await manager.getClientsForFile(file);
			assert.equal(firstClients.length, 2);
			assert.ok(firstClients.includes(stableClient.client));
			assert.ok(firstClients.includes(restartedOldClient.client));

			const restarted = await manager.restartServers(["alpha"]);
			assert.equal(restarted, 1);

			const secondClients = await manager.getClientsForFile(file);
			assert.equal(secondClients.length, 2);
			assert.ok(secondClients.includes(stableClient.client));
			assert.ok(secondClients.includes(restartedNewClient.client));
			assert.equal(alphaInitCalls, 2);

			assert.equal(restartedOldClient.calls.shutdownRequests, 1);
			assert.equal(restartedOldClient.calls.exitNotifications, 1);
			assert.equal(stableClient.calls.shutdownRequests, 0);
			assert.equal(stableClient.calls.exitNotifications, 0);
		} finally {
			lspCore.LSP_SERVERS.splice(0, lspCore.LSP_SERVERS.length, ...originalServers);
			await manager.shutdown();
		}
	});

	it("LSP-REC-001 partial server init failure keeps remaining server actions available", async () => {
		const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "devkit-pi-lsp-rec-001-"));
		const file = path.join(workspace, "main.ts");
		fs.writeFileSync(file, "export const x = 1;\n", "utf-8");
		fs.writeFileSync(path.join(workspace, "package.json"), "{}\n", "utf-8");

		const manager = new lspCore.LSPManager(workspace);
		const originalServers = [...lspCore.LSP_SERVERS];

		const definitionLocation = {
			uri: "file:///tmp/def.ts",
			range: {
				start: { line: 0, character: 0 },
				end: { line: 0, character: 5 },
			},
		};
		const goodClient = createFakeLspClient([definitionLocation]);

		try {
			lspCore.LSP_SERVERS.splice(
				0,
				lspCore.LSP_SERVERS.length,
				{
					id: "bad-server",
					extensions: [".ts"],
					findRoot: () => workspace,
					spawn: async () => undefined,
				},
				{
					id: "good-server",
					extensions: [".ts"],
					findRoot: () => workspace,
					spawn: async () => undefined,
				}
			);

			(manager as any).initClient = async (config: any, root: string) => {
				if (config.id === "bad-server") {
					(manager as any).broken.add(`bad-server:${root}`);
					return undefined;
				}
				return goodClient.client;
			};

			const locations = await manager.getDefinition(file, 1, 1);

			assert.equal(locations.length, 1);
			assert.deepEqual(locations[0], definitionLocation);
			assert.equal((manager as any).broken.has(`bad-server:${workspace}`), true);
		} finally {
			lspCore.LSP_SERVERS.splice(0, lspCore.LSP_SERVERS.length, ...originalServers);
			await manager.shutdown();
		}
	});

	it("LSP-REC-003 restartServers subset clears only matched broken/spawning state", async () => {
		const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "devkit-pi-lsp-rec-003-tool-"));
		const file = path.join(workspace, "main.ts");
		fs.writeFileSync(file, "export const x = 1;\n", "utf-8");
		fs.writeFileSync(path.join(workspace, "package.json"), "{}\n", "utf-8");

		const manager = new lspCore.LSPManager(workspace);
		const originalServers = [...lspCore.LSP_SERVERS];

		const stableClient = createFakeLspClient();
		const restartedOldClient = createFakeLspClient();
		const restartedNewClient = createFakeLspClient();

		try {
			lspCore.LSP_SERVERS.splice(
				0,
				lspCore.LSP_SERVERS.length,
				{
					id: "alpha",
					extensions: [".ts"],
					findRoot: () => workspace,
					spawn: async () => undefined,
				},
				{
					id: "beta",
					extensions: [".ts"],
					findRoot: () => workspace,
					spawn: async () => undefined,
				}
			);

			let alphaInitCalls = 0;
			(manager as any).initClient = async (config: any) => {
				if (config.id === "alpha") {
					alphaInitCalls += 1;
					return alphaInitCalls === 1 ? restartedOldClient.client : restartedNewClient.client;
				}
				return stableClient.client;
			};

			await manager.getClientsForFile(file);
			(manager as any).broken.add(`beta:${workspace}`);
			(manager as any).spawning.set(`beta:${workspace}`, Promise.resolve(undefined));

			const restarted = await manager.restartServers(["alpha"]);
			assert.equal(restarted, 1);

			const alphaKey = `alpha:${workspace}`;
			const betaKey = `beta:${workspace}`;

			assert.equal((manager as any).broken.has(alphaKey), false);
			assert.equal((manager as any).spawning.has(alphaKey), false);

			assert.equal((manager as any).broken.has(betaKey), true);
			assert.equal((manager as any).spawning.has(betaKey), true);

			assert.equal(restartedOldClient.calls.shutdownRequests, 1);
			assert.equal(restartedOldClient.calls.exitNotifications, 1);
		} finally {
			lspCore.LSP_SERVERS.splice(0, lspCore.LSP_SERVERS.length, ...originalServers);
			await manager.shutdown();
		}
	});

	it("restartServers no-op variants keep state unchanged", async () => {
		const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "devkit-pi-lsp-restart-noop-"));
		const manager = new lspCore.LSPManager(workspace);

		const before = {
			clients: (manager as any).clients.size,
			spawning: (manager as any).spawning.size,
			broken: (manager as any).broken.size,
		};

		try {
			const restartedUndefined = await manager.restartServers(undefined as any);
			const restartedEmpty = await manager.restartServers([]);
			const restartedMissing = await manager.restartServers(["missing-server"]);

			assert.equal(restartedUndefined, 0);
			assert.equal(restartedEmpty, 0);
			assert.equal(restartedMissing, 0);

			assert.equal((manager as any).clients.size, before.clients);
			assert.equal((manager as any).spawning.size, before.spawning);
			assert.equal((manager as any).broken.size, before.broken);
		} finally {
			await manager.shutdown();
		}
	});

	it("blocks privileged actions by default", async () => {
		const pi = createPiMock();
		registerLspModule(pi as any, mergeConfig({}).lsp);

		await assert.rejects(
			() =>
				pi.tools[0].execute("call-1", { action: "restart", server: "all" }, undefined, undefined, {
					cwd: process.cwd(),
				}),
			/allowMutatingActions is false/
		);
	});

	it("logs bridged payload for LspError without changing thrown behavior", async () => {
		const pi = createPiMock();
		const sink = createMemoryLoggerSink();
		const logger = createLogger({ module: "test", sink });
		registerLspModule(pi as any, mergeConfig({}).lsp, { logger });

		await assert.rejects(
			() =>
				pi.tools[0].execute("call-1", { action: "restart", server: "all" }, undefined, undefined, {
					cwd: process.cwd(),
				}),
			/allowMutatingActions is false/
		);

		const event = sink.events.find((item) => item.event === "lsp.error_payload");
		assert.ok(event);
		assert.equal(event?.level, "warn");
		const payload = event?.metadata?.payload as Record<string, unknown> | undefined;
		assert.equal(payload?.module, "lsp");
		assert.equal(payload?.code, "LSP_ACTION_NOT_ALLOWED");
	});

	it("logs normalized payload for non-Lsp execute failures", async () => {
		const pi = createPiMock();
		const sink = createMemoryLoggerSink();
		const logger = createLogger({ module: "test", sink });
		registerLspModule(pi as any, mergeConfig({}).lsp, { logger });

		await assert.rejects(
			() => pi.tools[0].execute("call-1", { action: "servers" }, undefined, undefined, undefined),
			/Invalid tool execution context/
		);

		const event = sink.events.find((item) => item.event === "lsp.error_payload");
		assert.ok(event);
		assert.equal(event?.level, "error");
		const payload = event?.metadata?.payload as Record<string, unknown> | undefined;
		assert.equal(payload?.module, "lsp");
		assert.equal(payload?.code, "INTERNAL_ERROR");
	});

	it("rejects file paths outside the active workspace", async () => {
		const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "devkit-pi-lsp-workspace-"));
		const outside = path.join(os.tmpdir(), `devkit-pi-lsp-outside-${process.pid}.ts`);
		fs.writeFileSync(outside, "export const outside = true;\n");

		const pi = createPiMock();
		registerLspModule(pi as any, mergeConfig({}).lsp);

		await assert.rejects(
			() =>
				pi.tools[0].execute("call-1", { action: "diagnostics", file: outside }, undefined, undefined, {
					cwd: workspace,
				}),
			/outside workspace is not allowed/
		);
	});

	it("limits source file reads by byte size", () => {
		const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "devkit-pi-lsp-limit-"));
		const small = path.join(workspace, "small.ts");
		const large = path.join(workspace, "large.ts");
		fs.writeFileSync(small, "export const ok = true;\n");
		fs.writeFileSync(large, "x".repeat(33));

		assert.equal(readTextFileLimited(small, 32), "export const ok = true;\n");
		assert.throws(
			() => readTextFileLimited(large, 32),
			(error: unknown) => {
				assert.ok(error instanceof LspFileTooLargeError);
				assert.equal(error.maxBytes, 32);
				assert.equal(error.sizeBytes, 33);
				assert.equal(error.filePath, large);
				assert.match(error.message, /LSP source file is too large/);
				return true;
			}
		);
		assert.equal(DEFAULT_LSP_MAX_SOURCE_FILE_BYTES, 2 * 1024 * 1024);
	});

	it("does not treat empty files as read failures in workspace diagnostics", async () => {
		const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "devkit-pi-lsp-empty-file-"));
		const file = path.join(workspace, "empty.ts");
		fs.writeFileSync(file, "", "utf-8");
		fs.writeFileSync(path.join(workspace, "package.json"), "{}\n", "utf-8");

		const manager = new lspCore.LSPManager(workspace);
		const originalServers = [...lspCore.LSP_SERVERS];

		try {
			lspCore.LSP_SERVERS.splice(0, lspCore.LSP_SERVERS.length, {
				id: "typescript",
				extensions: [".ts"],
				findRoot: () => workspace,
				spawn: async () => undefined,
			});

			const result = await manager.getDiagnosticsForFiles([file], 1);

			assert.equal(result.items.length, 1);
			assert.equal(result.items[0].file, file);
			assert.equal(result.items[0].status, "unsupported");
			assert.notEqual(result.items[0].error, "Could not read file");
		} finally {
			lspCore.LSP_SERVERS.splice(0, lspCore.LSP_SERVERS.length, ...originalServers);
			await manager.shutdown();
		}
	});

	it("caps workspace-diagnostics file input", async () => {
		const pi = createPiMock();
		registerLspModule(pi as any, mergeConfig({}).lsp);

		await assert.rejects(
			() =>
				pi.tools[0].execute(
					"call-1",
					{
						action: "workspace-diagnostics",
						files: Array.from({ length: 65 }, (_, i) => `f${i}.ts`),
					},
					undefined,
					undefined,
					{ cwd: process.cwd() }
				),
			/at most 64 files/
		);
	});

	it("allows whitelisted readonly LSP actions in subagent processes", async () => {
		process.env[PI_SUBAGENT_CHILD] = "1";
		process.env[PI_SUBAGENT_ALLOW_LSP] = "1";
		process.env[PI_SUBAGENT_LSP_ACTIONS] = "servers,symbols,diagnostics";
		const pi = createPiMock();
		registerLspModule(pi as any, mergeConfig({}).lsp);

		const result = await pi.tools[0].execute("call-1", { action: "servers" }, undefined, undefined, {
			cwd: process.cwd(),
		});

		assert.match(result.content[0].text, /action: servers/);
	});

	it("blocks non-whitelisted LSP actions in subagent processes", async () => {
		process.env[PI_SUBAGENT_CHILD] = "1";
		process.env[PI_SUBAGENT_ALLOW_LSP] = "1";
		process.env[PI_SUBAGENT_LSP_ACTIONS] = "servers,symbols,diagnostics";
		const pi = createPiMock();
		registerLspModule(pi as any, mergeConfig({}).lsp);

		await assert.rejects(
			() =>
				pi.tools[0].execute(
					"call-1",
					{ action: "references", file: "src/index.ts", line: 1, column: 1 },
					undefined,
					undefined,
					{ cwd: process.cwd() }
				),
			/not allowed for this subagent process/
		);
	});

	it("blocks privileged actions in subagent processes even when explicitly allowed", async () => {
		process.env[PI_SUBAGENT_CHILD] = "1";
		process.env[PI_SUBAGENT_ALLOW_LSP] = "1";
		process.env[PI_SUBAGENT_LSP_ACTIONS] = "restart";
		const pi = createPiMock();
		registerLspModule(pi as any, mergeConfig({ lsp: { tool: { allowMutatingActions: true } } }).lsp);

		await assert.rejects(
			() =>
				pi.tools[0].execute("call-1", { action: "restart", server: "all" }, undefined, undefined, {
					cwd: process.cwd(),
				}),
			/disabled in subagent processes/
		);
	});

	it("keeps lsp core facade export contract stable", () => {
		assert.equal(typeof lspCore.LSPManager, "function");
		assert.equal(typeof lspCore.getOrCreateManager, "function");
		assert.equal(typeof lspCore.shutdownManager, "function");

		assert.equal(typeof lspCore.LSP_SERVERS, "object");
		assert.equal(typeof lspCore.LANGUAGE_IDS, "object");

		assert.equal(typeof lspCore.diagnosticsWaitMsForFile, "function");
		assert.equal(typeof lspCore.filterDiagnosticsBySeverity, "function");
		assert.equal(typeof lspCore.formatDiagnostic, "function");
		assert.equal(typeof lspCore.collectSymbols, "function");

		assert.equal(typeof lspCore.findSymbolPosition, "function");
		assert.equal(typeof lspCore.resolvePosition, "function");
		assert.equal(typeof lspCore.uriToPath, "function");
		assert.equal(typeof lspCore.getCppCompilationDbHint, "function");

		assert.equal(typeof lspCore.DEFAULT_LSP_MAX_SOURCE_FILE_BYTES, "number");
		assert.equal(typeof lspCore.LspFileTooLargeError, "function");
		assert.equal(typeof lspCore.readTextFileLimited, "function");
	});

	it("exposes expected readonly and privileged action names", () => {
		assert.deepEqual([...LSP_ACTIONS].sort(), [
			"codeAction",
			"definition",
			"diagnostics",
			"hover",
			"references",
			"rename",
			"restart",
			"servers",
			"signature",
			"symbols",
			"workspace-diagnostics",
		]);
	});
});
