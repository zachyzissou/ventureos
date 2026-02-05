#!/bin/bash
# Update StantonTimes cron jobs to use bird-auth.sh
set -e

JOBS_FILE="$HOME/.openclaw/cron/jobs.json"
BACKUP_FILE="$HOME/.openclaw/cron/jobs.json.backup-manual"

# Backup
cp "$JOBS_FILE" "$BACKUP_FILE"
openclaw "✅ Backup created: $BACKUP_FILE"

# Update bird commands to bird-auth.sh in all StantonTimes jobs
cat "$JOBS_FILE" | jq '
  .jobs |= map(
    if (.name | contains("StantonTimes")) and (.name != "StantonTimes P1 Keywords") then
      .payload.message |= gsub(
        "bird user-tweets";
        "/Users/zachgonser/clawd/scripts/bird-auth.sh user-tweets"
      ) | gsub(
        "bird search";
        "/Users/zachgonser/clawd/scripts/bird-auth.sh search"
      ) | gsub(
        "bird mentions";
        "/Users/zachgonser/clawd/scripts/bird-auth.sh mentions"
      ) | gsub(
        "--chrome-profile-dir /Users/zachgonser/clawd/.credentials/firefox-cookies.sqlite";
        ""
      ) | gsub(
        "--json  ";
        "--json "
      )
    else
      .
    end
  )
' > "$JOBS_FILE.tmp"

# Replace original
mv "$JOBS_FILE.tmp" "$JOBS_FILE"

openclaw "✅ Updated StantonTimes jobs to use bird-auth.sh"
openclaw "📋 Jobs updated:"
jq -r '.jobs[] | select(.name | contains("StantonTimes")) | "  - \(.name)"' "$JOBS_FILE"

openclaw ""
openclaw "🔄 Restart gateway to reload: openclaw gateway restart"
