#!/usr/bin/env bash
set -euo pipefail

# Seed Khala Network bonds.
# Usage:
#   ./seed-khala-network.sh
#   ./seed-khala-network.sh /path/to/ventureos-rpg.db

DB_PATH="${1:-$HOME/clawd/agents/ventureos-rpg.db}"

sqlite3 "$DB_PATH" <<'SQL'
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
