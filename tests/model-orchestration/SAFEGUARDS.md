# Context Window Safeguards

## The Problem We're Solving

**What happened:** Ollama requested 131K token context for qwen3:8b, which was only trained on 32K tokens. This caused silent failures with "context canceled" errors.

**Why it matters:** Context window mismatches waste time, cause failures, and make debugging hard. Different models have different limits.

---

## Safeguard System

### 1. Model Specifications Database
**File:** `MODEL-SPECS.json`

Centralized source of truth for each model's capabilities:
```json
{
  "qwen3:8b": {
    "trained_context": 32768,    // Never exceed this
    "safe_context": 8192,         // Recommended max for performance
    "max_context": 16384,         // Absolute safe max
    "tier": 1
  }
}
```

### 2. Context Validator
**File:** `context-validator.js`

Validates context requests before they reach Ollama:

```bash
# Check if a context size is safe
node context-validator.js check qwen3:8b 131072
# Returns: Error - auto-reduces to 8192

# Get recommended context for a task type
node context-validator.js recommend qwen3:32b extraction
# Returns: 16384
```

**Features:**
- ✅ Hard limits (never exceed trained context)
- ⚠️  Soft warnings (above safe threshold)
- 🔧 Auto-reduction on violation
- 📋 Logging of all context errors

### 3. Safe Wrapper Script
**File:** `safe-ollama-call.sh`

Pre-validated Ollama calls for cron jobs:

```bash
./safe-ollama-call.sh qwen3:8b monitoring "Check GitHub for new PRs"
# Automatically uses 4096 tokens (recommended for monitoring)

./safe-ollama-call.sh qwen3:32b extraction "Extract facts from this log..."
# Automatically uses 16384 tokens (recommended for extraction)
```

---

## How to Use in Cron Jobs

### Old Way (Unsafe):
```javascript
// Cron job payload - NO validation
{
  "model": "ollama/qwen3:8b",
  "prompt": "...",
  // Context size unknown - might fail!
}
```

### New Way (Safe):
```javascript
// Option A: Use validator in cron job code
const { getRecommendedContext } = require('./context-validator.js');

const context = getRecommendedContext('qwen3:8b', 'monitoring');
// Returns: 4096

// Option B: Add to cron job config
{
  "model": "ollama/qwen3:8b",
  "modelConfig": {
    "num_ctx": 4096,  // From MODEL-SPECS.json
    "temperature": 0.1
  }
}
```

---

## Validation Rules

### Hard Rules (Enforced)
1. **Never exceed trained_context** - Auto-reduce if violated
2. **Log all context errors** - Track failures for debugging
3. **Fallback on repeated failures** - Switch to cloud model after 3 failures

### Soft Rules (Warnings)
1. **Warn above safe_context** - Log but allow
2. **Track performance** - Monitor if large contexts slow down responses

---

## Task-Specific Recommendations

| Task Type | Description | qwen3:8b | qwen3:14b | qwen3:32b |
|-----------|-------------|----------|-----------|-----------|
| **monitoring** | Boolean checks, simple status | 4096 | 4096 | 4096 |
| **extraction** | Structured data, JSON parsing | 8192 | 8192 | 16384 |
| **reasoning** | Complex analysis, synthesis | N/A | 16384 | 32768 |

---

## Testing the Safeguards

### Test 1: Catch the 131K Bug
```bash
node context-validator.js check qwen3:8b 131072
# Expected: Error + auto-reduce to 8192
```

### Test 2: Validate Safe Contexts
```bash
node context-validator.js check qwen3:8b 8192
# Expected: OK

node context-validator.js check qwen3:32b 16384
# Expected: OK
```

### Test 3: Get Recommendations
```bash
node context-validator.js recommend qwen3:8b monitoring
# Expected: 4096

node context-validator.js recommend qwen3:32b reasoning
# Expected: 32768
```

### Test 4: Safe Wrapper
```bash
./safe-ollama-call.sh qwen3:8b monitoring "Test prompt"
# Expected: Executes with 4096 context automatically
```

---

## Adding New Models

When adding a new model:

1. **Research its specs:**
   - What context was it trained on?
   - What's the practical safe max?
   - Does it have known performance cliffs?

2. **Add to MODEL-SPECS.json:**
```json
"new-model:7b": {
  "trained_context": 8192,
  "safe_context": 4096,
  "max_context": 8192,
  "tier": 1,
  "notes": "Performance degrades above 4K"
}
```

3. **Test it:**
```bash
node context-validator.js check new-model:7b 4096
node context-validator.js recommend new-model:7b monitoring
```

---

## Monitoring & Alerts

### Log Format
```
[CONTEXT ERROR] REJECTED: 131072 exceeds qwen3:8b trained context (32768). Auto-reduced to 8192.
[CONTEXT WARNING] 20000 is above safe context (8192) for qwen3:8b. Performance may degrade.
[AUTO-FIX] Adjusted to 8192
[SAFE-CALL] Model: qwen3:8b | Task: monitoring | Context: 4096 tokens
```

### Alert Triggers
- **3+ context errors in 1 hour** → Investigate cron job config
- **Repeated auto-reductions** → Update cron job to use safe context
- **Performance degradation** → May be hitting context limits

---

## Phase 1 Implementation

### Week 1 Checklist
- [x] Create MODEL-SPECS.json
- [x] Build context-validator.js
- [x] Create safe-ollama-call.sh wrapper
- [ ] Update cron job configs with validated contexts
- [ ] Test all 3 pilot jobs with new safeguards
- [ ] Monitor logs for context errors

### Pilot Jobs Config
```javascript
// Bloom PR Monitor
{
  "model": "ollama/qwen3:8b",
  "modelConfig": {
    "num_ctx": 4096,  // Validated: monitoring task
    "temperature": 0.1
  }
}

// Fact Extraction
{
  "model": "ollama/qwen3:32b",
  "modelConfig": {
    "num_ctx": 16384,  // Validated: extraction task
    "temperature": 0.1
  }
}
```

---

## Future Enhancements

1. **Runtime validation** - Hook into OpenClaw to validate ALL model calls
2. **Auto-detection** - Parse model info from `ollama show <model>` 
3. **Performance tracking** - Log actual response times vs context size
4. **Dynamic adjustment** - Auto-reduce context if model is slow
5. **MCP integration** - Expose validator as MCP tool for other agents

---

**Bottom line:** Never trust default context sizes. Always validate against model specs. Auto-reduce on violation. Log everything.
