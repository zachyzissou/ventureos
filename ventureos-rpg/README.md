# ventureos-rpg (Phase 3)

Pylon Network visualization + APIs for the VentureOS dashboard.

## Layout

- `components/` — Web Components (Vanilla)
- `api/` — JSON endpoints (SQLite-backed)
- `assets/` — optional sprites (nice-to-have)

## Primary integration target

The live dashboard is `~/clawd/openclaw-dashboard` (running on port 7001). It now:
- serves `/api/rpg/*` endpoints (backed by `~/clawd/agents/ventureos-rpg.db`)
- serves component modules at `/rpg/components/*`
- includes a new page: **Pylon Network**

## Dev commands

Optional standalone API server:

```bash
cd ~/clawd/ventureos-rpg
npm install
npm run dev
# http://localhost:7010/api/rpg/stats
```

Smoke test against running dashboard:

```bash
RPG_BASE_URL=http://127.0.0.1:7001 npm test
```
