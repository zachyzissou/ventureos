# Cron Job Model Routing Updates

> **Status:** Ready to apply
> **Created:** 2026-02-14
> **Purpose:** Update cron jobs that currently default to heavy models (Opus) to use appropriate lighter models.

## Jobs to Update

These cron jobs currently have NO explicit model set, so they default to the agent's default (usually Opus at ~$0.15/run). They should use `gpt-5.1-codex-mini` + `thinking: low` for simple script execution.

### 1. Nightly Backup (`758fb284`)
- **Agent:** atlas
- **Current model:** (none — defaults to Opus)
- **Recommended:** `openai-codex/gpt-5.1-codex-mini`
- **Reasoning:** Just runs a bash script

### 2. Weekly Backup Verify (`467e3753`)
- **Agent:** atlas
- **Current model:** (none — defaults to Opus)
- **Recommended:** `openai-codex/gpt-5.1-codex-mini`
- **Reasoning:** Just runs a bash script

### 3. Refresh Twitter Cookies (`743be99f`)
- **Agent:** atlas
- **Current model:** (none — defaults to Opus)
- **Recommended:** `openai-codex/gpt-5.1-codex-mini`
- **Reasoning:** Copies cookie files

### 4. Archive Task Run Logs (`5d8e2185`)
- **Agent:** atlas
- **Current model:** (none — defaults to Opus)
- **Recommended:** `openai-codex/gpt-5.1-codex-mini`
- **Reasoning:** Archival script

### 5. Cron Error Watch (`41531717`)
- **Agent:** atlas
- **Current model:** (none — defaults to Opus)
- **Recommended:** `openai-codex/gpt-5.1-codex-mini` + `thinking: low`
- **Reasoning:** Script output → conditional alert

### 6. Moltbook Multi-Agent Scan (`a5fa2eb9`)
- **Agent:** atlas
- **Current model:** (none — defaults to Opus)
- **Recommended:** `openai-codex/gpt-5.1-codex-mini`
- **Reasoning:** Node script → filter output → alert

### 7. SQLite Integrity Check (`00150f29`)
- **Agent:** atlas
- **Current model:** (none — defaults to Opus)
- **Recommended:** `openai-codex/gpt-5.1-codex-mini`
- **Reasoning:** Script execution + pass/fail

### 8. SQLite Restore Drill (`711dc171`)
- **Agent:** atlas
- **Current model:** (none — defaults to Opus)
- **Recommended:** `openai-codex/gpt-5.1-codex-mini`
- **Reasoning:** Script execution + pass/fail

### 9. Daily Protocol Trigger Check (`c325a977`)
- **Agent:** atlas
- **Current model:** (none — defaults to Opus)
- **Note:** Already has `thinking: low`, just needs explicit model
- **Recommended:** `openai-codex/gpt-5.1-codex-mini`
- **Reasoning:** Script + SQLite query

## Already Optimized (No Changes Needed)

These jobs already have explicit lightweight models:
- Bloom MR Monitor → `gpt-5.1-codex-mini` ✅
- Bloom CI Watch → `gpt-5.1-codex-mini` ✅
- OpenClaw Monitor → `gpt-5.1-codex-mini` + `low` ✅
- Budget Check → `gpt-5.1-codex-mini` ✅
- Export Cron Logs → `gpt-5.1-codex-mini` ✅
- Discord Latency Monitor → `gpt-5.1-codex-mini` + `low` ✅
- Session Health Check → `gpt-5.1-codex-mini` ✅
- Cron Health Check → `gpt-5.1-codex-mini` + `low` ✅
- Daily Metrics Snapshot → `gpt-5.1-codex-mini` ✅
- Weekly Metrics Digest → `gpt-5.1-codex-mini` ✅
- memory-observation-sync → `gpt-5.1-codex-mini` ✅
- Moltbook Reply Watch → `gpt-5.1-codex-mini` ✅
- Daily Psionic Stats → `gpt-5.1-codex-mini` + `low` ✅
- Daily Khala Drift → `gpt-5.1-codex-mini` + `low` ✅
- Daily Memory→RPG Sync → `gpt-5.1-codex-mini` + `low` ✅
- WHOOP Morning Check-in → `gpt-5.1-codex-mini` ✅

## Correctly on Tier 2 (No Changes Needed)

These jobs use `gpt-5.2-codex` for tasks that need synthesis:
- Extraction Shooter Intel → `gpt-5.2-codex` ✅
- Unity Tool Scout → `gpt-5.2-codex` ✅
- Weekly Bloom Digest → `gpt-5.2-codex` ✅
- Weekly Memory Synthesis → `gpt-5.2-codex` ✅
- Morning Briefing → `gpt-5.2-codex` ✅
- Agent Quality Audit → `gpt-5.2-codex` ✅

## Correctly on Tier 3 (No Changes Needed)

- OpenClaw Community Scout → `claude-sonnet-4-5` ✅ (external content analysis)
- Clawd Bookmark Watcher → `claude-sonnet-4-5` ✅ (external content)

## Implementation

To apply these changes, Atlas or an admin should update each cron job's payload to include the `model` and optionally `thinking` fields. This can be done via `openclaw cron update` or by editing `~/.openclaw/cron/jobs.json` directly.

**Estimated weekly savings:** 9 jobs × avg 7 runs/week × ~$0.10 saved/run = ~$6.30/week ($25+/month)
