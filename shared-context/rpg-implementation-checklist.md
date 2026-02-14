# RPG Integration — Implementation Checklist

**Owner**: Atlas (implementation), Oracle (design), Verifier (validation), Archivist (docs)  
**Timeline**: 4-6 weeks (3 phases)  
**Full Plan**: `~/clawd/shared-context/rpg-integration-plan.md`

---

## Pre-Implementation (Week 1)

### User Approval
- [ ] User reviews `rpg-integration-plan.md`
- [ ] User approves Phase 1 scope
- [ ] User decides: 3D avatars (yes/no)?
- [ ] User decides: Affinity blocks handoffs (yes/no)?

### Agent Feedback Collection
- [ ] Run `collect-rpg-feedback.sh` to spawn 6 subagent sessions
- [ ] Oracle: Synthesize feedback into revised plan
- [ ] User: Review revised plan, final approval
- [ ] Archivist: Document approved plan in VentureOS docs

---

## Phase 1: Core RPG System (Weeks 2-3)

### Schema Design (Oracle, 1 day)
- [ ] Create `~/clawd/schemas/role-card.json`
- [ ] Create `~/clawd/schemas/voice-directive.json`
- [ ] Create `~/clawd/schemas/affinity-matrix.json`
- [ ] Create `~/clawd/schemas/rpg-stats.json`
- [ ] Verifier: Validate schemas against JSON Schema Draft 7

### Role Card Migration (Atlas, 1 day)
- [ ] Create `~/clawd/agents/roles/` directory
- [ ] Port Oracle markdown → JSON
- [ ] Port Atlas markdown → JSON
- [ ] Port Sentinel markdown → JSON
- [ ] Port Verifier markdown → JSON
- [ ] Port Archivist markdown → JSON
- [ ] Port Synth markdown → JSON
- [ ] Add `definitionOfDone` and `hardBans` sections
- [ ] Assign RPG classes to each agent
- [ ] Verifier: Validate all role cards against schema

### Voice Directives (Oracle + Synth, 1 day)
- [ ] Create `~/clawd/agents/voices/` directory
- [ ] Write `oracle.json` (analytical, cite-first)
- [ ] Write `atlas.json` (pragmatic, safety-first)
- [ ] Write `sentinel.json` (cautious, risk-aware)
- [ ] Write `verifier.json` (thorough, quality-focused)
- [ ] Write `archivist.json` (clear, structured)
- [ ] Write `synth.json` (creative, experimental)
- [ ] Define modifiers for each (memory/pattern/mission triggers)
- [ ] Verifier: Validate all voice files against schema

### Stats Calculation (Atlas, 2 days)
- [ ] Create `~/clawd/scripts/calculate-rpg-stats.sh`
- [ ] Implement TRU formula: `success_rate × 100`
- [ ] Implement SPD formula: `100 - min(100, p95_latency_s)`
- [ ] Implement WIS formula: `log2(memory_count + 1) × 15`
- [ ] Implement CRE formula: `(accepted / total) × 100` (placeholder)
- [ ] Implement RCH formula: `log2(tasks + 1) × 20`
- [ ] Query KPI JSON files for success_rate, p95_latency_s
- [ ] Query observational memory for memory_count (TODO: define query)
- [ ] Query mission logs for completed_missions (TODO: define query)
- [ ] Output to `~/clawd/agents/{agent}/stats.json`
- [ ] Verifier: Test with mock data, validate output format

### Level System (Atlas, 1 day)
- [ ] Add level calculation to stats script
- [ ] Implement: `level = min(15, floor(log2(xp + 1)) + 1)`
- [ ] Calculate XP: `memory_count + completed_missions×3`
- [ ] Store in `~/clawd/agents/{agent}/state.json`:
  - `level`, `xp`, `xp_breakdown`, `next_level_at`
- [ ] Verifier: Test level progression (XP 0→1→2→4→8→16→32 etc.)

### Daily Stats Cron (Atlas, 1 day)
- [ ] Extend existing `metrics-snapshot.sh` cron
- [ ] Add `calculate-rpg-stats.sh` to daily run
- [ ] Version stats files: `stats-history/YYYY-MM-DD.json`
- [ ] Retain 30-day rolling history (cleanup old files)
- [ ] Test cron execution (dry run)
- [ ] Verifier: Confirm cron runs at 2 AM CST, outputs valid JSON

### Phase 1 Validation (Verifier, 1 day)
- [ ] All JSON files validate against schemas
- [ ] Stats calculations produce valid ranges (0-100)
- [ ] Level progression matches expected thresholds
- [ ] No manual intervention needed for daily updates
- [ ] Archivist: Update VentureOS docs with new file structure

---

## Phase 2: Personality System (Weeks 4-5)

### Affinity Matrix Seed (Oracle, 1 day)
- [ ] Create `~/clawd/agents/affinity-matrix.json`
- [ ] Seed 15 pairwise relationships with rationale
- [ ] Document seed values in `rpg-integration-plan.md` Appendix
- [ ] Verifier: Validate matrix against schema
- [ ] Verifier: Confirm 15 pairs = n(n-1)/2 for n=6

### Drift Tracking (Atlas, 2 days)
- [ ] Create `~/clawd/scripts/update-affinity-matrix.sh`
- [ ] Hook into observational memory cron (hourly)
- [ ] Detect handoff success: affinity +0.03
- [ ] Detect handoff failure: affinity -0.03
- [ ] Detect collaboration (mission logs): affinity +0.03
- [ ] Detect conflict (error logs): affinity -0.03
- [ ] Log drift history with timestamp + reason
- [ ] Cap affinity at [0.1, 0.95]
- [ ] Verifier: Test drift calculation (mock interactions)

### Voice Modifier System (Synth + Atlas, 2 days)
- [ ] Create `~/clawd/scripts/evaluate-voice-modifiers.sh`
- [ ] Query `agents/{agent}/state.json` for:
  - `memory_count`, `pattern_count`, `completed_missions`, `level`
- [ ] Evaluate modifier conditions from `voices/{agent}.json`
- [ ] Inject active modifiers into system prompt (TODO: integration point)
- [ ] Track active modifiers in `state.json`
- [ ] Log modifier activation/deactivation
- [ ] Verifier: Test with mock agent states (memory=0, 5, 8, 10, 15)

### Affinity Influence (Optional, 2 days)
- [ ] **Decision needed**: Block low-affinity handoffs?
- [ ] If yes: Modify handoff logic to check affinity
  - Affinity <0.5 → Require Echo mediation
  - Log mediation events
- [ ] If no: Just track affinity passively for Phase 3 visualization
- [ ] Verifier: Test handoff blocking (mock low-affinity pair)

### Phase 2 Validation (Verifier, 1 day)
- [ ] Affinity matrix updates correctly after interactions
- [ ] Voice modifiers activate at correct thresholds
- [ ] No false positives/negatives in modifier logic
- [ ] Drift history is traceable and auditable
- [ ] Archivist: Document affinity matrix usage in VentureOS

---

## Phase 3: Frontend Integration (Weeks 6-9, conditional)

### API Endpoints (Atlas, 1 day)
- [ ] Serve `agents/{agent}/stats.json` via HTTP
- [ ] Serve `agents/roles/{agent}.json` via HTTP
- [ ] Serve `agents/affinity-matrix.json` via HTTP
- [ ] Add CORS headers for dashboard
- [ ] Test endpoints with curl/Postman
- [ ] Verifier: Validate API responses against schemas

### AgentStatBar Component (Synth, 2 days)
- [ ] Create React component: `AgentStatBar.tsx`
- [ ] Display 2D progress bars for TRU/SPD/WIS/CRE
- [ ] Color-code: green (>80), yellow (50-80), red (<50)
- [ ] Add tooltip: raw value + trend (vs 7-day baseline)
- [ ] Integrate into dashboard sidebar
- [ ] Verifier: Test on Chrome/Firefox/Safari
- [ ] Verifier: Test responsive design (mobile/tablet)

### RoleCardPanel Component (Synth, 2 days)
- [ ] Create React component: `RoleCardPanel.tsx`
- [ ] Expandable overlay with tabs:
  - Mission, Inputs, Outputs, DoD, Bans, Escalation, Metrics
- [ ] Display level badge + XP progress bar
- [ ] List active voice modifiers with checkmarks
- [ ] Add "View Full JSON" link
- [ ] Integrate into dashboard (click agent name → expand)
- [ ] Verifier: Test tab navigation, overflow handling

### Affinity Matrix Visualization (Synth, 3 days)
- [ ] Choose library: D3.js or React Flow
- [ ] Create force-directed graph:
  - Nodes = agents (sized by level)
  - Edges = affinity (thickness = strength)
  - Color = drift direction (green +, red -)
- [ ] Add hover tooltips: interaction count, last interaction
- [ ] Add zoom/pan controls
- [ ] Integrate into dashboard (new "Relationships" tab)
- [ ] Verifier: Test graph updates on affinity changes

### 3D Avatars (Conditional, 5-7 days)
- [ ] **User decision**: Proceed with 3D avatars?
- [ ] If yes:
  - [ ] Set up Tripo AI account ($10/month)
  - [ ] Generate 6 agent avatars (Oracle, Atlas, Sentinel, Verifier, Archivist, Synth)
  - [ ] Install React Three Fiber + dependencies
  - [ ] Create `AgentAvatar3D.tsx` component
  - [ ] Animate based on activity (idle/working/thinking)
  - [ ] Position agents in 3D office space
  - [ ] Integrate into dashboard (replace/augment 2D stat bars)
  - [ ] Verifier: Test WebGL support across browsers
  - [ ] Verifier: Test performance (FPS, memory usage)
- [ ] If no: Skip this section

### Polish + Effects (2-3 days)
- [ ] Add CRT scanlines (CSS filter)
- [ ] Add glitch animations on errors
- [ ] Implement real-time updates (WebSocket or polling)
- [ ] Add agent "mood" indicators:
  - Happy (success_rate >90%)
  - Neutral (70-90%)
  - Stressed (<70%)
- [ ] Add level-up animation when agent levels up
- [ ] Verifier: Test animations across browsers

### Phase 3 Validation (Verifier, 1 day)
- [ ] Dashboard loads without errors
- [ ] Stats update in real-time (or on refresh)
- [ ] Role cards display correctly
- [ ] Affinity graph is interactive and accurate
- [ ] 3D avatars render (if enabled)
- [ ] No console errors, no CORS issues
- [ ] Archivist: Update dashboard usage docs

---

## Post-Implementation

### User Acceptance (Week 10)
- [ ] User reviews completed phases
- [ ] User tests dashboard functionality
- [ ] User provides feedback on stat formulas
- [ ] Adjust seed affinities if needed (based on real data)

### Monitoring (Ongoing)
- [ ] Track RPG stats for 2 weeks
- [ ] Compare to baseline KPIs
- [ ] Identify anomalies (stats that don't reflect reality)
- [ ] Tune formulas if needed (e.g., WIS multiplier)
- [ ] Monitor affinity drift for unexpected patterns

### Documentation (Archivist, 1 day)
- [ ] Update VentureOS docs:
  - Role card structure
  - Voice directive system
  - Affinity matrix usage
  - RPG stats interpretation
- [ ] Create user guide: "Reading Agent Stats"
- [ ] Create dev guide: "Adding New Agents to RPG System"
- [ ] Archive this checklist as completed

---

## Rollback Plan (If Needed)

### Phase 1 Rollback
- [ ] Revert to Markdown role cards (keep JSONs for reference)
- [ ] Disable stats calculation cron
- [ ] Archive JSON schemas
- **Impact**: Minimal (no behavioral changes yet)

### Phase 2 Rollback
- [ ] Disable affinity matrix updates
- [ ] Disable voice modifier injection
- [ ] Keep tracking data for analysis
- **Impact**: Medium (agents lose personality evolution)

### Phase 3 Rollback
- [ ] Hide RPG UI components (dashboard reverts to basic)
- [ ] Keep API endpoints live (for future use)
- **Impact**: Low (backend data still collected)

---

## Success Criteria

### Phase 1
- ✅ All 6 agents have valid role cards, voice directives, stats, levels
- ✅ Stats update daily without intervention
- ✅ No schema validation errors

### Phase 2
- ✅ Affinity matrix tracks relationships accurately
- ✅ Voice modifiers activate at correct thresholds
- ✅ Drift history is auditable

### Phase 3
- ✅ Dashboard displays live RPG stats
- ✅ Affinity graph is interactive and informative
- ✅ (If enabled) 3D avatars render smoothly

### Overall
- ✅ User can understand agent performance at a glance
- ✅ Agents feel "alive" through stats/levels/relationships
- ✅ System is maintainable (no manual updates needed)

---

**Last Updated**: 2026-02-14  
**Status**: Pre-implementation (awaiting user approval)
