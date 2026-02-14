# Khala Network Drift Policy

**Version:** 1.0  
**Date:** 2026-02-14  
**Status:** Active

## Overview

The Khala Network drift tracking system dynamically adjusts agent affinities based on real interactions, creating an evolving social fabric that reflects collaboration patterns, trust building, and conflict resolution.

## Drift Mechanism

### Core Principles

1. **Deterministic Rules**: Drift calculations are reproducible and transparent
2. **Bounded Range**: All affinity values remain within [0.10, 0.95]
3. **Incremental Change**: Small adjustments per interaction (±0.03 default)
4. **Historical Record**: Last 20 drift events per bond pair retained

### Input Sources

The drift engine pulls data from three primary tables:

- **`interaction_logs`**: Direct agent-to-agent interactions
- **`missions`**: Collaborative work outcomes
- **`escalations`**: Quality control and conflict resolution events

## Drift Triggers & Magnitudes

### 1. Collaboration Interactions

**Type:** `collaboration`  
**Source:** `interaction_logs` where `interaction_type = 'collaboration'`

| Outcome | Delta | Rationale |
|---------|-------|-----------|
| `success` | +0.03 | Successful teamwork builds trust |
| `neutral` | 0.00 | No change for routine collaboration |
| `failure` | -0.02 | Failed collaboration reduces confidence |

**Example:** Oracle and Archivist successfully collaborate on research → +0.03 affinity

### 2. Escalation Quality

**Type:** `escalation`  
**Source:** `escalations` table + `interaction_logs`

| Condition | Delta | Rationale |
|-----------|-------|-----------|
| Validated as real (`validated_as_real = TRUE`) | +0.04 | Good catch, trust increases |
| False positive (`validated_as_real = FALSE`) | -0.05 | Cry wolf penalty, trust decreases |
| Escalation resolved constructively | +0.02 | Problem-solving builds bonds |

**Example:** Sentinel escalates issue to Verifier, validated as real → +0.04 affinity

### 3. Handoff Smoothness

**Type:** `handoff`  
**Source:** `interaction_logs` where `interaction_type = 'handoff'`

| Outcome | Delta | Rationale |
|---------|-------|-----------|
| `success` | +0.03 | Clean handoffs show coordination |
| `neutral` | 0.00 | Standard transition |
| `failure` | -0.03 | Fumbled handoffs reduce trust |

**Example:** Echo smoothly hands off task to Archivist → +0.03 affinity

### 4. Conflict Resolution

**Type:** `conflict`  
**Source:** `interaction_logs` where `interaction_type = 'conflict'`

| Outcome | Delta | Rationale |
|---------|-------|-----------|
| `success` (resolved constructively) | +0.05 | Overcoming conflict strengthens bonds |
| `neutral` (stalemate) | -0.01 | Unresolved tension weakens slightly |
| `failure` (escalated negativity) | -0.04 | Poor conflict handling damages relationship |

**Example:** Oracle and Sentinel resolve disagreement constructively → +0.05 affinity

### 5. Mission-Based Drift

**Type:** Derived from `missions` table  
**Source:** Missions with multiple agents (requires mission metadata)

| Condition | Delta | Rationale |
|-----------|-------|-----------|
| Joint mission success | +0.03 | Shared victory builds camaraderie |
| Joint mission with high acceptance_rate (>0.9) | +0.04 | Quality work together |
| Joint mission failure | -0.02 | Shared failure strains relationship |

**Note:** Mission-based drift requires tracking which agents worked together. This will be logged via `interaction_logs` with `mission_id` reference.

## Configuration

### Default Parameters

```bash
# Base drift magnitude (scaled by interaction type)
DRIFT_BASE=0.03

# Affinity bounds
AFFINITY_MIN=0.10
AFFINITY_MAX=0.95

# History retention
DRIFT_HISTORY_RETENTION=20  # Keep last N records per bond pair

# Lookback window for processing
LOOKBACK_HOURS=24  # Default processing window
```

### Override Capabilities

Drift magnitudes can be overridden via environment variables:

```bash
DRIFT_COLLABORATION_SUCCESS=0.03
DRIFT_COLLABORATION_FAILURE=-0.02
DRIFT_ESCALATION_VALID=0.04
DRIFT_ESCALATION_FALSE=-0.05
DRIFT_HANDOFF_SUCCESS=0.03
DRIFT_HANDOFF_FAILURE=-0.03
DRIFT_CONFLICT_SUCCESS=0.05
DRIFT_CONFLICT_FAILURE=-0.04
```

## Processing Rules

### Idempotency

- Each interaction is processed exactly once
- Tracking via `interaction_logs.id` + last processed timestamp
- Re-running the drift script skips already-processed interactions

### Bond Normalization

- Interactions logged as (initiator, recipient) are normalized to (agent_a, agent_b) where agent_a < agent_b alphabetically
- This ensures consistent bond representation matching `khala_network` schema

### Boundary Enforcement

```python
new_affinity = max(0.10, min(0.95, current_affinity + delta))
```

No affinity can escape the [0.10, 0.95] range.

### History Pruning

After each drift update:
1. Count records in `khala_drift_history` for the bond pair
2. If count > 20, delete oldest records
3. Keep exactly last 20 events per pair

## Example Scenarios

### Scenario 1: Successful Collaboration Chain

**Events:**
1. Oracle and Archivist collaborate (success) → +0.03
2. They collaborate again (success) → +0.03
3. Oracle hands off to Archivist (success) → +0.03

**Total Drift:** +0.09 (from 0.80 to 0.89)

### Scenario 2: Escalation Penalty Recovery

**Events:**
1. Sentinel escalates to Verifier (false positive) → -0.05 (0.75 to 0.70)
2. Later, valid escalation → +0.04 (0.70 to 0.74)
3. They resolve a conflict together (success) → +0.05 (0.74 to 0.79)

**Net Drift:** +0.04 over time

### Scenario 3: Boundary Enforcement

**Events:**
1. Current affinity: 0.93
2. Successful collaboration (+0.03) would → 0.96
3. **Clamped to:** 0.95 (max boundary)

## Integration Points

### When to Log Interactions

1. **Agent spawn wrappers** - Log handoffs when spawning sub-agents
2. **Mission completion hooks** - Log collaboration outcomes
3. **Escalation handlers** - Log escalation validation results
4. **Conflict resolution** - Manual or automated logging

### Helper Script Usage

```bash
# Log a successful collaboration
~/clawd/scripts/log-interaction.sh oracle archivist collaboration success '{"mission_id":"abc-123"}'

# Log an escalation (validation handled separately)
~/clawd/scripts/log-interaction.sh sentinel verifier escalation neutral '{"issue":"data quality"}'

# Log a handoff
~/clawd/scripts/log-interaction.sh echo atlas handoff success
```

## Drift History Schema

Each drift record includes:

```sql
CREATE TABLE khala_drift_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_a TEXT NOT NULL,           -- Normalized: agent_a < agent_b
    agent_b TEXT NOT NULL,
    old_affinity REAL NOT NULL,      -- Affinity before drift
    new_affinity REAL NOT NULL,      -- Affinity after drift
    delta REAL NOT NULL,             -- Change amount
    reason TEXT NOT NULL,            -- Human-readable explanation
    interaction_type TEXT,           -- collaboration|escalation|handoff|conflict
    related_mission_id TEXT,         -- Optional mission reference
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## Monitoring & Debugging

### View Recent Drift

```bash
sqlite3 ~/clawd/agents/ventureos-rpg.db "
SELECT agent_a, agent_b, delta, reason, created_at 
FROM khala_drift_history 
ORDER BY created_at DESC 
LIMIT 10;
"
```

### Check Bond Health

```bash
sqlite3 ~/clawd/agents/ventureos-rpg.db "
SELECT agent_a, agent_b, affinity, interaction_count, last_interaction_at
FROM khala_network
WHERE affinity < 0.30 OR affinity > 0.90;
"
```

### Verify Processing

```bash
# Check for unprocessed interactions
sqlite3 ~/clawd/agents/ventureos-rpg.db "
SELECT COUNT(*) FROM interaction_logs 
WHERE created_at > datetime('now', '-24 hours');
"
```

## Future Enhancements

1. **Decay over time**: Unused bonds slowly drift toward neutral (0.50)
2. **Velocity tracking**: Rate of change as a signal
3. **Network effects**: Triadic closure influences (if A-B strong and B-C strong, boost A-C slightly)
4. **Seasonal patterns**: Weekly/monthly analysis of drift trends

## References

- **VOXYZ Pattern**: Drift tracking with ~20 record retention per pair
- **Database Schema**: `~/clawd/agents/ventureos-rpg.db`
- **Implementation**: `~/clawd/scripts/update-khala-drift.sh`
- **Test Suite**: `~/clawd/scripts/test-drift-scenarios.sh`

---

**Maintainer:** Oracle  
**Review Cycle:** Monthly or after major system changes
