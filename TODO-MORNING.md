# Morning Action Items

**Date:** 2026-01-31  
**Priority Issues from Overnight**

---

## 🔴 URGENT: StantonTimes Cookie Authentication

**Issue:** bird CLI failing to search for @TheStantonTimes mentions  
**Time detected:** 3:15 AM (quiet hours, logged for morning)  
**Impact:** Engagement monitoring blocked

**Error:**
- Safari/Chrome cookie warnings
- Search returns empty (auth failure)
- Firefox cookie path may be incorrect

**Fix needed:**
```bash
# 1. Verify Firefox cookies path
ls -la /Users/zachgonser/clawd/.credentials/firefox-cookies.sqlite

# 2. Check if cookies are fresh (< 30 days old)
stat -f "%Sm" /Users/zachgonser/clawd/.credentials/firefox-cookies.sqlite

# 3. May need to run refresh script manually
/Users/zachgonser/clawd/scripts/refresh-twitter-cookies.sh

# 4. Or re-authenticate bird CLI from logged-in Firefox
```

**Workaround:** Recent tweets posted fine, only mention monitoring affected

---

## ✅ Privacy Framework Complete

**Status:** PRIVACY-FRAMEWORK.md created (9KB)  
**Contents:**
- 4-tier data classification (P0-P3)
- Business unit boundaries
- Approval workflows
- Technical safeguards

**Next:** Read and validate, adjust if needed

---

## 📋 Stage 0 Progress

**Completed today:**
- [x] Privacy framework designed ✅
- [x] Morning briefing cron fixed ✅

**Remaining:**
- [ ] Skills audit (4-6 hours this weekend)
- [ ] Monitor-Agent burn-in completes (tonight 7:27 PM)
- [ ] 2 week stability validation

---

## 🌅 Morning Briefing Test

**Tomorrow 8 AM:** First test of fixed morning briefing cron  
**Watch for:** Does it deliver successfully to Discord DM?

---

*Review this file first thing in the morning*
