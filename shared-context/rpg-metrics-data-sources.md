# VentureOS RPG — Metrics Data Sources (Phase 1 bootstrap)

**Purpose:** Document where `calculate-psionic-stats.sh` and `update-psionic-ranks.sh` currently read inputs from, and what production sources are needed.

## Current (Phase 1) Sources (in priority order)

### 1) Per-agent metrics JSON (recommended bootstrap)
**Directory:** `~/clawd/runtime/rpg-metrics/`

**Files:** `oracle.json`, `atlas.json`, `sentinel.json`, `verifier.json`, `archivist.json`, `synth.json`, `echo.json`, `nexus.json`

These files override built-in defaults. Any missing fields fall back to defaults.

**Common fields used by core formulas**
```json
{
  "memory_count": 22,
  "domains": 7,
  "edits": 4,

  "p95_latency_s": 14,
  "mttr_minutes": 19,
  "acceptance_rate": 0.76,

  "success_rate": 0.88,
  "approval_accuracy": 0.86,

  "tasks_completed": 19,

  "warp": {}
}
```

**Warp Technology inputs (`warp`) by agent** (from `rpg-master-guide.md`):
- **oracle / archivist**:
  - `warp.prevented_repeat_questions` (count or normalized score)
  - `warp.severity_weight` (weight/scale)
- **synth**:
  - `warp.explicit_approval`
  - `warp.reuse_count_30d`
  - `warp.verifier_pass`
- **verifier**:
  - `warp.bugs_caught_pre_release_outside_expected`
  - `warp.severity`
  - `warp.unique_risk_areas_covered`
- **atlas**:
  - `warp.change_success_rate` (0–1)
  - `warp.slo_compliance` (0–1)

**Placeholders (until master guide specifies CRE formally):**
- **sentinel**: `warp.total_escalations`, `warp.validated_real_issues` → computes `signal_ratio*100`
- **echo**: `warp.orchestration_score` (0–100)
- **nexus**: `warp.routing_efficiency` (0–1 or 0–100)

> Note: the scripts store the exact warp inputs used (plus a `formula` string) into `psionic_stats.warp_tech_inputs` for auditability.

### 2) Optional filesystem memory dir count
If present, `~/clawd/memory/agents/<agent_id>/` is counted to produce `memory_count`.

**Status:** directory may not exist yet; safe fallback.

### 3) Built-in mock defaults
If no external metrics exist yet, scripts use internal defaults per agent so the pipeline runs end-to-end and writes valid rows.

## DB-derived inputs

### Missions completed
Both scripts count completed missions from the RPG DB:

```sql
SELECT COUNT(*)
FROM missions
WHERE agent_id = ? AND status = 'completed';
```

This drives rank XP weighting and rank calculation.

## Production Sources Needed (Phase 1 → Phase 2 hardening)

### memory_count / domains / edits
- **memory_count**: OpenClaw memory store entries per agent (or agent-specific memory files/records)
- **domains**: extract domains/tags from memory entries (e.g., `#domain/security`, `#domain/infra`)
- **canonical_edits**: count of approved edits to canonical docs (git commits to `shared-context/` or Obsidian vault) attributed to agent

### latency / MTTR
- **p95_latency_s**: runtime monitoring for response/turnaround latency (per agent/channel)
- **mttr_minutes**: incident log MTTR (from `runtime/logs`, `monitor/`, or a future `incident_events` table)

### acceptance_rate / success_rate / approval_accuracy
- acceptance: % accepted outputs over a rolling window (requires an acceptance event log)
- success_rate: mission success ratio (derive from `missions` table once it is populated)
- approval_accuracy: Sentinel decision log correctness (needs `approval_decisions` event source)

### Warp Technology (CRE)
Define normalization rules so values reliably map to 0–100:
- counts (bugs caught, prevented questions, reuse) must be scaled/normalized (rolling 30d windows recommended)
- store raw + normalized versions in `warp_tech_inputs` so Verifier can audit

## Implementation Notes
- Scripts are **idempotent** via SQLite UPSERTs.
- `psionic_stats` uses `UNIQUE(agent_id, snapshot_date)` to ensure one snapshot per day per agent.
- Range CHECK constraints on stats/rates will reject invalid values; the scripts clamp computed stats to `0..100`.
