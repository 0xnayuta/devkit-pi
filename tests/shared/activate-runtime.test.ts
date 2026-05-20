import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { activateDevkitExtension } from "../../src/extension/activate.ts";

describe("activateDevkitExtension", () => {
  it("wires session_shutdown to runtime.dispose", async () => {
    const handlers = new Map<string, Array<() => Promise<void> | void>>();
    let activateCalls = 0;
    let disposeCalls = 0;

    const pi = {
      on(event: string, handler: () => Promise<void> | void) {
        const bucket = handlers.get(event) ?? [];
        bucket.push(handler);
        handlers.set(event, bucket);
      },
    };

    await activateDevkitExtension(pi as any, {
      createRuntime() {
        return {
          config: {
            enabled: true,
            subagents: {} as never,
            web: {} as never,
            lsp: {} as never,
            commands: {} as never,
            guards: {} as never,
            convertContent: {} as never,
          },
          async activate() {
            activateCalls += 1;
          },
          async dispose() {
            disposeCalls += 1;
          },
        };
      },
    });

    assert.equal(activateCalls, 1);
    assert.equal(disposeCalls, 0);

    const shutdownHandlers = handlers.get("session_shutdown") ?? [];
    assert.equal(shutdownHandlers.length, 1);

    await shutdownHandlers[0]!();
    assert.equal(disposeCalls, 1);
  });
});
