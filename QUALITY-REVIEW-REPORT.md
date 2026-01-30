# Phase Zero Quality Review Report

**Date:** 2026-01-30 14:00 CST  
**Reviewer:** Echo (autonomous review)  
**Scope:** Days 1-5 complete work + Days 6-7 readiness

---

## Executive Summary

**Overall Status:** 🟡 **GOOD PROGRESS WITH CRITICAL ISSUE**

- ✅ **Days 1-5:** Code written, tests passing (21/21)
- ✅ **Integration:** Components work together correctly  
- 🔴 **CRITICAL:** Directory structure mismatch will break Day 6
- ⏱️ **Fix Time:** 15-20 minutes to resolve

**Recommendation:** Fix directory structure NOW before proceeding to Day 6.

---

## What's Complete (Days 1-5)

### ✅ Day 1: Foundation (GOOD)
**Location:** `/Users/zachgonser/clawd/monitor/monitor/`

**Components:**
- `models.py` - Data models (Issue, HealResult, HealthCheck, Metric) ✅
- `state_db.py` - Database layer with proper async context manager ✅
- `logging_config.py` - Structured logging with structlog ✅
- `http_client.py` - HTTPClientManager singleton ✅
- `detector.py`, `validator.py`, `healer.py`, `alerter.py` - Base classes ✅

**Quality:** 9/10
- Proper async/await patterns
- Context managers for resource lifecycle
- Thread-safe operations (asyncio.Lock)
- Comprehensive error handling

**Issues:** None

---

### ⚠️ Day 2: Core Detectors (HAS ISSUES)
**Location:** `/Users/zachgonser/clawd/monitor/detectors/` ← OLD LOCATION

**Components:**
- `gateway_detector.py` - Monitors Clawdbot daemon
- `cron_detector.py` - Monitors 15 cron jobs
- `api_detector.py` - Monitors external APIs (also in monitor/monitor/detectors/)
- `disk_detector.py` - Monitors disk space

**Quality:** 7/10
- ❌ Uses `sys.path.insert()` hacks
- ❌ Imports from `detector`, `models` (not `monitor.detector`, `monitor.models`)
- ✅ Tests pass (4/4)
- ✅ Logic is correct

**Critical Issue:** Import structure incompatible with Days 4-5 code

---

### ⚠️ Day 3: Data Validators (HAS ISSUES)
**Location:** `/Users/zachgonser/clawd/monitor/validators/` ← OLD LOCATION

**Components:**
- `memory_validator.py` - Validates daily memory files
- `state_validator.py` - Validates JSON state files
- `obsidian_validator.py` - Validates Obsidian sync
- `git_validator.py` - Validates git status

**Quality:** 7/10
- ❌ Uses `sys.path.insert()` hacks
- ❌ Imports from `validator`, `models` (not `monitor.validator`, `monitor.models`)
- ✅ Tests pass (4/4)
- ✅ Logic is correct

**Critical Issue:** Same import problem as detectors

---

### ✅ Day 4: Self-Healing Actions (EXCELLENT)
**Location:** `/Users/zachgonser/clawd/monitor/monitor/healers/` ← CORRECT LOCATION

**Components:**
- `gateway_healer.py` - Auto-restart crashed gateway
- `cron_healer.py` - Auto-enable disabled cron jobs
- `disk_healer.py` - Auto-cleanup disk space
- `git_healer.py` - Auto-commit uncommitted changes

**Quality:** 9/10
- ✅ Proper package imports (`from monitor.models import`)
- ✅ Thread-safe cooldown management
- ✅ Max attempt tracking
- ✅ Comprehensive error handling
- ✅ Tests pass (8/8)

**Issues:** None

---

### ✅ Day 5: Alerter Module (EXCELLENT)
**Location:** `/Users/zachgonser/clawd/monitor/monitor/alerters/` ← CORRECT LOCATION

**Components:**
- `discord_alerter.py` - Discord webhook integration with rich embeds
- Severity routing (P0→immediate+mention, P1→15min, P2/P3→batch)
- Deduplication (5min window)
- Batch digest support

**Quality:** 9/10
- ✅ Proper package imports
- ✅ Thread-safe alert tracking
- ✅ HTTPClientManager integration
- ✅ Tests pass (5/5)

**Issues:** None

---

## 🔴 CRITICAL ISSUE: Directory Structure Mismatch

### The Problem

**Two different directory structures exist:**

**OLD Structure (Days 1-3):**
```
/Users/zachgonser/clawd/monitor/
├── detectors/
│   ├── gateway_detector.py  (uses sys.path hacks)
│   ├── cron_detector.py     (uses sys.path hacks)
│   ├── api_detector.py      (uses sys.path hacks)
│   └── disk_detector.py     (uses sys.path hacks)
├── validators/
│   ├── memory_validator.py  (uses sys.path hacks)
│   ├── state_validator.py   (uses sys.path hacks)
│   ├── obsidian_validator.py (uses sys.path hacks)
│   └── git_validator.py     (uses sys.path hacks)
```

**NEW Structure (Days 4-5):**
```
/Users/zachgonser/clawd/monitor/monitor/
├── healers/
│   ├── gateway_healer.py    (proper imports ✅)
│   ├── cron_healer.py       (proper imports ✅)
│   ├── disk_healer.py       (proper imports ✅)
│   └── git_healer.py        (proper imports ✅)
├── alerters/
│   └── discord_alerter.py   (proper imports ✅)
├── detectors/
│   └── api_detector.py      (proper imports ✅, DUPLICATE)
```

### Why This Breaks Day 6

**Day 6 Main Loop needs to import:**
```python
# This will FAIL:
from monitor.detectors import GatewayDetector  # ❌ Not in monitor/monitor/detectors/
from monitor.validators import MemoryValidator  # ❌ validators/ doesn't exist in monitor/monitor/
from monitor.healers import GatewayHealer  # ✅ This works
from monitor.alerters import DiscordAlerter  # ✅ This works
```

**Result:** ImportError when trying to run Main Loop.

---

## Solution: Consolidate Into Proper Package Structure

### Recommended Fix (15-20 minutes)

**Step 1:** Move detectors and validators into monitor/monitor/
```bash
cd /Users/zachgonser/clawd/monitor

# Create proper directories
mkdir -p monitor/detectors monitor/validators

# Move files (will need to fix imports)
# - Copy gateway_detector.py, cron_detector.py, disk_detector.py from detectors/
# - Copy all validators from validators/
# - Fix imports in each file
```

**Step 2:** Fix imports in moved files
```python
# OLD (broken):
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))
from detector import InfrastructureDetector
from models import Issue, Severity

# NEW (correct):
from monitor.detector import InfrastructureDetector
from monitor.models import Issue, Severity
from monitor.logging_config import get_logger
```

**Step 3:** Update __init__.py files
```python
# monitor/monitor/detectors/__init__.py
from monitor.detectors.gateway_detector import GatewayDetector
from monitor.detectors.cron_detector import CronDetector
from monitor.detectors.api_detector import APIDetector
from monitor.detectors.disk_detector import DiskDetector

__all__ = ["GatewayDetector", "CronDetector", "APIDetector", "DiskDetector"]
```

**Step 4:** Update tests
```python
# OLD:
sys.path.insert(0, str(Path(__file__).parent))
from detectors.gateway_detector import GatewayDetector

# NEW:
from monitor.detectors import GatewayDetector
```

**Step 5:** Delete old directories
```bash
rm -rf /Users/zachgonser/clawd/monitor/detectors
rm -rf /Users/zachgonser/clawd/monitor/validators
```

**Step 6:** Test all imports work
```bash
cd monitor
source venv/bin/activate
python -c "from monitor.detectors import GatewayDetector; from monitor.validators import MemoryValidator; from monitor.healers import GatewayHealer; from monitor.alerters import DiscordAlerter; print('✅ All imports work')"
```

---

## Days 6-7: What Remains

### Day 6: Main Orchestration Loop (30-45 min)

**File to create:** `monitor/monitor/main_loop.py`

**Components needed:**
1. **MonitorAgent class** - Main orchestrator
2. **Continuous event loop** - Run forever with async sleep
3. **Detector scheduling** - Run detectors every 60s
4. **Validator scheduling** - Run validators every 5-30min (staggered)
5. **Issue → Heal flow** - When issue detected, find appropriate healer
6. **Heal → Alert flow** - Send alerts based on heal result
7. **Database persistence** - Store all issues, heals, health checks
8. **Dashboard generation** - Create monitoring-dashboard.md

**Pseudo-code:**
```python
class MonitorAgent:
    async def run(self):
        while True:
            # Run all detectors/validators
            issues = await self.detect_issues()
            
            # For each issue
            for issue in issues:
                # Try to heal if auto-fixable
                if issue.can_auto_fix:
                    heal_result = await self.heal(issue)
                    
                    # Alert based on result
                    if not heal_result.success:
                        await self.alert(issue, heal_result, escalate=True)
                    elif issue.severity in [P0, P1]:
                        await self.alert(issue, heal_result)
                else:
                    # Can't auto-fix, alert immediately
                    await self.alert(issue)
            
            # Generate dashboard
            await self.update_dashboard()
            
            # Sleep 60s
            await asyncio.sleep(60)
```

---

### Day 7: Deployment (20-30 min)

**Files to create:**
1. **Systemd service file** - `/etc/systemd/system/monitor-agent.service`
2. **Start/stop scripts** - Wrapper scripts for control
3. **Log rotation config** - `/etc/logrotate.d/monitor-agent`

**Systemd service:**
```ini
[Unit]
Description=Monitor-Agent Self-Healing System
After=network.target

[Service]
Type=simple
User=zachgonser
WorkingDirectory=/Users/zachgonser/clawd/monitor
ExecStart=/Users/zachgonser/clawd/monitor/venv/bin/python -m monitor.main_loop
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

**Commands:**
```bash
# Enable and start
sudo systemctl enable monitor-agent
sudo systemctl start monitor-agent

# Check status
sudo systemctl status monitor-agent

# View logs
sudo journalctl -u monitor-agent -f
```

---

## Test Coverage

**Current:** 21/21 tests passing (100%)

**Test files:**
- `test_detectors.py` - 4 tests ✅
- `test_validators.py` - 4 tests ✅
- `test_healers.py` - 8 tests ✅
- `test_alerters.py` - 5 tests ✅
- `test_integration_simple.py` - Integration tests ✅

**Missing tests (will add in Day 6):**
- Main loop tests
- End-to-end workflow tests
- Dashboard generation tests

---

## Recommendations

### IMMEDIATE (Before Day 6)

1. **🔴 FIX DIRECTORY STRUCTURE** (15-20 min)
   - Consolidate all code into monitor/monitor/
   - Fix imports to use proper package structure
   - Test all imports work

2. **Validate integration one more time** (5 min)
   - Run all existing tests
   - Ensure 21/21 still pass after restructure

### Day 6 Execution (30-45 min)

1. Create main_loop.py
2. Implement MonitorAgent class
3. Test end-to-end workflow
4. Generate dashboard

### Day 7 Execution (20-30 min)

1. Create systemd service
2. Test start/stop/restart
3. Verify auto-restart on failure
4. Set up log rotation

---

## Overall Assessment

**Code Quality:** 8.5/10
- Excellent architecture (Days 4-5)
- Some legacy issues (Days 1-3)
- Comprehensive error handling
- Good test coverage

**Completeness:** 70% (Days 1-5 of 7)
- Foundation solid
- Main loop not built yet
- Deployment not done yet

**Readiness for Day 6:** ⚠️ **NOT READY**
- Must fix directory structure first
- Otherwise will fail immediately

**Time to Fix + Complete:** 1.5-2 hours
- Fix structure: 15-20 min
- Day 6: 30-45 min
- Day 7: 20-30 min

---

## Next Actions

**Option A: Fix Now, Then Day 6-7** (RECOMMENDED)
1. Spend 15-20 min fixing directory structure
2. Validate all imports work
3. Proceed to Day 6 with clean foundation
4. Complete Phase Zero today

**Option B: Document and Revisit**
1. Commit this review
2. Plan fix for tomorrow
3. Execute fresh with proper structure

**My Recommendation:** Option A - fix now while context is fresh.

---

**End of Review**
