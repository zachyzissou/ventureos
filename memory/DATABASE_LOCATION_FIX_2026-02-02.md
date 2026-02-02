# Database Location Fix - 2026-02-02

## Problem Identified

During the upgrade to OpenClaw, the memory database configuration was pointing to the wrong location.

### What Was Happening

**Gateway was reading from FIVE SQLite files:**
1. `~/.openclaw/memory/main.sqlite` (54MB, **actively updated**)
2. `/Users/zachgonser/clawd/memory/main.sqlite` (49MB, **stale since Feb 1**)
3. `/Users/zachgonser/clawd/memory/memory.sqlite` (49MB, **stale duplicate**)
4. `/Users/zachgonser/clawd/memory/main.sqlite.backup-*` (backup)
5. `/Users/zachgonser/clawd/memory/stanton-times.sqlite` (4.1MB, active)

**AGENTS.md configuration (INCORRECT):**
```json
"databases": [
  "/Users/zachgonser/clawd/memory/main.sqlite",  // ❌ Stale
  "/Users/zachgonser/clawd/memory/stanton-times.sqlite"  // ✅ Correct
]
```

**Actual active database (OpenClaw default):**
```
~/.openclaw/memory/main.sqlite  // ✅ Live, actively updated
```

### Data Comparison

| Database | Files | Chunks | Status | Last Modified |
|----------|-------|--------|--------|---------------|
| `~/.openclaw/memory/main.sqlite` | 227 | 1,196 | ✅ Active | Feb 2, 00:31 |
| `/Users/zachgonser/clawd/memory/main.sqlite` | 201 | 1,079 | ❌ Stale | Feb 1, 23:56 |
| `/Users/zachgonser/clawd/memory/memory.sqlite` | 201 | 1,079 | ❌ Stale | Feb 1, 23:46 |

The active database has **26 more files** and **117 more chunks** - proving it's the one being updated.

## Solution Applied

**Updated AGENTS.md to point to the correct location:**

```json
"databases": [
  "/Users/zachgonser/.openclaw/memory/main.sqlite",  // ✅ Corrected
  "/Users/zachgonser/clawd/memory/stanton-times.sqlite"  // ✅ Unchanged
]
```

## Why This Happened

During the upgrade to OpenClaw, the system:
1. Used the default location `~/.openclaw/memory/main.sqlite`
2. But AGENTS.md still referenced the old workspace location
3. Created confusion with multiple database files
4. Gateway opened all databases but only wrote to the default location

## Resolution Status

✅ **Configuration Fixed**
- AGENTS.md now points to the correct active database
- No gateway restart needed (config will apply on next restart or when memory system reloads)
- Stale databases can be safely removed after verification

## Next Steps (Optional Cleanup)

After verifying memory search works correctly, you can safely remove:
1. `/Users/zachgonser/clawd/memory/main.sqlite` (49MB)
2. `/Users/zachgonser/clawd/memory/memory.sqlite` (49MB)
3. Backup files if no longer needed

This will free up ~98MB of disk space.

## Verification

To verify the fix is working:
```bash
# Check which database is being used
lsof -p $(pgrep -f openclaw-gateway) | grep sqlite

# Compare file counts
sqlite3 ~/.openclaw/memory/main.sqlite "SELECT COUNT(*) FROM files;"
```

---

**Fixed:** 2026-02-02 00:37 CST  
**By:** OpenClaw (Claude Sonnet 4.5)  
**Issue:** Database location mismatch after OpenClaw upgrade  
**Impact:** Minimal - gateway was using correct database despite config mismatch
