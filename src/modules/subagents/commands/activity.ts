/**
 * Activity Panel TUI Component
 * Phase 6: UI Integration - Interactive activity log viewer
 */

import type { Theme } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { formatTimestamp } from "./logs.ts";
import type { ActivityEntry, WebToolStats } from "./toolkit-stats.ts";
import { clearActivityLog, getActivityLog, getToolkitStats, resetToolkitStats } from "./toolkit-stats.ts";

// Re-export for external use
export type { LogsOptions } from "./logs.ts";

// ============================================================================
// Types
// ============================================================================

export interface ActivityPanelOptions {
	maxEntries?: number;
	showStats?: boolean;
	autoRefresh?: boolean;
	theme?: Theme;
}

interface ActivityPanelState {
	selectedIndex: number;
	scrollOffset: number;
	stats: WebToolStats;
	entries: ActivityEntry[];
}

// ============================================================================
// Activity Panel Component
// ============================================================================

export class ActivityPanel {
	private state: ActivityPanelState;

	private maxVisibleLines: number;

	private onClose?: () => void;

	private refreshInterval?: ReturnType<typeof setInterval>;

	private cachedLines?: string[];

	private cachedWidth?: number;

	private theme?: Theme;

	constructor(options: ActivityPanelOptions = {}) {
		this.maxVisibleLines = options.maxEntries ?? 15;
		this.theme = options.theme;
		this.state = {
			selectedIndex: 0,
			scrollOffset: 0,
			stats: getToolkitStats(),
			entries: getActivityLog(100),
		};
	}

	setTheme(theme: Theme): void {
		this.theme = theme;
	}

	setOnClose(callback: () => void): void {
		this.onClose = callback;
	}

	startAutoRefresh(intervalMs = 1000): void {
		if (this.refreshInterval) {
			clearInterval(this.refreshInterval);
		}
		this.refreshInterval = setInterval(() => {
			this.refresh();
		}, intervalMs);
	}

	stopAutoRefresh(): void {
		if (this.refreshInterval) {
			clearInterval(this.refreshInterval);
			this.refreshInterval = undefined;
		}
	}

	refresh(): void {
		this.state.stats = getToolkitStats();
		this.state.entries = getActivityLog(100);
		this.cachedLines = undefined;
		this.cachedWidth = undefined;
	}

	handleInput(data: string): void {
		// Refresh data on 'r' key
		if (data === "r") {
			this.refresh();
			return;
		}

		// Clear logs on 'c' key
		if (data === "c") {
			clearActivityLog();
			this.refresh();
			return;
		}

		// Reset stats on 's' key
		if (data === "s") {
			resetToolkitStats();
			this.refresh();
			return;
		}

		// Navigate with arrow keys (use simple string matching)
		if (data === "up" || data === "\x1b[A") {
			if (this.state.selectedIndex > 0) {
				this.state.selectedIndex--;
				if (this.state.selectedIndex < this.state.scrollOffset) {
					this.state.scrollOffset = this.state.selectedIndex;
				}
			}
		} else if (data === "down" || data === "\x1b[B") {
			if (this.state.selectedIndex < this.state.entries.length - 1) {
				this.state.selectedIndex++;
				if (this.state.selectedIndex >= this.state.scrollOffset + this.maxVisibleLines - 3) {
					this.state.scrollOffset = this.state.selectedIndex - this.maxVisibleLines + 4;
				}
			}
		} else if (data === "pageup" || data === "\x1b[5~") {
			this.state.selectedIndex = Math.max(0, this.state.selectedIndex - this.maxVisibleLines);
			this.state.scrollOffset = Math.max(0, this.state.scrollOffset - this.maxVisibleLines);
		} else if (data === "pagedown" || data === "\x1b[6~") {
			this.state.selectedIndex = Math.min(
				this.state.entries.length - 1,
				this.state.selectedIndex + this.maxVisibleLines
			);
			this.state.scrollOffset = this.state.selectedIndex - this.maxVisibleLines + 4;
		} else if (data === "home" || data === "\x1b[H") {
			this.state.selectedIndex = 0;
			this.state.scrollOffset = 0;
		} else if (data === "end" || data === "\x1b[F") {
			this.state.selectedIndex = this.state.entries.length - 1;
			this.state.scrollOffset = Math.max(0, this.state.entries.length - this.maxVisibleLines);
		} else if (data === "escape" || data === "ctrl+c") {
			this.stopAutoRefresh();
			this.onClose?.();
		}
	}

	render(width: number): string[] {
		if (this.cachedLines && this.cachedWidth === width) {
			return this.cachedLines;
		}

		const lines: string[] = [];
		const { entries, stats } = this.state;
		const th = this.theme;

		// Helper: apply color or return plain string
		const color = (colorName: Parameters<Theme["fg"]>[0], text: string) => (th ? th.fg(colorName, text) : text);
		const border = (text: string) => color("borderMuted", text);
		const accent = (text: string) => color("accent", th ? th.bold(text) : text);
		const dim = (text: string) => color("dim", text);
		const padVisible = (text: string, targetWidth: number) =>
			`${text}${" ".repeat(Math.max(0, targetWidth - visibleWidth(text)))}`;

		// 1. Top Border with Title and Stats
		const titleText = " Toolkit Activity ";
		const statsLine = this.formatStatsBar(stats);
		const rightInfo = ` ${statsLine} `;
		const middleWidth = Math.max(0, width - 4);
		const fixedTextWidth = titleText.length + rightInfo.length;

		if (width <= 2) {
			lines.push(border("─".repeat(width)));
		} else if (fixedTextWidth > middleWidth) {
			lines.push(
				border("╭─") + accent(truncateToWidth(`${titleText}${rightInfo}`, middleWidth, "", true)) + border("─╮")
			);
		} else {
			const filler = "─".repeat(middleWidth - fixedTextWidth);
			lines.push(border("╭─") + accent(titleText) + border(filler) + dim(rightInfo) + border("─╮"));
		}

		// 2. Entries
		let bodyCount = 0;
		if (entries.length === 0) {
			lines.push(`${border("│")} ${padVisible(dim("(no recent activity)"), width - 4)} ${border("│")}`);
			bodyCount++;
		} else {
			const visibleEntries = entries.slice(
				this.state.scrollOffset,
				this.state.scrollOffset + this.maxVisibleLines - 2
			);

			for (let i = 0; i < visibleEntries.length; i++) {
				const entry = visibleEntries[i];
				const actualIndex = this.state.scrollOffset + i;
				const isSelected = actualIndex === this.state.selectedIndex;

				const entryLine = this.formatEntry(entry, width - 4, isSelected);
				const prefix = isSelected ? color("success", "►") : " ";
				// formatEntry has colors encoded if theme is available
				lines.push(`${border("│")}${prefix} ${padVisible(entryLine, width - 5)} ${border("│")}`);
				bodyCount++;
			}
		}

		// Fill remaining space
		const targetBodyLines = this.maxVisibleLines - 2;
		for (let i = bodyCount; i < targetBodyLines; i++) {
			lines.push(`${border("│")} ${"".padEnd(width - 4)} ${border("│")}`);
		}

		// 3. Bottom Border with Help text
		const helpText = " ↑↓ navigate | r refresh | c clear | s stats | Esc close ";
		const bottomMiddleWidth = Math.max(0, width - 4);
		const help = truncateToWidth(helpText, bottomMiddleWidth, "", false);
		const botFiller = "─".repeat(Math.max(0, bottomMiddleWidth - visibleWidth(help)));

		if (width <= 2) {
			lines.push(border("─".repeat(width)));
		} else {
			lines.push(border("╰─") + dim(help) + border(botFiller) + border("─╯"));
		}

		this.cachedLines = lines;
		this.cachedWidth = width;
		return lines;
	}

	private formatStatsBar(stats: WebToolStats): string {
		const parts: string[] = [];
		parts.push(`total:${stats.totalRequests}`);
		parts.push(`success:${stats.successCount}`);
		parts.push(`errors:${stats.errorCount}`);
		parts.push(`rate:${stats.rateLimitedCount}`);
		parts.push(`avg:${stats.averageLatencyMs}ms`);
		return parts.join("  ");
	}

	private formatEntry(entry: ActivityEntry, maxWidth: number, isSelected: boolean): string {
		const th = this.theme;
		const color = (colorName: Parameters<Theme["fg"]>[0], text: string) => (th ? th.fg(colorName, text) : text);
		const dim = (text: string) => (th ? th.fg("dim", text) : text);

		const time = dim(formatTimestamp(entry.timestamp));
		const typeTagRaw =
			entry.type === "search"
				? "SEARCH"
				: entry.type === "fetch"
					? "FETCH"
					: entry.type === "convert"
						? "CONVERT"
						: "CONTENT";

		const typeTag = entry.type === "search" ? color("accent", typeTagRaw) : color("warning", typeTagRaw);
		const provider = dim(entry.provider ?? "-");
		const statusRaw =
			entry.status === "success"
				? "OK"
				: entry.status === "rate_limited"
					? "LIMIT"
					: entry.status === "error"
						? "ERR"
						: "---";

		const status =
			entry.status === "success"
				? color("success", statusRaw)
				: entry.status === "error"
					? color("error", statusRaw)
					: color("warning", statusRaw);

		const duration = dim(entry.duration !== undefined ? `${entry.duration}ms` : "-");

		const parts = [time, typeTag, provider, status, duration];
		const rawLen =
			formatTimestamp(entry.timestamp).length +
			typeTagRaw.length +
			(entry.provider ?? "-").length +
			statusRaw.length +
			(entry.duration !== undefined ? `${entry.duration}ms` : "-").length +
			8;

		let line = parts.join("  ");

		if (rawLen > maxWidth) {
			line = truncateToWidth(line, maxWidth, "", true);
		}

		if (isSelected && entry.error) {
			line += ` | ${dim(entry.error)}`;
		}

		return truncateToWidth(line, maxWidth, "", true);
	}

	invalidate(): void {
		this.cachedLines = undefined;
		this.cachedWidth = undefined;
	}

	dispose(): void {
		this.stopAutoRefresh();
	}
}

// ============================================================================
// Factory Function for Extension Integration
// ============================================================================

export function createActivityPanel(options: ActivityPanelOptions = {}): ActivityPanel {
	return new ActivityPanel(options);
}
