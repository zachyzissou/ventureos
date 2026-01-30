# Windows PC (GamingPC) Configuration Audit
**Date:** 2026-01-30  
**Context:** Post-migration cleanup check (Windows → Mac migration on Jan 29)

## Executive Summary

✅ **Good News:**
- All StantonTimes cron jobs properly disabled (10 jobs)
- Node connection config (`node.json`) is correct
- Windows is successfully paired to Mac gateway

❌ **Critical Issues Found:**
1. **Config Conflict:** Windows has BOTH gateway + node configs (should be node-only)
2. **Service Paused:** ClawdbotNode Windows service is paused, not running
3. **Stale Config:** Old StantonTimes Discord config remains in clawdbot.json
4. **Auth Confusion:** Windows trying to run local gateway causing auth failures

🔧 **Recommended Role:** Windows should be node-only (browser proxy, occasional system commands)

---

## 1. Current State Documentation

### Node Status (from Mac)
- **Connected:** ✅ Yes
- **Node ID:** `38777e5fdc4c480f7b2a2c90cae68a62d3d2a31f16ec4cbe1aa5bb0df5c3b73c`
- **Display Name:** GamingPC
- **Platform:** win32
- **Version:** 2026.1.24-3
- **IP:** 192.168.225.112
- **Capabilities:** browser, system
- **Commands:** browser.proxy, system.execApprovals.{get,set}, system.run, system.which

### Windows Clawdbot Service
- **Status:** **PAUSED** ❌
- **Service Name:** ClawdbotNode
- **Display Name:** "Clawdbot Node (GamingPC)"

### Cron Jobs Configuration
**Location:** `C:\Users\Zachg\.clawdbot\cron\jobs.json`

**Disabled (Correct):**
1. ✅ StantonTimes P0 Monitor (`28f19653...`) - **DISABLED**
2. ✅ StantonTimes P1 Keywords (`542312dc...`) - **DISABLED**
3. ✅ StantonTimes Daily Digest (`f94dcce0...`) - **DISABLED**
4. ✅ StantonTimes Engagement (`9b190deb...`) - **DISABLED**
5. ✅ StantonTimes Approval Check (`9cb3494c...`) - **DISABLED**
6. ✅ StantonTimes Creator Monitor (`3ff6f1a0...`) - **DISABLED**
7. ✅ StantonTimes Hashtag Monitor (`c89a6b91...`) - **DISABLED**
8. ✅ StantonTimes Web & RSS Monitor (`c8fdec61...`) - **DISABLED**
9. ✅ StantonTimes Calendar Check (`f1983992...`) - **DISABLED**
10. ✅ StantonTimes P2-P3 Deep Scan (`aefc5a0a...`) - **DISABLED**

**Enabled (Running on Mac - these should NOT be here):**
11. ⚠️ Weekly Memory Synthesis (`6b74030d...`) - **ENABLED** (Mac job)
12. ⚠️ Fact Extraction Heartbeat (`a400d9aa...`) - **ENABLED** (Mac job)
13-25. ⚠️ Various Bloom/Memory jobs - **ENABLED** (Mac jobs)

### Node Configuration
**Location:** `C:\Users\Zachg\.clawdbot\node.json`
```json
{
  "version": 1,
  "nodeId": "new-gaming-pc",
  "displayName": "GamingPC",
  "gateway": {
    "host": "192.168.225.149",  ✅ CORRECT (Mac IP)
    "port": 18789,               ✅ CORRECT
    "tls": false                 ✅ CORRECT
  }
}
```

### Gateway Configuration (PROBLEM!)
**Location:** `C:\Users\Zachg\.clawdbot\clawdbot.json`
```json
{
  "gateway": {
    "port": 18789,
    "mode": "local",           ❌ WRONG - should not exist on node
    "bind": "loopback",        ❌ WRONG - node shouldn't run gateway
    "auth": {
      "mode": "token",
      "token": "15fef3c68e66faa55af7b20b56bc34c01c03c33254c509d8"  ❌ Local gateway token
    },
    "tailscale": {
      "mode": "off"
    }
  }
}
```

---

## 2. Issues Identified

### Issue #1: Gateway Configuration Conflict ⚠️ **CRITICAL**
**Problem:** Windows `clawdbot.json` contains gateway config (`mode: local`, `bind: loopback`)  
**Impact:** Windows tries to run its own local gateway instead of pure node mode  
**Evidence:** Error logs show "gateway closed (1006)" when trying `clawdbot cron list`  
**Root Cause:** Old pre-migration config when Windows WAS the gateway  

### Issue #2: Service Paused 🔴 **HIGH**
**Problem:** ClawdbotNode Windows service is **PAUSED**, not running  
**Impact:** Node cannot connect to Mac gateway or respond to commands  
**Likely Cause:** Service paused after migration testing, never resumed  

### Issue #3: Stale Discord Config 🟡 **MEDIUM**
**Problem:** Windows `clawdbot.json` still has full StantonTimes Discord channel config  
**Impact:** Confusion if Windows gateway accidentally runs; unnecessary config bloat  
**Found:**
- `channels.discord.guilds.825047055688532049.channels.1465948913906225286`
- Full systemPrompt for StantonTimes reactions
- Discord token still present

### Issue #4: Orphaned Agent Config 🟡 **MEDIUM**
**Problem:** "stanton-times" agent still configured with workspace and session files  
**Impact:** Minor - just unused files, but creates confusion  
**Location:** `C:\Users\Zachg\.clawdbot\agents\stanton-times\`

### Issue #5: Cron Jobs Still Present 🟡 **LOW**
**Problem:** All cron jobs (StantonTimes + Mac jobs) still in Windows jobs.json  
**Impact:** Disabled so not running, but confusing and creates maintenance burden  
**Note:** Mac jobs (Bloom, Memory) showing as "enabled" in Windows config  

### Issue #6: Old Workspace Path ℹ️ **INFO**
**Problem:** `agents.defaults.workspace: "C:\\Users\\Zachg\\clawd"`  
**Impact:** None if node-only, but misleading  

---

## 3. Windows Role Definition

### Current Role (Unintended)
- Trying to be local gateway + node simultaneously
- Has cron jobs configured (all disabled)
- Full agent configs present
- Discord channel access configured

### Recommended Role
**Primary:** Remote Node for Mac Gateway
- **Browser Proxy** - Chrome extension relay via `browser.proxy` capability
- **System Commands** - Occasional Windows-specific tasks via `system.run`
- **Gaming Access** - For Star Citizen/game-related commands if needed

**Should NOT:**
- Run gateway mode
- Run any cron jobs
- Have agent workspaces
- Connect to Discord directly
- Run isolated agent sessions

### Why Node-Only?
1. Mac Studio is always-on, more reliable for cron/monitoring
2. Windows PC used for gaming - should be lightweight
3. Browser proxy is the main value-add (Chrome extension access)
4. Reduces complexity and maintenance

---

## 4. Remediation Steps

### Step 1: Fix Gateway Config (CRITICAL)
**Action:** Remove gateway section from Windows `clawdbot.json`

```powershell
# On Windows
# Edit C:\Users\Zachg\.clawdbot\clawdbot.json
# Delete the entire "gateway" section (lines with mode, bind, auth, tailscale)
```

**Verification:**
- File should NOT have `gateway.mode` or `gateway.bind`
- `node.json` remains unchanged (correct as-is)

### Step 2: Resume Clawdbot Service (HIGH)
**Action:** Resume the paused Windows service

```powershell
# On Windows (as Administrator)
Start-Service -Name "ClawdbotNode"
# Or via Services GUI: services.msc → ClawdbotNode → Start
```

**Verification:**
```powershell
Get-Service -Name "ClawdbotNode" | Select-Object Status, DisplayName
# Should show: Status = Running
```

### Step 3: Clean Up Cron Jobs (MEDIUM)
**Action:** Remove ALL cron jobs from Windows

```powershell
# On Windows
# Delete or truncate C:\Users\Zachg\.clawdbot\cron\jobs.json
# Replace with: {"version": 1, "jobs": []}
```

**Rationale:** Node shouldn't have ANY cron jobs - all scheduling on Mac

### Step 4: Remove Stale Discord Config (MEDIUM)
**Action:** Strip StantonTimes Discord config from `clawdbot.json`

**Remove:**
- `channels.discord.guilds.825047055688532049.channels.1465948913906225286`
- `channels.discord` section entirely (node doesn't need it)

**Keep:**
- Basic auth profiles
- Tool configs (web search API)
- Agent defaults (if needed for rare local runs)

### Step 5: Archive Old Agent Data (LOW)
**Action:** Move stanton-times agent folder to archive

```powershell
# On Windows
mkdir C:\Users\Zachg\.clawdbot\agents-archive
move C:\Users\Zachg\.clawdbot\agents\stanton-times C:\Users\Zachg\.clawdbot\agents-archive\
```

### Step 6: Update Workspace Path (OPTIONAL)
**Action:** Remove or update workspace path in agents.defaults

**Option A:** Remove workspace entirely (node doesn't need it)  
**Option B:** Keep as-is (unused but harmless)

---

## 5. Testing & Validation

### After Remediation, Verify:

1. **Service Status**
   ```powershell
   Get-Service ClawdbotNode | Select-Object Status
   # Should be: Running
   ```

2. **Node Connection**
   ```bash
   # On Mac
   clawdbot nodes status
   # Should show GamingPC connected
   ```

3. **Node Commands Work**
   ```bash
   # On Mac
   clawdbot nodes run GamingPC "powershell -Command 'echo test'"
   # Should return "test" without errors
   ```

4. **No Auth Errors**
   - Check Windows Event Viewer
   - Check `C:\Users\Zachg\.clawdbot\logs\` for errors
   - Should NOT see "authentication failing" or "gateway closed (1006)"

5. **Browser Proxy Available**
   ```bash
   # On Mac (when Chrome extension is attached)
   # Test browser commands work through Windows node
   ```

### Success Criteria
- ✅ Windows service Running (not Paused)
- ✅ Node connects to Mac gateway without auth errors
- ✅ `nodes run` commands execute successfully
- ✅ No gateway-related errors in logs
- ✅ Browser proxy capability available when needed

---

## 6. Recommended Windows Configuration

### Minimal `clawdbot.json` for Node

```json
{
  "meta": {
    "lastTouchedVersion": "2026.1.24-3"
  },
  "auth": {
    "profiles": {
      "anthropic:default": {
        "provider": "anthropic",
        "mode": "token"
      }
    }
  },
  "tools": {
    "web": {
      "search": {
        "apiKey": "BSAW1ZNoEGBXmYuZhy_o2MaRfx8yctI"
      }
    }
  },
  "commands": {
    "native": "auto",
    "restart": true
  }
}
```

**What's REMOVED:**
- `gateway` section (entire thing)
- `agents.list` (no local agents)
- `channels.discord` (no Discord access needed)
- `hooks` (no session management needed)
- `messages` config

**What's KEPT:**
- Auth profiles (for CLI commands if ever needed)
- Tool configs (web search might be useful)
- Command settings

### `node.json` (Already Correct)
```json
{
  "version": 1,
  "nodeId": "new-gaming-pc",
  "displayName": "GamingPC",
  "gateway": {
    "host": "192.168.225.149",
    "port": 18789,
    "tls": false
  }
}
```

### `cron/jobs.json` (Should Be Empty)
```json
{
  "version": 1,
  "jobs": []
}
```

---

## 7. Future Considerations

### If Windows Needs More Than Node
**Option 1:** Keep as node-only (recommended)  
**Option 2:** Add lightweight local agent for Windows-specific tasks  
**Option 3:** Dual-mode: node + minimal local agent (complex, not recommended)

### Browser Proxy Usage
- Chrome extension relay is Windows's primary value
- When attached, Mac can control Chrome tabs on Windows
- Useful for web automation that needs Chrome-specific features

### When to Use Windows Node
**Good use cases:**
- Browser automation via Chrome extension
- Windows-specific commands (registry, Windows services)
- Gaming-related automation (Star Citizen API checks if local client running)

**Bad use cases:**
- Cron jobs (use Mac)
- Long-running agent sessions (use Mac)
- Discord monitoring (use Mac)
- Memory/fact extraction (use Mac)

---

## 8. Migration Lessons Learned

### What Went Well
✅ Disabled all StantonTimes cron jobs on Windows  
✅ Created correct `node.json` for Windows  
✅ Mac gateway running with all jobs active  
✅ Node pairing worked correctly  

### What Was Missed
❌ Didn't remove gateway config from `clawdbot.json`  
❌ Left Windows service in Paused state  
❌ Didn't clean up old Discord configs  
❌ Didn't remove Mac cron jobs from Windows config  

### Prevention for Future Migrations
1. **Checklist:** "Gateway → Node" conversion steps
2. **Validation:** Test node-only config before considering migration complete
3. **Service Management:** Explicitly verify service state after changes
4. **Config Cleanup:** Remove all gateway-related configs when converting to node

---

## Appendix A: File Locations

### Windows Clawdbot Config
- Main config: `C:\Users\Zachg\.clawdbot\clawdbot.json`
- Node config: `C:\Users\Zachg\.clawdbot\node.json`
- Cron jobs: `C:\Users\Zachg\.clawdbot\cron\jobs.json`
- Logs: `C:\Users\Zachg\.clawdbot\logs\`
- Agents: `C:\Users\Zachg\.clawdbot\agents\`

### Windows Service
- Service Name: `ClawdbotNode`
- Display Name: "Clawdbot Node (GamingPC)"
- Management: `services.msc` or PowerShell `Get-Service`

### Mac Gateway Config
- Main config: `/Users/zachgonser/.clawdbot/clawdbot.json`
- Cron jobs: `/Users/zachgonser/.clawdbot/cron/jobs.json`
- Gateway IP: `192.168.225.149:18789`

---

## Appendix B: Auth Error Root Cause

### The Problem
Windows showing repeated "Authentication Failing" errors in gateway logs.

### Why It Happened
1. Windows `clawdbot.json` has `gateway.mode: "local"`
2. This makes Windows try to RUN a gateway (not just connect to one)
3. Windows gateway tries to bind to `127.0.0.1:18789` (loopback)
4. When CLI commands run, they try to connect to local gateway
5. Local gateway exists but has different token than Mac gateway
6. Authentication fails because tokens don't match

### The Fix
Remove `gateway` section entirely → Windows becomes pure node → connects to Mac gateway with proper token from environment variable

---

## Appendix C: Commands Reference

### Check Node Status (from Mac)
```bash
clawdbot nodes status
clawdbot nodes describe GamingPC
```

### Run Commands on Windows Node (from Mac)
```bash
clawdbot nodes run GamingPC "powershell -Command 'Get-Date'"
```

### Check Windows Service
```powershell
# On Windows
Get-Service ClawdbotNode | Select-Object Status, DisplayName
Start-Service ClawdbotNode
Stop-Service ClawdbotNode
```

### View Windows Logs
```powershell
# On Windows
Get-Content C:\Users\Zachg\.clawdbot\logs\clawdbot.log -Tail 50
```

### Environment Variable (Windows)
```powershell
$env:CLAWDBOT_GATEWAY_TOKEN = "15fef3c68e66faa55af7b20b56bc34c01c03c33254c509d8"
```

---

**End of Audit**

**Next Steps:**
1. Review remediation plan with Zach
2. Execute fixes in order (critical → high → medium)
3. Validate each fix
4. Update this document with results
5. Archive old configs before cleanup
