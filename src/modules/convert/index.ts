import type { AgentToolResult } from "@earendil-works/pi-agent-core";
import { defineTool, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { clearToolkitActivityLog } from "../../shared/activity.ts";
import type { ResolvedConvertContentConfig } from "../../shared/types.ts";
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

export function registerConvertTools(pi: ExtensionAPI, config: ResolvedConvertContentConfig): void {
  if (!config.enabled) return;

  const provider = new MarkItDownProvider({ command: config.command });
  const piAny = pi as any;
  if (typeof piAny.on === "function") {
    piAny.on("session_start", () => {
      resetConvertToolStats();
      clearToolkitActivityLog();
    });
    piAny.on("session_shutdown", () => {
      resetConvertToolStats();
      clearToolkitActivityLog();
    });
  }

  pi.registerTool(
    defineTool({
      name: "convert_content",
      label: "Convert Content",
      description:
        "Convert local files or safely downloaded remote files to Markdown using the configured optional provider.",
      parameters: ConvertContentParams,
      execute(_id: string, params: ConvertContentInput, signal: AbortSignal | undefined) {
        return convertContent(params, config, signal, provider).then(asToolResult);
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
