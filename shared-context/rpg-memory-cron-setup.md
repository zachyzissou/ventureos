# VentureOS RPG: Memory Sync Cron Integration

**Phase 2 Track 3: Observational Memory Integration**  
**Date:** 2026-02-14  
**Status:** Ready for Deployment

---

> **Update (Track 5):** Protocol activation is now handled by `~/clawd/scripts/check-protocol-triggers.sh`.
> If you only want one daily job, prefer the Track 5 cron setup doc: `~/clawd/shared-context/rpg-protocol-cron-setup.md`.
>
> **If running both Track 3 + Track 5:** schedule Track 5 at **06:25** (not 06:20) to avoid concurrent writes to `personality_activations` / SQLite lock contention.

## Cron Job Configuration

### New Job: Daily Memory → RPG Sync

**Schedule:** 6:20 AM daily (America/Chicago)  
**Agent:** Atlas (infrastructure responsibility)  
**Target:** Isolated  
**Command:** `/Users/zachgonser/clawd/scripts/sync-memory-to-rpg.sh`

### Timing Rationale

```
06:00 AM → Daily Psionic Stats Calculation (ec114bdd-8e87-4ed8-a270-4844bc325f35)
           ↓ (populates psionic_stats table)

06:15 AM → Daily Khala Drift Update (cd057528-9ec1-4b2d-9eb8-bee42f0edf1a)
           ↓ (processes interactions, updates khala_network)

06:20 AM → Daily Memory → RPG Sync (NEW)
           ↓ (reads observations; may update `personality_activations`)

06:25 AM → Daily Protocol Trigger Check (Track 5)
           ↓ (re-evaluates triggers; updates `personality_activations`)

Result: All RPG tables updated in sequence (serialized DB writes)
```

**Why separate job?**
- Independent failure isolation
- Easier to debug/monitor
- Can adjust schedule independently
- Clean separation of concerns

---

## Deployment Instructions

### Option 1: Via OpenClaw Dashboard (Recommended)

1. Open dashboard:
   ```bash
   openclaw dashboard
   ```

2. Navigate to **Cron/Scheduled Tasks**

3. Click **Create New Job**

4. Configure:
   - **Name:** `Daily Memory → RPG Sync`
   - **Agent:** `atlas`
   - **Target:** `isolated`
   - **Schedule:** `cron 20 6 * * * @ America/Chicago`
   - **Command/Prompt:** `/Users/zachgonser/clawd/scripts/sync-memory-to-rpg.sh`
   - **Timeout:** `300` seconds (5 minutes)

5. Save and verify job appears in cron list

### Option 2: Via CLI

```bash
# Create cron job via OpenClaw CLI
openclaw cron create \
  --name "Daily Memory → RPG Sync" \
  --agent atlas \
  --target isolated \
  --schedule "cron 20 6 * * * @ America/Chicago" \
  --command "/Users/zachgonser/clawd/scripts/sync-memory-to-rpg.sh" \
  --timeout 300

# Verify creation
openclaw cron list | grep "Memory.*RPG"
```

### Option 3: Manual Cron Entry (Fallback)

If OpenClaw CLI doesn't support direct cron creation, add to system crontab:

```bash
# Edit crontab
crontab -e

# Add line:
20 6 * * * /Users/zachgonser/clawd/scripts/sync-memory-to-rpg.sh >> /Users/zachgonser/clawd/runtime/logs/memory-rpg-sync-$(date +\%Y-\%m-\%d).log 2>&1
```

---

## Monitoring & Health Checks

### Daily Verification

```bash
# Check if sync ran today
ls -lh ~/clawd/runtime/logs/memory-rpg-sync-$(date +%Y-%m-%d).log

# View recent activations
tail -20 ~/clawd/runtime/logs/memory-rpg-sync-$(date +%Y-%m-%d).log

# Check database state
sqlite3 ~/clawd/agents/ventureos-rpg.db "
SELECT 
    COUNT(*) as active_protocols,
    COUNT(DISTINCT agent_id) as agents_with_protocols
FROM personality_activations 
WHERE deactivated_at IS NULL;"
```

### Weekly Analysis

```bash
# Protocol activation timeline (last 7 days)
sqlite3 ~/clawd/agents/ventureos-rpg.db "
SELECT 
    DATE(activated_at) as date,
    agent_id,
    protocol_id
FROM personality_activations
WHERE activated_at >= date('now', '-7 days')
ORDER BY activated_at DESC;"

# Activation velocity
grep "Activating:" ~/clawd/runtime/logs/memory-rpg-sync-2026-02-*.log | wc -l
```

### Alerting (Optional)

```bash
# Add to morning briefing check
if [ ! -f ~/clawd/runtime/logs/memory-rpg-sync-$(date +%Y-%m-%d).log ]; then
    echo "⚠️ Memory → RPG sync did not run today"
fi

# Check for errors
if grep -q "ERROR" ~/clawd/runtime/logs/memory-rpg-sync-$(date +%Y-%m-%d).log; then
    echo "❌ Memory → RPG sync had errors"
fi
```

---

## Expected Behavior

### First Week
- **Activations:** 0-1 (protocols need 3-8 observations per agent)
- **Log size:** ~2 KB per day
- **Execution time:** <1 second

### First Month
- **Activations:** 2-5 (as observation counts reach thresholds)
- **Log size:** ~2 KB per day
- **Execution time:** <2 seconds

### Steady State (3+ months)
- **Activations:** 10-15 (most agents have multiple active protocols)
- **Deactivations:** Occasional (if patterns drop off)
- **Log size:** ~3 KB per day
- **Execution time:** <3 seconds

---

## Troubleshooting

### Sync Doesn't Run

```bash
# Check cron job status
openclaw cron status <job_id>

# Check cron logs
openclaw cron logs <job_id> --limit 100

# Verify script is executable
ls -lh ~/clawd/scripts/sync-memory-to-rpg.sh
# Should show: -rwxr-xr-x (executable)

# Test manual run
~/clawd/scripts/sync-memory-to-rpg.sh
```

### No Protocols Activating (Expected for First Weeks)

```bash
# Check observation counts
~/clawd/scripts/sync-memory-to-rpg.sh | grep "observations:"

# Verify observations directory
ls -lh ~/.openclaw/workspace-archivist/observations/*.md

# Check threshold progress
# (See "Protocol Threshold Status" in rpg-memory-test-report.md)
```

### Database Locked Errors

```bash
# Check for long-running processes
ps aux | grep sqlite3

# Verify no other RPG scripts running simultaneously
ps aux | grep "psionic-stats\|khala-drift\|memory-rpg"

# If persistent, adjust cron timing to avoid overlap
```

---

## Rollback Procedure

If sync causes issues:

### 1. Disable Cron Job
```bash
openclaw cron disable <job_id>
```

### 2. Clear Activations (if needed)
```bash
sqlite3 ~/clawd/agents/ventureos-rpg.db "
DELETE FROM personality_activations 
WHERE activated_at >= date('now', '-1 day');"
```

### 3. Restore from Backup (if needed)
```bash
# Database is backed up daily by "Nightly Backup" cron
# Restore from: ~/clawd/backups/ventureos-rpg.db.*
```

---

## Success Criteria

- ✅ Cron job runs daily at 6:20 AM
- ✅ Log file created each day
- ✅ No errors in execution
- ✅ Protocols activate when thresholds met
- ✅ Database updates correctly
- ✅ Idempotent (safe to re-run)

---

## Integration Checklist

- [x] Sync script created (`sync-memory-to-rpg.sh`)
- [x] Script tested (3/3 test activations successful)
- [x] Script made executable (`chmod +x`)
- [x] Production run validated (0 activations, correct)
- [x] Test report documented (`rpg-memory-test-report.md`)
- [x] Cron configuration documented (this file)
- [ ] Cron job created in OpenClaw
- [ ] First automated run verified (morning of 2026-02-15)
- [ ] Monitoring added to morning briefing
- [ ] GitLab commit created

---

## Files & References

**Scripts:**
- `~/clawd/scripts/sync-memory-to-rpg.sh` — Daily sync script
- `~/clawd/scripts/test-memory-rpg-sync.sh` — Test suite

**Documentation:**
- `~/clawd/shared-context/rpg-memory-audit.md` — Observational memory audit
- `~/clawd/shared-context/rpg-memory-integration.md` — Protocol mapping design
- `~/clawd/shared-context/rpg-memory-test-report.md` — Test results
- `~/clawd/shared-context/rpg-memory-cron-setup.md` — This file

**Database:**
- `~/clawd/agents/ventureos-rpg.db` → `personality_activations` table

**Logs:**
- `~/clawd/runtime/logs/memory-rpg-sync-YYYY-MM-DD.log`

---

**Status:** Ready for Deployment  
**Next Action:** Create cron job via OpenClaw dashboard  
**Owner:** Atlas (cron job management)  
**Phase:** 2 Track 3 Complete (pending cron creation)
