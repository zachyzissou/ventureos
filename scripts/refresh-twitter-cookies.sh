#!/bin/bash
# Refresh Twitter cookies from Firefox for bird CLI
# Run daily via cron to keep authentication fresh

FIREFOX_PROFILE="$HOME/Library/Application Support/Firefox/Profiles/9ez1stn7.default-release"
COOKIE_DEST="$HOME/clawd/.credentials/firefox-cookies.sqlite"

# Copy latest cookies
cp "$FIREFOX_PROFILE/cookies.sqlite" "$COOKIE_DEST" 2>/dev/null

if [ $? -eq 0 ]; then
  echo "$(date): Twitter cookies refreshed successfully"
  exit 0
else
  echo "$(date): Failed to refresh Twitter cookies - Firefox may be running"
  # Try again with a brief retry
  sleep 2
  cp "$FIREFOX_PROFILE/cookies.sqlite" "$COOKIE_DEST" 2>/dev/null
  if [ $? -eq 0 ]; then
    echo "$(date): Retry successful"
    exit 0
  else
    echo "$(date): Retry failed"
    exit 1
  fi
fi
