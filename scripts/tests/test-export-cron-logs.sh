#!/usr/bin/env bash
set -euo pipefail

export HOME="$(mktemp -d)"
mkdir -p "$HOME/.openclaw/cron/runs"

cat > "$HOME/.openclaw/cron/runs/job1.jsonl" <<'JSONL'
{"ts":1000,"jobId":"job1","action":"finished","status":"ok","summary":"ok","durationMs":10}
{"ts":2000,"jobId":"job1","action":"finished","status":"ok","summary":"ok2","durationMs":20}
JSONL

bash scripts/export-cron-logs.sh

OUT="$HOME/clawd/runtime/logs/task_runs/$(date +%Y-%m-%d).jsonl"
python3 - <<'PY'
import json, os
path=os.environ['OUT']
with open(path,'r') as f:
    lines=[json.loads(l) for l in f if l.strip()]
assert len(lines)==2, lines
for rec in lines:
    for key in ('timestamp','job_id','action','status','duration','model','notes'):
        assert key in rec, rec
print('EXPORT_CRON_LOGS_OK')
PY
