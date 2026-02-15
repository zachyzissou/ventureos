# Session Management Guide

> **Status:** P0 resolved. Prevention system active since 2026-02-15.  
> **GitHub:** [#34 — Phantom Sessions](https://github.com/zachyzissou/ventureos/issues/34)

## Root Cause

OpenClaw's session initialization scans the agent's `sessions/` directory. When the file count grows too large, the scan overwhelms the init process and causes a **silent timeout** — the spawn appears to succeed but the session never becomes responsive. We called these "phantom sessions."

### Evidence

| Agent | File Count | Spawn Success Rate |
|-------|-----------|-------------------|
| Atlas | 1,813 | 0% |
| Atlas (after cleanup to 50) | 50 | 100% |
| Synth | 335 | ~50% |
| Main | 3,266 | Degraded |

**Key insight:** It's **file count**, not file size, that causes the failure. The session init does a directory listing, and excessive entries cause it to timeout before completing initialization.

### Thresholds

| Count | Status | Impact |
|-------|--------|--------|
| <100 | ✅ Healthy | No issues |
| 100-200 | 🟡 OK | Monitor |
| 200-500 | ⚠️ Warning | Spawn may be slow |
| >500 | 🚨 Critical | Spawns will fail |

## Prevention System

### 1. Session Rotation (`rotate-agent-sessions.sh`)

**Location:** `scripts/rotate-agent-sessions.sh`

Archives old session files to keep the active directory clean.

```bash
# Normal rotation (all agents)
./scripts/rotate-agent-sessions.sh

# Dry run — see what would happen
./scripts/rotate-agent-sessions.sh --dry-run

# Single agent
./scripts/rotate-agent-sessions.sh --agent atlas

# Custom limits
./scripts/rotate-agent-sessions.sh --max-keep 50 --max-age-days 3

# With alerting
DISCORD_WEBHOOK_URL="https://..." ./scripts/rotate-agent-sessions.sh --alert
```

**What it does:**
1. Archives `.deleted.*` files (already soft-deleted by OpenClaw)
2. Archives `.jsonl` files older than 7 days
3. If still over 100 files, archives oldest until at 100
4. Backs up `sessions.json` if >5MB

**Archive structure:**
```
~/.openclaw/agents/{agent}/sessions-archive/
  2026-02-15/
    abc123.jsonl
    def456.jsonl.deleted.2026-02-14T...
  2026-02-14/
    ...
```

### 2. Session Count Monitoring (`check-session-counts.sh`)

**Location:** `scripts/check-session-counts.sh`

```bash
# Human-readable output
./scripts/check-session-counts.sh

# JSON output for automation
./scripts/check-session-counts.sh --json

# With Discord alerts for critical counts
DISCORD_WEBHOOK_URL="https://..." ./scripts/check-session-counts.sh --alert
```

**Exit codes:**
- `0` — All agents OK
- `1` — At least one agent at WARNING level
- `2` — At least one agent at CRITICAL level

### 3. Pre-Spawn Guard (`spawn-with-retry.mjs`)

The spawn wrapper now checks session file count **before** attempting a spawn:

- **<200 files:** Spawn proceeds normally
- **200-500 files:** Warning logged, spawn proceeds
- **>500 files:** Spawn blocked, error returned

This prevents wasting retries on spawns doomed to phantom-session.

### 4. Cron Schedule

| Job | Schedule | Purpose |
|-----|----------|---------|
| Session rotation | Daily 2:00 AM CST | Archive old sessions |
| Session monitoring | Every 6 hours | Alert on high counts |

```cron
# Session rotation — daily at 2 AM CST (8 AM UTC)
0 8 * * * /Users/zachgonser/clawd/ventureos/scripts/rotate-agent-sessions.sh --alert >> /Users/zachgonser/.openclaw/logs/session-rotation-cron.log 2>&1

# Session monitoring — every 6 hours
0 */6 * * * /Users/zachgonser/clawd/ventureos/scripts/check-session-counts.sh --alert --quiet >> /Users/zachgonser/.openclaw/logs/session-monitor-cron.log 2>&1
```

## Troubleshooting

### Agent spawns are failing (phantom sessions)

1. **Check counts:**
   ```bash
   ./scripts/check-session-counts.sh
   ```

2. **If >200 files, rotate immediately:**
   ```bash
   ./scripts/rotate-agent-sessions.sh --agent <name>
   ```

3. **Verify count dropped:**
   ```bash
   ls ~/.openclaw/agents/<name>/sessions/*.jsonl | wc -l
   ```

4. **Retry spawn** — should work now.

### Finding archived sessions

Archived sessions are in `~/.openclaw/agents/{agent}/sessions-archive/YYYY-MM-DD/`. They're intact `.jsonl` files — you can move them back if needed:

```bash
# Find a specific session
find ~/.openclaw/agents/atlas/sessions-archive/ -name "abc123*"

# Restore it
mv ~/.openclaw/agents/atlas/sessions-archive/2026-02-15/abc123.jsonl \
   ~/.openclaw/agents/atlas/sessions/
```

### Emergency cleanup

If rotation isn't enough and you need to act fast:

```bash
# Nuclear option: keep only the 50 newest
cd ~/.openclaw/agents/<agent>/sessions
ls -t *.jsonl | tail -n +51 | xargs -I{} mv {} /tmp/session-emergency-archive/
```

## Logs

| Log | Location |
|-----|----------|
| Rotation log | `~/.openclaw/logs/session-rotation.log` |
| Monitor log | `~/.openclaw/logs/session-monitor.log` |
| Spawn retry log | `{workspace}/runtime/logs/spawn-with-retry.log` |
| Rotation cron | `~/.openclaw/logs/session-rotation-cron.log` |
| Monitor cron | `~/.openclaw/logs/session-monitor-cron.log` |

## Design Decisions

1. **Move, don't delete.** Sessions are archived, not destroyed. We can always restore.
2. **100-file cap.** Conservative threshold well below the ~500 failure point.
3. **Pre-spawn guard.** Better to fail fast with a clear message than waste 4 retry attempts.
4. **Count all files.** Both `.jsonl` and `.deleted.*` files contribute to directory scan overhead.
5. **Daily rotation + 6h monitoring.** Belt and suspenders — rotation prevents, monitoring catches.
