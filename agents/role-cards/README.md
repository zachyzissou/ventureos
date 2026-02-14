# Role Card System - Phase 4 Track 1

**Status:** ✅ Complete (ready for Synth implementation)  
**Owner:** Oracle (design) → Synth (implementation)  
**Timeline:** Week 1 design (complete), Week 2 implementation (pending)

---

## Quick Start

### 1. Validate All Role Cards

```bash
cd ~/clawd/agents/role-cards
npm install ajv ajv-formats

# Validate all 8 role cards against schema
node -e "
const fs = require('fs');
const Ajv = require('ajv');
const addFormats = require('ajv-formats');

const ajv = new Ajv();
addFormats(ajv);

const schema = JSON.parse(fs.readFileSync('schema.json', 'utf-8'));
const validate = ajv.compile(schema);

['oracle', 'atlas', 'sentinel', 'verifier', 'archivist', 'synth', 'echo', 'nexus'].forEach(agent => {
  const card = JSON.parse(fs.readFileSync(\`\${agent}.json\`, 'utf-8'));
  const valid = validate(card);
  console.log(\`\${agent}: \${valid ? '✅ VALID' : '❌ INVALID'}\`);
  if (!valid) console.error(validate.errors);
});
"
```

### 2. Load Role Cards in TypeScript

```typescript
import { loadAllRoleCards, validateHandoff } from './types';

// Load all role cards
const roleCards = await loadAllRoleCards();

// Validate handoff between agents
const result = await validateHandoff('oracle', 'archivist', payload, roleCards);
if (!result.valid) {
  console.error('Handoff validation failed:', result.reason);
}
```

### 3. Enforce Hard Bans

```typescript
import { EnforcementEngine } from './types';

const engine = new EnforcementEngine(roleCards);

// Tier 1: Infrastructure enforcement
const allowed = await engine.enforceInfrastructure('oracle', 'database_write');
if (!allowed.allowed) {
  console.error('Permission denied:', allowed.reason);
}

// Tier 2: Heuristic detection
const violations = await engine.enforceHeuristic('oracle', messageContent);
if (violations.length > 0) {
  // Route to Verifier queue for human review
  await routeToVerifier(violations);
}

// Tier 3: Quality logging
const qualityIssues = engine.logQualityViolations('oracle', messageContent);
// Log for training data, don't block
```

---

## File Structure

```
~/clawd/agents/role-cards/
├── schema.json              # JSON Schema for role card validation
├── oracle.json              # Oracle (Zeratul) role card
├── atlas.json               # Atlas (Probe) role card
├── sentinel.json            # Sentinel role card
├── verifier.json            # Verifier (High Templar) role card
├── archivist.json           # Archivist (Observer) role card
├── synth.json               # Synth (Dark Templar) role card
├── echo.json                # Echo (Executor) role card
├── nexus.json               # Nexus role card
├── types.ts                 # TypeScript type definitions + validation functions
├── DESIGN.md                # Comprehensive design rationale + edge cases
└── README.md                # This file
```

---

## Key Concepts

### 1. Three-Tier Enforcement

**Tier 1: Infrastructure** (hard blocks)
- Permission-based enforcement
- Examples: "No direct database writes", "No deployment without approval"
- Implementation: Permission model, API key restrictions

**Tier 2: Heuristic** (soft warnings → Verifier)
- Pattern-based detection
- Examples: "No uncited claims", "No made-up numbers"
- Implementation: Citation detector, number source tracker
- **Accepts 10-20% false positive rate** (routes to human review)

**Tier 3: Quality** (training guidelines)
- Aspirational standards
- Examples: "No vague language", "No filler phrases"
- Implementation: Training data, few-shot examples
- **Not runtime-enforced** (too high false positive rate)

### 2. Input/Output Contracts

Every handoff between agents is validated:

- **Format compatibility:** JSON → JSON, markdown → markdown
- **Type compatibility:** `research_request` → `research_request`
- **Schema validation:** Payload matches expected structure

### 3. Escalation Quality Tracking

**Problem:** VOXYZ has no quality measurement for escalations (agents can spam false alarms).

**Solution:** Track **signal ratio** = validated escalations / total escalations

```json
{
  "qualityTracking": {
    "signalRatioTarget": 0.70,
    "adaptiveSensitivity": true
  }
}
```

If signal ratio drops below target, escalation thresholds auto-adjust to reduce false positives.

### 4. Conversation Directives

**Conflict pairs:** Agents programmed to challenge each other
- Sentinel ↔ Atlas (security vs velocity)
- Verifier ↔ Synth (quality vs speed)

**Alliance pairs:** Agents programmed to collaborate smoothly
- Oracle ↔ Archivist (research + memory)
- Synth ↔ Atlas (implementation + deployment)

---

## Integration Points

### With Personality Protocols

**Location:** `~/clawd/agents/personality-protocols/*.json`

**Relationship:**
- Role card: **What** agent does (domain, contracts, enforcement)
- Personality protocol: **How** agent behaves (tone, style, modifiers)

**Integration:**
```json
{
  "agentId": "oracle",
  "personalityProtocol": "~/clawd/agents/personality-protocols/oracle.json"
}
```

### With KPI Registry (Track 2)

**Location:** `~/clawd/agents/kpis/*.json` (Archivist deliverable, Week 2)

**Relationship:**
- Role card: References KPIs via `metrics[].kpi_id`
- KPI registry: Defines formulas and data sources

**Integration:**
```json
{
  "metrics": [
    {
      "name": "Citation accuracy",
      "kpi_id": "oracle_citation_accuracy"
    }
  ]
}
```

KPI registry will define:
```json
{
  "kpi_id": "oracle_citation_accuracy",
  "formula": { "numerator": "claims_with_citations", "denominator": "total_claims" }
}
```

### With Conversation Orchestration (Track 5)

**Timeline:** Week 5-7

**Role card readiness:**
- ✅ Conversation directives (conflict/alliance pairs)
- ✅ Affinity baseline values
- ✅ Input/output contracts for multi-agent handoffs

**TODO for Track 5:**
- Implement conversation orchestrator
- Add message sanitization (security)
- Implement challenge rate limiting

---

## Implementation Checklist (Synth)

### Week 2 Deliverables

- [ ] Implement `EnforcementEngine` class
  - [ ] Tier 1: Infrastructure permission checks
  - [ ] Tier 2: Heuristic violation detection
  - [ ] Tier 3: Quality violation logging

- [ ] Integrate role card validation into agent initialization
  - [ ] Load role card on agent startup
  - [ ] Validate schema
  - [ ] Cache role card for runtime use

- [ ] Add contract validation to handoff logic
  - [ ] Validate format/type compatibility
  - [ ] Validate payload against schema
  - [ ] Return clear error messages on validation failure

- [ ] Deploy escalation quality tracking
  - [ ] Compute signal ratio per agent
  - [ ] Log escalation outcomes (validated vs false positive)
  - [ ] Implement adaptive sensitivity tuning

- [ ] Test end-to-end with all 8 agents
  - [ ] Validate all 28 agent-to-agent handoffs
  - [ ] Test infrastructure permission denials
  - [ ] Test heuristic violation detection
  - [ ] Verify escalation quality tracking

### Testing Strategy

**Unit tests:**
```typescript
describe('EnforcementEngine', () => {
  test('Infrastructure ban blocks unauthorized action', async () => {
    const result = await engine.enforceInfrastructure('oracle', 'database_write');
    expect(result.allowed).toBe(false);
  });

  test('Heuristic ban detects uncited claim', async () => {
    const violations = await engine.enforceHeuristic('oracle', 'They have 50,000 users.');
    expect(violations.length).toBeGreaterThan(0);
  });
});
```

**Integration tests:**
```typescript
describe('Handoff validation', () => {
  test('Valid handoff succeeds', async () => {
    const result = await validateHandoff('oracle', 'archivist', validPayload, roleCards);
    expect(result.valid).toBe(true);
  });

  test('Format mismatch fails', async () => {
    const result = await validateHandoff('oracle', 'atlas', invalidPayload, roleCards);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('Format mismatch');
  });
});
```

---

## Edge Cases

### 1. Agent Not Found

**Problem:** Reference to agent that doesn't exist yet

**Mitigation:**
- Source/target fields are strings (not enums)
- Validation warns but doesn't fail
- Future agents prefixed with `_future_`

### 2. Circular Dependencies

**Problem:** Agent A → Agent B → Agent A (infinite loop)

**Mitigation:**
- All handoffs include unique `task_id`
- Orchestrator enforces max handoff depth (default: 5)
- Conversations have max duration (default: 10 minutes)

### 3. Schema Evolution

**Problem:** Role cards need to evolve but deployed agents rely on current schema

**Mitigation:**
- Schema versioning (currently v1.0)
- Backward compatibility (new fields optional)
- Migration scripts for major version bumps

---

## FAQ

### Q: Can I modify role cards at runtime?

**A:** Not recommended. Role cards are loaded at agent initialization. To change a role card:
1. Update the JSON file
2. Restart the agent
3. (Future) Implement dynamic role card reloading with human approval

### Q: What if an agent needs to send output in multiple formats?

**A:** Define separate output contracts for each target:
```json
{
  "outputs": [
    { "target": "user", "type": "research_report", "format": "markdown" },
    { "target": "archivist", "type": "knowledge_artifact", "format": "json" }
  ]
}
```

### Q: How do I add a new escalation trigger?

**A:** 
1. Edit the role card JSON
2. Add new trigger to `escalation.triggers[]`
3. Specify condition, action, target, priority
4. Restart agent
5. (Future) Implement agent-proposed escalation trigger workflow

### Q: What's the difference between `conflict_pairs` and `alliance_pairs`?

**A:**
- **Conflict pairs:** Low affinity (0.40-0.70), programmed to challenge each other
- **Alliance pairs:** High affinity (0.75-0.90), programmed to collaborate smoothly

Both are VOXYZ-inspired conversation mechanics (implemented in Track 5).

---

## Next Steps

1. **Synth (Week 2):** Implement enforcement engine + validation
2. **Sentinel (Week 3-4):** Security infrastructure (message sanitization, rate limiting)
3. **Archivist (Week 2):** KPI registry (link to `metrics[].kpi_id`)
4. **Verifier (Week 3):** Voice RULES enforcement (Fact+Action format)
5. **Synth (Week 5-7):** Conversation orchestration (speaking order, interaction types)

---

## Support

**Questions?** Contact:
- **Design:** Oracle (schema, contracts, escalation)
- **Implementation:** Synth (enforcement, validation)
- **Security:** Sentinel (3-tier enforcement review)
- **Testing:** Verifier (validation accuracy)

**Documentation:**
- Schema: `schema.json`
- Design rationale: `DESIGN.md`
- TypeScript types: `types.ts`
- This guide: `README.md`

---

**Status:** ✅ Design complete, ready for implementation  
**Version:** 1.0  
**Last Updated:** 2026-02-14

**En Taro Adun!**
