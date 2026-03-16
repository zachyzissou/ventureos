# VentureOS Daily Artifact Templates v1

Date: 2026-03-12  
Scope: Day-1 required artifacts from `docs/VentureOS_Day1_Execution_Packet.md`.

## 1) `runtime/logs/daily/YYYY-MM-DD-agent-health.json`

```json
{
  "date": "YYYY-MM-DD",
  "captured_at": "YYYY-MM-DDTHH:MM:SSZ",
  "source": {
    "system": "dashboard",
    "endpoint": "/api/agent-health"
  },
  "summary": {
    "total_agents": 6,
    "running": 6,
    "error": 0,
    "stalled": 0
  },
  "agents": [
    {
      "agent_id": "oracle",
      "status": "running",
      "session_count": 142,
      "aborted_count": 3,
      "success_rate": 0.9789,
      "last_updated_at": "YYYY-MM-DDTHH:MM:SSZ",
      "last_label": "Research task",
      "notes": ""
    }
  ],
  "incidents": []
}
```

## 2) `runtime/logs/daily/YYYY-MM-DD-spend.json`

```json
{
  "date": "YYYY-MM-DD",
  "captured_at": "YYYY-MM-DDTHH:MM:SSZ",
  "source": {
    "system": "dashboard",
    "endpoint": "/api/costs"
  },
  "totals": {
    "today_usd": 0.0,
    "week_usd": 0.0,
    "lifetime_usd": 0.0
  },
  "categories": [
    {
      "category": "api_usage",
      "usd": 0.0
    },
    {
      "category": "infrastructure",
      "usd": 0.0
    },
    {
      "category": "other",
      "usd": 0.0
    }
  ],
  "per_model": [
    {
      "model": "gpt-5",
      "usd": 0.0
    }
  ],
  "variance": {
    "daily_budget_usd": 0.0,
    "variance_usd": 0.0,
    "variance_pct": 0.0
  },
  "notes": []
}
```

## 3) `runtime/logs/daily/YYYY-MM-DD-kpi-snapshot.json`

```json
{
  "date": "YYYY-MM-DD",
  "captured_at": "YYYY-MM-DDTHH:MM:SSZ",
  "source": {
    "system": "dashboard",
    "endpoint": "/api/kpis/latest"
  },
  "departments": {
    "executive_office": [
      {
        "kpi_id": "executive.strategic_decision_cycle_time_hours_p90",
        "period_start": "YYYY-MM-DD",
        "period_end": "YYYY-MM-DD",
        "value": 0.0,
        "target": 72.0,
        "owner": "Executive Office Operator lane",
        "source_refs": [
          "link-or-record-id"
        ],
        "entered_at": "YYYY-MM-DDTHH:MM:SSZ",
        "approved_at": "YYYY-MM-DDTHH:MM:SSZ"
      }
    ],
    "operations": [
      {
        "kpi_id": "operations.incident_mttr_hours",
        "period_start": "YYYY-MM-DD",
        "period_end": "YYYY-MM-DD",
        "value": 0.0,
        "target": 8.0,
        "owner": "Operations Operator lane",
        "source_refs": [
          "link-or-record-id"
        ],
        "entered_at": "YYYY-MM-DDTHH:MM:SSZ",
        "approved_at": "YYYY-MM-DDTHH:MM:SSZ"
      }
    ],
    "data_analytics": [
      {
        "kpi_id": "data_analytics.data_freshness_compliance",
        "period_start": "YYYY-MM-DD",
        "period_end": "YYYY-MM-DD",
        "value": 0.0,
        "target": 0.98,
        "owner": "Data/Analytics Operator lane",
        "source_refs": [
          "link-or-record-id"
        ],
        "entered_at": "YYYY-MM-DDTHH:MM:SSZ",
        "approved_at": "YYYY-MM-DDTHH:MM:SSZ"
      }
    ],
    "finance": [
      {
        "kpi_id": "finance.budget_variance_pct",
        "period_start": "YYYY-MM-DD",
        "period_end": "YYYY-MM-DD",
        "value": 0.0,
        "target": 0.1,
        "owner": "Finance Operator lane",
        "source_refs": [
          "link-or-record-id"
        ],
        "entered_at": "YYYY-MM-DDTHH:MM:SSZ",
        "approved_at": "YYYY-MM-DDTHH:MM:SSZ"
      }
    ]
  },
  "rollup": {
    "overall_status": "green",
    "notes": []
  }
}
```

## 4) `runtime/logs/daily/YYYY-MM-DD-handoff-ledger.json`

```json
{
  "date": "YYYY-MM-DD",
  "captured_at": "YYYY-MM-DDTHH:MM:SSZ",
  "handoffs": [
    {
      "handoff_id": "h-001",
      "producer": "Executive Office",
      "consumer": "Operations",
      "artifact": "Daily priorities packet",
      "sent_at": "YYYY-MM-DDTHH:MM:SSZ",
      "accepted_at": "YYYY-MM-DDTHH:MM:SSZ",
      "sla_status": "on_time",
      "exceptions": ""
    },
    {
      "handoff_id": "h-002",
      "producer": "Data/Analytics",
      "consumer": "Finance",
      "artifact": "Spend and forecast dataset",
      "sent_at": "YYYY-MM-DDTHH:MM:SSZ",
      "accepted_at": "YYYY-MM-DDTHH:MM:SSZ",
      "sla_status": "late",
      "exceptions": "source reconciliation delayed"
    }
  ],
  "summary": {
    "total_handoffs": 2,
    "on_time": 1,
    "late": 1,
    "on_time_rate": 0.5
  }
}
```

## 5) `runtime/logs/daily/YYYY-MM-DD-decision-log.md`

```md
# Decision Log — YYYY-MM-DD

## Status
- Day result: `GO` or `NO_GO`
- Finalized at: `YYYY-MM-DDTHH:MM:SSZ`

## Decisions
| ID | Time (CT) | Decision | Owner | Due Date | Rationale | Status |
|---|---|---|---|---|---|---|
| DEC-001 | 09:40 | Example: Reassign Operations blocker triage owner | Executive Chief of Staff | YYYY-MM-DD | Overnight queue exceeded threshold | Open |

## Breaches / Escalations
| ID | Type | Severity | Owner | ETA | Notes |
|---|---|---|---|---|---|
| BR-001 | Handoff SLA miss | Level 1 | Operations Director | YYYY-MM-DDTHH:MM:SSZ | Corrective action required next cycle |

## Next-Day Top 3 Priorities
1. Priority one (owner, due date)
2. Priority two (owner, due date)
3. Priority three (owner, due date)

## Evidence Links
- `runtime/logs/daily/YYYY-MM-DD-agent-health.json`
- `runtime/logs/daily/YYYY-MM-DD-spend.json`
- `runtime/logs/daily/YYYY-MM-DD-kpi-snapshot.json`
- `runtime/logs/daily/YYYY-MM-DD-handoff-ledger.json`
- `runtime/logs/daily/YYYY-MM-DD-decision-log.md`
```

## 6) `runtime/logs/daily/YYYY-MM-DD-go-no-go.md`

```md
# Day Go/No-Go — YYYY-MM-DD

## Verdict
- Status: `GO` or `NO_GO`
- Evaluated at: `YYYY-MM-DDTHH:MM:SSZ`
- Evaluator lane: `Executive Office Operator lane`

## Acceptance Criteria Check
- [x] All required daily artifacts are present
- [x] No unresolved P0 incidents
- [ ] Handoff SLA target met
- [x] Decision log complete

## Evidence Summary
- Handoff on-time rate: `0.95`
- Open P0 incidents: `0`
- Required artifacts present: `6/6`

## Decision
Status: `GO`
Approver: `Executive Office Director lane`

## Evidence Links
- `runtime/logs/daily/YYYY-MM-DD-agent-health.json`
- `runtime/logs/daily/YYYY-MM-DD-spend.json`
- `runtime/logs/daily/YYYY-MM-DD-kpi-snapshot.json`
- `runtime/logs/daily/YYYY-MM-DD-handoff-ledger.json`
- `runtime/logs/daily/YYYY-MM-DD-decision-log.md`
- `runtime/logs/daily/YYYY-MM-DD-go-no-go.md`
```

Compatibility aliases may also be refreshed alongside the dated files:

- `runtime/logs/daily/agent-health.json`
- `runtime/logs/daily/spend.json`
- `runtime/logs/daily/kpi-snapshot.json`
- `runtime/logs/daily/handoff-ledger.json`
- `runtime/logs/daily/decision-log.md`
- `runtime/logs/daily/day1-go-no-go.md`
