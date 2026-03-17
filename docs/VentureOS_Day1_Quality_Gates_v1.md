# VentureOS Day-1 Quality Gates v1

Date: 2026-03-12
Owner: Claude lane (architecture/review)
Upstream: `VentureOS_Day1_Execution_Packet.md`, `VentureOS_30_Day_Operational_Cadence_v1.md`

## Purpose

Explicit pass/fail rubric for every Day-1 checkpoint, anti-fake-evidence checks to prevent false-positive completion, and an escalation matrix when gates fail.

This document complements the Execution Packet (what to do) with how to verify it was actually done.

---

## 1. Gate definitions

Each gate maps to a checkpoint in the Day-1 Execution Packet. Every gate is binary: **PASS** or **FAIL**. There is no WARN on Day 1 — ambiguity defaults to FAIL per the ACP Execution Contract fail-closed principle.

### Gate A — Ops Sweep (09:00 CT)

| # | Check | PASS criteria | FAIL criteria |
|---|-------|---------------|---------------|
| A1 | Agent health file exists | `runtime/logs/daily/YYYY-MM-DD-agent-health.json` exists, is valid JSON, and contains a status entry for every active agent | File missing, empty, malformed JSON, or missing agent entries |
| A2 | Agent statuses are current | Every agent `last_heartbeat` timestamp is within 60 min of sweep time | Any agent heartbeat older than 60 min or field missing |
| A3 | Incident triage complete | All overnight incidents have severity, owner, and ETA assigned | Any incident missing severity, owner, or ETA |
| A4 | KPI freshness validated | `runtime/logs/daily/YYYY-MM-DD-kpi-snapshot.json` exists and records source/freshness state for active KPI feeds | File missing, stale source notes unresolved, or freshness state absent |
| A5 | Spend snapshot captured | `runtime/logs/daily/YYYY-MM-DD-spend.json` exists; all cost categories populated; total reconciles | File missing, categories missing, or total mismatches sum of line items |

**Gate A verdict:** PASS only if A1–A5 all pass.

### Gate B — Department Standup (09:30 CT)

| # | Check | PASS criteria | FAIL criteria |
|---|-------|---------------|---------------|
| B1 | Executive priorities posted | Standup entry exists with done/plan/blockers fields, all non-empty | Entry missing or any of the three fields empty |
| B2 | Operations blockers assigned | Blocker list exists; every blocker has owner and target resolution time | Missing blocker list, or any blocker without owner/target |
| B3 | Data/Analytics KPI status posted | KPI baseline refresh status entry exists with measurement status per KPI | Entry missing or KPIs unaccounted for |
| B4 | Finance variance posted | Variance summary exists with per-department delta | Entry missing or departments unaccounted for |

**Gate B verdict:** PASS only if B1–B4 all pass.

### Gate C — Handoff SLA Check (12:00 CT)

| # | Check | PASS criteria | FAIL criteria |
|---|-------|---------------|---------------|
| C1 | Handoff log exists | `runtime/logs/daily/YYYY-MM-DD-handoff-ledger.json` exists and is valid JSON | File missing or malformed |
| C2 | Timestamps present | Every handoff record has `producer_ts` and `consumer_ts` fields | Any handoff missing either timestamp |
| C3 | SLA computed | Each current-day handoff has `compliance_status` with value `on_time`, `late`, or `exception`, plus `sla_target_minutes` and derived `latency_minutes` | Canonical compliance field missing, invalid enum, or SLA instrumentation incomplete |
| C4 | Breach routing assigned | Every `late` handoff has canonical `breach_owner` and `breach_action` fields | Any late handoff missing owner/action, or owner uses non-canonical identifier |
| C5 | On-time rate >= 90% | `count(on_time) / count(total) >= 0.90` for active departments, with no unresolved `level_3` breach lacking exception approval evidence | Rate below 90%, or any `level_3` breach without approval evidence |

**Gate C verdict:** PASS only if C1–C5 all pass.

### Gate D — Evidence Closeout (16:30 CT)

| # | Check | PASS criteria | FAIL criteria |
|---|-------|---------------|---------------|
| D1 | All daily artifacts exist | Every file listed in Execution Packet §Must-produce artifacts is present at the expected path | Any file missing |
| D2 | Artifacts non-empty and schema-valid | Each JSON file parses without error; each has > 0 data records | Empty file, parse error, or zero records |
| D3 | Decision log finalized | `runtime/logs/daily/YYYY-MM-DD-decision-log.md` exists; every open item has owner + due date | File missing, or any open item without owner/due date |
| D4 | Next-day priorities posted | Top 3 priorities for next business day are listed with owners | Fewer than 3 priorities or any missing owner |
| D5 | Evidence completeness self-check | `runtime/reports/evidence/evidence-validate-latest.json` exists and lists all required files with present/missing status | File missing or any required file marked missing |

**Gate D verdict:** PASS only if D1–D5 all pass.

### Gate E — End-of-Day Go/No-Go

| # | Check | PASS criteria | FAIL criteria |
|---|-------|---------------|---------------|
| E1 | Gates A–D all passed | All four gate verdicts are PASS | Any gate verdict is FAIL |
| E2 | No unresolved P0 incidents | Zero open P0 incidents at 17:00 CT | Any P0 incident without resolution |
| E3 | Handoff on-time rate >= 90% | Gate C5 passed | Gate C5 failed |
| E4 | Decision log complete | Gate D3 passed | Gate D3 failed |

**Go/No-Go verdict:** GO only if E1–E4 all pass. Otherwise NO_GO.

---

## 2. Anti-fake-evidence checks

These checks prevent agents or lanes from claiming completion with fabricated, copied, or trivially generated evidence. They apply to every artifact produced during Day 1.

### 2.1 Structural integrity

| Check | Method | FAIL signal |
|-------|--------|-------------|
| Schema validation | Parse each JSON artifact against expected schema (fields, types, enums) | Unexpected fields, wrong types, missing required fields |
| Non-trivial content | Verify data records contain distinct, plausible values | All records identical, all zeros, placeholder strings (`"TBD"`, `"test"`, `"lorem"`) |
| Timestamp plausibility | All timestamps fall within today's date range (00:00–23:59 CT) | Timestamps from other dates, future dates, or Unix epoch (0) |
| Internal consistency | Totals match sum of line items; counts match array lengths | Arithmetic mismatches |

### 2.2 Cross-reference checks

| Check | Method | FAIL signal |
|-------|--------|-------------|
| Agent list match | Agent health file lists the same agents as the deployment manifest | Agents in health file not in manifest, or vice versa |
| Spend reconciliation | Daily spend total is within 20% of prior day (or first-day baseline is non-zero) | Spend exactly $0.00 when agents ran, or implausible spikes without explanation |
| Handoff producer/consumer match | Both sides of a handoff have matching IDs and compatible timestamps | Orphaned handoffs (producer with no consumer, or reverse) |
| Decision log cross-ref | Decisions reference real blockers or incidents from earlier in the day | Decision log references items not found in any other artifact |

### 2.3 Provenance checks

| Check | Method | FAIL signal |
|-------|--------|-------------|
| File creation timing | Git commit or file `mtime` falls within the cadence window for its gate | File predates the cycle or is backdated |
| Author attribution | Artifact has identifiable producing agent/lane | No authorship metadata |
| Copy detection | Diff against prior day's artifacts; content must not be byte-identical | Byte-identical to a previous day's file (excluding schema-only files) |

---

## 3. Escalation matrix

When a gate fails, escalation follows this path with strict SLAs.

### 3.1 Escalation levels

| Level | Trigger | Escalated to | Response SLA | Action required |
|-------|---------|-------------|--------------|-----------------|
| L0 — Self-heal | Single non-critical check fails (B1–B4, D4) | Producing agent/lane | 30 min | Re-produce artifact; log correction in decision log |
| L1 — Operator | Gate A or Gate C fails, or L0 not resolved in 30 min | Department Operator | 1 hour | Diagnose root cause; produce missing evidence; log incident |
| L2 — Director | Gate D fails, or L1 not resolved in 1 hour, or anti-fake-evidence check fails | Department Director + Operations Director | 2 hours | Assign remediation owner; open incident; decide if cycle continues or halts |
| L3 — Executive | Gate E yields NO_GO, or any P0 incident, or L2 not resolved in 2 hours | Executive Director | 4 hours | Issue directive; invoke remediation plan from Execution Packet §Remediation; freeze expansion |

### 3.2 Anti-fake-evidence escalation

Anti-fake-evidence failures always escalate to **minimum L2** regardless of which gate they occur in.

| Fake-evidence type | Escalation | Additional action |
|--------------------|------------|-------------------|
| Placeholder/trivial data | L2 — Director | Flag producing lane for audit; require re-execution with supervision |
| Byte-identical copy from prior cycle | L2 — Director | Invalidate artifact; require fresh production with provenance proof |
| Timestamp manipulation | L3 — Executive | Halt lane; full audit of all artifacts from that lane; incident report |
| Schema-valid but logically impossible data | L2 — Director | Cross-reference against source systems; require independent verification |

### 3.3 Escalation log format

Every escalation must be logged with these fields:

```json
{
  "escalation_id": "ESC-YYYY-MM-DD-NNN",
  "gate": "A|B|C|D|E",
  "check": "A1|B2|...",
  "level": "L0|L1|L2|L3",
  "timestamp": "ISO-8601",
  "escalated_to": "role/agent",
  "root_cause": "description",
  "resolution": "description or PENDING",
  "resolved_at": "ISO-8601 or null"
}
```

---

## 4. Day-1 quality gate execution checklist

Run this at each checkpoint. The verifying agent must be different from the producing agent (per ACP Execution Contract §Verification gate).

### 09:00 CT — Gate A
- [ ] A1: `runtime/logs/daily/YYYY-MM-DD-agent-health.json` exists and is valid
- [ ] A2: All heartbeats within 60 min
- [ ] A3: All incidents triaged with severity/owner/ETA
- [ ] A4: `runtime/logs/daily/YYYY-MM-DD-kpi-snapshot.json` exists; freshness state recorded
- [ ] A5: `runtime/logs/daily/YYYY-MM-DD-spend.json` exists; totals reconcile
- [ ] Anti-fake: Non-trivial content, plausible timestamps, agent list matches manifest
- [ ] **Gate A verdict:** PASS / FAIL

### 09:30 CT — Gate B
- [ ] B1: Executive standup posted (done/plan/blockers)
- [ ] B2: Blockers assigned with owner + target
- [ ] B3: Data/Analytics KPI status posted
- [ ] B4: Finance variance posted
- [ ] Anti-fake: Standup content is specific to today (not recycled)
- [ ] **Gate B verdict:** PASS / FAIL

### 12:00 CT — Gate C
- [ ] C1: Handoff ledger exists and is valid JSON
- [ ] C2: All handoffs have producer/consumer timestamps
- [ ] C3: SLA status computed for each handoff
- [ ] C4: Breach actions assigned for late handoffs
- [ ] C5: On-time rate >= 90%
- [ ] Anti-fake: Handoff IDs cross-reference between producer and consumer logs
- [ ] **Gate C verdict:** PASS / FAIL

### 16:30 CT — Gate D
- [ ] D1: All must-produce artifacts present
- [ ] D2: Artifacts non-empty and schema-valid
- [ ] D3: Decision log finalized (all items have owner + due date)
- [ ] D4: Next-day top 3 priorities posted with owners
- [ ] D5: Evidence completeness self-check file exists
- [ ] Anti-fake: No byte-identical copies; timestamps within today; totals reconcile
- [ ] **Gate D verdict:** PASS / FAIL

### 17:00 CT — Gate E (Go/No-Go)
- [ ] E1: Gates A–D all PASS
- [ ] E2: Zero open P0 incidents
- [ ] E3: Handoff on-time rate >= 90%
- [ ] E4: Decision log complete
- [ ] **Gate E verdict:** GO / NO_GO

---

## 5. Path and naming alignment

This document uses `runtime/logs/` for canonical evidence and `runtime/reports/evidence/` for derived validation summaries.

Canonical structure:
```
runtime/logs/
  daily/          # All daily evidence outputs (D-1 through D-4)
  weekly/         # Weekly cadence outputs
  monthly/        # Monthly cadence outputs
  incidents/      # Incident logs

runtime/reports/
  evidence/       # Derived validation summaries
```

---

## 6. Rollback note

If this document introduces confusion or conflicts with active operations:
1. Revert this file: `git revert <commit-sha>`
2. Continue using the Execution Packet and 30-Day Cadence as standalone references.
3. No runtime systems depend on this document; reverting has zero operational impact.
