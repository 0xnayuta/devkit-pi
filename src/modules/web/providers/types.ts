import type {
	WebSearchProviderName as ConfiguredWebSearchProviderName,
	ResolvedWebConfig,
} from "../../../shared/types.ts";
import type { SearchResultItem } from "../types.ts";

export type WebSearchProviderName = Exclude<ConfiguredWebSearchProviderName, "auto">;

export interface ProviderSearchParams {
	query: string;
	numResults: number;
	signal?: AbortSignal;
}

export interface SearchProviderAdapter {
	name: WebSearchProviderName;
	isAvailable?(config: ResolvedWebConfig): boolean | Promise<boolean>;
	search(params: ProviderSearchParams, config: ResolvedWebConfig): Promise<SearchResultItem[]>;
}
