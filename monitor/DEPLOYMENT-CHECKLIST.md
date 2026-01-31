# Monitor-Agent Deployment Checklist
**Phase Zero Day 7: Production Deployment**

## Pre-Deployment ✅

- [x] All tests passing (25/25)
- [x] Dry-run validation complete (2 cycles, zero issues)
- [x] Config verified (dry_run=true, manual_approval for critical actions)
- [x] Scripts created (start, stop, status)
- [x] Log directory created
- [x] Service file created

## Deployment Steps

### 1. Initial Start (Manual)
```bash
cd /Users/zachgonser/clawd/monitor
./scripts/start-monitor.sh
```

### 2. Verify Running
```bash
./scripts/status-monitor.sh
```

### 3. Monitor Logs (First 5 Minutes)
```bash
tail -f logs/monitor-agent.log
```

**Watch for:**
- "MonitorAgent initialized" ✅
- "SAFETY CHECK: dry_run=True" ✅
- "Monitoring cycle complete" every 60s ✅
- No exceptions or errors ❌

### 4. Burn-In Period (24 Hours)

**Start time:** 2026-01-30 18:51 CST  
**End time:** 2026-01-31 18:51 CST

**Periodic checks (every 4-6 hours):**
```bash
./scripts/status-monitor.sh
tail -20 logs/monitor-agent.log
```

**Success criteria:**
- ✅ Process still running (no crashes)
- ✅ Log file size reasonable (<10MB per day)
- ✅ No error patterns in logs
- ✅ Detection working (issues found and logged)
- ✅ Dry-run healers triggering (logging what they would do)
- ✅ Memory usage stable (<512MB)
- ✅ CPU usage reasonable (<10% average)

### 5. Post-Burn-In Review (24h later)

**Commands:**
```bash
# Check uptime
ps -p $(cat logs/monitor-agent.pid) -o etime=

# Review full logs
less logs/monitor-agent.log

# Check for errors
grep -i error logs/monitor-agent.log | tail -20

# Database stats
sqlite3 data/monitor.db "SELECT COUNT(*) FROM issues;"
sqlite3 data/monitor.db "SELECT COUNT(*) FROM heal_attempts;"
```

**Decision point:**
- If clean → Enable healing (set dry_run=false)
- If issues → Debug, fix, restart burn-in

### 6. Enable Healing (After 24h)
```bash
# Edit config
vim config/config.yaml
# Change: dry_run: false

# Restart
./scripts/stop-monitor.sh
./scripts/start-monitor.sh

# Verify
tail -f logs/monitor-agent.log | grep "SAFETY CHECK"
# Should see: dry_run=False
```

### 7. Post-Healing Supervision (4-6h)

**Watch closely:**
- Healing actions actually executing
- No restart loops
- Successful heal confirmations
- Alert notifications working

## Rollback Plan

**If critical issue:**
```bash
# Immediate stop
./scripts/stop-monitor.sh

# Review logs
tail -100 logs/monitor-agent.log
tail -50 logs/monitor-agent-error.log

# If needed: Reset database
mv data/monitor.db data/monitor.db.backup
```

## Monitoring Commands

**Status check:**
```bash
./scripts/status-monitor.sh
```

**Live logs:**
```bash
tail -f logs/monitor-agent.log
```

**Recent issues:**
```bash
sqlite3 data/monitor.db "SELECT datetime(detected_at, 'unixepoch'), severity, system, message FROM issues ORDER BY detected_at DESC LIMIT 10;"
```

**Recent heals:**
```bash
sqlite3 data/monitor.db "SELECT datetime(attempted_at, 'unixepoch'), action, success, message FROM heal_attempts ORDER BY attempted_at DESC LIMIT 10;"
```

## Success Metrics

**After 24h dry-run:**
- Uptime: 100%
- Crashes: 0
- Detection cycles: ~1,440 (24h × 60 min/h)
- Issues logged: 50-200 (expected)
- Dry-run heals: 10-50 (expected)

**After 24h live:**
- Successful heals: >90%
- Failed heals escalated: 100%
- Gateway restarts: 0 (should never auto-happen)
- Disk cleanups: 0-1 (only if needed)
- Git commits: 5-20 (normal activity)

## Notes

**Current config (burn-in):**
- dry_run: true ✅
- healing_enabled: true ✅
- manual_approval: [gateway_restart, cron_disable] ✅
- loop_interval: 60s ✅

**Deployment timestamp:** 2026-01-30 18:51 CST  
**Deployed by:** Echo (autonomous)  
**Supervised by:** Zach Gonser
