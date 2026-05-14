import type { GuardsSessionState } from "./types.ts";

export function createGuardsSessionState(): GuardsSessionState {
  return {
    hasShownGitContext: false,
    hasWarnedBeforeFirstWrite: false,
    modifiedFiles: new Set<string>(),
    verificationCommands: [],
  };
}
