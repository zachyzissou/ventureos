# StantonTimes Report Formatting

## Discord-Specific Features

Use these Discord markdown features for rich formatting:

### Text Formatting
- **Bold:** `**text**`
- *Italic:* `*text*`
- __Underline:__ `__text__`
- ~~Strikethrough:~~ `~~text~~`
- `Code:` \`text\`
- ||Spoiler:|| `||text||`

### Block Elements
```
> Single line quote
>>> Multi-line quote block
```

### Code Blocks
\`\`\`diff
+ Added/positive (green)
- Removed/negative (red)
\`\`\`

### Timestamps
Use Discord timestamps for dynamic time display:
- `<t:UNIX:R>` → "2 hours ago" (relative)
- `<t:UNIX:F>` → "Monday, January 27, 2026 11:45 PM" (full)

### Lists with Emoji
Use emoji bullets for visual hierarchy:
```
📌 Primary item
├ Sub-item
└ Final sub-item
```

---

## Discord Report Format

When reporting StantonTimes monitoring results to Discord, use this format:

### When Nothing Found (Quiet Check)
```
📰 **The Stanton Times** — All Quiet
━━━━━━━━━━━━━━━━━━━━━━━━━━━
Checked P0-P3 sources • No newsworthy activity
*Next check in 30 min*
```

### When News Found (Draft Ready)
```
📰 **The Stanton Times** — Draft Ready
━━━━━━━━━━━━━━━━━━━━━━━━━━━

📌 **Source:** [@RobertsSpaceInd](https://twitter.com/RobertsSpaceInd)
📌 **Topic:** Alpha 4.6 PTU Wave 1
📌 **Priority:** P0 — Official

>>> **Original:**
[What they tweeted]

**Our Draft:**
```diff
+ ⚡ ALPHA 4.6 PTU NOW LIVE — WAVE 1

+ The first testers are in, Citizens. Here's what's new:
+ • Cargo refactor improvements
+ • New mission types in Crusader
+ • Performance optimizations

+ #StarCitizen #PTU
```

━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ Approve  •  ❌ Reject  •  📝 Edit
```

### Breaking News Alert
```
🚨 **The Stanton Times** — __BREAKING NEWS__
━━━━━━━━━━━━━━━━━━━━━━━━━━━

⚠️ **Priority:** P0 — IMMEDIATE
📌 **Source:** @RobertsSpaceInd
🕐 **Posted:** <t:TIMESTAMP:R>

>>> **Original Tweet:**
[quoted content with link]

**Our Draft:**
```diff
+ ⚡ [HEADLINE]
+
+ [Context and analysis]
+
+ #StarCitizen
```

━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔴 **Fast approval requested** — Breaking news
```

### Engagement Opportunity
```
💬 **The Stanton Times** — Engagement
━━━━━━━━━━━━━━━━━━━━━━━━━━━

**Found:** Reply opportunity
📌 **Account:** @[username]
📌 **Type:** [mention/reply/quote opportunity]

>>> **They said:**
[what they posted]

**Proposed Response:**
```
[our reply text]
```

━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ Approve  •  ❌ Skip  •  📝 Edit
```

### Daily Digest (Summary)
```
📰 **The Stanton Times** — Daily Digest
━━━━━━━━━━━━━━━━━━━━━━━━━━━

**📊 Today's Activity**
├ Tweets posted: `X`
├ Impressions: `X`
├ Engagements: `X likes • X RTs`
└ Replies sent: `X`

**📋 Pending Queue**
├ Drafts awaiting approval: `X`
└ Scheduled posts: `X`

**📅 Tomorrow**
└ [Any known events or planned content]

━━━━━━━━━━━━━━━━━━━━━━━━━━━
*Generated <t:TIMESTAMP:R>*
```

## Formatting Rules

1. **Use dividers** — `━━━━━━━━━━━━━━━━━━━━━━━` for visual separation
2. **Multi-line quotes** — Use `>>>` for quoted tweet content
3. **Diff code blocks** — Use ` ```diff ` with `+` prefix for green tweet previews
4. **Tree lists** — Use `├` `└` for hierarchical data
5. **Bold headers** — **Source:**, **Topic:**, etc.
6. **Emoji prefix** — 📰 standard, 🚨 breaking, 💬 engagement
7. **Keep it scannable** — Zach should get the gist in 2 seconds
8. **Suppress link embeds** — Wrap URLs in `<>` to prevent preview clutter: `<https://twitter.com/...>`
9. **Discord timestamps** — Use `<t:UNIX:R>` for relative times ("2 hours ago")

## Webhook Embeds (Preferred)

For rich Discord embeds with colored sidebars and structured fields, use the webhook script:

```bash
# Set webhook URL first
export STANTON_WEBHOOK_URL="https://discord.com/api/webhooks/..."

# Or load from .env
cd memory/stanton-times && source .env

# Post different types
node post-embed.mjs --type news --source "@RobertsSpaceInd" --topic "Alpha 4.6" --original "..." --draft "..."
node post-embed.mjs --type breaking --source "@RobertsSpaceInd" --topic "SQ42 Gold" --original "..." --draft "..."
node post-embed.mjs --type quiet --sources "P0 Official, P1 Keywords"
node post-embed.mjs --type engagement --account "@user" --context "They said..." --reply "Our reply..."
node post-embed.mjs --type digest --stats '{"tweets":5,"likes":120,"rts":30}'

# Or with JSON for complex data
node post-embed.mjs --json '{"type":"news","source":"@CIG","topic":"Patch 4.6","original":"...","draft":"..."}'
```

### Embed Types

| Type | Color | Use Case |
|------|-------|----------|
| `news` / `draft` | 🔵 Blurple | Standard news draft |
| `breaking` | 🔴 Red | Urgent P0 news |
| `quiet` | 🟢 Green | All quiet check |
| `engagement` | 🟡 Yellow | Reply opportunities |
| `digest` | 🟣 Purple | Daily summary |

## Cron Job Reports

The cron jobs should use the webhook for rich embeds when newsworthy, and standard markdown for quiet checks.
