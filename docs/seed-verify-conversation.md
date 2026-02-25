# Conversation Pipeline Seed & Verification

> **Issue #183** — Operational runbook for seeding and verifying the end-to-end conversation ingest path in non-test mode.

## Overview

VentureOS includes a scripted verification procedure to bootstrap real conversations through the production pipeline and confirm they appear in both the API and dashboard. This tooling provides **operational confidence** that the full lifecycle works: create → message → persist → list → display.

## Quick Start

### Shell Script (requires running dashboard)

```bash
# Run the full 7-step verification
./scripts/verify-conversation-pipeline.sh

# Dry run — shows what would happen
./scripts/verify-conversation-pipeline.sh --dry-run

# Clean up verification data
./scripts/verify-conversation-pipeline.sh --cleanup
```

### TypeScript Tool (no dashboard needed)

```bash
# Seed + verify directly via ConversationEngine + SQLite
npx ts-node scripts/seed-conversation.ts

# JSON output (for CI/automation)
npx ts-node scripts/seed-conversation.ts --json

# Dry run
npx ts-node scripts/seed-conversation.ts --dry-run

# Cleanup
npx ts-node scripts/seed-conversation.ts --cleanup
```

## Verification Steps

| Step | What It Checks | Expected Output |
|------|---------------|-----------------|
| 1. Health check | Dashboard responds to `/api/conversation/conversations` | HTTP 200 |
| 2. Infrastructure | RPG database exists, required tables present | 5/5 tables |
| 3. Create conversation | Idempotent creation with 3 participants | `conversationId` returned |
| 4. Send messages | 2 messages: echo→nexus, nexus→oracle | `status: "delivered"` |
| 5. SQLite persistence | Rows in conversations, messages, participants, turn_state | All present |
| 6. API responses | List + active endpoint include the conversation | Non-empty results |
| 7. Interaction logging | `interaction_logs` table has new entries | Count increases |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DASHBOARD_URL` | `http://localhost:3000` | Dashboard base URL (shell script) |
| `VENTUREOS_RPG_DB` | `~/clawd/agents/ventureos-rpg.db` | RPG SQLite database path |
| `CONVERSATION_PERSIST_DIR` | `~/clawd/ventureos/runtime/conversations` | Filesystem persist directory |

## Guardrails

### Non-Test Mode Isolation

These tools operate on **real** data paths (the RPG SQLite database and `runtime/conversations/` directory). To avoid accidental pollution:

1. **Metadata tagging** — All verification conversations include:
   - `metadata.purpose: "pipeline-verification"`
   - `metadata.created_by: "verify-script"`
   - `metadata.title: "Pipeline Verification Conversation"`

2. **Idempotent re-runs** — The script checks for existing verification conversations before creating new ones. Running it 10 times creates exactly 1 conversation.

3. **Explicit cleanup** — Use `--cleanup` to remove all verification data. Cleanup targets only rows tagged with `pipeline-verification` or `verify-script` in their metadata.

4. **No automatic cleanup** — Verification data is intentionally left in place to prove the pipeline works. You must explicitly clean up.

5. **Dry-run mode** — Use `--dry-run` to see what would happen without modifying anything.

### What Gets Created

| Resource | Location | Tagged By |
|----------|----------|-----------|
| Conversation row | `conversations` table | `metadata.purpose = "pipeline-verification"` |
| Messages (2) | `conversation_messages` table | Foreign key to conversation |
| Participants (3) | `conversation_participants` table | Foreign key to conversation |
| Turn state | `conversation_turn_state` table | Foreign key to conversation |
| Interaction logs | `interaction_logs` table | `session_id = conversationId` |
| Filesystem file | `runtime/conversations/<id>.json` | Part of FileConversationStore |

## Acceptance Checklist

- [ ] `scripts/verify-conversation-pipeline.sh` exists and is executable
- [ ] Script completes with all ✓ marks against a healthy dashboard
- [ ] Created conversation is visible in dashboard UI
- [ ] Script is idempotent — running twice creates no duplicates
- [ ] Verification conversations are clearly tagged with metadata
- [ ] Script fails gracefully with clear error messages when prerequisites are not met
- [ ] Script works without test-only environment variables
- [ ] `--cleanup` removes all verification data and only verification data
- [ ] `--dry-run` shows plan without modifying anything
- [ ] TypeScript seed tool works without running dashboard
- [ ] Tests pass: `npx jest scripts/tests/seed-conversation.test.ts`

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  verify-*.sh    │────▶│  Dashboard HTTP   │────▶│ conversation-   │
│  (shell script) │     │  /api/convo/...   │     │ http.ts         │
└─────────────────┘     └──────────────────┘     └────────┬────────┘
                                                          │
┌─────────────────┐                              ┌────────▼────────┐
│  seed-convo.ts  │─────────────────────────────▶│ ConversationAPI │
│  (TS direct)    │                              └────────┬────────┘
└─────────────────┘                                       │
                                                 ┌────────▼────────┐
                                                 │ ConversationEng │
                                                 └────────┬────────┘
                                                          │
                                              ┌───────────┼───────────┐
                                              │           │           │
                                    ┌─────────▼──┐ ┌──────▼─────┐ ┌──▼──────────┐
                                    │ SQLite     │ │ File       │ │ Interaction │
                                    │ ConvStore  │ │ ConvStore  │ │ Logger      │
                                    └──────┬─────┘ └──────┬─────┘ └──────┬──────┘
                                           │              │              │
                                    ┌──────▼──────────────▼──────────────▼──────┐
                                    │              ventureos-rpg.db              │
                                    │  conversations | conversation_messages    │
                                    │  conversation_participants               │
                                    │  conversation_turn_state                 │
                                    │  interaction_logs                        │
                                    └──────────────────────────────────────────┘
```

## Troubleshooting

### Dashboard not responding
```
Start the dashboard: cd ventureos && npm run dashboard:start
Or use the TypeScript tool directly: npx ts-node scripts/seed-conversation.ts
```

### Auth required (HTTP 401/403)
The shell script falls back to direct SQLite verification when auth is enabled. Use the TypeScript seed tool for full verification without auth.

### Table not found
Tables are auto-created by `SqliteConversationStore` on first use. If you see missing table errors, run the TypeScript seed tool first to bootstrap the schema.

### Duplicate conversations
This shouldn't happen (idempotency check), but if it does: `./scripts/verify-conversation-pipeline.sh --cleanup` removes all verification conversations.
