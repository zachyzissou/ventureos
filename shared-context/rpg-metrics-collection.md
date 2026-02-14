# VentureOS RPG — Metrics Collection (Phase 2 Track 1)

**Purpose:** Replace Phase 1 bootstrap defaults with production-derived metrics files under:

- `~/clawd/runtime/rpg-metrics/<agent_id>.json`

These files are consumed by:

- `~/clawd/scripts/calculate-psionic-stats.sh`

This Track 1 work focuses on *plumbing + repeatable collection*. Some metrics (notably true human acceptance + true approval accuracy) do not yet have first-class event logs; for those, the collectors compute **best-effort proxies** from available telemetry and include debug provenance.

---

## 1) Per-agent metrics JSON schema

Schema file:

- `~/clawd/shared-context/rpg-metrics-agent.schema.json`

Required top-level fields per agent:

```jsonc
{
  "agent_id": "oracle",
  "collected_at": "2026-02-14T09:30:00-06:00",

  "memory_count": 42,
  "unique_domains": 8,
  "canonical_edits": 15,

  "p95_latency_s": 45.2,
  "mttr_minutes": 12.5,

  "acceptance_rate": 0.85,
  "success_rate": 0.92,
  "approval_accuracy": 0.88,

  "tasks_completed": 156,

  "warp_tech_inputs": {
    "...": "agent-specific"
  }
}
```

### Back-compat keys
Phase 1 scripts expect:

- `domains` (alias of `unique_domains`)
- `edits` (alias of `canonical_edits`)
- `warp` (alias of `warp_tech_inputs`)

The aggregator writes **both** the new names and the Phase 1 aliases.

---

## 2) Data source mapping (current)

### Core metrics

| Metric | Collector | Production source (today) | Notes |
|---|---|---|---|
| `memory_count` | `collect-memory-metrics.sh` | `~/.openclaw/memory/<agent>.sqlite` (preferred) or `~/.openclaw/workspace-<agent>/memory/` | Counts memory files/entries. |
| `unique_domains` | `collect-memory-metrics.sh` | Memory path categories (e.g. `context/`, `projects/`, `decisions/`, root daily logs) | Proxy for “domain diversity” until explicit tags exist. |
| `canonical_edits` | `collect-memory-metrics.sh` | **Proxy:** recent mtimes for `rpg-*.md` within `~/.openclaw/workspace-<agent>/shared-context/` | Attribution is best-effort. Replace with git/approval event log later. |
| `p95_latency_s` | `collect-session-metrics.sh` | `~/.openclaw/agents/<agent>/sessions/*.jsonl` | P95 of **user → next assistant** response latency over the lookback window. |
| `mttr_minutes` | `collect-session-metrics.sh` | `~/clawd/runtime/logs/task_runs/YYYY-MM-DD.jsonl` + `~/.openclaw/cron/jobs.json` | Proxy: time from a “failish” cron run to the next “clean” run for the same job. |
| `tasks_completed` | `collect-session-metrics.sh` | `~/.openclaw/agents/<agent>/sessions/*.jsonl` | Count of assistant turns in the lookback window. |
| `success_rate` | `collect-session-metrics.sh` | `~/.openclaw/agents/<agent>/sessions/*.jsonl` | Proxy: assistant turns without obvious stop/error signals. |
| `acceptance_rate` | `collect-session-metrics.sh` | `~/.openclaw/agents/<agent>/sessions/*.jsonl` | Proxy: “clean ok” ratio where “clean” excludes assistant messages containing obvious failure language. |
| `approval_accuracy` | `collect-session-metrics.sh` | Pending approval decision log | Proxy = `acceptance_rate` until a true approval decision log is wired. |

### Warp Technology inputs (`warp_tech_inputs`)

Collector scripts:

- `collect-oracle-metrics.sh`
- `collect-archivist-metrics.sh`
- `collect-synth-metrics.sh`
- `collect-verifier-metrics.sh`
- `collect-atlas-metrics.sh`
- `collect-sentinel-metrics.sh`
- `collect-echo-metrics.sh`
- `collect-nexus-metrics.sh`

**Current implementation:** best-effort proxies derived from session + memory telemetry (and lightweight pattern counts in workspace memory markdown). This is meant to remove bootstrap placeholders while we build first-class sources.

---

## 3) Collector scripts

All scripts live in `~/clawd/scripts/`.

### A) Session/task-run collector

- `collect-session-metrics.sh`

Outputs:

- `~/clawd/runtime/rpg-metrics/_collected/session-metrics.json`

Env:

- `LOOKBACK_DAYS` (default `7`)

### B) Memory collector

- `collect-memory-metrics.sh`

Outputs:

- `~/clawd/runtime/rpg-metrics/_collected/memory-metrics.json`

Env:

- `LOOKBACK_DAYS` (default `30`)

### C) Agent-specific Warp collectors

Each agent has a small wrapper that writes:

- `~/clawd/runtime/rpg-metrics/_collected/warp-<agent>.json`

### D) Master aggregator

- `aggregate-agent-metrics.sh`

Runs all collectors and writes final per-agent files:

- `~/clawd/runtime/rpg-metrics/oracle.json`
- `~/clawd/runtime/rpg-metrics/atlas.json`
- … (all 8)

---

## 4) Standard runbook

```bash
# 1) Generate fresh metrics JSONs
~/clawd/scripts/aggregate-agent-metrics.sh

# 2) Recompute RPG stats snapshot using the new metrics
~/clawd/scripts/calculate-psionic-stats.sh
```

---

## 5) Next upgrades (recommended)

To eliminate proxies:

1. **Acceptance events**: log “accepted / needs changes” per task output (Discord reactions, explicit user feedback, Verifier review) into a durable event log.
2. **Approval decisions**: add an `approval_decisions` table/event stream for Sentinel/Verifier.
3. **Canonical edits attribution**: instrument writes to `~/clawd/shared-context/` and Obsidian VaultZap with agent attribution.
4. **Real MTTR**: define incident lifecycle events + timestamps.

When these sources exist, update collectors to use them; the schema does not need to change.
