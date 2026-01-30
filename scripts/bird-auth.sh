#!/bin/bash
# Bird CLI wrapper that extracts Twitter cookies from custom Firefox cookie DB
# Usage: bird-auth.sh <bird-command> [args...]

COOKIE_DB="/Users/zachgonser/clawd/.credentials/firefox-cookies.sqlite"

# Extract cookies from SQLite database
AUTH_TOKEN=$(sqlite3 "$COOKIE_DB" "SELECT value FROM moz_cookies WHERE name='auth_token' AND (host LIKE '%twitter.com' OR host LIKE '%x.com') LIMIT 1;" 2>/dev/null)
CT0=$(sqlite3 "$COOKIE_DB" "SELECT value FROM moz_cookies WHERE name='ct0' AND (host LIKE '%twitter.com' OR host LIKE '%x.com') LIMIT 1;" 2>/dev/null)

# Check if cookies were found
if [ -z "$AUTH_TOKEN" ] || [ -z "$CT0" ]; then
    echo "❌ Error: Could not extract Twitter cookies from $COOKIE_DB" >&2
    exit 1
fi

# Run bird with extracted cookies
exec bird --auth-token "$AUTH_TOKEN" --ct0 "$CT0" "$@"
