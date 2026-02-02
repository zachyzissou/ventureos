# Cron Job Integration & Dependencies Review - 2026-02-02

## Critical Dependencies

### External Services & APIs
1. **GitHub CLI (`gh`)**
   - Used by: 6 jobs (Bloom PR Monitor, Bloom CI Watch, Unity Tool Scout, Weekly Bloom Digest, Extraction Shooter Intel)
   - Authentication: Token-based via keyring (gho_****)
   - Scopes: `gist`, `read:org`, `repo`, `workflow`
   - Rate Limits: GitHub API has 5000 req/hour for authenticated users
   - Failure Impact: **HIGH** - All Bloom monitoring stops

2. **Bird CLI (Twitter/X)**
   - Used by: 4 jobs (StantonTimes P0 Monitor, P1 Keywords, Creator Monitor, Engagement Monitor)
   - Authentication: Cookie-based (auth_token + ct0) from Firefox SQLite DB
   - Cookie Source: `/Users/zachgonser/Library/Application Support/Firefox/Profiles/9ez1stn7.default-release/cookies.sqlite`
   - Refresh: Daily at 4:00 AM via "Refresh Twitter Cookies" job
   - Failure Impact: **CRITICAL** - Entire StantonTimes pipeline stops
   - Cookie Expiration Risk: **HIGH** - Depends on Firefox session staying alive

3. **Discord Webhooks**
   - Used by: All StantonTimes jobs + some Bloom jobs
   - Endpoint: `https://discord.com/api/webhooks/1465950119634407527/...`
   - Authentication: Embedded in webhook URL (no rotation needed)
   - Failure Impact: **MEDIUM** - Jobs run but notifications fail silently
   - No retry mechanism in send-embed.mjs

4. **mcporter (Obsidian Integration)**
   - Used by: 4 jobs (Fact Extraction, Weekly Memory Synthesis, Unity Tool Scout, Extraction Shooter Intel)
   - Location: `/Users/zachgonser/.local/bin/mcporter`
   - Failure Impact: **MEDIUM** - Memory extraction stops but operational jobs continue
   - No validation in jobs that files were written successfully

5. **Web Search (Brave API)**
   - Used by: 3 jobs (Extraction Shooter Intel, Unity Tool Scout, StantonTimes Web RSS)
   - API Key: BSAW1ZNoEGBXmYuZhy_o2MaRfx8yctI (in AGENTS.md)
   - Rate Limits: Unknown (assumed 2000 queries/month on free tier)
   - Failure Impact: **LOW** - Intel gathering degrades, but not critical path

### File System Dependencies
1. **State Files**
   - `/Users/zachgonser/clawd/projects/stanton-times-agent/config/state.json` - StantonTimes job state
   - `/Users/zachgonser/clawd/memory/heartbeat-state.json` - Fact extraction timestamps
   - No file locking mechanism observed
   - Multiple jobs reading/writing same state file

2. **Cookie Database**
   - `/Users/zachgonser/clawd/.credentials/firefox-cookies.sqlite`
   - Copied from Firefox profile daily
   - Potential race condition if Firefox is running during copy

3. **Obsidian Vault**
   - `/Users/zachgonser/Obsidian/VaultZap/` - Expected by mcporter jobs
   - No validation that vault is mounted/accessible
   - iCloud sync could cause file conflicts

## Failure Modes

### 1. Twitter Cookie Expiration (CRITICAL)
**What Breaks:**
- All 4 StantonTimes monitoring jobs fail
- bird-auth.sh extracts empty/invalid cookies
- Jobs run but produce no data

**Why:**
- Firefox session logs out (manual logout, browser update, profile reset)
- Twitter invalidates cookies (security event, password change)
- Cookie DB corruption during copy

**Detection:**
- Jobs report "Could not extract Twitter cookies" error
- Bird CLI returns 401 Unauthorized
- Zero tweets found in monitoring jobs (false negative)

**Current Mitigation:**
- Daily cookie refresh at 4 AM
- Retry logic in refresh script (1 retry with 2s delay)

**Gaps:**
- No validation that extracted cookies are valid
- No alert if refresh fails
- No fallback authentication method

### 2. GitHub API Rate Limiting (HIGH)
**What Breaks:**
- Bloom PR Monitor fails mid-run
- CI Watch can't check workflow runs
- Weekly Digest incomplete

**Why:**
- Jobs run every 15-30 minutes
- Each job makes 1-5 API calls
- Weekly Digest could hit limit with large PR lists

**Detection:**
- `gh` commands return 403 with "rate limit exceeded" message
- Jobs report failures but may not distinguish rate limiting

**Current Mitigation:**
- None observed

**Gaps:**
- No rate limit monitoring
- No exponential backoff
- No job coordination to stay under limits

### 3. Discord Webhook Failure (MEDIUM)
**What Breaks:**
- send-embed.mjs fails silently
- No notifications reach Discord
- Jobs think they succeeded

**Why:**
- Webhook URL invalidated (channel deleted, permissions changed)
- Discord API downtime
- Network issues

**Detection:**
- send-embed.mjs logs "Webhook failed: 404" to stderr
- But calling jobs don't check exit codes
- Failures go unnoticed

**Current Mitigation:**
- None - jobs assume Discord always succeeds

**Gaps:**
- No retry logic in send-embed.mjs
- No fallback notification channel
- No logging of webhook failures

### 4. State File Race Conditions (MEDIUM)
**What Breaks:**
- Duplicate story approvals
- Lost state updates
- Corrupted state.json

**Why:**
- StantonTimes Approval Check runs every 5 minutes
- P0 Monitor runs every 30 minutes
- P1 Keywords runs every 2 hours
- All read/write same state.json simultaneously

**Detection:**
- Duplicate tweet IDs in `seen_tweet_ids`
- Missing entries in `pendingApprovals`
- JSON parse errors

**Current Mitigation:**
- Isolated sessions limit concurrency
- Jobs run at different intervals (reduces collision probability)

**Gaps:**
- No file locking
- No atomic write-and-rename
- No state file backups

### 5. Obsidian/mcporter Failures (MEDIUM)
**What Breaks:**
- Intel reports not written to vault
- Memory extraction silently fails
- Weekly synthesis lost

**Why:**
- Obsidian vault not mounted (iCloud syncing)
- mcporter binary missing/broken
- File permissions changed
- Vault path moved

**Detection:**
- Jobs complete but files don't exist
- mcporter returns non-zero exit code (if checked)

**Current Mitigation:**
- None observed

**Gaps:**
- Jobs don't verify file writes succeeded
- No fallback storage location
- No alerts on write failures

### 6. Network Dependency Cascade (LOW)
**What Breaks:**
- All web-dependent jobs fail simultaneously
- Total system unavailability

**Why:**
- Internet connection lost
- DNS failure
- Firewall changes

**Detection:**
- All jobs fail at same time
- Timeout errors across services

**Current Mitigation:**
- Jobs are isolated (one failure doesn't cascade)
- Different services unlikely to all fail

**Gaps:**
- No network health check before job runs
- No graceful degradation

## State Management Issues

### Race Condition Risks

#### High Risk: StantonTimes state.json
**Concurrent Access Pattern:**
```
00:00 - Approval Check reads/writes
00:05 - Approval Check reads/writes  
00:15 - P0 Monitor reads/writes (potential collision)
00:30 - P1 Keywords reads/writes (potential collision)
```

**Problem:**
1. Job A reads state.json
2. Job B reads state.json (same version)
3. Job A writes updates (adds seen_tweet_id X)
4. Job B writes updates (adds seen_tweet_id Y, overwrites A's changes)
5. Result: Tweet X marked as unseen, could be re-posted

**Severity:** MEDIUM - Duplicate approvals possible, but rare

#### Medium Risk: heartbeat-state.json
**Concurrent Access Pattern:**
- Fact Extraction every 30 minutes
- Morning Briefing daily at 8 AM
- Multiple jobs update `lastChecks` timestamps

**Problem:**
- Less critical than StantonTimes state
- Worst case: missed fact extraction window
- Timestamps could drift if writes collide

**Severity:** LOW - Redundant data, self-correcting

### State File Locations
| File | Purpose | Update Frequency | Backup Strategy |
|------|---------|-----------------|-----------------|
| `stanton-times-agent/config/state.json` | Tweet tracking, approvals | Every 5-30 min | None |
| `memory/heartbeat-state.json` | Fact extraction timing | Every 30 min | None |
| `memory/YYYY-MM-DD.md` | Daily memory logs | Continuous | Git repo |
| `Obsidian/VaultZap/**/*.md` | Intel/reports | Every 2h-weekly | iCloud sync |

### Backup/Recovery Gaps
1. **No state.json backups** - Single point of failure
2. **No corruption detection** - Invalid JSON silently fails
3. **No rollback mechanism** - Can't recover from bad writes
4. **No state versioning** - Can't detect conflicting updates

### Recommendations for State Management
1. **Implement file locking:**
   ```bash
   flock -x /tmp/stanton-state.lock -c "cat state.json | jq '.seen_tweet_ids += [\"new_id\"]' > state.json.tmp && mv state.json.tmp state.json"
   ```

2. **Atomic writes with temp files:**
   ```bash
   # Instead of: echo "$NEW_STATE" > state.json
   # Do: echo "$NEW_STATE" > state.json.tmp && mv state.json.tmp state.json
   ```

3. **Timestamped backups:**
   ```bash
   cp state.json "backups/state-$(date +%s).json"
   find backups/ -mtime +7 -delete  # Keep 7 days
   ```

4. **State validation:**
   ```bash
   if ! jq empty state.json 2>/dev/null; then
     echo "Corrupted state.json, restoring backup"
     cp backups/state-latest.json state.json
   fi
   ```

## Cross-Job Dependencies

### Direct Dependencies (Failure Cascades)

#### StantonTimes Pipeline
```
Refresh Twitter Cookies (4 AM daily)
    ↓ (provides authentication)
    ├─→ P0 Monitor (every 30 min)
    ├─→ P1 Keywords (every 2h)
    ├─→ Creator Monitor (every 2h)
    └─→ Engagement Monitor (every 30 min)
         ↓ (writes to state.json)
    Approval Check (every 5 min)
         ↓ (reads pendingApprovals)
    [User approval via Discord reactions]
         ↓ (executes approved tweets)
    [Tweet posted to @TheStantonTimes]
```

**Cascade Risk:** If "Refresh Twitter Cookies" fails, entire pipeline stops. No fallback.

#### Bloom Monitoring Pipeline
```
GitHub API (always-on)
    ↓
    ├─→ PR Monitor (every 15 min)
    ├─→ CI Watch (every 30 min)
    └─→ Weekly Digest (Sundays 6 PM)
```

**Cascade Risk:** Low - Jobs are independent. GitHub downtime stops all, but no inter-job dependencies.

#### Memory Pipeline
```
Daily Memory Logs (memory/YYYY-MM-DD.md)
    ↓
Fact Extraction (every 30 min)
    ↓ (writes to Obsidian)
mcporter → Obsidian Vault
    ↓
Weekly Memory Synthesis (Sundays 9 AM)
```

**Cascade Risk:** Low - Synthesis can still run if Fact Extraction fails. But memory gaps accumulate.

### Indirect Dependencies (Shared Resources)

#### Shared Resource: state.json
**Jobs Competing:**
- StantonTimes Approval Check (every 5 min)
- P0 Monitor (every 30 min)
- P1 Keywords (every 2h)
- Creator Monitor (every 2h)
- Engagement Monitor (every 30 min)

**Contention:** 5 jobs writing, no locking → race conditions

#### Shared Resource: Obsidian Vault
**Jobs Competing:**
- Fact Extraction (every 30 min)
- Unity Tool Scout (Tue/Fri 11 AM)
- Extraction Shooter Intel (Mon/Thu 10 AM)
- Weekly Memory Synthesis (Sundays 9 AM)

**Contention:** Low - different file paths, time offsets reduce collision

#### Shared Resource: Discord Webhook
**Jobs Using:**
- 10+ jobs post to same webhook
- Rate limit: 30 requests/min per webhook (Discord limit)

**Contention:** Very low - jobs rarely run simultaneously

### Lock/Coordination Mechanisms
**Current:** None
**Needed:**
1. File locking for state.json writes
2. Rate limit coordination for GitHub API
3. Webhook request queuing

## Authentication Weaknesses

### Cookie-Based (Twitter via Bird CLI)
**Mechanism:** Extracts `auth_token` and `ct0` from Firefox cookie database

**Weaknesses:**
1. **No validation of cookie freshness**
   - Cookies copied at 4 AM might be stale by 6 PM
   - No expiration checking before use
   - Jobs assume cookies are valid

2. **Single point of failure**
   - If Firefox profile corrupts, all StantonTimes jobs stop
   - No backup authentication method
   - No secondary cookie source

3. **Manual recovery required**
   - If cookies expire, human must re-login to Firefox
   - No automated re-authentication flow
   - Downtime until manual intervention

4. **Insecure storage**
   - Cookies stored as plaintext SQLite DB
   - No encryption at rest
   - Readable by any process with file access

5. **Race condition during copy**
   - If Firefox is running, `cookies.sqlite` may be locked
   - Copy may get incomplete/corrupted data
   - Retry logic helps but not guaranteed

**Recommended Hardening:**
```bash
# In bird-auth.sh, validate cookies before use:
if [ -z "$AUTH_TOKEN" ] || [ ${#AUTH_TOKEN} -lt 40 ]; then
  echo "Invalid auth_token length, may be expired"
  # Try backup cookie DB or alert
fi

# In refresh script, verify cookies work:
bird --auth-token "$AUTH_TOKEN" --ct0 "$CT0" user-tweets @RobertsSpaceInd -n 1 --json >/dev/null 2>&1
if [ $? -ne 0 ]; then
  openclaw "❌ CRITICAL: Refreshed Twitter cookies are INVALID. Manual re-login required."
fi
```

### Token-Based (GitHub CLI)
**Mechanism:** GitHub CLI uses `gho_****` token stored in macOS keyring

**Weaknesses:**
1. **Token expiration not monitored**
   - GitHub tokens can expire (if set with expiration)
   - No proactive expiration checking
   - Jobs fail silently when token expires

2. **Scope drift risk**
   - Token has `workflow` scope (powerful)
   - If token is compromised, attacker can modify GitHub Actions
   - No scope minimization

3. **No rotation policy**
   - Token appears to be long-lived
   - No automated rotation
   - Breach would require manual revocation

**Recommended Hardening:**
```bash
# Before critical gh operations:
gh auth status --hostname github.com >/dev/null 2>&1 || {
  openclaw "❌ GitHub authentication invalid, token may be expired"
  exit 1
}

# Periodic token validation (weekly cron):
gh api /user >/dev/null 2>&1 || openclaw "⚠️ GitHub token health check failed"
```

### API Key-Based (Brave Search)
**Mechanism:** API key in AGENTS.md config

**Weaknesses:**
1. **Key stored in plaintext**
   - BSAW1ZNoEGBXmYuZhy_o2MaRfx8yctI visible in config
   - Committed to git (if AGENTS.md is versioned)
   - No encryption

2. **No rate limit tracking**
   - Unknown quota (likely 2000 queries/month)
   - No usage monitoring
   - Could hit limit mid-month, jobs fail

3. **No key rotation**
   - Static key, no expiration
   - If leaked, needs manual regeneration

**Recommended Hardening:**
- Move API key to environment variable or macOS keychain
- Implement query counter in heartbeat-state.json
- Set up alert when 80% quota reached

### Webhook-Based (Discord)
**Mechanism:** Webhook URL contains secret token

**Weaknesses:**
1. **URL is the secret**
   - Full URL in `.env` file: `https://discord.com/api/webhooks/1465950119634407527/R8WHqL42kj69H2XzWzUmYFZ9xwCbmdc44IOjA0BvAsqrvamotp2sd5jzVYpWtkS91DMh`
   - Stored in plaintext
   - If leaked, anyone can post to channel

2. **No expiration/rotation**
   - Webhook URLs don't expire
   - Once leaked, must manually regenerate

3. **No request signing**
   - Discord can't verify requests came from authorized source
   - Attacker with URL can spam channel

**Recommended Hardening:**
- Store webhook URL in macOS keychain instead of .env
- Use Discord bot token + channel ID instead (allows token rotation)
- Set up rate limiting on Discord side

## Recommended Hardening

### Immediate (P0) - Critical Reliability Fixes

#### 1. Twitter Cookie Validation
**Problem:** Jobs assume cookies are valid without checking

**Fix:**
```bash
# Add to bird-auth.sh after cookie extraction:
bird --auth-token "$AUTH_TOKEN" --ct0 "$CT0" user-tweets @RobertsSpaceInd -n 1 --json >/dev/null 2>&1
if [ $? -ne 0 ]; then
  openclaw "❌ CRITICAL: Twitter cookies are invalid. Manual Firefox re-login required."
  exit 1
fi
```

**Impact:** Prevents 4 StantonTimes jobs from failing silently

#### 2. State File Atomic Writes
**Problem:** Race conditions on state.json writes

**Fix:**
```bash
# Replace all state.json writes with:
NEW_STATE=$(jq '.seen_tweet_ids += ["new_id"]' state.json)
echo "$NEW_STATE" > state.json.tmp
mv state.json.tmp state.json  # Atomic rename
```

**Impact:** Eliminates duplicate approvals, lost updates

#### 3. Discord Webhook Error Handling
**Problem:** send-embed.mjs fails silently

**Fix in send-embed.mjs:**
```javascript
if (!res.ok) {
  const text = await res.text();
  console.error(`❌ Webhook failed: ${res.status} ${text}`);
  process.exit(1);  // Already present, ensure jobs check exit code
}
```

**Fix in cron jobs:**
```bash
# Change from:
node config/send-embed.mjs --title "..." --description "..."

# To:
if ! node config/send-embed.mjs --title "..." --description "..."; then
  openclaw "❌ Discord notification failed for [job name]"
fi
```

**Impact:** Alerts on notification failures instead of silent drops

#### 4. State File Backups
**Problem:** No recovery from corrupted state.json

**Fix - Add to each StantonTimes job before state writes:**
```bash
# Backup before write
cp state.json "state-backup-$(date +%s).json"

# Clean old backups (keep 48h)
find . -name "state-backup-*.json" -mtime +2 -delete

# Validate after write
if ! jq empty state.json 2>/dev/null; then
  echo "❌ State file corrupted, restoring latest backup"
  cp $(ls -t state-backup-*.json | head -1) state.json
fi
```

**Impact:** Can recover from corruption, prevents total data loss

### Short-Term (P1) - Operational Resilience

#### 5. GitHub API Rate Limit Monitoring
**Problem:** Could hit 5000 req/hr limit without warning

**Fix - Add new cron job:**
```json
{
  "name": "GitHub Rate Limit Monitor",
  "schedule": "*/15 * * * *",
  "payload": {
    "message": "Check GitHub API rate limit: gh api rate_limit --jq '.rate.remaining'. If <500, alert to Discord."
  }
}
```

**Impact:** Proactive warning before Bloom monitoring stops

#### 6. Dependency Health Checks
**Problem:** External tools may break without detection

**Fix - Add to Morning Briefing job:**
```bash
# Validate dependencies
MISSING=""
command -v gh >/dev/null || MISSING="$MISSING GitHub-CLI"
command -v bird >/dev/null || MISSING="$MISSING Bird-CLI"
command -v mcporter >/dev/null || MISSING="$MISSING mcporter"

if [ -n "$MISSING" ]; then
  openclaw "❌ Missing dependencies: $MISSING"
fi

# Validate auth
gh auth status >/dev/null 2>&1 || openclaw "⚠️ GitHub auth invalid"
test -f ~/.clawd/.credentials/firefox-cookies.sqlite || openclaw "⚠️ Twitter cookies missing"
```

**Impact:** Daily validation catches broken dependencies

#### 7. Cookie Expiration Alerting
**Problem:** Cookie refresh runs but doesn't verify validity

**Fix - Update "Refresh Twitter Cookies" job:**
```bash
# After refresh-twitter-cookies.sh
if ! /Users/zachgonser/clawd/scripts/bird-auth.sh user-tweets @RobertsSpaceInd -n 1 --json >/dev/null 2>&1; then
  openclaw "❌ URGENT: Twitter cookie refresh succeeded but cookies are INVALID. Manual Firefox login required NOW."
  # Post to Discord with high priority
  node ~/clawd/projects/stanton-times-agent/config/send-embed.mjs \
    --title "🚨 StantonTimes Auth Failure" \
    --description "Twitter cookies are invalid. All monitoring jobs will fail. Please log in to Firefox on @TheStantonTimes account." \
    --color "0xFF0000" \
    --ping "956203522624462918"
fi
```

**Impact:** Immediate notification of auth failures

#### 8. File Locking for State Writes
**Problem:** Concurrent state.json access causes corruption

**Fix - Wrap all state.json operations:**
```bash
# Install flock if needed: brew install util-linux

# Before any state.json read/write:
flock -x /tmp/stanton-state.lock -c '
  NEW_STATE=$(jq ".seen_tweet_ids += [\"$TWEET_ID\"]" state.json)
  echo "$NEW_STATE" > state.json.tmp
  mv state.json.tmp state.json
'
```

**Impact:** Eliminates race conditions, ensures data integrity

### Long-Term (P2) - Architecture Improvements

#### 9. Migrate Twitter Auth to OAuth
**Problem:** Cookie scraping is fragile, insecure

**Fix:**
- Use official Twitter API v2 with OAuth 2.0
- Store refresh token in macOS keychain
- Automated token refresh (no manual login needed)

**Effort:** Medium (requires Twitter Developer account, code changes)

**Impact:** Eliminates cookie expiration failures, removes Firefox dependency

#### 10. Centralized State Management
**Problem:** state.json is a single file with no versioning

**Fix:**
- Migrate to SQLite database for state
- Add transaction support (atomic read/modify/write)
- Enable concurrent access with row-level locking
- Backup via WAL mode

**Effort:** High (requires rewriting state logic)

**Impact:** Eliminates race conditions permanently, enables audit trail

#### 11. Webhook Retry with Exponential Backoff
**Problem:** Transient Discord failures drop notifications

**Fix in send-embed.mjs:**
```javascript
async function sendWithRetry(payload, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    const res = await fetch(WEBHOOK_URL, { method: 'POST', body: JSON.stringify(payload) });
    if (res.ok) return true;
    
    if (i < maxRetries - 1) {
      await new Promise(r => setTimeout(r, 1000 * Math.pow(2, i))); // 1s, 2s, 4s
    }
  }
  return false;
}
```

**Effort:** Low (code change only)

**Impact:** Tolerates transient Discord API failures

#### 12. Obsidian Write Verification
**Problem:** mcporter failures go undetected

**Fix - After all mcporter writes:**
```bash
VAULT_PATH="/Users/zachgonser/Obsidian/VaultZap/📚 Knowledge/Intel/report.md"

mcporter write "$VAULT_PATH" < report.md
if [ $? -ne 0 ] || [ ! -f "$VAULT_PATH" ]; then
  # Fallback to local filesystem
  mkdir -p ~/clawd/memory/obsidian-fallback
  cp report.md ~/clawd/memory/obsidian-fallback/$(date +%s)-report.md
  openclaw "⚠️ Obsidian write failed, saved to fallback location"
fi
```

**Effort:** Low (add verification after each mcporter call)

**Impact:** No lost intel reports, local backup available

#### 13. Network Connectivity Pre-Check
**Problem:** Jobs fail if network is down, waste resources

**Fix - Add to start of network-dependent jobs:**
```bash
if ! ping -c 1 -t 5 github.com >/dev/null 2>&1; then
  echo "Network unreachable, skipping job"
  exit 0  # Don't mark as failure, just skip
fi
```

**Effort:** Low (add to job templates)

**Impact:** Faster job completion, clearer error signals

---

## Summary Matrix

| Dependency | Criticality | Current Auth | Failure Mode | Detection | Mitigation | Hardening Priority |
|------------|-------------|--------------|--------------|-----------|------------|-------------------|
| GitHub CLI | HIGH | Token (keyring) | Rate limit, token expiry | Silent fail | None | P1 - Add monitoring |
| Bird CLI | CRITICAL | Cookie scraping | Cookie expiration | Silent fail | Daily refresh | P0 - Add validation |
| Discord Webhook | MEDIUM | URL secret | Service down, URL revoked | Silent fail | None | P0 - Add retries |
| mcporter | MEDIUM | N/A | Binary missing, vault unmounted | Silent fail | None | P2 - Add verification |
| Brave Search | LOW | API key | Rate limit, key revoked | Silent fail | None | P2 - Add quota tracking |
| state.json | CRITICAL | N/A | Race conditions, corruption | Parse errors | None | P0 - Atomic writes |
| Firefox Profile | CRITICAL | N/A | Profile corruption, logout | Copy fails | 1 retry | P1 - Add backups |

**Highest Risk Items:**
1. **Twitter cookie expiration** - No validation, entire StantonTimes pipeline fails
2. **state.json race conditions** - No locking, data corruption possible
3. **Discord webhook silent failures** - Jobs assume success, notifications lost
4. **GitHub rate limiting** - No monitoring, monitoring could stop unexpectedly

**Recommended Immediate Actions:**
1. Add cookie validation to bird-auth.sh (15 min effort)
2. Implement atomic writes for state.json (30 min effort)
3. Add Discord webhook error handling (20 min effort)
4. Set up state.json backups (15 min effort)

**Total Estimated Hardening Effort:**
- P0 fixes: 2-3 hours
- P1 fixes: 4-6 hours
- P2 fixes: 2-3 days (architectural changes)
