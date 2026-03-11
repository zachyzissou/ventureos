# OpenProject Decommission (Issue #22)

## Purpose
Remove any remaining OpenProject integration points and confirm GitLab is the only work‑tracking system for this repo.

## Current Repo Findings (2026‑02‑08)
**Search results:** No references to OpenProject were found in this repository.

Commands executed:
```bash
rg -n "OpenProject|openproject|open-project|open_project" -S .
find . -maxdepth 3 -type f \( -iname "*openproject*" -o -iname "*open-project*" -o -iname "*open_project*" \)
```

> Output: no matches

## Decommission Steps (if any external integration still exists)
1. **Secrets / env vars**
   - Remove any OpenProject credentials from local `.env`, CI variables, or secrets manager.
   - Examples to delete if present: `OPENPROJECT_BASE_URL`, `OPENPROJECT_TOKEN`, `OPENPROJECT_API_KEY`.
2. **CI / automation**
   - Remove any CI jobs, scripts, or cron tasks that call the OpenProject API.
3. **Webhooks / callbacks**
   - Disable webhooks in OpenProject that point to this repo or OpenClaw services.
4. **Agent workflows**
   - Ensure any task tracking integrations reference **GitLab Issues** only.
5. **Documentation**
   - Keep `docs/WORK_TRACKING.md` authoritative for GitLab tracking.

## Removal Checklist
- [ ] Repo search shows **no OpenProject references** (commands above).
- [ ] CI variables / secrets have **no OpenProject creds**.
- [ ] OpenProject webhooks or integrations are **disabled**.
- [ ] No scheduled jobs or scripts call OpenProject APIs.
- [ ] Tracking workflows point to GitLab only.

## Verification Steps
1. Run:
   ```bash
   rg -n "OpenProject|openproject|open-project|open_project" -S .
   ```
2. Run:
   ```bash
   find . -maxdepth 3 -type f \( -iname "*openproject*" -o -iname "*open-project*" -o -iname "*open_project*" \)
   ```
3. Confirm CI/secrets manager shows **no OpenProject variables**.
4. Confirm OpenProject has **no active webhooks** for this repo.

## Artifacts
- Commands listed above (no matches in repo).
