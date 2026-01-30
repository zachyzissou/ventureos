# Bloom Monitoring Jobs - Mac Edition (Obsidian Output)

**Discord:** Only for actionable alerts (PR ready, CI failed)
**Obsidian:** Research, intel, digests

---

## Job 1: Bloom PR Monitor (→ Discord alerts only)

```json
{
  "id": "bloom-pr-monitor",
  "agentId": "main",
  "name": "Bloom PR Monitor",
  "enabled": true,
  "schedule": {
    "kind": "cron",
    "expr": "*/15 * * * *",
    "tz": "America/Chicago"
  },
  "sessionTarget": "isolated",
  "wakeMode": "next-heartbeat",
  "payload": {
    "kind": "agentTurn",
    "message": "## Bloom PR Monitor\n\nRun:\n```\ngh pr list --repo zachyzissou/Bloom --state open --json number,title,author,reviews,reviewDecision,statusCheckRollup,url\n```\n\n### Decision Tree:\n\n**AUTO-MERGE if ALL true:**\n- reviewDecision = APPROVED\n- All checks passing\n- Run: `gh pr merge <number> --repo zachyzissou/Bloom --squash --auto`\n- Notify Discord: \"✅ Auto-merged PR #<number>: <title>\"\n\n**ALERT to Discord if:**\n- CHANGES_REQUESTED → \"⚠️ PR #<number> needs changes\"\n- CI FAILURE → \"❌ CI failing on PR #<number>\"\n- Open >48h no reviews → \"👀 PR #<number> awaiting review\"\n\n**SILENT if:** Draft, healthy but not ready, CI running\n\nIf nothing to report: HEARTBEAT_OK",
    "deliver": false,
    "channel": "discord",
    "to": "channel:1465859984351953037"
  },
  "isolation": {
    "postToMainPrefix": "🔧 Bloom",
    "postToMainMode": "summary",
    "postToMainMaxChars": 2000
  }
}
```

---

## Job 2: Bloom CI Watch (→ Discord alerts only)

```json
{
  "id": "bloom-ci-watch",
  "agentId": "main",
  "name": "Bloom CI Watch",
  "enabled": true,
  "schedule": {
    "kind": "cron",
    "expr": "*/30 * * * *",
    "tz": "America/Chicago"
  },
  "sessionTarget": "isolated",
  "wakeMode": "next-heartbeat",
  "payload": {
    "kind": "agentTurn",
    "message": "## Bloom CI Watch\n\nRun:\n```\ngh run list --repo zachyzissou/Bloom --limit 10 --json databaseId,name,status,conclusion,headBranch,url,createdAt\n```\n\n**ALERT to Discord if:**\n- conclusion: failure (within last 2h) → \"❌ CI Failed: <name> on <branch>\"\n- status: in_progress >45min → \"⏳ Stuck CI: <name>\"\n\n**SILENT if:**\n- All recent runs succeeded\n- Failures >2h old\n- In-progress runs started recently\n\nIf nothing wrong: HEARTBEAT_OK",
    "deliver": false,
    "channel": "discord",
    "to": "channel:1465859984351953037"
  },
  "isolation": {
    "postToMainPrefix": "🔧 Bloom",
    "postToMainMode": "summary",
    "postToMainMaxChars": 2000
  }
}
```

---

## Job 3: Competitor & Inspiration Watch (→ Obsidian)

```json
{
  "id": "bloom-competitor-watch",
  "agentId": "main",
  "name": "Extraction Shooter Intel",
  "enabled": true,
  "schedule": {
    "kind": "cron",
    "expr": "0 10 * * 1,4",
    "tz": "America/Chicago"
  },
  "sessionTarget": "isolated",
  "wakeMode": "next-heartbeat",
  "payload": {
    "kind": "agentTurn",
    "message": "## Extraction Shooter & Game Dev Intel\n\n### Research (web_search each, freshness: pw):\n- Escape from Tarkov update news\n- Gray Zone Warfare patch notes\n- Dark and Darker updates\n- Hunt Showdown news\n- Unity 6 game development news\n\n### Output to Obsidian:\n\nWrite findings to: `/Users/zachgonser/Obsidian/VaultZap/📚 Knowledge/Competitor Intel/YYYY-MM-DD.md`\n\nFormat:\n```markdown\n# Extraction Shooter Intel - [Date]\n\n## Competitor Moves\n- **[Game]**: [What happened]\n  - Bloom relevance: [Why it matters]\n\n## Tech Worth Knowing\n- **[Tool/Feature]**: [Description]\n  - Application: [How Bloom could use it]\n\n## Design Inspiration\n- [Pattern/Mechanic]: [Brief notes]\n\n## Sources\n- [links]\n```\n\n**Quality bar:** Only high-signal items. Skip minor patches, esports, speculation.\n\n**If nothing interesting:** Write a brief \"No significant updates this cycle\" note and reply HEARTBEAT_OK\n\n**Discord:** Only post if something is URGENT (major competitor launch, breaking Unity news). Otherwise silent.",
    "deliver": false,
    "channel": "discord",
    "to": "channel:1465859984351953037"
  },
  "isolation": {
    "postToMainPrefix": "🎮 Intel",
    "postToMainMode": "summary",
    "postToMainMaxChars": 500
  }
}
```

---

## Job 4: GitHub Tool Scout (→ Obsidian)

```json
{
  "id": "bloom-tool-scout",
  "agentId": "main",
  "name": "Unity Tool Scout",
  "enabled": true,
  "schedule": {
    "kind": "cron",
    "expr": "0 11 * * 2,5",
    "tz": "America/Chicago"
  },
  "sessionTarget": "isolated",
  "wakeMode": "next-heartbeat",
  "payload": {
    "kind": "agentTurn",
    "message": "## Unity/C# Tool Scout\n\n### Search Strategy:\n\nweb_search (freshness: pm):\n- Unity networking library open source\n- Unity procedural generation tool github\n- Unity performance optimization tool\n- Unity ECS multiplayer\n\nGitHub search:\n```\ngh search repos --language=csharp --topic=unity --sort=stars --limit=10 --json name,description,url,stargazersCount\n```\n\n### Output to Obsidian:\n\nWrite to: `/Users/zachgonser/Obsidian/VaultZap/📚 Knowledge/GitHub Finds/YYYY-MM-DD.md`\n\nFormat:\n```markdown\n# Tool Scout Report - [Date]\n\n## Worth Investigating\n\n### [Tool Name]\n- **URL:** [link]\n- **Stars:** [count]\n- **What it does:** [one line]\n- **Bloom use case:** [specific application]\n- **Integration effort:** Low/Medium/High\n- **License:** [type]\n\n## Honorable Mentions\n- [Tool]: [why interesting but not priority]\n\n## Skipped\n- [Brief note on what was searched but not worth including]\n```\n\n**Quality bar:** Only tools that would genuinely help Bloom. Skip tutorials, wrong platforms.\n\n**Discord:** Silent unless you find something exceptional. Reply HEARTBEAT_OK.",
    "deliver": false,
    "channel": "discord",
    "to": "channel:1465859984351953037"
  },
  "isolation": {
    "postToMainPrefix": "🔧 Tools",
    "postToMainMode": "summary",
    "postToMainMaxChars": 500
  }
}
```

---

## Job 5: Weekly Bloom Digest (→ Obsidian + Discord summary)

```json
{
  "id": "bloom-weekly-digest",
  "agentId": "main",
  "name": "Weekly Bloom Digest",
  "enabled": true,
  "schedule": {
    "kind": "cron",
    "expr": "0 18 * * 0",
    "tz": "America/Chicago"
  },
  "sessionTarget": "isolated",
  "wakeMode": "next-heartbeat",
  "payload": {
    "kind": "agentTurn",
    "message": "## Weekly Bloom Digest\n\n### Data Collection:\n\n```bash\n# Merged PRs this week\ngh pr list --repo zachyzissou/Bloom --state merged --search 'merged:>YYYY-MM-DD' --json number,title,mergedAt\n\n# Closed issues\ngh issue list --repo zachyzissou/Bloom --state closed --search 'closed:>YYYY-MM-DD' --json number,title\n\n# Open PRs\ngh pr list --repo zachyzissou/Bloom --state open --json number,title,createdAt\n\n# Open issues\ngh issue list --repo zachyzissou/Bloom --state open --limit 20 --json number,title,labels\n```\n\n### Output to Obsidian:\n\nWrite to: `/Users/zachgonser/Obsidian/VaultZap/📊 Dashboards/Bloom Weekly/YYYY-MM-DD.md`\n\nFormat:\n```markdown\n# Bloom Weekly Digest - Week of [Date]\n\n## 🚀 Shipped This Week\n- PR #X: [title] (merged [date])\n\n## ✅ Issues Closed\n- #X: [title]\n\n## 🔨 In Progress\n- PR #X: [title] - [status]\n\n## 📋 Backlog Snapshot\n- [X] open issues\n- Notable: [high-priority items]\n\n## ⚠️ Attention Needed\n- [blockers, stale items]\n\n## 📈 Velocity\n- PRs merged: X\n- Issues closed: X\n- Trend: [up/down/stable vs last week]\n```\n\n### Discord:\n\nPost a SHORT summary (3-4 lines max):\n\"📊 **Bloom Weekly:** X PRs merged, Y issues closed. [One notable thing or 'Steady progress.']\"",
    "deliver": true,
    "channel": "discord",
    "to": "channel:1465859984351953037"
  },
  "isolation": {
    "postToMainPrefix": "📊 Weekly",
    "postToMainMode": "summary",
    "postToMainMaxChars": 500
  }
}
```

---

## Summary

| Job | Schedule | Output | Discord |
|-----|----------|--------|---------|
| PR Monitor | */15 min | - | Alerts only |
| CI Watch | */30 min | - | Failures only |
| Competitor Watch | Mon/Thu 10am | Obsidian 📚 Knowledge/Competitor Intel/ | Urgent only |
| Tool Scout | Tue/Fri 11am | Obsidian 📚 Knowledge/GitHub Finds/ | Exceptional only |
| Weekly Digest | Sun 6pm | Obsidian 📊 Dashboards/Bloom Weekly/ | Brief summary |

