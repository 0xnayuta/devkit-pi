import * as path from "node:path";
import type { ExternalCommandRunner } from "../../shared/external-command.ts";
import type { GitContext, GitContextOptions } from "./types.ts";

const DEFAULT_GIT_TIMEOUT_MS = 1500;
const MAX_GIT_STDOUT_BYTES = 64 * 1024;
const MAX_GIT_STDERR_BYTES = 8 * 1024;

async function runGit(
	runner: ExternalCommandRunner,
	cwd: string,
	args: string[],
	timeoutMs: number
): Promise<string | undefined> {
	try {
		const result = await runner.run(
			{ executable: "git", args },
			{
				cwd,
				timeoutMs,
				maxStdoutBytes: MAX_GIT_STDOUT_BYTES,
				maxStderrBytes: MAX_GIT_STDERR_BYTES,
			}
		);
		if (result.timedOut || result.exitCode !== 0) return undefined;
		return result.stdout.trim();
	} catch {
		return undefined;
	}
}

export async function getGitContext(options: GitContextOptions): Promise<GitContext | undefined> {
	const timeoutMs = options.timeoutMs ?? DEFAULT_GIT_TIMEOUT_MS;
	const inside = await runGit(options.runner, options.cwd, ["rev-parse", "--is-inside-work-tree"], timeoutMs);
	if (inside !== "true") return undefined;

	const repoRoot = await runGit(options.runner, options.cwd, ["rev-parse", "--show-toplevel"], timeoutMs);
	if (!repoRoot) return undefined;

	const abbrevHead = await runGit(options.runner, options.cwd, ["rev-parse", "--abbrev-ref", "HEAD"], timeoutMs);
	const branch = await runGit(options.runner, options.cwd, ["branch", "--show-current"], timeoutMs);
	const status = await runGit(options.runner, options.cwd, ["status", "--porcelain"], timeoutMs);

	const detachedHead = abbrevHead === "HEAD" || !branch;
	return {
		repoRoot,
		branch: detachedHead ? null : branch,
		worktree: status && status.length > 0 ? "dirty" : "clean",
		detachedHead,
	};
}

export function formatGitContextNotice(context: GitContext, cwd = process.cwd()): string {
	const repoName = path.basename(context.repoRoot) || path.relative(cwd, context.repoRoot) || context.repoRoot;
	const branch = context.detachedHead ? "detached HEAD" : (context.branch ?? "unknown");
	return `[devkit-pi] Git context: branch=${branch}, status=${context.worktree}, repo=${repoName}.`;
}

export function formatFirstWriteNotice(context: GitContext): string {
	const branch = context.detachedHead ? "detached HEAD" : (context.branch ?? "unknown");
	return `[devkit-pi] First write in this session. Current branch: ${branch}; working tree: ${context.worktree}. Please ensure this is the intended branch before editing.`;
}
