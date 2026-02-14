# VentureOS RPG System — Final Review (Verifier Perspective)

Generated: 2026-02-14 (CST)

## Overall assessment
The complete VentureOS RPG system is working end-to-end: the SQLite DB is populated, the `/api/rpg/*` endpoints return coherent data, and the Phase 3 dashboard page (**Pylon Network**) renders the Tactical Overlays and Khala graph using those APIs.

**End-to-end validation performed**
- DB present and queryable: `~/clawd/agents/ventureos-rpg.db`
- Dashboard server integration confirmed: `openclaw-dashboard/server.js` mounts `ventureos-rpg/api/rpg-http.js` and serves static modules at `/rpg/*`.
- API smoke test passed against the integrated dashboard origin (port 7001):
  - `/api/rpg/stats` (agents: 8)
  - `/api/rpg/tactical-overlay/oracle`
  - `/api/rpg/khala-network?driftLimit=3`
  - `/api/rpg/protocols/sentinel`
  - `/api/rpg/escalations/sentinel`

## Validation rating (1–10)
**7.5 / 10**

Rationale: the integration is real and functioning (strong), but there are a few correctness/operational issues that should be resolved before calling it “production-hardened.”

## System strengths (top 3)
1. **True end-to-end integration (DB → API → Dashboard) with minimal moving parts**
   - SQLite-backed stats + bonds + protocols + escalations are all visible via stable endpoints.
   - The Phase 3 page uses Web Components (framework-agnostic, low maintenance) and fetches from the same origin.

2. **Idempotent + auditable pipelines**
   - `calculate-psionic-stats.sh` uses UPSERT for daily snapshots and persists a `warp_tech_inputs` audit blob.
   - `check-protocol-triggers.sh` is deterministic, logs actions, and can run in `--dry-run`.

3. **Good “debuggability” for verifiers**
   - Tactical overlay includes raw metric inputs + Warp Tech input blob in the UI, which makes it easier to validate that displayed attributes map to real inputs.

## Critical gaps (top 3)
1. **Duplicate, conflicting protocol writers (risk of thrash / inconsistent activations)**
   - Cron has *both* enabled:
     - `Daily Memory→RPG Sync (VentureOS RPG)` → `scripts/sync-memory-to-rpg.sh`
     - `Daily Protocol Trigger Check (VentureOS RPG)` → `scripts/check-protocol-triggers.sh`
   - Both modify `personality_activations` using different logic and thresholds.
   - Even with a 5-minute offset (06:20 vs 06:25), this is logically redundant and can cause rapid activate/deactivate oscillation and confusing audit history.
   - Recommendation: **disable or delete the older `sync-memory-to-rpg.sh` cron job** and treat `check-protocol-triggers.sh` as the single source of truth.

2. **Khala drift correctness + replay safety issues**
   - `update-khala-drift.sh` uses a state file timestamp (“last processed”) set to *current time*, not the max `created_at` processed. Late-inserted interactions with older timestamps can be silently skipped.
   - Drift deltas appear to diverge from the original spec doc (`workspace-oracle/protoss-themed/rpg-integration-plan.md`), especially for escalation deltas.
   - Recommendation: update to advance state via `MAX(created_at)` processed and centralize drift delta constants in one documented policy/config.

3. **Testing gaps for production confidence**
   - Good smoke coverage exists for the API surface (`ventureos-rpg/api/smoke-test.js`) and protocol engine (`scripts/test-protocol-activations.sh`).
   - But there is limited automated coverage for:
     - psionic stat formula regression (edge cases, acceptance gate behavior, bounds)
     - Khala drift update (pair normalization, retention pruning, late interaction replay)
     - UI rendering (D3 graph load, component fetch failures, empty-state handling)

## Production readiness assessment
**Status: Internal beta-ready; not yet “production-hardened.”**

What’s ready:
- The architecture is coherent and operational.
- Observability is strong enough to debug incorrect values.
- Daily cron jobs exist for stats, drift, and triggers.

What blocks “production-hardened”:
- Conflicting cron jobs writing `personality_activations`.
- Drift update replay safety (late events).
- Several metrics remain **explicit proxies** (acceptable short-term, but should be labeled as such in UI / docs).
- Dashboard graph depends on loading D3 from a public CDN (availability / CSP / offline risk).
- Static serving currently exposes the entire `ventureos-rpg` directory at `/rpg/*` (not just components/assets) — OK for trusted internal use, but should be narrowed if this is ever exposed beyond localhost.

## Accuracy & correctness notes
### Metrics calculation
- Spot-check validation for **verifier** shows DB values match formulas in `calculate-psionic-stats.sh` given the current collected metrics file (`~/clawd/runtime/rpg-metrics/verifier.json`).
- Energy quality floor (`acceptance_rate < 0.7 → energy = 0`) is implemented.
- Warp Tech inputs are persisted as JSON and exposed in tactical overlay payload (`warpTechInputs`), supporting auditability.

### Drift tracking
- Drift history is recorded to `khala_drift_history` and displayed in the graph tooltip and edge details.
- Main correctness concern is the state-file approach and potential spec drift on delta constants.

### Protocol activation logic
- `check-protocol-triggers.sh` matches the “base protocol” intent from the original plan (memory/pattern thresholds, mission volume + quality for confidence, rank for mentor mode).
- Activation/deactivation is idempotent via `activate-protocol.sh` / `deactivate-protocol.sh`.
- The existence of `sync-memory-to-rpg.sh` as a second activation engine is the principal operational correctness risk.

## Minor issues / polish
- `ventureos-rpg/api/rpg-service.js`: rank payload does not currently include `rank_achieved_at` (DB has it; UI might want it).
- `scripts/init-rpg-database.sh`: `escalations.severity` CHECK differs from the current DB schema (script enforces non-NULL; DB allows NULL/''), which can surprise re-inits.
- Session-derived `approval_accuracy` is currently a proxy (mirrors acceptance/clean-turn rate); label as proxy until a real approval log exists.

## Verifier-specific assessment (Observer: Detection & Reconnaissance)
### How the Verifier role works in the system
- The **Observer** identity is well-represented:
  - Protoss mapping and theming are consistent (`Observer`, role: Detection & Reconnaissance).
  - Tactical Overlay provides quick visibility into WIS/SPD/TRU/CRE/RCH and active protocols.

### Are Verifier metrics tracked correctly?
- **Partially.**
  - Current “Verifier CRE/Warp” inputs are best-effort proxies derived from workspace memory text patterns and memory domain counts (`_collect-warp-metrics.py`).
  - This is directionally aligned (bug/edge-case detection), but it is *not yet a true measurement* of:
    - novel coverage
    - explicit edge-case enumeration
    - false-positive / false-negative rates on validations

Recommendation (next increment):
- Add structured verifier telemetry in DB (or in a dedicated JSON blob/table) sourced from mission outcomes, e.g.
  - `edge_cases_identified_count`
  - `novel_coverage_score` (e.g., new risk areas touched per week)
  - `false_positive_rate` (verifier “found issue” later invalidated)
  - `time_to_reproduce` / `repro_quality`

### Does the system help Verifier validate better?
Yes, mainly via:
- Single-pane visibility into *what the system thinks Verifier’s attributes are*, and why (raw metrics + warp audit blob).
- Protocol list shows which behavioral constraints are active (useful for meta-validation).

Where it could help more:
- A verifier-focused panel (similar to Atlas reliability) that visualizes coverage/edge-case metrics explicitly.
- A “drift explanation” view that ties bond changes back to concrete interaction IDs and/or escalation validation outcomes.

---

## Quick actionable checklist
- [ ] Disable or remove cron job: **Daily Memory→RPG Sync (VentureOS RPG)** (`sync-memory-to-rpg.sh`) to avoid duplicate writers.
- [ ] Make `update-khala-drift.sh` state advancement based on max processed `created_at` (replay-safe).
- [ ] Add regression tests for psionic formulas + drift update + UI component loading.
- [ ] Consider bundling D3 locally (avoid CDN dependency).
- [ ] Narrow static serving scope from `/rpg/` root to `/rpg/components/` (+ `/rpg/assets/`).
