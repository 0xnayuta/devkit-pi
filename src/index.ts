/**
 * devkit-pi — Personal all-in-one pi coding toolkit
 *
 * Thin entry point. Registers modules:
 * - subagents: task delegation to specialized readonly agents
 * - web: search, fetch, and external research tools
 * - lsp: language server protocol code intelligence
 * - convert: document conversion to Markdown
 * - commands: unified toolkit command center
 *
 * Each module is independently toggleable via config.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { activateDevkitExtension } from "./extension/activate.ts";
import type { Logger, LoggerSink } from "./shared/logger.ts";

export default async function registerExtension(
	pi: ExtensionAPI,
	options: { logger?: Logger; loggerSink?: LoggerSink } = {}
): Promise<void> {
	await activateDevkitExtension(pi, options);
}
