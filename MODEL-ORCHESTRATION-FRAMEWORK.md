# Model Orchestration Framework
**Version:** 1.0  
**Date:** 2026-01-31  
**Purpose:** Intelligent model routing for cost optimization, performance, and scalability

---

## Design Principles

1. **Task-Appropriate Models:** Route tasks to the right model tier based on complexity
2. **Provider Flexibility:** Support multiple providers (Ollama, Claude, OpenAI, future LM Studio)
3. **Cost Awareness:** Minimize API costs without sacrificing quality
4. **Performance Tuning:** Balance speed vs quality based on use case
5. **Future-Proof:** Easy to add new models, providers, and routing rules
6. **Transparent:** Clear reasoning for model selection decisions

---

## Model Tiers

### Tier 0: Nano Models (Future)
**Use Cases:** Ultra-simple checks, boolean responses, heartbeat confirmations  
**Examples:** "File exists?", "Process running?", "Any errors in log?"  
**Models:**
- TinyLlama 1.1B (when available)
- Phi-3 Mini 3.8B
- **Speed:** <2s | **Cost:** $0 | **Quality:** Basic

### Tier 1: Fast Monitors
**Use Cases:** Simple monitoring, status checks, basic filtering  
**Examples:**
- Check for new tweets
- Scan for keyword mentions
- File modification checks
- Basic log parsing

**Models:**
- Primary: `ollama/qwen3:8b` (when downloaded)
- Fallback: `ollama/qwen3:14b`
- Emergency: `anthropic/claude-3-5-haiku`

**Characteristics:**
- **Speed Target:** <10s
- **Cost:** $0 (local) or $0.001 (cloud fallback)
- **Quality:** Good enough for binary decisions

### Tier 2: Analysts
**Use Cases:** Structured extraction, classification, moderate reasoning  
**Examples:**
- Fact extraction from logs
- Tweet classification (newsworthy/not)
- JSON data transformation
- Multi-step workflows

**Models:**
- Primary: `ollama/qwen3:32b`
- Alternative: `ollama/gemma3:27b` (if tool support added)
- Fallback: `anthropic/claude-3-5-haiku`

**Characteristics:**
- **Speed Target:** <60s
- **Cost:** $0 (local) or $0.01 (cloud fallback)
- **Quality:** High accuracy, good reasoning

### Tier 3: Deep Thinkers
**Use Cases:** Complex analysis, creative work, strategic decisions  
**Examples:**
- Weekly synthesis reports
- Business strategy analysis
- Long-form writing
- Code generation
- Multi-variable decision making

**Models:**
- Primary: `anthropic/claude-sonnet-4-5`
- Alternative: `ollama/qwen3:72b` (future Unraid server)
- Specialized: `ollama/qwen2.5-coder-32b` (for code tasks)

**Characteristics:**
- **Speed Target:** Flexible (quality > speed)
- **Cost:** $0.03-0.15 per task
- **Quality:** Best available

### Tier 4: Specialists (Future)
**Use Cases:** Domain-specific tasks requiring specialized models  
**Examples:**
- Code generation → Qwen2.5-Coder
- Vision/OCR → DeepSeek-OCR
- Audio transcription → Whisper
- Math/reasoning → DeepSeek-R1

**Models:** Task-specific, managed separately

---

## Routing Logic

### Automatic Classification

```yaml
routing_rules:
  # Rule priority: first match wins
  
  - name: "Simple Monitoring"
    tier: 1
    triggers:
      - prompt_length: <200 chars
      - keywords: ["check", "status", "exists", "new", "changed"]
      - expected_output: "boolean|short_string"
    model: "ollama/qwen3:8b"
    
  - name: "Structured Extraction"
    tier: 2
    triggers:
      - output_format: "json|yaml|structured"
      - keywords: ["extract", "parse", "classify", "analyze"]
      - prompt_length: 200-1000 chars
    model: "ollama/qwen3:32b"
    
  - name: "Deep Analysis"
    tier: 3
    triggers:
      - keywords: ["synthesize", "strategic", "create", "design", "plan"]
      - prompt_length: >1000 chars
      - reasoning_required: true
    model: "anthropic/claude-sonnet-4-5"
    
  - name: "Code Generation"
    tier: 4
    triggers:
      - keywords: ["write code", "implement", "refactor", "debug"]
      - language_detected: true
    model: "ollama/qwen2.5-coder-32b"
```

### Manual Override

```json
// Cron job config
{
  "id": "stantontimes-p0-monitor",
  "task": "Check for new P0 tweets",
  "model": {
    "strategy": "auto",  // or "manual"
    "tier": 1,           // preferred tier
    "fallback": true     // allow fallback to cloud if local fails
  }
}
```

---

## Provider Architecture

### Current State (2026-01-31)

```yaml
providers:
  ollama:
    status: active
    endpoint: "http://127.0.0.1:11434/v1"
    models:
      - qwen3:32b (18GB)
      - gemma3:27b (16GB) - tools not supported
      - devstral-small-2 (14GB)
      - deepseek-ocr (6GB)
      - gpt-oss:20b (12GB)
    capabilities:
      - text_generation
      - json_mode
      - streaming
    limitations:
      - no_function_calling (gemma)
      - slower_than_cloud (20x vs Haiku)
  
  anthropic:
    status: active
    models:
      - claude-sonnet-4-5 (primary)
      - claude-3-5-haiku (fast tier)
    capabilities:
      - text_generation
      - function_calling
      - vision
      - streaming
      - artifacts
    cost_per_1m_tokens:
      input: $3.00 (Sonnet) / $0.80 (Haiku)
      output: $15.00 (Sonnet) / $4.00 (Haiku)
```

### Future State (Unraid Server)

```yaml
providers:
  ollama_unraid:
    status: planned
    hardware:
      - AMD Threadripper 3990X (64 cores)
      - 2x RTX Pro 8000 (48GB each)
      - RTX 3090 Ti (24GB)
      - Total VRAM: 120GB
    models_planned:
      - qwen3:72b (40GB) - primary deep thinking
      - dolphin-2.2-70b (40GB) - uncensored alternative
      - qwen2.5-coder-32b (18GB) - code specialist
      - deepseek-r1 (32GB) - reasoning specialist
    capabilities:
      - concurrent_models (2-3 simultaneously)
      - vllm_optimization
      - gpu_acceleration
      - much_faster_inference
    
  lm_studio:
    status: available
    models:
      - (same as Ollama, GUI-based)
    use_cases:
      - manual_testing
      - model_evaluation
      - interactive_sessions
```

---

## Cost Optimization Strategy

### Monthly Budget Scenarios

**Current (All Claude):**
- 14 cron jobs × 30-50 runs/day × $0.01/run
- **Estimated:** $250-350/month

**Hybrid (Smart Routing):**
- Tier 1 tasks (60%) → Ollama (free)
- Tier 2 tasks (30%) → Ollama (free)
- Tier 3 tasks (10%) → Claude ($50-80/month)
- **Estimated:** $50-80/month
- **Savings:** ~75%

**Future (Unraid + Ollama):**
- Tier 1-2 (90%) → Ollama Mac (free)
- Tier 3 deep work (8%) → Ollama Unraid (free)
- Tier 3 cloud only (2%) → Claude ($10-20/month)
- **Estimated:** $10-20/month
- **Savings:** ~95%

---

## Implementation Phases

### Phase 1: Foundation (This Week)
- [x] Test Qwen3:32b quality vs Haiku
- [ ] Download and test Qwen3:14b and Qwen3:8b
- [ ] Establish tier classification rules
- [ ] Document routing logic
- [ ] Create model selection helper

### Phase 2: Pilot (Next Week)
- [ ] Migrate 3-5 low-risk cron jobs to Ollama
- [ ] Monitor performance and quality
- [ ] Adjust tier rules based on results
- [ ] Create fallback handling (Ollama fails → Claude)

### Phase 3: Scale (Week 3-4)
- [ ] Migrate remaining suitable cron jobs
- [ ] Implement automatic tier detection
- [ ] Build cost tracking dashboard
- [ ] Document savings and quality metrics

### Phase 4: Unraid Integration (Future)
- [ ] Set up vLLM on Unraid server
- [ ] Load 70B models (Qwen3, Dolphin)
- [ ] Configure remote Ollama endpoint
- [ ] Migrate Tier 3 tasks from Claude to Unraid
- [ ] Keep Claude as emergency fallback only

---

## Quality Assurance

### Testing Framework

**For Each New Model:**
1. **Benchmark Suite:**
   - Simple monitoring task (expected: <10s, 95%+ accuracy)
   - Structured extraction (expected: valid JSON, 90%+ accuracy)
   - Complex reasoning (expected: coherent, logical)

2. **Real-World Validation:**
   - Run 10 actual cron job tasks
   - Compare output to Claude baseline
   - Measure: speed, quality, consistency

3. **Edge Case Testing:**
   - Malformed input
   - Ambiguous instructions
   - Long context (10k+ tokens)

### Acceptance Criteria

**Tier 1 Model (Fast Monitor):**
- ✅ 95%+ accuracy on boolean/simple checks
- ✅ <15s average response time
- ✅ Handles 100+ requests/day without degradation

**Tier 2 Model (Analyst):**
- ✅ 90%+ accuracy on structured extraction
- ✅ Valid JSON output 98%+ of time
- ✅ <60s average response time

**Tier 3 Model (Deep Thinker):**
- ✅ Quality matches or exceeds Claude Haiku
- ✅ Creative/strategic reasoning evident
- ✅ Cost < $0.05/task (if cloud) or free (if local)

---

## Monitoring & Observability

### Metrics to Track

```yaml
model_metrics:
  per_tier:
    - requests_per_day
    - avg_response_time_seconds
    - success_rate_percent
    - cost_per_request_usd
    - quality_score (manual review)
  
  per_provider:
    - uptime_percent
    - error_rate_percent
    - fallback_trigger_count
    - total_cost_usd
  
  overall:
    - monthly_cost_total
    - cost_savings_vs_baseline
    - tier_distribution
    - quality_regression_alerts
```

### Alerting Rules

- **Performance Degradation:** >3 tasks timeout in 1 hour
- **Quality Drop:** Manual review flags 2+ bad outputs in a day
- **Cost Spike:** Daily spend >20% over 7-day average
- **Provider Failure:** >5 errors in 10 minutes → auto-switch to fallback

---

## Extension Points

### Adding New Models

```yaml
# models.yaml
- id: "ollama/qwen3:8b"
  tier: 1
  provider: ollama
  capabilities: [text, json]
  speed_class: fast
  cost_per_token: 0
  max_context: 32000
  recommended_for:
    - monitoring
    - simple_classification
    - heartbeat_checks
```

### Adding New Providers

```python
# providers/custom_provider.py
class CustomProvider(BaseProvider):
    def generate(self, prompt, model, **kwargs):
        # Provider-specific implementation
        pass
    
    def supports_streaming(self):
        return True
    
    def supports_tools(self):
        return False
```

### Adding New Projects

```yaml
# projects/new-business-unit.yaml
project: consulting-pipeline
cron_jobs:
  - name: lead-monitor
    model_tier: 1  # Fast monitoring
    
  - name: proposal-generator
    model_tier: 3  # Deep thinking
    model_override: "anthropic/claude-sonnet-4-5"  # Force specific model
```

---

## Decision Log

### Why This Framework?

1. **Flexibility:** Easy to swap models as better ones emerge
2. **Cost Control:** Automatic routing to cheapest viable option
3. **Scalability:** Supports 1 project or 100 projects
4. **Transparency:** Clear rules, easy to debug
5. **Future-Ready:** Designed for Unraid server integration

### Open Questions

1. **How to handle model version updates?**
   - Strategy: Pin versions in prod, test new versions in staging
   
2. **What if local model quality degrades?**
   - Fallback to cloud after 2 consecutive failures
   
3. **How to handle concurrent requests?**
   - Ollama: Queue requests, max 2 concurrent
   - Cloud: No limit (rate limit = API cap)
   
4. **When to use LM Studio vs Ollama?**
   - Ollama: Production, automated
   - LM Studio: Testing, interactive use

---

## Success Metrics (3 Months)

- ✅ 75%+ cost reduction vs all-Claude baseline
- ✅ 95%+ quality maintained (vs Claude baseline)
- ✅ <5% fallback rate to cloud models
- ✅ Zero manual intervention for routine tasks
- ✅ Support 3+ concurrent projects/business units

---

**Next Steps:**
1. Finalize tier classification rules
2. Test Qwen3:14b and 8b models
3. Create model selection helper script
4. Pilot with 3 cron jobs
5. Measure and iterate
