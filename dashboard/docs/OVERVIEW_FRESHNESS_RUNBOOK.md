# Overview Freshness Runbook

Operational guide for the Overview data-freshness lane (KPI, Agent Health, Observations), transition timeline, and event dedupe controls.

## Scope
- UI surfaces:
  - Overview freshness summary chip
  - stale banner
  - freshness transition timeline
- APIs:
  - `GET /api/config`
  - `GET /api/overview-freshness-events`
  - `POST /api/overview-freshness-event`
- Storage:
  - `dashboard/data/overview-freshness-events.jsonl` (or workspace `data/overview-freshness-events.jsonl` in source mode)

## Configuration
Threshold controls:
- `DASHBOARD_OVERVIEW_FRESHNESS_KPI_FRESH_MS`
- `DASHBOARD_OVERVIEW_FRESHNESS_KPI_STALE_MS`
- `DASHBOARD_OVERVIEW_FRESHNESS_AGENT_HEALTH_FRESH_MS`
- `DASHBOARD_OVERVIEW_FRESHNESS_AGENT_HEALTH_STALE_MS`
- `DASHBOARD_OVERVIEW_FRESHNESS_OBSERVATIONS_FRESH_MS`
- `DASHBOARD_OVERVIEW_FRESHNESS_OBSERVATIONS_STALE_MS`

Timeline + noise controls:
- `DASHBOARD_OVERVIEW_FRESHNESS_TIMELINE_LIMIT` (default `8`, range `1..40`)
- `DASHBOARD_OVERVIEW_FRESHNESS_EVENT_DEDUPE_WINDOW_MS` (default `30000`, range `0..600000`)

## Recommended Profiles

### Dev / active debugging
Use aggressive stale detection for rapid feedback.

```bash
export DASHBOARD_OVERVIEW_FRESHNESS_KPI_FRESH_MS=1800000
export DASHBOARD_OVERVIEW_FRESHNESS_KPI_STALE_MS=7200000
export DASHBOARD_OVERVIEW_FRESHNESS_AGENT_HEALTH_FRESH_MS=120000
export DASHBOARD_OVERVIEW_FRESHNESS_AGENT_HEALTH_STALE_MS=900000
export DASHBOARD_OVERVIEW_FRESHNESS_OBSERVATIONS_FRESH_MS=900000
export DASHBOARD_OVERVIEW_FRESHNESS_OBSERVATIONS_STALE_MS=3600000
export DASHBOARD_OVERVIEW_FRESHNESS_TIMELINE_LIMIT=12
export DASHBOARD_OVERVIEW_FRESHNESS_EVENT_DEDUPE_WINDOW_MS=10000
```

### Prod / operator-facing stability
Use conservative thresholds to avoid alert fatigue.

```bash
export DASHBOARD_OVERVIEW_FRESHNESS_KPI_FRESH_MS=129600000
export DASHBOARD_OVERVIEW_FRESHNESS_KPI_STALE_MS=345600000
export DASHBOARD_OVERVIEW_FRESHNESS_AGENT_HEALTH_FRESH_MS=900000
export DASHBOARD_OVERVIEW_FRESHNESS_AGENT_HEALTH_STALE_MS=7200000
export DASHBOARD_OVERVIEW_FRESHNESS_OBSERVATIONS_FRESH_MS=21600000
export DASHBOARD_OVERVIEW_FRESHNESS_OBSERVATIONS_STALE_MS=86400000
export DASHBOARD_OVERVIEW_FRESHNESS_TIMELINE_LIMIT=8
export DASHBOARD_OVERVIEW_FRESHNESS_EVENT_DEDUPE_WINDOW_MS=30000
```

## Validation Checklist
1. Confirm runtime config:
   - `curl -sS http://127.0.0.1:8001/api/config | jq '.overviewFreshnessThresholdsMs, .overviewFreshnessTimelineLimit, .overviewFreshnessEventDedupeWindowMs'`
2. Confirm timeline API returns newest-first events:
   - `curl -sS http://127.0.0.1:8001/api/overview-freshness-events?limit=8 | jq '.events[0]'`
3. Trigger a stale transition and verify append:
   - `curl -sS -X POST http://127.0.0.1:8001/api/overview-freshness-event -H 'content-type: application/json' -d '{"state":"stale","stale":1,"aging":0,"unavailable":0,"total":3,"source":"manual-check","emittedAt":1700000000000}'`
4. Verify dedupe suppression (same payload within window):
   - second POST should return `"accepted": false`.

## Troubleshooting
- Timeline empty with expected events:
  - verify `overview-freshness-events.jsonl` exists under the active dashboard data directory.
  - check for malformed JSONL lines; parser skips bad lines.
- Too many duplicate transitions:
  - increase `DASHBOARD_OVERVIEW_FRESHNESS_EVENT_DEDUPE_WINDOW_MS`.
- Alerts too noisy:
  - widen fresh/stale windows or lower event frequency by increasing dedupe window.
- Alerts too slow:
  - tighten fresh/stale windows and reduce dedupe window.

## Current Next Steps (February 22, 2026)
1. Add correlation IDs from freshness events to operator incident summaries.
2. Extend timeline drill-down with link-outs to source API health checks.
3. Evaluate optional daily compaction for `overview-freshness-events.jsonl` in long-running hosts.
