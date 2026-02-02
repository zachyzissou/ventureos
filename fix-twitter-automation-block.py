#!/usr/bin/env python3
"""
Fix StantonTimes Approval Check to handle Twitter automation blocking.
Switches to notification-only mode instead of attempting automated posting.
"""

import json
from pathlib import Path

JOBS_FILE = Path.home() / ".openclaw" / "cron" / "jobs.json"

NEW_APPROVAL_CHECK_PROMPT = """## StantonTimes Approval Check

**NOTIFICATION WORKFLOW** - Twitter blocks automated posting (error 226)

### FIND: Read Pending Approvals
```bash
STATE_FILE="$HOME/clawd/projects/stanton-times-agent/config/state.json"
jq -r '.pendingApprovals' "$STATE_FILE"
```

### VALIDATE: Check for Pending Tweets
```bash
PENDING_COUNT=$(jq -r '.pendingApprovals | length' "$STATE_FILE")

if [ "$PENDING_COUNT" -eq "0" ]; then
    echo "HEARTBEAT_OK"
    exit 0
fi
```

### NOTIFY: Alert User of Pending Tweets
**If pending approvals exist:**

1. **Generate summary:**
```bash
SUMMARY=$(jq -r '
    .pendingApprovals | 
    map("• " + .topic) | 
    join("\\n")
' "$STATE_FILE")
```

2. **Send Discord notification:**
```bash
cd ~/clawd/projects/stanton-times-agent/config
node send-embed.mjs \\
    --title "📰 StantonTimes: $PENDING_COUNT Tweet(s) Ready" \\
    --description "Pending approval:\\n\\n$SUMMARY\\n\\n**Manual posting required** (Twitter blocks automation)\\n\\nRun: \`~/clawd/scripts/stantontimes-manual-post.sh\`" \\
    --color "0xFF9900" \\
    --ping "956203522624462918"
```

### VERIFY: Confirm Notification Sent
- Check Discord webhook returned 200 OK
- Log notification time in state.json (optional)

**Output:**
- Pending tweets: "🔔 Notified about N pending tweets"
- No pending: HEARTBEAT_OK
- Error: "FAILED: Discord webhook error"

**Note:** Twitter's automation detection (error 226) prevents automated posting.
Manual workflow: Use `~/clawd/scripts/stantontimes-manual-post.sh` to review and post.
"""

def main():
    print("Updating StantonTimes Approval Check to handle Twitter automation block...")
    
    with open(JOBS_FILE) as f:
        data = json.load(f)
    
    for job in data['jobs']:
        if job['id'] == 'e9a4c0da-30c8-41ba-96a9-05ae564eedf5':
            print(f"✏️  Updating: {job['name']}")
            job['payload']['message'] = NEW_APPROVAL_CHECK_PROMPT
            # Reduce frequency to 30 min since it's just notifications now
            job['schedule']['expr'] = "*/30 * * * *"
            print("  - Changed to notification-only workflow")
            print("  - Frequency reduced to 30 min (was 15 min)")
            break
    
    # Backup
    backup_file = JOBS_FILE.parent / "jobs.json.backup-twitter-automation-fix"
    print(f"\n📦 Creating backup: {backup_file}")
    with open(backup_file, 'w') as f:
        with open(JOBS_FILE) as orig:
            f.write(orig.read())
    
    # Write updated jobs
    print(f"\n💾 Writing updated jobs.json...")
    with open(JOBS_FILE, 'w') as f:
        json.dump(data, f, indent=2)
    
    print(f"\n✅ Job updated successfully!")
    print(f"\n📝 Summary:")
    print(f"- Approval Check now notifies via Discord instead of posting")
    print(f"- Use ~/clawd/scripts/stantontimes-manual-post.sh to post tweets")
    print(f"- Frequency reduced to 30min (less noisy notifications)")
    print(f"\n⚠️  Gateway restart needed: openclaw gateway restart")

if __name__ == '__main__':
    main()
