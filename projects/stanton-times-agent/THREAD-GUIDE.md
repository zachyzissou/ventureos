# StantonTimes Thread Support Guide

**Last Updated:** 2026-01-31

## Overview

StantonTimes now supports Twitter/X threads! The bot can draft multi-tweet threads, post them for approval as a single Discord message, and automatically post the entire thread when you approve.

---

## Thread Caps

- **Soft cap:** 5 tweets (recommended for most content)
- **Hard cap:** 10 tweets (exceptional cases only)
- Threads >5 tweets show a ⚠️ warning icon in Discord

---

## Workflow

### 1. Bot Drafts Thread

The bot uses `compose-thread.mjs` to intelligently break long-form content into tweets:
- Respects 280 character limit per tweet
- Splits at logical boundaries (paragraphs → sentences → words)
- Maintains context flow across tweets

```bash
node compose-thread.mjs "Long content here..."
# Output: ["Tweet 1", "Tweet 2", "Tweet 3"]
```

### 2. Approval in Discord

The bot posts ONE Discord embed showing the full thread:

```
📰 New Story for Approval: Vanguard Sentinel Reveal

🧵 Thread (3 tweets)

[1/3] 📰 Breaking: Aegis Vanguard Sentinel revealed at CitizenCon 2026...

[2/3] The ship features advanced electronic warfare capabilities...

[3/3] Pricing: $275 standalone, available now in the pledge store.

Source: @RobertsSpaceInd
```

### 3. Approval Process

React with:
- ✅ **Approve** → Bot posts entire thread
- ❌ **Reject** → Bot cancels, moves to archive
- 🤔 **Hold** → Bot waits for more input

### 4. Thread Posting

When approved, the bot uses `post-thread.mjs` to post the entire thread:

```bash
node post-thread.mjs '["Tweet 1", "Tweet 2", "Tweet 3"]'
```

The script:
1. Posts first tweet with `bird tweet`
2. Posts remaining tweets as replies using `bird reply`
3. Waits 1 second between tweets (rate limit protection)
4. Returns thread URL (first tweet)

---

## Manual Thread Examples

### Test Thread Composer

```bash
cd ~/clawd/projects/stanton-times-agent/config

# Short content (single tweet)
node compose-thread.mjs "Quick news update."
# Output: ["Quick news update."]

# Medium content (2-3 tweets)
node compose-thread.mjs "Star Citizen 3.25 is now live on the PTU. The update includes major performance improvements, new missions at Levski, and the introduction of the salvage rework. Players are reporting significant FPS gains across all major landing zones."

# Long content (4-5 tweets)
node compose-thread.mjs "$(cat long-article.txt)"
```

### Test Thread Posting

```bash
# Post a 3-tweet thread
node post-thread.mjs '["📰 Breaking: New ship reveal!", "The Aegis Vanguard Sentinel is now available.", "Check the pledge store for details."]'

# Output:
# ✅ Tweet 1 posted: https://x.com/TheStantonTimes/status/123...
# ✅ Tweet 2 posted (reply): https://x.com/TheStantonTimes/status/456...
# ✅ Tweet 3 posted (reply): https://x.com/TheStantonTimes/status/789...
# 🎉 Thread posted successfully! (3 tweets)
# 🔗 Thread link: https://x.com/TheStantonTimes/status/123...
```

### Test Discord Embed

```bash
# Show thread in Discord approval format
node send-embed.mjs \
  --title "New Story for Approval: Ship Reveal" \
  --thread '["📰 Breaking: New ship reveal!", "The Aegis Vanguard Sentinel features...", "Pricing details..."]' \
  --footer "Source: @RobertsSpaceInd"

# Single tweet (backward compatible)
node send-embed.mjs \
  --title "New Story for Approval" \
  --description "Quick news update here." \
  --footer "Source: @discolando"
```

---

## State.json Structure

Threads are stored in `pendingApprovals` with a `thread` array:

```json
{
  "pendingApprovals": [
    {
      "id": "approval-1738366800001",
      "createdAt": "2026-01-31T19:00:00.000Z",
      "source": "@RobertsSpaceInd",
      "sourceTweetId": "123456789",
      "priority": "P1",
      "category": "news",
      "isThread": true,
      "thread": [
        "📰 Breaking: Aegis Vanguard Sentinel revealed...",
        "The ship features advanced electronic warfare...",
        "Pricing: $275 standalone, available now..."
      ],
      "discordMessageId": "1467329852842574021",
      "status": "pending"
    }
  ]
}
```

**Single tweet (backward compatible):**
```json
{
  "id": "approval-1738366800002",
  "tweet": "Quick news update.",
  "isThread": false
}
```

---

## Cron Job Integration

### Example: P0 Monitor Posts Thread

```javascript
// In cron job payload
if (newsworthy) {
  const content = `${emoji} ${headline}\n\n${details}\n\n${pricing}`;
  
  // Compose thread
  const thread = composeThread(content);
  
  // Add to pending approvals
  const approval = {
    id: `approval-${Date.now()}`,
    createdAt: new Date().toISOString(),
    source: '@RobertsSpaceInd',
    isThread: thread.length > 1,
    thread: thread,  // Array of tweets
    status: 'pending'
  };
  
  state.pendingApprovals.push(approval);
  
  // Post to Discord for approval
  execSync(`node config/send-embed.mjs \\
    --title "📰 New Story for Approval: Ship Reveal" \\
    --thread '${JSON.stringify(thread)}' \\
    --footer "Source: @RobertsSpaceInd"`);
}
```

### Example: Approval Check Processes Thread

```javascript
// When ✅ reaction detected
const approval = pendingApprovals.find(a => a.id === approvalId);

if (approval.isThread) {
  // Post entire thread
  execSync(`node config/post-thread.mjs '${JSON.stringify(approval.thread)}'`);
} else {
  // Post single tweet (backward compatible)
  execSync(`node config/post-tweet.mjs "${approval.tweet}"`);
}
```

---

## Benefits

✅ **Single approval** for multi-tweet content  
✅ **Automatic thread posting** (no manual clicking "Add to thread")  
✅ **Backward compatible** with single tweets  
✅ **Smart composition** (logical breakpoints, context flow)  
✅ **Rate limit protection** (1s delay between tweets)  
✅ **Error handling** (partial thread recovery)

---

## Next Steps

1. Update cron jobs to use thread composer for long content
2. Update approval checker to detect threads vs single tweets
3. Test with a real multi-tweet scenario
4. Monitor thread engagement vs single tweets

---

**Questions?** Check `compose-thread.mjs`, `post-thread.mjs`, or `send-embed.mjs` source code.
