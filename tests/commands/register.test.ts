import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { mergeConfig } from "../../src/config/load-config.ts";
import { registerToolkitCommands } from "../../src/modules/commands/register.ts";
import { PI_SUBAGENT_CHILD } from "../../src/shared/types.ts";

function createPiMock() {
  const commands: Array<{ name: string; handler: (args: string, ctx: any) => Promise<void> }> = [];
  const notifications: Array<{ message: string; level: string }> = [];
  const reports: string[] = [];

  return {
    commands,
    notifications,
    reports,
    registerCommand(name: string, command: any) {
      commands.push({ name, handler: command.handler });
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
            const component = await factory({ requestRender() {} }, {}, {}, () => {});
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
  const originalError = console.error;

  afterEach(() => {
    if (originalChild === undefined) delete process.env[PI_SUBAGENT_CHILD];
    else process.env[PI_SUBAGENT_CHILD] = originalChild;
    console.log = originalLog;
    console.error = originalError;
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

  it("toolkit modules shows module overview in a TUI report panel", async () => {
    const pi = createPiMock();
    registerToolkitCommands(pi as any, mergeConfig({}));

    const output: string[] = [];
    console.log = (value?: unknown) => {
      output.push(String(value ?? ""));
    };

    await pi.commands[0].handler("modules", pi.createCtx());

    assert.equal(output.length, 0);
    assert.match(pi.reports.join("\n"), /devkit-pi modules/);
    assert.match(pi.reports.join("\n"), /convert:/);
    assert.match(pi.reports.join("\n"), /lsp:/);
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
    registerToolkitCommands(pi as any, mergeConfig({}));

    const errors: string[] = [];
    console.error = (value?: unknown) => {
      errors.push(String(value ?? ""));
    };

    await pi.commands[0].handler("activity", pi.createCtx({ hasUI: false }));

    assert.equal(pi.reports.length, 0);
    assert.equal(errors.length, 1);
    assert.match(errors[0], /requires interactive UI/);
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
});
