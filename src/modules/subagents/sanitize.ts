/**
 * Output sanitization for subagent results
 * Removes sensitive information from output
 */

/**
 * Patterns for sensitive information that should be masked
 */
const SENSITIVE_PATTERNS: Array<{ pattern: RegExp | string; replacement: string }> = [
  // API keys and tokens
  {
    pattern:
      /(?:api[_-]?key|api[_-]?token|auth[_-]?token|access[_-]?token|secret[_-]?key)\s*[:=]\s*["']?([a-zA-Z0-9_-]{20,})["']?/gi,
    replacement: "$1: [REDACTED]",
  },
  // Bearer tokens
  { pattern: /Bearer\s+[a-zA-Z0-9_\-.]+/gi, replacement: "Bearer [REDACTED]" },
  // Authorization headers
  { pattern: /Authorization\s*:\s*[^\s\n]+/gi, replacement: "Authorization: [REDACTED]" },
  // AWS keys
  {
    pattern:
      /(?:AWS[_-]?ACCESS[_-]?KEY[_-]?ID|AWS[_-]?SECRET[_-]?ACCESS[_-]?KEY)\s*[:=]\s*["']?[A-Za-z0-9/+=]{20,}["']?/gi,
    replacement: "$1: [REDACTED]",
  },
  // GitHub tokens
  { pattern: /gh[pousr]_[A-Za-z0-9_]{36,}/g, replacement: "[GITHUB_TOKEN_REDACTED]" },
  // Environment variables with secrets
  {
    pattern:
      /(?:STRIPE[_-]?KEY|OPENAI[_-]?API[_-]?KEY|ANTHROPIC[_-]?API[_-]?KEY)\s*=\s*["']?[A-Za-z0-9_-]{20,}["']?/gi,
    replacement: "$1=[REDACTED]",
  },
  // Full .env dumps
  {
    pattern: /(?:^|\n)export\s+\w+=(?:['"]?)[A-Za-z0-9_-]{20,}(?:['"]?)/gm,
    replacement: "[ENV_VAR_REDACTED]",
  },
  // Stack traces with file paths - keep the error message, remove paths
  { pattern: /\s+at\s+.+\(([^)]+)\)/g, replacement: " at [REDACTED_PATH]" },
  // Common secret patterns in URLs
  {
    pattern: /[?&](?:api[_-]?key|token|secret|auth)=[A-Za-z0-9_-]{10,}/gi,
    replacement: "[REDACTED_PARAM]",
  },
];

/**
 * Get dynamic path patterns (created lazily to avoid module-load errors)
 */
function getPathSanitizePatterns(): Array<{ pattern: RegExp; replacement: string }> {
  const patterns: Array<{ pattern: RegExp; replacement: string }> = [];
  const homeDir = process.env.HOME ?? process.env.USERPROFILE;
  if (homeDir) {
    try {
      const escapedHome = homeDir.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      patterns.push({ pattern: new RegExp(escapedHome, "g"), replacement: "~" });
    } catch {
      // Skip invalid home dir pattern
    }
  }
  // Fallback patterns for Windows and Unix
  patterns.push({ pattern: /\/home\/[^/]+/g, replacement: "~" });
  patterns.push({ pattern: /C:\\Users\\[^\\]+/g, replacement: "~" });
  patterns.push({ pattern: /G:\\[^\\]+/g, replacement: "~" });
  return patterns;
}

/**
 * Truncate long stack traces to first 5 lines
 */
function truncateStackTrace(output: string): string {
  const lines = output.split("\n");
  const result: string[] = [];
  let stackLines = 0;
  const maxStackLines = 5;

  for (const line of lines) {
    if (
      line.match(/^\s+at\s+/) ||
      line.match(/^Error:/) ||
      line.match(/^TypeError:/) ||
      line.match(/^ReferenceError:/)
    ) {
      stackLines++;
      if (stackLines <= maxStackLines) {
        result.push(line);
      } else if (stackLines === maxStackLines + 1) {
        result.push(`    ... [${line.length > 100 ? `${line.slice(0, 100)}...` : line}]`);
        result.push("    [Additional stack frames truncated]");
      }
    } else {
      result.push(line);
    }
  }

  return result.join("\n");
}

/**
 * Sanitize output to remove sensitive information
 */
export function sanitizeOutput(output: string): string {
  if (!output) return output;

  let sanitized = output;

  // Apply all sensitive pattern replacements
  for (const { pattern, replacement } of SENSITIVE_PATTERNS) {
    try {
      sanitized = sanitized.replace(pattern as RegExp, replacement);
    } catch {
      // Invalid regex, skip
    }
  }

  // Apply path sanitize patterns (lazy-loaded to avoid module-load errors)
  for (const { pattern, replacement } of getPathSanitizePatterns()) {
    try {
      sanitized = sanitized.replace(pattern, replacement);
    } catch {
      // Skip invalid regex
    }
  }

  // Truncate long stack traces
  sanitized = truncateStackTrace(sanitized);

  return sanitized;
}

/**
 * Check if output contains potential sensitive information
 */
export function containsSensitiveInfo(output: string): boolean {
  const sensitivePatterns = [
    /api[_-]?key/i,
    /auth[_-]?token/i,
    /bearer\s+/i,
    /authorization\s*:/i,
    /aws[_-]?access/i,
    /ghp_[a-z0-9]/i,
    /openai[_-]?api/i,
    /anthropic[_-]?api/i,
  ];

  return sensitivePatterns.some((pattern) => pattern.test(output));
}
