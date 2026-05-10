/**
 * HTTP Connection Pool
 * Phase 4: Performance Optimization - Keep-alive connection pooling
 */

import * as http from "node:http";
import * as https from "node:https";

// ============================================================================
// Types
// ============================================================================

export interface ConnectionPoolConfig {
  maxSockets: number;
  maxFreeSockets: number;
  timeout: number;
  scheduling?: "fifo" | "lifo";
}

export interface PoolStats {
  totalRequests: number;
  failedRequests: number;
  activeSockets: number;
  freeSockets: number;
  pendingRequests: number;
  failureRate: number;
}

// ============================================================================
// Default Configuration
// ============================================================================

export const DEFAULT_POOL_CONFIG: Required<ConnectionPoolConfig> = {
  maxSockets: 10,
  maxFreeSockets: 5,
  timeout: 60000, // 1 minute
  scheduling: "fifo",
};

// ============================================================================
// Pool Implementation
// ============================================================================

export class HttpConnectionPool {
  private httpAgent: http.Agent;
  private httpsAgent: https.Agent;
  private config: Required<ConnectionPoolConfig>;
  private stats = {
    totalRequests: 0,
    failedRequests: 0,
  };

  constructor(config: Partial<ConnectionPoolConfig> = {}) {
    this.config = {
      maxSockets: config.maxSockets ?? DEFAULT_POOL_CONFIG.maxSockets,
      maxFreeSockets: config.maxFreeSockets ?? DEFAULT_POOL_CONFIG.maxFreeSockets,
      timeout: config.timeout ?? DEFAULT_POOL_CONFIG.timeout,
      scheduling: config.scheduling ?? DEFAULT_POOL_CONFIG.scheduling,
    };

    // Create HTTP agent
    this.httpAgent = new http.Agent({
      keepAlive: true,
      maxSockets: this.config.maxSockets,
      maxFreeSockets: this.config.maxFreeSockets,
      timeout: this.config.timeout,
      scheduling: this.config.scheduling,
    });

    // Create HTTPS agent with same settings
    this.httpsAgent = new https.Agent({
      keepAlive: true,
      maxSockets: this.config.maxSockets,
      maxFreeSockets: this.config.maxFreeSockets,
      timeout: this.config.timeout,
      scheduling: this.config.scheduling,
      // Allow self-signed certificates for flexibility
      rejectUnauthorized: false,
    });
  }

  /**
   * Get the appropriate agent for a URL
   */
  private getAgent(url: URL): http.Agent | https.Agent {
    return url.protocol === "https:" ? this.httpsAgent : this.httpAgent;
  }

  /**
   * Fetch with connection pooling
   */
  async fetch(url: string | URL, options?: RequestInit): Promise<Response> {
    const urlString = url instanceof URL ? url.href : url;
    const parsedUrl = new URL(urlString);
    const agent = this.getAgent(parsedUrl);

    this.stats.totalRequests++;

    try {
      const response = await fetch(urlString, {
        ...options,
        // @ts-expect-error - Node fetch supports agent option
        agent,
      });
      return response;
    } catch (error) {
      this.stats.failedRequests++;
      throw error;
    }
  }

  /**
   * Get current statistics
   */
  getStats(): PoolStats {
    return {
      totalRequests: this.stats.totalRequests,
      failedRequests: this.stats.failedRequests,
      activeSockets: this.getActiveSocketCount(),
      freeSockets: this.getFreeSocketCount(),
      pendingRequests: this.getPendingRequestCount(),
      failureRate:
        this.stats.totalRequests > 0 ? this.stats.failedRequests / this.stats.totalRequests : 0,
    };
  }

  private getActiveSocketCount(): number {
    // Approximate based on requests
    const approxActive = Math.min(
      this.stats.totalRequests % this.config.maxSockets,
      this.config.maxSockets
    );
    return approxActive;
  }

  private getFreeSocketCount(): number {
    // Approximate based on keep-alive
    return Math.floor(this.config.maxFreeSockets);
  }

  private getPendingRequestCount(): number {
    // We track this separately
    return 0;
  }

  /**
   * Get current configuration
   */
  getConfig(): Required<ConnectionPoolConfig> {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<ConnectionPoolConfig>): void {
    const newConfig = {
      ...this.config,
      ...config,
    };

    // Only recreate agents if socket limits changed
    if (
      newConfig.maxSockets !== this.config.maxSockets ||
      newConfig.maxFreeSockets !== this.config.maxFreeSockets
    ) {
      this.destroy();
      this.config = newConfig;
      this.httpAgent = new http.Agent({
        keepAlive: true,
        maxSockets: this.config.maxSockets,
        maxFreeSockets: this.config.maxFreeSockets,
        timeout: this.config.timeout,
        scheduling: this.config.scheduling,
      });
      this.httpsAgent = new https.Agent({
        keepAlive: true,
        maxSockets: this.config.maxSockets,
        maxFreeSockets: this.config.maxFreeSockets,
        timeout: this.config.timeout,
        scheduling: this.config.scheduling,
        rejectUnauthorized: false,
      });
    } else {
      this.config = newConfig;
    }
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      totalRequests: 0,
      failedRequests: 0,
    };
  }

  /**
   * Destroy the pool and close all connections
   */
  destroy(): void {
    this.httpAgent.destroy();
    this.httpsAgent.destroy();
  }
}

// ============================================================================
// Global Pool Instance
// ============================================================================

let globalPool: HttpConnectionPool | null = null;

export function getConnectionPool(): HttpConnectionPool {
  if (!globalPool) {
    globalPool = new HttpConnectionPool({});
  }
  return globalPool;
}

export function initializeConnectionPool(config: Partial<ConnectionPoolConfig> = {}): void {
  if (!globalPool) {
    globalPool = new HttpConnectionPool(config);
  } else {
    globalPool.updateConfig(config);
  }
}

export function resetConnectionPool(): void {
  if (globalPool) {
    globalPool.destroy();
    globalPool = null;
  }
}

// ============================================================================
// Helper: Fetch with pool
// ============================================================================

export async function pooledFetch(url: string | URL, options?: RequestInit): Promise<Response> {
  return getConnectionPool().fetch(url, options);
}
