# VentureOS RPG — Personality Protocol Activation Rules (Phase 2 Track 5)

**Date:** 2026-02-14  
**Owner:** Synth  
**Engine:** `~/clawd/scripts/check-protocol-triggers.sh`

---

## Design goals

1. **Deterministic:** same inputs → same protocol state.
2. **Quality-gated:** avoid enabling “power” behaviors from one-off spikes.
3. **Maintainable:** rules are simple thresholds + documented data sources.
4. **Auditable:** every activation stores a compact JSON `trigger_condition`.

---

## Data sources used today

### Primary (DB)
- `psionic_stats` (latest snapshot per agent)
  - `memory_count`, `unique_domains`, `acceptance_rate`, `success_rate`, `approval_accuracy`, `tasks_completed`
- `psionic_ranks` (latest rank per agent)
- `missions` (completed count; success rate; review counts)
- `escalations` (Sentinel false positives + signal ratio)

### Secondary (optional)
- Observational memory markdown tags:
  - `~/.openclaw/workspace-archivist/observations/*.md`
  - Used when `rg` is available; otherwise some rules fall back to DB proxies.

---

## Global evaluation mechanics

### State model
- **Active** if there exists a row in `personality_activations` with `deactivated_at IS NULL`.
- **Activate** = insert a new row.
- **Deactivate** = update existing active row(s) with `deactivated_at = CURRENT_TIMESTAMP`.

### Idempotency rule
- Engine checks “already active” before inserting.

### Anti-gaming / sample-size gates
- Protocols that depend on ratios include minimum sample size gates:
  - Sentinel’s `escalation_quality_mode` requires **≥5 validated escalations** in the last 30 days.

> Future hardening: add hysteresis (N-day confirmation) for deactivation.

---

## Canonical protocols (15): triggers + deactivation

### Base protocols (all agents)

#### 1) `reference_outcomes` (type: `base`)
- **Intent:** cite prior outcomes instead of starting from scratch.
- **Trigger:** `max(memory_count, observation_tag_count) ≥ 8`
  - `memory_count` from `psionic_stats`
  - `observation_tag_count` from observational memory markdown tags (optional)
- **Deactivate:** value drops below 8.

#### 2) `use_frameworks` (type: `base`)
- **Intent:** structured methods; systematic approaches.
- **Trigger (preferred):** `pattern_count ≥ 6`
  - `pattern_count = #debugging + #ci + #infrastructure + #monitoring` in observation tags
- **Fallback trigger (when obs tags unavailable):** `unique_domains ≥ 6`
- **Deactivate:** count drops below threshold.

#### 3) `show_confidence` (type: `base`)
- **Intent:** reduce hedging only when justified.
- **Trigger:** `completed_missions ≥ 10 AND success_rate ≥ 0.80`
  - `completed_missions`: `missions` table
  - `success_rate`: avg of `missions.success` when available; otherwise `psionic_stats.success_rate`
- **Deactivate:** either condition fails.

#### 4) `mentor_mode` (type: `base`)
- **Intent:** teach methodology and elevate team skills.
- **Trigger:** `rank ≥ 7` (`psionic_ranks.rank`)
- **Deactivate:** rank drops below 7.

---

### Agent-specific protocols (quality gates)

#### 5) Oracle — `cite_precedents` (type: `quality_gate`)
- **Intent:** always cite relevant prior research/decisions.
- **Trigger:** `research_observations ≥ 5`
  - `research_observations = #research + #cost-optimization + #decisions` (oracle tags)
- **Deactivate:** drops below 5.

#### 6) Atlas — `proactive_monitoring` (type: `quality_gate`)
- **Intent:** monitoring before problems.
- **Trigger:** `monitoring_implementations ≥ 3`
  - `monitoring_implementations = #monitoring + #infrastructure` (atlas tags)
- **Deactivate:** drops below 3.

#### 7) Sentinel — `false_positive_cooldown` (type: `quality_gate`)
- **Intent:** raise evidence bar after too many false positives.
- **Trigger:** last 30d: `validated_escalations ≥ 3 AND false_positives ≥ 3`
  - `validated_escalations`: `validated_as_real IS NOT NULL`
  - `false_positives`: `validated_as_real = 0`
- **Deactivate:** conditions fail.

#### 8) Sentinel — `escalation_quality_mode` (type: `quality_gate`)
- **Intent:** prioritize signal-to-noise when escalations degrade.
- **Trigger:** last 30d: `validated_escalations ≥ 5 AND signal_ratio < 0.70`
  - `signal_ratio = true_positives / validated_escalations`
- **Deactivate:** conditions fail.

#### 9) Synth — `test_first_discipline` (type: `quality_gate`)
- **Intent:** tests before “done”.
- **Trigger:** `ci_events ≥ 5 AND acceptance_rate ≥ 0.70`
  - `ci_events = #ci + #testing + #pipeline` (synth tags)
  - `acceptance_rate` from `psionic_stats`
- **Deactivate:** conditions fail.

#### 10) Synth — `code_review_checklist` (type: `quality_gate`)
- **Intent:** enforce consistent review discipline.
- **Trigger:** `review_count ≥ 10 AND approval_accuracy ≥ 0.85`
  - `review_count`: missions completed with `mission_type IN ('code_review','mr_review','review')`
  - `approval_accuracy`: from `psionic_stats` (until per-review accuracy is logged)
- **Deactivate:** conditions fail.

#### 11) Nexus — `autonomous_delegation` (type: `quality_gate`)
- **Intent:** delegate automatically when priorities are clear.
- **Trigger:** `delegations ≥ 5` from observation tags
  - `delegations = #handoff + #priorities + #delegation + #dispatch`
- **Deactivate:** drops below 5.

#### 12) Nexus — `priority_stack_enforcement` (type: `quality_gate`)
- **Intent:** always structure P0/P1/P2.
- **Trigger:** `priority_events ≥ 8` from observation tags
  - `priority_events = #priorities + #p0 + #p1 + #p2 + #triage`
- **Deactivate:** drops below 8.

#### 13) Archivist — `proactive_documentation` (type: `quality_gate`)
- **Intent:** document context without being asked.
- **Trigger:** `documentation_events ≥ 5` from observation tags
  - `documentation_events = #documentation + #policy + #memory + #observational-memory + #cron`
- **Deactivate:** drops below 5.

#### 14) Archivist — `pattern_extraction` (type: `quality_gate`)
- **Intent:** explicitly identify and record patterns.
- **Trigger:** `pattern_identifications ≥ 8` from observation tags
  - `pattern_identifications = #pattern + #insight + #lesson-learned + #taxonomy`
- **Deactivate:** drops below 8.

#### 15) Verifier — `context_requirement_enforcement` (type: `quality_gate`)
- **Intent:** require sufficient context before approval.
- **Trigger:** `review_count ≥ 20 AND approval_accuracy ≥ 0.90`
  - `review_count`: completed missions with `mission_type IN ('approval','validation','review')`
  - `approval_accuracy`: from `psionic_stats`
- **Deactivate:** conditions fail.

---

## Cron integration (recommended)

Run protocol trigger checks **after** psionic stats calculation.

Suggested sequence (America/Chicago):
- 06:00 — `calculate-psionic-stats.sh`
- 06:15 — `update-khala-drift.sh`
- 06:20 — `check-protocol-triggers.sh`

See `~/clawd/ventureos/docs/CRON_SPECS.md` and `~/clawd/shared-context/rpg-memory-cron-setup.md` for scheduling templates.

---

## Atlas coordination notes (monitoring / ops)

**Proposed monitoring hooks:**
- Treat protocol trigger checks like other RPG cron jobs:
  - cron success/failure monitored
  - log file monitored: `~/clawd/runtime/logs/protocol-triggers-YYYY-MM-DD.log`
- Alert only on:
  - script error / non-zero exit
  - **unexpected churn**: activations+deactivations > N/day (e.g., >10)

**Open questions for Atlas:**
1. Should activations/deactivations emit a Discord notice to `#nexus-mission-control`?
2. Should we add structured audit events to DB (new table) vs relying on log files?
3. Add the new protocol cron job ID to the monitor’s `cron_jobs` list in `tools/monitor/config/config.yaml`?

> Action needed: Atlas review + sign-off on the above monitoring approach.
