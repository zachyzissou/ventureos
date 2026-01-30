# HEARTBEAT.md - Stanton Times Monitoring

## Check Schedule

When this heartbeat fires, rotate through these checks based on time since last check:

### P0 - Official Sources (Every 2 hours)
Check recent tweets from:
- @RobertsSpaceInd
- @CloudImperiumGames  
- @squadron_42
- @discolando

Use the `bird` skill to fetch timelines. Look for:
- Patch announcements
- Ship reveals
- Event news
- Dev communications

### P1 - Patch Status (Every 4 hours)
Check @starcitizenbot for:
- PTU/LIVE status changes
- Patch deployments
- Hotfixes

### P2 - Creators (Every 8 hours)
Scan community accounts for newsworthy content:
- @BoredGamerUK, @Morphologis, @SaltEMike
- @SpaceTomatoGG, @SuperMacBrother, @BTV_Cast
- @TheRubenSaurus

### Event Calendar
Check if any annual events are upcoming (within 2 weeks):
- Red Festival (Jan-Feb)
- Invictus Launch Week (May)
- Alien Week (June)
- CitizenCon (October)
- IAE (November)
- Luminalia (December)

## Before Drafting

1. Read `config/state.json` - check what's already been covered
2. Verify any patch status claims before tweeting
3. Add unique value - don't just echo CIG

## Output

If you find newsworthy content, draft a tweet and send it for approval.
If nothing new, reply HEARTBEAT_OK.
