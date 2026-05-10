import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { mergeConfig } from "../../src/config/load-config.ts";
import { registerToolkitCommands } from "../../src/modules/commands/register.ts";
import { PI_SUBAGENT_CHILD } from "../../src/shared/types.ts";

function createPiMock() {
  const commands: Array<{ name: string; handler: (args: string, ctx: any) => Promise<void> }> = [];
  const notifications: Array<{ message: string; level: string }> = [];
  const logs: string[] = [];

  return {
    commands,
    notifications,
    logs,
    registerCommand(name: string, command: any) {
      commands.push({ name, handler: command.handler });
    },
    createCtx() {
      return {
        cwd: process.cwd(),
        ui: {
          notify(message: string, level: string) {
            notifications.push({ message, level });
          },
          custom: async () => {},
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

  it("toolkit modules prints module overview", async () => {
    const pi = createPiMock();
    registerToolkitCommands(pi as any, mergeConfig({}));

    const output: string[] = [];
    console.log = (value?: unknown) => {
      output.push(String(value ?? ""));
    };

    await pi.commands[0].handler("modules", pi.createCtx());

    assert.match(output.join("\n"), /devkit-pi modules/);
    assert.match(output.join("\n"), /lsp:/);
  });
});
