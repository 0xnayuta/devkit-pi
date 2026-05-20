import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { loadConfig, mergeConfig } from "../config/load-config.ts";
import { registerToolkitCommands } from "../modules/commands/register.ts";
import { registerConvertTools } from "../modules/convert/index.ts";
import { registerGuardsModule } from "../modules/guards/index.ts";
import { registerLspModule } from "../modules/lsp/register.ts";
import { registerSubagentsModule } from "../modules/subagents/register.ts";
import { registerWebTools, resetConnectionPool } from "../modules/web/register.ts";
import {
  createConsoleLoggerSink,
  createLogger,
  type Logger,
  type LoggerSink,
} from "../shared/logger.ts";
import type { ResolvedToolkitConfig } from "../shared/types.ts";

export interface DisposableResource {
  dispose(): void | Promise<void>;
}

export class ResourceScope {
  private readonly resources: DisposableResource[] = [];

  add(resource: DisposableResource): void {
    this.resources.push(resource);
  }

  async disposeAll(): Promise<void> {
    const pending = this.resources.splice(0).reverse();
    for (const resource of pending) {
      await resource.dispose();
    }
  }
}

export interface CreateDevkitRuntimeOptions {
  logger?: Logger;
  loggerSink?: LoggerSink;
}

export interface DevkitRuntime {
  readonly config: ResolvedToolkitConfig;
  activate(): Promise<void>;
  dispose(): Promise<void>;
}

export function createDevkitRuntime(
  pi: ExtensionAPI,
  options: CreateDevkitRuntimeOptions = {}
): DevkitRuntime {
  const baseLogger =
    options.logger ??
    createLogger({
      module: "extension",
      sink: options.loggerSink ?? createConsoleLoggerSink(),
    });
  const logger = baseLogger.child("runtime");

  const { config, errors } = loadConfig();
  if (errors.length > 0) {
    for (const msg of errors) {
      logger.error("config.load_error", msg);
    }
  }

  const effectiveConfig = mergeConfig(config);
  const resources = new ResourceScope();

  const registerModules = () => {
    registerWebTools(pi, effectiveConfig.web);
    resources.add({
      async dispose() {
        resetConnectionPool();
      },
    });

    registerLspModule(pi, effectiveConfig.lsp, { resources });

    const subagentsConfig = {
      ...effectiveConfig.subagents,
      allowLspTools:
        effectiveConfig.subagents.allowLspTools &&
        effectiveConfig.lsp.enabled &&
        effectiveConfig.lsp.tool.enabled,
    };

    registerSubagentsModule(pi, subagentsConfig, {
      logger: logger.child("subagents"),
      resources,
    });

    registerConvertTools(pi, effectiveConfig.convertContent);
    registerGuardsModule(pi, effectiveConfig.guards);
    registerToolkitCommands(pi, effectiveConfig);
  };

  return {
    config: effectiveConfig,
    async activate(): Promise<void> {
      if (!effectiveConfig.enabled) return;
      registerModules();
    },
    async dispose(): Promise<void> {
      try {
        await resources.disposeAll();
      } catch (error) {
        logger.error(
          "runtime.dispose_failed",
          "Failed to dispose runtime resources",
          undefined,
          error
        );
      }
    },
  };
}
