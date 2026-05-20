import type { AgentToolResult } from "@earendil-works/pi-agent-core";
import { defineTool, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { getDevkitToolMetadata } from "../../extension/manifest.ts";
import { clearToolkitActivityLog } from "../../shared/activity.ts";
import { createLogger, type Logger } from "../../shared/logger.ts";
import type { ResolvedConvertContentConfig } from "../../shared/types.ts";
import { ConvertProviderError, toDevkitConvertErrorPayload } from "./errors.ts";
import { resetConvertToolStats } from "./observability.ts";
import { MarkItDownProvider } from "./provider.ts";
import { renderConvertContentCall, renderConvertContentResult } from "./renderers.ts";
import { ConvertContentParams } from "./schemas.ts";
import { convertContent } from "./tool.ts";
import type { ConvertContentInput } from "./types.ts";

function asToolResult(details: unknown): AgentToolResult<any> {
  return {
    content: [{ type: "text", text: JSON.stringify(details, null, 2) }],
    details,
  };
}

export function registerConvertTools(
  pi: ExtensionAPI,
  config: ResolvedConvertContentConfig,
  options: { logger?: Logger } = {}
): void {
  const logger = options.logger ?? createLogger({ module: "convert.register" });
  if (!config.enabled) return;

  const provider = new MarkItDownProvider({ command: config.command });
  pi.on("session_start", () => {
    resetConvertToolStats();
    clearToolkitActivityLog();
  });
  pi.on("session_shutdown", () => {
    resetConvertToolStats();
    clearToolkitActivityLog();
  });

  const convertMeta = getDevkitToolMetadata("convert_content");

  pi.registerTool(
    defineTool({
      name: convertMeta.name,
      label: convertMeta.label,
      description: convertMeta.description,
      promptSnippet: convertMeta.promptSnippet,
      promptGuidelines: [...convertMeta.promptGuidelines],
      parameters: ConvertContentParams,
      async execute(_id: string, params: ConvertContentInput, signal: AbortSignal | undefined) {
        const result = await convertContent(params, config, signal, provider);
        if ("error" in result) {
          logger.warn("convert.error_payload", "convert_content returned structured error", {
            payload: toDevkitConvertErrorPayload(
              new ConvertProviderError(result.error.code, result.error.message),
              {
                provider: provider.name,
              }
            ),
          });
        }
        return asToolResult(result);
      },
      renderCall(args: ConvertContentInput, theme: any) {
        return renderConvertContentCall(args, theme);
      },
      renderResult(
        result: AgentToolResult<any>,
        options: { expanded: boolean; isPartial: boolean },
        theme: any
      ) {
        return renderConvertContentResult(result, options, theme);
      },
    })
  );
}

export {
  CONVERT_ERROR_CODES,
  type ConvertErrorCode,
  ConvertProviderError,
  isConvertProviderError,
  toDevkitConvertErrorPayload,
} from "./errors.ts";
export {
  getConvertToolStats,
  recordConvertActivity,
  resetConvertToolStats,
} from "./observability.ts";
export { type ConvertOptions, type ConvertProvider, MarkItDownProvider } from "./provider.ts";
export { renderConvertContentCall, renderConvertContentResult } from "./renderers.ts";
export { ConvertContentParams } from "./schemas.ts";
export type { ConvertContentInput, ConvertContentResult } from "./types.ts";
