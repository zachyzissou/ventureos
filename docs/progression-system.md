# Phase 4.5 — Deep Progression System (Phase 1 Foundation)

> Issue #203 | Roadmap #138

## Overview

The Deep Progression System adds persistent, meaningful progression mechanics to VentureOS agents. Phase 1 ships the foundational backbone: data persistence, a deterministic progression engine, validated API endpoints, and minimal dashboard visibility.

## Architecture

```
lib/types/progression.ts     — Type contracts (profiles, events, prestige)
lib/progression-engine.ts    — Pure-function math (XP, levels, diversification, prestige)
lib/progression-store.ts     — SQLite persistence (ProgressionStore class)
lib/progression-http.ts      — HTTP route handler
dashboard/server/routes/progression.ts — Dashboard adapter
```

## Data Model

### Tables

| Table | Purpose |
|-------|---------|
| `progression_profiles` | Agent-level progression state (XP, level, prestige rank) |
| `skill_nodes` | Skill tree node definitions (static) |
| `skill_edges` | Prerequisite relationships between nodes |
| `skill_unlocks` | Per-agent unlock state (reset on prestige) |
| `xp_events` | XP ledger with source attribution and diversification metadata |
| `prestige_records` | Prestige transition audit trail |

All tables are auto-migrated on first database open (no manual migration needed).

### Shared Database

Progression tables live in the same SQLite database as the existing RPG system (`RPG_DB_PATH` from `lib/paths.ts`), keeping the operational footprint small.

## Formulas

### XP → Level

```
XP required for level N = floor(100 × (N - 1)^1.5)

Level 1:   0 XP     Level 10:  ~3,162 XP
Level 2: 100 XP     Level 20:  ~8,944 XP
Level 5: 800 XP     Level 50: ~35,355 XP
```

### Diversification Weighting

XP events are weighted by how diversely an agent earns XP across categories:

| Unique categories used | Multiplier |
|------------------------|------------|
| 1                      | 0.5× (penalty for volume farming) |
| 2-3                    | 0.5×-1.0× (scaling) |
| 4-6                    | 1.0×-1.3× (bonus) |
| 7+                     | 1.3×-1.5× (strong bonus, capped) |

**Diversification Score** (0-100): Shannon entropy of category distribution, normalized by max possible entropy (log₂ of 10 categories).

### XP Source Categories

`mission_completion` · `code_review` · `documentation` · `bug_fix` · `deployment` · `collaboration` · `research` · `testing` · `observability` · `security`

### Prestige

Prestige resets current XP and level while preserving lifetime XP and incrementing rank:

| From Rank | Min Level Required | Effect |
|-----------|-------------------|--------|
| 0 → 1    | 20                | Reset XP/level, keep lifetime XP |
| 1 → 2    | 25                | Same |
| N → N+1  | 20 + N×5          | Same (max rank: 10) |

Skill unlocks reset on prestige. Prestige history is recorded as an audit trail.

## API Endpoints

### `GET /api/rpg/progression/summary`

Dashboard summary cards. Returns all profiles with level/XP, today's aggregate stats, and top categories.

### `GET /api/rpg/progression/:agentId`

Full profile read: progression state, skill tree, unlock state, recent events, prestige history, next-level progress, and prestige eligibility.

### `POST /api/rpg/progression/events`

Ingest an XP event. Validates all fields, applies diversification weighting, returns the effective XP, updated profile, and level-up indicator.

```json
{
  "agent_id": "oracle",
  "raw_xp": 100,
  "source_category": "mission_completion",
  "source_description": "Completed sprint review"
}
```

### `POST /api/rpg/progression/prestige`

Trigger a prestige transition. Returns the prestige record and reset profile.

```json
{ "agent_id": "oracle" }
```

### Validation

- `agent_id`: required, alphanumeric + hyphens/underscores, max 64 chars
- `raw_xp`: required, must be a positive number
- `source_category`: must be one of the 10 defined categories
- `source_description`: required string, truncated to 500 chars
- Invalid input returns `400` with `{ ok: false, error: "..." }`

## Default Skill Tree

5 categories × 3 tiers = 15 nodes. Each category (engineering, operations, analysis, communication, strategy) has:
- **Tier 1**: Entry node, no prerequisites, 100 XP cost
- **Tier 2**: Requires tier 1, 300 XP cost
- **Tier 3**: Requires tier 2, 800 XP cost

Auto-seeded on first database open.

## Testing

```bash
# Unit tests (engine math)
npx jest tests/unit/progression-engine.test.ts

# Integration tests (store + HTTP)
npx jest tests/integration/progression-store.test.ts
npx jest tests/integration/progression-http.test.ts
```

## Out of Scope (Phase 1)

- Visual skill tree authoring UI
- Narrative/animation polish
- Advanced balancing tools
- Skill node unlock mutations (future phase)
