# ventureos-rpg API

This directory provides the Phase 3 **RPG / Pylon Network** JSON endpoints backed by the SQLite DB:

- DB default: `~/clawd/agents/ventureos-rpg.db`
- Override with env: `VENTUREOS_RPG_DB=/path/to/ventureos-rpg.db`

## Endpoints (mounted at `/api/rpg/*`)

All endpoints return JSON and include permissive CORS headers.

### `GET /api/rpg/stats`
Latest psionic stat snapshot for all agents.

### `GET /api/rpg/stats/:agent`
Latest psionic stat snapshot for a single agent.

### `GET /api/rpg/tactical-overlay/:agent`
Display-friendly “unit card” payload:
- unit name + role (Protoss mapping)
- psionic attributes
- rank
- active protocols
- warp tech inputs audit blob

### `GET /api/rpg/khala-network`
Khala bonds + drift history.

Query params:
- `driftLimit` (default 8)

### `GET /api/rpg/khala-network/:agent`
Bonds that include `:agent`.

### `GET /api/rpg/protocols/:agent`
Active protocols (rows where `deactivated_at IS NULL`).

### `GET /api/rpg/escalations/:agent`
Escalation quality stats for `:agent` over the last 30 days.

Query params:
- `windowDays` (default 30)

## Integration modes

### A) Integrated into `openclaw-dashboard` (recommended)
`openclaw-dashboard/server.js` imports `ventureos-rpg/api/rpg-http.js` and serves `/api/rpg/*` from the dashboard origin.

### B) Standalone Express server (optional)
```bash
cd ~/clawd/ventureos-rpg
npm install
VENTUREOS_RPG_DB=~/clawd/agents/ventureos-rpg.db \
VENTUREOS_RPG_PORT=7010 \
npm run dev
```
