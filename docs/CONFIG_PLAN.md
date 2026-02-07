# Config Plan

## File Additions (Workspace Root)
- `GOALS_CONSTRAINTS.md`
- `GUARDRAILS.md`
- `PROACTIVE_MODE.md`
- `MODEL_STRATEGY.md`
- `BUDGET_POLICY.md`
- `OPS_RUNBOOK.md`

## Script Additions (workspace/scripts)
- `backup-clawd.sh`
- `verify-backup.sh`
- `monitor-openclaw.sh`
- `export-cron-logs.sh`
- `budget-check.sh`

## Runtime Directories
- `runtime/logs/task_runs/`
- `runtime/logs/backups/`
- `runtime/monitor/state.json`

## Modified Files
- `AGENTS.md` → link to policy docs
- `HEARTBEAT.md` → reference monitoring + backup cadence + budget checks

---

## OpenClaw Config
**Default:** No changes to `~/.openclaw/openclaw.json` in this phase.

**Optional (deferred) Enhancements:**
- Pin subagent model to cheap baseline
- Heartbeat‑specific model override
- Memory backend plugin swap (e.g., LanceDB)

---

## Cron Job Install
Cron jobs are added via OpenClaw `cron` tool (not manual edits):
- Backup (nightly)
- Backup verify (weekly)
- Monitor (15‑min)
- Budget check (daily)
- Cron log export (30‑min)
- Update reminder (weekly)

See **CRON_SPECS.md** for exact schedules + payloads.
