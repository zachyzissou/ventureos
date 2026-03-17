#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

HOME="$(mktemp -d)"
export HOME
export AGENT_ID="venture_infrastructure"
export OPENCLAW_WORKSPACE="$HOME/workspace-venture_infrastructure"
mkdir -p "$OPENCLAW_WORKSPACE"
mkdir -p "$HOME/.openclaw/cron/runs"

cat > "$HOME/.openclaw/cron/runs/job1.jsonl" <<'JSONL'
{"ts":1000,"jobId":"job1","action":"finished","status":"ok","summary":"ok","durationMs":10}
{"ts":2000,"jobId":"job1","action":"finished","status":"ok","summary":"ok2","durationMs":20}
JSONL

bash "$ROOT/scripts/export-cron-logs.sh"

OUT="$OPENCLAW_WORKSPACE/runtime/logs/task_runs/$AGENT_ID/$(date +%Y-%m-%d).jsonl"
export OUT
python3 - <<'PY'
import json, os
path = os.environ['OUT']
with open(path, 'r', encoding='utf-8') as f:
    lines = [json.loads(l) for l in f if l.strip()]
assert len(lines) == 2, lines
for rec in lines:
    for key in ('timestamp','job_id','action','status','duration','model','notes','agent_id'):
        assert key in rec, rec
assert set(r['agent_id'] for r in lines) == {os.environ['AGENT_ID']}
print('EXPORT_CRON_LOGS_OK')
PY
