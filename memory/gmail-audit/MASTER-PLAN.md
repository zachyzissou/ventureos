# Gmail Audit Master Plan

**Account:** zachgonser@gmail.com
**Started:** 2026-01-28 01:25 CST
**Status:** 🔄 In Progress

## Objectives
1. Complete understanding of email ecosystem
2. No deletions - organization only
3. Respect Gmail API rate limits (250 quota/sec, 5 units per search)
4. World-class label taxonomy design
5. Filter architecture for ongoing maintenance

## Phase 1: Data Collection (Sub-Agents)

### Agent 1: Sender Analysis
- Extract unique senders from last 6 months
- Count frequency per sender
- Categorize: transactional, promotional, personal, newsletters, security
- Output: `sender-analysis.json`

### Agent 2: Label Audit
- Document all 89 labels with usage counts
- Map duplicate hierarchies
- Identify orphan labels
- Output: `label-audit.json`

### Agent 3: Content Categorization
- Sample emails by type
- Identify patterns for filter rules
- Map sender→category relationships
- Output: `content-categories.json`

### Agent 4: Filter Analysis
- Document 9 existing filters
- Identify gaps
- Design comprehensive filter set
- Output: `filter-recommendations.json`

## Phase 2: Taxonomy Design
- Consolidate duplicate label trees
- Design optimal hierarchy
- Plan migration strategy

## Phase 3: Filter Architecture
- Write filter rules (no execution yet)
- Test logic against sample data
- Document expected outcomes

## Phase 4: Execution Plan
- Prioritized action list
- Rollback procedures
- Rate-limited execution batches

## Current Label Structure (89 labels)

### System Labels (15)
- INBOX, SENT, DRAFT, TRASH, SPAM, CHAT
- STARRED, IMPORTANT, UNREAD
- CATEGORY_PERSONAL, CATEGORY_SOCIAL, CATEGORY_PROMOTIONS, CATEGORY_UPDATES, CATEGORY_FORUMS
- YELLOW_STAR

### User Labels - Emoji Hierarchy (Preferred)
- 📰 Newsletters (Tech-AI, Finance, Culture, Gaming)
- 🛒 Shopping (Orders, Deals, Cannabis)
- 🎮 Gaming (Star Citizen, Steam-Deals, Patreon)
- 💼 Work (Backstage, Job Alerts)
- 🔐 Security (Logins, Verification)
- 💰 Financial (Receipts, Subscriptions)
- 📦 eBay (Orders, Messages, Watching)

### User Labels - Non-Emoji Duplicates (TO MIGRATE)
- Newsletters (Tech-AI, Finance, Culture, Gaming)
- Shopping (Orders, Deals, Cannabis)
- Gaming (Star Citizen, Steam-Deals, Patreon)
- Security (Logins, Verification)
- Financial (Receipts, Subscriptions, Paypal Receipts, Music, Possible Notifications)
- eBay (Orders, Messages, Watching)
- Work (Backstage, Job Alerts)
- Security Alerts (/Google)

### User Labels - Legacy/Standalone
- [Mailbox] (To Buy, To Read, To Watch, Later)
- Notes
- Personal
- Receipts
- Travel
- Work
- Orders/Shipping
- Patreon
- Invitehawk
- Indexer Receipts
- Aloe City World
- BoostHill Recepts
- Bandcamp
- zachgonser@me.com

### Existing Filters (9)
1. Possible Finance → Financial/Possible Notifications, skip inbox
2. Google Accounts → Security Alerts/Google, skip inbox
3. invitez.net → remove from spam
4. FTX → skip inbox and spam (defunct)
5. InviteHawk logins → Invitehawk label
6. PayPal receipts → Financial/Paypal Receipts
7. Patreon → Patreon label
8. Kick.com → (no action defined)
9. Bandcamp → Bandcamp label

## Rate Limit Strategy
- Max 50 searches per minute (250 units ÷ 5 units/search)
- 2-second delay between searches
- Batch operations in groups of 20
- Monitor for 429 errors

## Files
- `MASTER-PLAN.md` - This file
- `sender-analysis.json` - Sender frequency data
- `label-audit.json` - Label usage data
- `content-categories.json` - Email categorization
- `filter-recommendations.json` - Proposed filters
- `taxonomy-design.md` - Final label structure
- `execution-plan.md` - Step-by-step implementation
