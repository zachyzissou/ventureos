# VentureOS RPG: Protocol Trigger Cron Integration

**Phase 2 Track 5: Personality Protocols**  
**Date:** 2026-02-14  
**Status:** Ready for deployment

---

## New cron job: Daily Protocol Trigger Check

**Schedule:** 6:25 AM daily (America/Chicago)  
**Agent:** Atlas (ops ownership)  
**Target:** isolated  
**Cron Job ID:** `c325a977-9c45-4dca-930d-c27a1e1ae658`  
**Command:** `/Users/zachgonser/clawd/scripts/check-protocol-triggers.sh`  
**Timeout:** 180 seconds

### What it does
- Evaluates **15 canonical protocols** (4 base + 11 agent-specific)
- Reads evidence from:
  - RPG DB tables (`psionic_stats`, `psionic_ranks`, `missions`, `escalations`)
  - Optional observational memory tags (if present): `~/.openclaw/workspace-archivist/observations/*.md`
- Updates: `personality_activations`
- Writes log: `~/clawd/runtime/logs/protocol-triggers-YYYY-MM-DD.log`

---

## Timing rationale

Recommended daily RPG sequence:

```
06:00 AM → Daily Psionic Stats Calculation (ec114bdd-8e87-4ed8-a270-4844bc325f35)
06:15 AM → Daily Khala Drift Update (existing)
06:20 AM → Daily Memory → RPG Sync (Track 3)
06:25 AM → Daily Protocol Trigger Check (Track 5)
```

This keeps protocol evolution downstream of fresh stats and drift.

---

## Deployment instructions

### Via OpenClaw Dashboard
1. Open dashboard: `openclaw dashboard`
2. Cron/Scheduled Tasks → Create
3. Configure:
   - **Name:** `Daily Protocol Trigger Check (VentureOS RPG)`
   - **Agent:** `atlas`
   - **Target:** `isolated`
   - **Schedule:** `cron 25 6 * * * @ America/Chicago`
   - **Command:** `/Users/zachgonser/clawd/scripts/check-protocol-triggers.sh`
   - **Timeout:** `180`

### Via CLI
```bash
openclaw cron create \
  --name "Daily Protocol Trigger Check (VentureOS RPG)" \
  --agent atlas \
  --target isolated \
  --schedule "cron 25 6 * * * @ America/Chicago" \
  --command "/Users/zachgonser/clawd/scripts/check-protocol-triggers.sh" \
  --timeout 180
```

---

## Verification

```bash
# Check log exists after run
ls -lh ~/clawd/runtime/logs/protocol-triggers-$(date +%Y-%m-%d).log

# Check active protocols
sqlite3 ~/clawd/agents/ventureos-rpg.db "
  SELECT agent_id, protocol_id, protocol_type, activated_at
  FROM personality_activations
  WHERE deactivated_at IS NULL
  ORDER BY agent_id, protocol_id;"
```

---

## Notes / ordering with Track 3 memory sync

Track 3 created `scripts/sync-memory-to-rpg.sh` and the cron job **Daily Memory → RPG Sync**.

**Recommendation:** keep both jobs, but run them **sequentially** to avoid SQLite lock contention:
- **06:20** → Memory → RPG Sync (writes `personality_activations`)
- **06:25** → Protocol Trigger Check (writes `personality_activations`)

Rationale: protocol triggers can safely lag memory ingestion by a few minutes, and this keeps the DB writes serialized.
