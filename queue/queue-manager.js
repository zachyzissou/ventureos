const PQueue = require('p-queue');
const { ConcurrencyLimiter } = require('../concurrency-limiter');

/**
 * QueueManager integrates p-queue with ConcurrencyLimiter.
 * Provides priority queuing, metrics, and concurrency control.
 */
class QueueManager {
  constructor({ limiter, maxQueueSize = 100, abortController }) {
    // P-Queue configuration - let ConcurrencyLimiter handle actual concurrency
    this.queue = new PQueue({
      concurrency: Infinity, // ConcurrencyLimiter controls real concurrency
      timeout: 60000, // Default timeout
      throwOnTimeout: true
    });

    // Map priority levels to p-queue numeric values (lower = higher priority)
    this.priorityMap = {
      high: 0,
      normal: 1,
      low: 2
    };

    // Integration with existing ConcurrencyLimiter
    this.limiter = limiter || new ConcurrencyLimiter({ maxQueue: 100 });

    // Metrics collection
    this.metrics = { 
      queueDepth: 0,
      totalWaitTimeMs: 0,
      totalProcessed: 0,
      rejected: 0,
      timedOut: 0
    };

    // Abort signal support
    this.abortController = abortController;

    // Setup overflow handling
    this.maxQueueSize = maxQueueSize;
    
    // Track metrics
    this.queue.on('active', () => this.metrics.queueDepth = this.queue.size);
    this.queue.on('idle', () => this.metrics.queueDepth = 0);
  }

  /**
   * Add a job to the queue with specified priority
   * @param {string} provider - Provider name for ConcurrencyLimiter
   * @param {Function} jobFn - The job function to execute
   * @param {Object} options - Priority and other options
   * @returns {Promise} - Resolves when job is processed
   */
  async add(provider, jobFn, options = {}) {
    const { priority = 'normal', timeout, signal } = options;

    // Enforce max queue size
    if (this.queue.size >= this.maxQueueSize) {
      this.metrics.rejected++;
      throw new Error(`Queue overflow - maximum size (${this.maxQueueSize}) reached`);
    }

    const priorityLevel = this.priorityMap[priority] ?? 1;
    const startTime = Date.now();

    return this.queue.add(async () => {
      // Check for abort signal
      if (signal?.aborted || this.abortController?.signal.aborted) {
        throw new Error('Job aborted before execution');
      }

      let release;
      try {
        // Request slot from ConcurrencyLimiter
        release = await this.limiter.requestSlot(provider, { priority: priorityLevel });
        
        // Track wait time
        const waitTime = Date.now() - startTime;
        this.metrics.totalWaitTimeMs += waitTime;
        
        // Execute job with timeout if specified
        const jobPromise = jobFn();
        const result = timeout 
          ? await Promise.race([
              jobPromise,
              new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Job timeout')), timeout)
              )
            ])
          : await jobPromise;

        this.metrics.totalProcessed++;
        return result;
        
      } catch (err) {
        if (err.message.includes('timeout')) {
          this.metrics.timedOut++;
        }
        throw err;
      } finally {
        // Always release slot
        if (release) release();
      }
    }, { priority: priorityLevel });
  }

  /**
   * Gracefully shutdown the queue
   * @returns {Promise} - Resolves when all jobs are complete or canceled
   */
  async shutdown() {
    try {
      // Abort all pending jobs
      this.abortController?.abort();
      
      // Clear pending jobs
      this.queue.clear();
      
      // Wait for active jobs to complete
      await this.queue.onIdle();
      
      return {
        processed: this.metrics.totalProcessed,
        rejected: this.metrics.rejected,
        timedOut: this.metrics.timedOut,
        avgWaitTimeMs: this.metrics.totalProcessed > 0 
          ? Math.round(this.metrics.totalWaitTimeMs / this.metrics.totalProcessed)
          : 0
      };
    } catch (err) {
      console.error('Queue shutdown error:', err);
      throw err;
    }
  }

  /**
   * Get current queue metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      queueSize: this.queue.size,
      pendingCount: this.queue.pending,
      avgWaitTimeMs: this.metrics.totalProcessed > 0 
        ? Math.round(this.metrics.totalWaitTimeMs / this.metrics.totalProcessed)
        : 0
    };
  }
}

module.exports = { QueueManager };