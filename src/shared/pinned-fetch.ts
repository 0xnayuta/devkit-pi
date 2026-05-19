import { Agent, fetch as undiciFetch } from "undici";
import {
  type DnsLookupImpl,
  type DnsResolvedAddress,
  normalizeDnsHostname,
  normalizeHostForIp,
  resolveAndValidateHttpUrl,
} from "./http-security.ts";

export type { DnsResolvedAddress } from "./http-security.ts";

export interface ResolvePinnedAddressOptions {
  allowPrivateNetwork: boolean;
}

export interface PinnedRequestOptions extends RequestInit {
  timeoutMs: number;
  allowPrivateNetwork: boolean;
}

export interface PinnedFetchDependencies {
  fetchImpl?: typeof fetch;
  lookupImpl?: DnsLookupImpl;
  createDispatcher?: (context: {
    url: URL;
    addresses: DnsResolvedAddress[];
    timeoutMs: number;
  }) => unknown;
}

type LookupCallback = (error: Error | null, address: string, family: number) => void;

type DisposableDispatcher = {
  close?: () => Promise<void> | void;
  destroy?: () => void;
};

const initialGlobalFetch = globalThis.fetch;

type LookupFamilyPreference = number | "IPv4" | "IPv6" | undefined;

interface LookupOptions {
  family?: LookupFamilyPreference;
}

function normalizeFamilyPreference(family: LookupFamilyPreference): 4 | 6 | undefined {
  if (family === 4 || family === "IPv4") return 4;
  if (family === 6 || family === "IPv6") return 6;
  return undefined;
}

function selectAddress(
  addresses: DnsResolvedAddress[],
  familyPreference: LookupFamilyPreference,
  cursor: { value: number }
): DnsResolvedAddress | undefined {
  const normalizedFamily = normalizeFamilyPreference(familyPreference);
  const candidates = normalizedFamily
    ? addresses.filter((item) => item.family === normalizedFamily)
    : addresses;

  if (candidates.length === 0) return undefined;

  const index = cursor.value % candidates.length;
  cursor.value += 1;
  return candidates[index];
}

function isDisposableDispatcher(dispatcher: unknown): dispatcher is DisposableDispatcher {
  if (!dispatcher || typeof dispatcher !== "object") return false;
  const candidate = dispatcher as DisposableDispatcher;
  return typeof candidate.close === "function" || typeof candidate.destroy === "function";
}

function createDispatcherDisposer(dispatcher: unknown): () => Promise<void> {
  let disposed = false;

  return async () => {
    if (disposed) return;
    disposed = true;
    if (!isDisposableDispatcher(dispatcher)) return;

    try {
      if (typeof dispatcher.close === "function") {
        await dispatcher.close();
        return;
      }
      dispatcher.destroy?.();
    } catch {
      try {
        dispatcher.destroy?.();
      } catch {
        // Disposal is best-effort and must not replace the original fetch/body outcome.
      }
    }
  };
}

function responseInitFrom(response: Response): ResponseInit {
  return {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  };
}

function preserveResponseMetadata(source: Response, target: Response): Response {
  for (const key of ["url", "redirected", "type"] as const) {
    Object.defineProperty(target, key, {
      configurable: true,
      enumerable: true,
      value: source[key],
    });
  }
  return target;
}

function wrapBodyWithDispose(body: ReadableStream<Uint8Array>, dispose: () => Promise<void>) {
  const reader = body.getReader();

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          controller.close();
          reader.releaseLock();
          await dispose();
          return;
        }
        if (value) controller.enqueue(value);
      } catch (error) {
        reader.releaseLock();
        await dispose();
        throw error;
      }
    },
    async cancel(reason) {
      try {
        await reader.cancel(reason);
      } finally {
        reader.releaseLock();
        await dispose();
      }
    },
  });
}

function attachDispatcherDisposal(response: Response, dispose: () => Promise<void>): Response {
  if (!response.body) {
    void dispose();
    return response;
  }

  const wrappedBody = wrapBodyWithDispose(response.body, dispose);
  return preserveResponseMetadata(response, new Response(wrappedBody, responseInitFrom(response)));
}

function normalizeLookupHostname(hostname: string): string {
  return normalizeHostForIp(normalizeDnsHostname(hostname));
}

function defaultFetchImpl(): typeof fetch {
  return globalThis.fetch === initialGlobalFetch ? (undiciFetch as typeof fetch) : globalThis.fetch;
}

export function createPinnedLookup(url: URL, addresses: DnsResolvedAddress[]) {
  const hostname = normalizeLookupHostname(url.hostname);
  const cursor = { value: 0 };

  return (
    lookupHostname: string,
    options: number | LookupOptions | undefined,
    callback: LookupCallback
  ): void => {
    if (normalizeLookupHostname(lookupHostname) !== hostname) {
      callback(
        new Error(`Pinned lookup hostname mismatch: ${lookupHostname} != ${url.hostname}`),
        "",
        0
      );
      return;
    }

    const familyPreference = typeof options === "number" ? options : options?.family;
    const selected = selectAddress(addresses, familyPreference, cursor);
    if (!selected) {
      callback(
        new Error(`No pinned address available for family=${String(familyPreference)}`),
        "",
        0
      );
      return;
    }

    callback(null, selected.address, selected.family);
  };
}

export function createPinnedDispatcher(context: {
  url: URL;
  addresses: DnsResolvedAddress[];
  timeoutMs: number;
}): unknown {
  const pinnedLookup = createPinnedLookup(context.url, context.addresses);
  return new Agent({
    connect: {
      lookup: pinnedLookup,
    },
    headersTimeout: context.timeoutMs,
    bodyTimeout: context.timeoutMs,
    keepAliveTimeout: 1,
    keepAliveMaxTimeout: 1,
    connections: 1,
    pipelining: 1,
  });
}

export async function resolveAndValidateAddresses(
  url: URL,
  options: ResolvePinnedAddressOptions,
  dependencies: Pick<PinnedFetchDependencies, "lookupImpl"> = {}
): Promise<DnsResolvedAddress[]> {
  const resolved = await resolveAndValidateHttpUrl(url, options, {
    lookupImpl: dependencies.lookupImpl,
  });
  return resolved.addresses;
}

export async function fetchWithPinnedDns(
  url: string | URL,
  options: PinnedRequestOptions,
  dependencies: PinnedFetchDependencies = {}
): Promise<Response> {
  const resolved = await resolveAndValidateHttpUrl(
    url,
    {
      allowPrivateNetwork: options.allowPrivateNetwork,
    },
    {
      lookupImpl: dependencies.lookupImpl,
    }
  );

  const fetchImpl = dependencies.fetchImpl ?? defaultFetchImpl();
  const dispatcherFactory = dependencies.createDispatcher ?? createPinnedDispatcher;
  const dispatcher = dispatcherFactory({
    url: resolved.url,
    addresses: resolved.addresses,
    timeoutMs: options.timeoutMs,
  });

  const disposeDispatcher = createDispatcherDisposer(dispatcher);
  const requestInit = { ...options } as Record<string, unknown>;
  requestInit.dispatcher = dispatcher;
  delete (requestInit as { timeoutMs?: number }).timeoutMs;
  delete (requestInit as { allowPrivateNetwork?: boolean }).allowPrivateNetwork;

  try {
    const response = await fetchImpl(resolved.url, requestInit as RequestInit);
    return attachDispatcherDisposal(response, disposeDispatcher);
  } catch (error) {
    await disposeDispatcher();
    throw error;
  }
}
