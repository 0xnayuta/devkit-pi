/**
 * Request Concurrency Throttler
 * Phase 4: Performance Optimization - Semaphore-based request throttling
 */

// ============================================================================
// Types
// ============================================================================

export interface ConcurrencyConfig {
  maxConcurrent: number;
  maxQueueSize: number;
}

export interface ThrottlerStats {
  active: number;
  queued: number;
  maxConcurrent: number;
  maxQueueSize: number;
  totalProcessed: number;
  totalRejected: number;
}

// ============================================================================
// Default Configuration
// ============================================================================

export const DEFAULT_CONCURRENCY_CONFIG: Required<ConcurrencyConfig> = {
  maxConcurrent: 3,
  maxQueueSize: 10,
};

// ============================================================================
// Custom Error
// ============================================================================

export class QueueFullError extends Error {
  constructor(message = "Request queue is full") {
    super(message);
    this.name = "QueueFullError";
  }
}

// ============================================================================
// Throttler Implementation
// ============================================================================

export class RequestThrottler {
  private config: Required<ConcurrencyConfig>;
  private activeCount = 0;
  private queue: Array<{
    resolve: () => void;
    reject: (error: Error) => void;
  }> = [];
  private stats = {
    totalProcessed: 0,
    totalRejected: 0,
  };

  constructor(config: Partial<ConcurrencyConfig> = {}) {
    this.config = {
      maxConcurrent: config.maxConcurrent ?? DEFAULT_CONCURRENCY_CONFIG.maxConcurrent,
      maxQueueSize: config.maxQueueSize ?? DEFAULT_CONCURRENCY_CONFIG.maxQueueSize,
    };
  }

  /**
   * Execute a function with concurrency control
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // Check if we can immediately start
    if (this.activeCount < this.config.maxConcurrent) {
      return this.runImmediate(fn);
    }

    // Check if queue has space
    if (this.queue.length >= this.config.maxQueueSize) {
      this.stats.totalRejected++;
      throw new QueueFullError(
        `Request queue full (${this.queue.length}/${this.config.maxQueueSize})`
      );
    }

    // Add to queue
    return this.addToQueue(fn);
  }

  /**
   * Execute without queueing (immediate check)
   */
  private async runImmediate<T>(fn: () => Promise<T>): Promise<T> {
    this.activeCount++;
    this.stats.totalProcessed++;

    try {
      return await fn();
    } finally {
      this.dequeueNext();
    }
  }

  /**
   * Add to queue and wait
   */
  private addToQueue<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push({
        resolve: async () => {
          try {
            const result = await this.runImmediate(fn);
            resolve(result);
          } catch (error) {
            reject(error);
          }
        },
        reject: (error: Error) => {
          reject(error);
        },
      });
    });
  }

  /**
   * Process next item in queue
   */
  private dequeueNext(): void {
    this.activeCount--;

    if (this.queue.length > 0) {
      const next = this.queue.shift();
      if (next) {
        // Use setImmediate to prevent stack overflow
        setImmediate(next.resolve);
      }
    }
  }

  /**
   * Get current statistics
   */
  getStats(): ThrottlerStats {
    return {
      active: this.activeCount,
      queued: this.queue.length,
      maxConcurrent: this.config.maxConcurrent,
      maxQueueSize: this.config.maxQueueSize,
      totalProcessed: this.stats.totalProcessed,
      totalRejected: this.stats.totalRejected,
    };
  }

  /**
   * Get current configuration
   */
  getConfig(): Required<ConcurrencyConfig> {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<ConcurrencyConfig>): void {
    this.config = {
      ...this.config,
      ...config,
    };
  }

  /**
   * Wait for all active requests to complete
   */
  async waitForIdle(): Promise<void> {
    while (this.activeCount > 0 || this.queue.length > 0) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }

  /**
   * Clear queue and reset stats
   */
  reset(): void {
    // Reject all queued items
    for (const item of this.queue) {
      item.reject(new Error("Queue cleared"));
    }
    this.queue = [];
    this.activeCount = 0;
    this.stats = {
      totalProcessed: 0,
      totalRejected: 0,
    };
  }
}

// ============================================================================
// Global Throttler Instance
// ============================================================================

let globalThrottler: RequestThrottler | null = null;

export function getRequestThrottler(): RequestThrottler {
  if (!globalThrottler) {
    globalThrottler = new RequestThrottler({});
  }
  return globalThrottler;
}

export function initializeRequestThrottler(config: Partial<ConcurrencyConfig> = {}): void {
  if (!globalThrottler) {
    globalThrottler = new RequestThrottler(config);
  } else {
    globalThrottler.updateConfig(config);
  }
}

export function resetRequestThrottler(): void {
  if (globalThrottler) {
    globalThrottler.reset();
  }
}

// ============================================================================
// Helper: Wrap any async function with throttling
// ============================================================================

export async function withThrottle<T>(
  fn: () => Promise<T>,
  throttler: RequestThrottler = getRequestThrottler()
): Promise<T> {
  return throttler.execute(fn);
}
