export const CONVERT_ERROR_CODES = {
  INVALID_INPUT: "INVALID_INPUT",
  FILE_NOT_FOUND: "FILE_NOT_FOUND",
  FILE_TOO_LARGE: "FILE_TOO_LARGE",
  UNSUPPORTED_PROTOCOL: "UNSUPPORTED_PROTOCOL",
  COMMAND_NOT_FOUND: "COMMAND_NOT_FOUND",
  CONVERT_TIMEOUT: "CONVERT_TIMEOUT",
  CONVERT_FAILED: "CONVERT_FAILED",
  NETWORK_ERROR: "NETWORK_ERROR",
  PRIVATE_NETWORK_BLOCKED: "PRIVATE_NETWORK_BLOCKED",
} as const;

export type ConvertErrorCode = (typeof CONVERT_ERROR_CODES)[keyof typeof CONVERT_ERROR_CODES];

export class ConvertProviderError extends Error {
  readonly code: ConvertErrorCode;

  readonly causeSummary?: string;

  constructor(code: ConvertErrorCode, message: string, causeSummary?: string) {
    super(message);
    this.name = "ConvertProviderError";
    this.code = code;
    this.causeSummary = causeSummary;
  }
}

export function isConvertProviderError(error: unknown): error is ConvertProviderError {
  return error instanceof ConvertProviderError;
}
