#!/usr/bin/env bash
set -euo pipefail

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

python3 - <<'PY'
import json, glob, os
from datetime import datetime

out_dir = os.path.expanduser('~/clawd/runtime/logs/task_runs')
state_path = os.path.join(out_dir, 'state.json')

os.makedirs(out_dir, exist_ok=True)

if os.path.exists(state_path):
    with open(state_path,'r') as f:
        try:
            state=json.load(f)
        except Exception:
            state={}
else:
    state={}

out_file = os.path.join(out_dir, datetime.now().strftime('%Y-%m-%d') + '.jsonl')

for path in glob.glob(os.path.expanduser('~/.openclaw/cron/runs/*.jsonl')):
    job_id = os.path.basename(path).replace('.jsonl','')
    last = state.get(job_id, 0)
    new_last = last
    with open(path,'r') as f, open(out_file,'a') as out:
        for line in f:
            try:
                j=json.loads(line)
            except Exception:
                continue
            ts=j.get('ts',0)
            if ts>last:
                rec={
                    'timestamp': ts,
                    'job_id': j.get('jobId'),
                    'action': j.get('action'),
                    'status': j.get('status'),
                    'duration': j.get('durationMs'),
                    'model': j.get('model'),
                    'notes': j.get('summary')
                }
                out.write(json.dumps(rec)+'\n')
                if ts>new_last:
                    new_last=ts
    state[job_id]=new_last

with open(state_path,'w') as f:
    json.dump(state,f)
PY
