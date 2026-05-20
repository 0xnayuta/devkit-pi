import type { GuardsMode, ResolvedGuardsConfig } from "../../../shared/types.ts";

export function isGuardsModeEnabled(mode: GuardsMode): boolean {
  return mode !== "off";
}

export function isGuardsGateMode(mode: GuardsMode): mode is "confirm" | "block" {
  return mode === "confirm" || mode === "block";
}

export function shouldRunNoticeFlow(config: ResolvedGuardsConfig): boolean {
  return config.enabled && isGuardsModeEnabled(config.mode);
}
