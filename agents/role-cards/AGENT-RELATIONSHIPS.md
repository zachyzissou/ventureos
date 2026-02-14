# Agent Relationship Map

**Quick reference for role card interactions and conversation dynamics**

---

## Agent Topology

```
USER
  │
  ├─→ ECHO (CEO Orchestrator) ──────────────────┐
  │     │                                        │
  │     ├─→ ORACLE (Research & Foresight)       │
  │     │     │                                  │
  │     │     └─→ ARCHIVIST (Knowledge Keeper)  │
  │     │           ↑                            │
  │     │           │ (memory retrieval)         │
  │     │           │                            │
  │     ├─→ SYNTH (Implementation)              │
  │     │     │                                  │
  │     │     └─→ VERIFIER (Quality Assurance)  │
  │     │           │                            │
  │     │           └─→ SENTINEL (Security)     │
  │     │                 │                      │
  │     └─→ ATLAS (Infrastructure & Ops) ←──────┘
  │           │
  │           └─→ NEXUS (Mission Control)
  │
  └─→ (Direct agent interaction)
```

---

## Conversation Dynamics

### 🔴 Conflict Pairs (Productive Friction)

**Low Affinity (0.40-0.70) - Programmed to Challenge**

| Pair | Affinity | Conflict Dynamic | Example Challenge |
|------|----------|------------------|-------------------|
| **Sentinel ↔ Atlas** | 0.70 | Security vs Velocity | "Deployment without security review creates vulnerabilities" |
| **Sentinel ↔ Synth** | 0.60 | Security Review vs Iteration | "Input validation bypass detected in latest commit" |
| **Verifier ↔ Synth** | 0.65 | Quality Gates vs Speed | "Test coverage 55%, below 70% threshold" |
| **Oracle ↔ Synth** | 0.65 | Research Rigor vs Implementation | "Implementation deviates from researched best practices" |
| **Oracle ↔ Atlas** | 0.70 | Strategic Foresight vs Ops | "Current approach creates long-term technical debt" |

**Purpose:** Prevent groupthink, ensure competing perspectives are heard

**Mechanism (VOXYZ-inspired):**
- Low affinity increases challenge probability in conversations
- Conversation orchestrator selects "challenge" interaction type more frequently
- Challenges must include specific fact + alternative recommendation

---

### 🟢 Alliance Pairs (Smooth Collaboration)

**High Affinity (0.75-0.90) - Programmed to Collaborate**

| Pair | Affinity | Alliance Dynamic | Example Collaboration |
|------|----------|------------------|----------------------|
| **Oracle ↔ Archivist** | 0.85 | Research + Memory | "Retrieving historical patterns for current research topic" |
| **Oracle ↔ Verifier** | 0.80 | Research + Quality | "Verifying citations and fact-checking research claims" |
| **Synth ↔ Atlas** | 0.85 | Implementation + Deployment | "Build artifact ready, coordinating deployment pipeline" |
| **Sentinel ↔ Verifier** | 0.80 | Security + Quality | "Collaborating on heuristic violation detection patterns" |
| **Sentinel ↔ Archivist** | 0.75 | Security + Audit | "Coordinating security audit log structure and archival" |
| **Verifier ↔ Archivist** | 0.75 | Quality Metrics + Logging | "Logging quality metrics for trend analysis" |
| **Echo ↔ Oracle** | 0.85 | Strategy + Research | "Research-backed recommendations inform strategic decisions" |
| **Echo ↔ Sentinel** | 0.80 | Strategy + Security | "Deferring to security policy on threat assessment" |
| **Echo ↔ Atlas** | 0.80 | Strategy + Operations | "Coordinating on operational execution and incident response" |
| **Echo ↔ Archivist** | 0.75 | Strategy + Context | "Historical context and KPI trends inform strategic planning" |
| **Nexus ↔ Echo** | 0.90 | Operations + Strategy | "Escalating blockers, providing operational context for decisions" |
| **Nexus ↔ Atlas** | 0.85 | Coordination + Ops | "Infrastructure health monitoring and incident coordination" |
| **Nexus ↔ Archivist** | 0.80 | Coordination + Metrics | "Operational metrics logging and historical trend retrieval" |

**Purpose:** Efficient collaboration on shared goals, high-trust handoffs

**Mechanism:**
- High affinity increases agreement probability
- Smooth handoffs with minimal validation overhead
- Frequent interaction without conflict

---

## Input/Output Contracts

### Validated Handoff Pairs

**All contracts validated for format + type compatibility:**

| From | To | Type | Format | Use Case |
|------|-----|------|--------|----------|
| **Oracle** | Archivist | `knowledge_artifact` | json | Research findings archival |
| **Oracle** | User | `research_report` | markdown | Research delivery |
| **Oracle** | Verifier | `fact_check_response` | json | Fact verification |
| **Atlas** | Echo | `incident_report` | json | Incident escalation |
| **Atlas** | User | `deployment_status` | markdown | Deployment updates |
| **Atlas** | Archivist | `operational_log` | json | Operations archival |
| **Sentinel** | Echo | `security_alert` | markdown | Security incidents |
| **Sentinel** | Verifier | `security_violation` | markdown | Heuristic violations |
| **Sentinel** | Archivist | `security_audit_log` | json | Security event archival |
| **Sentinel** | System | `permission_decision` | json | Real-time enforcement |
| **Verifier** | Echo | `qa_report` | markdown | Quality alerts |
| **Verifier** | Oracle | `research_review` | json | Research quality feedback |
| **Verifier** | Synth | `code_review_result` | json | Code review feedback |
| **Verifier** | Sentinel | `heuristic_validation_result` | json | Violation triage |
| **Verifier** | Archivist | `quality_metrics_log` | json | Quality metric logging |
| **Archivist** | Oracle | `memory_context` | json | Memory retrieval |
| **Archivist** | Echo | `kpi_report` | json | KPI trend analysis |
| **Synth** | Verifier | `code_review_request` | json | Code review submission |
| **Synth** | Atlas | `build_artifact` | json | Deployment handoff |
| **Synth** | User | `implementation_complete` | markdown | Feature delivery |
| **Synth** | Archivist | `code_artifact` | json | Implementation archival |
| **Echo** | User | `strategic_decision` | markdown | Decision communication |
| **Echo** | Oracle | `task_routing` | json | Research task assignment |
| **Echo** | Synth | `implementation_task` | json | Implementation assignment |
| **Echo** | Sentinel | `policy_check_request` | markdown | Security policy review |
| **Echo** | Archivist | `decision_record` | json | Decision archival |
| **Echo** | System | `system_directive` | json | Agent recalibration |
| **Nexus** | Echo | `blocker_escalation` | json | Blocker escalation |
| **Nexus** | User | `status_report` | markdown | System health updates |
| **Nexus** | Archivist | `operational_metrics` | json | Operational metrics logging |
| **Nexus** | System | `health_check_result` | json | System health status |

**Total:** 31 validated handoff contracts

---

## Hard Ban Enforcement Topology

### Tier 1: Infrastructure (Permission-Based)

**Enforced by:** Sentinel + System

| Agent | Infrastructure Bans | Enforcement |
|-------|---------------------|-------------|
| **Oracle** | No database writes, No deployments, No production API access | permission_check |
| **Atlas** | No deployments without Sentinel approval, No DB deletes without backup | permission_check |
| **Sentinel** | No policy modification, No access to other agents' credentials | permission_check, api_key_restriction |
| **Verifier** | No deployment without 70% test coverage, No modifying outputs | permission_check |
| **Synth** | No production deployment, No commits to main, No merge without approval | permission_check |
| **Echo** | No direct implementation, No direct deployment | permission_check |
| **Nexus** | No strategic decisions, No direct agent control | permission_check |
| **Archivist** | No data modification (append-only), No deletions without approval | permission_check |

### Tier 2: Heuristic (Pattern-Based → Verifier)

**Enforced by:** Sentinel + Verifier

| Agent | Heuristic Bans | Detection | FPR |
|-------|----------------|-----------|-----|
| **Oracle** | No uncited claims, No made-up numbers, No unverified comparisons | citation_detector, number_source_tracker | 10-20% |
| **Atlas** | No high-traffic deployments without approval, No >50% capacity changes | pattern_matcher | 5% |
| **Sentinel** | No deployment with vulnerabilities, No out-of-role permissions | pattern_matcher | 5-8% |
| **Verifier** | No missing citations, No missing Fact+Action, No >10% filler language | citation_detector, pattern_matcher | 12-25% |
| **Synth** | No PRs <70% coverage, No implementation without acceptance criteria | pattern_matcher | 5-10% |
| **Echo** | No decisions without consulting experts, No conflict resolution without hearing all sides | pattern_matcher | 10-15% |
| **Nexus** | No delayed escalation of critical blockers (>5 min), No status without metrics | pattern_matcher | 2-8% |
| **Archivist** | No duplicate archival, No retrieval results <0.3 relevance | pattern_matcher | 5-10% |

### Tier 3: Quality (Training Guidelines)

**Not runtime-enforced** - Examples provided for training

| Agent | Quality Guidelines | Examples |
|-------|-------------------|----------|
| **All** | No vague language, No filler phrases | "probably", "sounds good", "interesting" |
| **Oracle** | No hedging without reason | "It's unclear" (why?), "This might work" (under what conditions?) |
| **Verifier** | No vague review feedback, Always provide suggestions | "This needs work" (what specifically?) |
| **Synth** | No vague commit messages, Complex logic needs comments | "Fixed stuff", "Changes", "WIP" |

---

## Escalation Paths

### Critical (Priority: Critical)

```
Agent → Echo → User
```

**Examples:**
- Sentinel: Prompt injection detected (confidence >0.7)
- Atlas: Deployment fails with unrecoverable error
- Sentinel: Critical security incident
- Nexus: Agent heartbeat missed >10 minutes

### High (Priority: High)

```
Agent → Echo (for strategic intervention) OR
Agent → Sentinel (for security review) OR
Agent → User (for clarification)
```

**Examples:**
- Sentinel: Repeated permission denials from same agent (>5/hour)
- Atlas: Monitoring alert critical >5 minutes
- Oracle: Legal/compliance topic detected
- Verifier: Critical security vulnerability in code review

### Medium (Priority: Medium)

```
Agent → Echo (for decision) OR
Agent → User (for clarification)
```

**Examples:**
- Oracle: Conflicting sources with high confidence
- Verifier: Agent rework rate >30% for 7 days
- Echo: Conflicting recommendations from multiple agents

### Low (Priority: Low)

```
Agent → Appropriate specialist OR
Auto-resolve if conditions change
```

**Examples:**
- Oracle: Research scope >4 hours (propose phased approach)
- Synth: Implementation >8 hours (task breakdown)
- Archivist: Duplicate detection confidence <0.5

---

## Conversation Orchestration (Phase 4 Track 5)

**Status:** Role cards ready, implementation pending Week 5-7

### Speaking Order

**Affinity-driven:** High-affinity pairs speak consecutively

Example conversation flow:
```
User → Echo (task routing) →
  Oracle (research) →
    Archivist (memory retrieval) →  [high affinity 0.85]
  Oracle (synthesis) →
    Verifier (quality review) →     [high affinity 0.80]
  Verifier (approval) →
    Synth (implementation) →        [conflict pair 0.65]
  Synth (code review request) →
    Verifier (review) →
  Verifier (approval) →
    Atlas (deployment) →            [high affinity from Synth 0.85]
  Atlas (status) →
    Echo (decision record) →
User (notification)
```

### Interaction Types

**Based on affinity:**

| Affinity | Challenge % | Agreement % | Opinion % | Question % |
|----------|-------------|-------------|-----------|------------|
| **<0.3** (Very Low) | 25% | 10% | 35% | 30% |
| **0.3-0.6** (Low-Med) | 15% | 25% | 30% | 30% |
| **0.6-0.8** (Med-High) | 5% | 40% | 25% | 30% |
| **>0.8** (High) | 2% | 50% | 20% | 28% |

### Challenge Rate Limiting

**Security measure (Sentinel requirement):**
- Max 5 challenges per agent pair per hour
- If limit hit repeatedly → flag for human review (potential attack)
- Human-in-loop for affinity <0.3 + challenge interaction

---

## File Locations

```
~/clawd/agents/role-cards/
├── schema.json              # Role card JSON Schema
├── [agent].json × 8         # Individual role cards
├── types.ts                 # TypeScript validation
├── DESIGN.md                # Comprehensive design doc
├── README.md                # Quick start guide
├── COMPLETION-SUMMARY.md    # Task completion summary
├── AGENT-RELATIONSHIPS.md   # This file
└── validate-all.js          # Validation script
```

---

## Quick Commands

```bash
# Validate all role cards
cd ~/clawd/agents/role-cards
node validate-all.js

# Load role card in TypeScript
import { loadRoleCard } from './types';
const oracle = await loadRoleCard('oracle');

# Check handoff compatibility
import { validateHandoff, loadAllRoleCards } from './types';
const roleCards = await loadAllRoleCards();
const result = await validateHandoff('oracle', 'archivist', payload, roleCards);
```

---

**Last Updated:** 2026-02-14  
**Phase:** 4 Track 1 Complete  
**Next:** Synth implementation (Week 2)
