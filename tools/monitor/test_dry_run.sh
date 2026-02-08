#!/bin/bash
# Test Monitor-Agent in dry-run mode (foreground)
# Will run for 2 cycles then exit

cd /Users/zachgonser/clawd/monitor
source venv/bin/activate

export DISCORD_WEBHOOK_URL="${DISCORD_WEBHOOK_URL:-https://discord.com/api/webhooks/1466893157827612941/lbJ4vBd59fBmY8iF8DZ3vpEa6E0C_y3GK6Mf9wzUGtpiOFyLGsmJP46j9LU5eZ_sWYiY}"

openclaw "🧪 Testing Monitor-Agent in DRY-RUN mode"
openclaw "=========================================="
openclaw ""
openclaw "Will run for ~2 minutes (2 cycles) then you can Ctrl+C"
openclaw ""
openclaw "Watch for:"
openclaw "  ✅ 'SAFETY CHECK' with dry_run=True"
openclaw "  ✅ 'healer_dry_run_enabled' for all healers"
openclaw "  ✅ 'dry_run_gateway_restart' if gateway issue detected"
openclaw "  ❌ NO 'gateway_restart_success' messages"
openclaw ""
openclaw "Press Enter to start..."
read

python3 -m monitor.main_loop
