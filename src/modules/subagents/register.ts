/**
 * Subagents Module Registration
 *
 * Registers:
 * - "subagent" tool — delegates tasks to specialized readonly agents
 * - Developer commands: doctor, list, logs, activity
 * - Event handlers: session_start, before_agent_start, session_shutdown
 *
 * TODO: Phase 2 — migrate code from pi-subagents
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export interface SubagentsConfig {
  enabled?: boolean;
  maxDepth?: number;
  timeoutMs?: number;
  allowWrite?: boolean;
  injectDelegationPolicy?: boolean;
}

export function registerSubagentsModule(
  _pi: ExtensionAPI,
  _config: SubagentsConfig,
): void {
  // TODO: Phase 2
  // 1. Register "subagent" tool
  // 2. Register developer commands (doctor, list, logs, activity)
  // 3. Register before_agent_start for delegation policy injection
  // 4. Register session_start / session_shutdown for state management
}
