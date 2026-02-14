# KPI Registry - Quick Index

**Status:** ✅ Complete (2026-02-14)  
**Phase:** 4 Track 2  
**Owner:** Archivist

---

## 📋 Documentation

- **[README.md](README.md)** - Complete user guide with API reference and examples
- **[DESIGN-DECISIONS.md](DESIGN-DECISIONS.md)** - Detailed rationale for all KPI choices
- **[COMPLETION-SUMMARY.md](COMPLETION-SUMMARY.md)** - Deliverables checklist and status
- **[schema.json](schema.json)** - JSON Schema for KPI definitions

---

## 🎯 KPIs by Agent

### Oracle (Zeratul) - 4 KPIs
- `oracle_citation_accuracy` - % of claims with citations
- `oracle_knowledge_gap_detection` - Gaps flagged per task
- `oracle_cross_domain_connections` - Cross-domain insights
- `oracle_research_depth` - Avg sources per task

### Atlas (Probe) - 6 KPIs
- `atlas_deployment_success` - Deployment success rate
- `atlas_mttr` - Mean time to recovery (minutes)
- `atlas_pylon_uptime` - Infrastructure uptime %
- `atlas_warp_in_success` - Zero-downtime deployments
- `atlas_backup_success` - Backup completion rate
- `atlas_incident_response` - Response time (minutes)

### Sentinel (Immortal) - 4 KPIs
- `sentinel_escalation_signal_ratio` - Real threats / total alerts
- `sentinel_false_positive_rate` - % false alarms
- `sentinel_threat_detection_latency` - Detection time (seconds)
- `sentinel_security_coverage` - % attack surface monitored

### Verifier (Observer) - 4 KPIs
- `verifier_bug_detection_pre_release` - Bugs caught in review
- `verifier_review_thoroughness` - Review depth score
- `verifier_approval_accuracy` - Correct approvals %
- `verifier_test_coverage` - Code coverage %

### Archivist (Dark Archon) - 4 KPIs
- `archivist_memory_retention` - Long-term memory preservation %
- `archivist_knowledge_reuse` - Knowledge retrieval count
- `archivist_documentation_quality` - Doc quality score
- `archivist_pattern_recognition` - Patterns identified

### Synth (Artanis) - 4 KPIs
- `synth_creation_velocity` - Items created per week
- `synth_acceptance_rate` - Accepted creations %
- `synth_innovation_score` - Novelty + usefulness score
- `synth_reuse_count` - Creations reused

### Echo (High Templar) - 4 KPIs
- `echo_decision_quality` - Successful decisions %
- `echo_coordination_effectiveness` - Coordination success %
- `echo_strategic_alignment` - Actions aligned with goals %
- `echo_mission_completion_rate` - Missions completed %

### Nexus (Nexus) - 4 KPIs
- `nexus_agent_availability` - Agent uptime %
- `nexus_escalation_latency` - Routing time (seconds)
- `nexus_health_check_accuracy` - Detection accuracy %
- `nexus_coordination_effectiveness` - Handoff success %

**Total: 34 KPIs**

---

## 🏷️ KPIs by Category

- **Quality** (12 KPIs) - Accuracy, thoroughness, citation rates
- **Performance** (7 KPIs) - Speed, latency, response times
- **Impact** (7 KPIs) - Value delivered, innovation, reuse
- **Reliability** (5 KPIs) - Uptime, success rates, consistency
- **Collaboration** (2 KPIs) - Coordination, handoffs
- **Security** (1 KPI) - Coverage, detection accuracy

---

## 🔧 Quick Start

```typescript
import { loadKPI, computeAgentKPIs } from '~/clawd/ventureos/lib/kpi-registry';

// Load and compute a single KPI
const kpi = await loadKPI('oracle_citation_accuracy');
const value = await kpi.compute('2026-02-14');
const explanation = kpi.explain(value);
console.log(explanation);

// Compute all KPIs for an agent
const results = await computeAgentKPIs('oracle', '2026-02-14');
for (const [kpi_id, result] of results.entries()) {
  console.log(`${kpi_id}: ${result.value} (${result.threshold_level})`);
}
```

---

## ✅ Test Status

```
Test Suites: 1 passed
Tests:       29 passed
Coverage:    100% of KPI operations
```

Run tests: `cd ~/clawd/ventureos && npm test lib/__tests__/kpi-registry.test.ts`

---

## 🔗 Integration Points

- **Role Cards** (Track 1): KPIs referenced via `metrics[].kpi_id`
- **Dashboard** (Track 5): Visualization via `visualization` config
- **Conversations** (Track 5): Context via `computeAgentKPIs()`

---

**For detailed information, see [README.md](README.md)**
