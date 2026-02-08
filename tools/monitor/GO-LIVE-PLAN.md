# Monitor-Agent Go-Live Plan

**Decision Point:** 2026-01-31 16:00 CST (24 hours from now)  
**Current Status:** Clean (0 issues detected since 21:53 CST)

---

## 24-Hour Validation Checklist

Before enabling healing, verify:

### ✅ Detector Stability
- [ ] No false positives in 24 hours
- [ ] All detectors running without errors
- [ ] Database integrity maintained
- [ ] Log rotation working properly

### ✅ System Health
- [ ] Monitor-Agent process stable (no crashes)
- [ ] Memory usage normal (<500MB)
- [ ] CPU usage low (<5% avg)
- [ ] No launchd restart loops

### ✅ Issue Detection Accuracy
Review logs for any real issues that were detected:
```bash
sqlite3 data/monitor.db "SELECT severity, system, message, detected_at FROM issues WHERE detected_at > datetime('now', '-24 hours') ORDER BY detected_at DESC;"
```

Expected: Only legitimate issues (if any)

---

## Go-Live Procedure

If validation passes, enable healing in phases:

### Phase 1: Low-Risk Healers (Day 1)
Enable healers that can't cause data loss:

```yaml
# config/config.yaml
dry_run: false  # ⚠️ ENABLES HEALING

healing:
  enabled: true
  max_attempts: 3
  cooldown_minutes: 30
  
  # Start with safe healers only
  enabled_healers:
    - git        # Auto-commit (can be reverted)
    - disk       # Cleanup only (has size limits)
```

**Monitor closely for 24h** - Check every 2-4 hours

### Phase 2: Medium-Risk Healers (Day 2)
If Phase 1 stable, add:

```yaml
enabled_healers:
  - git
  - disk
  - cron       # Disable/re-enable jobs (reversible)
  - obsidian   # Trigger extraction (idempotent)
```

### Phase 3: High-Risk Healers (Day 3+)
Only after Phase 2 is proven stable:

```yaml
enabled_healers:
  - git
  - disk
  - cron
  - obsidian
  - gateway    # ⚠️ Restart gateway (disruptive)
  - api        # ⚠️ Could affect external services
```

---

## Rollback Plan

If ANY healing action causes problems:

1. **Immediate:** Set `dry_run: true` in config
2. **Restart:** Monitor-Agent will reload config
3. **Investigate:** Check `data/monitor.db` healing_attempts table
4. **Fix:** Address root cause before re-enabling

**Rollback command:**
```bash
cd /Users/zachgonser/clawd/monitor
openclaw "dry_run: true" >> config/config.yaml  # Emergency disable
./manage.sh restart
```

---

## Success Criteria

Monitor-Agent is "production ready" when:

- ✅ 24h clean run (no false positives)
- ✅ Phase 1 healers run successfully for 24h
- ✅ No unexpected side effects
- ✅ Healing attempts logged correctly
- ✅ Cooldowns prevent spam
- ✅ Manual approval prompts work (if configured)

---

## Review at 2026-01-31 16:00 CST

**Questions to answer:**

1. Did any detectors fire in the last 24h?
2. Were those detections accurate?
3. Is the system stable (no crashes/errors)?
4. Are we confident the healers won't cause harm?

**If YES to all:** Enable Phase 1 healers  
**If NO to any:** Investigate, fix, wait another 24h

---

## Notes

- Dry-run mode is SAFE - no healing happens, only logging
- We've already proven the detectors work correctly
- The risk is in the HEALERS, not the detectors
- Incremental rollout reduces blast radius
- We can always roll back to dry-run mode

**Better to wait an extra day than to break something in production.**
