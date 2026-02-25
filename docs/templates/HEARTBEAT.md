# HEARTBEAT.md (Template)

## Policy Docs (VentureOS guidance)
Source of truth (workspace root):
- $HOME/clawd/GOALS_CONSTRAINTS.md
- $HOME/clawd/GUARDRAILS.md
- $HOME/clawd/PROACTIVE_MODE.md
- $HOME/clawd/MODEL_STRATEGY.md
- $HOME/clawd/BUDGET_POLICY.md
- $HOME/clawd/OPS_RUNBOOK.md

## Context Management (Every heartbeat)
Before anything else:
1. Check context size - if approaching limits, archive completed work
2. Commit memory changes to git if any exist
3. Rotate checks below based on last execution time

## Rotating Checks (Spread across 30-min intervals)

### System Health (Every 2 hours)
```json
memory/heartbeat-state.json: { "lastChecks": { "system": timestamp } }
```
- Check configured cron jobs (openclaw cron list) — any failures in last 4 hours?
- Check disk space: `df -h $HOME`
- Check Windows node connectivity: `openclaw nodes status`
- Verify LM Studio daemon: `lms daemon status`
- If issues found → auto-fix or alert

### Memory Maintenance (Every 4 hours)
```json
memory/heartbeat-state.json: { "lastChecks": { "memory": timestamp } }
```
- Read today's memory file - if >100 lines, archive completed sections
- Scan for TODOs in memory files - surface if any exist
- Check if MEMORY.md needs updating from recent daily logs
- Git status - if uncommitted changes exist, commit them

### StantonTimes Health (Every 2 hours)
```json
memory/heartbeat-state.json: { "lastChecks": { "stanton": timestamp } }
```
- Check state.json size - if >100KB, archive old seenTweets
- Verify pendingApprovals queue - if >24h old, alert
- Check Discord webhook - test connectivity if last failure detected

### Bloom Monitoring (Every 4 hours)
```json
memory/heartbeat-state.json: { "lastChecks": { "bloom": timestamp } }
```
- Check for open PRs >48h without review
- Check for CI failures on main branch
- Scan Obsidian output folders - any accumulation issues?

### Proactive Work (When idle)
- Archive completed projects from memory/ to memory/archives/
- Consolidate duplicate info in daily logs
- Update MEMORY.md with distilled insights from recent days
- Pre-generate morning briefing data at 7:30 AM
- Clean up temp files in workspace

### Ops (Upgrade Baselines)
- Ensure nightly backup succeeded (see `runtime/logs/backups/`)
- Ensure cron export job is producing daily JSONL in `runtime/logs/task_runs/`
- Review budget alert output (if any)

## Quiet Hours
23:00 - 08:00 CST: Only alert on P0 issues (system failures, security)

## State Tracking
Track in `memory/heartbeat-state.json`:
```json
{
  "lastChecks": {
    "system": 1769763000,
    "memory": 1769760000,
    "stanton": 1769762000,
    "bloom": 1769758000
  },
  "lastProactive": 1769761000,
  "quietHours": { "start": "23:00", "end": "08:00" }
}
```

## Output Rules
- **HEARTBEAT_OK** if nothing needs attention
- **Alert message** if action/awareness needed
- **Never** just report status without purpose

## Coding-Agent Monitoring (Immediate Alerts)
- If any coding agent session fails (auth errors, crashes, timeouts), **alert immediately** in the main chat.
- When launching a coding agent, start a **background watcher** (poll every 10–15s) and surface errors immediately.
- Before launching Codex, run a quick auth check; if invalid, **stop and request re-auth**.
