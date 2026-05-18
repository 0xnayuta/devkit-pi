/**
 * Subagent child pi JSON stream transport preferences and compatibility helpers.
 *
 * Stage 2 preparation keeps the current full JSON mode behavior as the fallback,
 * while allowing devkit-pi to prefer a future upstream compact JSON stream
 * profile when supported.
 */

export type PiJsonStreamProfile = "full" | "compact";

type CompactJsonStreamSupport = "unknown" | "supported" | "unsupported";

let compactJsonStreamSupport: CompactJsonStreamSupport = "unknown";

export function getPreferredPiJsonStreamProfiles(): PiJsonStreamProfile[] {
  switch (compactJsonStreamSupport) {
    case "supported":
      return ["compact"];
    case "unsupported":
      return ["full"];
    default:
      return ["compact", "full"];
  }
}

export function getPiJsonModeArgs(profile: PiJsonStreamProfile): string[] {
  if (profile === "compact") {
    return ["--mode", "json", "--json-stream", "compact"];
  }
  return ["--mode", "json"];
}

export function notePiJsonStreamProfileSuccess(profile: PiJsonStreamProfile): void {
  if (profile === "compact") compactJsonStreamSupport = "supported";
}

export function notePiJsonStreamProfileUnsupported(profile: PiJsonStreamProfile): void {
  if (profile === "compact") compactJsonStreamSupport = "unsupported";
}

export function shouldFallbackFromCompactJsonStreamFailure(input: {
  exitCode: number;
  output?: string;
  error?: string;
  partialOutput?: string;
}): boolean {
  if (input.exitCode === 0) return false;

  const text = [input.error, input.output, input.partialOutput].filter(Boolean).join("\n");
  if (!/json-stream/i.test(text)) return false;

  return /unknown\s+(?:option|argument|flag)|unrecognized\s+option|unsupported\s+(?:option|argument|flag)|unexpected\s+argument|did\s+you\s+mean/i.test(
    text
  );
}

export function resetPiJsonStreamSupportForTests(): void {
  compactJsonStreamSupport = "unknown";
}
