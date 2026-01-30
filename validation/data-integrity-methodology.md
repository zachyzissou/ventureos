# Data Integrity Validation Methodology

**Created:** 2026-01-30  
**Layer:** Data Integrity (Section 2 of Validation Architecture)  
**Status:** 🟢 Complete - Ready for Implementation  
**Priority:** P0 - Critical Infrastructure

---

## Executive Summary

This methodology provides complete validation, detection, and self-healing for all data layer components:
- **Memory System:** Daily logs, git commits, file integrity
- **Obsidian Vault:** Sync health, extraction validation, corruption detection
- **State Files:** JSON validation, schema compliance, size limits
- **Backups:** Verification, restoration testing, retention
- **Git Repository:** Uncommitted changes, push failures, branch health

**Goal:** Zero data loss, automatic recovery from corruption, 99.9%+ data integrity.

---

## Table of Contents

1. [Validation Architecture](#validation-architecture)
2. [Memory System Integrity](#memory-system-integrity)
3. [Obsidian Vault Health](#obsidian-vault-health)
4. [State File Validation](#state-file-validation)
5. [Backup Verification](#backup-verification)
6. [Git Repository Health](#git-repository-health)
7. [Self-Healing Actions](#self-healing-actions)
8. [Implementation Checklist](#implementation-checklist)
9. [Validation Scripts](#validation-scripts)

---

## Validation Architecture

### Core Principles

```
┌─────────────────────────────────────────────────────┐
│           Data Integrity Validator                  │
│                                                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐        │
│  │  Detect  │→ │ Validate │→ │   Heal   │        │
│  └──────────┘  └──────────┘  └──────────┘        │
│       ↓              ↓              ↓              │
│   Scan data → Check rules → Auto-fix              │
└─────────────────────────────────────────────────────┘
         ↓                    ↓                ↓
    ┌────────┐          ┌─────────┐     ┌─────────┐
    │ Memory │          │ Obsidian│     │   Git   │
    │ State  │          │ Backups │     │  Files  │
    └────────┘          └─────────┘     └─────────┘
```

### Validation Frequency

| Component | Check Frequency | Criticality | Auto-Heal |
|-----------|----------------|-------------|-----------|
| Memory daily logs | 5 minutes | P0 | Yes |
| Git uncommitted | 15 minutes | P1 | Yes |
| State files | 5 minutes | P0 | Yes |
| Obsidian sync | 30 minutes | P1 | Yes |
| Backups | 1 hour | P0 | Yes |
| Git push status | 1 hour | P2 | Yes |

### Severity Levels

- **P0 - Critical:** Data loss imminent, auto-heal + immediate alert
- **P1 - High:** Data integrity at risk, auto-heal + alert within 15min
- **P2 - Medium:** Degraded state, auto-heal + alert within 1hr
- **P3 - Low:** Potential issue, auto-heal + daily digest

---

## Memory System Integrity

### Validation Rules

#### 1. Daily Log Existence
**Rule:** `memory/YYYY-MM-DD.md` must exist for current date  
**Check Frequency:** Every 5 minutes  
**Severity:** P0

```bash
# Validation
DAILY_LOG="memory/$(date +%Y-%m-%d).md"
if [ ! -f "$DAILY_LOG" ]; then
    echo "FAIL: Daily log missing: $DAILY_LOG"
    exit 1
fi
```

**Auto-Heal:** Create from template if missing

#### 2. Daily Log Format
**Rule:** Must start with `# YYYY-MM-DD` header  
**Check Frequency:** Every 5 minutes  
**Severity:** P1

```bash
# Validation
DAILY_LOG="memory/$(date +%Y-%m-%d).md"
FIRST_LINE=$(head -n 1 "$DAILY_LOG")
EXPECTED="# $(date +%Y-%m-%d)"

if [ "$FIRST_LINE" != "$EXPECTED" ]; then
    echo "FAIL: Invalid header in $DAILY_LOG"
    echo "Expected: $EXPECTED"
    echo "Got: $FIRST_LINE"
    exit 1
fi
```

**Auto-Heal:** Fix header or recreate from template

#### 3. Memory File Size
**Rule:** Daily log should not exceed 50KB (too much context burn)  
**Check Frequency:** Every 30 minutes  
**Severity:** P2

```bash
# Validation
DAILY_LOG="memory/$(date +%Y-%m-%d).md"
SIZE=$(stat -f%z "$DAILY_LOG" 2>/dev/null || stat -c%s "$DAILY_LOG" 2>/dev/null)
MAX_SIZE=51200  # 50KB

if [ "$SIZE" -gt "$MAX_SIZE" ]; then
    echo "WARN: Daily log too large: $SIZE bytes (max $MAX_SIZE)"
    exit 1
fi
```

**Auto-Heal:** Archive old entries, consolidate

#### 4. Git Commit Status
**Rule:** Memory changes must be committed within 1 hour  
**Check Frequency:** Every 15 minutes  
**Severity:** P1

```bash
# Validation
cd /Users/zachgonser/clawd

# Check for uncommitted changes in memory/
UNCOMMITTED=$(git status --porcelain memory/ | wc -l)

if [ "$UNCOMMITTED" -gt 0 ]; then
    # Check age of changes
    LAST_COMMIT=$(git log -1 --format=%ct memory/ 2>/dev/null || echo 0)
    NOW=$(date +%s)
    AGE=$((NOW - LAST_COMMIT))
    
    if [ "$AGE" -gt 3600 ]; then
        echo "FAIL: Uncommitted memory changes >1 hour old"
        exit 1
    fi
fi
```

**Auto-Heal:** Auto-commit with timestamp

#### 5. Memory File Corruption
**Rule:** Files must be valid UTF-8 markdown  
**Check Frequency:** Every 30 minutes  
**Severity:** P0

```bash
# Validation
DAILY_LOG="memory/$(date +%Y-%m-%d).md"

# Check UTF-8 validity
if ! iconv -f UTF-8 -t UTF-8 "$DAILY_LOG" > /dev/null 2>&1; then
    echo "FAIL: File encoding corrupted: $DAILY_LOG"
    exit 1
fi

# Check for null bytes (corruption indicator)
if grep -q $'\0' "$DAILY_LOG"; then
    echo "FAIL: Null bytes detected in $DAILY_LOG"
    exit 1
fi
```

**Auto-Heal:** Restore from git history or backup

### Memory System Schema

```json
{
  "daily_log": {
    "path": "memory/YYYY-MM-DD.md",
    "required": true,
    "format": "markdown",
    "encoding": "UTF-8",
    "max_size_bytes": 51200,
    "header_format": "# YYYY-MM-DD",
    "sections": ["## Sessions", "## Events", "## Notes"],
    "git_tracked": true,
    "backup_required": true
  },
  "long_term_memory": {
    "path": "MEMORY.md",
    "required": true,
    "format": "markdown",
    "security": "main_session_only",
    "max_size_bytes": 102400,
    "git_tracked": true
  }
}
```

### Corruption Detection Methods

#### Checksum Validation
```bash
# Generate checksums for all memory files
find memory/ -name "*.md" -type f -exec shasum -a 256 {} \; > memory/.checksums

# Verify checksums
shasum -c memory/.checksums || echo "Corruption detected!"
```

#### Structure Testing
```bash
# Validate markdown structure
for file in memory/*.md; do
    # Must have at least one header
    if ! grep -q "^#" "$file"; then
        echo "Invalid structure: $file (no headers)"
    fi
    
    # Must not have >10 consecutive blank lines (likely corruption)
    if awk '/^$/{n++}n>10{exit 1}' "$file"; then
        echo "Suspicious blank lines: $file"
    fi
done
```

#### Content Validation
```bash
# Check for suspicious patterns
DAILY_LOG="memory/$(date +%Y-%m-%d).md"

# Should contain at least one timestamp today
if ! grep -q "$(date +%Y-%m-%d)" "$DAILY_LOG"; then
    echo "No activity logged today"
fi

# Should not contain binary data
if file "$DAILY_LOG" | grep -qv "text"; then
    echo "Binary data detected in text file"
fi
```

---

## Obsidian Vault Health

### Validation Rules

#### 1. Vault Sync Status
**Rule:** Vault must sync successfully within last 30 minutes  
**Check Frequency:** Every 30 minutes  
**Severity:** P1

```bash
# Validation (assumes Obsidian sync plugin creates .obsidian/sync.json)
VAULT_PATH="/Users/zachgonser/Obsidian/VaultZap"
SYNC_FILE="$VAULT_PATH/.obsidian/sync.json"

if [ -f "$SYNC_FILE" ]; then
    LAST_SYNC=$(jq -r '.lastSync' "$SYNC_FILE")
    NOW=$(date +%s)
    SYNC_AGE=$((NOW - LAST_SYNC))
    
    if [ "$SYNC_AGE" -gt 1800 ]; then
        echo "FAIL: Vault not synced in 30+ minutes"
        exit 1
    fi
else
    echo "WARN: Sync status file missing"
fi
```

**Auto-Heal:** Trigger manual sync, restart Obsidian if needed

#### 2. Extraction File Existence
**Rule:** Extracted facts must be written to vault  
**Check Frequency:** Every 1 hour  
**Severity:** P2

```bash
# Validation
VAULT_PATH="/Users/zachgonser/Obsidian/VaultZap"
EXTRACTION_PATH="$VAULT_PATH/life/extractions"

# Check if extractions directory exists
if [ ! -d "$EXTRACTION_PATH" ]; then
    echo "FAIL: Extractions directory missing"
    exit 1
fi

# Check for recent extraction files
RECENT=$(find "$EXTRACTION_PATH" -name "*.md" -mtime -1 | wc -l)
if [ "$RECENT" -eq 0 ]; then
    echo "WARN: No extractions in last 24 hours"
fi
```

**Auto-Heal:** Re-run extraction process

#### 3. File Corruption Detection
**Rule:** All vault files must be valid markdown  
**Check Frequency:** Every 1 hour  
**Severity:** P0

```bash
# Validation
VAULT_PATH="/Users/zachgonser/Obsidian/VaultZap"

# Check for corrupted files
find "$VAULT_PATH" -name "*.md" -type f | while read file; do
    # Check UTF-8 validity
    if ! iconv -f UTF-8 -t UTF-8 "$file" > /dev/null 2>&1; then
        echo "FAIL: Corrupted file: $file"
        exit 1
    fi
    
    # Check for null bytes
    if grep -q $'\0' "$file"; then
        echo "FAIL: Null bytes in: $file"
        exit 1
    fi
done
```

**Auto-Heal:** Restore from Obsidian sync history or git

#### 4. Vault Size Monitoring
**Rule:** Vault should not grow >10% per day (anomaly detection)  
**Check Frequency:** Daily  
**Severity:** P2

```bash
# Validation
VAULT_PATH="/Users/zachgonser/Obsidian/VaultZap"
STATE_FILE="validation/vault-size-history.json"

CURRENT_SIZE=$(du -sk "$VAULT_PATH" | awk '{print $1}')

# Load previous size
if [ -f "$STATE_FILE" ]; then
    PREV_SIZE=$(jq -r '.size' "$STATE_FILE")
    GROWTH=$(echo "scale=2; ($CURRENT_SIZE - $PREV_SIZE) / $PREV_SIZE * 100" | bc)
    
    if (( $(echo "$GROWTH > 10" | bc -l) )); then
        echo "WARN: Vault grew ${GROWTH}% (investigating...)"
    fi
fi

# Update state
echo "{\"size\": $CURRENT_SIZE, \"timestamp\": $(date +%s)}" > "$STATE_FILE"
```

**Auto-Heal:** Alert for investigation, check for bulk imports

#### 5. Obsidian Plugin Health
**Rule:** Critical plugins must be enabled and functional  
**Check Frequency:** Every 1 hour  
**Severity:** P1

```bash
# Validation
VAULT_PATH="/Users/zachgonser/Obsidian/VaultZap"
PLUGINS_FILE="$VAULT_PATH/.obsidian/community-plugins.json"

CRITICAL_PLUGINS=("obsidian-git" "dataview" "templater")

for plugin in "${CRITICAL_PLUGINS[@]}"; do
    if ! jq -e ".[] | select(. == \"$plugin\")" "$PLUGINS_FILE" > /dev/null; then
        echo "FAIL: Critical plugin disabled: $plugin"
        exit 1
    fi
done
```

**Auto-Heal:** Re-enable plugins, restart Obsidian

### Obsidian Schema

```json
{
  "vault": {
    "path": "/Users/zachgonser/Obsidian/VaultZap",
    "sync_required": true,
    "max_sync_age_seconds": 1800,
    "critical_plugins": ["obsidian-git", "dataview", "templater"],
    "critical_paths": [
      "life/extractions",
      "life/areas/systems",
      "life/daily"
    ]
  },
  "extraction": {
    "output_path": "life/extractions",
    "min_daily_extractions": 1,
    "max_file_size_kb": 100,
    "required_frontmatter": ["created", "source"]
  }
}
```

---

## State File Validation

### Validation Rules

#### 1. JSON Syntax Validity
**Rule:** All state files must be valid JSON  
**Check Frequency:** Every 5 minutes  
**Severity:** P0

```bash
# Validation
STATE_FILES=(
    "state.json"
    "memory/heartbeat-state.json"
    "validation/vault-size-history.json"
)

for file in "${STATE_FILES[@]}"; do
    if [ -f "$file" ]; then
        if ! jq empty "$file" 2>/dev/null; then
            echo "FAIL: Invalid JSON in $file"
            exit 1
        fi
    fi
done
```

**Auto-Heal:** Restore from backup or git history

#### 2. Schema Compliance
**Rule:** State files must match expected schema  
**Check Frequency:** Every 15 minutes  
**Severity:** P1

```bash
# Validation for heartbeat-state.json
STATE_FILE="memory/heartbeat-state.json"

if [ -f "$STATE_FILE" ]; then
    # Check required fields
    if ! jq -e '.lastChecks' "$STATE_FILE" > /dev/null; then
        echo "FAIL: Missing 'lastChecks' in $STATE_FILE"
        exit 1
    fi
    
    # Validate field types
    if ! jq -e '.lastChecks | type == "object"' "$STATE_FILE" > /dev/null; then
        echo "FAIL: 'lastChecks' must be object in $STATE_FILE"
        exit 1
    fi
fi
```

**Auto-Heal:** Merge with valid schema, preserve data

#### 3. State File Size Limits
**Rule:** State files should not exceed 10MB  
**Check Frequency:** Every 30 minutes  
**Severity:** P2

```bash
# Validation
MAX_SIZE=10485760  # 10MB

for file in state.json memory/heartbeat-state.json; do
    if [ -f "$file" ]; then
        SIZE=$(stat -f%z "$file" 2>/dev/null || stat -c%s "$file" 2>/dev/null)
        
        if [ "$SIZE" -gt "$MAX_SIZE" ]; then
            echo "FAIL: State file too large: $file ($SIZE bytes)"
            exit 1
        fi
    fi
done
```

**Auto-Heal:** Archive old data, compact state

#### 4. Timestamp Freshness
**Rule:** State timestamps should not be >7 days old  
**Check Frequency:** Daily  
**Severity:** P2

```bash
# Validation
STATE_FILE="memory/heartbeat-state.json"

if [ -f "$STATE_FILE" ]; then
    # Check each timestamp
    jq -r '.lastChecks | to_entries[] | "\(.key)=\(.value)"' "$STATE_FILE" | while IFS='=' read key value; do
        if [ "$value" != "null" ]; then
            NOW=$(date +%s)
            AGE=$((NOW - value))
            
            if [ "$AGE" -gt 604800 ]; then
                echo "WARN: Stale timestamp for $key (>7 days)"
            fi
        fi
    done
fi
```

**Auto-Heal:** Reset stale timestamps, trigger refresh

#### 5. Data Type Validation
**Rule:** Field values must match expected types  
**Check Frequency:** Every 15 minutes  
**Severity:** P1

```bash
# Validation
STATE_FILE="memory/heartbeat-state.json"

if [ -f "$STATE_FILE" ]; then
    # All timestamps should be numbers or null
    INVALID=$(jq -r '.lastChecks | to_entries[] | select(.value != null and (.value | type != "number")) | .key' "$STATE_FILE")
    
    if [ -n "$INVALID" ]; then
        echo "FAIL: Invalid timestamp types in $STATE_FILE: $INVALID"
        exit 1
    fi
fi
```

**Auto-Heal:** Convert to correct types, log warnings

### State File Schema

```json
{
  "heartbeat_state": {
    "path": "memory/heartbeat-state.json",
    "schema": {
      "lastChecks": {
        "type": "object",
        "values": {
          "type": ["number", "null"],
          "description": "Unix timestamp or null"
        }
      }
    },
    "max_size_bytes": 10485760,
    "backup_required": true
  },
  "state": {
    "path": "state.json",
    "schema": {
      "version": {"type": "string"},
      "lastUpdate": {"type": "number"},
      "data": {"type": "object"}
    },
    "max_size_bytes": 10485760,
    "backup_required": true
  }
}
```

---

## Backup Verification

### Validation Rules

#### 1. Backup Existence
**Rule:** Daily backup must exist for current date  
**Check Frequency:** Every 1 hour  
**Severity:** P0

```bash
# Validation
BACKUP_DIR="$HOME/backups/clawd"
TODAY=$(date +%Y-%m-%d)
BACKUP_FILE="$BACKUP_DIR/clawd-$TODAY.tar.gz"

if [ ! -f "$BACKUP_FILE" ]; then
    # Check if today's backup should exist (after 1 AM)
    HOUR=$(date +%H)
    if [ "$HOUR" -ge 1 ]; then
        echo "FAIL: Daily backup missing: $BACKUP_FILE"
        exit 1
    fi
fi
```

**Auto-Heal:** Trigger backup creation

#### 2. Backup Completeness
**Rule:** Backup must include all critical paths  
**Check Frequency:** Every 6 hours  
**Severity:** P0

```bash
# Validation
BACKUP_FILE="$HOME/backups/clawd/clawd-$(date +%Y-%m-%d).tar.gz"

REQUIRED_PATHS=(
    "memory/"
    "MEMORY.md"
    "state.json"
    "validation/"
)

if [ -f "$BACKUP_FILE" ]; then
    for path in "${REQUIRED_PATHS[@]}"; do
        if ! tar -tzf "$BACKUP_FILE" | grep -q "$path"; then
            echo "FAIL: Backup missing path: $path"
            exit 1
        fi
    done
fi
```

**Auto-Heal:** Recreate backup with all paths

#### 3. Backup Integrity
**Rule:** Backup archive must be valid and extractable  
**Check Frequency:** Every 6 hours  
**Severity:** P0

```bash
# Validation
BACKUP_FILE="$HOME/backups/clawd/clawd-$(date +%Y-%m-%d).tar.gz"

if [ -f "$BACKUP_FILE" ]; then
    # Test archive integrity
    if ! gzip -t "$BACKUP_FILE" 2>/dev/null; then
        echo "FAIL: Backup archive corrupted: $BACKUP_FILE"
        exit 1
    fi
    
    # Test extraction (to temp dir)
    TEMP_DIR=$(mktemp -d)
    if ! tar -xzf "$BACKUP_FILE" -C "$TEMP_DIR" 2>/dev/null; then
        echo "FAIL: Cannot extract backup: $BACKUP_FILE"
        rm -rf "$TEMP_DIR"
        exit 1
    fi
    rm -rf "$TEMP_DIR"
fi
```

**Auto-Heal:** Recreate backup

#### 4. Backup Recency
**Rule:** Last backup should not be >24 hours old  
**Check Frequency:** Every 1 hour  
**Severity:** P0

```bash
# Validation
BACKUP_DIR="$HOME/backups/clawd"
LATEST_BACKUP=$(ls -t "$BACKUP_DIR"/clawd-*.tar.gz 2>/dev/null | head -n 1)

if [ -n "$LATEST_BACKUP" ]; then
    BACKUP_AGE=$(( $(date +%s) - $(stat -f%m "$LATEST_BACKUP" 2>/dev/null || stat -c%Y "$LATEST_BACKUP" 2>/dev/null) ))
    
    if [ "$BACKUP_AGE" -gt 86400 ]; then
        echo "FAIL: Last backup is >24 hours old"
        exit 1
    fi
else
    echo "FAIL: No backups found"
    exit 1
fi
```

**Auto-Heal:** Trigger immediate backup

#### 5. Backup Restoration Test
**Rule:** Random backup restoration test monthly  
**Check Frequency:** Monthly (1st of month)  
**Severity:** P1

```bash
# Validation (run monthly)
BACKUP_DIR="$HOME/backups/clawd"
TEST_BACKUP=$(ls -t "$BACKUP_DIR"/clawd-*.tar.gz 2>/dev/null | head -n 1)

if [ -n "$TEST_BACKUP" ]; then
    TEMP_DIR=$(mktemp -d)
    
    # Extract backup
    tar -xzf "$TEST_BACKUP" -C "$TEMP_DIR"
    
    # Validate critical files exist
    for file in memory MEMORY.md state.json; do
        if [ ! -e "$TEMP_DIR/$file" ]; then
            echo "FAIL: Backup missing critical file: $file"
            rm -rf "$TEMP_DIR"
            exit 1
        fi
    done
    
    # Cleanup
    rm -rf "$TEMP_DIR"
    echo "SUCCESS: Backup restoration test passed"
else
    echo "FAIL: No backup to test"
    exit 1
fi
```

**Auto-Heal:** Alert for manual investigation

### Backup Schema

```json
{
  "backup": {
    "directory": "$HOME/backups/clawd",
    "filename_pattern": "clawd-YYYY-MM-DD.tar.gz",
    "max_age_hours": 24,
    "compression": "gzip",
    "required_paths": [
      "memory/",
      "MEMORY.md",
      "state.json",
      "validation/"
    ],
    "retention_days": 30,
    "restoration_test_frequency": "monthly"
  }
}
```

---

## Git Repository Health

### Validation Rules

#### 1. Uncommitted Changes Detection
**Rule:** No uncommitted changes >1 hour old  
**Check Frequency:** Every 15 minutes  
**Severity:** P1

```bash
# Validation
cd /Users/zachgonser/clawd

UNCOMMITTED=$(git status --porcelain | wc -l)

if [ "$UNCOMMITTED" -gt 0 ]; then
    # Get oldest uncommitted file
    OLDEST_MODIFIED=$(git status --porcelain | awk '{print $2}' | head -n 1)
    LAST_COMMIT=$(git log -1 --format=%ct -- "$OLDEST_MODIFIED" 2>/dev/null || echo 0)
    NOW=$(date +%s)
    AGE=$((NOW - LAST_COMMIT))
    
    if [ "$AGE" -gt 3600 ]; then
        echo "FAIL: Uncommitted changes >1 hour old"
        echo "Uncommitted files: $UNCOMMITTED"
        exit 1
    fi
fi
```

**Auto-Heal:** Auto-commit with timestamp message

#### 2. Push Failure Detection
**Rule:** Local commits should be pushed within 2 hours  
**Check Frequency:** Every 30 minutes  
**Severity:** P2

```bash
# Validation
cd /Users/zachgonser/clawd

# Check if local is ahead of remote
AHEAD=$(git rev-list @{u}..HEAD --count 2>/dev/null || echo 0)

if [ "$AHEAD" -gt 0 ]; then
    # Get age of oldest unpushed commit
    OLDEST_COMMIT=$(git rev-list @{u}..HEAD | tail -n 1)
    COMMIT_TIME=$(git show -s --format=%ct "$OLDEST_COMMIT")
    NOW=$(date +%s)
    AGE=$((NOW - COMMIT_TIME))
    
    if [ "$AGE" -gt 7200 ]; then
        echo "FAIL: Unpushed commits >2 hours old"
        echo "Commits ahead: $AHEAD"
        exit 1
    fi
fi
```

**Auto-Heal:** Auto-push to remote

#### 3. Branch Health
**Rule:** Should be on main/master branch, not detached HEAD  
**Check Frequency:** Every 30 minutes  
**Severity:** P2

```bash
# Validation
cd /Users/zachgonser/clawd

BRANCH=$(git branch --show-current)

if [ -z "$BRANCH" ]; then
    echo "FAIL: Detached HEAD state"
    exit 1
fi

if [[ "$BRANCH" != "main" && "$BRANCH" != "master" ]]; then
    echo "WARN: On non-main branch: $BRANCH"
fi
```

**Auto-Heal:** Switch to main/master if safe

#### 4. Repository Corruption
**Rule:** Git repository should not be corrupted  
**Check Frequency:** Daily  
**Severity:** P0

```bash
# Validation
cd /Users/zachgonser/clawd

# Check for corruption
if ! git fsck --full --no-progress 2>&1 | grep -q "^$"; then
    ERRORS=$(git fsck --full --no-progress 2>&1)
    echo "FAIL: Git repository corruption detected"
    echo "$ERRORS"
    exit 1
fi
```

**Auto-Heal:** Alert for manual recovery

#### 5. Remote Connectivity
**Rule:** Should be able to fetch from remote  
**Check Frequency:** Every 1 hour  
**Severity:** P1

```bash
# Validation
cd /Users/zachgonser/clawd

if ! git fetch --dry-run 2>&1 | grep -q "^$"; then
    echo "FAIL: Cannot connect to git remote"
    exit 1
fi
```

**Auto-Heal:** Retry with backoff, check network

### Git Repository Schema

```json
{
  "repository": {
    "path": "/Users/zachgonser/clawd",
    "primary_branch": "main",
    "max_uncommitted_age_seconds": 3600,
    "max_unpushed_age_seconds": 7200,
    "critical_paths": [
      "memory/",
      "MEMORY.md",
      "state.json"
    ],
    "auto_commit": true,
    "auto_push": true,
    "fsck_frequency": "daily"
  }
}
```

---

## Self-Healing Actions

### Auto-Commit Memory Changes

**Trigger:** Uncommitted changes in memory/ >1 hour old  
**Action:** Automatic git commit with timestamp

```bash
#!/bin/bash
# auto-commit-memory.sh

cd /Users/zachgonser/clawd

UNCOMMITTED=$(git status --porcelain memory/ | wc -l)

if [ "$UNCOMMITTED" -gt 0 ]; then
    git add memory/
    git commit -m "Auto-commit: Memory updates $(date +%Y-%m-%d\ %H:%M:%S)"
    
    echo "Auto-committed $UNCOMMITTED file(s)"
    
    # Trigger push if needed
    ./validation/scripts/auto-push.sh
fi
```

### Auto-Fix Malformed JSON

**Trigger:** Invalid JSON in state file  
**Action:** Restore from git history or backup

```bash
#!/bin/bash
# auto-fix-json.sh

STATE_FILE="$1"

if [ ! -f "$STATE_FILE" ]; then
    echo "File not found: $STATE_FILE"
    exit 1
fi

# Test if JSON is valid
if ! jq empty "$STATE_FILE" 2>/dev/null; then
    echo "Invalid JSON detected in $STATE_FILE"
    
    # Try to restore from git
    if git show HEAD:"$STATE_FILE" > /tmp/restored.json 2>/dev/null; then
        if jq empty /tmp/restored.json 2>/dev/null; then
            cp /tmp/restored.json "$STATE_FILE"
            echo "Restored from git HEAD"
            exit 0
        fi
    fi
    
    # Try backup
    BACKUP=$(ls -t "$HOME/backups/clawd"/clawd-*.tar.gz 2>/dev/null | head -n 1)
    if [ -n "$BACKUP" ]; then
        tar -xzOf "$BACKUP" "$STATE_FILE" > /tmp/restored.json 2>/dev/null
        if jq empty /tmp/restored.json 2>/dev/null; then
            cp /tmp/restored.json "$STATE_FILE"
            echo "Restored from backup"
            exit 0
        fi
    fi
    
    # Last resort: create valid empty structure
    echo '{"lastUpdate": '$(date +%s)', "data": {}}' > "$STATE_FILE"
    echo "Created new valid structure"
fi
```

### Auto-Create Missing Daily Log

**Trigger:** Daily log file missing  
**Action:** Create from template

```bash
#!/bin/bash
# auto-create-daily-log.sh

DAILY_LOG="memory/$(date +%Y-%m-%d).md"

if [ ! -f "$DAILY_LOG" ]; then
    cat > "$DAILY_LOG" << EOF
# $(date +%Y-%m-%d)

## Sessions

## Events

## Notes

EOF
    
    echo "Created daily log: $DAILY_LOG"
    
    # Auto-commit
    cd /Users/zachgonser/clawd
    git add "$DAILY_LOG"
    git commit -m "Auto-create: Daily log $(date +%Y-%m-%d)"
fi
```

### Auto-Trigger Backup

**Trigger:** Last backup >24 hours old  
**Action:** Create new backup

```bash
#!/bin/bash
# auto-backup.sh

BACKUP_DIR="$HOME/backups/clawd"
mkdir -p "$BACKUP_DIR"

TODAY=$(date +%Y-%m-%d)
BACKUP_FILE="$BACKUP_DIR/clawd-$TODAY.tar.gz"

# Check if today's backup already exists
if [ -f "$BACKUP_FILE" ]; then
    echo "Backup already exists: $BACKUP_FILE"
    exit 0
fi

# Create backup
cd /Users/zachgonser/clawd
tar -czf "$BACKUP_FILE" \
    memory/ \
    MEMORY.md \
    state.json \
    validation/ \
    AGENTS.md \
    SOUL.md \
    USER.md \
    2>/dev/null

# Verify backup
if ! gzip -t "$BACKUP_FILE" 2>/dev/null; then
    echo "Backup verification failed, removing corrupted file"
    rm -f "$BACKUP_FILE"
    exit 1
fi

echo "Backup created: $BACKUP_FILE"

# Cleanup old backups (keep last 30 days)
find "$BACKUP_DIR" -name "clawd-*.tar.gz" -mtime +30 -delete

# Count removed
REMOVED=$(find "$BACKUP_DIR" -name "clawd-*.tar.gz" -mtime +30 | wc -l)
if [ "$REMOVED" -gt 0 ]; then
    echo "Removed $REMOVED old backup(s)"
fi
```

### Auto-Push Uncommitted Changes

**Trigger:** Unpushed commits >2 hours old  
**Action:** Push to remote

```bash
#!/bin/bash
# auto-push.sh

cd /Users/zachgonser/clawd

# Check if we have commits to push
AHEAD=$(git rev-list @{u}..HEAD --count 2>/dev/null || echo 0)

if [ "$AHEAD" -gt 0 ]; then
    echo "Pushing $AHEAD commit(s) to remote..."
    
    # Try to push
    if git push 2>&1; then
        echo "Successfully pushed to remote"
    else
        echo "Push failed, will retry later"
        exit 1
    fi
else
    echo "No commits to push"
fi
```

### Auto-Fix Obsidian Sync

**Trigger:** Vault not synced in 30+ minutes  
**Action:** Trigger manual sync

```bash
#!/bin/bash
# auto-fix-obsidian-sync.sh

VAULT_PATH="/Users/zachgonser/Obsidian/VaultZap"

# Check if Obsidian is running
if ! pgrep -x "Obsidian" > /dev/null; then
    echo "Obsidian not running, cannot sync"
    exit 1
fi

# Trigger sync via AppleScript (macOS)
osascript <<EOF
tell application "Obsidian"
    activate
end tell

tell application "System Events"
    keystroke "p" using {command down, shift down}
    delay 0.5
    keystroke "sync"
    delay 0.5
    keystroke return
end tell
EOF

echo "Triggered Obsidian sync"
```

---

## Implementation Checklist

### Phase 1: Core Validation (Week 1)

- [ ] **Setup validation directory structure**
  - [ ] Create `validation/` directory
  - [ ] Create `validation/scripts/` for executables
  - [ ] Create `validation/logs/` for validation logs
  - [ ] Create `validation/state/` for tracking

- [ ] **Memory System Validation**
  - [ ] Implement daily log existence check
  - [ ] Implement format validation
  - [ ] Implement file size monitoring
  - [ ] Implement git commit status check
  - [ ] Implement corruption detection
  - [ ] Create checksums for existing files

- [ ] **State File Validation**
  - [ ] Implement JSON syntax validator
  - [ ] Implement schema compliance checker
  - [ ] Implement size limit monitoring
  - [ ] Implement timestamp freshness check
  - [ ] Create schema definitions

- [ ] **Git Repository Validation**
  - [ ] Implement uncommitted changes detection
  - [ ] Implement push status monitoring
  - [ ] Implement branch health check
  - [ ] Implement remote connectivity test

### Phase 2: Self-Healing (Week 2)

- [ ] **Auto-Healing Scripts**
  - [ ] Create auto-commit script for memory changes
  - [ ] Create auto-fix script for malformed JSON
  - [ ] Create auto-create script for missing daily logs
  - [ ] Create auto-push script for uncommitted changes
  - [ ] Test all scripts in safe environment

- [ ] **Backup System**
  - [ ] Implement daily backup creation
  - [ ] Implement backup verification
  - [ ] Implement backup restoration test
  - [ ] Setup backup retention policy
  - [ ] Create backup monitoring

- [ ] **Integration**
  - [ ] Wire validators to self-healing actions
  - [ ] Implement retry logic with exponential backoff
  - [ ] Create rollback procedures for failed heals
  - [ ] Setup logging for all actions

### Phase 3: Obsidian & Advanced (Week 3)

- [ ] **Obsidian Vault Validation**
  - [ ] Implement sync status monitoring
  - [ ] Implement extraction validation
  - [ ] Implement file corruption detection
  - [ ] Implement vault size monitoring
  - [ ] Implement plugin health check

- [ ] **Advanced Monitoring**
  - [ ] Implement checksum-based integrity checks
  - [ ] Implement anomaly detection for vault growth
  - [ ] Implement performance metrics tracking
  - [ ] Create validation dashboard

- [ ] **Alert System**
  - [ ] Setup P0 (critical) alerts
  - [ ] Setup P1 (high) alerts
  - [ ] Setup P2 (medium) alerts
  - [ ] Setup P3 (low) daily digest
  - [ ] Test alert delivery

### Phase 4: Integration & Testing (Week 4)

- [ ] **Monitor-Agent Integration**
  - [ ] Create validation coordinator
  - [ ] Implement validation scheduling
  - [ ] Wire to Monitor-Agent framework
  - [ ] Setup validation state tracking

- [ ] **Testing**
  - [ ] Test each validation rule individually
  - [ ] Test each self-healing action
  - [ ] Test cascading failures
  - [ ] Test recovery from corruption
  - [ ] Perform end-to-end validation

- [ ] **Documentation**
  - [ ] Document all validation rules
  - [ ] Document all self-healing procedures
  - [ ] Create runbook for manual interventions
  - [ ] Update VALIDATION-SELF-HEALING-ARCHITECTURE.md

---

## Validation Scripts

### Master Validator

```bash
#!/bin/bash
# validation/scripts/validate-all.sh
# Master validation script - runs all checks

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_DIR="$SCRIPT_DIR/../logs"
mkdir -p "$LOG_DIR"

TIMESTAMP=$(date +%Y-%m-%d_%H-%M-%S)
LOG_FILE="$LOG_DIR/validation-$TIMESTAMP.log"

echo "=== Data Integrity Validation ===" | tee -a "$LOG_FILE"
echo "Started: $(date)" | tee -a "$LOG_FILE"
echo "" | tee -a "$LOG_FILE"

TOTAL=0
PASSED=0
FAILED=0

# Function to run validation
run_check() {
    local name="$1"
    local script="$2"
    
    TOTAL=$((TOTAL + 1))
    echo -n "[$TOTAL] $name... " | tee -a "$LOG_FILE"
    
    if "$script" >> "$LOG_FILE" 2>&1; then
        echo "✓ PASS" | tee -a "$LOG_FILE"
        PASSED=$((PASSED + 1))
    else
        echo "✗ FAIL" | tee -a "$LOG_FILE"
        FAILED=$((FAILED + 1))
    fi
}

# Memory System Checks
echo "## Memory System" | tee -a "$LOG_FILE"
run_check "Daily log exists" "$SCRIPT_DIR/validate-daily-log-exists.sh"
run_check "Daily log format" "$SCRIPT_DIR/validate-daily-log-format.sh"
run_check "Memory file size" "$SCRIPT_DIR/validate-memory-size.sh"
run_check "Git commit status" "$SCRIPT_DIR/validate-git-commits.sh"
run_check "File corruption" "$SCRIPT_DIR/validate-file-corruption.sh"
echo "" | tee -a "$LOG_FILE"

# State File Checks
echo "## State Files" | tee -a "$LOG_FILE"
run_check "JSON syntax" "$SCRIPT_DIR/validate-json-syntax.sh"
run_check "Schema compliance" "$SCRIPT_DIR/validate-schema.sh"
run_check "Size limits" "$SCRIPT_DIR/validate-state-size.sh"
run_check "Timestamp freshness" "$SCRIPT_DIR/validate-timestamps.sh"
echo "" | tee -a "$LOG_FILE"

# Git Repository Checks
echo "## Git Repository" | tee -a "$LOG_FILE"
run_check "Uncommitted changes" "$SCRIPT_DIR/validate-uncommitted.sh"
run_check "Push status" "$SCRIPT_DIR/validate-push-status.sh"
run_check "Branch health" "$SCRIPT_DIR/validate-branch.sh"
run_check "Remote connectivity" "$SCRIPT_DIR/validate-remote.sh"
echo "" | tee -a "$LOG_FILE"

# Backup Checks
echo "## Backups" | tee -a "$LOG_FILE"
run_check "Backup exists" "$SCRIPT_DIR/validate-backup-exists.sh"
run_check "Backup integrity" "$SCRIPT_DIR/validate-backup-integrity.sh"
run_check "Backup recency" "$SCRIPT_DIR/validate-backup-recency.sh"
echo "" | tee -a "$LOG_FILE"

# Obsidian Checks
echo "## Obsidian Vault" | tee -a "$LOG_FILE"
run_check "Sync status" "$SCRIPT_DIR/validate-obsidian-sync.sh"
run_check "Extraction files" "$SCRIPT_DIR/validate-extractions.sh"
run_check "Vault corruption" "$SCRIPT_DIR/validate-vault-corruption.sh"
echo "" | tee -a "$LOG_FILE"

# Summary
echo "=== Summary ===" | tee -a "$LOG_FILE"
echo "Total checks: $TOTAL" | tee -a "$LOG_FILE"
echo "Passed: $PASSED" | tee -a "$LOG_FILE"
echo "Failed: $FAILED" | tee -a "$LOG_FILE"
echo "Completed: $(date)" | tee -a "$LOG_FILE"

if [ "$FAILED" -gt 0 ]; then
    echo "" | tee -a "$LOG_FILE"
    echo "⚠️  Some checks failed. Running auto-heal..." | tee -a "$LOG_FILE"
    "$SCRIPT_DIR/auto-heal-all.sh" 2>&1 | tee -a "$LOG_FILE"
    exit 1
else
    echo "" | tee -a "$LOG_FILE"
    echo "✓ All checks passed!" | tee -a "$LOG_FILE"
    exit 0
fi
```

### Auto-Heal Coordinator

```bash
#!/bin/bash
# validation/scripts/auto-heal-all.sh
# Coordinates all self-healing actions

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_FILE="$SCRIPT_DIR/../logs/auto-heal-$(date +%Y-%m-%d_%H-%M-%S).log"

echo "=== Auto-Heal Started ===" | tee -a "$LOG_FILE"
echo "Timestamp: $(date)" | tee -a "$LOG_FILE"
echo "" | tee -a "$LOG_FILE"

# Memory System Healing
if [ ! -f "memory/$(date +%Y-%m-%d).md" ]; then
    echo "Creating missing daily log..." | tee -a "$LOG_FILE"
    "$SCRIPT_DIR/auto-create-daily-log.sh" 2>&1 | tee -a "$LOG_FILE"
fi

# Git Healing
UNCOMMITTED=$(cd /Users/zachgonser/clawd && git status --porcelain memory/ | wc -l)
if [ "$UNCOMMITTED" -gt 0 ]; then
    echo "Auto-committing memory changes..." | tee -a "$LOG_FILE"
    "$SCRIPT_DIR/auto-commit-memory.sh" 2>&1 | tee -a "$LOG_FILE"
fi

# Check push status
AHEAD=$(cd /Users/zachgonser/clawd && git rev-list @{u}..HEAD --count 2>/dev/null || echo 0)
if [ "$AHEAD" -gt 0 ]; then
    echo "Auto-pushing commits..." | tee -a "$LOG_FILE"
    "$SCRIPT_DIR/auto-push.sh" 2>&1 | tee -a "$LOG_FILE"
fi

# State File Healing
for state_file in state.json memory/heartbeat-state.json; do
    if [ -f "$state_file" ] && ! jq empty "$state_file" 2>/dev/null; then
        echo "Fixing malformed JSON: $state_file" | tee -a "$LOG_FILE"
        "$SCRIPT_DIR/auto-fix-json.sh" "$state_file" 2>&1 | tee -a "$LOG_FILE"
    fi
done

# Backup Healing
LATEST_BACKUP=$(ls -t "$HOME/backups/clawd"/clawd-*.tar.gz 2>/dev/null | head -n 1)
if [ -z "$LATEST_BACKUP" ] || [ $(( $(date +%s) - $(stat -f%m "$LATEST_BACKUP" 2>/dev/null || stat -c%Y "$LATEST_BACKUP") )) -gt 86400 ]; then
    echo "Creating backup..." | tee -a "$LOG_FILE"
    "$SCRIPT_DIR/auto-backup.sh" 2>&1 | tee -a "$LOG_FILE"
fi

echo "" | tee -a "$LOG_FILE"
echo "=== Auto-Heal Completed ===" | tee -a "$LOG_FILE"
```

### Individual Validation Scripts

```bash
#!/bin/bash
# validation/scripts/validate-daily-log-exists.sh

DAILY_LOG="memory/$(date +%Y-%m-%d).md"

if [ ! -f "/Users/zachgonser/clawd/$DAILY_LOG" ]; then
    echo "FAIL: Daily log missing: $DAILY_LOG"
    exit 1
fi

exit 0
```

```bash
#!/bin/bash
# validation/scripts/validate-json-syntax.sh

cd /Users/zachgonser/clawd

STATE_FILES=(
    "state.json"
    "memory/heartbeat-state.json"
    "validation/vault-size-history.json"
)

for file in "${STATE_FILES[@]}"; do
    if [ -f "$file" ]; then
        if ! jq empty "$file" 2>/dev/null; then
            echo "FAIL: Invalid JSON in $file"
            exit 1
        fi
    fi
done

exit 0
```

```bash
#!/bin/bash
# validation/scripts/validate-backup-recency.sh

BACKUP_DIR="$HOME/backups/clawd"
LATEST_BACKUP=$(ls -t "$BACKUP_DIR"/clawd-*.tar.gz 2>/dev/null | head -n 1)

if [ -z "$LATEST_BACKUP" ]; then
    echo "FAIL: No backups found"
    exit 1
fi

BACKUP_AGE=$(( $(date +%s) - $(stat -f%m "$LATEST_BACKUP" 2>/dev/null || stat -c%Y "$LATEST_BACKUP") ))

if [ "$BACKUP_AGE" -gt 86400 ]; then
    echo "FAIL: Last backup is >24 hours old ($BACKUP_AGE seconds)"
    exit 1
fi

exit 0
```

---

## Recovery Procedures

### Scenario 1: Corrupted Daily Log

**Detection:** File encoding invalid or null bytes present  
**Recovery:**

1. Check git history: `git show HEAD:memory/YYYY-MM-DD.md`
2. If valid in git, restore: `git checkout HEAD -- memory/YYYY-MM-DD.md`
3. If not in git, check backup: Extract from latest backup
4. If no backup, create new from template
5. Log incident for investigation

### Scenario 2: Malformed State JSON

**Detection:** `jq empty` fails  
**Recovery:**

1. Restore from git: `git show HEAD:state.json`
2. If git corrupted, restore from backup
3. If backup corrupted, create minimal valid structure
4. Merge any salvageable data manually
5. Alert for data loss assessment

### Scenario 3: Git Repository Corruption

**Detection:** `git fsck` reports errors  
**Recovery:**

1. **DO NOT AUTO-HEAL** - Manual intervention required
2. Create emergency backup of entire directory
3. Try `git fsck --full` to identify issues
4. Attempt `git gc --prune=now`
5. If unfixable, clone from remote
6. Alert immediately (P0)

### Scenario 4: Missing Backup

**Detection:** No backup in last 24 hours  
**Recovery:**

1. Trigger immediate backup creation
2. Verify backup integrity
3. Test extraction to temp directory
4. If backup creation fails, investigate:
   - Disk space
   - Permissions
   - Backup script errors
5. Alert if repeated failures

### Scenario 5: Obsidian Sync Failure

**Detection:** Vault not synced in 30+ minutes  
**Recovery:**

1. Check if Obsidian is running
2. Trigger manual sync via AppleScript
3. If sync continues to fail:
   - Check network connectivity
   - Verify Obsidian sync credentials
   - Check vault size (may exceed limits)
4. Fallback to git-based sync if available
5. Alert if sync fails >2 hours

---

## Alert Triggers

### P0 - Critical (Immediate Alert)

- **Data Loss Imminent:**
  - Git repository corruption detected
  - Backup creation failing >48 hours
  - State files corrupted and unrecoverable
  - Memory files with null bytes (unrecoverable)

- **Action:** Discord DM + SMS + immediate escalation

### P1 - High (Alert within 15 min)

- **Data Integrity at Risk:**
  - Uncommitted changes >1 hour old (auto-heal failed)
  - State file schema violations
  - Backup verification failing
  - Obsidian sync failing >1 hour

- **Action:** Discord DM + retry auto-heal

### P2 - Medium (Alert within 1 hour)

- **Degraded State:**
  - Unpushed commits >2 hours old
  - State file size exceeding limits
  - Memory file size excessive
  - Vault growth anomaly detected

- **Action:** Discord message + queue for next check-in

### P3 - Low (Daily Digest)

- **Potential Issues:**
  - Stale timestamps in state files
  - No extractions in 24 hours
  - Non-critical warnings from validation
  - Auto-heal actions executed successfully

- **Action:** Add to daily summary

---

## Success Metrics

### Validation Coverage
- ✅ 100% of critical data paths validated
- ✅ All state files have schema validation
- ✅ All git operations monitored
- ✅ Backup integrity verified daily

### Auto-Healing Effectiveness
- ✅ >95% of issues auto-healed without alerts
- ✅ Mean time to detection (MTTD) <5 minutes
- ✅ Mean time to heal (MTTH) <1 minute
- ✅ Zero data loss from auto-heal actions

### Reliability
- ✅ 99.9%+ data integrity (no corruption)
- ✅ 100% backup success rate
- ✅ <1 manual intervention per week
- ✅ All critical files in git within 1 hour

---

## Implementation Timeline

### Week 1: Foundation
- Days 1-2: Setup validation directory, create core scripts
- Days 3-4: Implement memory & state file validation
- Days 5-7: Implement git & backup validation, testing

### Week 2: Self-Healing
- Days 1-3: Create all auto-heal scripts
- Days 4-5: Integration testing, rollback procedures
- Days 6-7: Backup system setup, restoration tests

### Week 3: Obsidian & Advanced
- Days 1-3: Obsidian validation implementation
- Days 4-5: Checksum & integrity checking
- Days 6-7: Alert system, dashboard creation

### Week 4: Integration
- Days 1-2: Wire to Monitor-Agent
- Days 3-4: End-to-end testing
- Days 5-7: Documentation, deployment

---

## Next Steps

1. **Create validation directory structure**
   ```bash
   mkdir -p validation/{scripts,logs,state}
   chmod +x validation/scripts/*.sh
   ```

2. **Implement Phase 1 validators** (memory + state files)
   - Start with highest priority (P0) checks
   - Test each validator independently

3. **Implement Phase 1 auto-heal scripts**
   - Auto-commit, auto-create, auto-backup
   - Test in safe environment first

4. **Setup scheduled execution**
   - Add to Monitor-Agent when ready
   - Or use cron as interim solution

5. **Monitor and iterate**
   - Review logs daily for first week
   - Tune thresholds based on false positives
   - Add new validators as needed

---

## Appendix: File Structure

```
validation/
├── data-integrity-methodology.md (this file)
├── scripts/
│   ├── validate-all.sh
│   ├── auto-heal-all.sh
│   ├── validate-daily-log-exists.sh
│   ├── validate-daily-log-format.sh
│   ├── validate-memory-size.sh
│   ├── validate-git-commits.sh
│   ├── validate-file-corruption.sh
│   ├── validate-json-syntax.sh
│   ├── validate-schema.sh
│   ├── validate-state-size.sh
│   ├── validate-timestamps.sh
│   ├── validate-uncommitted.sh
│   ├── validate-push-status.sh
│   ├── validate-branch.sh
│   ├── validate-remote.sh
│   ├── validate-backup-exists.sh
│   ├── validate-backup-integrity.sh
│   ├── validate-backup-recency.sh
│   ├── validate-obsidian-sync.sh
│   ├── validate-extractions.sh
│   ├── validate-vault-corruption.sh
│   ├── auto-commit-memory.sh
│   ├── auto-fix-json.sh
│   ├── auto-create-daily-log.sh
│   ├── auto-backup.sh
│   ├── auto-push.sh
│   └── auto-fix-obsidian-sync.sh
├── logs/
│   └── validation-YYYY-MM-DD_HH-MM-SS.log
├── state/
│   ├── vault-size-history.json
│   └── validation-metrics.json
└── schemas/
    ├── heartbeat-state.schema.json
    └── state.schema.json
```

---

**Status:** 🟢 Complete and ready for implementation  
**Next Action:** Execute Phase 1 implementation checklist  
**Owner:** Monitor-Agent (to be created)  
**Review:** Monthly or after any data loss incident

