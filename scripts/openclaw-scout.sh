#!/bin/bash
# OpenClaw Community Scout — Daily discovery of new articles/threads
# Searches X for OpenClaw-related content, filters for quality, outputs JSON
# Designed to be called by a cron job that feeds results to an agent for distillation

set -euo pipefail

BIRD="/opt/homebrew/bin/bird"
OUTPUT_DIR="/Users/zachgonser/clawd/memory/knowledge/scout"
mkdir -p "$OUTPUT_DIR"

DATE=$(date +%Y-%m-%d)
OUTPUT_FILE="$OUTPUT_DIR/scout-$DATE.json"

# Skip if already ran today
if [ -f "$OUTPUT_FILE" ]; then
  echo "Already scouted today: $OUTPUT_FILE"
  exit 0
fi

echo "🔍 Running OpenClaw Community Scout for $DATE..."

# Search queries targeting high-value content
QUERIES=(
  "openclaw agent setup guide"
  "openclaw multi-agent"
  "openclaw SOUL.md"
  "openclaw memory architecture"
  "openclaw cron heartbeat"
  "openclaw skills tutorial"
  "AI agent memory system"
  "AI agent orchestration pattern"
  "autonomous agent architecture 2026"
  "claude code agent workflow"
)

TEMP_DIR=$(mktemp -d)
trap 'rm -rf "$TEMP_DIR"' EXIT

ALL_RESULTS="$TEMP_DIR/all.json"
echo "[]" > "$ALL_RESULTS"

for QUERY in "${QUERIES[@]}"; do
  echo "  Searching: $QUERY"
  RESULT=$($BIRD search --count 10 --json "$QUERY" 2>/dev/null || echo "[]")
  
  # Debug: show result count
  RESULT_COUNT=$(echo "$RESULT" | python3 -c "import json,sys; d=json.load(sys.stdin); print(len(d) if isinstance(d,list) else 0)" 2>/dev/null || echo "0")
  echo "    → Got $RESULT_COUNT results"

  # Filter: skip if empty or error
  if echo "$RESULT" | python3 -c "import json,sys; d=json.load(sys.stdin); sys.exit(0 if isinstance(d,list) and len(d)>0 else 1)" 2>/dev/null; then
    # Merge into all results, dedup by tweet ID
    # Save result to temp file to avoid shell quoting issues
    echo "$RESULT" > "$TEMP_DIR/current.json"
    python3 -c "
import json,sys
existing = json.load(open('$ALL_RESULTS'))
existing_ids = {t.get('id') for t in existing}
try:
    with open('$TEMP_DIR/current.json') as f:
        new = json.load(f)
    for t in new:
        if t.get('id') not in existing_ids:
            t['_query'] = '''$QUERY'''
            existing.append(t)
            existing_ids.add(t.get('id'))
except Exception as e:
    print(f'  ⚠️  Merge error: {e}', file=sys.stderr)
json.dump(existing, open('$ALL_RESULTS','w'))
" 2>&1
  fi
  sleep 2  # Rate limit
done

# Filter for quality (>50 likes, >5 RTs, posted in last 7 days)
# Check BOTH main tweets and quoted tweets for engagement
python3 << PYEOF
import json
from datetime import datetime, timedelta

with open("$ALL_RESULTS") as f:
    tweets = json.load(f)

cutoff = datetime.utcnow() - timedelta(days=7)
quality = []
seen_ids = set()

for t in tweets:
    # Check main tweet
    main_likes = t.get("likeCount", 0) or 0
    main_rts = t.get("retweetCount", 0) or 0
    
    # Check quoted tweet if exists
    qt = t.get("quotedTweet", {})
    qt_likes = qt.get("likeCount", 0) or 0
    qt_rts = qt.get("retweetCount", 0) or 0
    
    # Use whichever has higher engagement
    if qt_likes + qt_rts * 3 > main_likes + main_rts * 3 and qt_likes > 50 and qt_rts > 5:
        # Quoted tweet is the valuable content
        tweet_id = qt.get("id", t["id"])
        if tweet_id in seen_ids:
            continue
        seen_ids.add(tweet_id)
        
        quality.append({
            "id": tweet_id,
            "author": qt.get("author", {}).get("username", "?"),
            "author_name": qt.get("author", {}).get("name", "?"),
            "text": qt.get("text", "")[:300],
            "likes": qt_likes,
            "rts": qt_rts,
            "replies": qt.get("replyCount", 0) or 0,
            "date": qt.get("createdAt", ""),
            "query": t.get("_query", ""),
            "url": f"https://x.com/{qt.get('author',{}).get('username','_')}/status/{tweet_id}",
            "quoted_by": f"@{t.get('author',{}).get('username','?')} ({t['id']})"
        })
    elif main_likes > 50 and main_rts > 5:
        # Main tweet passes filter
        tweet_id = t["id"]
        if tweet_id in seen_ids:
            continue
        seen_ids.add(tweet_id)
        
        quality.append({
            "id": tweet_id,
            "author": t.get("author", {}).get("username", "?"),
            "author_name": t.get("author", {}).get("name", "?"),
            "text": t.get("text", "")[:300],
            "likes": main_likes,
            "rts": main_rts,
            "replies": t.get("replyCount", 0) or 0,
            "date": t.get("createdAt", ""),
            "query": t.get("_query", ""),
            "url": f"https://x.com/{t.get('author',{}).get('username','_')}/status/{tweet_id}"
        })

# Sort by engagement
quality.sort(key=lambda x: x["likes"] + x["rts"] * 3, reverse=True)

output = {
    "date": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
    "total_searched": len(tweets),
    "quality_matches": len(quality),
    "results": quality[:25]  # Top 25
}

with open("$OUTPUT_FILE", "w") as f:
    json.dump(output, f, indent=2)

print(f"✅ Found {len(quality)} quality results from {len(tweets)} total")
PYEOF

echo "📄 Output: $OUTPUT_FILE"
