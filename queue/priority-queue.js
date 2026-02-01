/**
 * Priority queue helpers and constants for the QueueManager
 */

// Priority levels with numeric values (lower = higher priority)
const PRIORITY_LEVELS = {
  CRITICAL: 0,
  HIGH: 1,
  NORMAL: 2,
  LOW: 3,
  BACKGROUND: 4
};

// Human-readable priority names
const PRIORITY_NAMES = {
  0: 'CRITICAL',
  1: 'HIGH',
  2: 'NORMAL',
  3: 'LOW',
  4: 'BACKGROUND'
};

/**
 * Priority-based queue configuration
 */
class PriorityConfig {
  constructor() {
    // Priority aging - increase priority over time to prevent starvation
    this.agingEnabled = true;
    this.agingIntervalMs = 5000; // Check every 5 seconds
    this.agingIncrement = 0.1; // Increase priority by 0.1 each interval
    
    // Priority-based timeouts
    this.timeoutsByPriority = {
      [PRIORITY_LEVELS.CRITICAL]: 120000, // 2 minutes
      [PRIORITY_LEVELS.HIGH]: 60000,     // 1 minute
      [PRIORITY_LEVELS.NORMAL]: 30000,   // 30 seconds
      [PRIORITY_LEVELS.LOW]: 15000,      // 15 seconds
      [PRIORITY_LEVELS.BACKGROUND]: 5000  // 5 seconds
    };
    
    // Max queue sizes by priority
    this.maxQueueSizeByPriority = {
      [PRIORITY_LEVELS.CRITICAL]: 100,
      [PRIORITY_LEVELS.HIGH]: 50,
      [PRIORITY_LEVELS.NORMAL]: 30,
      [PRIORITY_LEVELS.LOW]: 20,
      [PRIORITY_LEVELS.BACKGROUND]: 10
    };
  }

  /**
   * Get timeout for a given priority
   */
  getTimeout(priority) {
    return this.timeoutsByPriority[priority] || this.timeoutsByPriority[PRIORITY_LEVELS.NORMAL];
  }

  /**
   * Check if queue has space for a given priority
   */
  hasCapacity(priority, currentSize) {
    const maxSize = this.maxQueueSizeByPriority[priority] || this.maxQueueSizeByPriority[PRIORITY_LEVELS.NORMAL];
    return currentSize < maxSize;
  }
}

/**
 * Priority queue statistics tracker
 */
class PriorityStats {
  constructor() {
    this.jobsByPriority = {};
    this.waitTimesByPriority = {};
    
    // Initialize counters
    Object.values(PRIORITY_LEVELS).forEach(level => {
      this.jobsByPriority[level] = 0;
      this.waitTimesByPriority[level] = [];
    });
  }

  /**
   * Record a job completion
   */
  recordJob(priority, waitTimeMs) {
    this.jobsByPriority[priority] = (this.jobsByPriority[priority] || 0) + 1;
    
    if (!this.waitTimesByPriority[priority]) {
      this.waitTimesByPriority[priority] = [];
    }
    this.waitTimesByPriority[priority].push(waitTimeMs);
    
    // Keep only last 100 wait times per priority
    if (this.waitTimesByPriority[priority].length > 100) {
      this.waitTimesByPriority[priority].shift();
    }
  }

  /**
   * Get statistics summary
   */
  getSummary() {
    const summary = {};
    
    Object.entries(PRIORITY_NAMES).forEach(([level, name]) => {
      const waitTimes = this.waitTimesByPriority[level] || [];
      const totalJobs = this.jobsByPriority[level] || 0;
      
      summary[name] = {
        totalJobs,
        avgWaitTimeMs: waitTimes.length > 0 
          ? Math.round(waitTimes.reduce((a, b) => a + b, 0) / waitTimes.length)
          : 0,
        medianWaitTimeMs: this._calculateMedian(waitTimes)
      };
    });
    
    return summary;
  }

  _calculateMedian(arr) {
    if (arr.length === 0) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 
      ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
      : sorted[mid];
  }
}

module.exports = {
  PRIORITY_LEVELS,
  PRIORITY_NAMES,
  PriorityConfig,
  PriorityStats
};