# Next Hybrid Migration Checklist

Date: 2026-02-22
Issue: #454

## Scope

Incrementally adopt Next.js for dashboard UI while preserving existing backend APIs and authentication controls.

## Route Parity Tracker

| Route | Legacy Surface | Next Surface | API Contract | Status |
|---|---|---|---|---|
| Readiness | `dashboard/client/index.html` readiness card | `/readiness` | `GET /api/openclaw-local-readiness` | Phase 1 shipped |
| Overview | `dashboard/client/index.html` overview panel | `/overview` | `GET /api/health`, `GET /api/services`, `GET /api/system` | Phase 2 shipped |
| Logs | `dashboard/client/index.html` logs panels | `/logs` | `GET /api/logs/sources`, `GET /api/logs/entries` | Phase 2 shipped |

## Auth + Security Constraints

- Backend auth remains source of truth.
- No token is hardcoded into Next app.
- Next readiness page uses backend login cookie flow (`/api/login`) and optional bearer header for local debugging.
- CORS remains backend-enforced; Next dev defaults to port `7001` (already whitelisted in backend CORS config).

## Validation

- Parity guard script:
  - `npm run dashboard:next:parity`
- Manual endpoint verification:
  - Login against backend (`/api/login`)
  - Load `/readiness`, `/overview`, `/logs` pages
  - Confirm displayed metrics/rows align with backend API payloads

## Rollback Notes

- Next app is additive and isolated in `dashboard-next/`.
- Rollback is immediate: continue serving legacy UI from existing dashboard client.
- No backend route removals or auth behavior changes are included in this migration step.
