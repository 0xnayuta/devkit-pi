/**
 * LSP Module Registration
 *
 * Registers the explicit `lsp` tool and optional automatic diagnostics hook.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { ResourceScope } from "../../extension/runtime.ts";
import { createLogger, type Logger } from "../../shared/logger.ts";
import { PI_SUBAGENT_CHILD, type ResolvedLspConfig } from "../../shared/types.ts";
import { shutdownManager } from "./core.ts";
import { registerLspHook } from "./hook.ts";
import { registerLspTool } from "./tool.ts";

export interface RegisterLspModuleOptions {
	resources?: ResourceScope;
	logger?: Logger;
}

export function registerLspModule(
	pi: ExtensionAPI,
	config: ResolvedLspConfig,
	options: RegisterLspModuleOptions = {}
): void {
	if (!config.enabled) return;

	const logger = options.logger ?? createLogger({ module: "lsp.register" });

	registerLspTool(pi, config.tool, { logger: logger.child("tool") });

	const isMainProcess = process.env[PI_SUBAGENT_CHILD] !== "1";
	const hookRegistersShutdown = isMainProcess && config.hook.enabled && config.hook.mode !== "disabled";

	if (isMainProcess) {
		registerLspHook(pi, config.hook);
	}

	// When the hook is active it already owns session_shutdown cleanup.
	// Register a standalone shutdown handler only when the hook is absent.
	if (!hookRegistersShutdown) {
		pi.on("session_shutdown", () => {
			void shutdownManager();
		});
	}

	options.resources?.add({
		async dispose() {
			await shutdownManager();
		},
	});
}
