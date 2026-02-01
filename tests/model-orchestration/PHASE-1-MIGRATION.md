# Phase 1 Pilot Migration - Exact Config Changes

**Date:** 2026-01-31  
**Status:** Ready for Review

---

## 🎯 Target: 3 Cron Jobs

### Job 1: Bloom PR Monitor
- **ID:** `36d25e5b-892f-4f87-b297-6c011bb21eae`
- **Frequency:** Every 15 minutes (*/15 * * * *)
- **Current Model:** claude-sonnet-4-5 (default, expensive)
- **New Model:** ollama/qwen3:8b
- **Risk:** LOW - Just monitoring, no actions
- **Expected:** 3-5s response time vs current ~8s

### Job 2: Fact Extraction
- **ID:** `657a6dbd-a850-4032-a558-73a2d4467e86`
- **Frequency:** Every 30 minutes (*/30 * * * *)
- **Current Model:** claude-sonnet-4-5 (default, expensive)
- **New Model:** ollama/qwen3:32b
- **Risk:** LOW - Outputs to file, reviewable
- **Expected:** 15-30s response time vs current ~12s

### Job 3: StantonTimes P0 Monitor
- **ID:** `1aa99924-c284-421f-8747-7516c66c5360`
- **Frequency:** Every 30 minutes (*/30 * * * *)
- **Current Model:** claude-sonnet-4-5 (default, expensive)
- **New Model:** ollama/qwen3:8b
- **Risk:** MEDIUM - Missed tweet = missed news story
- **Expected:** 3-5s response time vs current ~25s

---

## 📝 Exact Config Changes

### Change 1: Bloom PR Monitor

**BEFORE:**
```json
{
  "id": "36d25e5b-892f-4f87-b297-6c011bb21eae",
  "name": "Bloom PR Monitor",
  "agentId": "main",
  "schedule": {"kind": "cron", "expr": "*/15 * * * *"},
  "sessionTarget": "isolated",
  "payload": {
    "kind": "agentTurn",
    "message": "## Bloom PR Monitor\n\n**Methodology:** FIND → VALIDATE..."
  }
}
```

**AFTER:**
```json
{
  "id": "36d25e5b-892f-4f87-b297-6c011bb21eae",
  "name": "Bloom PR Monitor",
  "agentId": "main",
  "model": "ollama/qwen3:8b",
  "modelConfig": {
    "num_ctx": 4096,
    "temperature": 0.1
  },
  "fallbackModel": "anthropic/claude-3-5-haiku",
  "fallbackRules": {
    "consecutiveFailures": 2,
    "cooldownMinutes": 60
  },
  "schedule": {"kind": "cron", "expr": "*/15 * * * *"},
  "sessionTarget": "isolated",
  "payload": {
    "kind": "agentTurn",
    "message": "## Bloom PR Monitor\n\n**Methodology:** FIND → VALIDATE..."
  }
}
```

**CHANGES:**
- ✅ Added `"model": "ollama/qwen3:8b"`
- ✅ Added `"modelConfig"` with validated context (4096)
- ✅ Added `"fallbackModel": "claude-3-5-haiku"`
- ✅ Added `"fallbackRules"` for auto-recovery

---

### Change 2: Fact Extraction

**BEFORE:**
```json
{
  "id": "657a6dbd-a850-4032-a558-73a2d4467e86",
  "name": "Fact Extraction",
  "agentId": "main",
  "schedule": {"kind": "cron", "expr": "*/30 * * * *"},
  "sessionTarget": "isolated",
  "payload": {
    "kind": "agentTurn",
    "message": "## Fact Extraction\n\n**Methodology:** FIND → VALIDATE..."
  }
}
```

**AFTER:**
```json
{
  "id": "657a6dbd-a850-4032-a558-73a2d4467e86",
  "name": "Fact Extraction",
  "agentId": "main",
  "model": "ollama/qwen3:32b",
  "modelConfig": {
    "num_ctx": 16384,
    "temperature": 0.1
  },
  "fallbackModel": "anthropic/claude-3-5-haiku",
  "fallbackRules": {
    "consecutiveFailures": 2,
    "cooldownMinutes": 60
  },
  "schedule": {"kind": "cron", "expr": "*/30 * * * *"},
  "sessionTarget": "isolated",
  "payload": {
    "kind": "agentTurn",
    "message": "## Fact Extraction\n\n**Methodology:** FIND → VALIDATE..."
  }
}
```

**CHANGES:**
- ✅ Added `"model": "ollama/qwen3:32b"`
- ✅ Added `"modelConfig"` with validated context (16384)
- ✅ Added `"fallbackModel": "claude-3-5-haiku"`
- ✅ Added `"fallbackRules"` for auto-recovery

---

### Change 3: StantonTimes P0 Monitor

**BEFORE:**
```json
{
  "id": "1aa99924-c284-421f-8747-7516c66c5360",
  "name": "StantonTimes P0 Monitor",
  "agentId": "main",
  "schedule": {"kind": "cron", "expr": "*/30 * * * *"},
  "sessionTarget": "isolated",
  "payload": {
    "kind": "agentTurn",
    "message": "## StantonTimes P0 Official Sources Monitor..."
  }
}
```

**AFTER:**
```json
{
  "id": "1aa99924-c284-421f-8747-7516c66c5360",
  "name": "StantonTimes P0 Monitor",
  "agentId": "main",
  "model": "ollama/qwen3:8b",
  "modelConfig": {
    "num_ctx": 4096,
    "temperature": 0.1
  },
  "fallbackModel": "anthropic/claude-3-5-haiku",
  "fallbackRules": {
    "consecutiveFailures": 2,
    "cooldownMinutes": 60
  },
  "schedule": {"kind": "cron", "expr": "*/30 * * * *"},
  "sessionTarget": "isolated",
  "payload": {
    "kind": "agentTurn",
    "message": "## StantonTimes P0 Official Sources Monitor..."
  }
}
```

**CHANGES:**
- ✅ Added `"model": "ollama/qwen3:8b"`
- ✅ Added `"modelConfig"` with validated context (4096)
- ✅ Added `"fallbackModel": "claude-3-5-haiku"`
- ✅ Added `"fallbackRules"` for auto-recovery

---

## 🛡️ Safety Features

### Fallback Logic
- If Ollama fails **2 consecutive times** → auto-switch to Haiku
- After **60 minutes cooldown** → retry Ollama
- Logs all fallbacks to `logs/model-fallbacks.log`
- Alert if fallback rate >10%

### Context Validation
- **Bloom PR Monitor:** 4096 tokens (monitoring task)
- **Fact Extraction:** 16384 tokens (extraction task)
- **StantonTimes P0:** 4096 tokens (monitoring task)
- All validated by context-validator.js

### Monitoring
- Track response times
- Monitor accuracy (manual spot-checks)
- Log all model errors
- Daily review of outputs

---

## 📊 Expected Impact

### Performance
| Job | Current Time | Expected Time | Improvement |
|-----|--------------|---------------|-------------|
| Bloom PR Monitor | ~8s | 3-5s | 40-60% faster |
| Fact Extraction | ~12s | 15-30s | 20% slower (acceptable) |
| StantonTimes P0 | ~25s | 3-5s | 80%+ faster |

### Cost Savings
- **3 jobs migrated** = 21% of 14 total jobs
- **Runs per week:**
  - Bloom PR: 672 (every 15min)
  - Fact Extraction: 336 (every 30min)
  - StantonTimes P0: 336 (every 30min)
  - **Total:** 1,344 requests/week

- **Current cost (estimated):**
  - 1,344 requests × $0.003/request (Sonnet avg) = **$4.03/week**
  - Or **~$16/month** just for these 3 jobs

- **New cost:**
  - Ollama requests: **$0** (local, free)
  - Fallback to Haiku (<5%): ~$0.20/week
  - **Total:** **~$0.80/month**

- **Savings:** **$15.20/month** from just 3 jobs (95% reduction)

---

## ✅ Success Criteria (7-Day Pilot)

### Must-Have
- ✅ **0 critical failures** (no missed PRs, no missed tweets)
- ✅ **<5% fallback rate** to Haiku
- ✅ **95%+ accuracy** on manual review

### Nice-to-Have
- ✅ Response times meet targets
- ✅ No RAM issues on Mac Studio
- ✅ Ollama stability maintained

### Failure Conditions (Rollback Triggers)
- ❌ >1 critical failure (missed important event)
- ❌ >10% fallback rate (Ollama unreliable)
- ❌ <90% accuracy on review
- ❌ Frequent crashes or hangs

---

## 🚀 Deployment Steps

1. **Verify Ollama running:** `ollama list` shows qwen3:8b and qwen3:32b
2. **Create backup:** Export current cron configs
3. **Update jobs:** Use `cron update` with new patches
4. **Monitor first runs:** Watch next 3 executions manually
5. **Daily review:** Check logs for 7 days
6. **Decision point:** Continue to Phase 2 or rollback

---

## 📅 Timeline

- **Deploy:** Tonight (2026-01-31)
- **Monitor:** Feb 1-7 (7 days)
- **Review:** Feb 7 (decision point)
- **Phase 2:** Feb 8+ (if successful)

---

**Ready to deploy?** Review changes above, then confirm to proceed.
