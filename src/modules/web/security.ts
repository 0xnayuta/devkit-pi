import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import type { ResolvedWebConfig } from "../../shared/types.ts";

export interface WebSecurityLimits {
  timeoutMs: number;
  maxResponseBytes: number;
  maxContentChars: number;
  maxResults: number;
  allowPrivateNetwork: boolean;
}

export function getWebSecurityLimits(config: ResolvedWebConfig): WebSecurityLimits {
  return {
    timeoutMs: config.timeoutMs,
    maxResponseBytes: config.maxResponseBytes,
    maxContentChars: config.maxContentChars,
    maxResults: config.maxResults,
    allowPrivateNetwork: config.allowPrivateNetwork,
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

/**
 * Try to interpret a hex-encoded IPv4 from two 16-bit groups.
 *
 * Node.js normalizes `::ffff:127.0.0.1` → `::ffff:7f00:1`.
 * The two groups (0x7f00, 0x0001) encode the four IPv4 octets.
 */
function hexGroupsToIpv4(hex: string): string | undefined {
  const parts = hex.split(":");
  if (parts.length !== 2) return undefined;
  const high = Number.parseInt(parts[0], 16);
  const low = Number.parseInt(parts[1], 16);
  if (Number.isNaN(high) || Number.isNaN(low)) return undefined;
  return `${(high >> 8) & 0xff}.${high & 0xff}.${(low >> 8) & 0xff}.${low & 0xff}`;
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
    // Standard dotted-quad form: ::ffff:127.0.0.1
    if (isIP(mapped) === 4) return isPrivateIPv4(mapped);

    // Hex-encoded form produced by Node.js normalization:
    // ::ffff:127.0.0.1 → ::ffff:7f00:1
    const ipv4 = hexGroupsToIpv4(mapped);
    if (ipv4 && isIP(ipv4) === 4) return isPrivateIPv4(ipv4);
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

export function isPrivateNetworkHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/\.$/, "");
  const hostForIp = normalizeHostForIp(normalized);
  if (isIP(hostForIp)) return isBlockedAddress(hostForIp);
  return isBlockedHostname(normalized);
}

export async function validatePublicHttpUrl(
  input: string,
  options?: { allowPrivateNetwork?: boolean }
): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(input);
  } catch {
    throw new Error(`Invalid URL: ${input}`);
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`Unsupported URL protocol: ${parsed.protocol}`);
  }

  // When allowPrivateNetwork is enabled, skip all private address blocking.
  // Protocol and URL format validation still apply.
  if (options?.allowPrivateNetwork) {
    return parsed;
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

  // DNS rebinding / TOCTOU limitation: this validates pre-fetch DNS results but
  // does not pin the actual socket connection to one of these IPs. Future
  // hardening should add connection-stage IP pinning for fetch/download paths.
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
