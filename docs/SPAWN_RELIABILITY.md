# Spawn Reliability: Phantom Sessions Root Cause & Fix

**GitHub Issue:** [#34 - Phantom Sessions: Silent Work Loss](https://github.com/zachyzissou/ventureos/issues/34)  
**Priority:** P0  
**Author:** Atlas (Infrastructure/Ops Agent)  
**Date:** 2026-02-15  

---

## Executive Summary

Phantom sessions occur when `sessions_spawn` returns `{ status: "accepted" }` but the spawned agent never starts executing. Investigation traced the root cause to **three architectural issues** in OpenClaw's gateway:

1. **Global lane bottleneck** — All subagent runs share a single `"subagent"` lane with `maxConcurrent=1`
2. **Silent error swallowing** — `waitForSubagentCompletion()` uses `catch {}`, silently losing errors
3. **No start verification** — No mechanism exists to verify an agent actually began executing after spawn acceptance

---

## Root Cause Analysis

### Architecture: The Lane System

OpenClaw's gateway serializes agent work through a **lane-based queue system**:

```
Lane Types:
├── session:<sessionKey>   — per-session lane (maxConcurrent=1)
├── main                   — global main lane
├── cron                   — global cron lane  
├── subagent               — global subagent lane (maxConcurrent=1) ← THE BOTTLENECK
└── nested                 — global nested lane
```

Every `runEmbeddedPiAgent()` call goes through **double-queue serialization**:

```javascript
// pi-embedded-KOoEAxbq.js:66693
return enqueueSession(() => enqueueGlobal(async () => {
    // ... actual agent work
}));
```

This means each agent run must:
1. Acquire its **session lane** slot (usually fast — each subagent gets a unique session)
2. Acquire the **global lane** slot (THIS IS THE BOTTLENECK)

### The Bottleneck

All subagent spawns use `lane: AGENT_LANE_SUBAGENT = "subagent"`:

```javascript
// pi-embedded-KOoEAxbq.js:34185
lane: AGENT_LANE_SUBAGENT,  // = CommandLane.Subagent = "subagent"
```

The lane system initializes every lane with `maxConcurrent: 1`:

```javascript
// pi-embedded-KOoEAxbq.js:725
const created = {
    lane,
    queue: [],
    activeTaskIds: new Set(),
    maxConcurrent: 1,  // ← ONLY ONE SUBAGENT AT A TIME, GLOBALLY
    draining: false,
    generation: 0
};
```

**Impact:** If 3 subagents are spawned, they execute sequentially. If a subagent takes 5 minutes, the next one waits 5+ minutes just to start.

### Evidence from Logs

Session `9086ce25` full lifecycle:
```
01:22:59  PHANTOM: No JSONL file found              ← Agent checking for output
01:25:06  Session not found in sessions list         ← Still not started
01:32:22  Session Send failed: timeout               ← Send attempt times out
01:41:31  [agent:nested] session=...9086ce25 output  ← FINALLY STARTS (19 min later!)
07:32:11  lane wait exceeded: waitedMs=77235         ← Lane contention evidence
```

Lane contention evidence (24 hours):
```
lane=session:agent:nexus:... waitedMs=142717 queueAhead=1   ← 2.4 MINUTES
lane=session:agent:nexus:... waitedMs=136631 queueAhead=0   ← 2.3 MINUTES  
lane=session:agent:nexus:... waitedMs=120488 queueAhead=1   ← 2 MINUTES
lane=session:agent:synth:... waitedMs=77235  queueAhead=0   ← 1.3 MINUTES
```

Discord listener slowness (cascading effect):
```
Slow listener: DiscordMessageListener took 309.6 seconds
Slow listener: DiscordMessageListener took 255 seconds
Slow listener: DiscordMessageListener took 251.9 seconds
```

### Silent Error Swallowing

```javascript
// pi-embedded-KOoEAxbq.js:10003
async function waitForSubagentCompletion(runId, waitTimeoutMs) {
    try {
        // ... wait for agent.wait ...
        // ... announce results ...
    } catch {}  // ← SILENTLY SWALLOWS ALL ERRORS
}
```

If `agent.wait` throws (timeout, connection error, etc.), the error vanishes. The spawning agent never learns that the subagent failed to complete.

### No Start Verification

The `sessions_spawn` tool returns immediately after the gateway accepts the request:

```javascript
// pi-embedded-KOoEAxbq.js:34175-34185  
const response = await callGateway({
    method: "agent",
    params: { ... },
    timeoutMs: 1e4  // 10 second timeout just for acceptance
});
// Returns immediately with { status: "accepted" }
```

There is no follow-up check that the agent actually started executing. The `registerSubagentRun` + `waitForSubagentCompletion` flow monitors for completion but doesn't detect the "never started" case.

---

## Phantom Session Taxonomy

| Type | Cause | Frequency | Duration |
|------|-------|-----------|----------|
| **Slow Start** | Global lane contention | High | 1-20 min |
| **Timeout Kill** | Embedded run timeout (60-300s) | Medium | Session is killed |
| **Silent Drop** | Error in `agentCommand` swallowed | Low | Permanent |
| **Gateway Restart** | Gateway restarts mid-spawn | Rare | Permanent |

---

## Mitigation Strategy

### What We CAN Control (VentureOS Layer)

Since the lane system is internal to OpenClaw (we can't modify it), our mitigation operates at the **spawn wrapper level**:

1. **Post-spawn verification** — Check that the agent actually started producing output
2. **Phantom detection** — Monitor for sessions that were spawned but never started
3. **Retry with backoff** — Re-spawn if verification fails
4. **Alerting** — Notify when phantom rate exceeds threshold

### What Would Fix It (OpenClaw Layer)

These are recommendations for the OpenClaw team:
1. Increase `maxConcurrent` for the `subagent` lane (e.g., 3-5)
2. Remove `catch {}` in `waitForSubagentCompletion`
3. Add lifecycle events for "agent queued" vs "agent started"
4. Add `agent.status` gateway method to check if a run has started

---

## Incident Log

| # | Date | Session | Agent | Wait Time | Outcome |
|---|------|---------|-------|-----------|---------|
| 1 | 2/14 22:01 | f7bad6fe | — | Unknown | Phantom (no JSONL) |
| 2 | 2/15 00:20 | b68fdde1 | — | Unknown | Phantom (no JSONL) |
| 3 | 2/15 01:09 | 8b16c606 | — | Unknown | Phantom (no JSONL) |
| 4 | 2/15 01:22 | 9086ce25 | synth | ~19 min | Eventually started |
| 5 | 2/15 ~10:30 | 6366fdfc | atlas | Unknown | Phantom (this dispatch) |

---

## Files

- `scripts/phantom-detector.mjs` — Detects phantom sessions from gateway logs
- `scripts/spawn-with-retry.mjs` — Enhanced spawn wrapper with verification (updated)
- `docs/SPAWN_RELIABILITY.md` — This document
