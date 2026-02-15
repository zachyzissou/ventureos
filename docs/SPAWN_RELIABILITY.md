# Spawn Reliability — Preventing Phantom Sessions

> **P0 Issue #34** — Phantom sessions: `sessions_spawn` succeeds but session never starts working (0 messages forever), causing silent work loss.

## Problem Statement

When an agent spawns a subagent session, the spawn API can return a `childSessionKey` indicating success, but the session may never actually start processing. This creates a "phantom session" — a record that looks active but does zero work. No error is surfaced to the spawning agent.

**Impact:**
- 3+ incidents in 2 days (Feb 14-15, 2026)
- 12+ hours of wasted work (thinking work is happening when it's not)
- Undermines trust in multi-agent workflows

## Root Cause Analysis

### Primary Root Cause: Workspace Bloat 🔴

**Evidence:** Atlas workspace contained 102MB of SQLite files that blocked spawn:
- `main.sqlite` — 49MB
- `memory.sqlite` — 49MB
- `stanton-times.sqlite` — 4.1MB

**Mechanism:** Large files in agent workspaces cause OpenClaw to fail during session initialization. The workspace is loaded/scanned during spawn, and oversized files (especially SQLite databases) cause timeouts or memory pressure. Critically, **no error is surfaced** — the session record is created but the agent never starts processing.

**Fix:** Moved files to `QUARANTINE/` directory. Atlas immediately began spawning successfully.

**Prevention:** Workspace health monitoring (see below) + auto-quarantine of DB files > 10MB.

**Current workspace sizes (2026-02-15):**
| Agent | Size | Status |
|-------|------|--------|
| atlas | 252MB | ⚠️ High (151MB ventureos clone + 102MB quarantined) |
| synth | 650MB | 🚨 Over threshold (283MB jav-library, 155MB mobile-dash-test) |
| verifier | 222MB | ⚠️ High (222MB ventureos clone) |
| oracle | 396KB | ✅ Healthy |
| sentinel | 80KB | ✅ Healthy |
| archivist | 164KB | ✅ Healthy |

### Secondary Root Cause: Model Misconfiguration 🟡

**Evidence:** Gateway error logs show:
```
Error: Unknown model: anthropic/gpt-5.1-codex-mini
Error: Unknown model: openai-codex/does-not-exist
```

**Mechanism:** Wrong provider prefix (e.g., `anthropic/gpt-5.1-codex-mini` instead of `openai-codex/gpt-5.1-codex-mini`). Gateway allocates a session key but the lane task fails immediately. Error NOT propagated back to spawner.

### Other Contributing Factors

- **Documentation before execution:** Agent writes "dispatched" to memory before actually spawning
- **Session initialization race:** `sessions_spawn` returns success before session is truly ready
- **Context overflow:** 210k tokens > 200k limit causes cascading failures

## Architecture

### Prevention Stack

```
┌─────────────────────────────────────────────────┐
│           PREVENTION LAYER                       │
│                                                  │
│  1. Workspace Health Check (daily 3AM CST)       │
│     └─ Auto-quarantine DB files > 10MB           │
│     └─ Alert if workspace > 500MB                │
│                                                  │
│  2. Pre-Spawn Health Check (per spawn)           │
│     └─ Fail fast if workspace bloated            │
│     └─ Block spawn until workspace cleaned       │
│                                                  │
│  3. Model Pre-Validation                         │
│     └─ Provider/model format check               │
│     └─ Cross-provider mismatch detection         │
└─────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────┐
│           DETECTION LAYER                        │
│                                                  │
│  4. Post-Spawn Verification (per spawn)          │
│     └─ Poll for messages > 0 (up to 15s)         │
│     └─ Retry 3x with exponential backoff         │
│                                                  │
│  5. Phantom Detector Cron (every 30min)          │
│     └─ Scan all sessions for 0-message phantoms  │
│     └─ Alert to #nexus-mission-control           │
│     └─ Track phantom rate over time              │
└─────────────────────────────────────────────────┘
```

## Scripts

### 1. check-workspace-health.sh ⭐

**Location:** `~/clawd/ventureos/scripts/check-workspace-health.sh`

Monitors all agent workspaces for size, large files, and DB files.

**Usage:**
```bash
# Human-readable report
~/clawd/ventureos/scripts/check-workspace-health.sh

# JSON output
~/clawd/ventureos/scripts/check-workspace-health.sh --json

# With alerts
~/clawd/ventureos/scripts/check-workspace-health.sh --alert

# Auto-quarantine DB files > 10MB
~/clawd/ventureos/scripts/check-workspace-health.sh --quarantine

# Custom thresholds
~/clawd/ventureos/scripts/check-workspace-health.sh --threshold-total 300 --threshold-file 25
```

**Output (human-readable):**
```
🚨 synth: 650MB [unhealthy]
   └─ LARGE: jav-library (283MB)
⚠️ atlas: 252MB [warning]
   └─ DB: QUARANTINE/main.sqlite (49MB)
✅ oracle: 396KB [healthy]
✅ sentinel: 80KB [healthy]
```

**Output (JSON):**
```json
{
  "checkedAt": "2026-02-15T16:00:00Z",
  "unhealthyCount": 1,
  "thresholds": { "totalMB": 500, "fileMB": 50, "quarantineMB": 10 },
  "agents": [
    {
      "agent": "synth",
      "status": "unhealthy",
      "totalBytes": 681574400,
      "totalHuman": "650MB",
      "issues": ["total_size_exceeds_500MB"]
    }
  ]
}
```

### 2. spawn-with-health-check.mjs

**Location:** `~/clawd/ventureos/scripts/spawn-with-health-check.mjs`

Enhanced spawn wrapper: health check → spawn → verify → retry.

**Usage:**
```bash
node ~/clawd/ventureos/scripts/spawn-with-health-check.mjs \
  --agent synth \
  --prompt "Implement feature X" \
  --model "anthropic/claude-sonnet-4-5" \
  --max-retries 3 \
  --verify-timeout 15000 \
  --json
```

**Exit codes:**
| Code | Meaning |
|------|---------|
| 0 | Success — session spawned and verified |
| 1 | All retries exhausted (phantom every attempt) |
| 2 | Workspace unhealthy (fail fast, no spawn) |
| 3 | Configuration error |

### 3. phantom-detector.sh

**Location:** `~/clawd/ventureos/scripts/phantom-detector.sh`

Scans all agent sessions for phantoms (0 messages, missing transcripts, errors).

**Usage:**
```bash
# Manual check
~/clawd/ventureos/scripts/phantom-detector.sh

# JSON for automation
~/clawd/ventureos/scripts/phantom-detector.sh --json

# With Discord alerts
~/clawd/ventureos/scripts/phantom-detector.sh --alert
```

### 4. detect-phantom-sessions.sh

**Location:** `~/clawd/ventureos/scripts/detect-phantom-sessions.sh`

Combined cron wrapper — runs both phantom detector AND workspace health check.

**Usage:**
```bash
# Full check with alerts
~/clawd/ventureos/scripts/detect-phantom-sessions.sh --alert

# JSON output
~/clawd/ventureos/scripts/detect-phantom-sessions.sh --json
```

### 5. spawn-with-retry.mjs

**Location:** `~/clawd/ventureos/scripts/spawn-with-retry.mjs`

Lower-level retry wrapper with path isolation. Used by spawn-with-health-check.mjs internally or standalone.

### 6. test-spawn-reliability.sh

**Location:** `~/clawd/ventureos/scripts/test-spawn-reliability.sh`

Test suite for all spawn reliability scripts.

## Cron Jobs

### Workspace Health Check (Daily)
```
Schedule: 0 3 * * * @ America/Chicago
Agent: atlas
Script: check-workspace-health.sh --alert --quarantine
```

### Phantom Detector (Every 30 min)
```
Schedule: */30 * * * * @ America/Chicago
Agent: atlas
Script: detect-phantom-sessions.sh --alert
```

## Agent Protocol: Dispatch Verification

**MANDATORY for all agents spawning subagents:**

### Before Dispatch
1. ✅ Check target workspace health (or use spawn-with-health-check.mjs)
2. ✅ Validate model string format (provider/model)
3. ❌ Do NOT write "dispatched" to memory yet

### During Dispatch
1. Call `sessions_spawn` (or spawn-with-health-check.mjs)
2. Capture returned `childSessionKey`
3. Wait 15 seconds
4. Verify: `sessions_history(session=<key>, limit=1)` returns messages > 0

### After Verification
1. ✅ NOW write "dispatched" to memory with:
   - Session key, agent name, model, timestamp
   - Verification status ("VERIFIED" or "UNVERIFIED")

### Pattern Lock
```
❌ WRONG: Plan → Document "dispatched" → Spawn
✅ RIGHT: Plan → Spawn → Verify messages > 0 → Document "verified"
```

## Best Practices

### Workspace Hygiene
1. **No large files in workspaces.** Clone repos outside workspace; symlink if needed
2. **No SQLite/DB files in workspaces.** Use `/tmp/agent-<name>/` or dedicated data dirs
3. **Git clones should be shallow** (`--depth 1`) if needed at all
4. **Clean up after yourself.** Remove build artifacts, patches, temp files
5. **Monitor regularly.** Run `check-workspace-health.sh` before large dispatches

### Model Configuration
1. **Always use `provider/model` format**: `anthropic/claude-sonnet-4-5`
2. **Don't mix providers**: Not `anthropic/gpt-5.1-codex-mini`
3. **Validate before spawn**: spawn-with-health-check.mjs includes validation

## Troubleshooting

### Symptom: Session spawns but has 0 messages

1. **Check workspace size:**
   ```bash
   du -sh ~/.openclaw/workspace-<agent>
   ```
   If > 500MB, clean it up or quarantine large files.

2. **Check for large DB files:**
   ```bash
   find ~/.openclaw/workspace-<agent> -name "*.sqlite" -o -name "*.db" | xargs ls -lh
   ```
   Move to QUARANTINE if > 10MB.

3. **Check gateway logs:**
   ```bash
   grep "Unknown model" ~/.openclaw/logs/gateway.err.log | tail -5
   ```

4. **Run phantom detector:**
   ```bash
   ~/clawd/ventureos/scripts/phantom-detector.sh --json
   ```

### Symptom: Workspace health check fails

1. **Identify bloat source:**
   ```bash
   du -sh ~/.openclaw/workspace-<agent>/* | sort -rh | head -10
   ```

2. **Auto-quarantine:**
   ```bash
   ~/clawd/ventureos/scripts/check-workspace-health.sh --quarantine
   ```

3. **Manual cleanup:** Move non-essential dirs out of workspace
   ```bash
   mv ~/.openclaw/workspace-synth/jav-library ~/clawd/projects/
   ```

### Symptom: spawn-with-health-check.mjs exits with code 2

This means the pre-spawn health check failed. The workspace is too large or has DB files.

1. Run `check-workspace-health.sh` to see what's wrong
2. Clean up the workspace
3. Retry spawn with `--skip-health-check` if urgent (not recommended)

## Metrics & Logging

All scripts log to `~/clawd/ventureos/runtime/logs/`:

| File | Description |
|------|-------------|
| `workspace-health.jsonl` | Health check results |
| `workspace-quarantine.jsonl` | Quarantined files |
| `phantom-detector.jsonl` | Phantom detection events |
| `phantom-rate.jsonl` | Phantom count per scan |
| `phantom-metrics.jsonl` | Combined phantom + health metrics |
| `spawn-health-check.jsonl` | Spawn wrapper audit trail |

## Incident History

| Date | Session | Agent | Root Cause | Work Lost |
|------|---------|-------|------------|-----------|
| Feb 14 14:37 | 8fff2e9c | Synth | Documentation before execution | ~2h |
| Feb 14 21:27 | 009e7606 | Unknown | Missing JSONL (phantom) | ~1h |
| Feb 14 21:37 | c4ff07b3 | Synth | Missing JSONL (Phase 5.2) | ~3h |
| Feb 14 21:58 | e9cf9e31 | Unknown | Missing JSONL (phantom) | ~1h |
| Feb 14 22:01 | f7bad6fe | Unknown | Missing JSONL (phantom) | ~1h |
| Feb 15 00:20 | b68fdde1 | Unknown | Missing JSONL (phantom) | ~2h |
| Feb 15 01:09 | 8b16c606 | Unknown | Missing JSONL (phantom) | ~1h |
| Feb 15 01:22 | 9086ce25 | Synth | Send timeout + phantom | ~2h |
| Feb 15 10:31 | 9353433f | Synth | Phase 5.3 phantom (0 messages) | ~1h |
| **Feb 15 10:36** | **Atlas** | **Atlas** | **Workspace bloat (102MB SQLite)** | **~4h** |

**Total: ~18h work lost across 10 incidents. Root cause: workspace bloat.**

## Acceptance Criteria Status

- [x] Root cause identified (**workspace bloat** — 102MB SQLite files)
- [x] Workspace health check script (`check-workspace-health.sh`)
- [x] Spawn wrapper with health check + retry (`spawn-with-health-check.mjs`)
- [x] Phantom detector (`phantom-detector.sh`)
- [x] Combined detector cron wrapper (`detect-phantom-sessions.sh`)
- [x] Alert system (Discord webhook integration)
- [x] Documentation (this file)
- [x] Best practices documented
- [x] Troubleshooting guide
- [ ] Cron jobs registered (workspace health daily + phantom detector every 30min)
- [x] Tests (`test-spawn-reliability.sh`)
