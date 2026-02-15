#!/usr/bin/env bash
set -uo pipefail
# session-bridge.sh — Poll OpenClaw session stores, write to agent_sessions table
# Runs as background daemon, polls every 15s, prunes stale sessions after 5 min
# Idempotent: safe to restart at any time.

DB_PATH="${DB_PATH:-$HOME/clawd/agents/ventureos-rpg.db}"
AGENTS_DIR="${AGENTS_DIR:-$HOME/.openclaw/agents}"
POLL_INTERVAL=15
PRUNE_AGE_SECONDS=300  # 5 minutes
LOG_PREFIX="[session-bridge]"

log() { echo "$LOG_PREFIX $(date '+%Y-%m-%d %H:%M:%S') $*"; }
err() { echo "$LOG_PREFIX $(date '+%Y-%m-%d %H:%M:%S') ERROR: $*" >&2; }

# Ensure DB and table exist
init_db() {
  sqlite3 "$DB_PATH" <<'SQL'
CREATE TABLE IF NOT EXISTS agent_sessions (
  agent_id TEXT NOT NULL,
  session_key TEXT PRIMARY KEY,
  label TEXT,
  updated_at INTEGER,
  total_tokens INTEGER,
  model TEXT,
  kind TEXT,
  context_tokens INTEGER,
  last_seen_at INTEGER NOT NULL DEFAULT 0
);
SQL
  if [ $? -ne 0 ]; then
    err "Failed to initialize database"
    return 1
  fi
  # Migration: add columns that may not exist yet
  for col_def in "kind TEXT" "context_tokens INTEGER" "last_seen_at INTEGER NOT NULL DEFAULT 0"; do
    col_name=$(echo "$col_def" | awk '{print $1}')
    sqlite3 "$DB_PATH" "SELECT $col_name FROM agent_sessions LIMIT 0;" 2>/dev/null || \
      sqlite3 "$DB_PATH" "ALTER TABLE agent_sessions ADD COLUMN $col_def;" 2>/dev/null
  done
}

# Main poll cycle: read all agent session stores, upsert to DB, prune stale
poll_sessions() {
  local now_epoch
  now_epoch=$(date +%s)

  python3 - "$DB_PATH" "$AGENTS_DIR" "$now_epoch" "$PRUNE_AGE_SECONDS" <<'PYTHON'
import sys, json, os, glob, sqlite3, time

db_path = sys.argv[1]
agents_dir = sys.argv[2]
now_epoch = int(sys.argv[3])
prune_age = int(sys.argv[4])

# Find all session stores
stores = glob.glob(os.path.join(agents_dir, "*/sessions/sessions.json"))

all_sessions = []

for store_path in stores:
    try:
        with open(store_path, "r") as f:
            data = json.load(f)
    except (json.JSONDecodeError, FileNotFoundError, PermissionError) as e:
        print(f"[session-bridge] WARN: Could not read {store_path}: {e}", file=sys.stderr)
        continue

    # Sessions are stored as dict keyed by session key
    if not isinstance(data, dict):
        continue

    for key, sess in data.items():
        if not isinstance(sess, dict):
            continue

        # Parse agent_id from key: agent:<agentId>:<type>:<rest>
        parts = key.split(":")
        if len(parts) >= 2 and parts[0] == "agent":
            agent_id = parts[1]
        else:
            agent_id = "unknown"

        updated_at_ms = sess.get("updatedAt")
        updated_at = int(updated_at_ms / 1000) if updated_at_ms else None

        total_tokens = sess.get("totalTokens")
        if total_tokens is not None:
            total_tokens = int(total_tokens)

        model = sess.get("model") or sess.get("modelOverride")
        label = sess.get("label") or sess.get("groupChannel")
        kind = sess.get("kind")  # from openclaw sessions output; raw files may not have it

        # Infer kind from key if not present
        if not kind:
            if ":subagent:" in key:
                kind = "subagent"
            elif ":cron:" in key:
                kind = "cron"
            elif ":discord:" in key:
                kind = "group"
            else:
                kind = "direct"

        context_tokens = sess.get("contextTokens")
        if context_tokens is not None:
            context_tokens = int(context_tokens)

        all_sessions.append({
            "agent_id": agent_id,
            "session_key": key,
            "label": label,
            "updated_at": updated_at,
            "total_tokens": total_tokens,
            "model": model,
            "kind": kind,
            "context_tokens": context_tokens,
            "last_seen_at": now_epoch,
        })

# Write to DB
conn = sqlite3.connect(db_path)
cur = conn.cursor()

# Upsert all sessions
for s in all_sessions:
    cur.execute("""
        INSERT INTO agent_sessions (agent_id, session_key, label, updated_at, total_tokens, model, kind, context_tokens, last_seen_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(session_key) DO UPDATE SET
            agent_id = excluded.agent_id,
            label = excluded.label,
            updated_at = excluded.updated_at,
            total_tokens = excluded.total_tokens,
            model = excluded.model,
            kind = excluded.kind,
            context_tokens = excluded.context_tokens,
            last_seen_at = excluded.last_seen_at
    """, (
        s["agent_id"], s["session_key"], s["label"], s["updated_at"],
        s["total_tokens"], s["model"], s["kind"], s["context_tokens"],
        s["last_seen_at"],
    ))

# Prune sessions not seen in prune_age seconds
cutoff = now_epoch - prune_age
cur.execute("DELETE FROM agent_sessions WHERE last_seen_at < ? AND last_seen_at > 0", (cutoff,))
pruned = cur.rowcount

conn.commit()
conn.close()

print(f"[session-bridge] Upserted {len(all_sessions)} sessions, pruned {pruned} stale entries")
PYTHON
}

# --- Main loop ---
log "Starting session bridge daemon (poll=${POLL_INTERVAL}s, prune=${PRUNE_AGE_SECONDS}s)"
log "DB: $DB_PATH"
log "Agents dir: $AGENTS_DIR"

init_db || { err "DB init failed, exiting"; exit 1; }

while true; do
  poll_sessions 2>&1 || err "Poll cycle failed (will retry)"
  sleep "$POLL_INTERVAL"
done
