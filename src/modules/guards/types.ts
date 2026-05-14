import type { ExternalCommandRunner } from "../../shared/external-command.ts";

export interface GuardsSessionState {
  hasShownGitContext: boolean;
  hasWarnedBeforeFirstWrite: boolean;
  modifiedFiles: Set<string>;
  verificationCommands: string[];
}

export interface GitContext {
  repoRoot: string;
  branch: string | null;
  worktree: "clean" | "dirty";
  detachedHead: boolean;
}

export interface GitContextOptions {
  cwd: string;
  runner: ExternalCommandRunner;
  timeoutMs?: number;
}
