#!/bin/bash
# Manual StantonTimes tweet posting workflow
# Shows pending approvals and allows manual posting via browser

STATE_FILE="$HOME/clawd/projects/stanton-times-agent/config/state.json"

echo "📰 StantonTimes Manual Posting Tool"
echo "======================================"
echo

# Read pending approvals
PENDING=$(jq -r '.pendingApprovals' "$STATE_FILE")
COUNT=$(echo "$PENDING" | jq 'length')

if [ "$COUNT" -eq "0" ]; then
    echo "✅ No pending approvals"
    exit 0
fi

echo "Found $COUNT pending tweet(s):"
echo

for i in $(seq 0 $((COUNT - 1))); do
    APPROVAL=$(echo "$PENDING" | jq ".[$i]")
    ID=$(echo "$APPROVAL" | jq -r '.id')
    TOPIC=$(echo "$APPROVAL" | jq -r '.topic')
    DRAFT=$(echo "$APPROVAL" | jq -r '.draft')
    
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "[$((i + 1))/$COUNT] $TOPIC"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo
    echo "$DRAFT"
    echo
    echo "ID: $ID"
    echo
done

echo "======================================"
echo
echo "To post these tweets:"
echo "1. Go to https://twitter.com/compose/tweet"
echo "2. Log in as @TheStantonTimes"
echo "3. Copy/paste the tweet content above"
echo "4. Post manually"
echo
echo "After posting, run this script with posted tweet IDs:"
echo "  $0 --mark-posted <approval-id> <tweet-id>"
echo
echo "To reject a tweet:"
echo "  $0 --reject <approval-id>"
echo

# Handle mark-posted command
if [ "$1" = "--mark-posted" ]; then
    APPROVAL_ID="$2"
    TWEET_ID="$3"
    
    if [ -z "$APPROVAL_ID" ] || [ -z "$TWEET_ID" ]; then
        echo "❌ Usage: $0 --mark-posted <approval-id> <tweet-id>"
        exit 1
    fi
    
    # Move to posted_stories
    jq --arg aid "$APPROVAL_ID" --arg tid "$TWEET_ID" '
        .posted_stories += [
            (.pendingApprovals[] | select(.id == $aid) | {
                topic: .topic,
                source: .source,
                tweet_id: $tid,
                posted_at: (now | strftime("%Y-%m-%dT%H:%M:%SZ"))
            })
        ] |
        .pendingApprovals = [.pendingApprovals[] | select(.id != $aid)]
    ' "$STATE_FILE" > "$STATE_FILE.tmp"
    mv "$STATE_FILE.tmp" "$STATE_FILE"
    
    echo "✅ Marked as posted: $APPROVAL_ID → tweet $TWEET_ID"
fi

# Handle reject command
if [ "$1" = "--reject" ]; then
    APPROVAL_ID="$2"
    
    if [ -z "$APPROVAL_ID" ]; then
        echo "❌ Usage: $0 --reject <approval-id>"
        exit 1
    fi
    
    # Remove from pendingApprovals
    jq --arg aid "$APPROVAL_ID" '
        .pendingApprovals = [.pendingApprovals[] | select(.id != $aid)]
    ' "$STATE_FILE" > "$STATE_FILE.tmp"
    mv "$STATE_FILE.tmp" "$STATE_FILE"
    
    echo "✅ Rejected: $APPROVAL_ID"
fi
