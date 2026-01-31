# Model Orchestration Implementation Plan
**Version:** 1.0  
**Date:** 2026-01-31  
**Status:** Planning Complete - Ready for Execution

---

## Business Units & Use Cases

### Current Active Projects

**1. StantonTimes (Star Citizen News Bot)**
- 6 cron jobs (P0/P1 monitors, engagement, approvals, creators, web/RSS)
- Twitter monitoring + Discord approval workflow
- **Model needs:** Tier 1 (monitoring), Tier 2 (classification)

**2. Bloom (Game Development)**
- 5 cron jobs (PR monitor, CI watch, competitor intel, tool scout, weekly digest)
- GitHub monitoring, research outputs to Obsidian
- **Model needs:** Tier 1 (monitoring), Tier 3 (analysis/synthesis)

**3. System Maintenance**
- 3 cron jobs (morning briefing, fact extraction, weekly synthesis)
- Monitor-Agent (self-healing foundation)
- **Model needs:** Tier 1 (monitoring), Tier 2 (extraction), Tier 3 (synthesis)

### Future Business Units (Phase 2+)

**4. Consulting (AI Orchestration Services)**
- Client workflow analysis
- Proposal generation
- Session summaries
- **Model needs:** Tier 3 (deep reasoning, creativity)

**5. Talent Matching (Future)**
- Resume parsing
- Job matching
- Outreach personalization
- **Model needs:** Tier 2 (structured data), Tier 3 (matching logic)

---

## Model Strategy

### Question 2: Should We Add More Models?

**Short answer:** Not yet. Let's validate the framework first.

**Current models available:**
- `ollama/qwen3:32b` (Tier 2 - tested, works well)
- `ollama/gemma3:27b` (Incompatible - no tool support)
- `ollama/devstral-small-2` (Code-focused, not tested)
- `ollama/deepseek-ocr` (Vision/OCR specialist)
- `ollama/gpt-oss:20b` (Unknown quality)

**Models to download for testing:**
- `ollama/qwen3:14b` (~8GB) - Tier 1 candidate
- `ollama/qwen3:8b` (~5GB) - Tier 1 candidate (faster)

**Models NOT to add now:**
- Nano models (<3B) - Quality too low for our tasks
- More 27B+ models - Qwen32B is sufficient until Unraid
- Specialized models - Wait until we have specific use cases

**Future additions (when Unraid server ready):**
- `qwen3:72b` (Tier 3 deep thinking)
- `dolphin-2.2-70b` (Uncensored alternative)
- `qwen2.5-coder-32b` (Code specialist for Bloom)
- `deepseek-r1` (Reasoning specialist)

**Recommendation:** Download Qwen 8B and 14B, test them, then decide. Don't bloat the model library prematurely.

---

## Complete Implementation Plan

### Phase 0: Testing & Validation (This Weekend)

**Goal:** Establish baseline performance for each tier

#### Test Suite

**Test 1: Tier 1 Monitoring (8B vs 14B vs 32B vs Haiku)**
```
Task: Check if new GitHub PR exists
Expected: <10s, boolean response
Models: qwen3:8b, qwen3:14b, qwen3:32b, haiku
Metric: Speed + accuracy
```

**Test 2: Tier 2 Extraction (14B vs 32B vs Haiku)**
```
Task: Extract facts from memory log
Expected: <60s, valid JSON
Models: qwen3:14b, qwen3:32b, haiku
Metric: Completeness + structure
```

**Test 3: Tier 3 Reasoning (32B vs Sonnet)**
```
Task: Complex decision (tweet priority scenario)
Expected: Quality > speed
Models: qwen3:32b, claude-sonnet-4-5
Metric: Logic + coherence
```

**Test 4: Concurrent Load**
```
Task: 3 simultaneous cron jobs
Expected: No crashes, queue handling
Models: qwen3:32b (3 requests at once)
Metric: Stability + RAM usage
```

**Test 5: Specialized Tasks**
```
Task A: Code review (devstral-small-2)
Task B: OCR extraction (deepseek-ocr)
Expected: Evaluate if specialists beat generalists
```

#### Success Criteria

**Tier 1 (8B or 14B):**
- ✅ <15s response time (95th percentile)
- ✅ 95%+ accuracy on boolean checks
- ✅ <10GB RAM usage
- ✅ Handles 50+ requests/day without degradation

**Tier 2 (32B):**
- ✅ <90s response time (95th percentile)
- ✅ 90%+ accuracy on structured extraction
- ✅ Valid JSON 98%+ of time
- ✅ <20GB RAM usage

**Tier 3 (Sonnet or 32B):**
- ✅ Quality matches baseline (Sonnet)
- ✅ Coherent reasoning demonstrated
- ✅ Cost < $0.05/task if cloud, or free if local

#### Deliverables

- `TEST-RESULTS.md` - Performance comparison matrix
- `TIER-CLASSIFICATION-RULES.md` - Finalized routing logic
- `MODEL-RECOMMENDATIONS.md` - Which model for which tier

---

### Phase 1: Pilot Migration (Week 1)

**Goal:** Migrate 3 low-risk cron jobs to Ollama, validate in production

#### Selected Cron Jobs

**Job 1: Bloom PR Monitor** (Tier 1)
- Current: `claude-sonnet-4-5`
- New: `ollama/qwen3:14b` (after testing proves it's fast enough)
- Frequency: Every 15 minutes
- Risk: Low (just monitoring, no actions)
- Validation: Compare detection accuracy for 3 days

**Job 2: Fact Extraction** (Tier 2)
- Current: `claude-sonnet-4-5`
- New: `ollama/qwen3:32b`
- Frequency: Every 30 minutes
- Risk: Low (extracts to file, manual review possible)
- Validation: Check JSON validity + completeness for 1 week

**Job 3: StantonTimes P0 Monitor** (Tier 1)
- Current: `claude-sonnet-4-5`
- New: `ollama/qwen3:14b`
- Frequency: Every 30 minutes
- Risk: Medium (missed tweet = missed news)
- Validation: Parallel run (Ollama + Claude) for 3 days, compare

#### Implementation Steps

1. **Download models:**
   ```bash
   ollama pull qwen3:14b
   ollama pull qwen3:8b
   ```

2. **Update cron configs:**
   ```json
   {
     "id": "36d25e5b-892f-4f87-b297-6c011bb21eae",
     "name": "Bloom PR Monitor",
     "model": "ollama/qwen3:14b",
     "fallback": "anthropic/claude-3-5-haiku"
   }
   ```

3. **Add fallback logic:**
   - If Ollama fails 2x consecutively → switch to Haiku
   - Log failures to `logs/model-fallbacks.log`
   - Alert if >10% fallback rate

4. **Monitor for 7 days:**
   - Track: Speed, accuracy, failures, cost savings
   - Review outputs: Random sample 20 runs
   - Decision point: Continue or rollback?

#### Success Metrics

- ✅ 0 critical failures (missed important events)
- ✅ <5% fallback rate to cloud
- ✅ Cost savings: >$50/week
- ✅ Quality maintained (manual review)

---

### Phase 2: Full Migration (Week 2-3)

**Goal:** Migrate remaining suitable cron jobs, establish tier system

#### Job-by-Job Migration Plan

| Job Name | Current Model | New Model | Tier | Risk | Migration Week |
|----------|---------------|-----------|------|------|----------------|
| StantonTimes P0 Monitor | Sonnet | Qwen 14B | 1 | Med | Week 1 ✅ |
| StantonTimes P1 Keywords | Sonnet | Qwen 14B | 1 | Low | Week 2 |
| StantonTimes Engagement | Sonnet | Qwen 32B | 2 | Low | Week 2 |
| StantonTimes Approval Check | Sonnet | Qwen 14B | 1 | Low | Week 2 |
| StantonTimes Creator Monitor | Sonnet | Qwen 32B | 2 | Med | Week 2 |
| StantonTimes Web RSS | Sonnet | Qwen 14B | 1 | Low | Week 2 |
| Bloom PR Monitor | Sonnet | Qwen 14B | 1 | Low | Week 1 ✅ |
| Bloom CI Watch | Sonnet | Qwen 14B | 1 | Low | Week 2 |
| Bloom Competitor Intel | Sonnet | **Keep Sonnet** | 3 | High | No change |
| Bloom Tool Scout | Sonnet | **Keep Sonnet** | 3 | Med | No change |
| Bloom Weekly Digest | Sonnet | **Keep Sonnet** | 3 | High | No change |
| Fact Extraction | Sonnet | Qwen 32B | 2 | Low | Week 1 ✅ |
| Morning Briefing | Sonnet | Qwen 32B | 2 | Med | Week 3 |
| Weekly Synthesis | Sonnet | **Keep Sonnet** | 3 | High | No change |

**Migration Strategy:**
- **Keep Tier 3 on Claude:** Analysis, synthesis, deep reasoning
- **Move Tier 1 to Qwen 14B:** Monitoring, simple checks
- **Move Tier 2 to Qwen 32B:** Extraction, classification

**Projected Cost Savings:**
- Jobs migrated: 9/14 (64%)
- Current cost: ~$300/month
- New cost: ~$80/month (Tier 3 only)
- **Savings: $220/month (73%)**

#### Automated Tier Detection (Bonus)

Create `tier-classifier.js`:
```javascript
function classifyTask(prompt, expectedOutput) {
  // Simple heuristics
  if (prompt.length < 200 && expectedOutput === 'boolean') {
    return { tier: 1, model: 'ollama/qwen3:14b' };
  }
  if (expectedOutput === 'json' && prompt.includes('extract')) {
    return { tier: 2, model: 'ollama/qwen3:32b' };
  }
  if (prompt.includes('synthesize') || prompt.includes('analyze deeply')) {
    return { tier: 3, model: 'anthropic/claude-sonnet-4-5' };
  }
  // Default to Tier 2
  return { tier: 2, model: 'ollama/qwen3:32b' };
}
```

---

### Phase 3: Optimization & Scaling (Week 4+)

**Goal:** Fine-tune performance, prepare for new business units

#### Performance Tuning

**Qwen 14B Optimization:**
- Test Q4_0 vs Q4_K_M quantization (speed vs quality)
- Adjust context window limits
- Optimize prompt templates (shorter = faster)

**Qwen 32B Optimization:**
- Test if Q6_K gives better quality at acceptable speed
- Implement response caching for repeated tasks
- Add timeout handling (60s hard limit)

**Fallback Refinement:**
- If Ollama >30s → auto-switch to Haiku for that run
- If Ollama fails 3x in 1h → temp disable, use Haiku
- Auto-recover after 1h cooldown

#### Concurrent Load Testing

**Scenario:** 3 cron jobs fire at same time (realistic)
- Monitor: RAM usage, queue depth, response times
- Test: 5 concurrent, 10 concurrent (stress test)
- Result: Document limits, add queuing if needed

#### New Business Unit Preparation

**Consulting workflows:**
- Proposal generation → Tier 3 (Sonnet)
- Client email triage → Tier 1 (Qwen 14B)
- Meeting summaries → Tier 2 (Qwen 32B)

**Talent Matching workflows:**
- Resume parsing → Tier 2 (Qwen 32B)
- Job matching algorithm → Tier 3 (Sonnet or future 72B)
- Outreach personalization → Tier 2 (Qwen 32B)

#### Cost Tracking Dashboard

Create `cost-tracker.json`:
```json
{
  "2026-02": {
    "ollama": {
      "tier1_requests": 1200,
      "tier2_requests": 450,
      "cost": 0,
      "savings": 220
    },
    "anthropic": {
      "haiku_requests": 50,
      "sonnet_requests": 150,
      "cost": 80
    },
    "total_cost": 80,
    "baseline_cost": 300,
    "savings_percent": 73
  }
}
```

---

### Phase 4: Unraid Integration (Future - 3+ Months)

**Goal:** Move Tier 3 deep work to local 70B models

#### Hardware Setup

**Unraid Server Specs (from MEMORY.md):**
- AMD Threadripper 3990X (64 cores, 128 threads)
- 2x RTX Pro 8000 (48GB VRAM each)
- RTX 3090 Ti (24GB VRAM)
- **Total VRAM:** 120GB

**Software Stack:**
- vLLM (high-performance inference)
- Ollama remote endpoint (for Clawdbot integration)
- Model serving via OpenAI-compatible API

#### Model Strategy

**Tier 3 Deep Thinkers:**
- `qwen3:72b` (40GB VRAM) - Primary deep reasoning
- `dolphin-2.2-70b` (40GB VRAM) - Uncensored alternative
- Run both simultaneously (80GB / 120GB = 67% utilization)

**Tier 4 Specialists:**
- `qwen2.5-coder-32b` (18GB VRAM) - Code generation for Bloom
- `deepseek-r1` (32GB VRAM) - Advanced reasoning tasks

**Tier 1/2 Remain on Mac:**
- Qwen 14B/32B stay on Mac Studio
- Low-latency local access
- Unraid handles heavy lifting only

#### Migration Plan

1. **Set up Unraid vLLM:**
   - Install vLLM container
   - Load Qwen 72B + Dolphin 70B
   - Configure remote endpoint

2. **Test remote inference:**
   - Benchmark latency (Mac → Unraid)
   - Compare quality (72B vs Sonnet)
   - Measure cost savings

3. **Migrate Tier 3 jobs:**
   - Weekly Synthesis → Qwen 72B
   - Bloom Competitor Intel → Qwen 72B
   - Bloom Tool Scout → Qwen 72B
   - Keep Sonnet as emergency fallback

4. **Result:**
   - **New monthly cost:** $10-20 (emergency Sonnet only)
   - **Savings:** 95% vs baseline
   - **Quality:** Maintained or improved (larger models)

---

## Technical Architecture

### Config Structure

```yaml
# ~/.clawdbot/model-orchestration.yaml

providers:
  ollama_local:
    endpoint: http://127.0.0.1:11434/v1
    models:
      - qwen3:8b
      - qwen3:14b
      - qwen3:32b
      - devstral-small-2
      - deepseek-ocr
  
  ollama_unraid:  # Future
    endpoint: http://192.168.225.xxx:11434/v1
    models:
      - qwen3:72b
      - dolphin-2.2-70b
  
  anthropic:
    models:
      - claude-3-5-haiku
      - claude-sonnet-4-5

tiers:
  tier1:
    primary: ollama_local/qwen3:14b
    fallback: anthropic/claude-3-5-haiku
    timeout: 15
    criteria:
      - prompt_length: <300
      - output: boolean|short_string
      - keywords: [check, exists, new, status]
  
  tier2:
    primary: ollama_local/qwen3:32b
    fallback: anthropic/claude-3-5-haiku
    timeout: 90
    criteria:
      - output: json|structured
      - keywords: [extract, parse, classify]
  
  tier3:
    primary: anthropic/claude-sonnet-4-5
    fallback: ollama_unraid/qwen3:72b  # Future
    timeout: 300
    criteria:
      - keywords: [synthesize, analyze, strategic, design]
      - prompt_length: >1000

fallback_rules:
  consecutive_failures: 2
  cooldown_minutes: 60
  alert_threshold: 10  # 10% fallback rate triggers review
```

### Monitoring Script

```bash
#!/bin/bash
# monitor-models.sh

echo "=== Model Health Check ==="
echo "Ollama Status:"
curl -s http://127.0.0.1:11434/api/ps | jq '.models[] | {name, size_gb: (.size_vram/1024/1024/1024|floor)}'

echo ""
echo "Today's Usage:"
jq -r '.["2026-02"] | "Tier 1: \(.ollama.tier1_requests) | Tier 2: \(.ollama.tier2_requests) | Cost: $\(.total_cost)"' cost-tracker.json

echo ""
echo "Fallback Rate:"
grep "fallback" logs/model-fallbacks.log | wc -l
```

---

## Risk Mitigation

### Risk Matrix

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| Ollama crashes | Low | High | Auto-restart + fallback to cloud |
| Quality degradation | Medium | High | Parallel run for 3 days, manual review |
| Speed too slow | Medium | Medium | Timeout fallback, use smaller models |
| RAM exhaustion | Low | High | Queue requests, limit concurrent |
| Model incompatibility | Low | Low | Test before migration |
| Cost spike (fallbacks) | Medium | Medium | Alert at 10% fallback rate |

### Rollback Plan

**If pilot fails (Phase 1):**
1. Revert cron configs to Claude
2. Document failure reasons
3. Refine tier rules or try different models
4. Retry in 1 week

**If production issues (Phase 2):**
1. Emergency switch to all-Haiku (fast + cheap)
2. Investigate root cause
3. Fix + retest
4. Gradual re-migration

---

## Timeline Summary

### Week 1 (Feb 1-7)
- ✅ Download Qwen 8B/14B
- ✅ Run test suite (Tests 1-5)
- ✅ Document tier rules
- ✅ Migrate 3 pilot jobs
- ✅ Monitor for 7 days

### Week 2 (Feb 8-14)
- ✅ Review pilot results
- ✅ Migrate remaining Tier 1 jobs (6 jobs)
- ✅ Migrate remaining Tier 2 jobs (2 jobs)
- ✅ Keep Tier 3 on Claude (5 jobs)

### Week 3 (Feb 15-21)
- ✅ Performance optimization
- ✅ Cost tracking dashboard
- ✅ Concurrent load testing
- ✅ Prepare for new business units

### Week 4+ (Feb 22+)
- ✅ Stable operation
- ✅ Add new workflows as needed
- ✅ Plan Unraid integration

### Future (3-6 months)
- ✅ Unraid server setup
- ✅ vLLM 70B models
- ✅ Migrate Tier 3 to local
- ✅ 95% cost savings achieved

---

## Success Metrics (3-Month Review)

**Cost:**
- ✅ <$100/month total spend
- ✅ 70%+ reduction vs baseline
- ✅ <10% fallback rate

**Quality:**
- ✅ 95%+ accuracy maintained
- ✅ 0 critical failures (missed important events)
- ✅ Manual review satisfaction

**Performance:**
- ✅ Tier 1: <15s average
- ✅ Tier 2: <60s average
- ✅ 99%+ uptime

**Scalability:**
- ✅ Supports 3+ business units
- ✅ 20+ cron jobs running
- ✅ Ready for Unraid integration

---

## Next Actions

**This Weekend:**
1. Download `ollama pull qwen3:14b`
2. Download `ollama pull qwen3:8b`
3. Run Test Suite (saved to `TEST-RESULTS.md`)
4. Finalize tier classification rules
5. Select 3 pilot jobs for Week 1

**Week 1:**
6. Update cron configs with new models
7. Deploy pilot jobs
8. Monitor daily for issues
9. Collect metrics

**Decision Point (End of Week 1):**
- ✅ Proceed to Phase 2 (full migration)
- OR: Adjust and extend pilot
- OR: Rollback and reassess

---

**Ready to execute?** This plan scales from today's 14 cron jobs to 100+ automated workflows across multiple business units.
