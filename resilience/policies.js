const { PolicyBuilder, RetryStrategy } = require('cockatiel');

/**
 * Circuit Breaker Policy Configurations
 */
class ResiliencePolicies {
  /**
   * Create a circuit breaker policy with standard configuration
   * @param {Object} options - Customization options for the circuit breaker
   * @returns {Policy} Configured circuit breaker policy
   */
  static createCircuitBreakerPolicy(options = {}) {
    const {
      failureThreshold = 0.5,  // 50% failure rate
      requestVolumeThreshold = 10,  // 10 requests to trigger
      breakDuration = 60000,  // 60 seconds
      halfOpenTestRequests = 1
    } = options;

    return PolicyBuilder
      .circuit()
      .withFailureRateThreshold(failureThreshold)
      .withRequestVolumeThreshold(requestVolumeThreshold)
      .withDurationOfBreak(breakDuration)
      .withHalfOpenAfter(breakDuration)
      .withMaxConcurrentHalfOpenRequests(halfOpenTestRequests)
      .build();
  }

  /**
   * Create a timeout policy
   * @param {number} timeoutMs - Timeout in milliseconds
   * @returns {Policy} Configured timeout policy
   */
  static createTimeoutPolicy(timeoutMs = 30000) {
    return PolicyBuilder
      .timeout(timeoutMs)
      .build();
  }

  /**
   * Combine multiple policies
   * @param {Policy[]} policies - Policies to combine
   * @returns {Policy} Combined policy
   */
  static combine(...policies) {
    return PolicyBuilder.wrap(...policies);
  }
}

module.exports = {
  ResiliencePolicies
};