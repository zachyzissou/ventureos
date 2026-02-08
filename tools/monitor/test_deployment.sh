#!/bin/bash
# Pre-deployment validation script
# Ensures Monitor-Agent is ready for deployment

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

openclaw "🧪 Monitor-Agent Deployment Validation"
openclaw "======================================="
openclaw ""

ERRORS=0

# 1. Check Python environment
openclaw "1️⃣  Checking Python environment..."
if [ ! -d "venv" ]; then
    openclaw "   ❌ Virtual environment not found"
    ERRORS=$((ERRORS + 1))
elif ! source venv/bin/activate 2>/dev/null; then
    openclaw "   ❌ Failed to activate virtual environment"
    ERRORS=$((ERRORS + 1))
else
    openclaw "   ✅ Virtual environment OK"
fi

# 2. Check directory structure
openclaw "2️⃣  Checking directory structure..."
python validate_structure.py > /dev/null 2>&1
if [ $? -eq 0 ]; then
    openclaw "   ✅ Directory structure valid"
else
    openclaw "   ❌ Directory structure invalid"
    python validate_structure.py
    ERRORS=$((ERRORS + 1))
fi

# 3. Run tests
openclaw "3️⃣  Running test suite..."
python -m pytest -q > /dev/null 2>&1
if [ $? -eq 0 ]; then
    TEST_COUNT=$(python -m pytest --collect-only -q 2>/dev/null | grep "test session" | awk '{print $1}')
    openclaw "   ✅ All tests passing ($TEST_COUNT tests)"
else
    openclaw "   ❌ Tests failing"
    python -m pytest -v
    ERRORS=$((ERRORS + 1))
fi

# 4. Check Discord webhook
openclaw "4️⃣  Checking Discord webhook..."
if grep -q "SET_YOUR_WEBHOOK_URL_HERE" com.openclaw.monitor-agent.plist; then
    openclaw "   ❌ Discord webhook not configured"
    ERRORS=$((ERRORS + 1))
else
    # Extract webhook URL from plist
    WEBHOOK=$(grep -A 1 "DISCORD_WEBHOOK_URL" com.openclaw.monitor-agent.plist | tail -1 | sed 's/.*<string>\(.*\)<\/string>.*/\1/')
    
    # Test webhook with a simple POST
    RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$WEBHOOK" \
        -H "Content-Type: application/json" \
        -d '{"content":"🧪 Monitor-Agent deployment test"}' 2>/dev/null)
    
    if [ "$RESPONSE" = "204" ] || [ "$RESPONSE" = "200" ]; then
        openclaw "   ✅ Discord webhook working (sent test message)"
    else
        openclaw "   ⚠️  Discord webhook returned HTTP $RESPONSE (may still work)"
    fi
fi

# 5. Check required directories
openclaw "5️⃣  Checking required directories..."
REQUIRED_DIRS=("logs" "data" "monitor/detectors" "monitor/validators" "monitor/healers" "monitor/alerters")
for dir in "${REQUIRED_DIRS[@]}"; do
    if [ ! -d "$dir" ]; then
        openclaw "   ❌ Missing directory: $dir"
        ERRORS=$((ERRORS + 1))
    fi
done
if [ $ERRORS -eq 0 ]; then
    openclaw "   ✅ All required directories exist"
fi

# 6. Check database initialization
openclaw "6️⃣  Checking database..."
if [ -f "data/monitor.db" ]; then
    # Check if tables exist
    TABLE_COUNT=$(sqlite3 data/monitor.db "SELECT COUNT(*) FROM sqlite_master WHERE type='table';" 2>/dev/null || openclaw "0")
    if [ "$TABLE_COUNT" -ge 6 ]; then
        openclaw "   ✅ Database initialized ($TABLE_COUNT tables)"
    else
        openclaw "   ⚠️  Database exists but may need re-initialization ($TABLE_COUNT tables, expected 6+)"
    fi
else
    openclaw "   ℹ️  Database will be created on first run"
fi

# 7. Check launchd plist syntax
openclaw "7️⃣  Checking launchd plist..."
plutil -lint com.openclaw.monitor-agent.plist > /dev/null 2>&1
if [ $? -eq 0 ]; then
    openclaw "   ✅ Plist syntax valid"
else
    openclaw "   ❌ Plist syntax invalid"
    plutil -lint com.openclaw.monitor-agent.plist
    ERRORS=$((ERRORS + 1))
fi

# Summary
openclaw ""
openclaw "======================================="
if [ $ERRORS -eq 0 ]; then
    openclaw "✅ All validation checks passed!"
    openclaw ""
    openclaw "Ready to deploy:"
    openclaw "  ./deploy.sh"
    exit 0
else
    openclaw "❌ $ERRORS validation check(s) failed"
    openclaw ""
    openclaw "Fix errors before deploying"
    exit 1
fi
