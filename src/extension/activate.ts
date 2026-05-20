import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  type CreateDevkitRuntimeOptions,
  createDevkitRuntime,
  type DevkitRuntime,
} from "./runtime.ts";

export interface ActivateDevkitExtensionOptions extends CreateDevkitRuntimeOptions {
  createRuntime?: (pi: ExtensionAPI, options: CreateDevkitRuntimeOptions) => DevkitRuntime;
}

export async function activateDevkitExtension(
  pi: ExtensionAPI,
  options: ActivateDevkitExtensionOptions = {}
): Promise<void> {
  const runtimeFactory = options.createRuntime ?? createDevkitRuntime;
  const runtime = runtimeFactory(pi, options);
  await runtime.activate();

  pi.on("session_shutdown", async () => {
    await runtime.dispose();
  });
}
