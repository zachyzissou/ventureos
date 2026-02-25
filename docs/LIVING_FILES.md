# Living Files — Self-Maintaining Documentation

Issue: #228

## Delivered

- file ownership registry with CRUD:
  - register file path → owner agent + expected update cadence
  - update owner/cadence/notes
  - unregister file
- staleness detection engine:
  - freshness states: `fresh`, `warning`, `stale`, `missing`, `static`
  - periodic scheduler checks (cron-like interval) plus on-demand check endpoint
- auto-trigger workflow:
  - stale/missing files emit trigger records
  - owner-assigned remediation tasks are queued in task board automatically
  - trigger lifecycle: `queued` → `acknowledged` → `resolved`
- manual override:
  - `intentionallyStatic=true` suppresses stale triggers for files intentionally not updated
- dashboard surface:
  - Mission Control panel for living-files freshness counts and per-file status list

## API Surface

- `GET /api/living-files/dashboard`
- `GET /api/living-files/files`
- `POST /api/living-files/files`
- `PATCH /api/living-files/files/:fileId`
- `DELETE /api/living-files/files/:fileId`
- `POST /api/living-files/check-run`
- `GET /api/living-files/triggers`
- `POST /api/living-files/triggers/:triggerId/acknowledge`
- `POST /api/living-files/triggers/:triggerId/resolve`
