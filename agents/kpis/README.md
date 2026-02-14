# KPI Registry - Canonical Metric Definitions

**Version:** 1.0  
**Created:** 2026-02-14  
**Status:** Phase 4 Track 2 - Complete

## Overview

The KPI Registry is VentureOS's canonical metric definition system that bridges **human language ↔ machine formulas**. It provides:

- **32 KPI definitions** across 8 agents (3-4 KPIs each)
- **Machine-readable formulas** connected to real data sources
- **Human-readable explanations** for stakeholders
- **Threshold-based performance levels** (excellent → critical)
- **TypeScript API** for computation and visualization

## Architecture

```
~/clawd/agents/kpis/
├── schema.json                          # JSON Schema for KPI definitions
├── README.md                            # This file
├── DESIGN-DECISIONS.md                  # Design rationale
│
├── oracle_citation_accuracy.json        # 4 Oracle KPIs
├── oracle_knowledge_gap_detection.json
├── oracle_cross_domain_connections.json
├── oracle_research_depth.json
│
├── atlas_deployment_success.json        # 6 Atlas KPIs
├── atlas_mttr.json
├── atlas_pylon_uptime.json
├── atlas_warp_in_success.json
├── atlas_backup_success.json
├── atlas_incident_response.json
│
├── sentinel_*.json                      # 4 Sentinel KPIs
├── verifier_*.json                      # 4 Verifier KPIs
├── archivist_*.json                     # 4 Archivist KPIs
├── synth_*.json                         # 4 Synth KPIs
├── echo_*.json                          # 4 Echo KPIs
└── nexus_*.json                         # 4 Nexus KPIs
```

**TypeScript API:**

```
~/clawd/ventureos/lib/
├── kpi-registry.ts                      # Main KPI Registry library
└── __tests__/
    └── kpi-registry.test.ts             # Jest test suite
```

## Quick Start

### 1. Load and Compute a KPI

```typescript
import { loadKPI, computeKPI } from '~/clawd/ventureos/lib/kpi-registry';

// Method 1: Use KPI instance
const kpi = await loadKPI('oracle_citation_accuracy');
const value = await kpi.compute('2026-02-14');
console.log(`Oracle citation accuracy: ${value}%`);

// Method 2: Direct computation
const value2 = await computeKPI('atlas_mttr', '2026-02-14');
console.log(`Atlas MTTR: ${value2} minutes`);
```

### 2. Explain a KPI

```typescript
import { loadKPI } from '~/clawd/ventureos/lib/kpi-registry';

const kpi = await loadKPI('oracle_citation_accuracy');
const explanation = kpi.explain(87.5);

console.log(explanation);
// Output:
// **Citation Accuracy** (oracle_citation_accuracy)
// How often does Oracle's research include proper citations?
//
// **How it's calculated:**
// claims_with_citations ÷ total_claims × 100
//
// **Current value:** 87.5% 🟡
// **Performance level:** good
//
// **Thresholds:**
// - Excellent: 95.0%
// - Good: 85.0%
// - Acceptable: 70.0%
// - Poor: 50.0%
```

### 3. Compute All KPIs for an Agent

```typescript
import { computeAgentKPIs } from '~/clawd/ventureos/lib/kpi-registry';

const results = await computeAgentKPIs('oracle', '2026-02-14');

for (const [kpi_id, result] of results.entries()) {
  console.log(`${kpi_id}: ${result.value} (${result.threshold_level})`);
}

// Output:
// oracle_citation_accuracy: 87.5 (good)
// oracle_knowledge_gap_detection: 2.3 (good)
// oracle_cross_domain_connections: 4.1 (good)
// oracle_research_depth: 6.2 (good)
```

### 4. Query by Category

```typescript
import { getKPIsByCategory } from '~/clawd/ventureos/lib/kpi-registry';

const qualityKPIs = await getKPIsByCategory('quality');
console.log(`Found ${qualityKPIs.length} quality KPIs`);

qualityKPIs.forEach(kpi => {
  console.log(`- ${kpi.agent_id}: ${kpi.name}`);
});
```

## KPI Definition Format

Each KPI is defined in a JSON file following this structure:

```json
{
  "kpi_id": "oracle_citation_accuracy",
  "agent_id": "oracle",
  "category": "quality",
  "name": "Citation Accuracy",
  "description": "Technical description of what is measured",
  "stakeholder_description": "Non-technical explanation for users",
  
  "formula": {
    "type": "ratio",
    "numerator": "claims_with_citations",
    "denominator": "total_claims",
    "scale": 100
  },
  
  "data_sources": [
    {
      "table": "interaction_logs",
      "filter": "agent_id = 'oracle' AND action_type = 'research_output'",
      "field": "metadata"
    }
  ],
  
  "thresholds": {
    "excellent": 0.95,
    "good": 0.85,
    "acceptable": 0.70,
    "poor": 0.50,
    "direction": "higher_is_better"
  },
  
  "visualization": {
    "dashboard_section": "oracle_tactical_overlay",
    "chart_type": "line",
    "update_frequency": "daily",
    "color_scheme": "success_danger"
  },
  
  "audit_trail": {
    "created": "2026-02-14",
    "last_modified": "2026-02-14",
    "change_log": []
  }
}
```

## Formula Types

### 1. Ratio

**Usage:** Divide numerator by denominator, optionally scale

```json
{
  "type": "ratio",
  "numerator": "successful_deployments",
  "denominator": "total_deployments",
  "scale": 100
}
```

**Examples:**
- `oracle_citation_accuracy` - percentage of cited claims
- `atlas_deployment_success` - deployment success rate

### 2. Percentage

**Usage:** Same as ratio, but explicitly scale to 100

```json
{
  "type": "percentage",
  "numerator": "uptime_minutes",
  "denominator": "total_minutes",
  "scale": 100
}
```

**Examples:**
- `atlas_pylon_uptime` - infrastructure uptime %
- `verifier_test_coverage` - code coverage %

### 3. Count

**Usage:** Sum or count a field

```json
{
  "type": "count",
  "field": "bugs_detected",
  "aggregation": "sum"
}
```

**Examples:**
- `verifier_bug_detection_pre_release` - bugs caught
- `synth_creation_velocity` - items created per week

### 4. Average

**Usage:** Average value of a field

```json
{
  "type": "average",
  "field": "recovery_time_minutes",
  "aggregation": "avg"
}
```

**Examples:**
- `atlas_mttr` - mean time to recovery
- `oracle_research_depth` - avg sources per task

### 5. Threshold

**Usage:** Direct value comparison against thresholds

```json
{
  "type": "threshold",
  "field": "response_time_seconds"
}
```

**Examples:**
- `sentinel_threat_detection_latency` - detection time

### 6. Custom

**Usage:** Custom computation function (for complex formulas)

```json
{
  "type": "custom",
  "custom_function": "computeInnovationScore"
}
```

**Examples:**
- `synth_innovation_score` - composite novelty metric

## Data Sources

KPIs reference real database tables:

### Primary Tables

1. **psionic_stats** - Agent performance snapshots (daily)
   - Fields: `psionic_mastery`, `energy`, `shields`, `warp_technology`, etc.
   - Filter by: `agent_id`, `snapshot_date`

2. **interaction_logs** - Action and event logs
   - Fields: `action_type`, `status`, `metadata`, `duration_minutes`
   - Filter by: `agent_id`, `action_type`, `created_at`

3. **khala_network** - Agent affinity and collaboration
   - Fields: `affinity`, `interaction_count`
   - Filter by: `agent_a`, `agent_b`

4. **psionic_ranks** - XP and rank progression
   - Fields: `xp`, `rank`, `xp_from_missions`
   - Filter by: `agent_id`

### Future Tables (Planned)

- `ops_agent_memory` - Observational memory system
- `rpg_warp_tech_inputs` - Warp technology contributions

## Threshold System

Each KPI defines 4 performance levels:

| Level | Emoji | Meaning |
|-------|-------|---------|
| **Excellent** | 🟢 | Exceeds expectations, best-in-class |
| **Good** | 🟡 | Meets goals, solid performance |
| **Acceptable** | 🟠 | Minimum viable, needs improvement |
| **Poor** | 🔴 | Below acceptable, action required |
| **Critical** | 🚨 | Below poor threshold, urgent action |

**Direction:**
- `higher_is_better` (default) - Quality, success rates, uptime
- `lower_is_better` - Latency, MTTR, error rates

## Categories

KPIs are organized into 6 categories:

1. **Quality** - Accuracy, thoroughness, citation rates
2. **Performance** - Speed, latency, response times
3. **Impact** - Value delivered, innovation, reuse
4. **Reliability** - Uptime, success rates, consistency
5. **Security** - Coverage, detection accuracy, false positives
6. **Collaboration** - Coordination, handoffs, teamwork

## KPI Coverage by Agent

| Agent | KPIs | Categories |
|-------|------|------------|
| **Oracle** (Zeratul) | 4 | Quality (2), Impact (2) |
| **Atlas** (Probe) | 6 | Reliability (3), Performance (3) |
| **Sentinel** (Immortal) | 4 | Quality (2), Performance (1), Security (1) |
| **Verifier** (Observer) | 4 | Quality (4) |
| **Archivist** (Dark Archon) | 4 | Reliability (1), Impact (2), Quality (1) |
| **Synth** (Artanis) | 4 | Performance (1), Quality (1), Impact (2) |
| **Echo** (High Templar) | 4 | Quality (1), Collaboration (1), Impact (1), Performance (1) |
| **Nexus** (Nexus) | 4 | Reliability (1), Performance (1), Quality (1), Collaboration (1) |

**Total:** 32 KPIs across 8 agents

## Integration with Role Cards

Role cards (Phase 4 Track 1) reference KPIs via `metrics[].kpi_id`:

```json
{
  "agentId": "oracle",
  "metrics": [
    {
      "name": "Citation accuracy",
      "kpi_id": "oracle_citation_accuracy",
      "category": "quality"
    },
    {
      "name": "Knowledge gap detection",
      "kpi_id": "oracle_gap_detection",
      "category": "impact"
    }
  ]
}
```

**Dashboard integration:**
- Role cards display current KPI values with threshold colors
- Tactical overlays show trend charts (line/bar/sparkline)
- KPI Registry provides `compute()` and `explain()` methods

## Testing

Run the test suite:

```bash
cd ~/clawd/ventureos
npm test lib/__tests__/kpi-registry.test.ts
```

**Test coverage:**
- Definition loading (all 32 KPIs)
- Formula type validation (ratio, count, average, etc.)
- Threshold determination (higher/lower is better)
- Explanation generation (human-readable output)
- Agent and category queries
- Data source validation
- Schema compliance (required fields, valid enums)
- Batch operations (compute all agent KPIs)

## API Reference

### Core Functions

#### `loadKPI(kpi_id: string): Promise<KPI>`
Load a KPI with `compute()` and `explain()` methods.

#### `loadKPIDefinition(kpi_id: string): Promise<KPIDefinition>`
Load raw JSON definition.

#### `loadAllKPIs(): Promise<Map<string, KPI>>`
Load all KPIs as a map.

#### `computeKPI(kpi_id: string, date?: string, db?: Database): Promise<number>`
Compute KPI value for a date (defaults to today).

#### `explainKPI(kpi_id: string, definition: KPIDefinition, currentValue?: number): string`
Generate human-readable explanation.

### Batch Operations

#### `computeAgentKPIs(agent_id: string, date?: string): Promise<Map<string, KPIComputationResult>>`
Compute all KPIs for an agent.

#### `getKPIsByCategory(category: string): Promise<KPIDefinition[]>`
Get all KPIs in a category.

#### `getAgentsWithKPIs(): Promise<string[]>`
Get list of agents with defined KPIs.

### Utility Functions

#### `determineThresholdLevel(value: number, thresholds: Thresholds): string`
Determine performance level from value.

## Adding New KPIs

1. **Create JSON definition** in `~/clawd/agents/kpis/`
   - Use `schema.json` for validation
   - Follow naming convention: `{agent}_{metric}.json`

2. **Define data sources**
   - Reference existing database tables
   - Use SQL filters to scope data

3. **Set evidence-based thresholds**
   - Review historical data
   - Consult agent owner for baseline

4. **Test the KPI**
   ```bash
   npm test lib/__tests__/kpi-registry.test.ts
   ```

5. **Update role card** (if needed)
   - Add `kpi_id` reference in agent's role card
   - Link to dashboard section

## Troubleshooting

### "KPI definition not found"
- Check file name matches `kpi_id`
- Ensure file is in `~/clawd/agents/kpis/`

### "Failed to fetch from {table}"
- Verify table exists in database
- Check SQL filter syntax
- Ensure date column matches table schema

### "Division by zero"
- Ensure denominator field has fallback value
- Check data sources return valid data

## Future Enhancements

- [ ] Real-time KPI streaming (WebSocket updates)
- [ ] Historical trend analysis (7-day, 30-day averages)
- [ ] Anomaly detection (spike/drop alerts)
- [ ] KPI correlations (identify related metrics)
- [ ] Custom aggregation windows (hourly, weekly)
- [ ] KPI forecasting (ML-based predictions)

## Changelog

### 2026-02-14 - v1.0
- Initial release with 32 KPI definitions
- TypeScript API with compute/explain methods
- Jest test suite with full coverage
- Integration with Role Cards (Phase 4 Track 1)

---

**Maintainer:** Archivist  
**Reviewers:** Oracle (research KPIs), Atlas (operational KPIs), Verifier (quality validation)
