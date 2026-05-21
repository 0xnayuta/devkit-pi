import { extractShellCommand, isShellTool } from "./command-classifier.ts";

function normalizeToolName(toolName: string): string {
	return toolName.trim().toLowerCase().split(".").pop() ?? "";
}

function isPotentialWriteCommand(command: string): boolean {
	const normalized = command.trim().toLowerCase();
	if (!normalized) return false;

	return [
		/(^|[;&|()\s])rm\s+/,
		/(^|[;&|()\s])mv\s+/,
		/(^|[;&|()\s])cp\s+/,
		/(^|[;&|()\s])sed\s+[^\n]*\s-i(\s|$|[a-z])/,
		/(^|[;&|()\s])tee\s+/,
		/(^|[;&|()\s])apply_patch(\s|$)/,
		/(^|[;&|()\s])git\s+(checkout|reset|clean)\b/,
		/(^|[;&|()\s])(pnpm|npm|yarn)\s+install\b/,
		/>\s*[^\s>]/,
	].some((pattern) => pattern.test(normalized));
}

export function isPotentialWriteTool(toolName: string, input?: unknown): boolean {
	const normalized = normalizeToolName(toolName);
	if (["write", "edit", "multi_edit", "apply_patch"].includes(normalized)) return true;
	if (!isShellTool(normalized)) return false;
	return isPotentialWriteCommand(extractShellCommand(input));
}
