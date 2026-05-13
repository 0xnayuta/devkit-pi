import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import {
  type Component,
  Key,
  matchesKey,
  truncateToWidth,
  wrapTextWithAnsi,
} from "@earendil-works/pi-tui";

const DEFAULT_VISIBLE_LINES = 24;
const PANEL_RESULT_CLOSED = "closed";

type PanelResult = typeof PANEL_RESULT_CLOSED;

function isJsonProtocolMode(): boolean {
  return process.argv.some(
    (arg, index, args) => arg === "--mode=json" || (arg === "--mode" && args[index + 1] === "json")
  );
}

export interface ToolkitReportOptions {
  title: string;
  content: string;
}

export class ToolkitReportPanel implements Component {
  private readonly title: string;
  private readonly content: string;
  private readonly maxVisibleLines: number;
  private readonly done: () => void;
  private scrollOffset = 0;
  private cachedWidth?: number;
  private cachedLines?: string[];

  constructor(options: ToolkitReportOptions & { done: () => void; maxVisibleLines?: number }) {
    this.title = options.title;
    this.content = options.content.trimEnd() || "(empty report)";
    this.done = options.done;
    this.maxVisibleLines = options.maxVisibleLines ?? DEFAULT_VISIBLE_LINES;
  }

  render(width: number): string[] {
    const safeWidth = Math.max(1, width);
    if (this.cachedLines && this.cachedWidth === safeWidth) return this.cachedLines;

    const innerWidth = Math.max(1, safeWidth - 4);
    const bodyHeight = Math.max(1, this.maxVisibleLines - 5);
    const bodyLines = this.buildBodyLines(innerWidth);
    const maxScroll = Math.max(0, bodyLines.length - bodyHeight);
    this.scrollOffset = Math.min(this.scrollOffset, maxScroll);

    const visible = bodyLines.slice(this.scrollOffset, this.scrollOffset + bodyHeight);
    while (visible.length < bodyHeight) visible.push("");

    const lines = [
      this.borderLine(safeWidth, this.title),
      ...visible.map((line) => this.contentLine(line, innerWidth)),
      this.separatorLine(safeWidth),
      this.contentLine(this.helpText(bodyLines.length, bodyHeight), innerWidth),
      this.bottomLine(safeWidth),
    ].map((line) => truncateToWidth(line, safeWidth, ""));

    this.cachedWidth = safeWidth;
    this.cachedLines = lines;
    return lines;
  }

  handleInput(data: string): void {
    if (data === "q" || matchesKey(data, Key.escape)) {
      this.done();
      return;
    }

    if (matchesKey(data, Key.down) || data === "j") {
      this.scrollBy(1);
    } else if (matchesKey(data, Key.up) || data === "k") {
      this.scrollBy(-1);
    } else if (matchesKey(data, Key.pageDown) || matchesKey(data, Key.ctrl("f"))) {
      this.scrollBy(this.pageSize());
    } else if (matchesKey(data, Key.pageUp) || matchesKey(data, Key.ctrl("b"))) {
      this.scrollBy(-this.pageSize());
    } else if (matchesKey(data, Key.home)) {
      this.scrollOffset = 0;
      this.invalidate();
    } else if (matchesKey(data, Key.end)) {
      this.scrollOffset = Number.MAX_SAFE_INTEGER;
      this.invalidate();
    }
  }

  invalidate(): void {
    this.cachedWidth = undefined;
    this.cachedLines = undefined;
  }

  private buildBodyLines(width: number): string[] {
    const lines = this.content.split("\n").flatMap((line) => {
      const wrapped = wrapTextWithAnsi(line, width);
      return wrapped.length > 0 ? wrapped : [""];
    });
    return lines.length > 0 ? lines : [""];
  }

  private pageSize(): number {
    return Math.max(1, this.maxVisibleLines - 6);
  }

  private scrollBy(delta: number): void {
    this.scrollOffset = Math.max(0, this.scrollOffset + delta);
    this.invalidate();
  }

  private borderLine(width: number, title: string): string {
    if (width <= 2) return "─".repeat(width);
    const label = ` ${title} `;
    const visibleLabel = truncateToWidth(label, Math.max(0, width - 2), "");
    return `┌${visibleLabel}${"─".repeat(Math.max(0, width - 2 - visibleLabel.length))}┐`;
  }

  private separatorLine(width: number): string {
    if (width <= 2) return "─".repeat(width);
    return `├${"─".repeat(width - 2)}┤`;
  }

  private bottomLine(width: number): string {
    if (width <= 2) return "─".repeat(width);
    return `└${"─".repeat(width - 2)}┘`;
  }

  private contentLine(text: string, width: number): string {
    const content = truncateToWidth(text, width, "", true);
    return `│ ${content} │`;
  }

  private helpText(totalLines: number, bodyHeight: number): string {
    const scrollInfo = totalLines > bodyHeight ? ` · ${this.scrollOffset + 1}/${totalLines}` : "";
    return `↑/↓ scroll · PgUp/PgDn page · q/Esc close${scrollInfo}`;
  }
}

export async function showToolkitReport(
  ctx: ExtensionCommandContext,
  options: ToolkitReportOptions
): Promise<void> {
  if (!ctx.hasUI) {
    if (isJsonProtocolMode()) {
      console.error(
        "Toolkit report is not available in JSON protocol mode; report was not written to stdout to avoid protocol corruption."
      );
      return;
    }

    console.log(options.content);
    return;
  }

  const result = await ctx.ui.custom<PanelResult>((tui, _theme, _keybindings, done) => {
    const panel = new ToolkitReportPanel({
      ...options,
      done: () => done(PANEL_RESULT_CLOSED),
    });

    return {
      render: (width: number) => panel.render(width),
      invalidate: () => panel.invalidate(),
      handleInput: (data: string) => {
        panel.handleInput(data);
        tui.requestRender();
      },
    };
  });

  if (result !== PANEL_RESULT_CLOSED) {
    ctx.ui.notify(
      "Toolkit report panel is not available in this pi mode; report was not written to stdout to avoid protocol/TUI corruption.",
      "warning"
    );
  }
}
