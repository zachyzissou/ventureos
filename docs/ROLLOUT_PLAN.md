# Rollout Plan

## Phase 0 – Docs Complete
- Requirements, architecture, scripts, cron specs, metrics, runbooks

## Phase 1 – Scripts + Policies
- Add policy docs to workspace
- Add scripts to `scripts/`
- Create runtime log directories

## Phase 2 – Cron Install
- Add cron jobs (backup, verify, monitor, export, budget)
- Add update‑window reminder

## Phase 3 – Validation
- Run tests from TEST_PLAN
- Validate backup integrity
- Confirm alerts

## Phase 4 – Steady State
- Weekly review of metrics
- Monthly review of quota usage

---

## Rollback
1. Remove cron jobs via `cron remove`
2. Delete scripts from `~/clawd/scripts`
3. Restore from latest backup if needed
4. Revert policy doc references in AGENTS/HEARTBEAT
