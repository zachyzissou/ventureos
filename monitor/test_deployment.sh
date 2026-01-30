#!/bin/bash
# Pre-deployment validation script
# Ensures Monitor-Agent is ready for deployment

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "🧪 Monitor-Agent Deployment Validation"
echo "======================================="
echo ""

ERRORS=0

# 1. Check Python environment
echo "1️⃣  Checking Python environment..."
if [ ! -d "venv" ]; then
    echo "   ❌ Virtual environment not found"
    ERRORS=$((ERRORS + 1))
elif ! source venv/bin/activate 2>/dev/null; then
    echo "   ❌ Failed to activate virtual environment"
    ERRORS=$((ERRORS + 1))
else
    echo "   ✅ Virtual environment OK"
fi

# 2. Check directory structure
echo "2️⃣  Checking directory structure..."
python validate_structure.py > /dev/null 2>&1
if [ $? -eq 0 ]; then
    echo "   ✅ Directory structure valid"
else
    echo "   ❌ Directory structure invalid"
    python validate_structure.py
    ERRORS=$((ERRORS + 1))
fi

# 3. Run tests
echo "3️⃣  Running test suite..."
python -m pytest -q > /dev/null 2>&1
if [ $? -eq 0 ]; then
    TEST_COUNT=$(python -m pytest --collect-only -q 2>/dev/null | grep "test session" | awk '{print $1}')
    echo "   ✅ All tests passing ($TEST_COUNT tests)"
else
    echo "   ❌ Tests failing"
    python -m pytest -v
    ERRORS=$((ERRORS + 1))
fi

# 4. Check Discord webhook
echo "4️⃣  Checking Discord webhook..."
if grep -q "SET_YOUR_WEBHOOK_URL_HERE" com.clawdbot.monitor-agent.plist; then
    echo "   ❌ Discord webhook not configured"
    ERRORS=$((ERRORS + 1))
else
    # Extract webhook URL from plist
    WEBHOOK=$(grep -A 1 "DISCORD_WEBHOOK_URL" com.clawdbot.monitor-agent.plist | tail -1 | sed 's/.*<string>\(.*\)<\/string>.*/\1/')
    
    # Test webhook with a simple POST
    RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$WEBHOOK" \
        -H "Content-Type: application/json" \
        -d '{"content":"🧪 Monitor-Agent deployment test"}' 2>/dev/null)
    
    if [ "$RESPONSE" = "204" ] || [ "$RESPONSE" = "200" ]; then
        echo "   ✅ Discord webhook working (sent test message)"
    else
        echo "   ⚠️  Discord webhook returned HTTP $RESPONSE (may still work)"
    fi
fi

# 5. Check required directories
echo "5️⃣  Checking required directories..."
REQUIRED_DIRS=("logs" "data" "monitor/detectors" "monitor/validators" "monitor/healers" "monitor/alerters")
for dir in "${REQUIRED_DIRS[@]}"; do
    if [ ! -d "$dir" ]; then
        echo "   ❌ Missing directory: $dir"
        ERRORS=$((ERRORS + 1))
    fi
done
if [ $ERRORS -eq 0 ]; then
    echo "   ✅ All required directories exist"
fi

# 6. Check database initialization
echo "6️⃣  Checking database..."
if [ -f "data/monitor.db" ]; then
    # Check if tables exist
    TABLE_COUNT=$(sqlite3 data/monitor.db "SELECT COUNT(*) FROM sqlite_master WHERE type='table';" 2>/dev/null || echo "0")
    if [ "$TABLE_COUNT" -ge 6 ]; then
        echo "   ✅ Database initialized ($TABLE_COUNT tables)"
    else
        echo "   ⚠️  Database exists but may need re-initialization ($TABLE_COUNT tables, expected 6+)"
    fi
else
    echo "   ℹ️  Database will be created on first run"
fi

# 7. Check launchd plist syntax
echo "7️⃣  Checking launchd plist..."
plutil -lint com.clawdbot.monitor-agent.plist > /dev/null 2>&1
if [ $? -eq 0 ]; then
    echo "   ✅ Plist syntax valid"
else
    echo "   ❌ Plist syntax invalid"
    plutil -lint com.clawdbot.monitor-agent.plist
    ERRORS=$((ERRORS + 1))
fi

# Summary
echo ""
echo "======================================="
if [ $ERRORS -eq 0 ]; then
    echo "✅ All validation checks passed!"
    echo ""
    echo "Ready to deploy:"
    echo "  ./deploy.sh"
    exit 0
else
    echo "❌ $ERRORS validation check(s) failed"
    echo ""
    echo "Fix errors before deploying"
    exit 1
fi
