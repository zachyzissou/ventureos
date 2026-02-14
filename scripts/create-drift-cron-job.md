# Create Khala Drift Cron Job

## Quick Setup (OpenClaw Dashboard)

1. **Open Dashboard:**
   ```bash
   openclaw dashboard
   ```

2. **Navigate to Cron Jobs:**
   - Click "Cron" or "Scheduled Tasks" in sidebar
   - Click "Create New Job" button

3. **Configure Job:**
   ```
   Name: Daily Khala Drift Update
   Agent: atlas
   Target: isolated
   Schedule: cron 15 6 * * * @ America/Chicago
   Command: /Users/zachgonser/clawd/scripts/update-khala-drift.sh
   Timeout: 300
   ```

4. **Save and Verify:**
   - Click "Create" or "Save"
   - Check job appears in list
   - Note the job ID for reference

## Alternative: API Method

If dashboard access is unavailable, use the Gateway API:

```bash
# Get your gateway token
TOKEN=$(openclaw config get gateway.token)

# Create job via API
curl -X POST http://localhost:7210/api/cron \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Daily Khala Drift Update",
    "agent": "atlas",
    "target": "isolated",
    "schedule": "cron 15 6 * * * @ America/Chicago",
    "command": "/Users/zachgonser/clawd/scripts/update-khala-drift.sh",
    "timeout": 300
  }'
```

## Verification

After creation, verify the job:

```bash
# List all cron jobs
openclaw cron list | grep -i drift

# Check execution logs (after first run)
tail -f ~/clawd/runtime/logs/khala-drift-*.log
```

Expected output in cron list:
```
<job-id>  Daily Khala Drift Update  cron 15 6 * * * @ America/Chicago  in Xh  ...  ok  isolated  atlas
```

## Schedule Details

- **Time:** 6:15 AM Central Time (America/Chicago)
- **Frequency:** Daily
- **Runs After:** Psionic stats calculation (6:00 AM)
- **Duration:** ~5-30 seconds typical
- **Timeout:** 5 minutes maximum

## Troubleshooting

### Job Not Running

1. Check gateway status:
   ```bash
   openclaw gateway status
   ```

2. Check cron logs:
   ```bash
   openclaw cron list
   ```

3. Manual test:
   ```bash
   ~/clawd/scripts/update-khala-drift.sh
   ```

### No Drift Updates

1. Check for recent interactions:
   ```bash
   sqlite3 ~/clawd/agents/ventureos-rpg.db "
   SELECT COUNT(*) FROM interaction_logs 
   WHERE created_at > datetime('now', '-24 hours');
   "
   ```

2. Check state file:
   ```bash
   cat ~/clawd/runtime/tmp/khala-drift-last-processed.txt
   ```

3. Force reprocess:
   ```bash
   LOOKBACK_HOURS=48 ~/clawd/scripts/update-khala-drift.sh
   ```

### Permission Errors

Ensure scripts are executable:
```bash
chmod +x ~/clawd/scripts/log-interaction.sh
chmod +x ~/clawd/scripts/update-khala-drift.sh
chmod +x ~/clawd/scripts/test-drift-scenarios.sh
```

## Success Indicators

✅ Job appears in `openclaw cron list`  
✅ Log file created: `~/clawd/runtime/logs/khala-drift-<date>.log`  
✅ Drift history grows: `SELECT COUNT(*) FROM khala_drift_history;`  
✅ No errors in execution logs

## Next Steps After Setup

1. Monitor first few runs
2. Check drift patterns weekly
3. Adjust drift magnitudes if needed (via environment variables)
4. Integrate interaction logging into spawn wrappers
