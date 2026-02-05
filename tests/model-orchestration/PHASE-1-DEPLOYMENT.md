# Phase 1 Deployment - Correct Implementation

**Date:** 2026-01-31  
**Status:** Ready to Deploy

---

## Step 1: Fix Ollama Provider Config (CRITICAL)

**Problem:** Current Ollama config has 131K context on all models (the bug!)

**Current config (BROKEN):**
```json
{
  "models": {
    "providers": {
      "ollama": {
        "baseUrl": "http://127.0.0.1:11434/v1",
        "apiKey": "ollama-local",
        "api": "openai-completions",
        "models": [
          {
            "id": "qwen3:32b",
            "contextWindow": 131072  // ❌ WRONG - causes the bug!
          }
        ]
      }
    }
  }
}
```

**Fixed config (ADD these models):**
```json
{
  "models": {
    "providers": {
      "ollama": {
        "baseUrl": "http://127.0.0.1:11434/v1",
        "apiKey": "ollama-local",
        "api": "openai-completions",
        "models": [
          {
            "id": "qwen3:8b",
            "name": "Qwen 3 8B",
            "reasoning": false,
            "input": ["text"],
            "cost": {
              "input": 0,
              "output": 0,
              "cacheRead": 0,
              "cacheWrite": 0
            },
            "contextWindow": 8192,   // ✅ SAFE - validated
            "maxTokens": 4096
          },
          {
            "id": "qwen3:14b",
            "name": "Qwen 3 14B",
            "reasoning": false,
            "input": ["text"],
            "cost": {
              "input": 0,
              "output": 0,
              "cacheRead": 0,
              "cacheWrite": 0
            },
            "contextWindow": 8192,   // ✅ SAFE - validated
            "maxTokens": 4096
          },
          {
            "id": "qwen3:32b",
            "name": "Qwen 3 32B",
            "reasoning": false,
            "input": ["text"],
            "cost": {
              "input": 0,
              "output": 0,
              "cacheRead": 0,
              "cacheWrite": 0
            },
            "contextWindow": 16384,  // ✅ FIXED - was 131072
            "maxTokens": 8192
          }
        ]
      }
    }
  }
}
```

---

## Step 2: Update Cron Jobs

### Job 1: Bloom PR Monitor

**Current payload:**
```json
{
  "kind": "agentTurn",
  "message": "## Bloom PR Monitor\n\n**Methodology:** FIND → VALIDATE..."
}
```

**New payload (add model override):**
```json
{
  "kind": "agentTurn",
  "message": "## Bloom PR Monitor\n\n**Methodology:** FIND → VALIDATE...",
  "model": "ollama/qwen3:8b"
}
```

**CLI command:**
```bash
openclaw cron update 36d25e5b-892f-4f87-b297-6c011bb21eae \
  --patch '{"payload": {"model": "ollama/qwen3:8b"}}'
```

---

### Job 2: Fact Extraction

**Current payload:**
```json
{
  "kind": "agentTurn",
  "message": "## Fact Extraction\n\n**Methodology:** FIND → VALIDATE..."
}
```

**New payload (add model override):**
```json
{
  "kind": "agentTurn",
  "message": "## Fact Extraction\n\n**Methodology:** FIND → VALIDATE...",
  "model": "ollama/qwen3:32b"
}
```

**CLI command:**
```bash
openclaw cron update 657a6dbd-a850-4032-a558-73a2d4467e86 \
  --patch '{"payload": {"model": "ollama/qwen3:32b"}}'
```

---

### Job 3: StantonTimes P0 Monitor

**Current payload:**
```json
{
  "kind": "agentTurn",
  "message": "## StantonTimes P0 Official Sources Monitor..."
}
```

**New payload (add model override):**
```json
{
  "kind": "agentTurn",
  "message": "## StantonTimes P0 Official Sources Monitor...",
  "model": "ollama/qwen3:8b"
}
```

**CLI command:**
```bash
openclaw cron update 1aa99924-c284-421f-8747-7516c66c5360 \
  --patch '{"payload": {"model": "ollama/qwen3:8b"}}'
```

---

## Deployment Steps (EXACT ORDER)

### 1. Update Ollama Provider Config
```bash
openclaw gateway config.patch '{
  "models": {
    "providers": {
      "ollama": {
        "models": [
          {
            "id": "qwen3:8b",
            "name": "Qwen 3 8B",
            "reasoning": false,
            "input": ["text"],
            "cost": {"input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0},
            "contextWindow": 8192,
            "maxTokens": 4096
          },
          {
            "id": "qwen3:14b",
            "name": "Qwen 3 14B",
            "reasoning": false,
            "input": ["text"],
            "cost": {"input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0},
            "contextWindow": 8192,
            "maxTokens": 4096
          },
          {
            "id": "qwen3:32b",
            "name": "Qwen 3 32B",
            "reasoning": false,
            "input": ["text"],
            "cost": {"input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0},
            "contextWindow": 16384,
            "maxTokens": 8192
          }
        ]
      }
    }
  }
}'
```

### 2. Update Cron Jobs (via cron tool)

Use the `cron` tool to update each job's payload:

**Job 1: Bloom PR Monitor**
```json
{
  "action": "update",
  "jobId": "36d25e5b-892f-4f87-b297-6c011bb21eae",
  "patch": {
    "payload": {
      "model": "ollama/qwen3:8b"
    }
  }
}
```

**Job 2: Fact Extraction**
```json
{
  "action": "update",
  "jobId": "657a6dbd-a850-4032-a558-73a2d4467e86",
  "patch": {
    "payload": {
      "model": "ollama/qwen3:32b"
    }
  }
}
```

**Job 3: StantonTimes P0 Monitor**
```json
{
  "action": "update",
  "jobId": "1aa99924-c284-421f-8747-7516c66c5360",
  "patch": {
    "payload": {
      "model": "ollama/qwen3:8b"
    }
  }
}
```

### 3. Verify Changes
```bash
openclaw cron list
openclaw models list --provider ollama
```

### 4. Monitor First Runs
- Watch next 3 executions of each job
- Check logs for context errors
- Verify Ollama responds <15s for Tier 1, <60s for Tier 2

---

## Fallback Strategy

**If Ollama fails:**
- Cron jobs will fall back to default model (claude-sonnet-4-5)
- NOT using `fallbackModel` field (not supported in cron payload)
- Fallback happens automatically via agent model selection

**If jobs break:**
1. Remove model override from payload:
```json
{
  "action": "update",
  "jobId": "<id>",
  "patch": {
    "payload": {
      "model": null
    }
  }
}
```
2. Jobs revert to default Sonnet immediately

---

## Success Metrics (7 Days)

### Performance
- Bloom PR: <10s (target: 95th percentile)
- Fact Extraction: <60s (target: 95th percentile)
- StantonTimes P0: <10s (target: 95th percentile)

### Quality
- Manual review: 20 random runs from each job
- Accuracy: 95%+ correct analysis
- No missed PRs/tweets

### Cost
- 3 jobs migrated = 1,344 requests/week
- Current: ~$16/month
- Target: <$1/month (95% savings)

---

## Timeline

- **Tonight (Jan 31):** Deploy config + job updates
- **Feb 1-7:** Monitor daily, spot-check outputs
- **Feb 7:** Review & decide on Phase 2

---

**Ready to deploy?** Confirm and I'll execute these steps.
