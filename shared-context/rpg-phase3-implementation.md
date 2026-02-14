# RPG Phase 3 — Pylon Network Visualization (Implementation)

Date: 2026-02-14

## Summary
Phase 3 adds a **Protoss-themed RPG visualization** to the existing VentureOS web dashboard (`~/clawd/openclaw-dashboard`, port 7001) using **Vanilla Web Components** and a small set of **SQLite-backed JSON endpoints**.

Data path:

`ventureos-rpg.db (SQLite) → /api/rpg/* → Web Components → OpenClaw Dashboard (Pylon Network page)`

## What was built

### 1) Web Components (Vanilla)
Location: `~/clawd/ventureos-rpg/components/`

- **`<psionic-attribute-bar>`**
  - Props: `agent`, `attribute`, `value`, `label`
  - Horizontal bar with Protoss gradient + tier styling (based on value).

- **`<tactical-overlay-panel>`**
  - Props: `agent`
  - Fetches: `/api/rpg/tactical-overlay/<agent>`
  - Displays Protoss unit name, role, rank/XP, 5 attribute bars, active protocols.
  - Expandable sections:
    - Warp Tech Inputs (audit JSON blob)
    - Raw metric inputs

- **`<khala-network-graph>`**
  - Fetches: `/api/rpg/khala-network?driftLimit=6`
  - D3 force-directed graph (D3 loaded via ESM CDN import)
  - Nodes: 8 agents (size ~ rank)
  - Edges: bonds (thickness ~ affinity)
  - Interactions:
    - hover edge → tooltip with drift history
    - click edge → detail panel
    - affinity threshold slider filters bonds

- **`<atlas-reliability-metrics>`**
  - Props: `agent` (default `atlas`)
  - Fetches: `/api/rpg/stats/<agent>`
  - Shows 6 metrics requested (some are currently DB-backed **proxies** until backup/uptime telemetry is explicitly stored in the RPG DB):
    - Deployment success (proxy: change_success_rate / success_rate)
    - MTTR
    - Pylon uptime (proxy: success_rate)
    - Warp-in success (proxy: SLO compliance / acceptance_rate)
    - Backup success (proxy: success_rate)
    - Incident response (derived indicator)

### 2) API endpoints
Location: `~/clawd/ventureos-rpg/api/`

Endpoints mounted under `/api/rpg/*` (JSON + CORS):

- `GET /api/rpg/stats`
- `GET /api/rpg/stats/<agent>`
- `GET /api/rpg/tactical-overlay/<agent>`
- `GET /api/rpg/khala-network` (supports `driftLimit`)
- `GET /api/rpg/khala-network/<agent>`
- `GET /api/rpg/protocols/<agent>`
- `GET /api/rpg/escalations/<agent>` (supports `windowDays`)

DB access method: calls system `sqlite3 -json` via Node `child_process.execFile` (no native Node sqlite deps required for dashboard integration).

### 3) Dashboard integration (port 7001)
Target: `~/clawd/openclaw-dashboard`

Changes:

- `server.js`
  - mounts RPG API handler: `ventureos-rpg/api/rpg-http.js`
  - serves static modules under `/rpg/*` → `~/clawd/ventureos-rpg/*`

- `index.html`
  - adds a new nav item + page: **Pylon Network**
  - loads Web Components with:
    ```html
    <script type="module" src="/rpg/components/index.js"></script>
    ```
  - page includes 8 tactical overlay panels + Khala network graph + Atlas reliability panel

## Config

- DB path env override:
  - `VENTUREOS_RPG_DB=~/clawd/agents/ventureos-rpg.db`
- Static root override:
  - `VENTUREOS_RPG_ROOT=~/clawd/ventureos-rpg`

## Files touched

- Added: `~/clawd/ventureos-rpg/**`
- Modified:
  - `~/clawd/openclaw-dashboard/server.js`
  - `~/clawd/openclaw-dashboard/index.html`

## Notes / known gaps

- Pixel-art sprites were treated as optional and not implemented.
- Some Atlas reliability tiles use **proxy fields** from the existing stats blob until explicit backup/uptime/warp-in job telemetry is stored in `ventureos-rpg.db`.
