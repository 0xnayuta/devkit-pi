import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { visibleWidth } from "@earendil-works/pi-tui";
import { showToolkitReport, ToolkitReportPanel } from "../../src/modules/commands/report-viewer.ts";

function createCtx(options: { hasUI?: boolean; customResult?: unknown } = {}) {
  const notifications: Array<{ message: string; level: string }> = [];
  const renders: string[] = [];

  return {
    notifications,
    renders,
    ctx: {
      hasUI: options.hasUI ?? true,
      ui: {
        notify(message: string, level: string) {
          notifications.push({ message, level });
        },
        custom: async (factory: any) => {
          const component = await factory({ requestRender() {} }, {}, {}, () => {});
          renders.push(component.render(80).join("\n"));
          return Object.hasOwn(options, "customResult") ? options.customResult : "closed";
        },
      },
    },
  };
}

describe("toolkit report viewer", () => {
  const originalLog = console.log;
  const originalError = console.error;
  const originalArgv = [...process.argv];

  afterEach(() => {
    console.log = originalLog;
    console.error = originalError;
    process.argv.length = 0;
    process.argv.push(...originalArgv);
  });

  it("renders short text", () => {
    const panel = new ToolkitReportPanel({
      title: "Test Report",
      content: "hello\nworld",
      done: () => {},
      maxVisibleLines: 8,
    });

    const output = panel.render(40).join("\n");
    assert.match(output, /Test Report/);
    assert.match(output, /hello/);
    assert.match(output, /world/);
  });

  it("renders empty content without crashing", () => {
    const panel = new ToolkitReportPanel({
      title: "Empty",
      content: "",
      done: () => {},
    });

    assert.match(panel.render(40).join("\n"), /\(empty report\)/);
  });

  it("keeps rendered lines within width", () => {
    const panel = new ToolkitReportPanel({
      title: "Narrow",
      content: "a very long line that must not exceed the requested width",
      done: () => {},
      maxVisibleLines: 8,
    });

    const width = 12;
    for (const line of panel.render(width)) {
      assert.ok(visibleWidth(line) <= width, `${line} exceeds width ${width}`);
    }
  });

  it("scrolls long text", () => {
    const content = Array.from({ length: 30 }, (_, index) => `line ${index}`).join("\n");
    const panel = new ToolkitReportPanel({
      title: "Long",
      content,
      done: () => {},
      maxVisibleLines: 8,
    });

    const before = panel.render(50).join("\n");
    panel.handleInput("\x1b[B");
    const after = panel.render(50).join("\n");

    assert.notEqual(after, before);
    assert.match(after, /line 1/);
  });

  it("closes on q", () => {
    let closed = false;
    const panel = new ToolkitReportPanel({
      title: "Close",
      content: "content",
      done: () => {
        closed = true;
      },
    });

    panel.handleInput("q");
    assert.equal(closed, true);
  });

  it("falls back to stdout when UI is unavailable", async () => {
    const { ctx, renders } = createCtx({ hasUI: false });
    const output: string[] = [];
    console.log = (value?: unknown) => {
      output.push(String(value ?? ""));
    };

    await showToolkitReport(ctx as any, { title: "Fallback", content: "report body" });

    assert.deepEqual(output, ["report body"]);
    assert.equal(renders.length, 0);
  });

  it("does not print raw text in JSON protocol mode", async () => {
    const { ctx } = createCtx({ hasUI: false });
    const output: string[] = [];
    const errors: string[] = [];
    console.log = (value?: unknown) => {
      output.push(String(value ?? ""));
    };
    console.error = (value?: unknown) => {
      errors.push(String(value ?? ""));
    };
    process.argv.push("--mode", "json");

    await showToolkitReport(ctx as any, { title: "JSON", content: "report body" });

    assert.equal(output.length, 0);
    assert.equal(errors.length, 1);
    assert.match(errors[0], /JSON protocol mode/);
  });

  it("does not print raw text when custom UI is degraded", async () => {
    const { ctx, notifications } = createCtx({ hasUI: true, customResult: undefined });
    const output: string[] = [];
    console.log = (value?: unknown) => {
      output.push(String(value ?? ""));
    };

    await showToolkitReport(ctx as any, { title: "RPC", content: "report body" });

    assert.equal(output.length, 0);
    assert.equal(notifications.length, 1);
    assert.match(notifications[0].message, /not available/);
  });
});
