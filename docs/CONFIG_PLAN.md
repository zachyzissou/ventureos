# Config Plan

## File Additions (Workspace Root)
- `GOALS_CONSTRAINTS.md`
- `GUARDRAILS.md`
- `PROACTIVE_MODE.md`
- `MODEL_STRATEGY.md`
- `BUDGET_POLICY.md`
- `OPS_RUNBOOK.md`

## Script Additions (workspace/scripts)
**Source of truth:** repo `scripts/` directory.
- `backup-clawd.sh`
- `verify-backup.sh`
- `restore-backup.sh`
- `monitor-openclaw.sh`
- `export-cron-logs.sh`
- `budget-check.sh`
- `archive-task-runs.sh`
- `retry.sh`
- `with-timeout.sh`

## Runtime Directories
- `runtime/logs/task_runs/`
- `runtime/logs/backups/`
- `runtime/monitor/state.json`

## Modified Files
- `AGENTS.md` → link to policy docs
- `HEARTBEAT.md` → reference monitoring + backup cadence + budget checks

## Templates (repo only)
- `docs/templates/AGENTS.json`
- `docs/templates/HEARTBEAT.md`
- `docs/templates/task-queue.json`

---

## OpenClaw Config
**Exception (applied):** LAN‑first gateway posture.
- `gateway.bind = lan` (0.0.0.0)
- `gateway.tailscale.mode = off` (Serve disabled)
- `gateway.remote.url = ws://openclaw.local:18789`
- PF anchor `/etc/pf.anchors/openclaw` allowlists LAN + Tailnet for port **18789**, blocks others on **en0/utun6** only (loopback safe).
- Control UI secure‑context note: LAN access needs HTTPS proxy (localhost ok).

**Safety protocol:** All future config changes follow `docs/CONFIG_CHANGE_SAFETY.md` (Codex‑assisted with rollback).

**Provider config validation (Ollama):**
- `models.providers.ollama.models[].maxTokens` must be **numeric**.
- OpenClaw typically uses **maxTokens ≈ 10× contextWindow**.
- Non‑numeric values will prevent the gateway from starting.

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
