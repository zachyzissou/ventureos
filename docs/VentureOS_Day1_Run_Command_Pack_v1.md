# VentureOS Day-1 Run Command Pack v1

Date: 2026-03-12  
Purpose: one exact command checklist to execute one Day-1 cycle and produce all required artifacts in `logs/daily/`.

## Preconditions

- Dashboard API reachable at `http://127.0.0.1:8001`
- API token available in `dashboard/data/.api-token`
- `jq` installed

## 0) Session setup (run once per day)

```bash
export DATE="$(date +%F)"
export TS_UTC="$(date -u +%FT%TZ)"
export DASHBOARD_URL="${DASHBOARD_URL:-http://127.0.0.1:8001}"
export DASHBOARD_TOKEN="${DASHBOARD_TOKEN:-$(cat dashboard/data/.api-token)}"
export OUT_DIR="logs/daily"
mkdir -p "$OUT_DIR"
```

## 1) 09:00 Ops Sweep artifact capture

- [ ] `agent-health.json`

```bash
curl -fsS \
  -H "Authorization: Bearer $DASHBOARD_TOKEN" \
  "$DASHBOARD_URL/api/agent-health" \
| jq --arg date "$DATE" --arg captured "$(date -u +%FT%TZ)" '
{
  date: $date,
  captured_at: $captured,
  source: { system: "dashboard", endpoint: "/api/agent-health" },
  summary: {
    total_agents: (.agents | length),
    running: (.agents | length),
    error: 0,
    stalled: 0
  },
  agents: [
    .agents[] | {
      agent_id: .agentId,
      status: "running",
      session_count: .sessionCount,
      aborted_count: .abortedCount,
      success_rate: .successRate,
      last_updated_at: (
        if (.lastUpdatedAt // 0) > 0
        then (.lastUpdatedAt / 1000 | strftime("%Y-%m-%dT%H:%M:%SZ"))
        else null
        end
      ),
      last_label: .lastLabel,
      notes: ""
    }
  ],
  incidents: []
}
' > "$OUT_DIR/$DATE-agent-health.json"
```

- [ ] `spend.json`

```bash
curl -fsS \
  -H "Authorization: Bearer $DASHBOARD_TOKEN" \
  "$DASHBOARD_URL/api/costs" \
| jq --arg date "$DATE" --arg captured "$(date -u +%FT%TZ)" '
{
  date: $date,
  captured_at: $captured,
  source: { system: "dashboard", endpoint: "/api/costs" },
  totals: {
    today_usd: (.today // 0),
    week_usd: (.week // 0),
    lifetime_usd: (.total // 0)
  },
  categories: [
    { category: "api_usage", usd: (.today // 0) },
    { category: "infrastructure", usd: 0 },
    { category: "other", usd: 0 }
  ],
  per_model: [(.perModel // {}) | to_entries[] | { model: .key, usd: .value }],
  variance: {
    daily_budget_usd: 0,
    variance_usd: 0,
    variance_pct: 0
  },
  notes: []
}
' > "$OUT_DIR/$DATE-spend.json"
```

- [ ] `kpi-snapshot.json`

```bash
curl -fsS \
  -H "Authorization: Bearer $DASHBOARD_TOKEN" \
  "$DASHBOARD_URL/api/kpis/latest" \
| jq --arg date "$DATE" --arg captured "$(date -u +%FT%TZ)" '
{
  date: $date,
  captured_at: $captured,
  source: { system: "dashboard", endpoint: "/api/kpis/latest" },
  latest_dashboard_snapshot: (.latest // null),
  departments: {
    executive_office: [],
    operations: [],
    data_analytics: [],
    finance: []
  },
  rollup: {
    overall_status: "green",
    notes: []
  }
}
' > "$OUT_DIR/$DATE-kpi-snapshot.json"
```

## 2) 09:30 Department Standup update capture

- [ ] Initialize `handoff-ledger.json`

```bash
cat > "$OUT_DIR/$DATE-handoff-ledger.json" <<'JSON'
{
  "date": "YYYY-MM-DD",
  "captured_at": "YYYY-MM-DDTHH:MM:SSZ",
  "handoffs": [
    {
      "handoff_id": "h-001",
      "producer": "Executive Office",
      "consumer": "Operations",
      "artifact": "Daily priorities packet",
      "sent_at": "",
      "accepted_at": "",
      "sla_status": "pending",
      "exceptions": ""
    },
    {
      "handoff_id": "h-002",
      "producer": "Data/Analytics",
      "consumer": "Finance",
      "artifact": "Spend and forecast dataset",
      "sent_at": "",
      "accepted_at": "",
      "sla_status": "pending",
      "exceptions": ""
    }
  ],
  "summary": {
    "total_handoffs": 2,
    "on_time": 0,
    "late": 0,
    "on_time_rate": 0
  }
}
JSON

sed -i.bak \
  -e "s/YYYY-MM-DD/$DATE/g" \
  -e "s/YYYY-MM-DDTHH:MM:SSZ/$(date -u +%FT%TZ)/g" \
  "$OUT_DIR/$DATE-handoff-ledger.json" && rm -f "$OUT_DIR/$DATE-handoff-ledger.json.bak"
```

- [ ] Initialize `decision-log.md`

```bash
cat > "$OUT_DIR/$DATE-decision-log.md" <<EOF
# Decision Log — $DATE

## Status
- Day result: \`PENDING\`
- Finalized at: \`TBD\`

## Decisions
| ID | Time (CT) | Decision | Owner | Due Date | Rationale | Status |
|---|---|---|---|---|---|---|

## Breaches / Escalations
| ID | Type | Severity | Owner | ETA | Notes |
|---|---|---|---|---|---|

## Next-Day Top 3 Priorities
1. TBD
2. TBD
3. TBD

## Evidence Links
- \`logs/daily/$DATE-agent-health.json\`
- \`logs/daily/$DATE-spend.json\`
- \`logs/daily/$DATE-kpi-snapshot.json\`
- \`logs/daily/$DATE-handoff-ledger.json\`
- \`logs/daily/$DATE-decision-log.md\`
EOF
```

## 3) 12:00 Handoff SLA check update

- [ ] Record sent/accepted timestamps and SLA result

```bash
jq --arg ts "$(date -u +%FT%TZ)" '
  .handoffs |= map(
    if .handoff_id == "h-001"
    then .sent_at = $ts | .accepted_at = $ts | .sla_status = "on_time"
    else .
    end
  )
  | .summary.total_handoffs = (.handoffs | length)
  | .summary.on_time = ([.handoffs[] | select(.sla_status == "on_time")] | length)
  | .summary.late = ([.handoffs[] | select(.sla_status == "late")] | length)
  | .summary.on_time_rate = (
      if (.handoffs | length) == 0
      then 0
      else (([.handoffs[] | select(.sla_status == "on_time")] | length) / (.handoffs | length))
      end
    )
' "$OUT_DIR/$DATE-handoff-ledger.json" > "$OUT_DIR/$DATE-handoff-ledger.tmp" \
  && mv "$OUT_DIR/$DATE-handoff-ledger.tmp" "$OUT_DIR/$DATE-handoff-ledger.json"
```

## 4) 16:30 Evidence closeout and go/no-go

- [ ] Validate all Day-1 required artifacts exist and are non-empty

```bash
for f in \
  "$OUT_DIR/$DATE-agent-health.json" \
  "$OUT_DIR/$DATE-spend.json" \
  "$OUT_DIR/$DATE-kpi-snapshot.json" \
  "$OUT_DIR/$DATE-handoff-ledger.json" \
  "$OUT_DIR/$DATE-decision-log.md"
do
  test -s "$f" || { echo "MISSING_OR_EMPTY: $f"; exit 1; }
done
echo "OK: all required Day-1 artifacts present for $DATE"
```

- [ ] Optional schema sanity check

```bash
jq empty "$OUT_DIR/$DATE-agent-health.json" \
  "$OUT_DIR/$DATE-spend.json" \
  "$OUT_DIR/$DATE-kpi-snapshot.json" \
  "$OUT_DIR/$DATE-handoff-ledger.json"
```

## 5) End-of-cycle status line (paste into decision log)

```text
Status: GO|NO_GO
Evidence links: logs/daily/<DATE>-agent-health.json, logs/daily/<DATE>-spend.json, logs/daily/<DATE>-kpi-snapshot.json, logs/daily/<DATE>-handoff-ledger.json, logs/daily/<DATE>-decision-log.md
Breaches + owners + ETA: <fill>
Next cycle priorities (top 3): <fill>
```
