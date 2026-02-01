/**
 * Example usage of QueueManager with ConcurrencyLimiter integration
 */

const { QueueManager } = require('./queue-manager');
const { ConcurrencyLimiter } = require('../concurrency-limiter');
const { PRIORITY_LEVELS, PriorityStats } = require('./priority-queue');
const { CircuitBreaker, QueueVisualizer } = require('./circuit-breaker');

async function runExample() {
  // Create concurrency limiter with our 3-agent-per-provider limit
  const limiter = new ConcurrencyLimiter({
    providers: {
      'anthropic': 3,
      'openai-codex': 3,
      'google-gemini-cli': 3,
      'ollama': 2
    },
    maxQueue: 100
  });

  // Create abort controller for graceful shutdown
  const abortController = new AbortController();

  // Create queue manager
  const queueManager = new QueueManager({
    limiter,
    maxQueueSize: 50,
    abortController
  });

  // Create circuit breaker
  const circuitBreaker = new CircuitBreaker({
    failureThreshold: 3,
    recoveryTime: 15000,
    errorTypes: ['NetworkError', 'TimeoutError', 'RateLimitError']
  });

  // Create queue visualizer
  const queueVisualizer = new QueueVisualizer(queueManager);

  // Track priority statistics
  const stats = new PriorityStats();

  console.log('🚀 Queue Manager Example\n');

  // Example 1: Add high priority job
  console.log('Adding high priority job...');
  const highPriorityJob = queueManager.add(
    'anthropic',
    async () => {
      console.log('  ⚡ High priority job executing');
      await new Promise(resolve => setTimeout(resolve, 1000));
      return { result: 'High priority complete' };
    },
    { priority: 'high' }
  );

  // Example 2: Add multiple normal priority jobs
  console.log('Adding normal priority jobs...');
  const normalJobs = [];
  for (let i = 1; i <= 3; i++) {
    normalJobs.push(
      queueManager.add(
        'openai-codex',
        async () => {
          console.log(`  📝 Normal job ${i} executing`);
          await new Promise(resolve => setTimeout(resolve, 500));
          return { result: `Normal job ${i} complete` };
        },
        { priority: 'normal' }
      )
    );
  }

  // Example 3: Add low priority background job with circuit breaker
  console.log('Adding low priority job with circuit breaker...');
  const lowPriorityJob = circuitBreaker.execute(
    () => queueManager.add(
      'ollama',
      async () => {
        console.log('  🐌 Low priority job executing');
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Simulate occasional failures for circuit breaker testing
        if (Math.random() < 0.3) {
          throw new Error('NetworkError: Connection failed');
        }
        
        return { result: 'Low priority complete' };
      },
      { priority: 'low', timeout: 5000 }
    ),
    {
      timeout: 6000,
      fallback: () => ({ result: 'Fallback job executed' })
    }
  );

  // Example 4: Try to exceed provider limit
  console.log('Testing concurrency limits...');
  const concurrencyTest = [];
  for (let i = 1; i <= 5; i++) {
    concurrencyTest.push(
      queueManager.add(
        'anthropic', // Only 3 can run concurrently
        async () => {
          console.log(`  🔄 Concurrent job ${i} started`);
          await new Promise(resolve => setTimeout(resolve, 1000));
          console.log(`  ✅ Concurrent job ${i} finished`);
          return { result: `Job ${i}` };
        },
        { priority: 'normal' }
      ).catch(err => console.error(`  ❌ Job ${i} failed:`, err.message))
    );
  }

  // Monitor metrics
  const metricsInterval = setInterval(() => {
    const metrics = queueManager.getMetrics();
    console.log('\n📊 Queue Metrics:', {
      queueSize: metrics.queueSize,
      pending: metrics.pendingCount,
      processed: metrics.totalProcessed,
      avgWaitTime: `${metrics.avgWaitTimeMs}ms`
    });
  }, 2000);

  // Wait for some jobs to complete
  try {
    await highPriorityJob;
    console.log('✅ High priority job completed');
    
    await Promise.all(normalJobs);
    console.log('✅ All normal jobs completed');
    
    await Promise.race([
      lowPriorityJob,
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Low priority timeout')), 6000)
      )
    ]);
  } catch (err) {
    console.error('⚠️ Job error:', err.message);
  }

  // Wait for concurrent test
  await Promise.allSettled(concurrencyTest);

  // Demonstrate Circuit Breaker Status
  console.log('\n🔒 Circuit Breaker Status:');
  console.log(circuitBreaker.getStatus());

  // Demonstrate Queue Visualization
  console.log('\n📊 Queue Visualization:');
  const queueVisualization = queueVisualizer.getVisualization();
  console.log(JSON.stringify(queueVisualization, null, 2));

  // Check for recommendations
  if (queueVisualization.recommendations.length > 0) {
    console.log('\n🚨 Queue Optimization Recommendations:');
    queueVisualization.recommendations.forEach(rec => console.log(`- ${rec}`));
  }

  // Clean up
  clearInterval(metricsInterval);
  queueVisualizer.destroy();

  // Shutdown
  console.log('\n🛑 Shutting down queue...');
  const finalStats = await queueManager.shutdown();
  console.log('📈 Final statistics:', finalStats);
}

// Run the example
if (require.main === module) {
  runExample()
    .then(() => {
      console.log('\n✨ Example completed successfully');
      process.exit(0);
    })
    .catch(err => {
      console.error('\n❌ Example failed:', err);
      process.exit(1);
    });
}

module.exports = { runExample };