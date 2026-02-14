#!/usr/bin/env bash
# session-health-check.sh - Monitor agent session sizes and auto-cleanup
# Prevents token limit errors by detecting bloated sessions early.
#
# Level 1 hardening: summarize-before-reset + inject handoff summary into the next session.

set -euo pipefail

AGENTS_DIR="${AGENTS_DIR:-$HOME/.openclaw/agents}"
WARN_SIZE_KB="${WARN_SIZE_KB:-400}"      # Warn at 400KB (approx 150K tokens)
CRITICAL_SIZE_KB="${CRITICAL_SIZE_KB:-600}"  # Auto-reset at 600KB (approx 200K+ tokens)

HANDOFF_SUMMARIZER="${HANDOFF_SUMMARIZER:-$HOME/clawd/ventureos/scripts/summarize-session.sh}"
HANDOFF_ROLE="${HANDOFF_ROLE:-system}"  # system | user

# Wire memory-observation-sync to run immediately on reset events.
MEMORY_OBS_SYNC_JOB_ID="${MEMORY_OBS_SYNC_JOB_ID:-de6963c8-5f74-4527-a28a-4c86bafb6feb}"

SLURPNET_WEBHOOK_ID="1470220519319142667"
SLURPNET_WEBHOOK_SECRET_FILE="$HOME/.credentials/discord-webhook-slurpnet.secret"

# Optional filter: comma-separated agent list (e.g., SESSION_HEALTH_AGENTS=oracle,atlas)
SESSION_HEALTH_AGENTS="${SESSION_HEALTH_AGENTS:-}"

now_iso_utc() {
  date -u +%Y-%m-%dT%H:%M:%SZ
}

now_iso_file() {
  # safe for filenames
  date -u +%Y-%m-%dT%H-%M-%S
}

uuid() {
  if command -v uuidgen >/dev/null 2>&1; then
    uuidgen | tr 'A-Z' 'a-z'
  else
    python3 - <<'PY'
import uuid
print(str(uuid.uuid4()))
PY
  fi
}

ms_now() {
  python3 - <<'PY'
import time
print(int(time.time() * 1000))
PY
}

json_escape() {
  # Print JSON-escaped string (without surrounding quotes)
  python3 - <<'PY'
import json, sys
print(json.dumps(sys.stdin.read())[1:-1])
PY
}

filter_agents() {
  local -a base=(oracle atlas sentinel verifier archivist synth)
  if [[ -z "$SESSION_HEALTH_AGENTS" ]]; then
    printf "%s\n" "${base[@]}"
    return 0
  fi

  local IFS=','
  read -r -a filtered <<<"$SESSION_HEALTH_AGENTS"
  for a in "${filtered[@]}"; do
    a="${a//[[:space:]]/}"
    [[ -n "$a" ]] && printf "%s\n" "$a"
  done
}

# Update sessions.json: any entry referencing old session id will point to new_session_id.
update_sessions_index() {
  local sessions_index="$1"
  local old_session_id="$2"
  local new_session_id="$3"
  local now_ms="$4"

  [[ -f "$sessions_index" ]] || return 0

  local tmp
  tmp="$(mktemp)"
  jq --arg old "$old_session_id" --arg new "$new_session_id" --argjson now "$now_ms" '
    with_entries(
      if (.value.sessionId? == $old) then
        .value.sessionId = $new
        | .value.updatedAt = $now
        | .value.systemSent = false
      else
        .
      end
    )
  ' "$sessions_index" > "$tmp" && mv "$tmp" "$sessions_index"
}

# Create a new session JSONL file with an injected handoff summary as the first message.
create_handoff_session_file() {
  local session_path="$1"
  local new_session_id="$2"
  local agent="$3"
  local summary_md_path="$4"
  local model_provider="$5"
  local model_id="$6"

  local workspace_dir="$HOME/.openclaw/workspace-$agent"
  local ts
  ts="$(python3 - <<'PY'
from datetime import datetime, timezone
print(datetime.now(timezone.utc).isoformat(timespec='milliseconds').replace('+00:00','Z'))
PY
)"

  local summary_text
  summary_text="$(cat "$summary_md_path")"

  python3 - "$session_path" "$new_session_id" "$ts" "$workspace_dir" "$HANDOFF_ROLE" "$summary_text" "$model_provider" "$model_id" <<'PY'
import json, os, sys, uuid

session_path = sys.argv[1]
session_id = sys.argv[2]
ts = sys.argv[3]
cwd = sys.argv[4]
role = sys.argv[5]
summary = sys.argv[6]
model_provider = sys.argv[7] if len(sys.argv) > 7 else ""
model_id = sys.argv[8] if len(sys.argv) > 8 else ""

os.makedirs(os.path.dirname(session_path), exist_ok=True)

def rid(n=8):
    return uuid.uuid4().hex[:n]

lines = []
lines.append({
    "type": "session",
    "version": 3,
    "id": session_id,
    "timestamp": ts,
    "cwd": cwd,
})

# Optional: include model metadata for readability (OpenClaw can still infer from config).
if model_provider and model_id:
    lines.append({
        "type": "model_change",
        "id": rid(),
        "parentId": None,
        "timestamp": ts,
        "provider": model_provider,
        "modelId": model_id,
    })

# Inject handoff as the first message in the new session.
# Prefer role=system; fallback can be role=user (set HANDOFF_ROLE=user in env).
lines.append({
    "type": "message",
    "id": rid(),
    "parentId": None,
    "timestamp": ts,
    "message": {
        "role": role,
        "content": [
            {
                "type": "text",
                "text": "SESSION HANDOFF SUMMARY (auto-injected)\n\n" + summary.strip() + "\n",
            }
        ],
        "timestamp": int(__import__("time").time() * 1000),
    },
})

with open(session_path, "w", encoding="utf-8") as f:
    for obj in lines:
        f.write(json.dumps(obj, ensure_ascii=False) + "\n")
PY
}

# Extract provider/model from sessions.json (best-effort) for the session being reset.
lookup_model_for_session() {
  local sessions_index="$1"
  local old_session_id="$2"

  if [[ ! -f "$sessions_index" ]]; then
    echo -e "\t"  # provider\tmodel
    return 0
  fi

  # Pick the first matching entry.
  jq -r --arg sid "$old_session_id" '
    to_entries
    | map(select(.value.sessionId? == $sid))
    | .[0].value
    | [(.modelProvider? // ""), (.model? // "")]
    | @tsv
  ' "$sessions_index" 2>/dev/null || echo -e "\t"
}

trigger_memory_observation_sync() {
  # Fire-and-forget (do not block the health check / cron run). The cron scheduler will record the run.
  if command -v openclaw >/dev/null 2>&1; then
    (nohup openclaw cron run --timeout 600000 "$MEMORY_OBS_SYNC_JOB_ID" >/dev/null 2>&1 & disown) || true
  fi
}

report_slurpnet() {
  local message="$1"
  if [[ -f "$SLURPNET_WEBHOOK_SECRET_FILE" ]]; then
    curl -sS -X POST "https://discord.com/api/webhooks/${SLURPNET_WEBHOOK_ID}/$(cat "$SLURPNET_WEBHOOK_SECRET_FILE")" \
      -H "Content-Type: application/json" \
      -d "{\"content\":\"$(printf "%s" "$message" | json_escape)\"}" \
      >/dev/null 2>&1 || true
  fi
}

reset_session_with_handoff() {
  local agent="$1"
  local session_file="$2"

  local sessions_dir
  sessions_dir="$(dirname "$session_file")"

  local session_id
  session_id="$(basename "$session_file" .jsonl)"

  local size_kb
  size_kb="$(du -k "$session_file" | cut -f1)"

  local backup_dir="$sessions_dir/backups"
  mkdir -p "$backup_dir"
  cp "$session_file" "$backup_dir/${session_id}-$(date +%Y%m%d-%H%M%S).jsonl.bak"

  local handoff_dir="$sessions_dir/handoff"
  mkdir -p "$handoff_dir"

  local summary_path
  summary_path="$handoff_dir/${session_id}-handoff-$(now_iso_file).md"

  # Generate handoff summary (stdout) BEFORE archive/delete.
  local summary=""
  local summary_file="$sessions_dir/.handoff-${session_id}.md"

  if [[ -x "$HANDOFF_SUMMARIZER" ]]; then
    summary="$("$HANDOFF_SUMMARIZER" "$session_file" 2>/dev/null || true)"
  else
    summary="$(printf "# Session Handoff Summary\nPrevious session: %s\nReset reason: Size exceeded 600KB\n\n(Unable to run summarizer: %s)\n" "$session_id" "$HANDOFF_SUMMARIZER")"
  fi

  echo "$summary" >"$summary_path"
  echo "$summary" >"$summary_file"

  # If sessions.json references this session id, pre-create a new session with the handoff injected.
  local sessions_index="$sessions_dir/sessions.json"
  local keys
  keys="$(jq -r --arg sid "$session_id" 'to_entries[] | select(.value.sessionId? == $sid) | .key' "$sessions_index" 2>/dev/null || true)"

  local new_session_id=""

  if [[ -n "${keys//[[:space:]]/}" ]]; then
    new_session_id="$(uuid)"

    # best-effort model lookup
    local model_provider model_id
    IFS=$'\t' read -r model_provider model_id < <(lookup_model_for_session "$sessions_index" "$session_id")

    create_handoff_session_file "$sessions_dir/${new_session_id}.jsonl" "$new_session_id" "$agent" "$summary_path" "$model_provider" "$model_id"

    update_sessions_index "${sessions_index}" "$session_id" "$new_session_id" "$(ms_now)"
  fi

  # Archive the old session file (avoid hard-delete; we already backed up).
  mv "$session_file" "$sessions_dir/${session_id}.jsonl.deleted.$(now_iso_file)" || rm -f "$session_file" || true

  trigger_memory_observation_sync

  report_slurpnet "🔄 Session Auto-Reset (handoff)\n\nAgent: $agent\nOld session: ${session_id:0:8}…\nNew session: ${new_session_id:0:8}…\nSize: ${size_kb}KB (critical: ${CRITICAL_SIZE_KB}KB)\nHandoff: summary generated + injected\n"

  echo "   → Handoff summary: $summary_path"
  if [[ -n "$new_session_id" ]]; then
    echo "   → New session created: $new_session_id"
  else
    echo "   → New session: (not pre-created; no sessions.json entry found)"
  fi
}


echo "=== Session Health Check $(now_iso_utc) ==="

issues_found=0
resets_done=0

while IFS= read -r agent; do
  sessions_dir="$AGENTS_DIR/$agent/sessions"
  [[ -d "$sessions_dir" ]] || continue

  while IFS= read -r session_file; do
    [[ -f "$session_file" ]] || continue

    size_kb=$(du -k "$session_file" | cut -f1)
    session_id=$(basename "$session_file" .jsonl)

    if (( size_kb >= CRITICAL_SIZE_KB )); then
      echo "❌ CRITICAL: $agent session $session_id is ${size_kb}KB (>= ${CRITICAL_SIZE_KB}KB)"
      echo "   → Auto-resetting with handoff to prevent token limit errors"

      reset_session_with_handoff "$agent" "$session_file"

      ((resets_done++))
      ((issues_found++))
    elif (( size_kb >= WARN_SIZE_KB )); then
      echo "⚠️  WARNING: $agent session $session_id is ${size_kb}KB (>= ${WARN_SIZE_KB}KB)"
      ((issues_found++))
    else
      echo "✅ OK: $agent session $session_id is ${size_kb}KB"
    fi
  done < <(find "$sessions_dir" -maxdepth 1 -name "*.jsonl" -type f 2>/dev/null)

done < <(filter_agents)

echo ""
echo "Summary: $issues_found warnings/critical, $resets_done auto-resets"

if (( issues_found > 0 )); then
  exit 1
else
  exit 0
fi
