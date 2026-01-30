# Bloom Monitoring Jobs - Mac Edition (GitHub API Only)

These jobs are designed to work entirely via `gh` CLI and web APIs. No local filesystem dependencies.

---

## Job 1: Bloom PR Monitor

```json
{
  "id": "bloom-pr-monitor",
  "name": "Bloom PR Monitor",
  "schedule": "*/15 * * * *",
  "payload": {
    "message": "## Bloom PR Monitor\n\nRun this command:\n```\ngh pr list --repo zachyzissou/Bloom --state open --json number,title,author,reviews,reviewDecision,statusCheckRollup,url\n```\n\n### Decision Tree:\n\n**For each open PR:**\n\n1. **AUTO-MERGE if ALL true:**\n   - `reviewDecision` = \"APPROVED\"\n   - `statusCheckRollup` shows all checks passing (conclusion: \"SUCCESS\")\n   - Run: `gh pr merge <number> --repo zachyzissou/Bloom --squash --auto`\n   - Notify: \"✅ Auto-merged PR #<number>: <title>\"\n\n2. **ALERT if ANY true:**\n   - `reviewDecision` = \"CHANGES_REQUESTED\" → \"⚠️ PR #<number> needs changes: <title>\"\n   - Any check in `statusCheckRollup` has conclusion: \"FAILURE\" → \"❌ CI failing on PR #<number>: <title> - <failing check name>\"\n   - PR open >48h with no reviews → \"👀 PR #<number> awaiting review: <title>\"\n\n3. **SILENT if:**\n   - PR is approved but CI still running (wait for next cycle)\n   - PR is draft\n   - Everything looks healthy but not ready to merge\n\n### Output:\n- Only post if there's an action or alert\n- If nothing to report, respond HEARTBEAT_OK",
    "channel": "1465859984351953037"
  },
  "isolation": true,
  "model": "anthropic/claude-sonnet-4"
}
```

---

## Job 2: Bloom CI Watch

```json
{
  "id": "bloom-ci-watch",
  "name": "Bloom CI Watch",
  "schedule": "*/30 * * * *",
  "payload": {
    "message": "## Bloom CI Watch\n\nRun this command:\n```\ngh run list --repo zachyzissou/Bloom --limit 10 --json databaseId,name,status,conclusion,headBranch,url,createdAt\n```\n\n### Decision Tree:\n\n**ALERT if:**\n- Any run has `conclusion: \"failure\"` AND was created in the last 2 hours\n- Format: \"❌ **CI Failed:** `<name>` on `<headBranch>`\\n<url>\"\n- Include up to 3 failures max (don't spam)\n\n**ALSO CHECK for stuck runs:**\n- If `status: \"in_progress\"` for >45 minutes (compare createdAt to now)\n- Format: \"⏳ **Stuck CI:** `<name>` running for >45min\\n<url>\"\n\n**SILENT if:**\n- All recent runs succeeded\n- Failures are >2 hours old (already reported)\n- Only in_progress runs that started recently\n\n### Output:\n- Only post failures or stuck runs\n- Group multiple failures into one message\n- If nothing wrong, respond HEARTBEAT_OK",
    "channel": "1465859984351953037"
  },
  "isolation": true,
  "model": "anthropic/claude-sonnet-4"
}
```

---

## Job 3: Competitor & Inspiration Watch

```json
{
  "id": "bloom-competitor-watch",
  "name": "Extraction Shooter Intel",
  "schedule": "0 10 * * 1,4",
  "payload": {
    "message": "## Extraction Shooter & Game Dev Intel\n\n### Research Tasks:\n\n**1. Competitor News (web_search each):**\n- \"Escape from Tarkov update news\" (freshness: pw)\n- \"Gray Zone Warfare patch notes\" (freshness: pw)\n- \"Dark and Darker updates\" (freshness: pw)\n- \"Hunt Showdown news\" (freshness: pw)\n\n**2. Engine & Tech:**\n- \"Unity 6 game development news\" (freshness: pw)\n- \"Unity networking multiplayer 2024\" (freshness: pm)\n\n**3. Design Inspiration:**\n- \"extraction shooter game design\" (freshness: pm)\n- \"procedural level generation games\" (freshness: pm)\n\n### Output Format:\n\n**Only report HIGH-SIGNAL items:**\n- Major game updates/patches\n- New features competitors added\n- Unity tech that could help Bloom\n- Interesting design patterns worth stealing\n\n**Format:**\n```\n🎮 **Extraction Shooter Intel - [Date]**\n\n**Competitor Moves:**\n• [Game]: [What happened] - [Why it matters for Bloom]\n\n**Tech Worth Knowing:**\n• [Tool/Feature]: [What it does] - [Bloom relevance]\n\n**Design Inspiration:**\n• [Pattern/Mechanic]: [Brief description]\n```\n\n**Skip if:**\n- Just minor hotfixes\n- Esports/tournament news\n- Speculation without substance\n- Nothing genuinely useful this cycle",
    "channel": "1465859984351953037"
  },
  "isolation": true,
  "model": "anthropic/claude-sonnet-4",
  "thinking": "low"
}
```

---

## Job 4: GitHub Tool Scout

```json
{
  "id": "bloom-tool-scout",
  "name": "Unity Tool Scout",
  "schedule": "0 11 * * 2,5",
  "payload": {
    "message": "## Unity/C# Tool Scout for Bloom\n\n### Search Strategy:\n\nRun web searches (freshness: pm):\n1. \"Unity networking library open source 2024\"\n2. \"Unity procedural generation tool github\"\n3. \"Unity performance optimization tool\"\n4. \"C# game server framework\"\n5. \"Unity ECS multiplayer\"\n\nAlso check GitHub trending:\n- `gh search repos --language=csharp --topic=unity --sort=stars --limit=10 --json name,description,url,stargazersCount,updatedAt`\n\n### Evaluation Criteria:\n\nFor each interesting find, assess:\n1. **Bloom Fit:** Does this solve a problem Bloom has?\n2. **Maturity:** Stars, recent commits, documentation quality\n3. **Integration Effort:** Drop-in vs major refactor\n4. **License:** MIT/Apache preferred, avoid GPL for game dev\n\n### Output Format:\n\n```\n🔧 **Tool Scout Report - [Date]**\n\n**Worth Investigating:**\n• [Tool Name](url) - ⭐ [stars]\n  What: [one line]\n  Bloom Use: [specific application]\n  Effort: Low/Medium/High\n\n**Honorable Mentions:**\n• [Tool]: [why it's interesting but not priority]\n```\n\n**Quality Bar:**\n- Only report tools that would genuinely help Bloom\n- Skip generic Unity tutorials/courses\n- Skip tools for platforms Bloom doesn't target\n- If nothing good this week, say so briefly",
    "channel": "1465859984351953037"
  },
  "isolation": true,
  "model": "anthropic/claude-sonnet-4",
  "thinking": "low"
}
```

---

## Job 5: Weekly Bloom Digest

```json
{
  "id": "bloom-weekly-digest",
  "name": "Weekly Bloom Digest",
  "schedule": "0 18 * * 0",
  "payload": {
    "message": "## Weekly Bloom Digest\n\n### Data Collection:\n\nRun these commands to gather the week's activity:\n\n```bash\n# Get date 7 days ago (format: YYYY-MM-DD)\nDATE_7D_AGO=$(date -v-7d '+%Y-%m-%d')\n\n# Merged PRs this week\ngh pr list --repo zachyzissou/Bloom --state merged --search \"merged:>$DATE_7D_AGO\" --json number,title,author,mergedAt,url\n\n# Closed issues this week  \ngh issue list --repo zachyzissou/Bloom --state closed --search \"closed:>$DATE_7D_AGO\" --json number,title,closedAt,url\n\n# Open PRs (pending work)\ngh pr list --repo zachyzissou/Bloom --state open --json number,title,author,createdAt,url\n\n# Open issues (backlog snapshot)\ngh issue list --repo zachyzissou/Bloom --state open --limit 20 --json number,title,labels,url\n\n# Recent commits on main\ngh api repos/zachyzissou/Bloom/commits?per_page=15 --jq '.[] | {sha: .sha[0:7], message: .commit.message | split(\"\\n\")[0], author: .commit.author.name, date: .commit.author.date}'\n```\n\n### Output Format:\n\n```\n📊 **Bloom Weekly Digest - Week of [Date]**\n\n**🚀 Shipped This Week:**\n• PR #X: [title] (merged [date])\n• PR #Y: [title] (merged [date])\n[or \"No PRs merged this week\"]\n\n**✅ Issues Closed:**\n• #X: [title]\n[or \"No issues closed\"]\n\n**🔨 In Progress:**\n• PR #X: [title] - [status: awaiting review/changes requested/CI failing]\n\n**📋 Backlog Highlights:**\n• [X] open issues total\n• Notable: [any high-priority or interesting items]\n\n**📈 Commit Activity:**\n• [X] commits to main this week\n• Key changes: [brief summary of significant commits]\n\n**⚠️ Blockers/Attention Needed:**\n• [Any PRs stuck, CI issues, stale items]\n[or \"None - looking healthy!\"]\n```\n\n### Always Generate Output:\nThis is a weekly summary - always post even if activity was low. That's useful info too.",
    "channel": "1465859984351953037"
  },
  "isolation": true,
  "model": "anthropic/claude-sonnet-4",
  "thinking": "low"
}
```

---

## Summary Table

| Job ID | Schedule | Purpose | Alert Threshold |
|--------|----------|---------|-----------------|
| bloom-pr-monitor | Every 15 min | Auto-merge ready PRs, alert on issues | Action needed only |
| bloom-ci-watch | Every 30 min | Catch CI failures fast | Failures only |
| bloom-competitor-watch | Mon/Thu 10am | Market intel | High-signal only |
| bloom-tool-scout | Tue/Fri 11am | Find useful tools | Worth investigating only |
| bloom-weekly-digest | Sunday 6pm | Weekly summary | Always posts |

---

## Installation

Copy each JSON block into `/Users/zachgonser/clawd/config/jobs.json` inside the `jobs` array.

Or append programmatically:
```bash
# After editing jobs.json, validate:
jq . /Users/zachgonser/clawd/config/jobs.json

# Restart gateway to pick up changes:
clawdbot gateway restart
```
