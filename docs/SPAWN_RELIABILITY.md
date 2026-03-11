# Spawn Reliability — Preventing Phantom Sessions

**GitHub Issue:** [#34 — Phantom Sessions: Silent Work Loss](https://github.com/zachyzissou/ventureos/issues/34)  
**Priority:** P0  
**Last updated:** 2026-02-15 (v2 — false positive fix)

> **Definition:** A *phantom session* is a spawned session that returns `{ status: "accepted" }` / a `childSessionKey`, but never actually begins producing messages / doing work (or starts after an extreme delay), with no error surfaced to the spawning agent.

---

## Executive Summary

We’ve observed multiple phantom-session incidents (Feb 14–15, 2026) where subagent work was silently lost or significantly delayed.

**Primary, VentureOS-controllable causes:**
1. **Workspace bloat / oversized files** (especially SQLite DBs) causing session initialization to stall or fail without a propagated error.
2. **Configuration mistakes** (unknown model/provider strings) that fail early in the gateway, again without being surfaced to the spawner.

**Platform-level contributing cause (OpenClaw):**
3. **Global lane contention** (all subagents queued through a single `subagent` lane with `maxConcurrent=1`) leading to long “accepted-but-not-started-yet” delays.
4. **Silent error swallowing** in subagent completion waiting (`catch {}`), preventing the parent from learning about failures.

**Mitigation (implemented in VentureOS):**
- Workspace health monitoring + optional auto-quarantine of large DB files
- Pre-spawn health checks (fail fast)
- Post-spawn verification (ensure the child session produces output)
- Retry with backoff + alerting when phantom rate increases

---

## Symptoms & Impact

**Symptoms:**
- `sessions_spawn` returns success + `childSessionKey`
- Child session has **0 messages** indefinitely, or starts only after minutes
- Spawning agent reports “dispatched” but no work arrives

**Impact:**
- Wasted time due to assuming work is executing
- Lost subagent outputs (silent failure)
- Reduced trust in multi-agent workflows

---

## Root Cause Analysis

### 1) Workspace Bloat (Primary) 🔴

**Evidence:** Oversized SQLite files in agent workspaces blocked or destabilized spawn:
- `main.sqlite` — ~49MB
- `memory.sqlite` — ~49MB
- `stanton-times.sqlite` — ~4.1MB

**Mechanism:** During session initialization, large files in workspace context can trigger timeouts / memory pressure / slow scans. Critically, the spawn can be *accepted* while the child never actually begins executing.

**Fix applied:** move large DB files to `QUARANTINE/` (or out of workspace). Spawns immediately recovered.

**Prevention:** workspace health monitoring + auto-quarantine DB files > 10MB.

### 2) Model Misconfiguration 🟡

**Evidence:** Gateway logs (examples):
```
Error: Unknown model: anthropic/gpt-5.1-codex-mini
Error: Unknown model: openai-codex/does-not-exist
```

**Mechanism:** Wrong provider/model string causes gateway task failure after a session key is allocated. Error is not reliably propagated back to the spawner.

### 3) Global Lane Contention (OpenClaw) 🟡→🔴

OpenClaw serializes agent work through a **lane-based queue system**. In observed builds, subagent runs share a global lane:

```
Lane Types:
├── session:<sessionKey>   — per-session lane (maxConcurrent=1)
├── main                   — global main lane
├── cron                   — global cron lane
├── subagent               — global subagent lane (maxConcurrent=1)  ← bottleneck
└── nested                 — global nested lane
```

**Impact:** multiple subagent spawns can be “accepted” but sit queued behind a long-running task; the child may not start for 1–20 minutes.

**Evidence from logs (example):** a child session started ~19 minutes after spawn acceptance.

### 4) Silent Error Swallowing (OpenClaw)

In some builds, subagent completion waiting logic swallows errors (`catch {}`), making failures invisible to the parent.

---

## Phantom Session Taxonomy

| Type | Likely Cause | Frequency | Duration |
|------|--------------|-----------|----------|
| **Slow Start** | Global lane contention | High | 1–20 min |
| **Init Stall** | Workspace bloat / large DBs | High | Permanent or long |
| **Immediate Fail** | Unknown model / config error | Medium | Permanent |
| **Silent Drop** | Gateway/agent error swallowed | Low | Permanent |
| **Gateway Restart** | Restart mid-spawn | Rare | Permanent |

---

## Mitigation Strategy (VentureOS Layer)

### Prevention
1. **Workspace Health Check** (scheduled + on-demand)
   - Alert if workspace is over a threshold (e.g., 500MB)
   - Detect large DB files and optionally quarantine
2. **Pre-spawn Health Check**
   - Fail fast if workspace is unhealthy
3. **Model Pre-Validation**
   - Validate `provider/model` strings

### Detection & Recovery
4. **Post-spawn verification**
   - Poll child session for messages > 0 for up to N seconds
5. **Retry with exponential backoff**
   - Re-spawn if verification fails
6. **Alerting + metrics**
   - Track phantom rate; notify when above threshold

---

## Scripts

### 1) `scripts/check-workspace-health.sh`
Monitors all agent workspaces for total size and large files.

Examples:
```bash
# Human report
./scripts/check-workspace-health.sh

# JSON
./scripts/check-workspace-health.sh --json

# Alert + auto-quarantine DB files > 10MB
./scripts/check-workspace-health.sh --alert --quarantine
```

### 2) `scripts/spawn-with-health-check.mjs`
Spawn wrapper: health check → spawn → verify → retry.

Example:
```bash
node ./scripts/spawn-with-health-check.mjs \
  --agent synth \
  --prompt "Implement feature X" \
  --model "anthropic/claude-sonnet-4-5" \
  --max-retries 3 \
  --verify-timeout 15000 \
  --json
```

### 3) `scripts/phantom-detector.sh`
Scans sessions for phantoms (0 messages, missing transcripts, etc.).

### 4) `scripts/detect-phantom-sessions.sh`
Cron wrapper: runs phantom detector + workspace health check.

---

## Agent Protocol: Dispatch Verification

**MANDATORY when spawning subagents:**

1. **Before dispatch**
   - Check target workspace health (or use `spawn-with-health-check.mjs`)
   - Validate model string
   - Do **not** write “dispatched” to memory yet
2. **Dispatch**
   - Spawn
   - Capture `childSessionKey`
3. **Verify**
   - Wait up to 15s (configurable)
   - Confirm child produces at least 1 message
4. **Document**
   - Only after verification, record “dispatched (verified)”

---

## Recommendations (OpenClaw Layer)

1. Increase `maxConcurrent` for the global `subagent` lane (e.g., 3–5)
2. Remove / log swallowed errors in subagent wait logic
3. Add lifecycle events: queued vs started vs running
4. Add a gateway status API to confirm a session has actually started

---

## Incident History (Partial)

| Date | Session | Agent | Root Cause | Notes |
|------|---------|-------|------------|------|
| Feb 14–15 | multiple | various | lane contention / init stall | 0 messages or extreme start delay |
| Feb 15 | atlas | atlas | workspace bloat (SQLite) | resolved by quarantine |

---

## Acceptance Criteria Status

- [x] Root causes identified (workspace bloat + config errors + lane contention)
- [x] Workspace health check script
- [x] Spawn wrapper: health check + verify + retry
- [x] Phantom detector (v2 — fixed false positives)
- [x] Documentation (this file)
- [ ] Cron jobs registered (health daily + phantom scan every 30min)

---

## v2 Fix: False Positive Elimination (2026-02-15)

### Problem

The phantom-detector.sh script was reporting **13 false positives** — sessions that were actually functioning normally (61-267 messages each) were being flagged as "zero_messages" phantoms.

### Root Cause

**Bug in message counting logic.** The detector's jq query looked for `.value.messages` array in the `sessions.json` index:

```jq
messageCount: ((.value.messages // []) | length),
```

But **`sessions.json` does NOT contain a `messages` array**. Messages are stored in separate `{sessionId}.jsonl` transcript files. The `.messages` field doesn't exist in the index, so `(.value.messages // []) | length` always returns `0`, flagging every subagent session as phantom.

### Fix

1. **Count messages from .jsonl files** — The detector now reads the actual transcript file (`{sessionId}.jsonl`) and counts lines with `"type":"message"`.
2. **Fixed `grep -c` bug** — `grep -c` returns exit code 1 when count is 0 (even though it outputs "0"). Combined with `|| echo "0"`, this produced `"0\n0"` which broke bash arithmetic. Fixed to capture output first, then fallback.
3. **Fixed empty PHANTOMS array** — JSON output was malformed when no phantoms found.
4. **Added spawn-health-check.sh** — Post-spawn polling that verifies transcript file has messages within a configurable timeout.

### Test Results

16/16 tests passing including:
- **Test 11:** Exact reproduction of the production false positive (0e84becd with 61 messages correctly NOT flagged)
- **Test 2:** Session with messages correctly NOT flagged
- **Test 3:** Session with zero messages correctly flagged
- **Test 4:** Missing transcript file correctly flagged
- **Test 9:** Transcript with only headers (no messages) correctly flagged

### Impact

- **Before fix:** 13 sessions falsely reported as phantoms, causing unnecessary panic alerts
- **After fix:** 0 false positives, only real phantoms are detected
