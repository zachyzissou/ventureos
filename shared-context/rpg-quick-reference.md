# VoxYZ RPG Integration — Quick Reference

**Last Updated**: 2026-02-14  
**Full Plan**: `~/clawd/shared-context/rpg-integration-plan.md`

---

## At-a-Glance Comparison

| Component | Current State | VoxYZ System | Integration Plan | Phase |
|-----------|--------------|--------------|------------------|-------|
| **Role Cards** | Markdown (11 sections) | JSON (6 layers) | Merge → JSON schema | Phase 1 |
| **Voice** | SOUL.md (global) | Per-agent directives | 6 voice files | Phase 1 |
| **Personality Evolution** | Static | Memory-driven modifiers | Modifier system | Phase 2 |
| **Relationships** | None | Affinity matrix (15 pairs) | Seed + drift tracking | Phase 2 |
| **Stats** | KPI JSON | RPG stats (6 types) | Formula mapping | Phase 1 |
| **Levels** | None | XP formula (max 15) | Daily calculation | Phase 1 |
| **Classes** | None | 6 RPG classes | Assign to agents | Phase 1 |
| **Dashboard** | Basic (tugcantopaloglu) | 3D + HUD | 2D first, 3D optional | Phase 3 |

---

## RPG Stats Quick Reference

| Stat | Meaning | Formula | Data Source |
|------|---------|---------|-------------|
| **TRU** | Trust/Reliability | `success_rate × 100` | KPIs |
| **SPD** | Speed | `100 - min(100, p95_latency_s)` | KPIs |
| **WIS** | Wisdom/Memory | `log2(memory_count + 1) × 15` | Observational memory |
| **CRE** | Creativity | `(accepted / total) × 100` | Verifier feedback |
| **VRL** | Viral/Engagement | Deferred (no public posting) | N/A |
| **RCH** | Reach/Impact | `log2(tasks + 1) × 20` | Mission logs |

**Level Formula**:  
```
level = min(15, floor(log2(memory_count + completed_missions×3 + 1)) + 1)
```

---

## Agent Class Assignments

| Agent | Class | Primary Stats | Rationale |
|-------|-------|---------------|-----------|
| **Oracle** | Oracle | WIS, TRU, RCH, CRE | Research + insight |
| **Atlas** | Ranger | SPD, TRU | Speed + reliability |
| **Sentinel** | Commander | TRU, WIS | Leadership + judgment |
| **Verifier** | Sage | TRU, WIS, SPD | Thoroughness + knowledge |
| **Archivist** | Bard | WIS, CRE, TRU | Memory + storytelling |
| **Synth** | Artisan | CRE, SPD, WIS | Creativity + craft |

---

## Affinity Matrix (Seed Values)

**Legend**: 🟢 High (0.75+) | 🟡 Medium (0.55-0.74) | 🔴 Low (<0.55)

|  | Oracle | Atlas | Sentinel | Verifier | Archivist | Synth |
|---|--------|-------|----------|----------|-----------|-------|
| **Oracle** | — | 🟡 0.70 | 🟡 0.65 | 🟢 0.75 | 🟢 0.85 | 🟡 0.60 |
| **Atlas** | 🟡 0.70 | — | 🟡 0.60 | 🟢 0.75 | 🟢 0.80 | 🟡 0.55 |
| **Sentinel** | 🟡 0.65 | 🟡 0.60 | — | 🟢 0.85 | 🟢 0.80 | 🔴 0.40 |
| **Verifier** | 🟢 0.75 | 🟢 0.75 | 🟢 0.85 | — | 🟢 0.80 | 🟡 0.65 |
| **Archivist** | 🟢 0.85 | 🟢 0.80 | 🟢 0.80 | 🟢 0.80 | — | 🟢 0.75 |
| **Synth** | 🟡 0.60 | 🟡 0.55 | 🔴 0.40 | 🟡 0.65 | 🟢 0.75 | — |

**Key Relationships**:
- **Highest**: Oracle ↔ Archivist (0.85), Sentinel ↔ Verifier (0.85)
- **Lowest**: Sentinel ↔ Synth (0.40) — safety vs creativity tension
- **Universal Partner**: Archivist (0.75+ with everyone)

**Drift**: ±0.03 per interaction (success/failure)

---

## Voice Modifier Examples

**Condition → Directive** (injected into system prompt):

| Trigger | Modifier | Example Directive |
|---------|----------|-------------------|
| `memory_count ≥ 8` | reference_outcomes | "Reference past outcomes when making recommendations" |
| `pattern_count ≥ 6` | use_frameworks | "Look for frameworks and systematic approaches" |
| `completed_missions ≥ 10` | show_confidence | "Reduce hedging; show confidence in assessments" |
| `level ≥ 7` | mentor_mode | "Teach methodology; help requesters improve skills" |

---

## Implementation Phases

### Phase 1: Core System (2 weeks)
- ✅ Role card JSON schema
- ✅ Port 6 agents to JSON
- ✅ Voice directive templates
- ✅ Stats calculation script
- ✅ Level system
- ✅ Daily stats cron

**Output**: Agents have stats/levels in JSON, no UI yet

---

### Phase 2: Personality (1-2 weeks)
- ✅ Affinity matrix seed data
- ✅ Drift tracking (observational memory)
- ✅ Voice modifier system
- ⚠️ Affinity-influenced behavior (optional)

**Output**: Agents have relationships that evolve, voice adapts to experience

---

### Phase 3: Frontend (2-4 weeks, conditional)
- ✅ API endpoints for stats/roles/affinity
- ✅ AgentStatBar component (2D progress bars)
- ✅ RoleCardPanel component (expandable overlays)
- ✅ Affinity graph visualization
- ⚠️ 3D avatars (conditional, requires user approval + $10/month)
- ⚠️ Polish (CRT effects, real-time updates)

**Output**: Dashboard shows live RPG stats and relationships

---

## File Structure

```
~/clawd/
├── agents/
│   ├── roles/          # JSON role cards (6 files)
│   ├── voices/         # Voice directives (6 files)
│   ├── affinity-matrix.json
│   └── {agent}/        # Per-agent state
│       ├── stats.json
│       ├── state.json
│       └── stats-history/
├── schemas/            # JSON schemas (4 files)
├── scripts/
│   ├── calculate-rpg-stats.sh
│   ├── collect-rpg-feedback.sh
│   └── update-affinity-matrix.sh
└── shared-context/
    ├── rpg-integration-plan.md
    ├── rpg-quick-reference.md (this file)
    └── feedback/rpg-integration/
```

---

## Next Actions

1. **User Review**: Approve integration plan direction
2. **Agent Feedback**: Run `collect-rpg-feedback.sh` → get agent input
3. **Revise Plan**: Incorporate feedback, finalize schemas
4. **Phase 1 Kickoff**: Atlas implements core system (2 weeks)

---

## Key Decisions Needed

| Decision | Options | Recommendation |
|----------|---------|----------------|
| **3D Avatars** | Yes ($10/mo) / No (2D only) | **No** (defer until Phase 3, evaluate value) |
| **Affinity Behavior** | Block low-affinity handoffs / Track passively | **Track passively** (Phase 2), add blocking in Phase 3 if useful |
| **Voice Auto-Inject** | Automatic / Manual review | **Automatic** with logging (review in weekly digest) |
| **Frontend Priority** | Phase 1+2 first / Parallelize | **Phase 1+2 first** (validate data before building UI) |
| **VRL/RCH Stats** | Defer / Use proxies | **Defer VRL**, use `tasks_completed` for RCH |

---

**Full details**: See `rpg-integration-plan.md` (46KB, comprehensive)
