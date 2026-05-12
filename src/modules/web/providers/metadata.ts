import type { ResolvedWebConfig } from "../../../shared/types.ts";
import type { WebSearchProviderName } from "./types.ts";

export type ProviderTier = "commercial" | "self-host-or-open" | "zero-config";
export type ProviderConfigKey = "brave" | "openserp" | "searxng" | "tavily" | "serper";

export interface SearchProviderMetadata {
  name: WebSearchProviderName;
  displayName: string;
  tier: ProviderTier;
  configKey?: ProviderConfigKey;
  requiresApiKey: boolean;
}

export const SEARCH_PROVIDER_METADATA: Record<WebSearchProviderName, SearchProviderMetadata> = {
  brave: {
    name: "brave",
    displayName: "Brave Search",
    tier: "commercial",
    configKey: "brave",
    requiresApiKey: true,
  },
  ddgs: {
    name: "ddgs",
    displayName: "DuckDuckGo Lite",
    tier: "zero-config",
    requiresApiKey: false,
  },
  openserp: {
    name: "openserp",
    displayName: "OpenSERP",
    tier: "self-host-or-open",
    configKey: "openserp",
    requiresApiKey: true,
  },
  searxng: {
    name: "searxng",
    displayName: "SearXNG",
    tier: "self-host-or-open",
    configKey: "searxng",
    requiresApiKey: false,
  },
  tavily: {
    name: "tavily",
    displayName: "Tavily",
    tier: "commercial",
    configKey: "tavily",
    requiresApiKey: true,
  },
  serper: {
    name: "serper",
    displayName: "Serper",
    tier: "commercial",
    configKey: "serper",
    requiresApiKey: true,
  },
};

export const SEARCH_PROVIDER_NAMES = Object.keys(
  SEARCH_PROVIDER_METADATA
) as WebSearchProviderName[];

export function providerNamesByTier(tier: ProviderTier): WebSearchProviderName[] {
  return SEARCH_PROVIDER_NAMES.filter((name) => SEARCH_PROVIDER_METADATA[name].tier === tier);
}

export function getProviderDisplayName(name: string): string {
  return name in SEARCH_PROVIDER_METADATA
    ? SEARCH_PROVIDER_METADATA[name as WebSearchProviderName].displayName
    : name;
}

export function isProviderEnabled(config: ResolvedWebConfig, name: WebSearchProviderName): boolean {
  const configKey = SEARCH_PROVIDER_METADATA[name].configKey;
  if (!configKey) return true;
  return config[configKey].enabled;
}

export function getProviderApiKeyEnv(
  config: ResolvedWebConfig,
  name: WebSearchProviderName
): string | undefined {
  const metadata = SEARCH_PROVIDER_METADATA[name];
  if (!metadata.requiresApiKey || !metadata.configKey) return undefined;

  const providerConfig = config[metadata.configKey] as { apiKeyEnv?: string };
  return providerConfig.apiKeyEnv;
}
