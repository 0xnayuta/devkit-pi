/**
 * Web Module Registration
 *
 * Registers:
 * - "web_search" tool — search the web via configurable providers
 * - "fetch_content" tool — fetch and extract readable text from URLs
 * - "get_search_content" tool — retrieve stored search/fetch results
 *
 * TODO: Phase 2 — migrate code from pi-subagents/src/web/
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export interface WebConfig {
  enabled?: boolean;
  provider?: string;
  timeoutMs?: number;
  maxResults?: number;
}

export function registerWebModule(
  _pi: ExtensionAPI,
  _config: WebConfig,
): void {
  // TODO: Phase 2
  // 1. Register web_search tool
  // 2. Register fetch_content tool
  // 3. Register get_search_content tool
}
