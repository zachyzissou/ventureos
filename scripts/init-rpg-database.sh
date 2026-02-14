#!/usr/bin/env bash
set -euo pipefail

# Initialize VentureOS RPG SQLite database
# Usage:
#   ./init-rpg-database.sh            # writes to ~/clawd/agents/ventureos-rpg.db
#   ./init-rpg-database.sh :memory:   # validate schema in-memory

DB_PATH="${1:-$HOME/clawd/agents/ventureos-rpg.db}"

# Backup + recreate on-disk DB (keeps init deterministic so CHECK constraints apply)
if [[ "$DB_PATH" != ":memory:" ]]; then
  mkdir -p "$(dirname "$DB_PATH")"

  if [[ -f "$DB_PATH" ]]; then
    cp "$DB_PATH" "$DB_PATH.backup.$(date +%Y%m%d-%H%M%S)"
    rm -f "$DB_PATH"
  fi
fi

sqlite3 "$DB_PATH" <<'SQL'
PRAGMA foreign_keys = ON;

-- Table 1: psionic_stats
CREATE TABLE IF NOT EXISTS psionic_stats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_id TEXT NOT NULL,
    snapshot_date DATE NOT NULL,

    -- Psionic Attributes (0-100)
    psionic_mastery INTEGER,
    energy INTEGER,
    shields INTEGER,
    warp_technology INTEGER,
    psi_reach INTEGER,

    -- Raw metric inputs (debug / attribution)
    memory_count INTEGER,
    unique_domains INTEGER,
    canonical_edits INTEGER,
    p95_latency_s REAL,
    mttr_minutes REAL,
    acceptance_rate REAL,
    success_rate REAL,
    approval_accuracy REAL,
    tasks_completed INTEGER,

    -- JSON blob of contributing metrics for warp_technology (CRE)
    -- Example:
    -- {"atlas":{"deployments_30d":12,"zero_downtime":8},"oracle":{"citations":15,"source_quality":0.9}}
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

# Note: :memory: databases disappear between sqlite3 connections, so do all validation in the single
# schema-creation invocation above.
if [[ "$DB_PATH" == ":memory:" ]]; then
  echo "✅ Database initialized at: $DB_PATH"
  exit 0
fi

# Migration step (safe on existing DBs where psionic_stats was created before warp_tech_inputs existed)
if [[ "$(sqlite3 "$DB_PATH" "SELECT 1 FROM pragma_table_info('psionic_stats') WHERE name='warp_tech_inputs' LIMIT 1;")" != "1" ]]; then
  sqlite3 "$DB_PATH" "ALTER TABLE psionic_stats ADD COLUMN warp_tech_inputs TEXT;"
fi

echo "✅ Database initialized at: $DB_PATH"
sqlite3 "$DB_PATH" "SELECT 'Tables created: ' || COUNT(*) FROM sqlite_master WHERE type='table';"
