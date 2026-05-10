/**
 * Web Tools Error Codes and Recovery
 * Phase 5: Structured errors with recovery suggestions
 */

// ============================================================================
// Error Codes
// ============================================================================

export const WEB_ERROR_CODES = {
  // Search errors
  WEB_SEARCH_FAILED: "WEB_SEARCH_FAILED",
  WEB_SEARCH_TIMEOUT: "WEB_SEARCH_TIMEOUT",
  WEB_SEARCH_NO_RESULTS: "WEB_SEARCH_NO_RESULTS",
  WEB_SEARCH_INVALID_QUERY: "WEB_SEARCH_INVALID_QUERY",

  // Fetch errors
  CONTENT_FETCH_FAILED: "CONTENT_FETCH_FAILED",
  CONTENT_FETCH_TIMEOUT: "CONTENT_FETCH_TIMEOUT",
  CONTENT_FETCH_INVALID_URL: "CONTENT_FETCH_INVALID_URL",
  CONTENT_FETCH_TOO_LARGE: "CONTENT_FETCH_TOO_LARGE",

  // Provider errors
  PROVIDER_RATE_LIMITED: "PROVIDER_RATE_LIMITED",
  PROVIDER_UNAVAILABLE: "PROVIDER_UNAVAILABLE",
  PROVIDER_AUTH_FAILED: "PROVIDER_AUTH_FAILED",

  // Generic errors
  NETWORK_ERROR: "NETWORK_ERROR",
  PARSE_ERROR: "PARSE_ERROR",
  CACHE_ERROR: "CACHE_ERROR",
} as const;

export type WebErrorCode = (typeof WEB_ERROR_CODES)[keyof typeof WEB_ERROR_CODES];

// ============================================================================
// Error Structure
// ============================================================================

export interface WebError {
  code: WebErrorCode;
  message: string;
  provider?: string;
  originalError?: Error;
  recovery?: RecoverySuggestion;
  retryable: boolean;
}

export interface RecoverySuggestion {
  action: "retry" | "fallback" | "skip" | "abort";
  nextProvider?: string;
  waitMs?: number;
  description: string;
}

// ============================================================================
// Recovery Map
// ============================================================================

export const ERROR_RECOVERY_MAP: Partial<Record<WebErrorCode, RecoverySuggestion>> = {
  [WEB_ERROR_CODES.WEB_SEARCH_FAILED]: {
    action: "fallback",
    nextProvider: "auto",
    description: "Fallback to next available provider",
  },
  [WEB_ERROR_CODES.WEB_SEARCH_TIMEOUT]: {
    action: "fallback",
    nextProvider: "auto",
    description: "Search timed out, try next provider",
  },
  [WEB_ERROR_CODES.PROVIDER_RATE_LIMITED]: {
    action: "retry",
    waitMs: 5000,
    description: "Rate limit hit, waiting before retry",
  },
  [WEB_ERROR_CODES.PROVIDER_AUTH_FAILED]: {
    action: "abort",
    description: "Check API key configuration",
  },
  [WEB_ERROR_CODES.CONTENT_FETCH_TIMEOUT]: {
    action: "fallback",
    nextProvider: "jina",
    description: "Fetch timed out, try Jina Reader fallback",
  },
  [WEB_ERROR_CODES.NETWORK_ERROR]: {
    action: "retry",
    waitMs: 1000,
    description: "Network error, retry with backoff",
  },
  [WEB_ERROR_CODES.CONTENT_FETCH_INVALID_URL]: {
    action: "abort",
    description: "Invalid URL format, cannot retry",
  },
  [WEB_ERROR_CODES.CONTENT_FETCH_TOO_LARGE]: {
    action: "skip",
    description: "Response too large, skipping",
  },
};

// ============================================================================
// Error Factory
// ============================================================================

export function createWebError(
  code: WebErrorCode,
  message: string,
  options?: {
    provider?: string;
    originalError?: Error;
    retryable?: boolean;
  }
): WebError {
  const recovery = ERROR_RECOVERY_MAP[code];
  return {
    code,
    message,
    provider: options?.provider,
    originalError: options?.originalError,
    recovery,
    retryable:
      options?.retryable ?? (recovery?.action === "retry" || recovery?.action === "fallback"),
  };
}

// ============================================================================
// Error Mapping from External Errors
// ============================================================================

export function mapHttpStatusToError(
  status: number,
  provider?: string,
  message?: string
): WebError {
  switch (status) {
    case 401:
    case 403:
      return createWebError(
        WEB_ERROR_CODES.PROVIDER_AUTH_FAILED,
        message ?? "Authentication failed",
        {
          provider,
          retryable: false,
        }
      );

    case 429:
      return createWebError(
        WEB_ERROR_CODES.PROVIDER_RATE_LIMITED,
        message ?? "Rate limit exceeded",
        {
          provider,
          retryable: true,
        }
      );

    case 500:
    case 502:
    case 503:
    case 504:
      return createWebError(
        WEB_ERROR_CODES.PROVIDER_UNAVAILABLE,
        message ?? "Provider unavailable",
        {
          provider,
          retryable: true,
        }
      );

    default:
      return createWebError(WEB_ERROR_CODES.WEB_SEARCH_FAILED, message ?? `HTTP ${status}`, {
        provider,
      });
  }
}

export function mapNetworkErrorToWebError(error: Error, provider?: string): WebError {
  const message = error.message.toLowerCase();

  if (
    message.includes("fetch failed") ||
    message.includes("enotfound") ||
    message.includes("econn")
  ) {
    return createWebError(WEB_ERROR_CODES.NETWORK_ERROR, error.message, {
      provider,
      originalError: error,
      retryable: true,
    });
  }

  if (message.includes("timeout")) {
    return createWebError(WEB_ERROR_CODES.WEB_SEARCH_TIMEOUT, error.message, {
      provider,
      originalError: error,
      retryable: true,
    });
  }

  return createWebError(WEB_ERROR_CODES.WEB_SEARCH_FAILED, error.message, {
    provider,
    originalError: error,
    retryable: false,
  });
}

// ============================================================================
// Error Display Helpers
// ============================================================================

export function formatWebError(error: WebError): string {
  let result = `[${error.code}] ${error.message}`;
  if (error.provider) {
    result += ` (provider: ${error.provider})`;
  }
  if (error.recovery) {
    result += `\nSuggestion: ${error.recovery.description}`;
  }
  return result;
}

export function getErrorSummary(errors: WebError[]): {
  total: number;
  byCode: Record<string, number>;
  retryableCount: number;
} {
  const byCode: Record<string, number> = {};
  let retryableCount = 0;

  for (const error of errors) {
    byCode[error.code] = (byCode[error.code] ?? 0) + 1;
    if (error.retryable) retryableCount++;
  }

  return {
    total: errors.length,
    byCode,
    retryableCount,
  };
}
