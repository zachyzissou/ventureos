# VentureOS RPG: Memory → Protocol Integration Design

**Phase 2 Track 3: Observational Memory Integration**  
**Date:** 2026-02-14  
**Designer:** Archivist

---

## Overview

This document defines how observational memory patterns trigger personality protocol activations in the RPG system, enabling agents to evolve behavioral modifiers based on learned patterns.

**Core Principle:** Protocols activate when observational memory demonstrates consistent patterns, not just raw metrics.

---

## Architecture

```
┌──────────────────────┐
│ Observational Memory │  ~/.openclaw/workspace-archivist/observations/
│   (Markdown files)   │  - Daily observations
│   index.json         │  - Topics, tags, patterns
└──────────┬───────────┘
           │
           ▼
   [Pattern Analysis]
           │
           ▼
┌──────────────────────┐
│  Protocol Mapping    │  Pattern → Protocol rules
│   (This document)    │  - Trigger conditions
│                      │  - Agent-specific logic
└──────────┬───────────┘
           │
           ▼
   [Activation Logic]
           │
           ▼
┌──────────────────────┐
│ personality_         │  ~/clawd/agents/ventureos-rpg.db
│   activations table  │  - Active protocols
│                      │  - Trigger conditions
│                      │  - Activation timestamps
└──────────────────────┘
```

---

## Base Personality Protocols (All Agents)

### 1. `reference_outcomes`
**Description:** Cite past outcomes when making recommendations  
**Voice Change:** "Based on our previous work with X..." instead of starting from scratch

**Trigger Condition:**
```
observation_count ≥ 8 (per agent)
```

**Rationale:** Once an agent has 8+ documented observations, they have enough history to reference past work.

**Activation Logic:**
```sql
SELECT agent_id, COUNT(*) as obs_count
FROM (
    SELECT DISTINCT
        CASE 
            WHEN observation LIKE '%#' || 'oracle' || '%' THEN 'oracle'
            WHEN observation LIKE '%#' || 'atlas' || '%' THEN 'atlas'
            -- ... for all agents
        END as agent_id
    FROM observations_parsed
)
WHERE agent_id IS NOT NULL
GROUP BY agent_id
HAVING obs_count >= 8
```

**Example:**
- Oracle has 1 observation (2026-02-13) → Protocol NOT activated
- Archivist has 1 observation → Protocol NOT activated
- (Need more data accumulation)

---

### 2. `use_frameworks`
**Description:** Apply systematic approaches and frameworks  
**Voice Change:** TL;DR structure, structured analysis, consistent methodology

**Trigger Condition:**
```
pattern_frequency ≥ 6
  WHERE pattern IN ('debugging', 'ci_discipline', 'systematic_approach')
```

**Rationale:** Repeated successful use of systematic approaches indicates framework mastery.

**Activation Logic:**
```sql
-- Count observations with systematic approach patterns
SELECT agent_id, COUNT(*) as pattern_count
FROM observations_patterns
WHERE pattern_type IN (
    'debugging_systematic',
    'ci_testing_discipline',
    'infrastructure_monitoring',
    'priority_management',
    'cost_optimization_framework'
)
GROUP BY agent_id
HAVING pattern_count >= 6
```

**Current Candidates:**
- **Echo (implied):** 5 HomeKit/HA debugging observations (systematic troubleshooting)
- **Atlas:** 3 infrastructure observations (monitoring, CI validation)
- **Synth:** 1 CI discipline observation
- (Need more accumulation)

---

### 3. `show_confidence`
**Description:** Reduce hedging, show confidence in recommendations  
**Voice Change:** "Do X" instead of "You might consider X"

**Trigger Condition:**
```
completed_missions ≥ 10
  AND success_rate ≥ 0.8
```

**Rationale:** Consistent mission success builds justified confidence.

**Activation Logic:**
```sql
-- Requires mission tracking integration (future)
SELECT agent_id, 
       COUNT(*) as missions,
       AVG(CASE WHEN success = 1 THEN 1.0 ELSE 0.0 END) as success_rate
FROM missions
WHERE status = 'completed'
GROUP BY agent_id
HAVING missions >= 10 AND success_rate >= 0.8
```

**Status:** ⏳ Blocked on mission tracking (not yet integrated with observations)

---

### 4. `mentor_mode`
**Description:** Teach methodology, help improve team skills  
**Voice Change:** Explain reasoning, share lessons learned, document patterns

**Trigger Condition:**
```
rank ≥ 7
  OR (observation_count ≥ 20 AND knowledge_sharing_pattern ≥ 5)
```

**Rationale:** Senior agents (rank 7+) or those who consistently document/share knowledge should mentor.

**Activation Logic:**
```sql
-- Check rank
SELECT agent_id, rank
FROM psionic_ranks
WHERE rank >= 7

UNION

-- OR check knowledge sharing pattern
SELECT agent_id, COUNT(*) as knowledge_shares
FROM observations_patterns
WHERE pattern_type IN ('documentation', 'lesson_learned', 'policy_creation')
GROUP BY agent_id
HAVING knowledge_shares >= 5
```

**Current Candidates:**
- Nexus: Policy creation (1), Priority management (2) → 3 total (not yet qualified)

---

## Agent-Specific Quality Gate Protocols

### Oracle: Research & Foresight

#### `extended_search`
**Description:** Increase research depth for complex topics  
**Voice Change:** Include 3+ diverse sources, cross-reference domains

**Trigger Condition:**
```
research_depth_pattern ≥ 3
  AND source_diversity_score ≥ 0.7
```

**Activation Logic:**
```sql
-- Pattern: Observations showing research with multiple sources
SELECT agent_id, COUNT(*) as deep_research_count
FROM observations_patterns
WHERE agent_id = 'oracle'
  AND pattern_type = 'research_multi_source'
  AND metadata->>'source_count' >= 3
GROUP BY agent_id
HAVING deep_research_count >= 3
```

**Current Status:** No research observations yet → Not activated

#### `cite_precedents`
**Description:** Always reference past research on similar topics  
**Voice Change:** "As documented in [previous research]..."

**Trigger Condition:**
```
observation_count ≥ 5 (Oracle-specific)
  AND tags CONTAINS 'research'
```

**Activation Logic:**
```sql
SELECT COUNT(*) as research_obs
FROM observations_parsed
WHERE agent_id = 'oracle'
  AND tags LIKE '%#research%'
HAVING research_obs >= 5
```

**Current Status:** 1 observation → Not activated

---

### Atlas: Infrastructure & Reliability

#### `proactive_monitoring`
**Description:** Create monitoring before problems occur  
**Voice Change:** Always suggest monitoring/alerting when deploying

**Trigger Condition:**
```
monitoring_implementation_pattern ≥ 3
```

**Activation Logic:**
```sql
SELECT COUNT(*) as monitoring_implementations
FROM observations_patterns
WHERE agent_id = 'atlas'
  AND pattern_type IN ('monitoring_creation', 'health_check_implementation')
HAVING monitoring_implementations >= 3
```

**Current Candidates:**
- Atlas: Cron health check (1), CI validation (1), Infrastructure monitoring (implied) → ~2-3 patterns
- **Status:** Close to activation threshold

#### `defensive_deployment`
**Description:** Always include rollback plans and health checks  
**Voice Change:** Every deployment includes rollback procedure

**Trigger Condition:**
```
deployment_pattern ≥ 5
  AND zero_downtime_deployments ≥ 3
```

**Activation Logic:**
```sql
SELECT COUNT(*) as deployments,
       SUM(CASE WHEN metadata->>'downtime' = '0' THEN 1 ELSE 0 END) as zero_downtime
FROM observations_patterns
WHERE agent_id = 'atlas'
  AND pattern_type = 'deployment'
HAVING deployments >= 5 AND zero_downtime >= 3
```

**Current Status:** Insufficient deployment observations

---

### Sentinel: Quality Control & Escalation

#### `false_positive_cooldown`
**Description:** Increase evidence requirements after false positive streak  
**Voice Change:** "High confidence required" threshold raised

**Trigger Condition:**
```
false_positive_streak ≥ 3 (from escalations table)
```

**Activation Logic:**
```sql
-- Check recent escalation history
SELECT escalated_by,
       SUM(CASE WHEN validated_as_real = 0 THEN 1 ELSE 0 END) as false_positives,
       COUNT(*) as total_escalations
FROM escalations
WHERE escalated_by = 'sentinel'
  AND created_at >= date('now', '-30 days')
  AND validated_as_real IS NOT NULL
GROUP BY escalated_by
HAVING false_positives >= 3
```

**Current Status:** No escalation data yet → Not activated

#### `escalation_quality_mode`
**Description:** Prioritize signal-to-noise ratio over quantity  
**Voice Change:** Only escalate with strong evidence, document reasoning

**Trigger Condition:**
```
signal_ratio < 0.7 (from escalations table)
```

**Activation Logic:**
```sql
SELECT escalated_by,
       CAST(SUM(CASE WHEN validated_as_real = 1 THEN 1 ELSE 0 END) AS REAL) / COUNT(*) as signal_ratio
FROM escalations
WHERE escalated_by = 'sentinel'
  AND validated_as_real IS NOT NULL
  AND created_at >= date('now', '-30 days')
GROUP BY escalated_by
HAVING signal_ratio < 0.7
```

**Current Status:** No escalation data yet → Not activated

---

### Synth: Development & Creation

#### `test_first_discipline`
**Description:** Always write/verify tests before considering work complete  
**Voice Change:** "Tests passing" becomes mandatory completion criterion

**Trigger Condition:**
```
ci_discipline_pattern ≥ 5
  AND pipeline_health_score ≥ 0.9
```

**Activation Logic:**
```sql
SELECT COUNT(*) as ci_events,
       AVG(CASE WHEN metadata->>'pipeline_status' = 'green' THEN 1.0 ELSE 0.0 END) as health_score
FROM observations_patterns
WHERE agent_id = 'synth'
  AND pattern_type IN ('ci_pipeline', 'test_suite', 'mr_validation')
HAVING ci_events >= 5 AND health_score >= 0.9
```

**Current Candidates:**
- Synth: 1 observation (jav-library-sprint2, 100 tests passed) → 1/5 needed

#### `code_review_checklist`
**Description:** Enforce systematic code review standards  
**Voice Change:** Always check (tests, docs, CI, rollback plan)

**Trigger Condition:**
```
code_review_pattern ≥ 10
  AND approval_accuracy ≥ 0.85
```

**Activation Logic:**
```sql
-- Requires mission/review tracking integration
SELECT COUNT(*) as reviews,
       AVG(approval_accuracy) as avg_accuracy
FROM missions
WHERE agent_id = 'synth'
  AND mission_type = 'code_review'
HAVING reviews >= 10 AND avg_accuracy >= 0.85
```

**Current Status:** ⏳ Blocked on mission tracking

---

### Nexus: Mission Control & Coordination

#### `autonomous_delegation`
**Description:** Delegate without asking when priorities are clear  
**Voice Change:** "Dispatching sub-agent for X" instead of "Should I...?"

**Trigger Condition:**
```
delegation_pattern ≥ 5
  AND delegation_success_rate ≥ 0.8
```

**Activation Logic:**
```sql
SELECT COUNT(*) as delegations,
       AVG(CASE WHEN outcome = 'success' THEN 1.0 ELSE 0.0 END) as success_rate
FROM observations_patterns
WHERE agent_id = 'nexus'
  AND pattern_type IN ('priority_handoff', 'sub_agent_dispatch')
HAVING delegations >= 5 AND success_rate >= 0.8
```

**Current Candidates:**
- Nexus: 2 priority/delegation observations → 2/5 needed

#### `priority_stack_enforcement`
**Description:** Always organize work into P0/P1/P2 tiers  
**Voice Change:** Every session starts with priority assessment

**Trigger Condition:**
```
priority_management_pattern ≥ 8
```

**Activation Logic:**
```sql
SELECT COUNT(*) as priority_events
FROM observations_patterns
WHERE agent_id = 'nexus'
  AND pattern_type IN ('priority_stack', 'priority_handoff', 'p0_escalation')
HAVING priority_events >= 8
```

**Current Candidates:**
- Nexus: 2 priority observations → 2/8 needed

---

### Archivist: Memory & Documentation

#### `proactive_documentation`
**Description:** Document decisions and context without being asked  
**Voice Change:** Always create/update docs after significant work

**Trigger Condition:**
```
documentation_pattern ≥ 5
```

**Activation Logic:**
```sql
SELECT COUNT(*) as doc_events
FROM observations_patterns
WHERE agent_id = 'archivist'
  AND pattern_type IN ('documentation_creation', 'policy_update', 'audit_report')
HAVING doc_events >= 5
```

**Current Candidates:**
- Archivist: 1 observation (memory cron debugging) → 1/5 needed

#### `pattern_extraction`
**Description:** Actively identify and document recurring patterns  
**Voice Change:** "I notice pattern X occurring..." insights

**Trigger Condition:**
```
pattern_identification_count ≥ 8
```

**Activation Logic:**
```sql
SELECT COUNT(*) as pattern_identifications
FROM observations_patterns
WHERE agent_id = 'archivist'
  AND metadata->>'type' = 'pattern_identified'
HAVING pattern_identifications >= 8
```

**Current Status:** Need to enhance observations with explicit pattern identification markers

---

### Verifier: Validation & Compliance

#### `context_requirement_enforcement`
**Description:** Require full context before approving  
**Voice Change:** "Need X, Y, Z before I can approve"

**Trigger Condition:**
```
approval_accuracy ≥ 0.9
  AND review_count ≥ 20
```

**Activation Logic:**
```sql
SELECT COUNT(*) as reviews,
       AVG(approval_accuracy) as accuracy
FROM missions
WHERE agent_id = 'verifier'
  AND mission_type IN ('approval', 'validation')
HAVING reviews >= 20 AND accuracy >= 0.9
```

**Current Status:** ⏳ Blocked on mission tracking

---

## Protocol Activation Workflow

### Daily Sync Process

1. **Parse Observations** (from observational memory files)
   ```bash
   # Extract agent-tagged observations
   rg "#(oracle|atlas|nexus|synth|archivist|sentinel|verifier)" \
      ~/.openclaw/workspace-archivist/observations/ \
      --json > /tmp/agent-observations.jsonl
   ```

2. **Count Patterns** (by agent)
   ```bash
   # Pattern frequency analysis
   jq -r '.tags[]' ~/.openclaw/workspace-archivist/observations/index.json \
      | sort | uniq -c | sort -rn
   ```

3. **Evaluate Triggers** (check each protocol condition)
   ```sql
   -- For each agent, check if thresholds met
   SELECT agent_id, protocol_id, trigger_met
   FROM protocol_evaluation_results
   WHERE trigger_met = 1
   ```

4. **Update Activations** (insert/deactivate in DB)
   ```sql
   -- Activate new protocols
   INSERT INTO personality_activations (agent_id, protocol_id, protocol_type, trigger_condition)
   VALUES ('oracle', 'reference_outcomes', 'base', '{"observation_count": 8}')
   ON CONFLICT DO NOTHING;
   
   -- Deactivate protocols no longer meeting threshold
   UPDATE personality_activations
   SET deactivated_at = CURRENT_TIMESTAMP
   WHERE agent_id = 'oracle' 
     AND protocol_id = 'extended_search'
     AND deactivated_at IS NULL
     AND -- condition no longer met;
   ```

5. **Log Rationale** (for debugging/auditing)
   ```
   [2026-02-14 06:00] Oracle: Activated 'reference_outcomes' (observation_count: 8 >= 8)
   [2026-02-14 06:00] Atlas: Activated 'proactive_monitoring' (monitoring_pattern: 3 >= 3)
   ```

---

## Implementation Priority

### Phase 1: Simple Triggers (Immediate)

**Protocols to implement first:**
1. `reference_outcomes` — Simple observation count
2. `use_frameworks` — Tag frequency count
3. `proactive_monitoring` (Atlas) — Pattern count

**Why:** These require only observational memory parsing, no mission tracking.

### Phase 2: Mission Integration (Week 2)

**Protocols requiring mission tracking:**
1. `show_confidence` — Needs success rate
2. `code_review_checklist` — Needs approval accuracy
3. `autonomous_delegation` — Needs delegation outcomes

**Blocker:** Mission tracking not yet integrated with observations

### Phase 3: Escalation Integration (Week 3)

**Protocols requiring escalation data:**
1. `false_positive_cooldown` (Sentinel)
2. `escalation_quality_mode` (Sentinel)

**Blocker:** No escalation records yet

---

## Example Scenarios

### Scenario 1: Oracle Research Pattern

**Observations:**
- 2026-02-13: Cost optimization research (1)
- 2026-02-15: API comparison research (2)
- 2026-02-18: Database selection research (3)
- 2026-02-20: Authentication architecture research (4)
- 2026-02-22: Deployment strategy research (5)

**Trigger Check:**
- `cite_precedents` threshold: 5 observations → **✅ ACTIVATED**

**Result:**
```sql
INSERT INTO personality_activations 
  (agent_id, protocol_id, protocol_type, trigger_condition, activated_at)
VALUES 
  ('oracle', 'cite_precedents', 'quality_gate', '{"research_observations": 5}', '2026-02-22 06:00:00');
```

**Voice Change:** Oracle now says:
> "As documented in our February 13 cost analysis, AWS pricing favors..."

instead of starting from scratch.

---

### Scenario 2: Atlas Monitoring Pattern

**Observations:**
- 2026-02-12: Cron health check implementation (1)
- 2026-02-13: CI pipeline validation (2)
- 2026-02-15: Database backup monitoring (3)

**Trigger Check:**
- `proactive_monitoring` threshold: 3 patterns → **✅ ACTIVATED**

**Result:**
```sql
INSERT INTO personality_activations 
  (agent_id, protocol_id, protocol_type, trigger_condition, activated_at)
VALUES 
  ('atlas', 'proactive_monitoring', 'quality_gate', '{"monitoring_implementations": 3}', '2026-02-15 06:00:00');
```

**Voice Change:** Atlas now includes monitoring setup in every deployment:
> "Deployment plan: 1) Deploy service, 2) Add health check endpoint, 3) Create alerting rule"

---

### Scenario 3: Nexus Delegation Pattern

**Observations:**
- 2026-02-13: Priority handoff (P0/P1/P2) (1)
- 2026-02-15: Sub-agent dispatch (observational-memory task) (2)
- 2026-02-17: Autonomous delegation (antfarm spike) (3)
- 2026-02-19: Priority escalation (P0 triage) (4)
- 2026-02-21: Multi-agent coordination (5)

**Trigger Check:**
- `autonomous_delegation` threshold: 5 delegations, success rate ≥ 0.8 → **✅ ACTIVATED** (if 4/5 succeeded)

**Result:**
```sql
INSERT INTO personality_activations 
  (agent_id, protocol_id, protocol_type, trigger_condition, activated_at)
VALUES 
  ('nexus', 'autonomous_delegation', 'quality_gate', '{"delegations": 5, "success_rate": 0.8}', '2026-02-21 06:00:00');
```

**Voice Change:** Nexus stops asking permission:
> "Dispatching Atlas for infrastructure health check. P1 items proceeding."

instead of:
> "Should I create a sub-agent to handle this?"

---

## Deactivation Logic

**Protocols can deactivate if:**

1. **Pattern frequency drops** below threshold
   - Example: Atlas stops doing monitoring implementations for 60 days
   - `proactive_monitoring` deactivates

2. **Quality metrics decline**
   - Example: Sentinel's signal ratio drops to 0.5
   - `escalation_quality_mode` activates (inverting the trigger)

3. **Explicit reset** (manual)
   - Admin can deactivate protocols via direct DB update

**Deactivation Query:**
```sql
-- Example: Deactivate if observation count drops below threshold
UPDATE personality_activations
SET deactivated_at = CURRENT_TIMESTAMP
WHERE agent_id = 'oracle'
  AND protocol_id = 'reference_outcomes'
  AND deactivated_at IS NULL
  AND (
    SELECT COUNT(*) FROM observations_parsed WHERE agent_id = 'oracle'
  ) < 8;
```

---

## Testing Strategy

### Unit Tests (Per Protocol)

```bash
# Test reference_outcomes activation
# Given: Oracle has 8 observations
# When: Sync script runs
# Then: personality_activations should contain oracle + reference_outcomes

# Test deactivation
# Given: Atlas monitoring_pattern drops to 2
# When: Sync script runs
# Then: proactive_monitoring should be deactivated
```

### Integration Test (Full Sync)

```bash
# Given: Fresh observations with known patterns
# When: sync-memory-to-rpg.sh runs
# Then: All expected protocols should activate
#       All expired protocols should deactivate
#       Rationale should be logged
```

---

## Monitoring & Observability

### Daily Metrics

```sql
-- Active protocols per agent
SELECT agent_id, COUNT(*) as active_protocols
FROM personality_activations
WHERE deactivated_at IS NULL
GROUP BY agent_id;

-- Recent activations (last 7 days)
SELECT agent_id, protocol_id, activated_at
FROM personality_activations
WHERE activated_at >= date('now', '-7 days')
ORDER BY activated_at DESC;

-- Protocol churn (activations + deactivations last 30 days)
SELECT protocol_id,
       SUM(CASE WHEN activated_at >= date('now', '-30 days') THEN 1 ELSE 0 END) as activations,
       SUM(CASE WHEN deactivated_at >= date('now', '-30 days') THEN 1 ELSE 0 END) as deactivations
FROM personality_activations
GROUP BY protocol_id;
```

---

## Future Enhancements

1. **Pattern extraction automation** — ML/heuristic-based pattern detection
2. **Cross-agent pattern detection** — Identify collaboration patterns
3. **Protocol effectiveness tracking** — Did activation improve outcomes?
4. **Dynamic threshold tuning** — Adjust thresholds based on agent maturity
5. **Protocol dependencies** — Some protocols unlock others

---

## Files & References

**Documentation:**
- `rpg-memory-audit.md` — Current observational memory state
- `rpg-master-guide.md` — Protocol definitions
- `rpg-database-schema.md` — Table structure

**Data Sources:**
- `~/.openclaw/workspace-archivist/observations/` — Observational memory
- `~/clawd/agents/ventureos-rpg.db` → `personality_activations` table

**Scripts:**
- `sync-memory-to-rpg.sh` (to be created) — Daily sync logic

---

**Status:** Design Complete  
**Next Step:** Implement sync-memory-to-rpg.sh  
**Owner:** Archivist (Phase 2 Track 3)
