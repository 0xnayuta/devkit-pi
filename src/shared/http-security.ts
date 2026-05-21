import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export interface DnsResolvedAddress {
	address: string;
	family: 4 | 6;
}

export interface ResolveHttpUrlOptions {
	allowPrivateNetwork: boolean;
}

export interface ResolveHttpUrlDependencies {
	lookupImpl?: DnsLookupImpl;
}

export type DnsLookupImpl = (
	hostname: string,
	options: { all: true; verbatim: true }
) => Promise<{ address: string; family: number } | Array<{ address: string; family: number }>>;

export type HttpSecurityErrorCode =
	| "INVALID_URL"
	| "UNSUPPORTED_PROTOCOL"
	| "PRIVATE_NETWORK_BLOCKED"
	| "DNS_RESOLUTION_FAILED";

export class HttpSecurityError extends Error {
	readonly code: HttpSecurityErrorCode;

	constructor(code: HttpSecurityErrorCode, message: string) {
		super(message);
		this.name = "HttpSecurityError";
		this.code = code;
	}
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
		if (isIP(mapped) === 4) return isPrivateIPv4(mapped);

		const ipv4 = hexGroupsToIpv4(mapped);
		if (ipv4 && isIP(ipv4) === 4) return isPrivateIPv4(ipv4);
	}

	return false;
}

export function isBlockedAddress(address: string): boolean {
	const family = isIP(address);
	if (family === 4) return isPrivateIPv4(address);
	if (family === 6) return isPrivateIPv6(address);
	return true;
}

export function normalizeHostForIp(hostname: string): string {
	return hostname.startsWith("[") && hostname.endsWith("]") ? hostname.slice(1, -1) : hostname;
}

export function normalizeDnsHostname(hostname: string): string {
	return hostname.toLowerCase().replace(/\.$/, "");
}

function isBlockedHostname(hostname: string): boolean {
	const normalized = normalizeDnsHostname(hostname);
	return (
		normalized === "localhost" ||
		normalized.endsWith(".localhost") ||
		normalized.endsWith(".local") ||
		normalized.endsWith(".internal")
	);
}

export function isPrivateNetworkHostname(hostname: string): boolean {
	const normalized = normalizeDnsHostname(hostname);
	const hostForIp = normalizeHostForIp(normalized);
	if (isIP(hostForIp)) return isBlockedAddress(hostForIp);
	return isBlockedHostname(normalized);
}

function normalizeFamily(family: number): 4 | 6 {
	return family === 6 ? 6 : 4;
}

function parseHttpUrl(input: string | URL): URL {
	try {
		const parsed = typeof input === "string" ? new URL(input) : input;
		if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
			throw new HttpSecurityError("UNSUPPORTED_PROTOCOL", `Unsupported URL protocol: ${parsed.protocol}`);
		}
		return parsed;
	} catch (error) {
		if (error instanceof HttpSecurityError) throw error;
		throw new HttpSecurityError("INVALID_URL", `Invalid URL: ${String(input)}`);
	}
}

export async function resolveAndValidateHttpUrl(
	input: string | URL,
	options: ResolveHttpUrlOptions,
	dependencies: ResolveHttpUrlDependencies = {}
): Promise<{ url: URL; addresses: DnsResolvedAddress[] }> {
	const parsed = parseHttpUrl(input);
	const normalizedHostname = normalizeDnsHostname(parsed.hostname);
	const hostForIp = normalizeHostForIp(normalizedHostname);

	if (!options.allowPrivateNetwork && isBlockedHostname(normalizedHostname)) {
		throw new HttpSecurityError("PRIVATE_NETWORK_BLOCKED", `Blocked private hostname: ${parsed.hostname}`);
	}

	const ipFamily = isIP(hostForIp);
	if (ipFamily === 4 || ipFamily === 6) {
		if (!options.allowPrivateNetwork && isBlockedAddress(hostForIp)) {
			throw new HttpSecurityError("PRIVATE_NETWORK_BLOCKED", `Blocked private address: ${parsed.hostname}`);
		}
		return { url: parsed, addresses: [{ address: hostForIp, family: ipFamily }] };
	}

	const lookupImpl = dependencies.lookupImpl ?? lookup;
	let resolved: Awaited<ReturnType<DnsLookupImpl>>;
	try {
		resolved = await lookupImpl(hostForIp, { all: true, verbatim: true });
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		throw new HttpSecurityError(
			"DNS_RESOLUTION_FAILED",
			`Unable to resolve hostname: ${parsed.hostname}. ${message}`
		);
	}
	const entries = Array.isArray(resolved) ? resolved : [resolved];
	if (entries.length === 0) {
		throw new HttpSecurityError("DNS_RESOLUTION_FAILED", `Unable to resolve hostname: ${parsed.hostname}`);
	}

	const addresses = entries.map((entry) => ({
		address: entry.address,
		family: normalizeFamily(entry.family),
	}));

	if (!options.allowPrivateNetwork) {
		for (const address of addresses) {
			if (isBlockedAddress(address.address)) {
				throw new HttpSecurityError(
					"PRIVATE_NETWORK_BLOCKED",
					`Blocked private address for ${parsed.hostname}: ${address.address}`
				);
			}
		}
	}

	return { url: parsed, addresses };
}

export async function validatePublicHttpUrl(
	input: string | URL,
	options?: { allowPrivateNetwork?: boolean },
	dependencies: ResolveHttpUrlDependencies = {}
): Promise<URL> {
	if (options?.allowPrivateNetwork) {
		return parseHttpUrl(input);
	}

	const { url } = await resolveAndValidateHttpUrl(input, { allowPrivateNetwork: false }, dependencies);
	return url;
}
