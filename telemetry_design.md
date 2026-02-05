# Telemetry System Design

## Storage Schema
**Partitioning:**
- Time-partitioned JSONL files in `/telemetry_data/$(date).jsonl`
- Each line contains a single execution record:
```json
{
  "timestamp": "2024-02-20T15:45:30.123Z",
  "model": "llama-3-8b",
  "provider": "cloudflare",
  "latency": 450.2,
  "tokens": {
    "input": 1250,
    "output": 320
  },
  "cost": 0.15,
  "success": true,
  "quality_score": 0.87
}
```

## Query Interface Examples
```python
collector.query(
  start_time="2024-02-18T00:00:00Z",
  end_time="2024-02-20T23:59:59Z",
  model="mistral-7b"
)
# => Generator yielding filtered records
```

## Metrics Calculation
**Success Rate by Model:**
```python
from collections import defaultdict

stats = defaultdict(lambda: {'total':0, 'successful':0})
for record in collector.query(model='all'):
    stats[record['model']]['total'] += 1
    if record['success']:
        stats[record['model']]['successful'] += 1
```

**Cost Burn Rate (last hour):**
```python
from datetime import datetime, timedelta

total_cost = sum(
    record['cost'] 
    for record in collector.query(
        start_time=(datetime.now()-timedelta(hours=1)).isoformat()
    )
)
```

## Provider-Level Metrics
```python
# Concurrency tracking pattern
provider_usage = defaultdict(set)
for record in collector.query():
    provider_usage[record['provider']].add(f"request:{record['timestamp']}")

# Enforce 3-agent limit
for provider, requests in provider_usage.items():
    if len(requests) > 3:
        # Throttle or delay subsequent requests
        pass
```

## Extensibility Pattern
To add new metrics:
1. Update TelemetryCollector's log schema
2. Modify aggregation logic to include new fields
3. Add optional parameters to query interface

All existing queries remain functional with new fields.