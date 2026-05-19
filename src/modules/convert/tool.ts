import type { ResolvedConvertContentConfig } from "../../shared/types.ts";
import { CONVERT_ERROR_CODES, isConvertProviderError } from "./errors.ts";
import { recordConvertActivity } from "./observability.ts";
import type { ConvertProvider } from "./provider.ts";
import { downloadUrlToTempFile, removeDownloadedFile, validateLocalFilePath } from "./security.ts";
import type { ConvertContentInput, ConvertContentResult } from "./types.ts";

function error(code: keyof typeof CONVERT_ERROR_CODES, message: string): ConvertContentResult {
  return { error: { code: CONVERT_ERROR_CODES[code], message } };
}

function positiveOverride(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : fallback;
}

export async function convertContent(
  params: ConvertContentInput,
  config: ResolvedConvertContentConfig,
  signal: AbortSignal | undefined,
  provider: ConvertProvider
): Promise<ConvertContentResult> {
  const startTs = Date.now();
  const hasPath = typeof params.path === "string" && params.path.trim().length > 0;
  const hasUrl = typeof params.url === "string" && params.url.trim().length > 0;

  if (hasPath === hasUrl) {
    recordConvertActivity(provider.name, "error", startTs, CONVERT_ERROR_CODES.INVALID_INPUT);
    return error("INVALID_INPUT", "Provide exactly one of 'path' or 'url' for convert_content.");
  }

  const timeoutMs = positiveOverride(params.timeoutMs, config.timeoutMs);
  const maxContentChars = positiveOverride(params.maxContentChars, config.maxContentChars);

  if (hasUrl) {
    try {
      const downloaded = await downloadUrlToTempFile(params.url!.trim(), {
        timeoutMs,
        maxResponseBytes: config.maxResponseBytes,
        allowPrivateNetwork: config.allowPrivateNetwork,
        signal,
      });
      try {
        const result = await provider.convertFile(downloaded.path, {
          maxResponseBytes: config.maxResponseBytes,
          timeoutMs,
          maxContentChars,
          signal,
        });

        recordConvertActivity(provider.name, "success", startTs);
        return {
          source: downloaded.sourceUrl,
          provider: provider.name as "markitdown",
          content: result.content,
          truncated: result.truncated,
          metadata: {
            ...result.metadata,
            contentType: downloaded.contentType ?? result.metadata?.contentType,
            fileName: downloaded.fileName ?? result.metadata?.fileName,
            fileSize: downloaded.fileSize,
          },
        };
      } finally {
        await removeDownloadedFile(downloaded);
      }
    } catch (caught) {
      if (isConvertProviderError(caught)) {
        recordConvertActivity(provider.name, "error", startTs, caught.code);
        return { error: { code: caught.code, message: caught.message } };
      }
      const message = caught instanceof Error ? caught.message : String(caught);
      recordConvertActivity(provider.name, "error", startTs, CONVERT_ERROR_CODES.CONVERT_FAILED);
      return error("CONVERT_FAILED", `Conversion failed: ${message}`);
    }
  }

  let localFile: Awaited<ReturnType<typeof validateLocalFilePath>>;
  try {
    localFile = await validateLocalFilePath(params.path!.trim());
  } catch (caught) {
    if (isConvertProviderError(caught)) {
      recordConvertActivity(provider.name, "error", startTs, caught.code);
      return { error: { code: caught.code, message: caught.message } };
    }
    const message = caught instanceof Error ? caught.message : String(caught);
    recordConvertActivity(provider.name, "error", startTs, CONVERT_ERROR_CODES.CONVERT_FAILED);
    return error("CONVERT_FAILED", `Conversion failed: ${message}`);
  }

  const { path: sourcePath } = localFile;
  const localStat = localFile.stat;
  if (!localStat) {
    recordConvertActivity(provider.name, "error", startTs, CONVERT_ERROR_CODES.FILE_NOT_FOUND);
    return error("FILE_NOT_FOUND", `File not found: ${sourcePath}`);
  }
  if (localStat.size > config.maxResponseBytes) {
    recordConvertActivity(provider.name, "error", startTs, CONVERT_ERROR_CODES.FILE_TOO_LARGE);
    return error(
      "FILE_TOO_LARGE",
      `File exceeds convertContent.maxResponseBytes (${localStat.size} > ${config.maxResponseBytes}): ${sourcePath}`
    );
  }

  try {
    const result = await provider.convertFile(sourcePath, {
      maxResponseBytes: config.maxResponseBytes,
      timeoutMs,
      maxContentChars,
      signal,
    });

    recordConvertActivity(provider.name, "success", startTs);
    return {
      source: sourcePath,
      provider: provider.name as "markitdown",
      content: result.content,
      truncated: result.truncated,
      metadata: result.metadata,
    };
  } catch (caught) {
    if (isConvertProviderError(caught)) {
      recordConvertActivity(provider.name, "error", startTs, caught.code);
      return { error: { code: caught.code, message: caught.message } };
    }
    const message = caught instanceof Error ? caught.message : String(caught);
    recordConvertActivity(provider.name, "error", startTs, CONVERT_ERROR_CODES.CONVERT_FAILED);
    return error("CONVERT_FAILED", `Conversion failed: ${message}`);
  }
}
