import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { mergeConfig } from "../../src/config/load-config.ts";
import { registerToolkitCommands } from "../../src/modules/commands/register.ts";
import { createLogger, createMemoryLoggerSink } from "../../src/shared/logger.ts";
import { PI_SUBAGENT_CHILD } from "../../src/shared/types.ts";

function createPiMock() {
	const commands: Array<{
		name: string;
		handler: (args: string, ctx: any) => Promise<void>;
		getArgumentCompletions?: (argumentPrefix: string) => unknown[] | null | Promise<unknown[] | null>;
	}> = [];
	const notifications: Array<{ message: string; level: string }> = [];
	const reports: string[] = [];

	return {
		commands,
		notifications,
		reports,
		registerCommand(name: string, command: any) {
			commands.push({
				name,
				handler: command.handler,
				getArgumentCompletions: command.getArgumentCompletions,
			});
		},
		createCtx(options: { hasUI?: boolean; customResult?: unknown } = {}) {
			return {
				cwd: process.cwd(),
				hasUI: options.hasUI ?? true,
				ui: {
					notify(message: string, level: string) {
						notifications.push({ message, level });
					},
					custom: async (factory: any) => {
						const component = await factory(
							{ requestRender() {} },
							{
								mode: "dark",
								fg: (_color: any, text: string) => text,
								bg: (_color: any, text: string) => text,
								bold: (text: string) => text,
								italic: (text: string) => text,
								underline: (text: string) => text,
								strikethrough: (text: string) => text,
								inverse: (text: string) => text,
							},
							{},
							() => {}
						);
						reports.push(component.render(100).join("\n"));
						return Object.hasOwn(options, "customResult") ? options.customResult : "closed";
					},
				},
			};
		},
	};
}

describe("commands module", () => {
	const originalChild = process.env[PI_SUBAGENT_CHILD];
	const originalLog = console.log;

	afterEach(() => {
		if (originalChild === undefined) delete process.env[PI_SUBAGENT_CHILD];
		else process.env[PI_SUBAGENT_CHILD] = originalChild;
		console.log = originalLog;
	});

	it("registers unified toolkit command in main process", () => {
		const pi = createPiMock();
		registerToolkitCommands(pi as any, mergeConfig({}));

		assert.deepEqual(
			pi.commands.map((command) => command.name),
			["toolkit"]
		);
	});

	it("does not register toolkit command when commands are disabled", () => {
		const pi = createPiMock();
		registerToolkitCommands(pi as any, mergeConfig({ commands: { enabled: false } }));

		assert.equal(pi.commands.length, 0);
	});

	it("does not register toolkit command in subagent child processes", () => {
		process.env[PI_SUBAGENT_CHILD] = "1";
		const pi = createPiMock();
		registerToolkitCommands(pi as any, mergeConfig({}));

		assert.equal(pi.commands.length, 0);
	});

	it("provides toolkit subcommand argument completions", async () => {
		const pi = createPiMock();
		registerToolkitCommands(pi as any, mergeConfig({}));

		const complete = pi.commands[0].getArgumentCompletions;
		assert.equal(typeof complete, "function");

		assert.deepEqual(await complete?.(""), [
			{
				value: "doctor",
				label: "/toolkit doctor",
				description: "Run unified diagnostics checks",
			},
			{
				value: "modules",
				label: "/toolkit modules",
				description: "Show module enablement status",
			},
			{
				value: "logs",
				label: "/toolkit logs",
				description: "Show recent web activity logs",
			},
			{
				value: "agents",
				label: "/toolkit agents",
				description: "List builtin/user/project agents",
			},
			{
				value: "lsp",
				label: "/toolkit lsp",
				description: "Show LSP tool/hook configuration",
			},
			{
				value: "activity",
				label: "/toolkit activity",
				description: "Open activity panel",
			},
			{
				value: "help",
				label: "/toolkit help",
				description: "Show help",
			},
		]);
		assert.deepEqual(await complete?.("d"), [
			{
				value: "doctor",
				label: "/toolkit doctor",
				description: "Run unified diagnostics checks",
			},
		]);
		assert.equal(await complete?.("unknown"), null);
		assert.equal(await complete?.("logs --"), null);
	});

	it("toolkit modules shows module overview and tool manifest in a TUI report panel", async () => {
		const pi = createPiMock();
		registerToolkitCommands(pi as any, mergeConfig({}));

		const output: string[] = [];
		console.log = (value?: unknown) => {
			output.push(String(value ?? ""));
		};

		await pi.commands[0].handler("modules", pi.createCtx());

		assert.equal(output.length, 0);
		const report = pi.reports.join("\n");
		assert.match(report, /devkit-pi modules/);
		assert.match(report, /convert:/);
		assert.match(report, /lsp:/);
		assert.match(report, /tool manifest/);
		assert.match(report, /subagent \(subagents, readonly\)/);
		assert.match(report, /state model snapshot/);
		assert.match(report, /web\.responseId: memory \+ session entry/);
		assert.match(report, /subagent\.details: details-driven restore/);
		assert.match(report, /subagent\.streaming: execution-only/);
	});

	it("toolkit help shows usage in a TUI report panel", async () => {
		const pi = createPiMock();
		registerToolkitCommands(pi as any, mergeConfig({}));

		await pi.commands[0].handler("help", pi.createCtx());

		assert.match(pi.reports.join("\n"), /Usage:/);
		assert.match(pi.reports.join("\n"), /\/toolkit doctor/);
	});

	it("toolkit lsp shows LSP overview in a TUI report panel", async () => {
		const pi = createPiMock();
		registerToolkitCommands(pi as any, mergeConfig({}));

		await pi.commands[0].handler("lsp", pi.createCtx());

		assert.match(pi.reports.join("\n"), /LSP module/);
		assert.match(pi.reports.join("\n"), /tool\.actions:/);
	});

	it("toolkit activity reports unavailable when UI is absent", async () => {
		const pi = createPiMock();
		const sink = createMemoryLoggerSink();
		registerToolkitCommands(pi as any, mergeConfig({}), {
			logger: createLogger({ module: "test.commands", sink }),
		});

		await pi.commands[0].handler("activity", pi.createCtx({ hasUI: false }));

		assert.equal(pi.reports.length, 0);
		assert.equal(sink.events.length, 1);
		assert.equal(sink.events[0]?.level, "warn");
		assert.equal(sink.events[0]?.event, "activity.ui_required");
		assert.match(sink.events[0]?.message ?? "", /requires interactive UI/);
	});

	it("toolkit activity warns when custom UI is degraded", async () => {
		const pi = createPiMock();
		registerToolkitCommands(pi as any, mergeConfig({}));

		await pi.commands[0].handler("activity", pi.createCtx({ customResult: undefined }));

		assert.equal(pi.notifications.length, 1);
		assert.deepEqual(pi.notifications[0], {
			message: "Toolkit activity panel is not available in this pi mode",
			level: "warning",
		});
	});

	it("logs normalized payload when toolkit command handler fails", async () => {
		const pi = createPiMock();
		const sink = createMemoryLoggerSink();
		registerToolkitCommands(pi as any, mergeConfig({}), {
			logger: createLogger({ module: "test.commands", sink }),
		});

		const failingCtx = pi.createCtx({ hasUI: true });
		failingCtx.ui.custom = async () => {
			throw new Error("ui custom failed");
		};

		await pi.commands[0].handler("activity", failingCtx);

		const event = sink.events.find((item) => item.event === "commands.error_payload");
		assert.ok(event);
		assert.equal(event?.level, "error");
		const payload = event?.metadata?.payload as Record<string, unknown> | undefined;
		assert.equal(payload?.code, "INTERNAL_ERROR");
		assert.equal(payload?.module, "commands");
	});
});
