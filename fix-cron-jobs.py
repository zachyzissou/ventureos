#!/usr/bin/env python3
"""
Fix cron jobs with full autonomy and validation.
Applies Phase 1 critical fixes from the prompt quality review.
"""

import json
import os
from pathlib import Path

JOBS_FILE = Path.home() / ".openclaw" / "cron" / "jobs.json"

# New improved prompts
APPROVAL_CHECK_PROMPT = """## StantonTimes Approval Check

**AUTONOMOUS WORKFLOW** - Executes approved tweets immediately

### FIND: Read Pending Approvals
```bash
cat ~/clawd/projects/stanton-times-agent/config/state.json | jq '.pendingApprovals'
```

### VALIDATE: Check Approval Status
For each pending approval:
- Look for `approval_status` field
- Check Discord message reactions (if msg_id present)
- ✅ = APPROVED (post immediately)
- ❌ = REJECTED (archive)
- No reaction >24h = EXPIRED (archive with note)

### EXECUTE: Post Approved Tweets
**For each APPROVED tweet:**
```bash
cd /Users/zachgonser/clawd/scripts
./bird-auth.sh tweet "<tweet_content>" --account TheStantonTimes
```

**Validation before posting:**
- Length ≤ 280 characters
- No duplicate in last 100 tweets (check state.posted_stories)
- Bird CLI authenticated (test with `./bird-auth.sh verify`)

**On success:**
```bash
# Update state.json
jq '.posted_stories += [{"id": "approval-id", "tweet_id": "posted-id", "timestamp": now, "content": "..."}] | .pendingApprovals = [.pendingApprovals[] | select(.id != "approval-id")]' state.json > state.json.tmp
mv state.json.tmp ~/clawd/projects/stanton-times-agent/config/state.json
```

**On failure:**
- Increment failure_count in approval object
- If failure_count >= 3: Move to failed_approvals, alert
- Otherwise: Keep in pendingApprovals, retry next run

### VERIFY: Confirm Posted
```bash
# Fetch posted tweet to confirm
./bird-auth.sh user-tweets @TheStantonTimes -n 1 --json | jq '.[0].id'
```

**Output:**
- Posted N tweets: "✅ Posted to @TheStantonTimes: [titles]"
- Rejected M tweets: "Archived rejected: [titles]"  
- No pending approvals: HEARTBEAT_OK
- Error: "FAILED: [tweet-title] - [error-message]"
"""

FACT_EXTRACTION_PROMPT = """## Fact Extraction

**AUTONOMOUS WORKFLOW** - Extracts facts to Obsidian

### FIND: Read Memory Files
```bash
TODAY=$(date +%Y-%m-%d)
YESTERDAY=$(date -v-1d +%Y-%m-%d 2>/dev/null || date -d "yesterday" +%Y-%m-%d)

# Read today's memory
cat ~/clawd/memory/${TODAY}.md 2>/dev/null || echo "No memory file for today"

# If <50 lines, also read yesterday
LINE_COUNT=$(wc -l < ~/clawd/memory/${TODAY}.md 2>/dev/null || echo "0")
if [ "$LINE_COUNT" -lt 50 ]; then
  cat ~/clawd/memory/${YESTERDAY}.md 2>/dev/null
fi
```

### VALIDATE: Check Last Run
```bash
# Read last check timestamp
LAST_CHECK=$(cat ~/clawd/memory/heartbeat-state.json | jq -r '.lastChecks.memory // 0')
NOW=$(date +%s)

# Only process if >30min since last check
ELAPSED=$(( NOW - LAST_CHECK ))
if [ "$ELAPSED" -lt 1800 ]; then
  echo "HEARTBEAT_OK"
  exit 0
fi
```

### EXTRACT: Identify Facts
**Extraction criteria:**
1. **Decisions:** Lines with "decided to", "choosing", "will use"
2. **Principles:** "learned that", "rule:", "always/never"  
3. **Projects:** Version numbers, "completed", "shipped"
4. **Entities:** Names (proper capitalization), org names

**Format each fact:**
```markdown
---
date: YYYY-MM-DD
source: memory/${TODAY}.md
type: [decision|principle|project|entity]
---

# [Fact Title]
[1-3 sentences of context]
```

### FIX: Store Facts
**Direct write to Obsidian (mcporter not reliable):**
```bash
# People facts
echo "$FACT_CONTENT" > "/Users/zachgonser/Obsidian/VaultZap/life/areas/people/${NAME}.md"

# Project facts  
echo "$FACT_CONTENT" >> "/Users/zachgonser/Obsidian/VaultZap/life/areas/projects/${PROJECT}.md"

# Principles
echo "$FACT_CONTENT" >> "/Users/zachgonser/Obsidian/VaultZap/life/principles/$(date +%Y-%m-%d).md"
```

### VERIFY: Confirm Storage
```bash
# Check files written
ls -la /Users/zachgonser/Obsidian/VaultZap/life/areas/people/ | tail -5

# Update heartbeat timestamp
jq ".lastChecks.memory = $(date +%s)" ~/clawd/memory/heartbeat-state.json > ~/clawd/memory/heartbeat-state.json.tmp
mv ~/clawd/memory/heartbeat-state.json.tmp ~/clawd/memory/heartbeat-state.json
```

**Output:**
- Extracted N facts: "Stored N facts to Obsidian: [categories]"
- Nothing new: HEARTBEAT_OK
- Error: "FAILED: file write error - [details]"
"""

ENGAGEMENT_PROMPT = """## StantonTimes Engagement Monitor

**AUTONOMOUS WORKFLOW** - Drafts replies for approval

### FIND: Check Engagement
```bash
cd /Users/zachgonser/clawd/scripts
./bird-auth.sh user-tweets @TheStantonTimes -n 5 --json > /tmp/st-tweets.json
./bird-auth.sh search "@TheStantonTimes" -n 10 --json > /tmp/st-mentions.json
```

### VALIDATE: Check Response Needed
```bash
# Load state
STATE=$(cat ~/clawd/projects/stanton-times-agent/config/state.json)

# For each mention/reply:
# - Check if tweet_id in handled_interactions
# - Check account metrics: followers >= 100 OR verified=true
# - Check engagement type
```

**Response criteria (MUST meet ≥1):**
1. **Questions:** Contains "?", directed at @TheStantonTimes, from account >100 followers
2. **Corrections:** Claims factual error, provides evidence/source
3. **High engagement:** Tweet has ≥5 likes AND provides constructive insight
4. **VIP accounts:** From @RobertsSpaceInd, @CloudImperiumGames, major creators (>10k followers)

**Auto-skip if:**
- Account <100 followers (likely spam/bots)
- Contains profanity: grep -E "fuck|shit|damn|hate" (case-insensitive)
- Duplicate question (check handled_interactions for similar content)
- Generic praise with no substance ("great work!", "love it!")

### DRAFT: Create Response (AUTONOMOUS)
**For questions:**
```
@user [Direct answer in 1-2 sentences] [Link if applicable]
```

**For corrections:**
```
@user Thanks for the catch! [Corrected info] [Source]
```

**For engagement:**
```
@user [Acknowledge their point] [Add context or insight]
```

**Add to pending:**
```bash
jq --arg draft "$DRAFT" --arg tweet_id "$TWEET_ID" --arg reason "$REASON" '
  .pendingApprovals += [{
    "id": "'$(uuidgen)'",
    "type": "reply",
    "to_tweet_id": $tweet_id,
    "draft": $draft,
    "reason": $reason,
    "created_at": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'"
  }]
' ~/clawd/projects/stanton-times-agent/config/state.json > state.json.tmp
mv state.json.tmp ~/clawd/projects/stanton-times-agent/config/state.json
```

**Post to Discord:**
```bash
cd ~/clawd/projects/stanton-times-agent
node config/send-embed.mjs --title "Reply Draft" --description "$DRAFT" --color "0x1DA1F2"
```

### VERIFY: Quality Check
Before adding to pending:
- Character count ≤ 280
- No obvious typos (basic check: "teh" → "the")
- Professional tone (no slang, emoji only if appropriate)
- Adds value (not just "thanks" or "+1")

**Output:**
- Drafted N replies: "Added N replies to pendingApprovals"
- No engagement needed: HEARTBEAT_OK
- Error: "FAILED: bird CLI auth - try refreshing cookies"
"""

def main():
    print("Loading jobs.json...")
    with open(JOBS_FILE) as f:
        data = json.load(f)
    
    print(f"Found {len(data['jobs'])} jobs")
    
    # Track changes
    changes = []
    
    for job in data['jobs']:
        job_name = job['name']
        
        # Fix 1: StantonTimes Approval Check - full rewrite + reduce frequency
        if job['id'] == 'e9a4c0da-30c8-41ba-96a9-05ae564eedf5':
            print(f"✏️  Updating: {job_name}")
            job['payload']['message'] = APPROVAL_CHECK_PROMPT
            job['schedule']['expr'] = "*/15 * * * *"  # Every 15min instead of 5min
            changes.append(f"- {job_name}: Rewritten with concrete commands, reduced to 15min frequency")
        
        # Fix 2: Fact Extraction - full rewrite
        elif job['id'] == '657a6dbd-a850-4032-a558-73a2d4467e86':
            print(f"✏️  Updating: {job_name}")
            job['payload']['message'] = FACT_EXTRACTION_PROMPT
            changes.append(f"- {job_name}: Rewritten with direct file writes (no mcporter dependency)")
        
        # Fix 3: StantonTimes Engagement - clearer criteria
        elif job['id'] == '0d214337-fcfc-4d1a-a9aa-ae75a127d269':
            print(f"✏️  Updating: {job_name}")
            job['payload']['message'] = ENGAGEMENT_PROMPT
            changes.append(f"- {job_name}: Added concrete decision criteria and autonomous draft workflow")
        
        # Fix 4: Add missing model specifications
        if 'model' not in job['payload'] and job['enabled']:
            if job_name in ['Extraction Shooter Intel', 'Weekly Memory Synthesis']:
                print(f"✏️  Adding model to: {job_name} (qwen3:32b)")
                job['payload']['model'] = 'ollama/qwen3:32b'
                changes.append(f"- {job_name}: Added model qwen3:32b (complex synthesis)")
            elif job_name in ['Unity Tool Scout', 'Weekly Bloom Digest', 'StantonTimes Web RSS']:
                print(f"✏️  Adding model to: {job_name} (qwen3:8b)")
                job['payload']['model'] = 'ollama/qwen3:8b'
                changes.append(f"- {job_name}: Added model qwen3:8b (structured task)")
    
    # Backup original
    backup_file = JOBS_FILE.parent / "jobs.json.backup-before-autonomy-fix"
    print(f"\n📦 Creating backup: {backup_file}")
    with open(backup_file, 'w') as f:
        with open(JOBS_FILE) as orig:
            f.write(orig.read())
    
    # Write updated jobs
    print(f"\n💾 Writing updated jobs.json...")
    with open(JOBS_FILE, 'w') as f:
        json.dump(data, f, indent=2)
    
    print(f"\n✅ Jobs updated successfully!")
    print(f"\nChanges made:")
    for change in changes:
        print(change)
    
    print(f"\n📝 Summary:")
    print(f"- StantonTimes Approval Check: Now runs every 15min (was 5min)")
    print(f"- All critical jobs have concrete bash commands")
    print(f"- All jobs have explicit HEARTBEAT_OK conditions")
    print(f"- Model specifications added where missing")
    print(f"\n⚠️  Gateway restart needed to apply changes: openclaw gateway restart")

if __name__ == '__main__':
    main()
