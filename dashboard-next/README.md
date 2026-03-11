# Dashboard Next (Hybrid)

`dashboard-next/` is the incremental Next.js frontend track for VentureOS.
The existing `dashboard` backend remains source of truth for auth and APIs.

## Goals

- Increase frontend iteration speed with App Router + component structure.
- Migrate route-by-route without backend rewrites.
- Keep backend auth/token boundaries intact.

## Local Run

```bash
npm install --workspace=dashboard-next
npm run dashboard:next:dev
```

Defaults:
- Next app: `http://localhost:7001`
- Existing dashboard backend: `http://localhost:7000`

The readiness page (`/readiness`) calls backend endpoints directly and supports:
- backend cookie auth via `POST /api/login` + `credentials: include`
- optional `Authorization: Bearer <token>` fallback header per request

## Current Migrated Pages

- `/readiness` (read-only): consumes `/api/openclaw-local-readiness`
- `/overview` (read-only): consumes `/api/health`, `/api/services`, `/api/system`
- `/logs` (read-only): consumes `/api/logs/sources`, `/api/logs/entries`
- `/task-board` (interactive): reads/writes through Next API parity routes (`/api/task-board*`) which proxy existing backend task-board contracts

## Parity Guard

```bash
npm run dashboard:next:parity
```

This runs parity guards for readiness, overview, logs, and task-board view-model mappings.

## Write-Surface Smoke

```bash
npm run dashboard:next:smoke
```

This validates task-board write auth forwarding and success/failure behavior through Next API parity routes.

## Migration Notes

See `dashboard-next/docs/MIGRATION_CHECKLIST.md` for route parity and rollback.
