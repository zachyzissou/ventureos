# Session Bloat Prevention

**Issue:** Agent sessions can grow beyond 200K token limit (Anthropic API max), causing errors.  
**Root Cause:** Long conversations accumulate context without compaction.  
**Impact:** API 400 errors, session failures (Sentinel: 214K tokens, 673KB JSONL).

## Solution: Automated Monitoring

**Script:** `~/clawd/scripts/session-health-check.sh`

**Thresholds:**
- **400KB** → Warning (approx 150K tokens)
- **600KB** → Auto-reset with backup (approx 200K+ tokens)

**Cron:** Every hour (jobId `dd015693-4062-4ec9-b8b4-67b2e4e10a3a`)

**Actions:**
1. Scan all agent session JSONL files
2. Warn if size ≥ 400KB
3. Auto-reset if size ≥ 600KB:
   - Backup to `sessions/backups/<session-id>-<timestamp>.jsonl.bak`
   - Delete bloated JSONL (agent starts fresh on next message)
   - Report to #slurpnet

**Reports To:** #slurpnet (1466893115460812979)

## First Run Results (2026-02-14 01:10 CST)

**Auto-reset:**
- Oracle: a48c03ad (2228KB)

**Warnings (approaching limit):**
- Verifier: aee56fb1 (584KB)
- Synth: c35ff141 (572KB)
- Atlas: f707638d (568KB)
- Atlas: d34113d9 (516KB)
- Atlas: 25201a6f (492KB)

**Next check:** In 1 hour, then hourly thereafter.

## Prevention Strategy

This prevents token limit errors from happening. Sessions reset automatically before hitting the 200K limit, maintaining system reliability.
