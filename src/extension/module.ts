import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { Logger } from "../shared/logger.ts";
import type { ResolvedToolkitConfig } from "../shared/types.ts";
import type { ResourceScope } from "./runtime.ts";

export interface DevkitModuleContext {
	readonly pi: ExtensionAPI;
	readonly config: ResolvedToolkitConfig;
	readonly resources: ResourceScope;
	readonly logger: Logger;
}

export interface DevkitModule {
	readonly name: string;
	register(context: DevkitModuleContext): void | Promise<void>;
}
