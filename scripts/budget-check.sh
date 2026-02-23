#!/usr/bin/env bash
set -euo pipefail

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

node "$HOME/clawd/subscription-quota-tracker.js" report
# Parsing + alerting handled by cron wrapper
