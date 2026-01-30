# Day 7 Deployment Safety Analysis

**Question:** Are we ready for Day 7, or will it kill the gateway?

## Current Risk Assessment

### High Risk Actions 🔴

**GatewayHealer can restart the gateway:**
```python
# From gateway_healer.py
await asyncio.create_subprocess_exec("/usr/local/bin/clawdbot", "gateway", "stop")
await asyncio.create_subprocess_exec("/usr/local/bin/clawdbot", "gateway", "start")
```

**What this means:**
- If detector thinks gateway is unhealthy → auto-restart
- Restart = disconnect from current Discord session
- Could happen **while we're talking** if detector has false positive

### Medium Risk Actions 🟠

**CronHealer can modify cron jobs:**
- Enables/disables jobs
- Could accidentally break working automation

**DiskHealer can delete files:**
- Cleans logs, temp files, caches
- Could delete something important if path logic is wrong

### False Positive Scenarios

**GatewayDetector could falsely trigger if:**
1. `clawdbot status` command times out (>10s)
2. Network hiccup during health check
3. Gateway slow to respond but not actually down

**Result:** Unnecessary gateway restart, disconnecting active session

## Current Safeguards ✅

**Good:**
- Cooldown system (5min between heal attempts)
- Max attempts (3 failures then stop)
- Comprehensive logging
- All code tested in isolation

**Missing:**
- ❌ No DRY_RUN mode (can't test without actual healing)
- ❌ No manual approval option for critical actions
- ❌ No rate limiting on gateway restarts (could restart every 5min)
- ❌ No "quiet hours" for healing (could heal at 3am)
- ❌ No notification BEFORE healing (only after)

## Deployment Plan Issues

**Original Plan:** Systemd service  
**Actual Platform:** macOS → needs launchd/launchctl, not systemd

**Original Plan:** Auto-start on boot  
**Risk:** Monitor-Agent starts before testing, could cause issues immediately

## Recommended Safety Approach

### Option A: Dry-Run Deployment (SAFEST) ⭐

**Phase 1: Dry-Run Mode (2-4 hours)**
1. Add `DRY_RUN=true` environment variable
2. When enabled, healers LOG actions but don't execute
3. Run monitor-agent in foreground (not as service)
4. Watch logs for false positives
5. If detector says "would restart gateway" → investigate why

**Phase 2: Selective Healing (Next day)**
1. Enable only safe healers: GitHealer, DiskHealer
2. Keep GatewayHealer, CronHealer in dry-run
3. Monitor for 12+ hours

**Phase 3: Full Activation (Day after)**
1. Enable GatewayHealer with manual approval
2. Notification before restart: "Gateway unhealthy, restart in 60s? Reply Y/N"
3. Only after approval, proceed

**Phase 4: Full Autonomous (Week later)**
1. Remove manual approval if working well
2. Deploy as launchd service

**Timeline:** 3-4 days to full autonomy (but SAFE)

### Option B: Disable Gateway Healing (SAFE-ISH)

1. Deploy everything except GatewayHealer
2. Monitor-Agent detects issues, alerts, but doesn't touch gateway
3. Human manually restarts gateway if needed
4. Enable GatewayHealer later after confidence built

**Timeline:** Deploy today, add gateway healing in 1-2 weeks

### Option C: Full Deploy (RISKY) ⚠️

1. Deploy as launchd service immediately
2. Enable all healers including gateway
3. Hope for no false positives

**Risk:** Could restart gateway while we're talking  
**Recovery:** Can SSH in and `launchctl unload` the service  
**Likelihood of issue:** Medium (20-30%)

## Specific Concerns for Gateway Healer

**When does it trigger?**
- Gateway not running (`clawdbot status` returns error)
- Gateway unresponsive (timeout >10s)

**Can we trust the detector?**
- GatewayDetector uses `clawdbot status` with 10s timeout
- If command hangs/fails → triggers heal
- NO validation of "is this a real problem or network blip"
- NO second opinion check

**Improvement needed:**
- Add retry logic (check 3x before declaring dead)
- Add "last successful check" threshold (only heal if down >2min)
- Add manual approval for first 48h

## Recommendation: Option A (Dry-Run First)

**Why:**
1. We built this in <3 hours (fast = possible edge cases)
2. Gateway restart is HIGH IMPACT action
3. False positive = lost Discord session
4. Dry-run lets us validate detector accuracy
5. Can deploy today, just with safety nets

**Implementation:**
1. Add DRY_RUN mode (10 min)
2. Add manual approval for gateway heals (15 min)
3. Run in foreground for 2-4 hours (monitor logs)
4. If clean → deploy as service tomorrow

**Total delay:** 1 day (but eliminates "kill gateway" risk)

## Answer to Your Question

**"Are we ready for Day 7?"**
- Code quality: YES ✅ (9/10, well-tested)
- Detector accuracy: UNKNOWN ❓ (not battle-tested)
- Safety measures: NO ❌ (no dry-run, no manual approval)

**"Will it kill the gateway?"**
- Possible: YES (if false positive)
- Likely: MEDIUM (20-30% chance in first 24h)
- Preventable: YES (with dry-run mode)

**Recommendation:** Add safety features first (25 min), then deploy safely

---

**What do you want to do?**
1. Add safety features → dry-run today → full deploy tomorrow (SAFE)
2. Disable gateway healing → deploy rest today (SAFE-ISH)
3. Deploy as-is, accept risk (RISKY)
