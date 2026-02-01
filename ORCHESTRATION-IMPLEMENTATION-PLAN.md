# Orchestration Implementation Plan
**Date:** 2026-01-31  
**Based on:** Codex Architecture Analysis

## Concurrency Constraints
**Hard limit:** 3 concurrent agents per provider
- Claude: Max 3 simultaneous
- OpenAI/Codex: Max 3 simultaneous  
- Gemini: Max 3 simultaneous
- Ollama: Max 2 (hardware limit)

## Phase 1: Critical Infrastructure (Week 1)

### 1. Build the Router Module
```javascript
// router.js - Core routing engine
class ModelRouter {
  constructor() {
    this.providers = {
      'anthropic': { concurrent: 0, max: 3, queue: [] },
      'openai-codex': { concurrent: 0, max: 3, queue: [] },
      'google-gemini-cli': { concurrent: 0, max: 3, queue: [] },
      'ollama': { concurrent: 0, max: 2, queue: [] }
    };
    
    this.confidenceThresholds = {
      tier0: 0.95,  // Ultra simple
      tier1: 0.80,  // Monitoring
      tier2: 0.60,  // Analysis
      tier3: 0.00   // Complex (default)
    };
  }
  
  async route(task, constraints = {}) {
    const tier = this.classifyTask(task);
    const provider = this.selectProvider(tier, constraints);
    return this.executeWithQueue(provider, task);
  }
}
```

### 2. Concurrency Control System
- Global semaphore per provider
- Queue with priority levels
- Automatic backpressure when limits hit
- Timeout and retry logic

### 3. Telemetry Pipeline
```javascript
// telemetry.js
class TelemetryCollector {
  async recordExecution(execution) {
    // Track: model, latency, tokens, cost, success, quality
    await this.store({
      timestamp: Date.now(),
      provider: execution.provider,
      model: execution.model,
      latencyMs: execution.duration,
      tokens: execution.usage,
      success: execution.success,
      qualityScore: execution.quality
    });
  }
}
```

## Phase 2: Safety & Reliability (Week 2)

### 1. Circuit Breaker Implementation
- Trip after 3 consecutive failures
- Half-open state after 30s
- Full reset after successful request
- Per-provider tracking

### 2. Subscription Fallback Strategy
```yaml
fallback_chain:
  claude_max_auth_fail:
    - try: api_key_if_configured
    - try: ollama/qwen3:32b
    - alert: "Claude auth failed, using local"
  
  openai_auth_fail:
    - try: ollama/qwen3:32b
    - alert: "OpenAI auth failed"
```

### 3. Quality Gates
- Schema validation on outputs
- Confidence scoring
- Automatic escalation if quality < threshold

## Phase 3: Intelligence Layer (Week 3-4)

### 1. Task Classifier v2
```python
# ML-based classification instead of keywords
class TaskClassifier:
    def __init__(self):
        self.features = [
            'prompt_length',
            'complexity_keywords',
            'required_capabilities',
            'expected_output_type'
        ]
    
    def classify(self, task):
        # Returns tier (0-3) with confidence
        features = self.extract_features(task)
        return self.model.predict(features)
```

### 2. Feedback Loop
- Record actual vs predicted complexity
- Update routing rules based on outcomes
- A/B test different routing strategies

### 3. Cost Predictor
- Estimate cost before execution
- Warn if exceeds threshold
- Suggest alternatives

## Phase 4: Production Readiness (Week 5-6)

### 1. Golden Test Suite
```yaml
test_suite:
  tier_0_tests:
    - prompt: "What time is it?"
      expected: { tier: 0, latency: <2s }
    
  tier_1_tests:
    - prompt: "Check if file exists: test.txt"
      expected: { tier: 1, latency: <10s }
    
  regression_tests:
    - Run daily
    - Alert on quality degradation
    - Auto-rollback if critical
```

### 2. Monitoring Dashboard
- Real-time provider status
- Cost burn rate
- Queue depths
- Success rates by model
- Latency percentiles

### 3. Operations Playbook
- Runbooks for common failures
- Escalation procedures
- Backup strategies
- Disaster recovery

## Implementation Priority

### Week 1 Must-Haves:
1. **Concurrency limiter** (prevent provider overwhelm)
2. **Basic router** (even if heuristic-based)
3. **Simple telemetry** (track what's happening)

### Week 2 Must-Haves:
1. **Circuit breakers** (prevent cascade failures)
2. **Auth fallbacks** (handle subscription issues)
3. **Queue visualization** (see bottlenecks)

### Success Metrics
- Zero provider rate limits hit
- <5% fallback rate
- 70%+ cost reduction maintained
- <1% quality regression

## Next Steps
1. Review and approve this plan
2. Create GitHub issues for each component
3. Start with concurrency limiter (highest risk)
4. Daily progress check-ins

This addresses the core gaps while respecting our constraints. The 3-agent limit actually helps - it forces good queue design from the start.