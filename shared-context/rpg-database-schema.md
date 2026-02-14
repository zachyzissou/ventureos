# VentureOS RPG Database Schema
## SQLite Design (Phase 1-2)

**Inspired by:** [VOXYZ_AI Supabase approach](https://x.com/Voxyz_ai/status/2021370776926990530)

**Last Updated:** 2026-02-14  
**Database Location:** `~/clawd/agents/ventureos-rpg.db`

---

## Architecture Overview

### Static (Git-Versioned)
**Location:** `~/clawd/agents/`
- `tactical-overlays/*.json` — Protoss unit mappings, role definitions
- `personality-protocols/*.json` — Quality gates, modifier rules
- `schemas/*.json` — JSON schemas for validation
- `khala-network-seed.json` — Initial bond values (28 pairs)

### Dynamic (SQLite Database)
**Location:** `~/clawd/agents/ventureos-rpg.db`
- Psionic attribute snapshots (daily)
- Psionic rank progression
- Khala Network bond state + drift history
- Personality protocol activations
- Interaction logs

---

## VOXYZ Reference Architecture

**Their approach (Supabase/Postgres):**

```typescript
// Static config in code
const ROLE_CARDS = {
  'twitter-alt': {
    domain: 'Social distribution',
    inputs: [...],
    outputs: [...],
    hardBans: [...],
    metrics: [...]
  }
}

// Dynamic data in database
ops_agent_memory        // Memory entries
ops_tweet_drafts        // Outputs
ops_tweet_metrics       // Performance (engagement_rate, impressions)
ops_missions            // Task tracking
ops_mission_steps       // Completion tracking
ops_agent_relationships // Affinity matrix with drift
```

**Key patterns we're adopting:**
1. **Separation:** Config = code, State = database
2. **Snapshots:** Daily stats with 7-day baseline
3. **History:** Keep drift/activation logs for analysis
4. **API layer:** Frontend queries DB, never reads JSON files directly

---

## Schema Design (8 Tables)

### Table 1: `psionic_stats`
**Purpose:** Daily attribute snapshots (equivalent to VOXYZ `ops_tweet_metrics`)

```sql
CREATE TABLE psionic_stats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_id TEXT NOT NULL,              -- oracle, atlas, sentinel, etc.
    snapshot_date DATE NOT NULL,         -- YYYY-MM-DD
    
    -- Psionic Attributes (0-100 scale)
    psionic_mastery INTEGER,             -- WIS
    energy INTEGER,                      -- SPD
    shields INTEGER,                     -- TRU
    warp_technology INTEGER,             -- CRE
    psi_reach INTEGER,                   -- RCH
    
    -- Raw metric inputs (for formula debugging)
    memory_count INTEGER,
    unique_domains INTEGER,
    canonical_edits INTEGER,
    p95_latency_s REAL,
    mttr_minutes REAL,
    acceptance_rate REAL,
    success_rate REAL,
    approval_accuracy REAL,
    tasks_completed INTEGER,
    warp_tech_inputs TEXT,               -- JSON metric bundle used for CRE/Warp Tech debugging
    
    -- Metadata
    calculated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints (NULL-safe in SQLite CHECK semantics)
    CHECK(psionic_mastery >= 0 AND psionic_mastery <= 100),
    CHECK(energy >= 0 AND energy <= 100),
    CHECK(shields >= 0 AND shields <= 100),
    CHECK(warp_technology >= 0 AND warp_technology <= 100),
    CHECK(psi_reach >= 0 AND psi_reach <= 100),
    CHECK(acceptance_rate >= 0 AND acceptance_rate <= 1),
    CHECK(success_rate >= 0 AND success_rate <= 1),
    CHECK(approval_accuracy >= 0 AND approval_accuracy <= 1),
    
    UNIQUE(agent_id, snapshot_date)
);

CREATE INDEX idx_stats_agent_date ON psionic_stats(agent_id, snapshot_date DESC);
```

**VOXYZ equivalent:** `ops_tweet_metrics` (engagement_rate, impressions, viral score)

---

### Table 2: `psionic_ranks`
**Purpose:** Rank/level progression tracking

```sql
CREATE TABLE psionic_ranks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_id TEXT NOT NULL,
    
    -- Current state
    rank INTEGER NOT NULL,               -- 1-15
    xp INTEGER NOT NULL,                 -- Total XP
    xp_from_memory INTEGER,              -- XP breakdown
    xp_from_missions INTEGER,
    next_rank_at INTEGER,                -- XP needed for next level
    
    -- Timestamps
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    rank_achieved_at TIMESTAMP,          -- When current rank was reached
    
    UNIQUE(agent_id)
);

CREATE INDEX idx_ranks_agent ON psionic_ranks(agent_id);
```

**VOXYZ equivalent:** Derived from `ops_agent_memory` + `ops_missions` count

---

### Table 3: `khala_network`
**Purpose:** Current bond strengths (equivalent to VOXYZ `ops_agent_relationships`)

```sql
CREATE TABLE khala_network (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_a TEXT NOT NULL,               -- Alphabetically first
    agent_b TEXT NOT NULL,               -- Alphabetically second
    
    -- Bond state
    affinity REAL NOT NULL,              -- 0.10 - 0.95
    seed_value REAL NOT NULL,            -- Original value from khala-network-seed.json
    
    -- Metadata
    last_interaction_at TIMESTAMP,
    interaction_count INTEGER DEFAULT 0,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(agent_a, agent_b),
    CHECK(agent_a < agent_b),            -- Enforce alphabetical order
    CHECK(affinity >= 0.10 AND affinity <= 0.95)
);

CREATE INDEX idx_khala_agents ON khala_network(agent_a, agent_b);
CREATE INDEX idx_khala_updated ON khala_network(updated_at DESC);
```

**VOXYZ equivalent:** `ops_agent_relationships` (affinity, drift tracking)

---

### Table 4: `khala_drift_history`
**Purpose:** Bond change log for auditing

```sql
CREATE TABLE khala_drift_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_a TEXT NOT NULL,
    agent_b TEXT NOT NULL,
    
    -- Drift event
    old_affinity REAL NOT NULL,
    new_affinity REAL NOT NULL,
    delta REAL NOT NULL,                 -- Usually ±0.03
    reason TEXT NOT NULL,                -- 'handoff_success', 'handoff_failure', etc.
    
    -- Context
    interaction_type TEXT,               -- 'collaboration', 'conflict', 'escalation'
    related_mission_id TEXT,             -- Optional link to mission
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_drift_agents ON khala_drift_history(agent_a, agent_b, created_at DESC);
CREATE INDEX idx_drift_date ON khala_drift_history(created_at DESC);
```

**VOXYZ equivalent:** `pairwise_drift` array in extraction output (logged but not fully persisted)

---

### Table 5: `personality_activations`
**Purpose:** Protocol modifier activation log

```sql
CREATE TABLE personality_activations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_id TEXT NOT NULL,
    
    -- Protocol details
    protocol_id TEXT NOT NULL,           -- 'reference_outcomes', 'false_positive_cooldown', etc.
    protocol_type TEXT NOT NULL,         -- 'base', 'quality_gate'
    
    -- Trigger state
    trigger_condition TEXT,              -- JSON: {"memory_count": 8}
    activated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deactivated_at TIMESTAMP,            -- NULL if still active
    
    -- Context
    mission_id TEXT,                     -- What mission triggered it
    
    UNIQUE(agent_id, protocol_id, activated_at)
);

CREATE INDEX idx_activations_agent ON personality_activations(agent_id, activated_at DESC);
CREATE INDEX idx_activations_active ON personality_activations(agent_id) WHERE deactivated_at IS NULL;
```

**VOXYZ equivalent:** Not explicitly tracked, but similar to memory extraction triggers

---

### Table 6: `interaction_logs`
**Purpose:** Agent-to-agent interaction tracking (for affinity updates)

```sql
CREATE TABLE interaction_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    
    -- Participants
    initiator_agent TEXT NOT NULL,
    recipient_agent TEXT NOT NULL,
    
    -- Interaction details
    interaction_type TEXT NOT NULL,      -- 'handoff', 'collaboration', 'escalation', 'conflict'
    outcome TEXT NOT NULL,               -- 'success', 'failure', 'neutral'
    
    -- Context
    mission_id TEXT,
    session_id TEXT,
    description TEXT,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_interactions_agents ON interaction_logs(initiator_agent, recipient_agent, created_at DESC);
CREATE INDEX idx_interactions_date ON interaction_logs(created_at DESC);
```

**VOXYZ equivalent:** Derived from `ops_mission_steps` + session logs

---

### Table 7: `escalations` 
**Purpose:** Sentinel escalation quality tracking

```sql
CREATE TABLE escalations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    
    -- Escalation details
    escalated_by TEXT NOT NULL,          -- Usually 'sentinel'
    escalated_to TEXT NOT NULL,          -- Usually 'echo'
    issue_description TEXT NOT NULL,
    severity TEXT,                       -- 'low', 'medium', 'high', 'critical'
    
    -- Validation
    validated_as_real BOOLEAN,           -- Did it turn out to be a real issue?
    validated_at TIMESTAMP,
    validated_by TEXT,                   -- Who confirmed/denied
    
    -- Context
    mission_id TEXT,
    related_agent TEXT,                  -- Agent whose work was escalated
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP,

    CHECK(severity IN ('low', 'medium', 'high', 'critical'))
);

CREATE INDEX idx_escalations_sentinel ON escalations(escalated_by, created_at DESC);
CREATE INDEX idx_escalations_validation ON escalations(validated_as_real, created_at DESC);
```

**VOXYZ equivalent:** Custom addition (not in VOXYZ system, specific to Sentinel role)

---

### Table 8: `missions`
**Purpose:** Mission completion tracking (equivalent to VOXYZ `ops_missions`)

```sql
CREATE TABLE missions (
    id TEXT PRIMARY KEY,                 -- UUID or sequential
    agent_id TEXT NOT NULL,
    
    -- Mission details
    mission_type TEXT,                   -- 'research', 'deployment', 'verification', etc.
    description TEXT,
    status TEXT NOT NULL,                -- 'in_progress', 'completed', 'failed'
    
    -- Timing
    started_at TIMESTAMP NOT NULL,
    completed_at TIMESTAMP,
    duration_seconds INTEGER,
    
    -- Outcomes
    success BOOLEAN,
    acceptance_rate REAL,                -- If applicable (e.g., code review)
    rework_required BOOLEAN,
    
    -- XP contribution
    xp_awarded INTEGER DEFAULT 3,       -- Configurable

    CHECK(status IN ('in_progress', 'completed', 'failed'))
);

CREATE INDEX idx_missions_agent ON missions(agent_id, completed_at DESC);
CREATE INDEX idx_missions_status ON missions(status, agent_id);
```

**VOXYZ equivalent:** `ops_missions` + `ops_mission_steps`

---

## Migration Script

**File:** `~/clawd/scripts/init-rpg-database.sh`

```bash
#!/bin/bash
# Initialize VentureOS RPG SQLite database

DB_PATH="$HOME/clawd/agents/ventureos-rpg.db"

# Backup existing if present
if [ -f "$DB_PATH" ]; then
    cp "$DB_PATH" "$DB_PATH.backup.$(date +%Y%m%d-%H%M%S)"
fi

# Create database with schema
sqlite3 "$DB_PATH" <<'SQL'
-- Table 1: psionic_stats
CREATE TABLE IF NOT EXISTS psionic_stats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_id TEXT NOT NULL,
    snapshot_date DATE NOT NULL,
    psionic_mastery INTEGER,
    energy INTEGER,
    shields INTEGER,
    warp_technology INTEGER,
    psi_reach INTEGER,
    memory_count INTEGER,
    unique_domains INTEGER,
    canonical_edits INTEGER,
    p95_latency_s REAL,
    mttr_minutes REAL,
    acceptance_rate REAL,
    success_rate REAL,
    approval_accuracy REAL,
    tasks_completed INTEGER,
    warp_tech_inputs TEXT,
    calculated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CHECK(psionic_mastery >= 0 AND psionic_mastery <= 100),
    CHECK(energy >= 0 AND energy <= 100),
    CHECK(shields >= 0 AND shields <= 100),
    CHECK(warp_technology >= 0 AND warp_technology <= 100),
    CHECK(psi_reach >= 0 AND psi_reach <= 100),
    CHECK(acceptance_rate >= 0 AND acceptance_rate <= 1),
    CHECK(success_rate >= 0 AND success_rate <= 1),
    CHECK(approval_accuracy >= 0 AND approval_accuracy <= 1),

    UNIQUE(agent_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_stats_agent_date ON psionic_stats(agent_id, snapshot_date DESC);

-- Table 2: psionic_ranks
CREATE TABLE IF NOT EXISTS psionic_ranks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_id TEXT NOT NULL,
    rank INTEGER NOT NULL,
    xp INTEGER NOT NULL,
    xp_from_memory INTEGER,
    xp_from_missions INTEGER,
    next_rank_at INTEGER,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    rank_achieved_at TIMESTAMP,
    UNIQUE(agent_id)
);

CREATE INDEX IF NOT EXISTS idx_ranks_agent ON psionic_ranks(agent_id);

-- Table 3: khala_network
CREATE TABLE IF NOT EXISTS khala_network (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_a TEXT NOT NULL,
    agent_b TEXT NOT NULL,
    affinity REAL NOT NULL,
    seed_value REAL NOT NULL,
    last_interaction_at TIMESTAMP,
    interaction_count INTEGER DEFAULT 0,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(agent_a, agent_b),
    CHECK(agent_a < agent_b),
    CHECK(affinity >= 0.10 AND affinity <= 0.95)
);

CREATE INDEX IF NOT EXISTS idx_khala_agents ON khala_network(agent_a, agent_b);
CREATE INDEX IF NOT EXISTS idx_khala_updated ON khala_network(updated_at DESC);

-- Table 4: khala_drift_history
CREATE TABLE IF NOT EXISTS khala_drift_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_a TEXT NOT NULL,
    agent_b TEXT NOT NULL,
    old_affinity REAL NOT NULL,
    new_affinity REAL NOT NULL,
    delta REAL NOT NULL,
    reason TEXT NOT NULL,
    interaction_type TEXT,
    related_mission_id TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_drift_agents ON khala_drift_history(agent_a, agent_b, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_drift_date ON khala_drift_history(created_at DESC);

-- Table 5: personality_activations
CREATE TABLE IF NOT EXISTS personality_activations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_id TEXT NOT NULL,
    protocol_id TEXT NOT NULL,
    protocol_type TEXT NOT NULL,
    trigger_condition TEXT,
    activated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deactivated_at TIMESTAMP,
    mission_id TEXT,
    UNIQUE(agent_id, protocol_id, activated_at)
);

CREATE INDEX IF NOT EXISTS idx_activations_agent ON personality_activations(agent_id, activated_at DESC);
CREATE INDEX IF NOT EXISTS idx_activations_active ON personality_activations(agent_id) WHERE deactivated_at IS NULL;

-- Table 6: interaction_logs
CREATE TABLE IF NOT EXISTS interaction_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    initiator_agent TEXT NOT NULL,
    recipient_agent TEXT NOT NULL,
    interaction_type TEXT NOT NULL,
    outcome TEXT NOT NULL,
    mission_id TEXT,
    session_id TEXT,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_interactions_agents ON interaction_logs(initiator_agent, recipient_agent, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_interactions_date ON interaction_logs(created_at DESC);

-- Table 7: escalations
CREATE TABLE IF NOT EXISTS escalations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    escalated_by TEXT NOT NULL,
    escalated_to TEXT NOT NULL,
    issue_description TEXT NOT NULL,
    severity TEXT, -- 'low', 'medium', 'high', 'critical'
    validated_as_real BOOLEAN,
    validated_at TIMESTAMP,
    validated_by TEXT,
    mission_id TEXT,
    related_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP,

    CHECK(severity IN ('low', 'medium', 'high', 'critical'))
);

CREATE INDEX IF NOT EXISTS idx_escalations_sentinel ON escalations(escalated_by, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_escalations_validation ON escalations(validated_as_real, created_at DESC);

-- Table 8: missions
CREATE TABLE IF NOT EXISTS missions (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL,
    mission_type TEXT,
    description TEXT,
    status TEXT NOT NULL,
    started_at TIMESTAMP NOT NULL,
    completed_at TIMESTAMP,
    duration_seconds INTEGER,
    success BOOLEAN,
    acceptance_rate REAL,
    rework_required BOOLEAN,
    xp_awarded INTEGER DEFAULT 3,

    CHECK(status IN ('in_progress', 'completed', 'failed'))
);

CREATE INDEX IF NOT EXISTS idx_missions_agent ON missions(agent_id, completed_at DESC);
CREATE INDEX IF NOT EXISTS idx_missions_status ON missions(status, agent_id);

SQL

echo "✅ Database initialized at: $DB_PATH"
sqlite3 "$DB_PATH" "SELECT 'Tables created: ' || COUNT(*) FROM sqlite_master WHERE type='table';"
```

---

## Seed Data Script

**File:** `~/clawd/scripts/seed-khala-network.sh`

```bash
#!/bin/bash
# Seed Khala Network from khala-network-seed.json

DB_PATH="$HOME/clawd/agents/ventureos-rpg.db"
SEED_FILE="$HOME/clawd/agents/khala-network-seed.json"

# Read seed file and insert into database
# (This would use jq + sqlite3 to parse JSON and insert)

# Example for one bond:
sqlite3 "$DB_PATH" <<SQL
INSERT INTO khala_network (agent_a, agent_b, affinity, seed_value, interaction_count)
VALUES
  -- Fully-connected 8-agent Khala Network (C(8,2) = 28 bonds)
  ('archivist', 'atlas', 0.80, 0.80, 0),
  ('archivist', 'echo', 0.75, 0.75, 0),
  ('archivist', 'nexus', 0.75, 0.75, 0),
  ('archivist', 'oracle', 0.80, 0.80, 0),
  ('archivist', 'sentinel', 0.80, 0.80, 0),
  ('archivist', 'synth', 0.65, 0.65, 0),
  ('archivist', 'verifier', 0.80, 0.80, 0),

  ('atlas', 'echo', 0.70, 0.70, 0),
  ('atlas', 'nexus', 0.70, 0.70, 0),
  ('atlas', 'oracle', 0.70, 0.70, 0),
  ('atlas', 'sentinel', 0.70, 0.70, 0),
  ('atlas', 'synth', 0.55, 0.55, 0),
  ('atlas', 'verifier', 0.75, 0.75, 0),

  ('echo', 'nexus', 0.85, 0.85, 0),
  ('echo', 'oracle', 0.80, 0.80, 0),
  ('echo', 'sentinel', 0.75, 0.75, 0),
  ('echo', 'synth', 0.65, 0.65, 0),
  ('echo', 'verifier', 0.75, 0.75, 0),

  ('nexus', 'oracle', 0.80, 0.80, 0),
  ('nexus', 'sentinel', 0.75, 0.75, 0),
  ('nexus', 'synth', 0.65, 0.65, 0),
  ('nexus', 'verifier', 0.75, 0.75, 0),

  ('oracle', 'sentinel', 0.65, 0.65, 0),
  ('oracle', 'synth', 0.60, 0.60, 0),
  ('oracle', 'verifier', 0.80, 0.80, 0),

  ('sentinel', 'synth', 0.40, 0.40, 0),
  ('sentinel', 'verifier', 0.85, 0.85, 0),

  ('synth', 'verifier', 0.65, 0.65, 0)
ON CONFLICT(agent_a, agent_b) DO NOTHING;
SQL

echo "✅ Khala Network seeded with 28 bonds"
```

---

## Query Examples

### Get Current Stats for Agent
```sql
SELECT 
    agent_id,
    psionic_mastery,
    energy,
    shields,
    warp_technology,
    psi_reach,
    snapshot_date
FROM psionic_stats
WHERE agent_id = 'oracle'
ORDER BY snapshot_date DESC
LIMIT 1;
```

### Extract Warp Tech Inputs (JSON)
```sql
SELECT
    agent_id,
    snapshot_date,
    CAST(json_extract(warp_tech_inputs, '$.atlas.deployments_30d') AS INTEGER) AS atlas_deployments_30d,
    CAST(json_extract(warp_tech_inputs, '$.atlas.zero_downtime') AS INTEGER) AS atlas_zero_downtime_30d,
    CAST(json_extract(warp_tech_inputs, '$.oracle.citations') AS INTEGER) AS oracle_citations_30d,
    CAST(json_extract(warp_tech_inputs, '$.oracle.source_quality') AS REAL) AS oracle_source_quality,
    CAST(json_extract(warp_tech_inputs, '$.sentinel.escalations') AS INTEGER) AS sentinel_escalations_30d,
    CAST(json_extract(warp_tech_inputs, '$.sentinel.signal_ratio') AS REAL) AS sentinel_signal_ratio
FROM psionic_stats
WHERE agent_id = 'oracle'
ORDER BY snapshot_date DESC
LIMIT 1;
```

### Get 7-Day Baseline
```sql
SELECT 
    agent_id,
    AVG(psionic_mastery) as avg_mastery,
    AVG(energy) as avg_energy,
    AVG(shields) as avg_shields
FROM psionic_stats
WHERE snapshot_date >= date('now', '-7 days')
GROUP BY agent_id;
```

### Get Khala Network Bonds for Agent
```sql
SELECT 
    CASE 
        WHEN agent_a = 'oracle' THEN agent_b
        ELSE agent_a
    END as other_agent,
    affinity,
    seed_value,
    (affinity - seed_value) as drift,
    interaction_count
FROM khala_network
WHERE agent_a = 'oracle' OR agent_b = 'oracle'
ORDER BY affinity DESC;
```

### Get Drift History for Bond
```sql
SELECT 
    old_affinity,
    new_affinity,
    delta,
    reason,
    created_at
FROM khala_drift_history
WHERE (agent_a = 'sentinel' AND agent_b = 'synth')
   OR (agent_a = 'synth' AND agent_b = 'sentinel')
ORDER BY created_at DESC
LIMIT 20;
```

### Get Active Personality Protocols
```sql
SELECT 
    agent_id,
    protocol_id,
    protocol_type,
    activated_at
FROM personality_activations
WHERE deactivated_at IS NULL
ORDER BY agent_id, activated_at DESC;
```

### Calculate Sentinel Signal Ratio
```sql
SELECT 
    COUNT(*) as total_escalations,
    SUM(CASE WHEN validated_as_real = 1 THEN 1 ELSE 0 END) as real_issues,
    CAST(SUM(CASE WHEN validated_as_real = 1 THEN 1 ELSE 0 END) AS REAL) / COUNT(*) as signal_ratio
FROM escalations
WHERE escalated_by = 'sentinel'
  AND validated_as_real IS NOT NULL
  AND created_at >= date('now', '-30 days');
```

---

## API Layer (Phase 3)

**Simple Python/Node.js REST API:**

```python
# Example endpoint: GET /api/agents/{agent_id}/stats
def get_agent_stats(agent_id):
    db = sqlite3.connect('~/clawd/agents/ventureos-rpg.db')
    
    # Current stats
    current = db.execute("""
        SELECT * FROM psionic_stats 
        WHERE agent_id = ? 
        ORDER BY snapshot_date DESC LIMIT 1
    """, [agent_id]).fetchone()
    
    # 7-day baseline
    baseline = db.execute("""
        SELECT AVG(psionic_mastery), AVG(energy), AVG(shields)
        FROM psionic_stats
        WHERE agent_id = ? AND snapshot_date >= date('now', '-7 days')
    """, [agent_id]).fetchone()
    
    return {
        'current': current,
        'baseline': baseline,
        'delta': calculate_delta(current, baseline)
    }
```

---

## Comparison: VOXYZ vs VentureOS

| Aspect | VOXYZ | VentureOS RPG |
|--------|-------|---------------|
| **Database** | Supabase (Postgres) | SQLite (Phase 1), Postgres (Phase 3) |
| **Static Config** | TypeScript files | JSON files in git |
| **Agent Count** | 6 | 8 |
| **Metrics** | VRL, SPD, RCH, TRU, WIS, CRE | Psionic Mastery, Energy, Shields, Warp Tech, Psi Reach |
| **Relationships** | Affinity matrix | Khala Network (28 bonds) |
| **Theming** | Generic RPG classes | StarCraft Protoss units |
| **Special Tracking** | N/A | Escalation quality (Sentinel), Reliability metrics (Atlas) |

---

## Next Steps

1. **Create migration script** (`init-rpg-database.sh`)
2. **Create seed script** (`seed-khala-network.sh`)
3. **Update calculation scripts** to write to DB instead of JSON
4. **Test schema** with mock data
5. **Update master guide** with DB architecture
6. **Commit static configs** to ~/clawd repo

---

**Status:** Schema design complete, ready for implementation  
**Owner:** Atlas (database setup), Synth (API layer in Phase 3)  
**References:** VOXYZ article, rpg-master-guide.md
