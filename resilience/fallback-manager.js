const { CircuitBreakerManager } = require('./circuit-breaker');
const { ResiliencePolicies } = require('./policies');

/**
 * Fallback Chain Manager for Multi-Model AI Providers
 */
class FallbackManager {
  constructor(circuitBreakerManager) {
    this.circuitBreakerManager = circuitBreakerManager || new CircuitBreakerManager();
  }

  /**
   * Execute a provider call with fallback and circuit breaker protection
   * @param {Function[]} providerCalls - Array of provider call functions
   * @returns {Promise} Result from the first successful provider call
   */
  async executeWithFallback(providerCalls) {
    const qualityMetrics = this.circuitBreakerManager.qualityMetrics;
    
    // Sort providers by current performance (lowest failure rate first)
    const sortedProviders = Object.entries(qualityMetrics)
      .sort((a, b) => a[1].failureRate - b[1].failureRate)
      .map(entry => entry[0]);

    // Try providers in order of best performance
    for (const provider of sortedProviders) {
      try {
        const providerCall = providerCalls.find(call => call.provider === provider);
        if (!providerCall) continue;

        // Wrap the call with timeout and circuit breaker policies
        const combinedPolicy = ResiliencePolicies.combine(
          ResiliencePolicies.createTimeoutPolicy(),
          this.circuitBreakerManager.breakers[provider]
        );

        const result = await combinedPolicy.execute(providerCall.fn);
        
        return {
          provider,
          result,
          metrics: qualityMetrics[provider]
        };
      } catch (error) {
        // Log the failure, but continue to next provider
        console.warn(`Provider ${provider} failed:`, error);
        continue;
      }
    }

    // If all providers fail
    throw new Error('All providers failed');
  }

  /**
   * Create a degraded quality response
   * @param {Object} error - Original error
   * @returns {Object} Degraded response with reduced quality
   */
  createDegradedResponse(error) {
    return {
      content: 'Reduced quality response due to provider failures',
      originalError: error,
      degradationLevel: this._calculateDegradationLevel()
    };
  }

  /**
   * Calculate current system degradation level
   * @returns {number} Degradation level (0-1)
   */
  _calculateDegradationLevel() {
    const { qualityMetrics } = this.circuitBreakerManager;
    const failureRates = Object.values(qualityMetrics).map(m => m.failureRate);
    
    // Average failure rate across all providers
    const averageFailureRate = 
      failureRates.reduce((sum, rate) => sum + rate, 0) / failureRates.length;

    return Math.min(averageFailureRate, 1);
  }
}

// Example Integration
async function exampleProviderIntegration() {
  const fallbackManager = new FallbackManager();

  try {
    const result = await fallbackManager.executeWithFallback([
      {
        provider: 'openai',
        fn: async () => {
          // Simulated OpenAI call
          throw new Error('OpenAI unavailable');
        }
      },
      {
        provider: 'anthropic',
        fn: async () => {
          // Simulated Anthropic call
          return { response: 'Anthropic response' };
        }
      }
    ]);

    console.log('Successful provider:', result.provider);
    console.log('Response:', result.result);
  } catch (error) {
    console.error('All providers failed');
  }
}

module.exports = {
  FallbackManager,
  exampleProviderIntegration
};