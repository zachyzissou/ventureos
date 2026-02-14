# Khala Drift Tracking Integration Guide

**Phase 2 Track 2 Deliverable**  
**Date:** 2026-02-14  
**Status:** Complete - Awaiting Cron Integration

## ✅ Completed Components

### 1. Drift Policy Document
**Location:** `~/clawd/shared-context/rpg-drift-policy.md`

Comprehensive deterministic rules for how agent interactions affect Khala Network affinities:
- Collaboration: ±0.03 per interaction
- Escalation: +0.04 (valid) / -0.05 (false positive)
- Handoff: ±0.03 based on smoothness
- Conflict: +0.05 (resolved) / -0.04 (escalated)
- Affinity bounds: [0.10, 0.95]
- History retention: Last 20 records per bond pair

### 2. Interaction Logging Script
**Location:** `~/clawd/scripts/log-interaction.sh`  
**Status:** ✅ Executable, tested

Records agent-to-agent interactions to `interaction_logs` table.

**Usage:**
```bash
~/clawd/scripts/log-interaction.sh <agent_a> <agent_b> <type> <outcome> [metadata_json]

# Examples:
~/clawd/scripts/log-interaction.sh oracle archivist collaboration success '{"mission_id":"abc-123"}'
~/clawd/scripts/log-interaction.sh sentinel verifier escalation success
~/clawd/scripts/log-interaction.sh echo atlas handoff failure
```

**Valid Types:** `collaboration`, `escalation`, `handoff`, `conflict`  
**Valid Outcomes:** `success`, `failure`, `neutral`

**Automatic Updates:**
- Inserts record into `interaction_logs`
- Updates `khala_network.last_interaction_at`
- Increments `khala_network.interaction_count`

### 3. Drift Update Script
**Location:** `~/clawd/scripts/update-khala-drift.sh`  
**Status:** ✅ Executable, tested, idempotent

Processes recent interactions and updates affinity values.

**Features:**
- Configurable lookback window (default: 24 hours)
- Idempotent (tracks last processed timestamp)
- Boundary enforcement ([0.10, 0.95])
- Automatic history pruning (keeps last 20 per pair)
- Detailed logging to `~/clawd/runtime/logs/khala-drift-YYYY-MM-DD.log`

**Configuration (environment variables):**
```bash
DRIFT_BASE=0.03                      # Base drift magnitude
AFFINITY_MIN=0.10                    # Minimum affinity
AFFINITY_MAX=0.95                    # Maximum affinity
DRIFT_HISTORY_RETENTION=20           # History records per pair
LOOKBACK_HOURS=24                    # Processing window

# Override specific drift magnitudes:
DRIFT_COLLABORATION_SUCCESS=0.03
DRIFT_ESCALATION_VALID=0.04
# ... etc (see rpg-drift-policy.md)
```

**Manual Execution:**
```bash
~/clawd/scripts/update-khala-drift.sh
```

### 4. Test Suite
**Location:** `~/clawd/scripts/test-drift-scenarios.sh`  
**Status:** ✅ Passed all validation checks

**Test Results (2026-02-14 03:57:45):**
```
✅ All Validation Checks Passed!

Summary:
- Test interactions logged: 9
- Drift records created: 9
- Affinities updated and bounded correctly
- History retention policy working

Test Scenarios Verified:
✓ Oracle ↔ Archivist: +0.09 from successful collaborations (0.80 → 0.89)
✓ Sentinel ↔ Verifier: Mixed outcomes (0.85 → 0.83 net after +0.04, -0.05, -0.01)
✓ Atlas ↔ Nexus: +0.05 from conflict resolution (0.70 → 0.75)
✓ Echo ↔ Oracle: +0.03 from smooth handoff (0.80 → 0.83)
✓ Atlas ↔ Oracle: -0.03 from fumbled handoff (0.70 → 0.67)
```

**Sample Drift Events Generated:**
| Bond | Old → New | Delta | Reason |
|------|-----------|-------|--------|
| archivist ↔ oracle | 0.80 → 0.83 | +0.03 | Successful collaboration |
| archivist ↔ oracle | 0.83 → 0.86 | +0.03 | Successful collaboration |
| archivist ↔ oracle | 0.86 → 0.89 | +0.03 | Successful collaboration |
| sentinel ↔ verifier | 0.85 → 0.89 | +0.04 | Validated escalation (good catch) |
| sentinel ↔ verifier | 0.89 → 0.84 | -0.05 | False positive escalation |
| sentinel ↔ verifier | 0.84 → 0.83 | -0.01 | Unresolved conflict (stalemate) |
| atlas ↔ nexus | 0.70 → 0.75 | +0.05 | Conflict resolved constructively |

## 🔄 Cron Integration (Required)

### Option 1: Separate Daily Job (Recommended)

**Create new cron job via OpenClaw Dashboard:**

1. Open dashboard: `openclaw dashboard`
2. Navigate to Cron/Scheduled Tasks
3. Click "Create New Job"
4. Configure:
   - **Name:** `Daily Khala Drift Update`
   - **Agent:** `atlas`
   - **Target:** `isolated`
   - **Schedule:** `cron 15 6 * * * @ America/Chicago` (6:15 AM daily)
   - **Command/Prompt:** `/Users/zachgonser/clawd/scripts/update-khala-drift.sh`
   - **Timeout:** `300` seconds

**Reasoning:**
- Runs 15 minutes after psionic stats calculation (6:00 AM)
- Captures any mission completions from stats run
- Keeps concerns separated
- Allows independent schedule adjustments

### Option 2: Chain with Psionic Stats Job

**Modify existing job:** `ec114bdd-8e87-4ed8-a270-4844bc325f35`

Add to end of `calculate-psionic-stats.sh`:
```bash
# Update Khala drift after stats calculation
log "Running Khala drift update..."
"$HOME/clawd/scripts/update-khala-drift.sh" || log "WARNING: Drift update failed"
```

**Pros:** Single job, guaranteed execution order  
**Cons:** Couples two independent systems

## 📊 Database State Verification

**Check drift history:**
```bash
sqlite3 ~/clawd/agents/ventureos-rpg.db "
SELECT 
    agent_a || ' ↔ ' || agent_b AS bond,
    printf('%.2f → %.2f', old_affinity, new_affinity) AS change,
    printf('(Δ%.2f)', delta) AS delta,
    reason,
    datetime(created_at, 'localtime') as when
FROM khala_drift_history
ORDER BY created_at DESC
LIMIT 20;
"
```

**Check current affinities:**
```bash
sqlite3 ~/clawd/agents/ventureos-rpg.db "
SELECT 
    agent_a || ' ↔ ' || agent_b AS bond,
    printf('%.2f', affinity) AS affinity,
    interaction_count,
    datetime(last_interaction_at, 'localtime') AS last_interaction
FROM khala_network
ORDER BY updated_at DESC
LIMIT 10;
"
```

**View unprocessed interactions:**
```bash
sqlite3 ~/clawd/agents/ventureos-rpg.db "
SELECT 
    initiator_agent || ' → ' || recipient_agent AS interaction,
    interaction_type,
    outcome,
    datetime(created_at, 'localtime') AS when
FROM interaction_logs
WHERE created_at > datetime('now', '-24 hours')
ORDER BY created_at DESC;
"
```

## 🔗 Integration Points

### When to Log Interactions

**1. Agent Spawn Wrappers**
```bash
# In spawn scripts, log handoffs:
~/clawd/scripts/log-interaction.sh "$PARENT_AGENT" "$SPAWNED_AGENT" handoff success '{"session_id":"'$SESSION_ID'"}'
```

**2. Mission Completion Hooks**
```bash
# After mission completes:
if [ "$MISSION_SUCCESS" = "true" ]; then
    ~/clawd/scripts/log-interaction.sh "$AGENT_A" "$AGENT_B" collaboration success '{"mission_id":"'$MISSION_ID'"}'
else
    ~/clawd/scripts/log-interaction.sh "$AGENT_A" "$AGENT_B" collaboration failure '{"mission_id":"'$MISSION_ID'"}'
fi
```

**3. Escalation Validation**
```bash
# When Verifier validates Sentinel escalation:
if [ "$VALIDATED_AS_REAL" = "true" ]; then
    ~/clawd/scripts/log-interaction.sh sentinel verifier escalation success '{"issue":"'$ISSUE_DESC'"}'
else
    ~/clawd/scripts/log-interaction.sh sentinel verifier escalation failure '{"issue":"'$ISSUE_DESC'"}'
fi
```

**4. Conflict Resolution**
```bash
# After agents resolve disagreement:
~/clawd/scripts/log-interaction.sh "$AGENT_A" "$AGENT_B" conflict success '{"resolution":"'$RESOLUTION_SUMMARY'"}'
```

## 📈 Monitoring & Maintenance

### Daily Health Check
```bash
# Run as part of morning briefing:
DRIFT_COUNT=$(sqlite3 ~/clawd/agents/ventureos-rpg.db "SELECT COUNT(*) FROM khala_drift_history WHERE date(created_at) = date('now');")
echo "Drift events today: $DRIFT_COUNT"

# Check for stuck processing:
LAST_RUN=$(cat ~/clawd/runtime/tmp/khala-drift-last-processed.txt 2>/dev/null || echo "never")
echo "Last drift update: $LAST_RUN"
```

### Weekly Analysis
```bash
# Bond velocity report (which relationships changing fastest):
sqlite3 ~/clawd/agents/ventureos-rpg.db "
SELECT 
    agent_a || ' ↔ ' || agent_b AS bond,
    COUNT(*) as drift_events,
    SUM(delta) as net_change,
    printf('%.2f', AVG(ABS(delta))) as avg_magnitude
FROM khala_drift_history
WHERE created_at > datetime('now', '-7 days')
GROUP BY agent_a, agent_b
ORDER BY drift_events DESC
LIMIT 10;
"
```

### Drift Debugging
```bash
# If drift seems stuck, check state file:
cat ~/clawd/runtime/tmp/khala-drift-last-processed.txt

# Force reprocess last 48 hours:
LOOKBACK_HOURS=48 ~/clawd/scripts/update-khala-drift.sh

# Reset state (will reprocess all historical data):
rm ~/clawd/runtime/tmp/khala-drift-last-processed.txt
~/clawd/scripts/update-khala-drift.sh
```

## 🎯 Success Criteria Status

- ✅ **`khala_drift_history` populated:** 9 test records, schema validated
- ✅ **Affinity values change correctly:** All test scenarios passed
- ✅ **Bounded correctly:** No values outside [0.10, 0.95]
- ✅ **Scripts executable:** All `chmod +x` applied, tested
- ✅ **Documentation complete:** Policy, integration, monitoring guides
- ✅ **VOXYZ pattern parity:** Last 20 records retained per pair
- ⏳ **Cron integration:** Awaiting manual job creation (dashboard)

## 🚀 Next Steps

1. **[IMMEDIATE]** Create cron job via dashboard (Option 1 recommended)
2. **[WEEK 1]** Add interaction logging to spawn wrappers
3. **[WEEK 2]** Integrate with mission completion handlers
4. **[WEEK 3]** Add escalation validation hooks
5. **[MONTH 1]** Monitor drift patterns, tune magnitudes if needed
6. **[QUARTER 1]** Consider decay mechanism for unused bonds

## 📝 Files Delivered

```
~/clawd/shared-context/
├── rpg-drift-policy.md           # Drift calculation rules
└── rpg-drift-integration.md      # This file

~/clawd/scripts/
├── log-interaction.sh            # Interaction logging helper
├── update-khala-drift.sh         # Drift calculation engine
└── test-drift-scenarios.sh       # Test suite

~/clawd/agents/
└── ventureos-rpg.db              # Database (modified)
    ├── khala_network             # Affinities updated
    ├── khala_drift_history       # 9 test records
    └── interaction_logs          # 9 test interactions

~/clawd/runtime/
├── logs/
│   └── khala-drift-2026-02-14.log  # Execution log
└── tmp/
    └── khala-drift-last-processed.txt  # State tracking
```

## 🔍 GitLab Integration

**Commit Command:**
```bash
cd ~/clawd
git add \
    shared-context/rpg-drift-policy.md \
    shared-context/rpg-drift-integration.md \
    scripts/log-interaction.sh \
    scripts/update-khala-drift.sh \
    scripts/test-drift-scenarios.sh

git commit -m "feat(rpg): Phase 2 Track 2 - Khala drift tracking engine

- Deterministic drift policy (±0.03 base, ±0.05 for conflict)
- Interaction logging helper (collaboration|escalation|handoff|conflict)
- Drift update script (idempotent, bounded, history-pruned)
- Test suite validates all mechanics (9/9 scenarios passed)
- Integration docs for cron + spawn hooks
- VOXYZ pattern: 20-record retention per bond pair

Closes: rpg-phase2-track2-drift
Refs: #ventureos-rpg, #khala-network"

# Push to GitLab
git push origin main
```

**Related Issues:**
- Track 1: Real metrics ingestion (completed, provides `interaction_logs` source)
- Track 2: This deliverable
- Track 3: Tactical overlay system (dependent on stable drift data)

---

**Maintainer:** Oracle  
**Completion:** 2026-02-14 03:57 CST  
**Test Status:** ✅ All passing  
**Production Ready:** ✅ Pending cron integration
