# Model Routing + Thinking Level Strategy

> **Purpose:** Route tasks to appropriate models + thinking levels → reduce costs 30-50% for routine work, balance API load across providers.
>
> **Last updated:** 2026-02-14
> **Owner:** Atlas (implementation), Echo (strategic oversight)

---

## Quick Reference

```
┌─────────────────────────────────────────────────────────────────┐
│                     MODEL ROUTING TIERS                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  TIER 1: SIMPLE           TIER 2: BALANCED       TIER 3: COMPLEX│
│  ─────────────           ────────────────       ────────────────│
│  gpt-5.1-codex-mini     claude-3-7-sonnet      claude-opus-4-6 │
│  gpt-4.1-mini           claude-3-5-sonnet      claude-sonnet-4-5│
│  thinking: low           thinking: medium       thinking: high  │
│                                                                 │
│  Health checks           Code review            Security review │
│  Log parsing             Bug fixes              Research        │
│  Backups                 Infrastructure         Strategic plan  │
│  Cron jobs               Integration            External content│
│  Status checks           Complex docs           CEO decisions   │
│  Monitoring              Testing                Threat analysis │
│                                                                 │
│  Cost: $                 Cost: $$               Cost: $$$       │
│  Latency: Fast           Latency: Medium        Latency: Slow   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Tier 1: Simple Tasks → Lighter Models + Low Thinking

### Models
- **Primary:** `openai-codex/gpt-5.1-codex-mini` (most cost-effective)
- **Fallback:** `openai-codex/gpt-4.1-mini`, `openai-codex/gpt-4.1-nano`

### Thinking Level
- `low` — routine work, no deep reasoning needed

### Use Cases
| Task Type | Examples | Why Tier 1 |
|-----------|----------|------------|
| Health checks | Gateway status, service pings, disk space | Binary pass/fail |
| Monitoring | Cron health, session sizes, latency checks | Script output → alert |
| Log parsing | Export cron logs, error filtering | Pattern matching |
| Backup ops | Run backup, verify backup, integrity check | Script execution |
| Status checks | Budget check, metrics snapshot | Read + report |
| Simple file ops | List, count, organize, archive | Mechanical |
| Observation sync | Memory extraction, daily log processing | Template-driven |
| Cookie refresh | Twitter cookies, auth token refresh | Script execution |
| Watch jobs | Moltbook reply watch, MR monitor | Compare + alert |

### Current Cron Jobs Already on Tier 1
These are correctly routed today:
- `Bloom MR Monitor` → `gpt-5.1-codex-mini` ✅
- `Bloom CI Watch` → `gpt-5.1-codex-mini` ✅
- `OpenClaw Monitor` → `gpt-5.1-codex-mini` + `thinking: low` ✅
- `Budget Check` → `gpt-5.1-codex-mini` ✅
- `Export Cron Logs` → `gpt-5.1-codex-mini` ✅
- `Discord Latency Monitor` → `gpt-5.1-codex-mini` + `thinking: low` ✅
- `Session Health Check` → `gpt-5.1-codex-mini` ✅
- `Cron Health Check` → `gpt-5.1-codex-mini` ✅
- `Daily Metrics Snapshot` → `gpt-5.1-codex-mini` ✅
- `Weekly Metrics Digest` → `gpt-5.1-codex-mini` ✅
- `memory-observation-sync` → `gpt-5.1-codex-mini` ✅
- `Moltbook Reply Watch` → `gpt-5.1-codex-mini` ✅
- `Daily Psionic Stats` → `gpt-5.1-codex-mini` + `thinking: low` ✅
- `Daily Khala Drift Update` → `gpt-5.1-codex-mini` + `thinking: low` ✅
- `Daily Memory→RPG Sync` → `gpt-5.1-codex-mini` + `thinking: low` ✅
- `WHOOP Morning Check-in` → `gpt-5.1-codex-mini` ✅

### Cron Jobs That Should Be Downgraded to Tier 1
These currently use heavier models but don't need them:

| Job | Current Model | Recommended | Reasoning |
|-----|---------------|-------------|-----------|
| `Nightly Backup` | (default/Opus) | `gpt-5.1-codex-mini` | Script execution only |
| `Weekly Backup Verify` | (default/Opus) | `gpt-5.1-codex-mini` | Script execution only |
| `Refresh Twitter Cookies` | (default/Opus) | `gpt-5.1-codex-mini` | Script execution only |
| `Archive Task Run Logs` | (default/Opus) | `gpt-5.1-codex-mini` | Script execution only |
| `Daily Protocol Trigger Check` | (default, no model set) | `gpt-5.1-codex-mini` + `thinking: low` | Script + verify |
| `Cron Error Watch` | (default, no model set) | `gpt-5.1-codex-mini` + `thinking: low` | Script output routing |
| `Moltbook Multi-Agent Scan` | (default/Opus) | `gpt-5.1-codex-mini` | Script + filter output |
| `SQLite Integrity Check` | (default/Opus) | `gpt-5.1-codex-mini` | Script execution only |
| `SQLite Restore Drill` | (default/Opus) | `gpt-5.1-codex-mini` | Script execution only |

**Estimated savings:** 9 cron jobs × ~$0.03-0.10/run × multiple runs/week = significant monthly reduction

---

## Tier 2: Balanced Tasks → Mid-Tier Models + Medium Thinking

### Models
- **Primary:** `anthropic/claude-3-7-sonnet-20250219` (best balance of capability/cost)
- **Alternate:** `anthropic/claude-3-5-sonnet-20241022`
- **OpenAI option:** `openai-codex/gpt-5.2-codex` (for load balancing)

### Thinking Level
- `medium` — balanced reasoning, good for most interactive work

### Use Cases
| Task Type | Examples | Why Tier 2 |
|-----------|----------|------------|
| Code review | PR review, code quality checks | Needs understanding |
| Bug fixes | Debugging, root cause analysis | Multi-step reasoning |
| Infrastructure | Deploy configs, service setup | Context-dependent |
| Complex docs | Architecture docs, design specs | Synthesis needed |
| Integration work | API integration, data pipeline | Multi-system context |
| Testing | Test case design, coverage analysis | Domain reasoning |
| Coordination | Task routing, team management | Multi-agent context |
| Morning briefings | Aggregate + summarize | Synthesis |
| Quality audits | Agent output review | Judgment needed |

### Current Cron Jobs Correctly on Tier 2
- `Extraction Shooter Intel` → `gpt-5.2-codex` ✅ (research but template-driven)
- `Unity Tool Scout` → `gpt-5.2-codex` ✅
- `Weekly Bloom Digest` → `gpt-5.2-codex` ✅
- `Weekly Memory Synthesis` → `gpt-5.2-codex` ✅
- `Morning Briefing` → `gpt-5.2-codex` ✅
- `Agent Quality Audit` → `gpt-5.2-codex` ✅

### Agent Default Models for Interactive Sessions

| Agent | Default Model | Default Thinking | Rationale |
|-------|---------------|------------------|-----------|
| Nexus | `claude-3-7-sonnet-20250219` | `medium` | Coordination, routing — doesn't need deep reasoning |
| Atlas | `claude-3-7-sonnet-20250219` | `medium` | Infrastructure ops — balanced capability |
| Verifier | `claude-3-7-sonnet-20250219` | `medium` | Quality checks — pattern matching + judgment |
| Synth | `claude-3-7-sonnet-20250219` | `medium` | Implementation — good code generation |
| Archivist | `openai-codex/gpt-5.1-codex-mini` | `low` | Documentation routine — mostly templated |

---

## Tier 3: Complex Tasks → Premium Models + High Thinking

### Models
- **Security/External content:** `anthropic/claude-opus-4-6` (prompt injection defense)
- **Strategic/Research:** `anthropic/claude-sonnet-4-5` (deep reasoning)

### Thinking Level
- `high` — deep research, security, strategic decisions
- `xtra-high` — only for critical strategic decisions with high stakes

### Use Cases
| Task Type | Model | Why Premium |
|-----------|-------|-------------|
| External content processing | `claude-opus-4-6` | Prompt injection defense |
| Security review | `claude-opus-4-6` | Can't afford mistakes |
| Threat analysis | `claude-opus-4-6` | Pattern recognition in adversarial content |
| Strategic planning | `claude-sonnet-4-5` | Multi-step reasoning |
| Research + analysis | `claude-sonnet-4-5` | Deep synthesis |
| CEO orchestration | `claude-sonnet-4-5` | High-stakes decisions |
| Cross-agent disputes | `claude-sonnet-4-5` | Nuanced judgment |

### Agent Default Models for Interactive Sessions

| Agent | Default Model | Default Thinking | Override Conditions |
|-------|---------------|------------------|---------------------|
| Echo | `claude-sonnet-4-5` | `high` | Strategic decisions → `xtra-high` |
| Oracle | `claude-sonnet-4-5` | `high` | External content → `claude-opus-4-6` |
| Sentinel | `claude-opus-4-6` | `high` | Always Opus for security-critical |

---

## Complete Agent Routing Table

| Agent | Interactive Model | Interactive Thinking | Cron Model | Cron Thinking |
|-------|------------------|---------------------|------------|---------------|
| **Echo** | `claude-sonnet-4-5` | `high` | `gpt-5.2-codex` | `medium` |
| **Oracle** | `claude-sonnet-4-5` | `high` | `gpt-5.2-codex` | `medium` |
| **Sentinel** | `claude-opus-4-6` | `high` | `claude-opus-4-6` | `high` |
| **Atlas** | `claude-3-7-sonnet` | `medium` | `gpt-5.1-codex-mini` | `low` |
| **Nexus** | `claude-3-7-sonnet` | `medium` | `gpt-5.1-codex-mini` | `low` |
| **Verifier** | `claude-3-7-sonnet` | `medium` | `gpt-5.1-codex-mini` | `low` |
| **Archivist** | `gpt-5.1-codex-mini` | `low` | `gpt-5.1-codex-mini` | `low` |
| **Synth** | `claude-3-7-sonnet` | `medium` | `gpt-5.1-codex-mini` | `low` |
| **Main** | `claude-opus-4-6` | `high` | `claude-sonnet-4-5` | `high` |

### Override Conditions

| Condition | Action |
|-----------|--------|
| Processing external web content | → `claude-opus-4-6` (prompt injection defense) |
| Security-critical operation | → `claude-opus-4-6` + `thinking: high` |
| Strategic decision with financial impact | → `claude-sonnet-4-5` + `thinking: xtra-high` |
| Simple cron job (script execution) | → `gpt-5.1-codex-mini` + `thinking: low` |
| Budget at 80%+ | → Downgrade all non-critical to Tier 1 |
| One provider overloaded | → Route to other provider |

---

## Implementation Plan

### Phase 1: Cron Job Updates (Immediate)

Update these cron jobs to use lighter models:

```bash
# Jobs to update (currently defaulting to heavy models):
# 1. Nightly Backup → gpt-5.1-codex-mini
# 2. Weekly Backup Verify → gpt-5.1-codex-mini
# 3. Refresh Twitter Cookies → gpt-5.1-codex-mini
# 4. Archive Task Run Logs → gpt-5.1-codex-mini
# 5. Daily Protocol Trigger Check → gpt-5.1-codex-mini + thinking: low
# 6. Cron Error Watch → gpt-5.1-codex-mini + thinking: low
# 7. Moltbook Multi-Agent Scan → gpt-5.1-codex-mini
# 8. SQLite Integrity Check → gpt-5.1-codex-mini
# 9. SQLite Restore Drill → gpt-5.1-codex-mini
```

### Phase 2: Agent Config Updates (Week 1)

Update `~/.openclaw/agents/<agent>/agent/models.json` or equivalent config:
- Set `default_model` per agent per table above
- Set `default_thinking` per agent per table above

### Phase 3: Monitoring Setup (Week 1)

Track these metrics weekly:
1. **Model usage by agent** — Which models are being used most?
2. **Cost per agent per week** — Is it decreasing for routine agents?
3. **Provider balance** — Anthropic vs OpenAI distribution
4. **Quality regression** — Any task failures after model downgrade?

### Phase 4: Refinement (Week 2+)

- Review quality of Tier 1 outputs — any degradation?
- Adjust routing based on actual usage patterns
- Consider auto-routing based on task classification

---

## Provider Load Balancing

### Current State (Estimated)
- **Anthropic:** ~80% of API calls (most agents default to Claude)
- **OpenAI:** ~20% (mostly cron jobs on codex-mini)

### Target State
- **Anthropic:** 50-60% (interactive sessions, security, strategy)
- **OpenAI:** 40-50% (cron jobs, routine tasks, some Tier 2)

### Balancing Rules
1. All Tier 1 tasks → OpenAI (codex-mini/nano)
2. Tier 2 tasks → Split between Claude Sonnet and GPT-5.2-codex
3. Tier 3 tasks → Anthropic only (Opus/Sonnet-4.5)
4. If Anthropic rate-limited → overflow Tier 2 to OpenAI
5. If OpenAI rate-limited → overflow Tier 1 to Claude Haiku (if available)

---

## Cost Estimation

### Before (All Opus/Sonnet-4.5)

| Category | Runs/Week | Est. Cost/Run | Weekly Cost |
|----------|-----------|---------------|-------------|
| Cron jobs (30 total) | ~500 | $0.05-0.15 | $25-75 |
| Interactive sessions | ~100 | $0.10-0.50 | $10-50 |
| **Total** | | | **$35-125** |

### After (Tiered Routing)

| Category | Runs/Week | Est. Cost/Run | Weekly Cost |
|----------|-----------|---------------|-------------|
| Tier 1 cron jobs (~20) | ~400 | $0.01-0.03 | $4-12 |
| Tier 2 cron/interactive | ~150 | $0.05-0.10 | $7.50-15 |
| Tier 3 interactive | ~50 | $0.10-0.50 | $5-25 |
| **Total** | | | **$16.50-52** |

**Estimated savings: 40-60%**

---

## Thinking Level Guide

| Level | When to Use | Token Overhead |
|-------|-------------|----------------|
| `low` | Script execution, status checks, template-driven tasks | Minimal |
| `medium` | Code review, infrastructure, integration, coordination | Moderate |
| `high` | Research, security, strategy, complex analysis | Significant |
| `xtra-high` | Critical strategic decisions, high-stakes security | Maximum |

### Rule of Thumb
- If the task has a script to run → `low`
- If the task requires understanding context → `medium`
- If the task requires original analysis → `high`
- If getting it wrong has severe consequences → `xtra-high`

---

## Success Criteria (2-Week Checkpoint)

| Metric | Target | Measurement |
|--------|--------|-------------|
| API load balance | <70% either provider | Track provider distribution |
| Cost reduction (routine) | 30-50% | Compare weekly spend |
| Quality maintenance | No regressions | Monitor task completion rates |
| Cron job success rate | >95% | Cron health check data |
| P0/P1 incidents from model downgrade | 0 | Incident tracking |

---

## References

- Existing routing design: `~/clawd/shared-context/opus-routing-design.md`
- Budget policy: `~/clawd/BUDGET_POLICY.md`
- Model strategy: `~/clawd/MODEL_STRATEGY.md`
- Session bloat prevention: `~/clawd/shared-context/session-bloat-prevention.md`
