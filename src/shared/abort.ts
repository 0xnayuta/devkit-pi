export function withTimeoutSignal(timeoutMs: number, parentSignal?: AbortSignal): AbortSignal {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  return parentSignal ? AbortSignal.any([timeoutSignal, parentSignal]) : timeoutSignal;
}

export function isAbortLikeError(error: unknown): boolean {
  if (error instanceof DOMException) {
    return error.name === "AbortError" || error.name === "TimeoutError";
  }

  if (error instanceof Error) {
    const normalized = `${error.name} ${error.message}`.toLowerCase();
    return normalized.includes("abort") || normalized.includes("timeout");
  }

  const text = String(error).toLowerCase();
  return text.includes("abort") || text.includes("timeout");
}
