# Cron Job Prompt Quality Review - February 2, 2025

## Overall Quality Score
**3.8/5** - Good structure with room for improvement

Jobs show strong use of FIND → VALIDATE → FIX → VERIFY methodology, but inconsistency in autonomy instructions and output expectations. Several jobs have unclear decision criteria and reporting patterns.

---

## Top Issues

### 1. **Inconsistent Autonomy Instructions** (9 jobs affected)
- Some jobs say "AUTONOMOUS - No permission needed"
- Others have implicit approval-seeking behavior
- Conflicting messages: "Draft for approval" vs "Do NOT ask permission"

### 2. **Vague Decision Criteria** (7 jobs affected)
- "Newsworthy" undefined in Creator Monitor
- "Genuinely newsworthy" vs regular newsworthy - no distinction
- "Worth investigating" without concrete criteria

### 3. **Unclear HEARTBEAT_OK Conditions** (5 jobs affected)
- When exactly to return HEARTBEAT_OK?
- Some say "If nothing wrong" vs "If nothing new"
- Silent vs reporting distinction not always clear

### 4. **Missing Error Handling** (8 jobs affected)
- What to do when commands fail?
- Network errors, API rate limits, auth failures
- Most jobs say "Escalate" but don't specify HOW

### 5. **State Management Ambiguity** (6 jobs affected)
- "Read state.json" - which state file? Path inconsistent
- Update instructions unclear (append vs replace)
- No rollback instructions if operations fail

---

## Jobs Needing Improvement

### Critical Rewrites Needed:

#### 1. **StantonTimes Approval Check** (Rating: 2.3/5)
**Issues:**
- No explicit commands to read Discord reactions
- "Process Discord reactions" - HOW?
- State management operations unspecified
- Missing validation steps

#### 2. **Fact Extraction** (Rating: 2.8/5)
**Issues:**
- "Use mcporter" - no command examples
- Obsidian connection check unspecified
- Category logic unclear
- Last-run timestamp tracking vague

#### 3. **StantonTimes Engagement** (Rating: 2.9/5)
**Issues:**
- "Draft for approval if complex" - what defines complex?
- "On-brand" undefined
- State.json read/write operations unclear
- Response quality criteria too subjective

### Moderate Rewrites Needed:

#### 4. **Weekly Memory Synthesis** (Rating: 3.0/5)
**Issues:**
- "Update MEMORY.md" - with what? How?
- File reading loop not specified
- Synthesis algorithm vague
- No validation of output quality

#### 5. **Morning Briefing** (Rating: 3.2/5)
**Issues:**
- Calendar/email reading commands missing
- "Check for urgent/important" - no criteria
- Weather source unspecified
- Data freshness validation unclear

#### 6. **StantonTimes Creator Monitor** (Rating: 3.1/5)
**Issues:**
- "Must add value beyond official sources" - subjective
- Creator hierarchy/priority unclear
- Duplicate handling with other monitors undefined
- Uses qwen3:32b but seems like qwen3:8b task

---

## Best Examples

### Excellent:

#### 1. **Bloom PR Monitor** (Rating: 4.5/5)
**Strengths:**
- Clear FIND → VALIDATE → FIX → VERIFY structure
- Specific commands with exact flags
- Well-defined auto-merge criteria
- Explicit silent conditions
- Proper escalation paths

**Minor issue:** Could specify exact alert format

#### 2. **Bloom CI Watch** (Rating: 4.3/5)
**Strengths:**
- Precise time thresholds (2h, 45min)
- Clear alert conditions with examples
- Specific emoji usage
- Unambiguous silent conditions
- Appropriate model (qwen3:8b for simple checks)

**Minor issue:** No retry logic for transient failures

#### 3. **Refresh Twitter Cookies** (Rating: 4.7/5)
**Strengths:**
- Single, specific command
- Clear success/failure outputs
- Appropriate context about Firefox lock
- No ambiguity
- Simple task = simple prompt

### Good:

#### 4. **Weekly Bloom Digest** (Rating: 3.9/5)
**Strengths:**
- All commands specified with exact flags
- Clear date calculation pattern
- Well-defined output format
- Discord summary format provided

**Issues:** Date substitution pattern `YYYY-MM-DD` not concrete command

#### 5. **Unity Tool Scout** (Rating: 3.8/5)
**Strengths:**
- Multi-source strategy clear
- Quality bar explicitly stated
- Output structure well-defined
- Good use of freshness parameter

**Issues:** "Genuinely help Bloom" subjective, no scoring system

---

## Recommended Rewrites

### StantonTimes Approval Check
**Current issues:** Vague, no commands, unclear process

**Rewrite:**
```markdown
## StantonTimes Approval Check

**Methodology:** FIND → VALIDATE → EXECUTE → VERIFY

### FIND: Read Pending Approvals
```bash
cat ~/clawd/projects/stanton-times-agent/config/state.json | jq '.pendingApprovals'
```

### VALIDATE: Check Discord Reactions
For each pending approval with Discord message ID:
```bash
# Check reactions on message (if Discord API available)
# OR check state.json for approval_status field
```

**Approval criteria:**
- ✅ reaction from user:956203522624462918 = APPROVED
- ❌ reaction = REJECTED
- No reaction after 24h = EXPIRED (archive)

### EXECUTE: Post Approved Tweets
For each APPROVED tweet:
```bash
/Users/zachgonser/clawd/scripts/bird-auth.sh tweet "<content>" --account TheStantonTimes
```

**Validation before posting:**
- Length ≤ 280 chars
- No duplicate content in last 100 tweets
- Bird CLI authenticated (check exit code)

### FIX: Update State
On success:
- Move from pendingApprovals to posted_stories
- Add tweet ID and timestamp
- Archive rejected/expired items

On failure:
- Log error to state.json errors array
- Keep in pendingApprovals
- Escalate if same tweet fails 3 times

### VERIFY: Confirm Actions
- Check posted tweet exists (fetch via bird CLI)
- Validate state.json updated correctly
- No orphaned entries

**Output:**
- Posted N tweets: Report IDs and titles
- Rejected M tweets: Report titles (no action)
- No pending approvals: HEARTBEAT_OK
- Error: "FAILED: <tweet-title> - <error-message>"
```

---

### Fact Extraction
**Current issues:** mcporter usage unclear, no concrete commands

**Rewrite:**
```markdown
## Fact Extraction

**Methodology:** FIND → VALIDATE → EXTRACT → VERIFY

### FIND: Read Memory Files
```bash
TODAY=$(date +%Y-%m-%d)
YESTERDAY=$(date -v-1d +%Y-%m-%d)

# Read today's memory
cat memory/${TODAY}.md

# If <50 lines, also read yesterday
LINE_COUNT=$(wc -l < memory/${TODAY}.md)
if [ "$LINE_COUNT" -lt 50 ]; then
  cat memory/${YESTERDAY}.md
fi
```

### VALIDATE: Check Last Run
```bash
# Read last check timestamp
cat memory/heartbeat-state.json | jq '.lastChecks.memory'

# Only process lines added since last check
# Filter by timestamp if structured, otherwise process all
```

### EXTRACT: Identify Facts
**Extraction criteria:**
1. **Decisions:** "decided to", "choosing", "will do"
2. **Principles:** "learned that", "rule:", "always/never"
3. **Projects:** version numbers, milestones, "completed"
4. **Entities:** Names (people, companies), relationships

**Format each fact:**
```markdown
---
date: YYYY-MM-DD
source: memory/${TODAY}.md
type: [decision|principle|project|entity]
tags: [relevant, keywords]
---

# [Fact Title]

[Fact content - 1-3 sentences]

## Context
[Why this matters]
```

### FIX: Store in Obsidian
**Use mcporter MCP tool (assumed available):**
- People facts → `/Users/zachgonser/Obsidian/VaultZap/life/areas/people/[Name].md`
- Project facts → `/Users/zachgonser/Obsidian/VaultZap/life/areas/projects/[Project].md`
- Principles → `/Users/zachgonser/Obsidian/VaultZap/life/principles/YYYY-MM-DD.md`

**If mcporter unavailable:**
- Fall back to direct file write
- Log warning that mcporter connection failed

### VERIFY: Confirm Storage
```bash
# Read back written files
ls -la /Users/zachgonser/Obsidian/VaultZap/life/areas/people/

# Update heartbeat-state.json
jq '.lastChecks.memory = now' memory/heartbeat-state.json > memory/heartbeat-state.json.tmp
mv memory/heartbeat-state.json.tmp memory/heartbeat-state.json
```

**Output:**
- Extracted N facts: "Stored to Obsidian: [list categories]"
- Nothing new: HEARTBEAT_OK
- Error: "FAILED: mcporter connection issue" or "FAILED: file write error"
```

---

### StantonTimes Engagement Monitor
**Current issues:** Subjective criteria, unclear state management

**Rewrite:**
```markdown
## StantonTimes Engagement Monitor

**Methodology:** FIND → VALIDATE → DRAFT → VERIFY

### FIND: Check Engagement
```bash
cd /Users/zachgonser/clawd/scripts
./bird-auth.sh user-tweets @TheStantonTimes -n 5 --json > /tmp/st-tweets.json
./bird-auth.sh search "@TheStantonTimes" -n 10 --json > /tmp/st-mentions.json
```

### VALIDATE: Check Response Needed
```bash
# Load already-handled interactions
cat ~/clawd/projects/stanton-times-agent/config/state.json | jq '.handled_interactions'

# For each mention/reply in results:
# - Check if tweet ID in handled_interactions
# - Check if from verified account (followers > 1000 OR verified badge)
# - Check engagement type
```

**Response criteria (MUST meet one):**
1. **Questions:** Contains "?", directed at @TheStantonTimes
2. **Corrections needed:** Factual error in original tweet, user provides evidence
3. **High engagement:** Tweet has 5+ likes AND adds constructive insight
4. **VIP accounts:** From official CIG accounts, major creators, gaming news

**Auto-skip if:**
- From accounts <100 followers (likely bots)
- Contains profanity or hostile language
- Duplicate question already answered
- Generic praise ("great work!") with no substance

### DRAFT: Create Response
**For questions:**
```
Format: "@user [Direct answer in 1-2 sentences] [Link to source if applicable]"
Tone: Professional, helpful, concise
```

**For corrections:**
```
Format: "@user Thanks for catching that! [Corrected information] [Updated source]"
Tone: Gracious, transparent
```

**For engagement:**
```
Format: "@user [Acknowledge insight] [Add value or context]"
Tone: Collegial, informative
```

**Add to pending:**
```bash
jq '.pendingApprovals += [{"type": "reply", "to": "tweet-id", "draft": "...", "reason": "..."}]' state.json
```

### VERIFY: Quality Check
Before adding to pending:
- Character count ≤ 280
- No typos (basic spell check)
- Matches StantonTimes voice (factual, professional)
- Adds value (not just "thanks")

**Output:**
- Drafted N replies: "Added to pendingApprovals: [topics]"
- No engagement needed: HEARTBEAT_OK
- Error: "FAILED: bird CLI auth issue" or "FAILED: state.json write error"

**Model note:** Using qwen3:32b for nuanced language judgment (appropriate).
```

---

### Morning Briefing
**Current issues:** Missing concrete commands, source ambiguity

**Rewrite:**
```markdown
## Morning Briefing

**Methodology:** FIND → VALIDATE → COMPOSE → DELIVER

### FIND: Gather Data Sources

#### 1. Calendar (next 24h)
```bash
# Using macOS calendar (assuming CalendarStore or icalBuddy installed)
icalBuddy --includeOnlyEventsFromNowOn --timeFormat "%I:%M %p" eventsToday+1

# OR if using Google Calendar CLI
gcalcli agenda --calendar "primary" --nostarted --nodeclined --tsv
```

#### 2. Weather
```bash
# Using wttr.in
curl -s 'wttr.in/Chicago?format=%l:+%C+%t+%w'
# Output: Chicago: Clear 32°F 5mph NW
```

#### 3. Yesterday's Work
```bash
YESTERDAY=$(date -v-1d +%Y-%m-%d)
cat memory/${YESTERDAY}.md | grep -E "^(##|###|\-)" | tail -20
```

#### 4. Cron Job Status
```bash
# Check for failures in last 24h
find /Users/zachgonser/.openclaw/logs -name "cron-*.log" -mtime -1 -exec grep -l "ERROR\|FAILED" {} \;
```

#### 5. Emails (if IMAP available)
```bash
# Check for unread emails with high priority
# Using mail CLI or email MCP tool if configured
# Filter: unread=true, importance=high, received_after=yesterday
```

### VALIDATE: Filter for Relevance

**Calendar events to include:**
- Meetings with >2 participants
- Events tagged "important" or "deadline"
- All-day events (likely significant)

**Exclude:**
- Recurring daily standup (unless different time/location)
- Lunch blocks, personal time
- "Focus time" blocks

**Email urgency:**
- P0: From boss, clients, contains "urgent" or "asap"
- P1: From team members, project-related
- Skip: Newsletters, automated notifications, marketing

**Work recap:**
- Major completions (PRs merged, issues closed, docs finished)
- Blockers mentioned (waiting on X, blocked by Y)

**Cron failures:**
- Only report if failure != expected maintenance

### COMPOSE: Generate Briefing

**Format:**
```
🌅 Good morning! Here's your day:

📅 **Calendar** (next 24h):
- 9:00 AM: Team standup
- 2:00 PM: Client demo

📧 **Urgent Email**:
- John (CEO): Q1 budget review needed by EOD

🛠️ **Yesterday's Progress**:
- Merged PR #42: Authentication refactor
- Closed issue #89: Fixed memory leak

⚠️ **Issues**:
- Bloom CI Watch: 3 consecutive failures (needs investigation)

☀️ **Weather**: Clear, 32°F, light winds

**Focus today:** Client demo prep + budget review
```

**Constraints:**
- Max 800 chars total (per isolation config)
- Prioritize: Issues > Urgent email > Calendar > Progress > Weather
- If nothing notable: Still deliver with "Clear day ahead" message

### VERIFY: Confirm Completeness
- All data sources checked successfully (or marked unavailable)
- Briefing formatted correctly (emoji, sections)
- No stale data (all timestamps within last 2h)
- Deliverable via Discord

**Output:**
Always deliver briefing (never HEARTBEAT_OK). Format must be ready for Discord delivery.

**Error handling:**
If critical source fails (calendar, emails), note in briefing:
"⚠️ Unable to check [source] - verify manually"

**Model:** qwen3:32b appropriate for multi-source synthesis and tone.
```

---

## Model Appropriateness Analysis

### Correctly Assigned:

1. **qwen3:8b tasks:**
   - Bloom PR Monitor ✅ (structured checks)
   - Bloom CI Watch ✅ (simple status monitoring)
   - Refresh Twitter Cookies ✅ (trivial execution)
   - StantonTimes Approval Check ✅ (state management)
   - StantonTimes P0/P1 Monitors ✅ (pattern matching)

2. **qwen3:32b tasks:**
   - Morning Briefing ✅ (multi-source synthesis)
   - Fact Extraction ✅ (semantic understanding)
   - StantonTimes Engagement ✅ (language nuance)
   - StantonTimes Creator Monitor ✅ (editorial judgment)

3. **No model specified (uses default):**
   - Extraction Shooter Intel → Should use **qwen3:32b** (research + synthesis)
   - Unity Tool Scout → Should use **qwen3:8b** (search + filter)
   - Weekly Bloom Digest → Should use **qwen3:8b** (structured reporting)
   - Weekly Memory Synthesis → Should use **qwen3:32b** (complex synthesis)
   - StantonTimes Web RSS → Should use **qwen3:8b** (search + filter)

### Recommendations:

**Upgrade to qwen3:32b:**
- Extraction Shooter Intel (requires editorial judgment)
- Weekly Memory Synthesis (pattern recognition across days)

**Keep as qwen3:8b (or set explicitly):**
- Unity Tool Scout (straightforward filtering)
- Weekly Bloom Digest (template filling)
- StantonTimes Web RSS (search + basic evaluation)

---

## Consistency Analysis

### Strong Patterns (Maintain):
✅ FIND → VALIDATE → FIX → VERIFY structure (used in 10/16 jobs)
✅ Bash code blocks with exact commands
✅ Explicit silent conditions
✅ Emoji prefixes in isolation.postToMainPrefix

### Weak Patterns (Standardize):
⚠️ State file paths (sometimes absolute, sometimes relative)
⚠️ HEARTBEAT_OK conditions (sometimes clear, sometimes vague)
⚠️ Error escalation (mentioned but method undefined)
⚠️ Autonomous vs approval language (contradictory)

### Anti-Patterns to Eliminate:
❌ "Draft for approval if complex" (what's complex?)
❌ "Escalate with details" (how? to where?)
❌ "Verify newsworthy" (by what standard?)
❌ Placeholder date patterns without concrete command

---

## Implementation Priority

### Phase 1: Critical (Do Now)
1. Rewrite StantonTimes Approval Check
2. Rewrite Fact Extraction
3. Standardize HEARTBEAT_OK conditions across all jobs

### Phase 2: Important (This Week)
4. Rewrite StantonTimes Engagement
5. Rewrite Morning Briefing
6. Add explicit error handling to all jobs

### Phase 3: Polish (Next Sprint)
7. Rewrite Weekly Memory Synthesis
8. Standardize state file paths
9. Add model specifications to unspecified jobs
10. Create prompt template for future jobs

---

## Prompt Template Recommendation

For future cron jobs, use this structure:

```markdown
## [Job Name]

**Methodology:** FIND → VALIDATE → [ACTION] → VERIFY

### FIND: [What to check]
```bash
[Exact commands with full paths]
```

### VALIDATE: [Decision criteria]
**Include if:**
- [Specific condition 1]
- [Specific condition 2]

**Exclude if:**
- [Specific condition 1]
- [Specific condition 2]

### [ACTION]: [What to do]
```bash
[Exact commands for action]
```

**Error handling:**
- If [error type]: [specific fallback]
- Retry: [N times with M second delays]
- Escalate if: [final failure condition]

### VERIFY: [How to confirm success]
```bash
[Validation commands]
```

**Output:**
- Success: "[Specific report format]"
- Nothing found: HEARTBEAT_OK
- Error: "FAILED: [error-type] - [context]"

**Model:** [ollama/qwen3:8b OR ollama/qwen3:32b] - [Reason]
```

---

## Summary Statistics

| Metric | Score |
|--------|-------|
| Average Clarity | 3.6/5 |
| Average Completeness | 3.8/5 |
| Average Consistency | 4.0/5 |
| Jobs using FIND→VALIDATE→FIX→VERIFY | 10/16 (63%) |
| Jobs with explicit commands | 12/16 (75%) |
| Jobs with clear HEARTBEAT_OK | 11/16 (69%) |
| Jobs with error handling | 8/16 (50%) |
| Jobs with model specified | 12/16 (75%) |

**Key Insight:** Strong methodology foundation, but execution details need tightening. Priority: standardize decision criteria and error handling.
