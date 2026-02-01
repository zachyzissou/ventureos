# Model Orchestration - 7-Day Monitoring Plan

**Phase 2 Deployment:** 2026-01-31 20:23 CST  
**Monitoring Period:** Feb 1-7, 2026  
**Decision Point:** Feb 7, 2026

---

## Jobs Under Monitoring

### Tier 1 (qwen3:8b) - 6 jobs

| Job | Schedule | Expected Speed | First Run |
|-----|----------|----------------|-----------|
| Bloom PR Monitor | Every 15 min | <15s | ~20:30 |
| Bloom CI Watch | Every 30 min | <15s | ~20:30 |
| StantonTimes P0 Monitor | Every 30 min | <15s | ~20:30 |
| StantonTimes P1 Keywords | Every 2h | <15s | ~22:00 |
| StantonTimes Approval Check | Every 5 min | <10s | ~20:25 |
| StantonTimes Web RSS | Every 2h | <20s | ~22:00 |

### Tier 2 (qwen3:32b) - 4 jobs

| Job | Schedule | Expected Speed | First Run |
|-----|----------|----------------|-----------|
| Fact Extraction | Every 30 min | <60s | ~20:30 |
| Morning Briefing | Daily 8 AM | <90s | Feb 1 08:00 |
| StantonTimes Engagement | 15,45 min/h | <60s | ~20:45 |
| StantonTimes Creator Monitor | Every 2h | <60s | ~22:00 |

---

## Success Criteria

**Must pass all 3:**

1. **Quality:** 95%+ accuracy (manual review of random samples)
2. **Performance:** <5% timeout rate, meets speed targets
3. **Reliability:** <10% fallback rate to Claude

---

## Daily Monitoring Tasks

### Automated (via cron logs)
- Check `~/.clawdbot/cron/runs/` for failures
- Track execution times
- Count fallback occurrences

### Manual Review (spot check)
- Random sample: 3 runs per job type
- Verify output quality matches Sonnet baseline
- Check for hallucinations, missed events, poor formatting

---

## Review Schedule

**Daily (10 AM):**
- Quick scan of overnight runs
- Flag any obvious failures

**Mid-week (Feb 4):**
- Comprehensive review
- Calculate metrics
- Adjust if critical issues found

**Final Review (Feb 7):**
- Full 7-day analysis
- Calculate cost savings
- Make Phase 3 decision

---

## Phase 3 Decision Tree

### If 95%+ success rate:
✅ **PROCEED** - Optimize and scale
- Fine-tune prompts for speed
- Consider migrating 2 more jobs (if appropriate)
- Plan Phase 4 (Unraid integration)

### If 85-94% success rate:
⚠️ **ADJUST** - Fix issues, extend monitoring
- Identify failure patterns
- Tweak tier assignments
- Re-test for 3 more days

### If <85% success rate:
❌ **ROLLBACK** - Revert problematic jobs
- Move failing jobs back to Sonnet
- Document root causes
- Revisit tier classification

---

## Cost Tracking

**Baseline (all Sonnet):** ~$300/month  
**Current (10 on Ollama):** ~$80/month  
**Target savings:** $220/month (73%)

### Weekly Cost Breakdown

**Week 1 (Feb 1-7):**
- Ollama requests: ~1,344 (FREE)
- Sonnet requests: ~336 (Tier 3 jobs)
- Estimated cost: ~$18-20

**Projected monthly:**
- Ollama: 5,376 requests (FREE)
- Sonnet: 1,344 requests (~$80)
- **Total: ~$80/month** 💰

---

## Known Risks & Mitigations

| Risk | Probability | Mitigation |
|------|-------------|------------|
| Qwen hallucinations | Medium | Manual review, revert if >5% |
| Slow response times | Low | Timeout fallback to Haiku |
| RAM exhaustion | Low | Monitor system resources |
| Tool call failures | Medium | Test thoroughly, log errors |

---

## Quick Commands

**Check recent runs:**
```bash
ls -lt ~/.clawdbot/cron/runs/ | head -20
```

**Check for failures:**
```bash
grep -r "error" ~/.clawdbot/cron/runs/ | tail -20
```

**Check Ollama status:**
```bash
curl -s http://127.0.0.1:11434/api/ps | jq
```

**System resources:**
```bash
top -l 1 | grep -E "(CPU|PhysMem)"
```

---

## Notes

- First production test of multi-tier model orchestration
- Largest single migration (10 jobs at once)
- Validates cost reduction strategy before Unraid investment
- Sets pattern for future business unit scaling

---

**Next update:** Feb 4 (mid-week review)
