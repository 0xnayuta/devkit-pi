/**
 * Shared output sanitization helpers for user-visible tool output and error summaries.
 */

const SENSITIVE_PATTERNS: Array<{ pattern: RegExp; replacement: string }> = [
	{
		pattern:
			/\b(api[_-]?key|api[_-]?token|auth[_-]?token|access[_-]?token|secret[_-]?key)\s*[:=]\s*["']?[a-zA-Z0-9_-]{20,}["']?/gi,
		replacement: "$1=[REDACTED]",
	},
	{ pattern: /Bearer\s+[a-zA-Z0-9_\-.]+/gi, replacement: "Bearer [REDACTED]" },
	{ pattern: /Authorization\s*:\s*[^\s\n]+/gi, replacement: "Authorization: [REDACTED]" },
	{
		pattern:
			/\b(AWS[_-]?ACCESS[_-]?KEY[_-]?ID|AWS[_-]?SECRET[_-]?ACCESS[_-]?KEY)\s*[:=]\s*["']?[A-Za-z0-9/+=]{20,}["']?/gi,
		replacement: "$1=[REDACTED]",
	},
	{ pattern: /gh[pousr]_[A-Za-z0-9_]{36,}/g, replacement: "[GITHUB_TOKEN_REDACTED]" },
	{
		pattern:
			/\b(STRIPE[_-]?KEY|OPENAI[_-]?API[_-]?KEY|ANTHROPIC[_-]?API[_-]?KEY)\s*=\s*["']?[A-Za-z0-9_-]{20,}["']?/gi,
		replacement: "$1=[REDACTED]",
	},
	{
		pattern: /(?:^|\n)export\s+\w+=(?:['"]?)[A-Za-z0-9_-]{20,}(?:['"]?)/gm,
		replacement: "[ENV_VAR_REDACTED]",
	},
	{ pattern: /\s+at\s+.+\(([^)]+)\)/g, replacement: " at [REDACTED_PATH]" },
	{
		pattern: /([?&](?:api[_-]?key|token|secret|auth)=)[A-Za-z0-9_-]{10,}/gi,
		replacement: "$1[REDACTED]",
	},
];

function getPathSanitizePatterns(): Array<{ pattern: RegExp; replacement: string }> {
	const patterns: Array<{ pattern: RegExp; replacement: string }> = [];
	const homeDir = process.env.HOME ?? process.env.USERPROFILE;
	if (homeDir) {
		try {
			const escapedHome = homeDir.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
			patterns.push({ pattern: new RegExp(escapedHome, "g"), replacement: "~" });
		} catch {}
	}
	patterns.push({ pattern: /\/home\/[^/]+/g, replacement: "~" });
	patterns.push({ pattern: /C:\\Users\\[^\\]+/g, replacement: "~" });
	patterns.push({ pattern: /G:\\[^\\]+/g, replacement: "~" });
	return patterns;
}

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

export function sanitizeOutput(output: string): string {
	if (!output) return output;

	let sanitized = output;
	for (const { pattern, replacement } of SENSITIVE_PATTERNS) {
		sanitized = sanitized.replace(pattern, replacement);
	}
	for (const { pattern, replacement } of getPathSanitizePatterns()) {
		sanitized = sanitized.replace(pattern, replacement);
	}
	return truncateStackTrace(sanitized);
}

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
