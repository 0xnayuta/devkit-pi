import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import type { Theme } from "@earendil-works/pi-coding-agent";
import { visibleWidth } from "@earendil-works/pi-tui";
import { showToolkitReport, ToolkitReportPanel } from "../../src/modules/commands/report-viewer.ts";
import { createLogger, createMemoryLoggerSink } from "../../src/shared/logger.ts";

function stripAnsi(value: string): string {
  return value.replace(/\u001b\[[0-9;]*m/g, "");
}

const dummyTheme = {
  mode: "dark",
  fg: (_color: any, text: string) => text,
  bg: (_color: any, text: string) => text,
  bold: (text: string) => text,
  italic: (text: string) => text,
  underline: (text: string) => text,
  strikethrough: (text: string) => text,
  inverse: (text: string) => text,
} as unknown as Theme;

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
          renders.push(component.render(80).join("\n"));
          return Object.hasOwn(options, "customResult") ? options.customResult : "closed";
        },
      },
    },
  };
}

describe("toolkit report viewer", () => {
  const originalLog = console.log;
  const originalArgv = [...process.argv];

  afterEach(() => {
    console.log = originalLog;
    process.argv.length = 0;
    process.argv.push(...originalArgv);
  });

  it("renders short text", () => {
    const panel = new ToolkitReportPanel({
      title: "Test Report",
      content: "hello\nworld",
      done: () => {},
      maxVisibleLines: 8,
      theme: dummyTheme,
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
      theme: dummyTheme,
    });

    assert.match(panel.render(40).join("\n"), /\(empty report\)/);
  });

  it("keeps rendered lines within width and preserves right rounded corners", () => {
    const panel = new ToolkitReportPanel({
      title: "Narrow",
      content: "a very long line that must not exceed the requested width",
      done: () => {},
      maxVisibleLines: 8,
      theme: dummyTheme,
    });

    const width = 12;
    const lines = panel.render(width);
    for (const line of lines) {
      assert.ok(visibleWidth(line) <= width, `${line} exceeds width ${width}`);
    }
    assert.equal(visibleWidth(lines[0]), width);
    assert.equal(visibleWidth(lines.at(-1)!), width);
    assert.ok(stripAnsi(lines[0]).endsWith("╮"));
    assert.ok(stripAnsi(lines.at(-1)!).endsWith("╯"));
  });

  it("fills the bottom help border with horizontal rule characters", () => {
    const panel = new ToolkitReportPanel({
      title: "Help Border",
      content: "content",
      done: () => {},
      maxVisibleLines: 8,
      theme: dummyTheme,
    });

    const bottom = stripAnsi(panel.render(80).at(-1)!);
    assert.equal(visibleWidth(bottom), 80);
    assert.match(bottom, /Esc close ─+─╯$/);
  });

  it("scrolls long text", () => {
    const content = Array.from({ length: 30 }, (_, index) => `line ${index}`).join("\n");
    const panel = new ToolkitReportPanel({
      title: "Long",
      content,
      done: () => {},
      maxVisibleLines: 8,
      theme: dummyTheme,
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
      theme: dummyTheme,
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
    const sink = createMemoryLoggerSink();
    const logger = createLogger({ module: "test.commands.report", sink });
    console.log = (value?: unknown) => {
      output.push(String(value ?? ""));
    };
    process.argv.push("--mode", "json");

    await showToolkitReport(ctx as any, { title: "JSON", content: "report body" }, logger);

    assert.equal(output.length, 0);
    assert.equal(sink.events.length, 1);
    assert.equal(sink.events[0]?.level, "warn");
    assert.equal(sink.events[0]?.event, "report.stdout_blocked_json_mode");
    assert.match(sink.events[0]?.message ?? "", /JSON protocol mode/);
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
