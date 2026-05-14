function inputCommand(input: unknown): string {
  if (!input || typeof input !== "object") return "";
  const record = input as Record<string, unknown>;
  for (const key of ["command", "cmd", "script"] as const) {
    const value = record[key];
    if (typeof value === "string") return value;
  }
  return "";
}

export function extractShellCommand(input: unknown): string {
  return inputCommand(input).trim();
}

export function isShellTool(toolName: string): boolean {
  const normalized = toolName.trim().toLowerCase().split(".").pop() ?? "";
  return normalized === "bash" || normalized === "shell";
}

export function isVerificationCommand(command: string): boolean {
  const normalized = command.trim().toLowerCase();
  if (!normalized) return false;

  return [
    /(^|[;&|()\s])pnpm\s+(run\s+)?(test|lint|typecheck)\b/,
    /(^|[;&|()\s])npm\s+(test\b|run\s+(test|lint|typecheck)\b)/,
    /(^|[;&|()\s])yarn\s+(test|lint|typecheck)\b/,
    /(^|[;&|()\s])tsc\s+[^\n]*--noemit\b/,
    /(^|[;&|()\s])cargo\s+(test|check)\b/,
    /(^|[;&|()\s])pytest\b/,
    /(^|[;&|()\s])uv\s+run\s+pytest\b/,
    /(^|[;&|()\s])go\s+test\b/,
    /(^|[;&|()\s])cmake\s+--build\b/,
    /(^|[;&|()\s])ctest\b/,
    /(^|[;&|()\s])biome\s+check\b/,
  ].some((pattern) => pattern.test(normalized));
}
