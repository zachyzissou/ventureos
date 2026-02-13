#!/usr/bin/env bash
set -euo pipefail

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/lib/agent-env.sh
source "$SCRIPT_DIR/lib/agent-env.sh"

AGENT_ID="$(agent_env_agent_id)"
WORKSPACE_ROOT="$(agent_env_workspace_root)"
TMPDIR="$(agent_env_tmp_dir)"
export TMPDIR

python3 - <<'PY' "$WORKSPACE_ROOT" "$AGENT_ID"
import glob
import json
import os
import sys
from datetime import datetime

workspace_root = os.path.abspath(sys.argv[1])
agent_id = sys.argv[2]

out_dir = os.path.join(workspace_root, "runtime", "logs", "task_runs", agent_id)
state_path = os.path.join(out_dir, "state.json")

os.makedirs(out_dir, exist_ok=True)

if os.path.exists(state_path):
    with open(state_path, 'r', encoding='utf-8') as f:
        try:
            state = json.load(f)
        except Exception:
            state = {}
else:
    state = {}

out_file = os.path.join(out_dir, datetime.now().strftime('%Y-%m-%d') + '.jsonl')

for path in glob.glob(os.path.expanduser('~/.openclaw/cron/runs/*.jsonl')):
    job_id = os.path.basename(path).replace('.jsonl', '')
    last = state.get(job_id, 0)
    new_last = last
    with open(path, 'r', encoding='utf-8') as f, open(out_file, 'a', encoding='utf-8') as out:
        for line in f:
            try:
                j = json.loads(line)
            except Exception:
                continue
            ts = j.get('ts', 0)
            if ts > last:
                rec = {
                    'timestamp': ts,
                    'job_id': j.get('jobId'),
                    'action': j.get('action'),
                    'status': j.get('status'),
                    'duration': j.get('durationMs'),
                    'model': j.get('model'),
                    'notes': j.get('summary'),
                    'agent_id': agent_id,
                }
                out.write(json.dumps(rec) + '\n')
                if ts > new_last:
                    new_last = ts
    state[job_id] = new_last

with open(state_path, 'w', encoding='utf-8') as f:
    json.dump(state, f)
PY
