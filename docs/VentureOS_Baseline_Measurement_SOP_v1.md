# VentureOS Baseline Measurement SOP v1

Date: 2026-03-16
Owner: Data/Analytics Operator lane
Scope: minimum baseline process for Phase 0 KPI and SLA measurement.

## Purpose

Baselines are required before KPI targets and SLA thresholds can be treated as operational commitments. This SOP defines the minimum measurement loop for the March 2026 rollout.

## Inputs

- Daily evidence under `runtime/logs/daily/`
- Weekly rollups under `runtime/logs/weekly/`
- KPI definitions in `docs/VentureOS_Department_KPI_SLA_v1.md`
- Readiness outputs under `runtime/reports/phase0-readiness/`

## Procedure

1. Select the KPI or SLA to baseline and record its owner, source system, and measurement window.
2. Capture at least one dated daily evidence artifact that contains the raw value.
3. Record source references in the associated KPI snapshot or handoff ledger entry.
4. Aggregate the first complete ISO week into `runtime/logs/weekly/YYYY-Www-kpi-rollup.json`.
5. Freeze the baseline for 30 days unless the source system or department scope materially changes.
6. If no historical data exists, mark the baseline as provisional and describe the fallback method in the decision log.

## Required outputs

- KPI measurements are stored in `runtime/logs/daily/YYYY-MM-DD-kpi-snapshot.json`.
- SLA measurements are stored in `runtime/logs/daily/YYYY-MM-DD-handoff-ledger.json`.
- Weekly baseline rollup is stored in `runtime/logs/weekly/YYYY-Www-kpi-rollup.json`.
- Any provisional baseline decision is logged in `runtime/logs/daily/YYYY-MM-DD-decision-log.md`.

## Exceptions

- Dormant departments are exempt until their activation phase begins.
- Metrics with missing history must include a fallback description and an owner in the decision log.
- A baseline may be reset early only when a source contract changes and the change is approved by the Director + Auditor lanes.
