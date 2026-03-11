# Model Routing — Enhanced Smart Selection (P2 #33)

> **Related:** `docs/MODEL_ROUTING_POLICY.md`, `docs/MODEL_FALLBACK_CHAIN.md`, `docs/MODEL_STRATEGY.md`, `docs/BUDGET_POLICY.md`

## Overview

The Model Router (`lib/model-router.ts`) provides intelligent model selection based on multi-factor scoring. It enables dynamic routing for model selection by considering task complexity, quota, business unit priority, time sensitivity, historical performance, and security risk signals (Issue #224).

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                    RoutingRequest                     │
│  (complexity, sensitivity, BU, capabilities, etc.)   │
└──────────────────────┬──────────────────────────────┘
                       ▼
┌─────────────────────────────────────────────────────┐
│                   ModelRouter                        │
│                                                     │
│  1. Resolve BU Override ─────────────────────────┐  │
│  2. Check Forced Model                           │  │
│  3. Determine Tier Bounds (min/max)              │  │
│  4. Apply Quota Restrictions ◄── QuotaTracker    │  │
│  5. Filter Candidate Models                      │  │
│  6. Score Candidates ◄────────── PerformanceTracker │
│  7. Select Best (or Fallback)                    │  │
└──────────────────────┬──────────────────────────────┘
                       ▼
┌─────────────────────────────────────────────────────┐
│                 RoutingDecision                       │
│  (model, score, breakdown, warnings, reason)         │
└─────────────────────────────────────────────────────┘
```

## Model Tiers

| Tier | Level | Models | Use Case |
|------|-------|--------|----------|
| 1 | Cheap | GPT-4o-mini, Claude Haiku | Summaries, formatting, classification, simple Q&A |
| 2 | Balanced | GPT-4o, Claude Sonnet | Code review, reasoning, multi-step tasks |
| 3 | Premium | o1, Claude Opus | Complex analysis, planning, ambiguous requirements |

## Scoring Factors

The router computes a composite score for each candidate model:

### 1. Complexity Score
Maps task complexity to an ideal tier and penalizes mismatch:
- `simple` → tier 1 (base 10 points)
- `medium` → tier 2 (base 50 points)
- `complex` → tier 3 (base 100 points)
- Tier mismatch penalty: -20 per tier distance

### 2. Quota Score
Adjusts model preference based on quota pressure:
- **Tier 1 models** get a bonus when quota is tight (up to +30)
- **Higher tier models** get penalized proportional to usage pressure
- When global quota ≥ 90%: hard restriction to tier 1 (unless safety-critical)

### 3. Priority Score
Based on business unit priority or explicit override:
- Base score: `high` 100, `medium` 50, `low` 20
- Tier alignment: score is reduced by 20 points per tier away from the priority's ideal tier (`high`→3, `medium`→2, `low`→1)

### 4. Time Sensitivity Score
- Base score: `urgent` 80, `normal` 40, `batch` 10
- Tier alignment: score is reduced by 15 points per tier away from ideal sensitivity tier (`urgent`→3, `normal`→2, `batch`→1)
- `urgent` requests also boost `minTier` to 2 as a hard floor

### 5. Performance Score
Uses historical data (exponential moving average):
- Tracks latency, success rate, and quality per model+taskType
- Requires ≥3 samples for meaningful scoring
- Weighted: quality 50%, success 35%, latency 15%
- Range: -30 to +30 points

### 6. Provider Preference Score
- +15 points if model matches preferred provider (from request or BU override)

### 7. Capability Match Score
- +10 points per matched required capability

## Security-Aware Routing (Issue #224)

Security routing adds a threat dimension on top of complexity routing.

- **High risk** (`risk=high`) is enforced for untrusted/external content (`containsExternalContent`, external `contentSources`, or high `injectionScore`).
- **Medium risk** is applied for elevated injection signals and code-generation/review task types.
- **Low risk** remains for internal/safe tasks.

### Security Tier Floors

| Risk | Tier Floor | Quota Behavior |
|------|------------|----------------|
| `high` | Tier 3 | Quota downgrade is bypassed (security-critical) |
| `medium` | Tier 2 | Standard quota policy applies |
| `low` | Tier 1+ | Standard quota policy applies |

### Request-Level Override

Per-task user override is supported with `forceModel`. When provided and available, the router uses that model directly and marks the decision with `security.forcedByRequest=true`.

### Injection Detection Telemetry

When `injectionScore` meets the configured threshold (default `0.6`), the router records a detection event and exposes it via:

- `router.getInjectionDetections(limit?)`
- `router.getSecurityRoutingSummary(limit?)`

The summary includes risk/tier counts, model usage, and estimated savings versus a premium-baseline model.

## Quota Management

### Thresholds
| Usage | Action |
|-------|--------|
| < 90% | Normal routing |
| ≥ 90% | Restrict to tier 1 (cheap) |
| 100% | Skip provider entirely |

### Safety-Critical Override
Tasks marked `safetyCritical: true` are **exempt** from quota restrictions. This ensures critical operations always get the best available model.

### Provider-Specific Quotas
Quotas can be tracked per-provider (`openai`, `anthropic`) and globally (`global`). When a provider's quota is exhausted, its models are excluded from candidates and fallback selection (except for `safetyCritical` requests).

## Business Unit Overrides

Overrides allow per-business-unit routing customization:

```typescript
{
  businessUnit: 'ventureos',
  priority: 'high',          // Priority for scoring
  minTier: 2,                // Floor (at least tier 2)
  maxTier: 3,                // Ceiling (at most tier 3)
  preferredProvider: 'anthropic', // Provider hint
  forcedModel: 'claude-opus',    // Skip scoring entirely
}
```

**Precedence:**
1. `forcedModel` (if set and available) → immediate return
2. `priorityOverride` in request → overrides BU priority
3. BU `minTier`/`maxTier` → constrains tier range
4. BU `preferredProvider` → scoring bonus

## Fallback Chain

When no candidates match the requested tier range:

1. **Capability-matched models** (any tier, cheapest first)
2. **Any available model** (cheapest first)
3. **No fallback candidates remain** (all unavailable or excluded by exhausted-provider quota) → return error marker with `CRITICAL` warning

Fallback decisions are logged with:
- `fallbackUsed: true`
- `fallbackIndex` (position in chain)
- Warning messages explaining why

## Usage

### Basic Routing

```typescript
import { ModelRouter, DEFAULT_MODELS } from './lib/model-router';

const router = new ModelRouter({
  models: DEFAULT_MODELS,
  businessUnitOverrides: [
    { businessUnit: 'ventureos', priority: 'high', minTier: 2 },
  ],
});

// Set quota state
router.quota.setQuota('global', { total: 10000, used: 5000, resetsAt: '2026-03-01' });

// Route a request
const decision = router.selectModel({
  complexity: 'medium',
  timeSensitivity: 'normal',
  businessUnit: 'ventureos',
  taskType: 'code-review',
  requiredCapabilities: ['code', 'reasoning'],
});

console.log(decision.model.id);       // e.g., 'claude-sonnet'
console.log(decision.tier);           // 2
console.log(decision.reason);         // 'complexity=medium, sensitivity=normal, tier=2, bu=ventureos'
console.log(decision.quotaDowngraded); // false
```

### Recording Performance

```typescript
// After task completion
router.performance.recordCompletion(
  decision.model.id,  // 'claude-sonnet'
  'code-review',      // task type
  1200,               // latency ms
  true,               // success
  0.92                // quality score (0-1)
);
```

### Managing Model Status

```typescript
// Mark a model as unavailable (outage)
router.updateModelStatus('gpt-4o', 'unavailable');

// Restore
router.updateModelStatus('gpt-4o', 'available');
```

### Dynamic Override Management

```typescript
// Add override at runtime
router.setBusinessUnitOverride({
  businessUnit: 'new-project',
  priority: 'high',
  forcedModel: 'claude-opus',
});

// Remove override
router.removeBusinessUnitOverride('new-project');
```

## Performance Considerations

The model router is designed for the **hot path**:

- **No async I/O** in `selectModel()` — all data is in-memory
- **O(n)** where n = number of models (typically 6) — effectively constant time
- **Scoring is pure computation** — no allocations beyond the result objects
- **QuotaTracker** and **PerformanceTracker** use in-memory Maps
- For persistence, use `export()`/`import()` on trackers

## Logging

Every routing decision logs:
- `modelId` — selected model
- `tier` — selected tier
- `score` — composite score
- `reason` — human-readable routing reason
- `quotaDowngraded` — whether quota forced a downgrade
- `fallbackUsed` — whether primary selection failed
- `warnings` — any non-blocking issues

Enable verbose logging with `MODEL_ROUTER_DEBUG=1`.

## Testing

```bash
cd ventureos
npx jest --testPathPattern=model-router --verbose
```

Tests cover:
- Multi-factor scoring algorithm
- Quota tracking and enforcement (including edge cases)
- Fallback chain logic (partial and total outages)
- Business unit overrides (forced model, tier constraints, priority)
- Performance tracking (EMA, scoring, best model selection)
- Integration scenarios (realistic multi-factor routing)

## Backward Compatibility

The model router is a **new module** — it does not modify existing routing infrastructure. Existing `queue-router.ts` continues to handle task queue prioritization. The model router is intended to be integrated downstream as a complementary routing layer for model selection.

## Future Enhancements

- **Cost estimation** — predict cost before execution using model pricing
- **A/B testing** — route a percentage of traffic to alternate models
- **Auto-scaling tiers** — dynamically adjust thresholds based on budget burn rate
- **Circuit breaker** — auto-disable models with high failure rates
- **Multi-model orchestration** — split complex tasks across tiers
