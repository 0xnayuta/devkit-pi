import { braveProvider } from "./brave.ts";
import { ddgsProvider } from "./ddgs.ts";
import { openserpProvider } from "./openserp.ts";
import { searxngProvider } from "./searxng.ts";
import { serperProvider } from "./serper.ts";
import { tavilyProvider } from "./tavily.ts";
import type { SearchProviderAdapter, WebSearchProviderName } from "./types.ts";

const PROVIDERS: Record<WebSearchProviderName, SearchProviderAdapter> = {
  brave: braveProvider,
  ddgs: ddgsProvider,
  openserp: openserpProvider,
  searxng: searxngProvider,
  tavily: tavilyProvider,
  serper: serperProvider,
};

export function getSearchProvider(name: WebSearchProviderName): SearchProviderAdapter {
  return PROVIDERS[name];
}
