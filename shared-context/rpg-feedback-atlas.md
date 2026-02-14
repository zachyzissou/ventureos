# RPG Integration Feedback — Atlas

**Date:** 2026-02-14 00:51 CST  
**Status:** Complete (2/6)

## 1. SPD Formula Revision

**Current:** Tied to P95 latency only

**Recommendation:** Blend latency and recovery time (MTTR).

```
SPD = 0.7 × (100 - p95_latency_s) + 0.3 × (100 - MTTR_minutes)
```

**Rationale:** Deployment frequency is more "throughput" than speed. Recovery speed matters more for reliability work.

## 2. Stat Architecture

**Don't add a 3rd primary stat.** If RCH or uptime are needed, use as **secondary badge/stat** instead.

Keep the 4-stat primary system (TRU/SPD/WIS/CRE).

## 3. Sentinel Affinity Adjustment

**Current:** 0.60  
**Recommendation:** **0.70**

**Rationale:** Infra work needs tighter guardrails than 0.60 implies. Atlas-Sentinel collaboration is critical for system reliability.

## 4. RPG Class: Ranger vs Commander

**Keep "Ranger"** — fast, reliable, avoids traps. Fits the ops-engineer flavor.

**Not "Commander"** — too managerial, doesn't capture the hands-on infrastructure work.

## 5. Missing Metrics for Atlas

Current plan missing key reliability metrics:

1. **Change failure rate** — % of deployments causing incidents
2. **Error-budget burn** — SLO violation rate
3. **Missed schedule rate** — Cron reliability
4. **Retry rate** — System resilience under load
5. **Infra headroom** — Disk/CPU/memory capacity
6. **Alert noise ratio** — False positive rate

**Why they matter:** These are foundational DORA/SRE metrics. Without them, SPD/TRU stats miss critical reliability signals.

---

**Summary:** Blend MTTR into SPD, keep 4 primary stats (RCH as secondary), bump Sentinel affinity to 0.70, keep Ranger class, add 6 missing reliability metrics.
