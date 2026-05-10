/**
 * Activity Panel TUI Component
 * Phase 6: UI Integration - Interactive activity log viewer
 */

import type { ActivityEntry, WebToolStats } from "../../web/observability.ts";
import {
  clearActivityLog,
  getActivityLog,
  getWebToolStats,
  resetWebToolStats,
} from "../../web/observability.ts";
import { formatTimestamp } from "./logs.ts";

// Re-export for external use
export type { LogsOptions } from "./logs.ts";

// ============================================================================
// Types
// ============================================================================

export interface ActivityPanelOptions {
  maxEntries?: number;
  showStats?: boolean;
  autoRefresh?: boolean;
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

  constructor(options: ActivityPanelOptions = {}) {
    this.maxVisibleLines = options.maxEntries ?? 15;
    this.state = {
      selectedIndex: 0,
      scrollOffset: 0,
      stats: getWebToolStats(),
      entries: getActivityLog(100),
    };
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
    this.state.stats = getWebToolStats();
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
      resetWebToolStats();
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

    // Header
    lines.push(`┌─ Web Tool Activity ${"─".repeat(Math.max(0, width - 25))}┐`);

    // Stats bar
    const statsLine = this.formatStatsBar(stats);
    lines.push(`│ ${statsLine.padEnd(width - 4)} │`);

    // Separator
    lines.push(`├${"─".repeat(width - 2)}┤`);

    // Entries
    if (entries.length === 0) {
      lines.push(`│ ${"(no recent activity)".padEnd(width - 4)} │`);
    } else {
      const visibleEntries = entries.slice(
        this.state.scrollOffset,
        this.state.scrollOffset + this.maxVisibleLines - 5
      );

      for (let i = 0; i < visibleEntries.length; i++) {
        const entry = visibleEntries[i];
        const actualIndex = this.state.scrollOffset + i;
        const isSelected = actualIndex === this.state.selectedIndex;

        const entryLine = this.formatEntry(entry, width - 4, isSelected);
        const prefix = isSelected ? "►" : " ";
        lines.push(`│${prefix} ${entryLine.padEnd(width - 5)}│`);
      }
    }

    // Fill remaining space
    const remaining = this.maxVisibleLines - lines.length + 2;
    for (let i = 0; i < remaining && lines.length < this.maxVisibleLines - 3; i++) {
      lines.push(`│${" ".repeat(width - 2)}│`);
    }

    // Help bar
    lines.push(`├${"─".repeat(width - 2)}┤`);
    const helpText = "↑↓ navigate  r:refresh  c:clear  s:reset stats  esc:close";
    lines.push(`│ ${helpText.padEnd(width - 4)} │`);

    // Footer
    lines.push(`└${"─".repeat(width - 2)}┘`);

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
    const time = formatTimestamp(entry.timestamp);
    const typeTag =
      entry.type === "search" ? "SEARCH" : entry.type === "fetch" ? "FETCH" : "CONTENT";
    const provider = entry.provider ?? "-";
    const status =
      entry.status === "success"
        ? "OK"
        : entry.status === "rate_limited"
          ? "LIMIT"
          : entry.status === "error"
            ? "ERR"
            : "---";
    const duration = entry.duration !== undefined ? `${entry.duration}ms` : "-";

    const parts = [time, typeTag, provider, status, duration];
    let line = parts.join("  ");

    if (line.length > maxWidth) {
      line = `${line.substring(0, maxWidth - 3)}...`;
    }

    if (isSelected && entry.error) {
      line += ` | ${entry.error}`;
    }

    return line;
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
