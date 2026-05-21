import type { ExtensionCommandContext, Theme } from "@earendil-works/pi-coding-agent";
import {
	type Component,
	Key,
	matchesKey,
	truncateToWidth,
	visibleWidth,
	wrapTextWithAnsi,
} from "@earendil-works/pi-tui";
import { createConsoleLoggerSink, createLogger, type Logger } from "../../shared/logger.ts";

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
	private readonly theme: Theme;
	private readonly done: () => void;
	private scrollOffset = 0;
	private cachedWidth?: number;
	private cachedLines?: string[];
	private cachedContent?: string;
	private cachedBodyLines?: string[];
	private cachedBodyHeight?: number;

	constructor(options: ToolkitReportOptions & { done: () => void; maxVisibleLines?: number; theme: Theme }) {
		this.title = options.title;
		this.content = options.content.trimEnd() || "(empty report)";
		this.done = options.done;
		this.theme = options.theme;
		this.maxVisibleLines = options.maxVisibleLines ?? DEFAULT_VISIBLE_LINES;
	}

	render(width: number): string[] {
		const safeWidth = Math.max(1, width);
		if (this.cachedLines && this.cachedWidth === safeWidth) return this.cachedLines;

		const innerWidth = Math.max(1, safeWidth - 4);
		const bodyHeight = Math.max(1, this.maxVisibleLines - 5);

		if (this.cachedContent === this.content && this.cachedBodyHeight === bodyHeight) {
			// Content and height unchanged: reuse body lines, skip buildBodyLines call.
		} else {
			this.cachedContent = this.content;
			this.cachedBodyLines = this.buildBodyLines(innerWidth);
			this.cachedBodyHeight = bodyHeight;
		}

		const bodyLines = this.cachedBodyLines!;
		const maxScroll = Math.max(0, bodyLines.length - bodyHeight);
		this.scrollOffset = Math.min(this.scrollOffset, maxScroll);

		const visible = bodyLines.slice(this.scrollOffset, this.scrollOffset + bodyHeight);
		const bodyContent = visible.filter((l) => l !== "");
		const isEmpty = bodyContent.length === 0;

		const lines = [
			this.topBorder(safeWidth, this.title, bodyLines.length, bodyHeight),
			...this.bodyLines(visible, innerWidth, isEmpty),
			this.bottomBorder(safeWidth),
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
		this.cachedContent = undefined;
		this.cachedBodyLines = undefined;
		this.cachedBodyHeight = undefined;
	}

	dispose(): void {
		this.invalidate();
	}

	private topBorder(width: number, title: string, totalLines: number, bodyHeight: number): string {
		const th = this.theme;
		if (width <= 2) return th.fg("borderMuted", "─".repeat(width));

		const scrollInfo = totalLines > bodyHeight ? ` ${this.scrollOffset + 1}/${totalLines} ` : "";
		const titleText = ` ${title} `;

		const middleWidth = Math.max(0, width - 4);
		const fixedTextWidth = titleText.length + scrollInfo.length;

		if (fixedTextWidth > middleWidth) {
			return (
				th.fg("borderMuted", "╭─") +
				th.fg("accent", th.bold(truncateToWidth(`${titleText}${scrollInfo}`, middleWidth, "", true))) +
				th.fg("borderMuted", "─╮")
			);
		}

		const filler = "─".repeat(middleWidth - fixedTextWidth);

		return (
			th.fg("borderMuted", "╭─") +
			th.fg("accent", th.bold(titleText)) +
			th.fg("borderMuted", filler) +
			th.fg("dim", scrollInfo) +
			th.fg("borderMuted", "─╮")
		);
	}

	private bottomBorder(width: number): string {
		const th = this.theme;
		if (width <= 2) return th.fg("borderMuted", "─".repeat(width));

		const helpText = " ↑↓ scroll | Esc close ";
		const middleWidth = Math.max(0, width - 4);
		const help = truncateToWidth(helpText, middleWidth, "", false);
		const filler = "─".repeat(Math.max(0, middleWidth - visibleWidth(help)));

		return (
			th.fg("borderMuted", "╰─") + th.fg("dim", help) + th.fg("borderMuted", filler) + th.fg("borderMuted", "─╯")
		);
	}

	private bodyLines(lines: string[], innerWidth: number, isEmpty: boolean): string[] {
		if (isEmpty) {
			return [this.contentLine("(empty report)", innerWidth)];
		}
		return lines.map((line) => this.contentLine(line, innerWidth));
	}

	private buildBodyLines(width: number): string[] {
		const lines = this.content.split("\n").flatMap((line) => {
			const wrapped = wrapTextWithAnsi(line, width);
			return wrapped.length > 0 ? wrapped : [""];
		});
		return lines.length > 0 ? lines : [""];
	}

	private pageSize(): number {
		return Math.max(1, this.maxVisibleLines - 2);
	}

	private scrollBy(delta: number): void {
		this.scrollOffset = Math.max(0, this.scrollOffset + delta);
		this.invalidate();
	}

	private contentLine(text: string, width: number): string {
		const th = this.theme;
		const content = truncateToWidth(text, width, "", true);
		return `${th.fg("borderMuted", "│")} ${content} ${th.fg("borderMuted", "│")}`;
	}
}

export async function showToolkitReport(
	ctx: ExtensionCommandContext,
	options: ToolkitReportOptions,
	logger: Logger = createLogger({
		module: "commands.report-viewer",
		sink: createConsoleLoggerSink(),
	})
): Promise<void> {
	if (!ctx.hasUI) {
		if (isJsonProtocolMode()) {
			logger.warn(
				"report.stdout_blocked_json_mode",
				"Toolkit report is not available in JSON protocol mode; report was not written to stdout to avoid protocol corruption."
			);
			return;
		}

		console.log(options.content);
		return;
	}

	const result = await ctx.ui.custom<PanelResult>((tui, theme, _keybindings, done) => {
		const panel = new ToolkitReportPanel({
			...options,
			theme,
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
