# Status – OpenClaw Upgrade

**As of:** 2026‑02‑07

## ✅ Complete (Docs)
- Implementation‑ready package is complete (requirements → architecture → scripts → cron → tests → rollout → risks → metrics).
- Policy docs are split into standalone files in this repo and linked from `IMPLEMENTATION_READY.md` + `DOC_INDEX.md`.
- Templates added for AGENTS/HEARTBEAT workspace starters.
- Monitoring spec includes stale `gateway.lock` detection.
- Task‑run retention policy documented in `SCRIPT_SPECS.md`.
- Docs‑lint CI added (broken links + placeholder scan; includes templates + JSON validation).

## ✅ Implemented in workspace (~/clawd)
- Monitoring script updated to detect stale `~/.openclaw/gateway.lock` when gateway is down.
- Backup coverage includes `memory/fix-reports` + `memory/bloom-content`; backup + verify run completed.
- Restore workflow added (`restore-backup.sh`, dry‑run by default).
- AGENTS.md + HEARTBEAT.md linked to policy docs.
- Cron jobs installed: Nightly Backup, Weekly Verify, Monitor, Export Logs, Budget Check, Update Reminder.

## 🧾 Execution Checklist / Audit Log
- [x] 2026‑02‑07 — Policy docs split + linked in repo
- [x] 2026‑02‑07 — Monitoring stale gateway.lock detection implemented
- [x] 2026‑02‑07 — Restore workflow added (dry‑run)
- [x] 2026‑02‑07 — Backup coverage updated + verify run
- [x] 2026‑02‑07 — AGENTS/HEARTBEAT linked to policy docs
- [x] 2026‑02‑07 — Cron jobs installed (backup/verify/monitor/export/budget/update reminder)

## ⏳ Pending / Next
- Create `runtime/task-queue.json` (use `docs/templates/task-queue.json`).
- Install monthly cron for `archive-task-runs.sh`.
- Update `FEATURE_BACKLOG.md` + `ROADMAP.md` to reflect Phase 0.5 progress.
- Execute full `TEST_PLAN.md` (including stale lock simulation) and log results.

## 🔜 Deferred (intentional)
- Optional config enhancements (subagent model pinning, heartbeat override, memory backend swap).
