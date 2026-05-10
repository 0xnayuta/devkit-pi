import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import type { ResolvedWebConfig } from "../../shared/types.ts";

export interface WebSecurityLimits {
  timeoutMs: number;
  maxResponseBytes: number;
  maxContentChars: number;
  maxResults: number;
}

export function getWebSecurityLimits(config: ResolvedWebConfig): WebSecurityLimits {
  return {
    timeoutMs: config.timeoutMs,
    maxResponseBytes: config.maxResponseBytes,
    maxContentChars: config.maxContentChars,
    maxResults: config.maxResults,
  };
}

function isPrivateIPv4(address: string): boolean {
  const parts = address.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) return true;
  const [a, b] = parts;

  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) ||
    a >= 224
  );
}

function isPrivateIPv6(address: string): boolean {
  const normalized = address.toLowerCase();

  if (
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("fe80:") ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd")
  ) {
    return true;
  }

  if (normalized.startsWith("::ffff:")) {
    const mapped = normalized.slice("::ffff:".length);
    if (isIP(mapped) === 4) return isPrivateIPv4(mapped);
  }

  return false;
}

function isBlockedAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return isPrivateIPv4(address);
  if (family === 6) return isPrivateIPv6(address);
  return true;
}

function normalizeHostForIp(hostname: string): string {
  return hostname.startsWith("[") && hostname.endsWith("]") ? hostname.slice(1, -1) : hostname;
}

function isBlockedHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/\.$/, "");
  return (
    normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    normalized.endsWith(".local") ||
    normalized.endsWith(".internal")
  );
}

export async function validatePublicHttpUrl(input: string): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(input);
  } catch {
    throw new Error(`Invalid URL: ${input}`);
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`Unsupported URL protocol: ${parsed.protocol}`);
  }

  if (isBlockedHostname(parsed.hostname)) {
    throw new Error(`Blocked private hostname: ${parsed.hostname}`);
  }

  const hostForIp = normalizeHostForIp(parsed.hostname);

  if (isIP(hostForIp)) {
    if (isBlockedAddress(hostForIp)) {
      throw new Error(`Blocked private address: ${parsed.hostname}`);
    }
    return parsed;
  }

  const addresses = await lookup(hostForIp, { all: true, verbatim: true });
  if (addresses.length === 0) {
    throw new Error(`Unable to resolve hostname: ${parsed.hostname}`);
  }

  for (const address of addresses) {
    if (isBlockedAddress(address.address)) {
      throw new Error(`Blocked private address for ${parsed.hostname}: ${address.address}`);
    }
  }

  return parsed;
}
