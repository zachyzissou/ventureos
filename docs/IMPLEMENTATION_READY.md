# VentureOS – Implementation‑Ready Design (Defaults Locked)

**Status:** Design complete. **Partial implementation applied** (policy docs split, monitoring enhancements, restore workflow, backup coverage, LAN‑first gateway posture + PF hardening).

This doc is the *implementation‑ready* package: final decisions, file changes, scripts, cron job specs, runbooks, verification, and rollback. Once approved, we can execute the plan exactly as written.

---

## 0) Defaults Locked (Per “Use Defaults”)

**Time zone:** America/Chicago

### Proactive window
- **Active:** 08:00–23:00 CST
- **Quiet hours:** 23:00–08:00 CST (alerts only for P0)

### Budget policy
- **Alert thresholds:** 50% / 80% / 90%
- **Behavior at 90%:** default to cheap model unless strong model explicitly required
- **Caps (policy defaults):**
  - Anthropic: **10,000 points/month** (per `subscription-quota-tracker.js`)
  - OpenAI Codex: **50 msgs / 3h window** (soft cap; alert at 80%+)
  - Gemini: **100 queries/day** (soft cap; alert at 80%+)

### Backups
- **Destination:** `~/backups/clawd/`
- **Retention:** 30 days
- **Verification:** weekly checksum + test extract

### Updates
- **Window:** Sunday 03:00–04:00 CST
- **Policy:** reminder only; updates require explicit approval

### Alerts
- **Channel:** Discord → SlurpNet alerts channel (`channel:1466893115460812979`)

---

## 1) File Changes (Design Targets)

### New policy docs (root of workspace)
- `GOALS_CONSTRAINTS.md`
- `GUARDRAILS.md`
- `PROACTIVE_MODE.md`
- `MODEL_STRATEGY.md`
- `BUDGET_POLICY.md`
- `OPS_RUNBOOK.md`

### New scripts (workspace/scripts)
- `scripts/backup-clawd.sh`
- `scripts/verify-backup.sh`
- `scripts/restore-backup.sh`
- `scripts/monitor-openclaw.sh`
- `scripts/export-cron-logs.sh`
- `scripts/budget-check.sh`
- `scripts/archive-task-runs.sh`

### New runtime dirs
- `runtime/logs/task_runs/`
- `runtime/logs/backups/`
- `runtime/monitor/state.json`

### Memory directories (workspace)
- `~/clawd/memory/` (daily logs)
- `~/Obsidian/VaultZap/life/areas/` (entity facts + summaries)

### Templates (repo only)
- `docs/templates/AGENTS.json`
- `docs/templates/HEARTBEAT.md`
- `docs/templates/task-queue.json`

### Modified files
- `AGENTS.md` (link to new policy docs)
- `HEARTBEAT.md` (reference monitoring + backups + budget checks)

---

## 2) Policy Docs – Ready‑to‑Apply Content

These policies are now separate files in this repo (authoritative source). During implementation, copy them to the workspace root (`~/clawd/`) and link from AGENTS.md + HEARTBEAT.md.

- [GOALS_CONSTRAINTS.md](GOALS_CONSTRAINTS.md)
- [GUARDRAILS.md](GUARDRAILS.md)
- [PROACTIVE_MODE.md](PROACTIVE_MODE.md)
- [MODEL_STRATEGY.md](MODEL_STRATEGY.md)
- [BUDGET_POLICY.md](BUDGET_POLICY.md)
- [OPS_RUNBOOK.md](OPS_RUNBOOK.md)

---

## 3) Scripts – Ready‑to‑Apply

**Source of truth:** `scripts/` in this repo. Do not copy inline snippets; use the versioned files.

**Install to workspace:**
```bash
mkdir -p ~/clawd/scripts
cp scripts/*.sh ~/clawd/scripts/
chmod +x ~/clawd/scripts/*.sh
```

**Scripts:**
- `scripts/backup-clawd.sh`
- `scripts/verify-backup.sh`
- `scripts/restore-backup.sh`
- `scripts/monitor-openclaw.sh`
- `scripts/export-cron-logs.sh`
- `scripts/budget-check.sh`
- `scripts/archive-task-runs.sh`
- `scripts/retry.sh`
- `scripts/with-timeout.sh`

## 4) Cron Job Specs (OpenClaw)

> These are **definitions only**. They should be added via `cron add` after approval.

### Nightly Backup
- **Schedule:** `0 2 * * *`
- **Payload:** run `scripts/backup-clawd.sh`

### Weekly Backup Verify
- **Schedule:** `30 2 * * 0`
- **Payload:** run `scripts/verify-backup.sh` and alert if fail

### Monitoring (Crash/Auth/Timeout)
- **Schedule:** `*/15 * * * *`
- **Payload:** run `scripts/monitor-openclaw.sh` and alert on P0/P1

### Budget Check
- **Schedule:** `0 9 * * *`
- **Payload:** run `scripts/budget-check.sh`; alert at 50/80/90%

### Export Cron Logs
- **Schedule:** `*/30 * * * *`
- **Payload:** run `scripts/export-cron-logs.sh`

### Update Window Reminder
- **Schedule:** `0 3 * * 0`
- **Payload:** systemEvent reminder: “Update window open; reply ‘run update’ to proceed.”

### Archive Task Run Logs
- **Schedule:** `0 3 1 * *` (monthly)
- **Payload:** run `scripts/archive-task-runs.sh`

---

## 5) Task Queue (Recurring Jobs by Tier)

We use the Proactive Engine SLA tiers:
- **P0 (Critical):** execute immediately (allowed in quiet hours)
- **P1 (Urgent):** target ≤ 1 hour (queued in quiet hours)
- **P2 (Normal):** target ≤ 24 hours (queued in quiet hours)
- **P3 (Low):** best effort (queued in quiet hours)

**P0:**
- Monitoring (crash/auth/timeout; gateway down; auth broken; data loss risk)

**P1:**
- Backup verify (alerts if failure)

**P2:**
- Morning Briefing
- Bloom CI Watch
- Fact Extraction
- Budget checks
- Export Cron Logs

**P3:**
- Unity Tool Scout
- Weekly Digest
- Weekly Memory Synthesis
- Archive Task Run Logs

**Queue Store:** `runtime/task-queue.json` (durable metadata; worker executes queued commands)

**Schema template (repo):** `docs/templates/task-queue.json` (includes mission metadata fields)

---

## 6) Verification Checklist

- [ ] Backups created and checksum verified
- [ ] Monitoring detects simulated auth error
- [ ] Budget alerts trigger at thresholds
- [ ] Cron log export populates daily jsonl
- [ ] Update reminder posted at window

---

## 7) Rollback Plan

- Remove added cron jobs via `cron remove`
- Delete scripts from `~/clawd/scripts/`
- Restore from latest backup archive if needed
- Revert `AGENTS.md` / `HEARTBEAT.md`

---

## 8) Next Step (Awaiting Approval)
Once you approve, I will:
1. Create the policy docs + scripts
2. Add cron jobs
3. Update AGENTS/HEARTBEAT references
4. Run first backup + verification
