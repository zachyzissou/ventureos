# Privacy Framework

**Created:** 2026-01-31  
**Status:** Active  
**Review:** Quarterly or when adding new business units

---

## Core Principle

**You own your data. Echo is a tool, not a tenant.**

Echo can see what it needs to work effectively, but clear boundaries exist. When in doubt, default to private.

---

## Data Classification System

### P0 - Full Access (Automate Freely)

**What:**
- Public data (GitHub repos, Twitter public posts, Reddit comments)
- System logs, cron outputs, monitoring data
- Memory files created for Echo (`memory/*.md`, `MEMORY.md`)
- Calendar event titles and times (not attendees/notes)
- File metadata (names, sizes, dates - not contents)
- Weather, news, public research

**Why:** Already public or created specifically for Echo's use

**Echo can:**
- Read, process, analyze
- Make autonomous decisions
- Share in responses (when relevant)
- Store indefinitely

**Examples:**
- GitHub PR monitoring ✅
- StantonTimes tweet drafting ✅
- Memory synthesis ✅
- Calendar reminders ✅

---

### P1 - Read + Human Approval (Orchestration with Oversight)

**What:**
- Email subject lines, senders, timestamps
- Calendar event details (attendees, notes, locations)
- StantonTimes drafts before posting
- Discord messages in shared servers
- Draft communications (emails, tweets, posts)
- Financial transaction summaries (amounts, categories)
- Git commit messages and diffs

**Why:** Echo needs visibility to orchestrate, but human approves execution

**Echo can:**
- Read and analyze
- Draft responses/actions
- Surface urgency/importance
- Queue for approval

**Echo cannot:**
- Send emails without approval
- Post to social media without approval
- Share calendar details externally
- Make financial decisions

**Examples:**
- Email triage: "5 unread, 2 urgent" ✅ | Auto-reply ❌
- StantonTimes: Draft tweet ✅ | Auto-post ❌
- Calendar: "Meeting in 1h" ✅ | Share attendees ❌
- Financial: "Spent $200 on tools" ✅ | Initiate transfer ❌

---

### P2 - Metadata Only (Awareness without Content)

**What:**
- Email body contents
- Private DM contents (Discord, Slack, iMessage)
- Calendar meeting notes
- Financial account details (balances, account numbers)
- Health data specifics (weight, medical records)
- Private documents (contracts, legal, personal writing)

**Why:** Echo can be useful with "what" and "when" without seeing sensitive details

**Echo can:**
- Count and categorize
- Detect patterns
- Surface anomalies
- Provide context-free insights

**Echo cannot:**
- Read actual contents
- Quote from these sources
- Share details
- Make assumptions about contents

**Examples:**
- "You have 12 unread emails" ✅ | "Email from X says..." ❌
- "Bank account activity detected" ✅ | "Balance is $X" ❌
- "New health data logged" ✅ | "Weight is X lbs" ❌

---

### P3 - Completely Off-Limits (No Access Ever)

**What:**
- Passwords and API keys (except those Echo needs to function)
- Private encryption keys
- Medical records
- Legal documents (contracts, NDAs, lawsuits)
- Private romantic/family conversations
- Therapy notes
- Financial account credentials
- Social Security Number, passport numbers

**Why:** Some data should never touch AI systems, even locally

**Echo cannot:**
- Access these files/systems
- Request access
- Infer from absence
- Store even metadata

**Exception:** API keys Echo needs for its own operation (Anthropic, Discord, GitHub) are stored securely and never logged.

---

## Business Unit Boundaries

### StantonTimes (Media Operations)

**P0 Access:**
- Twitter public timeline
- Star Citizen news sources
- Draft tweets before approval

**P1 Access:**
- Twitter account analytics (views, engagement)
- Discord approval workflow messages

**P2 Access:**
- None required

**P3 Off-Limits:**
- Twitter account credentials (stored securely, not logged)
- Personal opinions about game/community

**Approval required:**
- Every tweet before posting (✅ reaction in Discord)
- Engagement replies (draft for approval)

---

### Bloom Development (Game Studio)

**P0 Access:**
- GitHub repo (code, issues, PRs)
- Unity project public assets
- Documentation

**P1 Access:**
- Git commit diffs (review changes)
- CI/CD logs (build failures)
- Task tracking (what's in progress)

**P2 Access:**
- None required (everything in repo is accessible)

**P3 Off-Limits:**
- Proprietary game design docs not in version control
- Unreleased marketing plans
- Financial projections

**Approval required:**
- PRs with significant changes (review before merge)
- Public announcements (blog posts, social media)

---

### Consulting (Future)

**P0 Access:**
- Public case studies
- Blog posts and content
- Client testimonials (with permission)

**P1 Access:**
- Client email subjects/names (triage)
- Meeting summaries (for follow-up)
- Draft proposals

**P2 Access:**
- Client private communications (metadata only)

**P3 Off-Limits:**
- Client confidential data
- NDA-covered information
- Client financials

**Approval required:**
- Every client communication (emails, messages)
- Proposals and contracts
- Invoice generation

---

### Talent Matching (Future)

**P0 Access:**
- Public job boards
- Company career pages
- Candidate public profiles (LinkedIn, GitHub)

**P1 Access:**
- Candidate resumes (for matching, not storage)
- Job application drafts

**P2 Access:**
- Candidate private information (salary expectations, contact info)

**P3 Off-Limits:**
- Candidate SSNs, references without consent
- Employer confidential hiring data
- Background check results

**Approval required:**
- Every application submission
- Every outreach to candidates/employers
- Sharing candidate information with employers

---

## Technical Safeguards

### Data at Rest
- P0 data: Stored in git repo, Obsidian vault (local)
- P1 data: Processed in memory, stored in approved locations only
- P2 data: Metadata only, no content persistence
- P3 data: Never accessed, never stored

### Data in Transit
- P0-P1: Can be sent to Anthropic API for processing (encrypted)
- P2: Metadata only sent to API
- P3: Never sent anywhere

### Logging
- P0: Full logging allowed
- P1: Actions logged, not contents (e.g., "Drafted email reply" not email text)
- P2: Metadata events only ("Email received" not contents)
- P3: No logging

---

## Approval Workflows

### When Echo Needs Approval

**Always require approval for:**
- Sending communications (emails, tweets, posts, messages)
- Financial transactions (even $1)
- Calendar modifications (adding/changing events)
- Sharing information about other people
- Actions that can't be easily undone

**Auto-approve allowed for:**
- Reading public data
- Internal analysis and processing
- Memory file updates
- Git auto-commits (on schedule)
- Monitoring and alerting

### How Approval Works

1. **Discord reactions:**
   - ✅ = Approved, execute
   - ❌ = Rejected, archive
   - 🤔 = Hold, discuss first

2. **Timeouts:**
   - Urgent items: 30 min → escalate if no response
   - Standard items: 4 hours → remind
   - Low priority: 24 hours → cancel if no response

3. **Audit trail:**
   - All approvals logged in `memory/approvals.jsonl`
   - Format: `{timestamp, action, approved/rejected, reason}`

---

## Red Flags (Stop and Ask)

Echo should escalate immediately if:

1. **Scope creep:** User asks for access beyond current classification
2. **Unclear boundaries:** New data type doesn't fit existing classes
3. **Third-party data:** Information about someone else (not you)
4. **Legal/compliance:** Anything that might violate laws/ToS
5. **Feels wrong:** When in doubt, ask

**Default:** If uncertain, treat as P3 (off-limits) and request clarification.

---

## Quarterly Review

Every 3 months (or when adding new business unit):

1. **Audit access:** What data is Echo actually using?
2. **Review boundaries:** Still accurate and comfortable?
3. **Check violations:** Any times Echo accessed P2/P3 data?
4. **Update framework:** New business units or data types?

**Next review:** April 30, 2026

---

## Privacy Policy (External-Facing)

### For Platform Users (When Clawdbot Launches)

**We will never:**
- Store your data on our servers (self-hosted or local only)
- Send data to third parties (except Anthropic API, encrypted)
- Train models on your data
- Share data between users
- Sell your data (ever)

**You control:**
- What Echo can see (classification system)
- What Echo can do (approval workflows)
- Where data is stored (your infrastructure)
- When to delete everything (export + delete available)

**We're transparent:**
- Open source core (inspect all code)
- Audit logs (see every action Echo took)
- Data classification (you define boundaries)
- API usage (see exactly what was sent to Anthropic)

---

## Version History

**v1.0 (2026-01-31):** Initial framework
- 4-tier classification (P0-P3)
- Business unit boundaries (StantonTimes, Bloom, future units)
- Approval workflows
- Technical safeguards

---

*This is a living document. Update as you learn what works.*
