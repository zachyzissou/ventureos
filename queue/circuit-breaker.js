/**
 * Circuit Breaker for Resilient Queue Management
 * Implements a robust failure detection and recovery mechanism
 */
class CircuitBreaker {
  constructor({
    failureThreshold = 5,         // Number of consecutive failures to trip
    recoveryTime = 30000,          // 30 seconds recovery window
    timeoutMs = 10000,             // Default operation timeout
    errorTypes = ['NetworkError', 'TimeoutError', 'RateLimitError']
  } = {}) {
    // Circuit states
    this.STATES = {
      CLOSED: 'CLOSED',   // Normal operation
      OPEN: 'OPEN',       // Failing, blocking new requests
      HALF_OPEN: 'HALF_OPEN' // Tentative recovery state
    };

    // Current circuit state
    this.state = this.STATES.CLOSED;
    
    // Failure tracking
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = null;

    // Configuration
    this.config = {
      failureThreshold,
      recoveryTime,
      timeoutMs,
      errorTypes: new Set(errorTypes)
    };

    // Metrics
    this.metrics = {
      totalRequests: 0,
      failedRequests: 0,
      blockedRequests: 0,
      lastResetTime: Date.now()
    };
  }

  /**
   * Determine if an error should trigger circuit breaker
   * @param {Error} error - Error to evaluate
   * @returns {boolean} - Whether error is considered critical
   */
  _isCriticalError(error) {
    return this.config.errorTypes.has(error.name) || 
           this.config.errorTypes.some(type => error.message.includes(type));
  }

  /**
   * Record a failure and potentially change circuit state
   * @param {Error} error - The error that caused the failure
   */
  recordFailure(error) {
    if (!this._isCriticalError(error)) return;

    this.failureCount++;
    this.metrics.failedRequests++;
    this.lastFailureTime = Date.now();

    // Trip circuit if failure threshold is reached
    if (this.failureCount >= this.config.failureThreshold) {
      this.state = this.STATES.OPEN;
      console.warn(`[CircuitBreaker] Circuit OPEN - Too many failures (${this.failureCount})`);
    }
  }

  /**
   * Attempt to execute a function with circuit breaker protection
   * @param {Function} fn - Function to execute
   * @param {Object} options - Execution options
   * @returns {Promise} - Result of the function
   */
  async execute(fn, options = {}) {
    const { 
      timeout = this.config.timeoutMs,
      fallback = null 
    } = options;

    this.metrics.totalRequests++;

    // Check if circuit is open
    if (this.state === this.STATES.OPEN) {
      // Check if recovery time has passed
      if (Date.now() - this.lastFailureTime < this.config.recoveryTime) {
        this.metrics.blockedRequests++;
        
        // Use fallback if provided
        if (fallback) {
          console.warn('[CircuitBreaker] Using fallback due to open circuit');
          return fallback();
        }
        
        throw new Error('CircuitBreaker: Circuit is OPEN');
      }
      
      // Transition to half-open after recovery time
      this.state = this.STATES.HALF_OPEN;
      this.failureCount = 0;
    }

    try {
      // Create a race between the function and a timeout
      const result = await Promise.race([
        fn(),
        new Promise((_, reject) => 
          setTimeout(() => 
            reject(new Error('CircuitBreaker: Operation Timeout')), 
            timeout
          )
        )
      ]);

      // Success in half-open state - fully close the circuit
      if (this.state === this.STATES.HALF_OPEN) {
        this.state = this.STATES.CLOSED;
        this.successCount++;
        console.info('[CircuitBreaker] Circuit recovered and CLOSED');
      }

      return result;
    } catch (error) {
      // Record and potentially trip the circuit
      this.recordFailure(error);
      
      // Rethrow or use fallback
      if (fallback) {
        console.warn('[CircuitBreaker] Using fallback due to error', error);
        return fallback();
      }
      
      throw error;
    }
  }

  /**
   * Get current circuit breaker status
   * @returns {Object} - Detailed circuit status
   */
  getStatus() {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      metrics: { ...this.metrics },
      config: { ...this.config }
    };
  }

  /**
   * Manually reset the circuit breaker
   * @param {boolean} force - Force reset regardless of state
   */
  reset(force = false) {
    if (force || this.state !== this.STATES.CLOSED) {
      this.state = this.STATES.CLOSED;
      this.failureCount = 0;
      this.successCount = 0;
      this.lastFailureTime = null;
      this.metrics.lastResetTime = Date.now();
      
      console.info('[CircuitBreaker] Circuit manually reset');
    }
  }
}

/**
 * Queue Visualization and Telemetry Tracker
 * Provides real-time insights into queue performance
 */
class QueueVisualizer {
  constructor(queueManager) {
    this.queueManager = queueManager;
    
    // Real-time performance tracking
    this.performanceLog = [];
    this.MAX_LOG_ENTRIES = 100;

    // Health indicators
    this.healthIndicators = {
      avgWaitTime: 0,
      throughput: 0,
      errorRate: 0
    };

    // Start periodic monitoring
    this._startMonitoring();
  }

  /**
   * Periodic monitoring of queue health
   * @private
   */
  _startMonitoring() {
    this.monitorInterval = setInterval(() => {
      const metrics = this.queueManager.getMetrics();
      
      // Update performance log
      this._updatePerformanceLog(metrics);
      
      // Calculate health indicators
      this._calculateHealthIndicators(metrics);
    }, 5000); // Every 5 seconds
  }

  /**
   * Update performance log
   * @param {Object} metrics - Current queue metrics
   * @private
   */
  _updatePerformanceLog(metrics) {
    const logEntry = {
      timestamp: Date.now(),
      queueSize: metrics.queueSize,
      pendingJobs: metrics.pendingCount,
      processedJobs: metrics.totalProcessed,
      avgWaitTime: metrics.avgWaitTimeMs
    };

    this.performanceLog.push(logEntry);

    // Trim log to max entries
    if (this.performanceLog.length > this.MAX_LOG_ENTRIES) {
      this.performanceLog.shift();
    }
  }

  /**
   * Calculate queue health indicators
   * @param {Object} metrics - Current queue metrics
   * @private
   */
  _calculateHealthIndicators(metrics) {
    // Moving average for wait time
    const recentLog = this.performanceLog.slice(-10);
    this.healthIndicators.avgWaitTime = 
      recentLog.reduce((sum, entry) => sum + entry.avgWaitTime, 0) / recentLog.length;

    // Jobs processed per minute
    const timeWindow = 5; // 5 seconds
    this.healthIndicators.throughput = 
      metrics.totalProcessed / (timeWindow / 60);

    // Error rate calculation would require additional tracking
  }

  /**
   * Generate visual representation of queue state
   * @returns {Object} - Detailed queue visualization
   */
  getVisualization() {
    return {
      currentState: {
        size: this.performanceLog[this.performanceLog.length - 1]?.queueSize || 0,
        pendingJobs: this.performanceLog[this.performanceLog.length - 1]?.pendingJobs || 0
      },
      healthIndicators: this.healthIndicators,
      performanceHistory: this.performanceLog,
      recommendations: this._generateRecommendations()
    };
  }

  /**
   * Generate performance recommendations
   * @returns {string[]} - Recommendations for queue optimization
   * @private
   */
  _generateRecommendations() {
    const recommendations = [];

    if (this.healthIndicators.avgWaitTime > 5000) {
      recommendations.push('High average wait time - consider increasing concurrency');
    }

    if (this.performanceLog[this.performanceLog.length - 1]?.queueSize > 40) {
      recommendations.push('Queue size approaching limit - potential bottleneck');
    }

    return recommendations;
  }

  /**
   * Clean up monitoring resources
   */
  destroy() {
    clearInterval(this.monitorInterval);
  }
}

module.exports = {
  CircuitBreaker,
  QueueVisualizer
};