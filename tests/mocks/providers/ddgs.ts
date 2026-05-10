/**
 * Provider Mocks
 * Phase 3: Test Framework - Mock providers for testing
 */

import type { SearchProviderAdapter, WebSearchProviderName } from "../../../src/modules/web/providers/types.ts";

/**
 * Mock DDGS provider for testing
 */
export function createMockDdgsProvider(overrides?: Partial<SearchProviderAdapter>): SearchProviderAdapter {
  return {
    name: "ddgs",
    isAvailable: async () => true,
    search: async ({ query, numResults }) => {
      // Return mock search results
      return [
        {
          title: `Mock result for: ${query}`,
          url: `https://example.com/result?q=${encodeURIComponent(query)}`,
          snippet: `This is a mock search result for "${query}"`,
          source: "ddgs-mock",
        },
        ...Array.from({ length: numResults - 1 }, (_, i) => ({
          title: `Mock result ${i + 2} for: ${query}`,
          url: `https://example.com/result${i + 2}?q=${encodeURIComponent(query)}`,
          snippet: `Mock snippet ${i + 2} for "${query}"`,
          source: "ddgs-mock",
        })),
      ];
    },
    ...overrides,
  };
}

/**
 * Mock Tavily provider for testing
 */
export function createMockTavilyProvider(overrides?: Partial<SearchProviderAdapter>): SearchProviderAdapter {
  return {
    name: "tavily",
    isAvailable: async () => true,
    search: async ({ query, numResults }) => {
      return Array.from({ length: numResults }, (_, i) => ({
        title: `Tavily result ${i + 1}: ${query}`,
        url: `https://tavily.example.com/result${i + 1}`,
        snippet: `Tavily mock snippet ${i + 1} for "${query}"`,
        source: "tavily-mock",
      }));
    },
    ...overrides,
  };
}

/**
 * Mock failing provider for testing error handling
 */
export function createMockFailingProvider(
  errorCode = "WEB_SEARCH_FAILED",
  message = "Mock provider failure"
): SearchProviderAdapter {
  return {
    name: "failing" as WebSearchProviderName,
    isAvailable: async () => {
      throw new Error("Provider unavailable");
    },
    search: async () => {
      const error = new Error(message);
      (error as any).status = 500;
      throw error;
    },
  };
}

/**
 * Mock rate-limited provider for testing rate limit handling
 */
export function createMockRateLimitedProvider(): SearchProviderAdapter {
  return {
    name: "rate-limited" as WebSearchProviderName,
    isAvailable: async () => true,
    search: async () => {
      const error = new Error("Too Many Requests");
      (error as any).status = 429;
      throw error;
    },
  };
}

/**
 * Mock auth-failed provider for testing auth errors
 */
export function createMockAuthFailedProvider(): SearchProviderAdapter {
  return {
    name: "auth-failed" as WebSearchProviderName,
    isAvailable: async () => true,
    search: async () => {
      const error = new Error("Unauthorized");
      (error as any).status = 401;
      throw error;
    },
  };
}
