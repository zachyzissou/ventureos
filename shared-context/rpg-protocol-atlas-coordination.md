# Track 5 — Atlas Coordination Notes (Protocols)

**Date:** 2026-02-14  
**Owner:** Synth  

> This doc captures ops-facing decisions + items requiring Atlas sign-off.

---

## What was implemented (ops-relevant)

- New cron job created:
  - **Name:** Daily Protocol Trigger Check (VentureOS RPG)
  - **Job ID:** `c325a977-9c45-4dca-930d-c27a1e1ae658`
  - **Schedule:** `cron 20 6 * * * @ America/Chicago`
  - **Agent:** `atlas`
  - **Target/session:** `isolated`
  - Payload runs: `/Users/zachgonser/clawd/scripts/check-protocol-triggers.sh`

- Logs:
  - `~/clawd/runtime/logs/protocol-triggers-YYYY-MM-DD.log`

- DB mutations:
  - `~/clawd/agents/ventureos-rpg.db` → `personality_activations`

---

## Monitoring / alerting proposal

### Minimal (recommended)
- Alert on:
  - cron job error/non-zero
  - (optional) protocol churn anomaly (>10 changes/day)

### Where to hook
- Add the cron job ID to monitor config:
  - `~/clawd/tools/monitor/config/config.yaml` → `cron_jobs:`

- Optional: add a daily verification query in morning briefing:
  - active protocols count
  - activations/deactivations in last 24h

---

## Audit trail requirements (proposal)

Current DB supports:
- activation/deactivation timestamps
- `trigger_condition` JSON

Missing:
- explicit `activation_reason` / `deactivation_reason` fields

Proposal:
- Keep log files as the authoritative narrative for Phase 2.
- In Phase 3, add either:
  1) columns: `activation_reason`, `deactivation_reason` OR
  2) new table: `personality_activation_events`

---

## Performance impact

- Expected runtime: sub-second to a few seconds.
- Work performed:
  - a handful of SQLite queries per agent
  - optional ripgrep scans over small observation markdown set

If observation directory grows large, we should persist parsed tags/patterns in DB and stop rg-scanning.

---

## Atlas sign-off checklist (to fill)

- [ ] Confirm log retention location is acceptable (`runtime/logs/`)
- [ ] Confirm cron monitoring should include this job ID
- [ ] Decide if Discord notifications should be sent on activation/deactivation
- [ ] Decide if we need structured activation event logging in DB now vs later

**Atlas comments / decisions:**
- _Pending_
