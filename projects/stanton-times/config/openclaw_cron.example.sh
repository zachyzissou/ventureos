#!/usr/bin/env bash
set -euo pipefail

# OpenClaw cron jobs for Stanton Times.
#
# These jobs are OpenClaw "agent cron" jobs: they send a message to an agent
# that runs the actual command in its workspace.
#
# 1) Pick an agent id that has the Stanton Times workspace:
#    openclaw agents list
#
# 2) Set AGENT_ID and PROJECT_DIR (path in that agent workspace), then run:
#    bash config/openclaw_cron.example.sh

AGENT_ID="${AGENT_ID:-REPLACE_ME}"
PROJECT_DIR="${PROJECT_DIR:-/path/to/stanton-times-codex}"
PY="${PY:-$PROJECT_DIR/.venv/bin/python}"

if [[ "$AGENT_ID" == "REPLACE_ME" ]]; then
  echo "Set AGENT_ID to your OpenClaw agent id." >&2
  exit 2
fi

# Monitor: ingest sources, score, draft, and post for review.
openclaw cron add \
  --name stantontimes-monitor \
  --description "Stanton Times: monitor sources and draft" \
  --agent "$AGENT_ID" \
  --cron "*/15 * * * *" \
  --message "cd $PROJECT_DIR && $PY src/app.py monitor"

# Approval: (re)post any needs_review drafts to Discord via webhook.
openclaw cron add \
  --name stantontimes-approval \
  --description "Stanton Times: approval loop (send drafts to Discord)" \
  --agent "$AGENT_ID" \
  --cron "*/5 * * * *" \
  --message "cd $PROJECT_DIR && $PY src/app.py verify"

# Publisher: publish approved drafts to X (bird).
openclaw cron add \
  --name stantontimes-publish \
  --description "Stanton Times: publish approved drafts" \
  --agent "$AGENT_ID" \
  --cron "*/10 * * * *" \
  --message "cd $PROJECT_DIR && $PY src/app.py publish"
