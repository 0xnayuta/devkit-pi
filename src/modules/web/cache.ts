/**
 * Search Result Cache
 * Phase 4: Performance Optimization - Cache for search results
 */

import type { QueryResultData } from "./types.ts";

// ============================================================================
// Types
// ============================================================================

export interface CacheConfig {
  enabled: boolean;
  maxEntries: number;
  ttlMs: number;
}

interface CacheEntry {
  key: string;
  results: QueryResultData[];
  timestamp: number;
  hitCount: number;
}

export interface CacheStats {
  hits: number;
  misses: number;
  hitRate: number;
  size: number;
  maxSize: number;
}

// ============================================================================
// Default Configuration
// ============================================================================

export const DEFAULT_CACHE_CONFIG: Required<CacheConfig> = {
  enabled: false, // Disabled by default
  maxEntries: 50,
  ttlMs: 300000, // 5 minutes
};

// ============================================================================
// Cache Implementation
// ============================================================================

export class SearchResultCache {
  private cache: Map<string, CacheEntry> = new Map();
  private accessOrder: string[] = []; // LRU tracking
  private config: Required<CacheConfig>;
  private hits = 0;
  private misses = 0;

  constructor(config: Partial<CacheConfig> = {}) {
    this.config = {
      enabled: config.enabled ?? DEFAULT_CACHE_CONFIG.enabled,
      maxEntries: config.maxEntries ?? DEFAULT_CACHE_CONFIG.maxEntries,
      ttlMs: config.ttlMs ?? DEFAULT_CACHE_CONFIG.ttlMs,
    };
  }

  /**
   * Generate cache key from query and options
   */
  private generateKey(query: string, provider: string, numResults: number): string {
    // Normalize query: lowercase, trim, collapse whitespace
    const normalized = query.toLowerCase().trim().replace(/\s+/g, " ");
    return `${provider}:${numResults}:${normalized}`;
  }

  /**
   * Get cached results
   */
  get(query: string, provider: string, numResults: number): QueryResultData[] | null {
    if (!this.config.enabled) return null;

    const key = this.generateKey(query, provider, numResults);
    const entry = this.cache.get(key);

    if (!entry) {
      this.misses++;
      return null;
    }

    // Check TTL
    if (Date.now() - entry.timestamp > this.config.ttlMs) {
      this.cache.delete(key);
      this.removeFromAccessOrder(key);
      this.misses++;
      return null;
    }

    // Update LRU order
    this.removeFromAccessOrder(key);
    this.accessOrder.push(key);

    // Update hit count
    entry.hitCount++;
    this.hits++;

    return entry.results;
  }

  /**
   * Store results in cache
   */
  set(query: string, provider: string, numResults: number, results: QueryResultData[]): void {
    if (!this.config.enabled) return;

    const key = this.generateKey(query, provider, numResults);

    // Evict if necessary
    if (this.cache.size >= this.config.maxEntries && !this.cache.has(key)) {
      this.evictLRU();
    }

    this.cache.set(key, {
      key,
      results,
      timestamp: Date.now(),
      hitCount: 1,
    });

    // Update LRU order
    this.removeFromAccessOrder(key);
    this.accessOrder.push(key);
  }

  /**
   * Check if a query result is cached (without updating stats)
   */
  has(query: string, provider: string, numResults: number): boolean {
    const key = this.generateKey(query, provider, numResults);
    const entry = this.cache.get(key);

    if (!entry) return false;

    // Check TTL
    if (Date.now() - entry.timestamp > this.config.ttlMs) {
      this.cache.delete(key);
      this.removeFromAccessOrder(key);
      return false;
    }

    return true;
  }

  /**
   * Invalidate a specific entry
   */
  invalidate(query: string, provider: string, numResults: number): void {
    const key = this.generateKey(query, provider, numResults);
    this.cache.delete(key);
    this.removeFromAccessOrder(key);
  }

  /**
   * Clear all cached entries
   */
  clear(): void {
    this.cache.clear();
    this.accessOrder = [];
    this.hits = 0;
    this.misses = 0;
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    const total = this.hits + this.misses;
    return {
      hits: this.hits,
      misses: this.misses,
      hitRate: total > 0 ? this.hits / total : 0,
      size: this.cache.size,
      maxSize: this.config.maxEntries,
    };
  }

  /**
   * Get current configuration
   */
  getConfig(): Required<CacheConfig> {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<CacheConfig>): void {
    this.config = {
      ...this.config,
      ...config,
    };
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private evictLRU(): void {
    if (this.accessOrder.length === 0) return;

    const lruKey = this.accessOrder.shift();
    if (lruKey) {
      this.cache.delete(lruKey);
    }
  }

  private removeFromAccessOrder(key: string): void {
    const index = this.accessOrder.indexOf(key);
    if (index !== -1) {
      this.accessOrder.splice(index, 1);
    }
  }
}

// ============================================================================
// Global Cache Instance
// ============================================================================

let globalCache: SearchResultCache | null = null;

export function getSearchCache(): SearchResultCache {
  if (!globalCache) {
    globalCache = new SearchResultCache({ enabled: false }); // Disabled by default
  }
  return globalCache;
}

export function initializeSearchCache(config: Partial<CacheConfig> = {}): void {
  if (!globalCache) {
    globalCache = new SearchResultCache(config);
  } else {
    globalCache.updateConfig(config);
  }
}

export function resetSearchCache(): void {
  if (globalCache) {
    globalCache.clear();
  }
}
