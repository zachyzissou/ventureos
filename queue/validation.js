/**
 * Queue System Validation Framework
 * Comprehensive testing and quality assurance
 */
const { QueueManager } = require('./queue-manager');
const { ConcurrencyLimiter } = require('../concurrency-limiter');
const { CircuitBreaker, QueueVisualizer } = require('./circuit-breaker');
const { PRIORITY_LEVELS } = require('./priority-queue');

class QueueValidationSuite {
  constructor() {
    // Validation configuration
    this.config = {
      providers: {
        'anthropic': 3,
        'openai-codex': 3,
        'google-gemini-cli': 3,
        'ollama': 2
      },
      maxQueueSize: 50,
      validationScenarios: [
        'concurrency_limit',
        'priority_handling',
        'circuit_breaker',
        'performance_stress',
        'error_resilience'
      ]
    };

    // Validation metrics
    this.metrics = {
      passedTests: 0,
      failedTests: 0,
      testResults: {}
    };
  }

  /**
   * Setup validation environment
   * @private
   */
  _setupEnvironment() {
    this.limiter = new ConcurrencyLimiter({
      providers: this.config.providers,
      maxQueue: this.config.maxQueueSize
    });

    this.abortController = new AbortController();

    this.queueManager = new QueueManager({
      limiter: this.limiter,
      maxQueueSize: this.config.maxQueueSize,
      abortController: this.abortController
    });

    this.circuitBreaker = new CircuitBreaker({
      failureThreshold: 3,
      recoveryTime: 15000
    });

    this.queueVisualizer = new QueueVisualizer(this.queueManager);
  }

  /**
   * Validate Concurrency Limit
   * @private
   */
  async _validateConcurrencyLimit() {
    console.log('🔍 Validating Concurrency Limit');
    const provider = 'anthropic';
    const concurrentJobs = this.config.providers[provider];
    
    const jobs = [];
    const startTime = Date.now();

    // Create jobs that will trigger concurrency limit
    for (let i = 0; i < concurrentJobs + 2; i++) {
      jobs.push(
        this.circuitBreaker.execute(
          () => this.queueManager.add(
            provider,
            async () => {
              await new Promise(resolve => setTimeout(resolve, 1000));
              return `Job ${i}`;
            },
            { priority: 'normal' }
          ),
          { 
            timeout: 5000,
            fallback: () => `Fallback for Job ${i}`
          }
        )
      );
    }

    // Wait for all jobs
    const results = await Promise.allSettled(jobs);
    const endTime = Date.now();

    // Analyze results
    const successfulJobs = results.filter(r => r.status === 'fulfilled');
    const failedJobs = results.filter(r => r.status === 'rejected');

    const testResult = {
      concurrentJobsAttempted: jobs.length,
      maxConcurrentAllowed: concurrentJobs,
      successfulJobs: successfulJobs.length,
      failedJobs: failedJobs.length,
      totalTime: endTime - startTime
    };

    // Validate test conditions
    const passed = (
      successfulJobs.length <= concurrentJobs &&
      failedJobs.length > 0
    );

    this.metrics.testResults['concurrency_limit'] = {
      passed,
      details: testResult
    };

    return passed;
  }

  /**
   * Validate Priority Handling
   * @private
   */
  async _validatePriorityHandling() {
    console.log('🔍 Validating Priority Handling');
    const priorityJobs = [
      { priority: 'high', duration: 500 },
      { priority: 'normal', duration: 1000 },
      { priority: 'low', duration: 1500 }
    ];

    const jobPromises = priorityJobs.map(job => 
      this.circuitBreaker.execute(
        () => this.queueManager.add(
          'google-gemini-cli',
          async () => {
            await new Promise(resolve => setTimeout(resolve, job.duration));
            return { 
              priority: job.priority, 
              completedAt: Date.now() 
            };
          },
          { priority: job.priority }
        ),
        { timeout: 2000 }
      )
    );

    const results = await Promise.all(jobPromises);

    // Sort results by completion time
    results.sort((a, b) => a.completedAt - b.completedAt);

    // Validate priority order
    const passed = (
      results[0].priority === 'high' &&
      results[1].priority === 'normal' &&
      results[2].priority === 'low'
    );

    this.metrics.testResults['priority_handling'] = {
      passed,
      details: { results }
    };

    return passed;
  }

  /**
   * Validate Circuit Breaker
   * @private
   */
  async _validateCircuitBreaker() {
    console.log('🔍 Validating Circuit Breaker');
    
    // Create a circuit breaker that fails frequently
    const unreliableCircuitBreaker = new CircuitBreaker({
      failureThreshold: 3,
      recoveryTime: 5000
    });

    const jobs = [];
    for (let i = 0; i < 5; i++) {
      jobs.push(
        unreliableCircuitBreaker.execute(
          () => new Promise((_, reject) => {
            // Simulate errors
            if (i < 4) {
              reject(new Error('NetworkError: Simulated failure'));
            } else {
              // Last job should succeed
              return Promise.resolve('Success');
            }
          }),
          { 
            fallback: () => `Fallback for Job ${i}` 
          }
        )
      );
    }

    const results = await Promise.allSettled(jobs);
    
    const testResult = {
      totalAttempts: jobs.length,
      successfulJobs: results.filter(r => r.status === 'fulfilled').length,
      failedJobs: results.filter(r => r.status === 'rejected').length
    };

    // Validate circuit breaker behavior
    const passed = (
      results[0].status === 'rejected' &&
      results[1].status === 'rejected' &&
      results[2].status === 'rejected' &&
      results[3].status === 'fulfilled' &&
      results[4].value.includes('Fallback')
    );

    this.metrics.testResults['circuit_breaker'] = {
      passed,
      details: testResult
    };

    return passed;
  }

  /**
   * Performance Stress Test
   * @private
   */
  async _validatePerformanceStress() {
    console.log('🔍 Validating Performance Under Stress');
    const stressJobs = [];
    const startTime = Date.now();

    // Create a large number of jobs
    for (let i = 0; i < 100; i++) {
      stressJobs.push(
        this.circuitBreaker.execute(
          () => this.queueManager.add(
            'ollama',
            async () => {
              // Varying job durations to simulate real-world scenarios
              await new Promise(resolve => 
                setTimeout(resolve, Math.random() * 500)
              );
              return `Stress Job ${i}`;
            },
            { priority: i % 3 === 0 ? 'high' : 'normal' }
          ),
          { timeout: 2000 }
        )
      );
    }

    const results = await Promise.allSettled(stressJobs);
    const endTime = Date.now();

    const testResult = {
      totalJobs: stressJobs.length,
      successfulJobs: results.filter(r => r.status === 'fulfilled').length,
      failedJobs: results.filter(r => r.status === 'rejected').length,
      totalTime: endTime - startTime
    };

    // Validate stress test conditions
    const passed = (
      testResult.successfulJobs > 80 && // At least 80% success
      testResult.totalTime < 10000 // Completed within 10 seconds
    );

    this.metrics.testResults['performance_stress'] = {
      passed,
      details: testResult
    };

    return passed;
  }

  /**
   * Error Resilience Test
   * @private
   */
  async _validateErrorResilience() {
    console.log('🔍 Validating Error Resilience');
    const errorJobs = [];

    // Create jobs with various error scenarios
    for (let i = 0; i < 5; i++) {
      errorJobs.push(
        this.circuitBreaker.execute(
          () => this.queueManager.add(
            'google-gemini-cli',
            async () => {
              // Simulate different error types
              switch(i) {
                case 0:
                  throw new Error('NetworkError');
                case 1:
                  throw new Error('TimeoutError');
                case 2:
                  throw new Error('RateLimitError');
                case 3:
                  throw new Error('UnexpectedError');
                default:
                  return 'Successful job';
              }
            },
            { priority: 'high' }
          ),
          { 
            timeout: 2000,
            fallback: (err) => `Fallback due to ${err.message}`
          }
        )
      );
    }

    const results = await Promise.allSettled(errorJobs);

    const testResult = {
      totalJobs: errorJobs.length,
      successfulJobs: results.filter(r => r.status === 'fulfilled').length,
      failedJobs: results.filter(r => r.status === 'rejected').length,
      fallbackJobs: results.filter(r => 
        r.status === 'fulfilled' && r.value.includes('Fallback')
      ).length
    };

    // Validate error resilience
    const passed = (
      testResult.fallbackJobs === 3 && // 3 jobs handled by fallback
      testResult.successfulJobs === 1  // 1 job successful
    );

    this.metrics.testResults['error_resilience'] = {
      passed,
      details: testResult
    };

    return passed;
  }

  /**
   * Run complete validation suite
   */
  async runValidation() {
    console.log('🧪 Starting Queue System Validation');
    
    // Setup validation environment
    this._setupEnvironment();

    // Run validation scenarios
    const validationMethods = [
      this._validateConcurrencyLimit,
      this._validatePriorityHandling,
      this._validateCircuitBreaker,
      this._validatePerformanceStress,
      this._validateErrorResilience
    ];

    // Execute each validation method
    for (const method of validationMethods) {
      try {
        const result = await method.call(this);
        if (result) {
          this.metrics.passedTests++;
        } else {
          this.metrics.failedTests++;
        }
      } catch (error) {
        console.error(`Validation failed: ${error.message}`);
        this.metrics.failedTests++;
      }
    }

    // Generate final validation report
    this._generateValidationReport();

    return this.metrics;
  }

  /**
   * Generate comprehensive validation report
   * @private
   */
  _generateValidationReport() {
    console.log('\n📋 Validation Report');
    console.log('-------------------');
    console.log(`Total Tests: ${this.config.validationScenarios.length}`);
    console.log(`Passed Tests: ${this.metrics.passedTests}`);
    console.log(`Failed Tests: ${this.metrics.failedTests}`);
    
    console.log('\nDetailed Test Results:');
    Object.entries(this.metrics.testResults).forEach(([scenario, result]) => {
      console.log(`- ${scenario}: ${result.passed ? '✅ PASS' : '❌ FAIL'}`);
      console.log('  Details:', JSON.stringify(result.details, null, 2));
    });

    // Optional: Generate a machine-readable report
    const reportPath = `/Users/zachgonser/clawd/queue/validation-report-${Date.now()}.json`;
    require('fs').writeFileSync(reportPath, JSON.stringify({
      timestamp: Date.now(),
      totalTests: this.config.validationScenarios.length,
      passedTests: this.metrics.passedTests,
      failedTests: this.metrics.failedTests,
      testResults: this.metrics.testResults
    }, null, 2));

    console.log(`\nDetailed report saved to: ${reportPath}`);
  }
}

// Run validation if script is executed directly
if (require.main === module) {
  const validationSuite = new QueueValidationSuite();
  validationSuite.runValidation()
    .then(metrics => {
      console.log('\n🏁 Validation Complete');
      process.exit(metrics.failedTests > 0 ? 1 : 0);
    })
    .catch(error => {
      console.error('Validation failed:', error);
      process.exit(1);
    });
}

module.exports = QueueValidationSuite;