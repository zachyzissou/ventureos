# VentureOS RPG — Phase 2 Validation + VOXYZ Comparison

Date: 2026-02-14 (America/Chicago)
Validator: Verifier subagent (automated checks + spot verification)

Scope: Phase 2 Tracks 1–5 (Track 6 deferred)
Reference: `~/clawd/shared-context/voxyz-rpg-reference.md`

---

## Executive Summary

Phase 2 is **functionally implemented and mostly operational**, but there are **two correctness risks** that keep this from being “safe to run daily” without follow-up fixes:

1) **Potential double-application of escalation drift** (drift applied in `validate-escalation.sh` *and* again by the daily `update-khala-drift.sh` pass).
2) **Observation counting bug when only one observations file exists** (`rg --count` output format) affecting both memory sync and protocol trigger engine.

Additional operational risk:
- **Two cron jobs scheduled for the same minute (06:20)** that both write to `personality_activations` (SQLite locking/race risk).

**Overall verdict:** **NEEDS_CHANGES (Medium severity)** before Phase 3.

---

## Track Verification (PASS/FAIL)

### Track 1 — Real Metrics Ingestion (Synth)

**Status: PASS**

**Deliverables verified:**
- Metrics JSON present for all 8 agents:
  - `~/clawd/runtime/rpg-metrics/{archivist,atlas,echo,nexus,oracle,sentinel,synth,verifier}.json` ✅
- “Real” (non-bootstrap) data present (derived from session logs + memory + warp proxies): ✅
  - Example (`archivist.json`): `tasks_completed: 494`, `p95_latency_s: 10.113`, `acceptance_rate: 0.8968`, plus `_sources` pointers.
  - Note: `nexus.json` is all zeros because sources show **0 session files / 0 turns**; this is still a real measurement (absence-of-data), not hardcoded defaults.
- Integration with `calculate-psionic-stats.sh`: ✅
  - Script loads per-agent metrics from `METRICS_DIR=~/clawd/runtime/rpg-metrics` and merges `warp_tech_inputs` into the `warp` input map.
- Test run: ✅
  - Running `~/clawd/scripts/aggregate-agent-metrics.sh` updated mtimes for all 8 JSON files.
  - Running `~/clawd/scripts/calculate-psionic-stats.sh` updated `psionic_stats.calculated_at` and produced non-default stats consistent with the ingested metrics.

Evidence snapshot (post-test):
- Metrics mtimes: `2026-02-14 04:55:43` for all 8 JSON files.

---

### Track 2 — Drift Tracking Engine (Oracle)

**Status: PASS (with an important Track-4 interaction caveat)**

**Deliverables verified:**
- Scripts exist and are executable: ✅
  - `~/clawd/scripts/log-interaction.sh`
  - `~/clawd/scripts/update-khala-drift.sh`
- `khala_drift_history` populated with test data: ✅
  - Current row count observed: **51**
- Drift policy functional: ✅
  - `~/clawd/scripts/test-drift-scenarios.sh` ran successfully:
    - Updated affinities within bounds `[0.10, 0.95]`
    - Enforced retention: **max 20 records per pair**
- Drift cron job exists (daily 06:15 CST): ✅
  - OpenClaw job:
    - **ID:** `cd057528-9ec1-4b2d-9eb8-bee42f0edf1a`
    - **Schedule:** `15 6 * * *` (tz `America/Chicago`)
    - **Name:** “Daily Khala Drift Update (VentureOS RPG)”
- Idempotency verified: ✅
  - Immediate rerun of `update-khala-drift.sh` produced **0 new drift rows** (state file gating works).

**Caveat (cross-track):** escalation-related drift is also applied in `validate-escalation.sh` (Track 4). Unless `update-khala-drift.sh` excludes escalation interactions or has per-interaction idempotency, **escalation drift can be applied twice**.

---

### Track 3 — Observational Memory Integration (Archivist)

**Status: PASS (with a counting bug)**

**Deliverables verified:**
- Sync script exists and is executable: ✅
  - `~/clawd/scripts/sync-memory-to-rpg.sh`
- Mapping documented: ✅
  - `~/clawd/shared-context/rpg-memory-integration.md` includes pattern→protocol rules + thresholds.
- `personality_activations` table structure present: ✅
  - Columns include `agent_id`, `protocol_id`, `protocol_type`, `trigger_condition`, `activated_at`, `deactivated_at`.
- Memory sync cron job exists (daily 06:20 CST): ✅
  - OpenClaw job:
    - **ID:** `aedb753e-0310-4f04-b5f4-b005fc530b98`
    - **Schedule:** `20 6 * * *` (tz `America/Chicago`)
    - **Name:** “Daily Memory→RPG Sync (VentureOS RPG)”

**Test run:**
- Sync runs end-to-end and writes activations.
- **Observed bug:** observation counting via `rg --count` breaks when only **one** `*.md` file exists in the observations directory:
  - `rg --count` returns just `"8"` (no `file:count`), but the code expects `file:count` and sums `$2`, producing **0**.
  - This affects **base protocol activation** like `reference_outcomes` early on.

**Fix recommendation (small, but important):**
- In both memory sync and protocol engine, use `rg --count --with-filename ...` OR change the awk to handle “count-only” output.

---

### Track 4 — Escalation Quality Tracking (Sentinel)

**Status: PASS (but drift consistency needs cleanup)**

**Deliverables verified:**
- Scripts exist and are executable: ✅
  - `~/clawd/scripts/log-escalation.sh`
  - `~/clawd/scripts/validate-escalation.sh`
  - `~/clawd/scripts/calculate-escalation-quality.sh`
- `escalations` table contains test data: ✅
  - Current row count observed: **15** (from test scenarios)
- Self-validation rejection (anti-gaming) works: ✅
  - `validate-escalation.sh` blocks `validator == escalated_by`.
  - Validator allowlist enforced: only `verifier` and `echo`.
- Informational monitoring present in quality report: ✅
  - Report includes “Informational Escalation Monitoring” with a **30% alert threshold**.
- Monthly drift idempotency: ✅
  - Marker file present: `~/clawd/runtime/tmp/escalation-monthly-drift-last-run.txt` contains `2026-02`.
  - Running with `--apply-drift` correctly skips duplicate application for the month.

**Drift consistency concern:**
- Docs (`rpg-drift-policy.md`) define **severity-weighted** drift deltas for escalation validation.
- `validate-escalation.sh` implements severity-weighted deltas and writes to `khala_drift_history`.
- But `update-khala-drift.sh` also processes `interaction_logs` of type `escalation` using fixed deltas (`+0.04/-0.05/+0.02`) and **no severity**.

This creates a real risk of:
- **double drift** for the same escalation event (once at validation, once during daily drift processing)
- **inconsistent deltas** compared to policy (severity-weighted vs fixed)

---

### Track 5 — Personality Protocols (Synth)

**Status: PASS (with same obs-count edge bug + cron concurrency risk)**

**Deliverables verified:**
- Protocol trigger engine exists: ✅
  - `~/clawd/scripts/check-protocol-triggers.sh`
- 15 protocols defined (4 base + 11 agent-specific): ✅
  - Unique protocol IDs detected in engine: 
    - `reference_outcomes`, `use_frameworks`, `show_confidence`, `mentor_mode`
    - `cite_precedents`, `proactive_monitoring`, `autonomous_delegation`, `proactive_documentation`, `test_first_discipline`, `code_review_checklist`, `context_requirement_enforcement`, `priority_stack_enforcement`, `pattern_extraction`, `false_positive_cooldown`, `escalation_quality_mode`
- Protocol cron job exists (daily 06:20 CST): ✅
  - OpenClaw job:
    - **ID:** `c325a977-9c45-4dca-930d-c27a1e1ae658`
    - **Schedule:** `20 6 * * *` (tz `America/Chicago`)
    - **Name:** “Daily Protocol Trigger Check (VentureOS RPG)”
- Activation/deactivation scripts exist and are idempotent: ✅
  - `~/clawd/scripts/activate-protocol.sh`
  - `~/clawd/scripts/deactivate-protocol.sh`
- Integration test exists and passes (safe via temp DB): ✅
  - `~/clawd/scripts/test-protocol-activations.sh` produces a report in `~/clawd/shared-context/`.

**Issues:**
- Same single-file `rg --count` edge case exists in `check-protocol-triggers.sh` (`count_obs_tag`).
- Cron concurrency: memory sync and protocol triggers are both scheduled at **06:20**, and both write to `personality_activations`.

---

## VOXYZ Pattern Comparison (Phase 2)

| VOXYZ Feature | Our Implementation | Assessment |
|---|---|---|
| Drift tracking after interactions | `interaction_logs` + `update-khala-drift.sh` + `khala_drift_history` retention (20/pair) + cron 06:15 | **Mostly aligned**. Deterministic + debuggable. Differences: some deltas exceed VOXYZ ±0.03, and escalation severity weighting is split across scripts (risk of double drift). |
| Relationship affinity influences behavior | Affinity updated in DB; no routing/speaking-order/mentor selection integration yet | **Partial** (data exists, not operationalized). Equivalent to VOXYZ storage, missing VOXYZ “affinity affects behavior” outcomes. |
| Quality-gated evolution | `personality_activations` driven by metrics, escalation quality ratios, and memory patterns | **Aligned**. Deterministic, auditable activation. |
| Deterministic voice modifiers | Protocols represent deterministic modifiers; injection into runtime prompts is documented but not fully enforced in orchestration | **Partial**. Engine exists; needs guaranteed prompt-injection path to match VOXYZ “voice modifiers derived from state.” |
| Hard bans + guardrails | Anti-gaming in escalation validation (no self-validation, allowlist); idempotent monthly drift; informational escalation monitoring | **Partial**. Strong guardrails in escalation system; still missing VOXYZ-style explicit role-card hard bans enforced everywhere. |
| Baseline/window strategy | Session metrics 7d, memory proxy 30d; drift lookback 24h; drift retention 20/pair | **Aligned** (windowing + retention are explicit). Recommend making baselines first-class for reporting (optional). |

---

## Gap Analysis (Phase 2-specific)

### What VOXYZ has that we don’t (yet)
- **Affinity-driven behavior shaping** (ordering, challenge probability, mediator selection) — our affinity updates aren’t connected to orchestration/routing.
- **Single-source-of-truth drift application** — VOXYZ drift is “after each conversation” with a single record per pair per conversation; we currently have drift split across scripts with potential duplication.
- **Deterministic voice modifier computation from structured memory types/tags/confidence** — we have protocols and a markdown-tag approach, but not a full “deriveVoiceModifiers()” style canonical system.
- **Explicit role cards with hard bans per agent** as an enforceable schema (beyond partial scripting guardrails).

### Blockers to production use (safe daily operation)
- **Double drift risk on escalation events** (medium severity): can distort affinities quickly and invalidate long-term meaning.
- **Cron collision at 06:20** (medium severity): two DB writers at same minute may trigger SQLite locks or nondeterministic activation states.
- **Single-file observation counting bug** (low-to-medium severity): early-stage deployments (few observation files) will undercount and fail to activate base protocols.

### What’s missing for full behavioral evolution
- Track 6 (bond-influenced behavior) integration into routing/speaking/mentor selection.
- Guaranteed protocol injection path into agent prompts (so activated protocols actually change behavior deterministically).

---

## Production Readiness Assessment

**Decision:** **NEEDS_CHANGES**

The system is close, but two fixes are recommended before trusting daily drift + protocol evolution:

1) **Unify escalation drift application**
   - Pick one:
     - (A) drift applied only in `update-khala-drift.sh` (then remove drift writes from `validate-escalation.sh`), or
     - (B) drift applied only in `validate-escalation.sh` (then make `update-khala-drift.sh` skip `interaction_type='escalation'`), or
     - (C) add `interaction_id` to `khala_drift_history` + unique constraint for per-event idempotency.

2) **Stagger cron jobs**
   - Move memory sync to e.g. **06:18** and protocol triggers to **06:22**, or chain them in one job to avoid DB contention.

3) **Fix `rg --count` single-file counting**
   - Apply in both:
     - `sync-memory-to-rpg.sh` (`count_agent_observations`)
     - `check-protocol-triggers.sh` (`count_obs_tag`)

---

## Recommendations for Phase 3 (once fixes land)

- Implement Track 6: use `khala_network.affinity` to influence routing/review assignment/speaking order.
- Add a deterministic “voice modifier derivation” layer (VOXYZ-style) sourced from:
  - structured memory tags/pattern types
  - active protocols
  - recent drift trends
- Introduce a formal “role card” schema (domain/inputs/outputs/DoD/hard bans/escalation/KPIs) and lint it.
