import type { ResolvedWebConfig } from "../../shared/types.ts";

export type {
  DnsLookupImpl,
  DnsResolvedAddress,
  ResolveHttpUrlDependencies,
  ResolveHttpUrlOptions,
} from "../../shared/http-security.ts";
export {
  HttpSecurityError,
  isBlockedAddress,
  isPrivateNetworkHostname,
  normalizeDnsHostname,
  normalizeHostForIp,
  resolveAndValidateHttpUrl,
  validatePublicHttpUrl,
} from "../../shared/http-security.ts";

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
