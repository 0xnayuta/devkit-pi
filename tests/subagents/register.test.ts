import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { mergeConfig } from "../../src/config/load-config.ts";
import { registerSubagentsModule } from "../../src/modules/subagents/register.ts";
import { PI_SUBAGENT_CHILD } from "../../src/shared/types.ts";

function createPiMock() {
  const tools: any[] = [];
  const commands: string[] = [];
  const listeners: string[] = [];
  return {
    tools,
    commands,
    listeners,
    registerTool(tool: any) {
      tools.push(tool);
    },
    registerCommand(name: string) {
      commands.push(name);
    },
    on(event: string) {
      listeners.push(event);
    },
  };
}

describe("subagents module registration", () => {
  const originalChild = process.env[PI_SUBAGENT_CHILD];

  afterEach(() => {
    if (originalChild === undefined) delete process.env[PI_SUBAGENT_CHILD];
    else process.env[PI_SUBAGENT_CHILD] = originalChild;
  });

  it("registers subagent tool in main process", () => {
    const pi = createPiMock();
    const config = mergeConfig({});

    registerSubagentsModule(pi as any, config.subagents);

    assert.deepEqual(pi.tools.map((tool) => tool.name), ["subagent"]);
    assert.deepEqual(pi.commands, []);
  });

  it("does not register in subagent child processes", () => {
    process.env[PI_SUBAGENT_CHILD] = "1";
    const pi = createPiMock();
    const config = mergeConfig({});

    registerSubagentsModule(pi as any, config.subagents);

    assert.equal(pi.tools.length, 0);
    assert.equal(pi.commands.length, 0);
    assert.equal(pi.listeners.length, 0);
  });
});
