import * as fs from "node:fs";
import * as path from "node:path";
import {
	type ExternalCommandResult,
	type ExternalCommandRunner,
	type ExternalCommandSpec,
	NodeExternalCommandRunner,
} from "../../shared/external-command.ts";
import { CONVERT_ERROR_CODES, ConvertProviderError } from "./errors.ts";
import type { ConvertContentMetadata } from "./types.ts";

const STDERR_SUMMARY_CHARS = 1000;

export interface ConvertOptions {
	maxResponseBytes: number;
	timeoutMs: number;
	maxContentChars: number;
	signal?: AbortSignal;
}

export interface ConvertResult {
	content: string;
	truncated: boolean;
	metadata?: ConvertContentMetadata;
}

export interface ConvertProvider {
	readonly name: string;
	isAvailable(): Promise<boolean>;
	convertFile(filePath: string, options: ConvertOptions): Promise<ConvertResult>;
}

export interface MarkItDownProviderOptions {
	command: string | ExternalCommandSpec;
	env?: NodeJS.ProcessEnv;
	runner?: ExternalCommandRunner;
}

function summarizeStderr(stderr: string): string {
	const normalized = stderr.trim().replace(/\s+/g, " ");
	if (!normalized) return "";
	if (normalized.length <= STDERR_SUMMARY_CHARS) return normalized;
	return `${normalized.slice(0, STDERR_SUMMARY_CHARS)}...`;
}

function truncateContent(content: string, maxContentChars: number): { content: string; truncated: boolean } {
	if (content.length <= maxContentChars) return { content, truncated: false };
	return { content: content.slice(0, maxContentChars), truncated: true };
}

function normalizeCommand(command: string | ExternalCommandSpec): ExternalCommandSpec {
	return typeof command === "string" ? { executable: command } : command;
}

function formatCommandForMessage(command: ExternalCommandSpec): string {
	return [command.executable, ...(command.args ?? [])].join(" ");
}

export class MarkItDownProvider implements ConvertProvider {
	readonly name = "markitdown";

	private readonly command: ExternalCommandSpec;

	private readonly env: NodeJS.ProcessEnv;

	private readonly runner: ExternalCommandRunner;

	private availabilityCache: boolean | undefined;

	constructor(options: MarkItDownProviderOptions) {
		this.command = normalizeCommand(options.command);
		this.env = options.env ?? process.env;
		this.runner = options.runner ?? new NodeExternalCommandRunner();
	}

	async isAvailable(): Promise<boolean> {
		if (this.availabilityCache !== undefined) return this.availabilityCache;
		this.availabilityCache = await this.runner.isAvailable(this.command, { env: this.env });
		return this.availabilityCache;
	}

	async convertFile(filePath: string, options: ConvertOptions): Promise<ConvertResult> {
		if (!(await this.isAvailable())) {
			throw new ConvertProviderError(
				CONVERT_ERROR_CODES.COMMAND_NOT_FOUND,
				`MarkItDown CLI command '${formatCommandForMessage(this.command)}' was not found. Install MarkItDown and configure convertContent.command if needed.`
			);
		}

		const startTs = Date.now();
		const stat = fs.statSync(filePath);
		if (stat.size > options.maxResponseBytes) {
			throw new ConvertProviderError(
				CONVERT_ERROR_CODES.FILE_TOO_LARGE,
				`File exceeds convertContent.maxResponseBytes (${stat.size} > ${options.maxResponseBytes}).`
			);
		}

		const commandWithInput: ExternalCommandSpec = {
			executable: this.command.executable,
			args: [...(this.command.args ?? []), filePath],
		};

		let result: ExternalCommandResult;
		try {
			result = await this.runner.run(commandWithInput, {
				timeoutMs: options.timeoutMs,
				signal: options.signal,
				env: this.env,
			});
		} catch (error) {
			const nodeError = error as NodeJS.ErrnoException;
			if (nodeError.code === "ENOENT") {
				throw new ConvertProviderError(
					CONVERT_ERROR_CODES.COMMAND_NOT_FOUND,
					`MarkItDown CLI command '${formatCommandForMessage(this.command)}' was not found. Install MarkItDown and configure convertContent.command if needed.`
				);
			}
			throw new ConvertProviderError(
				CONVERT_ERROR_CODES.CONVERT_FAILED,
				`Failed to execute MarkItDown CLI: ${nodeError.message}`
			);
		}

		if (result.timedOut) {
			throw new ConvertProviderError(
				CONVERT_ERROR_CODES.CONVERT_TIMEOUT,
				`MarkItDown conversion timed out after ${options.timeoutMs}ms.`
			);
		}

		if (result.outputTruncated.stdout || result.outputTruncated.stderr) {
			const streams = [
				result.outputTruncated.stdout ? "stdout" : undefined,
				result.outputTruncated.stderr ? "stderr" : undefined,
			]
				.filter(Boolean)
				.join(" and ");
			throw new ConvertProviderError(
				CONVERT_ERROR_CODES.CONVERT_FAILED,
				`MarkItDown conversion output exceeded the ${streams} size limit and was stopped. Reduce input size or use a converter configuration that emits less output.`
			);
		}

		if (result.exitCode !== 0) {
			const stderrSummary = summarizeStderr(result.stderr);
			throw new ConvertProviderError(
				CONVERT_ERROR_CODES.CONVERT_FAILED,
				stderrSummary
					? `MarkItDown conversion failed with exit code ${result.exitCode}: ${stderrSummary}`
					: `MarkItDown conversion failed with exit code ${result.exitCode}.`,
				stderrSummary
			);
		}

		const truncated = truncateContent(result.stdout, options.maxContentChars);
		return {
			content: truncated.content,
			truncated: truncated.truncated,
			metadata: {
				fileName: path.basename(filePath),
				fileSize: stat.size,
				durationMs: Math.max(0, Date.now() - startTs),
			},
		};
	}
}
