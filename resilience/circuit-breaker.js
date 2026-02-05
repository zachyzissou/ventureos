const EventEmitter = require('events');
const { ResiliencePolicies } = require('./policies');

/**
 * Circuit Breaker Manager for managing multiple provider circuit breakers
 */
class CircuitBreakerManager extends EventEmitter {
  constructor() {
    super();
    
    // Circuit breakers for different providers
    this.breakers = {
      openai: null,
      anthropic: null,
      google: null,
      local: null
    };

    // Provider priority fallback chain
    this.providerPriority = [
      'openai', 
      'anthropic', 
      'google', 
      'local'
    ];

    // Quality tracking
    this.qualityMetrics = {
      openai: { failureRate: 0, lastFailures: [] },
      anthropic: { failureRate: 0, lastFailures: [] },
      google: { failureRate: 0, lastFailures: [] },
      local: { failureRate: 0, lastFailures: [] }
    };
  }

  /**
   * Initialize circuit breakers for providers
   */
  initialize() {
    for (const provider of Object.keys(this.breakers)) {
      this.breakers[provider] = ResiliencePolicies.createCircuitBreakerPolicy();
    }
  }

  /**
   * Execute a provider call with circuit breaker protection
   * @param {string} provider - Provider name
   * @param {Function} fn - Provider call function
   * @returns {Promise} Result of the provider call
   */
  async executeWithCircuitBreaker(provider, fn) {
    if (!this.breakers[provider]) {
      throw new Error(`No circuit breaker configured for provider: ${provider}`);
    }

    try {
      const result = await this.breakers[provider].execute(fn);
      this._updateQualityMetrics(provider, true);
      return result;
    } catch (error) {
      this._updateQualityMetrics(provider, false);
      
      // Emit circuit open event if breaker opens
      if (this.breakers[provider].state === 'Open') {
        this.emit('circuit-open', { provider, error });
      }

      // Attempt fallback
      return this._attemptFallback(provider, error);
    }
  }

  /**
   * Attempt to use next available provider in the fallback chain
   * @param {string} failedProvider - Provider that failed
   * @param {Error} originalError - Original error
   * @returns {Promise} Result from fallback provider
   */
  async _attemptFallback(failedProvider, originalError) {
    const currentProviderIndex = this.providerPriority.indexOf(failedProvider);
    
    for (let i = currentProviderIndex + 1; i < this.providerPriority.length; i++) {
      const nextProvider = this.providerPriority[i];
      
      try {
        // Use the original function from the first attempt would be passed in a real implementation
        // This is a placeholder for demonstration
        return await this.executeWithCircuitBreaker(nextProvider, () => {
          throw new Error('Fallback implementation needed');
        });
      } catch (fallbackError) {
        // Continue to next provider if fallback fails
        continue;
      }
    }

    // If all providers fail, throw the original error
    throw originalError;
  }

  /**
   * Update quality metrics for a provider
   * @param {string} provider - Provider name
   * @param {boolean} success - Whether the call was successful
   */
  _updateQualityMetrics(provider, success) {
    const metrics = this.qualityMetrics[provider];
    
    metrics.lastFailures.push(!success);
    
    // Keep only last 10 calls
    if (metrics.lastFailures.length > 10) {
      metrics.lastFailures.shift();
    }

    // Calculate failure rate
    metrics.failureRate = 
      metrics.lastFailures.filter(f => f).length / metrics.lastFailures.length;

    // Optional: Log or emit metrics
    this.emit('quality-update', {
      provider,
      failureRate: metrics.failureRate
    });
  }

  /**
   * Get current circuit states
   * @returns {Object} Circuit states for all providers
   */
  getCircuitStates() {
    return Object.fromEntries(
      Object.entries(this.breakers).map(
        ([provider, breaker]) => [provider, breaker.state]
      )
    );
  }
}

// Example usage and initialization
const circuitBreakerManager = new CircuitBreakerManager();
circuitBreakerManager.initialize();

// Event listeners for monitoring
circuitBreakerManager.on('circuit-open', (event) => {
  console.error(`Circuit OPEN for ${event.provider}:`, event.error);
});

circuitBreakerManager.on('quality-update', (metrics) => {
  if (metrics.failureRate > 0.5) {
    console.warn(`High failure rate for ${metrics.provider}: ${metrics.failureRate * 100}%`);
  }
});

module.exports = {
  CircuitBreakerManager,
  circuitBreakerManager
};