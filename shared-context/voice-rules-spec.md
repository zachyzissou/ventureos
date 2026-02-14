# Voice Rules — VOXYZ Multi-Agent Communication Standards

**Last Updated:** 2026-02-14 16:07 CST  
**Owner:** Verifier (Observer)  
**Status:** ✅ COMPLETE  
**Location:** `~/clawd/ventureos/lib/voice-rules.ts`

---

## Overview

Voice Rules enforce communication quality in multi-agent conversations (VOXYZ pattern). Two core rules:

1. **Fact+Action Format** — Messages separate observations from actions. No mixing speculation into facts.
2. **Anti-Filler Validation** — Detects and blocks sycophantic/filler phrases per SOUL.md directives.

## Fact+Action Message Format

Every inter-agent message follows this structure:

```typescript
interface VoiceMessage {
  from: string;        // Agent ID (e.g., "oracle", "atlas")
  to: string;          // Target agent ID, "user", or "broadcast"
  facts: Fact[];       // What is true right now
  actions: Action[];   // What agent did/will do
  summary?: string;    // Optional free-text (subject to anti-filler)
  timestamp?: string;  // ISO 8601
}
```

### Facts

Facts are verifiable observations. No hedging, no speculation.

```typescript
interface Fact {
  observation: string;   // What was observed/measured/confirmed
  source?: string;       // Where this came from (log, metric, agent)
  confidence?: number;   // 0.0–1.0 (1.0 = verified, 0.7+ = high)
}
```

**Good facts:**
- `"CPU usage is 92%"` (source: grafana, confidence: 1.0)
- `"No published benchmarks for multi-agent coordination"` (confidence: 0.8)
- `"47 failed SSH login attempts in last 10 minutes"` (source: auth.log)

**Bad facts (will trigger warnings):**
- `"The service is probably down"` → Use confidence: 0.7 instead
- `"I think the test is flaky"` → State observation directly
- `"It seems like the config changed"` → Use confidence: 0.6 instead

### Actions

Actions describe what the agent did or will do.

```typescript
interface Action {
  description: string;         // What was/will be done
  status: ActionStatus;        // completed | in_progress | planned | blocked
  blockedReason?: string;      // Required if status is "blocked"
  target?: string;             // Agent/system affected
}
```

### Message Validation Rules

| Rule | Severity | Description |
|------|----------|-------------|
| `required_field` | block | `from`, `to`, `facts`, `actions` required |
| `empty_message` | block | At least one fact or action required |
| `fact_observation_required` | block | Each fact needs non-empty observation |
| `action_status_invalid` | block | Status must be valid enum value |
| `fact_confidence_range` | warning | Confidence must be 0.0–1.0 |
| `blocked_requires_reason` | warning | Blocked actions should explain why |
| `invalid_timestamp` | warning | Timestamp must be valid ISO 8601 |
| `fact_hedging` | warning | Facts shouldn't contain weasel words |

## Anti-Filler Rules

Derived from SOUL.md: *"Never open with 'Great question', 'I'd be happy to help', or 'Absolutely.' Just answer."*

### 7 Filler Categories

| Category | Severity | Examples |
|----------|----------|----------|
| **sycophantic_opener** | block | "Great question!", "Excellent question!", "That's a good point" |
| **happy_to_help** | block | "I'd be happy to", "I'm glad you asked", "Glad to help" |
| **filler_acknowledgment** | warning | "Absolutely.", "Definitely.", "Of course.", "Sure thing." |
| **thinking_stall** | warning | "Let me think about that", "That's an interesting...", "Well," |
| **hedge_phrase** | warning | "I think maybe", "Correct me if I'm wrong", "I could be wrong but" |
| **corporate_filler** | warning | "At the end of the day", "Moving forward", "It's worth noting" |
| **meta_narration** | warning | "I'll start by reviewing", "Allow me to", "What I'll do is" |

### Severity Levels

- **block** — Sycophantic openers and performative willingness. These are never acceptable in agent communication. Message should be rejected or auto-cleaned.
- **warning** — Stalling, hedging, corporate-speak. Flagged for awareness. Not rejected.

### Auto-Clean Mode

When `autoClean: true`, the validator strips opener-style filler and returns a cleaned message:

```typescript
// Input summary: "Great question! The tests all pass."
// Cleaned summary: "The tests all pass."
```

Body-level filler (hedge phrases, corporate filler) is flagged but not stripped — removing it mid-sentence would break grammar.

## Integration with Role Card Enforcement

Voice Rules plug into the existing 3-tier enforcement system as a **Tier 2 heuristic** check:

```
Tier 1: Infrastructure (permission blocks)
Tier 2: Heuristic (citation_detector, number_source_tracker, voice_rules) ← NEW
Tier 3: Quality (training/logging only)
```

### Bridge Function

```typescript
import { voiceViolationsToEnforcementWarnings } from './voice-rules';

const violations = validateVoiceMessage(msg).violations;
const warnings = voiceViolationsToEnforcementWarnings(violations);
// warnings format matches enforceHeuristicBans() output
```

Each warning has:
- `rule`: The violation rule name (e.g., `filler_sycophantic_opener`)
- `enforcement`: Always `"voice_rules"`
- `severity`: `"warning"` or `"block"`
- `details`: Human-readable description with matched text

## Agent-Specific Examples

### Oracle (Research Report)

```json
{
  "from": "oracle",
  "to": "user",
  "facts": [
    {
      "observation": "Claude Opus 4 shows 15% improvement on GPQA over Claude 3.5 Sonnet",
      "source": "https://anthropic.com/benchmarks",
      "confidence": 0.95
    },
    {
      "observation": "No published benchmarks for multi-agent coordination tasks",
      "confidence": 0.8
    }
  ],
  "actions": [
    { "description": "Searched Anthropic docs, arXiv, and HuggingFace", "status": "completed" },
    { "description": "Will check OpenAI blog for comparison data", "status": "planned" }
  ],
  "summary": "15% GPQA improvement confirmed. Multi-agent benchmarks not yet published."
}
```

### Atlas (Deployment Update)

```json
{
  "from": "atlas",
  "to": "nexus",
  "facts": [
    { "observation": "v2.3.1 deployed to production at 14:22 UTC", "source": "deploy_logs", "confidence": 1.0 },
    { "observation": "Health check passed: 200 OK on /health", "source": "monitoring", "confidence": 1.0 },
    { "observation": "Memory usage stable at 340MB (baseline 320MB)", "source": "grafana", "confidence": 0.95 }
  ],
  "actions": [
    { "description": "Deployed v2.3.1 with zero-downtime rolling update", "status": "completed" },
    { "description": "Monitoring for 15 minutes before marking stable", "status": "in_progress" }
  ]
}
```

### Sentinel (Security Alert)

```json
{
  "from": "sentinel",
  "to": "echo",
  "facts": [
    { "observation": "47 failed SSH login attempts from 192.168.1.105 in last 10 minutes", "source": "auth.log", "confidence": 1.0 },
    { "observation": "IP is internal (developer workstation)", "source": "asset_inventory", "confidence": 0.9 }
  ],
  "actions": [
    { "description": "Rate-limited IP for 30 minutes", "status": "completed" },
    { "description": "Notified user to check workstation", "status": "completed" },
    { "description": "Full incident report", "status": "planned" }
  ],
  "summary": "Brute-force attempt from internal IP. Rate-limited. User notified."
}
```

### Verifier (Validation Report)

```json
{
  "from": "verifier",
  "to": "nexus",
  "facts": [
    { "observation": "29/29 tests pass", "source": "jest", "confidence": 1.0 },
    { "observation": "Code coverage at 84%", "source": "jest --coverage", "confidence": 1.0 },
    { "observation": "2 TypeScript strict-mode warnings in kpi-registry.ts", "source": "tsc --noEmit", "confidence": 1.0 }
  ],
  "actions": [
    { "description": "Ran full test suite and coverage report", "status": "completed" },
    { "description": "Flagged TS warnings to synth for fix", "status": "completed" }
  ]
}
```

## API Reference

| Function | Purpose |
|----------|---------|
| `validateVoiceMessage(msg, opts?)` | Full validation pipeline (structure + hedging + filler) |
| `validateStructure(msg)` | Structural integrity only |
| `detectFiller(text, rules?)` | Scan text for filler phrases |
| `stripFiller(text, rules?)` | Remove opener-style filler from text |
| `detectFactHedging(facts)` | Check fact observations for weasel words |
| `validateRawText(text, rules?)` | Quick filler check on free-form text |
| `voiceViolationsToEnforcementWarnings(violations)` | Bridge to role-card enforcement |
| `createVoiceMessage(from, to, facts, actions, opts?)` | Build + validate a message |
| `createStatusUpdate(from, to, facts, actions, opts?)` | Shorthand for status updates |
| `FILLER_RULES` | Exported array of all filler rules (customizable) |

## Test Coverage

- **76 tests**, all passing
- **99.2% statement coverage** | 94.4% branch | 100% function | 99.1% line
- Tests include: structure validation, filler detection, stripping, fact hedging, full pipeline, raw text, enforcement integration, message builders, agent-specific examples, edge cases

## File Locations

| File | Description |
|------|-------------|
| `~/clawd/ventureos/lib/voice-rules.ts` | Implementation (490 lines) |
| `~/clawd/ventureos/lib/__tests__/voice-rules.test.ts` | Tests (76 tests) |
| `~/clawd/shared-context/voice-rules-spec.md` | This document |

## Design Decisions

1. **Hedging belongs in confidence scores, not prose.** Facts use numeric confidence (0-1) instead of words like "probably" or "seems like". This makes uncertainty machine-readable and unambiguous.

2. **Sycophantic openers are blocking, not warnings.** "Great question!" and "I'd be happy to" are never acceptable in agent-to-agent communication. They waste tokens and signal nothing.

3. **Corporate filler is warned, not blocked.** "Moving forward" and "at the end of the day" are bad habits, but blocking them would be too aggressive for edge cases.

4. **Auto-clean only strips openers.** Body-level filler can't be safely removed without breaking grammar. It's flagged for the author to fix.

5. **Custom rules supported.** Teams can extend FILLER_RULES with domain-specific patterns (e.g., blocking "synergy" in engineering contexts).
