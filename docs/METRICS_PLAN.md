# Metrics Plan

## Core KPIs
1. **Task success rate** = successful runs / total runs
2. **Average task latency** = mean durationMs from cron runs
3. **Manual intervention rate** = manual fixes per week / total incidents
4. **Backup freshness** = hours since last backup
5. **Budget utilization** = % used of monthly/rolling caps

---

## Data Sources
- `~/.openclaw/cron/runs/*.jsonl` → execution status + duration
- `~/clawd/runtime/logs/task_runs/YYYY-MM-DD.jsonl` → aggregated daily view
- `~/clawd/runtime/logs/backups/*.log`
- `subscription-quota-tracker.js` → budget usage

---

## Collection Strategy
- Daily cron job exports run logs (already in plan).
- Weekly metrics summary job (optional Phase 1):
  - Parse last 7 days of JSONL
  - Write report to `runtime/logs/metrics/weekly-YYYY-MM-DD.json`

---

## Report Template (Weekly)
```json
{
  "week": "YYYY-MM-DD",
  "task_success_rate": 0.97,
  "avg_latency_ms": 72000,
  "manual_interventions": 1,
  "backup_age_hours": 12,
  "budget": {"anthropic": 0.42, "openai": 0.35, "gemini": 0.12}
}
```
