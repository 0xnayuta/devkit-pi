import type { ResolvedWebConfig } from "../../../shared/types.ts";
import type { WebErrorCode } from "../errors.ts";
import { WEB_ERROR_CODES } from "../errors.ts";
import type { WebToolError } from "../types.ts";
import { getProviderApiKeyEnv, isProviderEnabled, providerNamesByTier, SEARCH_PROVIDER_NAMES } from "./metadata.ts";
import { getSearchProvider } from "./registry.ts";
import type { SearchProviderAdapter, WebSearchProviderName } from "./types.ts";

export type ProviderSelection =
	| {
			ok: true;
			provider: SearchProviderAdapter;
			providers: SearchProviderAdapter[];
			mode: "explicit" | "auto";
	  }
	| { ok: false; error: WebToolError };

const COMMERCIAL_PROVIDERS = providerNamesByTier("commercial");
const SELF_HOST_OR_OPEN_PROVIDERS = providerNamesByTier("self-host-or-open");
const ZERO_CONFIG_PROVIDERS = providerNamesByTier("zero-config");

function error(code: WebErrorCode, message: string): WebToolError {
	return { error: { code, message } };
}

async function isAvailable(provider: SearchProviderAdapter, config: ResolvedWebConfig): Promise<boolean> {
	if (provider.isAvailable === undefined) return true;
	try {
		return await provider.isAvailable(config);
	} catch {
		return false;
	}
}

function hasMissingApiKey(config: ResolvedWebConfig, providerName: WebSearchProviderName): boolean {
	const apiKeyEnv = getProviderApiKeyEnv(config, providerName);
	if (!apiKeyEnv) return false;

	const value = process.env[apiKeyEnv];
	return typeof value !== "string" || value.trim().length === 0;
}

function orderedTier(tier: WebSearchProviderName[], priority: WebSearchProviderName[]): WebSearchProviderName[] {
	return priority.filter((name) => tier.includes(name));
}

function autoProviderOrder(config: ResolvedWebConfig): WebSearchProviderName[] {
	const priority = config.providerPriority.filter((name) => SEARCH_PROVIDER_NAMES.includes(name));
	return [
		...orderedTier(COMMERCIAL_PROVIDERS, priority),
		...orderedTier(SELF_HOST_OR_OPEN_PROVIDERS, priority),
		...orderedTier(ZERO_CONFIG_PROVIDERS, priority),
	];
}

export async function selectSearchProvider(config: ResolvedWebConfig): Promise<ProviderSelection> {
	const configuredProvider = config.provider;

	if (configuredProvider === "auto") {
		const providerNames = autoProviderOrder(config);
		const providers: SearchProviderAdapter[] = [];

		for (const providerName of providerNames) {
			if (!isProviderEnabled(config, providerName)) continue;

			const candidate = getSearchProvider(providerName);
			if (await isAvailable(candidate, config)) {
				providers.push(candidate);
			}
		}

		if (providers.length > 0) {
			return { ok: true, provider: providers[0], providers, mode: "auto" };
		}

		return {
			ok: false,
			error: error(
				WEB_ERROR_CODES.WEB_SEARCH_FAILED,
				`No available web_search provider for auto mode. Tried: ${providerNames.join(", ")}.`
			),
		};
	}

	if (!SEARCH_PROVIDER_NAMES.includes(configuredProvider as WebSearchProviderName)) {
		return {
			ok: false,
			error: error(WEB_ERROR_CODES.INVALID_INPUT, `Unsupported web_search provider: ${configuredProvider}`),
		};
	}

	// Check each provider's enabled flag in explicit mode.
	if (!isProviderEnabled(config, configuredProvider)) {
		return {
			ok: false,
			error: error(
				WEB_ERROR_CODES.INVALID_INPUT,
				`Configured web_search provider '${configuredProvider}' is unavailable. Enable web.${configuredProvider}.enabled and check provider settings.`
			),
		};
	}

	const providerName = configuredProvider as WebSearchProviderName;
	const provider = getSearchProvider(providerName);

	if (!(await isAvailable(provider, config))) {
		if (hasMissingApiKey(config, providerName)) {
			const apiKeyEnv = getProviderApiKeyEnv(config, providerName);
			return {
				ok: false,
				error: error(
					WEB_ERROR_CODES.PROVIDER_AUTH_FAILED,
					`${apiKeyEnv} is required for web_search provider '${providerName}'. Configure provider authentication and try again.`
				),
			};
		}

		return {
			ok: false,
			error: error(
				WEB_ERROR_CODES.INVALID_INPUT,
				`Configured web_search provider '${providerName}' is unavailable. Check web.${providerName}.baseUrl and provider settings.`
			),
		};
	}

	return { ok: true, provider, providers: [provider], mode: "explicit" };
}
