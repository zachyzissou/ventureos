# Remaining StantonTimes Cron Jobs to Update

**Updated:** P1 Keywords (new ID: d7fc8e0a-711f-40ff-8477-50d3708c5c67) ✅

**Still need bird → bird-auth.sh update:**

1. **StantonTimes P0 Monitor** (`b8f7127b-b27e-4660-8ad8-4d9030233e8d`)
   - Schedule: Every 30 minutes
   - Fix: Replace `bird` with `/Users/zachgonser/clawd/scripts/bird-auth.sh`

2. **StantonTimes Engagement** (`0d214337-fcfc-4d1a-a9aa-ae75a127d269`)
   - Schedule: 15,45 * * * * (2x/hour)
   - Fix: Replace `bird` with `/Users/zachgonser/clawd/scripts/bird-auth.sh`

3. **StantonTimes Creator Monitor** (`b5ac2a71-f1b2-4a8c-bcca-fcd254afe1b1`)
   - Schedule: Every 2 hours
   - Fix: Replace `bird` with `/Users/zachgonser/clawd/scripts/bird-auth.sh`
   - **BONUS:** Update to autonomous (like P1)

4. **StantonTimes Web RSS** (`42661abf-198f-4d20-9943-4163e8e51c3d`)
   - Schedule: Every 2 hours
   - Fix: Replace `bird` with `/Users/zachgonser/clawd/scripts/bird-auth.sh`

5. **StantonTimes Approval Check** (`e9a4c0da-30c8-41ba-96a9-05ae564eedf5`)
   - Schedule: Every 5 minutes
   - Fix: Replace `bird` with `/Users/zachgonser/clawd/scripts/bird-auth.sh` (if used)
   - Should already be working (just checks state.json)

**Priority:**
- P0, Engagement, Creator, Web need bird-auth.sh updates
- Creator Monitor should also get autonomy update (like P1)
- Approval Check likely already works (no bird commands)

**Next step:** Batch update these 4 jobs
