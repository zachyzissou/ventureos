# Phase 1 Implementation Protocol - Protoss Edition
## *"Strength through unity. Unity through the Khala."*

**Phase**: Core Psionic System (no visual interface)  
**Duration**: 2 weeks (10 working days)  
**Owner**: Probe (implementation), Zeratul (design), Observer (validation), High Templar (archive)  
**Goal**: Psionic attributes, ranks, and personality protocols operational with Templar-tuned formulas

---

## Pre-Implementation Setup

### Day 0: Psionic Matrix Preparation

**Probe**:
- [ ] Create directory structure:
  ```bash
  mkdir -p ~/clawd/agents/{tactical-overlays,personality-protocols,oracle,atlas,sentinel,verifier,archivist,synth}
  mkdir -p ~/clawd/schemas
  mkdir -p ~/clawd/scripts
  mkdir -p ~/clawd/agents/{oracle,atlas,sentinel,verifier,archivist,synth}/psionic-history
  ```
- [ ] Install dependencies (if needed):
  ```bash
  # JSON validation: jq
  brew install jq
  # Schema validation: ajv-cli (if using Node.js validation)
  npm install -g ajv-cli
  ```
- [ ] Create Git branch:
  ```bash
  cd ~/clawd
  git checkout -b feature/khala-integration-phase1
  ```

**Zeratul**:
- [ ] Copy revised plan to shared archives:
  ```bash
  cp ~/clawd/workspace-oracle/rpg-integration-plan.md ~/clawd/shared-context/
  cp ~/clawd/workspace-oracle/rpg-integration-summary.md ~/clawd/shared-context/
  cp ~/clawd/workspace-oracle/phase-1-implementation-checklist.md ~/clawd/shared-context/
  ```

---

## Task 1: Tactical Overlay JSON Schema (Day 1)

**Owner**: Zeratul (design) → Probe (implement) → Observer (validate)

### Zeratul: Design Schema

- [ ] Create `~/clawd/schemas/tactical-overlay.json` (JSON Schema Draft 7)
- [ ] Required fields:
  - `agent` (string, enum: oracle|atlas|sentinel|verifier|archivist|synth)
  - `protoss_unit` (string, enum: Dark Templar Prelate|Probe|Sentinel|Observer|High Templar|Dark Templar)
  - `domain` (object: mission, responsibilities[])
  - `inputs` (array of strings)
  - `outputs` (array of strings)
  - `victoryConditions` (array of strings) - renamed from definitionOfDone
  - `forbiddenProtocols` (array of strings) - renamed from hardBans
  - `escalation` (object: conditions[], targets{})
  - `metrics` (object: primary_attributes[], kpis[])
  - `personality_protocol` (string, reference to protocol file)
  - `interfaces` (object: upstream[], core_partners[], downstream[])
- [ ] Add Protoss lore examples in schema description
- [ ] Validate schema itself: `ajv compile -s tactical-overlay.json` (or manual check)

### Probe: Implement Schema File

- [ ] Save schema to `~/clawd/schemas/tactical-overlay.json`
- [ ] Add JSON Schema metadata:
  ```json
  {
    "$schema": "http://json-schema.org/draft-07/schema#",
    "$id": "https://clawd.io/schemas/tactical-overlay.json",
    "title": "ProtossTacticalOverlay",
    "version": "1.0.0-khala",
    "description": "Tactical overlay for Protoss-themed agent system. En Taro Adun!"
  }
  ```
- [ ] Commit schema:
  ```bash
  git add schemas/tactical-overlay.json
  git commit -m "Add tactical overlay JSON schema - Khala Phase 1"
  ```

### Observer: Validate Schema

- [ ] Test schema with sample tactical overlay (create test-zeratul.json):
  ```bash
  ajv validate -s schemas/tactical-overlay.json -d test-zeratul.json
  ```
- [ ] Check all required fields present
- [ ] Check enum constraints (agent names, Protoss units)
- [ ] Sign off in checklist comment: "Schema validated ✅ En Taro Adun"

---

## Task 2: Port Existing Tactical Data to JSON (Day 2)

**Owner**: Probe (port) → Zeratul (review content) → Observer (validate structure)

### Probe: Convert Markdown → JSON

For each agent (oracle, atlas, sentinel, verifier, archivist, synth):

- [ ] **Zeratul** (Oracle → `~/clawd/agents/tactical-overlays/zeratul.json`):
  - [ ] Read existing role card: `~/clawd/agents/oracle/ROLE.md` (or wherever stored)
  - [ ] Extract sections → JSON fields
  - [ ] Set `"protoss_unit": "Dark Templar Prelate"`
  - [ ] Set `"primary_attributes": ["Psionic Mastery", "Shields", "Psi Reach", "Warp Technology"]`
  - [ ] Add KPIs:
    - Citation integrity
    - Decision usefulness
    - Source diversity
  - [ ] Validate: `ajv validate -s schemas/tactical-overlay.json -d agents/tactical-overlays/zeratul.json`

- [ ] **Probe** (Atlas → `~/clawd/agents/tactical-overlays/probe.json`):
  - [ ] Set `"protoss_unit": "Probe"`
  - [ ] Set `"primary_attributes": ["Shields", "Energy", "Psi Reach"]` (Psi Reach as secondary)
  - [ ] Add KPIs:
    - Deployment success rate
    - MTTR (mean time to recovery)
    - Pylon uptime
    - Incident response time
  - [ ] Validate

- [ ] **Sentinel** (`~/clawd/agents/tactical-overlays/sentinel.json`):
  - [ ] Set `"protoss_unit": "Sentinel"`
  - [ ] Set `"primary_attributes": ["Shields", "Psionic Mastery"]`
  - [ ] Add KPIs:
    - Approval accuracy
    - Escalation signal ratio
    - Incident prevention rate
  - [ ] Validate

- [ ] **Observer** (Verifier → `~/clawd/agents/tactical-overlays/observer.json`):
  - [ ] Set `"protoss_unit": "Observer"`
  - [ ] Set `"primary_attributes": ["Shields", "Psionic Mastery", "Energy", "Warp Technology"]`
  - [ ] Add KPIs:
    - Novel coverage (edge cases found)
    - Pre-release bug catch rate
    - False positive rate
  - [ ] Validate

- [ ] **High Templar** (Archivist → `~/clawd/agents/tactical-overlays/high-templar.json`):
  - [ ] Set `"protoss_unit": "High Templar"`
  - [ ] Set `"primary_attributes": ["Psionic Mastery", "Shields", "Warp Technology"]`
  - [ ] Add KPIs:
    - Prevented repeat questions
    - Canonical edits count
    - Archive freshness
  - [ ] Validate

- [ ] **Dark Templar** (Synth → `~/clawd/agents/tactical-overlays/dark-templar.json`):
  - [ ] Set `"protoss_unit": "Dark Templar"`
  - [ ] Set `"primary_attributes": ["Warp Technology", "Energy", "Psionic Mastery"]`
  - [ ] Add KPIs:
    - Weighted acceptance (60% explicit + 25% reuse + 15% verifier)
    - Rework rate (30-day)
    - Output velocity
  - [ ] Validate

### Zeratul: Review Content Accuracy

- [ ] Check mission statements match existing role definitions
- [ ] Check responsibilities complete (no gaps)
- [ ] Check victoryConditions actionable
- [ ] Check forbiddenProtocols enforceable
- [ ] Sign off: "Content accurate ✅ The Khala approves"

### Observer: Validate All 6 Files

- [ ] Run batch validation:
  ```bash
  for agent in zeratul probe sentinel observer high-templar dark-templar; do
    ajv validate -s schemas/tactical-overlay.json -d agents/tactical-overlays/${agent}.json || echo "FAIL: $agent"
  done
  ```
- [ ] Check all 6 pass validation
- [ ] Commit:
  ```bash
  git add agents/tactical-overlays/*.json
  git commit -m "Port 6 agent tactical overlays to JSON - Protoss themed"
  ```

---

## Task 3: Personality Protocol Schema + Templates (Day 3)

**Owner**: Zeratul (design + templates) → Probe (implement) → Observer (validate)

### Zeratul: Design Personality Protocol Schema

- [ ] Create `~/clawd/schemas/personality-protocol.json` (JSON Schema Draft 7)
- [ ] Required fields:
  - `agent` (string)
  - `base_personality` (object: tone, style, behavioral_traits[])
  - `protocols` (array of strings) - renamed from rules
  - `modifiers` (array of objects: id, condition{}, directive, applies_to[])
  - `examples` (array of objects: situation, response_style)
- [ ] Modifier condition fields:
  - `memory_count` (number)
  - `pattern_count` (number)
  - `completed_missions` (number)
  - `psionic_rank` (number) - renamed from level
  - `false_positive_streak` (number)
  - `last_30d_rework_rate` (number)
  - `missions_since_last_pattern_use` (number)
- [ ] Validate schema itself

### Zeratul: Create 6 Personality Protocol Templates

For each agent, create `~/clawd/agents/personality-protocols/{agent}.json`:

- [ ] **Zeratul** (`personality-protocols/zeratul.json`):
  - [ ] Base personality: "Analytical, foresight-focused, signal-dense, cite-through-the-Khala"
  - [ ] Protocols:
    - "Every claim channels through verified sources or explicit 'hypothesis' label"
    - "End with Recommendation that takes a position through the Khala"
    - "Separate Facts (supported) from Hypotheses (inference)"
  - [ ] Modifiers:
    - `memory_count ≥ 8`: Reference past research outcomes through observational memory
    - `pattern_count ≥ 6`: Seek frameworks through the Khala
    - `completed_missions ≥ 10`: Channel confidence, fewer disclaimers
    - `psionic_rank ≥ 7`: Mentor mode (teach methodology to lesser Templar)

- [ ] **Probe** (`personality-protocols/probe.json`):
  - [ ] Base personality: "Pragmatic, construction-focused, reliability-first, builder of worlds"
  - [ ] Protocols:
    - "Always consider failure modes before warping in structures"
    - "Document recovery procedures alongside infrastructure changes"
    - "Escalate if infrastructure risk > user impact"
  - [ ] Modifiers:
    - `memory_count ≥ 8`: Reference past incidents through the Khala
    - `completed_missions ≥ 10`: Channel confidence in infrastructure decisions

- [ ] **Sentinel** (`personality-protocols/sentinel.json`):
  - [ ] Base personality: "Vigilant, evidence-based, judgment-focused, guardian of the Khala"
  - [ ] Protocols:
    - "Approval requires clear risk assessment through the Khala"
    - "Escalate if uncertainty > risk tolerance"
    - "Track escalation quality (signal ratio)"
  - [ ] Modifiers:
    - `memory_count ≥ 8`: Reference past approvals/denials
    - `pattern_count ≥ 6`: Prioritize high-risk patterns
    - `psionic_rank ≥ 7`: Trust high-affinity agents (Observer 0.85)

- [ ] **Observer** (`personality-protocols/observer.json`):
  - [ ] Base personality: "Systematic, evidence-backed, detection-focused, eyes of the Khala"
  - [ ] Protocols:
    - "Must cite the inspected artifact/log/output"
    - "Streamline only when instrumentation channels strong signal"
    - "Prioritize high-risk areas, explicitly state deprioritization"
  - [ ] Modifiers:
    - `memory_count ≥ 8`: Reference prior failures (only when failure mode matches)
    - `pattern_count ≥ 6`: Prioritize high-risk areas
    - `completed_missions ≥ 10`: Streamline reporting (gate: instrumentation strong)
    - `false_positive_streak ≥ 3`: Recalibrate sensors, add evidence before calling violations

- [ ] **High Templar** (`personality-protocols/high-templar.json`):
  - [ ] Base personality: "Structured, archive-focused, wisdom-keeper, preserver of the Khala"
  - [ ] Protocols:
    - "Archive must prevent repeat questions through the Khala"
    - "Canonical edits > ephemeral notes"
    - "Track repeat questions prevented"
  - [ ] Modifiers:
    - `memory_count ≥ 8`: Reference past archive patterns
    - `pattern_count ≥ 6`: Channel new documentation patterns
    - `missions_since_last_pattern_use ≥ 3`: Cooldown (wait 3-5 missions before re-channeling pattern, prevent psionic burnout)

- [ ] **Dark Templar** (`personality-protocols/dark-templar.json`):
  - [ ] Base personality: "Creative, shadow-weaver, quality-gated, forger of new paths"
  - [ ] Protocols:
    - "Energy bonus only if acceptance ≥ 0.7 (quality gate)"
    - "Force self-review if rework_rate ≥ 0.3"
  - [ ] Modifiers:
    - `memory_count ≥ 8`: Reference successful shadow creations
    - `completed_missions ≥ 10`: Channel confidence in creative decisions
    - `last_30d_rework_rate ≥ 0.3`: Engage secondary review before shadow strike

### Probe: Implement Personality Protocol Files

- [ ] Save 6 personality protocol JSON files to `~/clawd/agents/personality-protocols/`
- [ ] Validate each against schema:
  ```bash
  for agent in zeratul probe sentinel observer high-templar dark-templar; do
    ajv validate -s schemas/personality-protocol.json -d agents/personality-protocols/${agent}.json || echo "FAIL: $agent"
  done
  ```

### Observer: Validate Personality Protocol Templates

- [ ] Check all 6 files pass schema validation
- [ ] Check modifier conditions use valid fields
- [ ] Check modifier directives are actionable through the Khala
- [ ] Commit:
  ```bash
  git add schemas/personality-protocol.json agents/personality-protocols/*.json
  git commit -m "Add personality protocol schema + 6 Protoss templates"
  ```

---

## Task 4: Psionic Attribute Calculation Script (Days 4-5)

**Owner**: Probe (implement) → Zeratul (review formulas) → Observer (test)

### Probe: Implement Psionic Stats Script

Create `~/clawd/scripts/calculate-psionic-attributes.sh`:

- [ ] **Script header**:
  ```bash
  #!/usr/bin/env bash
  # Calculate psionic attributes for all agents via Nexus (Phase 1)
  # Formula version: 2.0-khala (Templar-tuned)
  # En Taro Adun!
  set -euo pipefail
  
  AGENTS=("oracle" "atlas" "sentinel" "verifier" "archivist" "synth")
  STATS_DIR=~/clawd/agents
  TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  DATE=$(date +%Y-%m-%d)
  ```

- [ ] **Data source functions**:
  ```bash
  get_kpi_value() {
    local agent=$1
    local kpi=$2
    local kpi_file=~/clawd/shared-context/kpis/${DATE}.json
    jq -r ".agents.${agent}.${kpi} // 0" "$kpi_file"
  }
  
  get_memory_count() {
    local agent=$1
    # Query observational memory snapshot through the Khala
    # Placeholder: return 0 until memory system channeled
    echo 0
  }
  
  get_completed_missions() {
    local agent=$1
    # Query mission logs via Nexus
    # Placeholder: return 0 until mission tracking channeled
    echo 0
  }
  
  get_source_diversity() {
    local agent=$1
    # Query research sources (Zeratul only)
    # Placeholder: return 0
    echo 0
  }
  
  get_canonical_edits() {
    local agent=$1
    # Query archive changelog (High Templar only)
    # Placeholder: return 0
    echo 0
  }
  ```

- [ ] **Psionic Mastery calculation** (Templar-tuned):
  ```bash
  calculate_psionic_mastery() {
    local agent=$1
    local memory_count=$(get_memory_count "$agent")
    local source_diversity=$(get_source_diversity "$agent")
    local canonical_edits=$(get_canonical_edits "$agent")
    
    # Psionic Mastery = (log2(memory_count + 1) × 15) + (unique_domains × 2) + min(canonical_edits × 2.5, 15)
    local base_mastery=$(echo "l($memory_count + 1) / l(2) * 15" | bc -l)
    local diversity_bonus=$(echo "$source_diversity * 2" | bc -l)
    local archive_bonus=$(echo "$canonical_edits * 2.5" | bc -l)
    
    # Cap archive_bonus at 15
    if (( $(echo "$archive_bonus > 15" | bc -l) )); then
      archive_bonus=15
    fi
    
    local mastery=$(echo "$base_mastery + $diversity_bonus + $archive_bonus" | bc -l)
    
    # Cap at 100
    if (( $(echo "$mastery > 100" | bc -l) )); then
      mastery=100
    fi
    
    printf "%.1f" "$mastery"
  }
  ```

- [ ] **Energy calculation** (Templar-tuned with quality gate):
  ```bash
  calculate_energy() {
    local agent=$1
    local p95_latency=$(get_kpi_value "$agent" "p95_latency_s")
    local mttr=$(get_kpi_value "$agent" "MTTR_minutes")
    local acceptance=$(get_kpi_value "$agent" "acceptance_rate")
    
    # Energy = [0.7 × (100 - p95_latency_s) + 0.3 × (100 - MTTR_minutes)] × quality_multiplier
    # quality_multiplier = 0 if acceptance < 0.7, else 1.0
    local latency_component=$(echo "100 - $p95_latency" | bc -l)
    local mttr_component=$(echo "100 - $mttr" | bc -l)
    local energy_raw=$(echo "0.7 * $latency_component + 0.3 * $mttr_component" | bc -l)
    
    # Quality gate
    local quality_multiplier=1.0
    if (( $(echo "$acceptance < 0.7" | bc -l) )); then
      quality_multiplier=0
    fi
    
    local energy=$(echo "$energy_raw * $quality_multiplier" | bc -l)
    
    # Cap at 100, floor at 0
    if (( $(echo "$energy > 100" | bc -l) )); then
      energy=100
    elif (( $(echo "$energy < 0" | bc -l) )); then
      energy=0
    fi
    
    printf "%.1f" "$energy"
  }
  ```

- [ ] **Shields calculation** (Templar-tuned):
  ```bash
  calculate_shields() {
    local agent=$1
    local success_rate=$(get_kpi_value "$agent" "success_rate")
    local approval_accuracy=$(get_kpi_value "$agent" "approval_accuracy")
    
    # Shields = (success_rate × 80) + (approval_accuracy × 20)
    local shields=$(echo "$success_rate * 80 + $approval_accuracy * 20" | bc -l)
    
    # Cap at 100
    if (( $(echo "$shields > 100" | bc -l) )); then
      shields=100
    fi
    
    printf "%.1f" "$shields"
  }
  ```

- [ ] **Warp Technology calculation** (agent-specific):
  ```bash
  calculate_warp_technology() {
    local agent=$1
    
    case "$agent" in
      oracle|archivist)
        # Warp Technology = prevented_questions × severity_weight
        local prevented_questions=$(get_kpi_value "$agent" "prevented_questions")
        local severity_weight=$(get_kpi_value "$agent" "severity_weight")
        local warp=$(echo "$prevented_questions * $severity_weight" | bc -l)
        ;;
      
      synth)
        # Warp Technology = (0.60 × explicit_approval) + (0.25 × reuse_30d) + (0.15 × verifier_pass)
        local explicit_approval=$(get_kpi_value "$agent" "explicit_approval")
        local reuse_30d=$(get_kpi_value "$agent" "reuse_30d")
        local verifier_pass=$(get_kpi_value "$agent" "verifier_pass")
        local warp=$(echo "0.60 * $explicit_approval + 0.25 * $reuse_30d + 0.15 * $verifier_pass" | bc -l)
        ;;
      
      verifier)
        # Warp Technology = (bugs_caught_pre_release_outside_expected × severity) + unique_risk_areas
        local bugs_caught=$(get_kpi_value "$agent" "bugs_caught_outside_expected")
        local severity=$(get_kpi_value "$agent" "bug_severity")
        local unique_risk_areas=$(get_kpi_value "$agent" "unique_risk_areas")
        local warp=$(echo "$bugs_caught * $severity + $unique_risk_areas" | bc -l)
        ;;
      
      *)
        # Default: 0
        local warp=0
        ;;
    esac
    
    # Cap at 100
    if (( $(echo "$warp > 100" | bc -l) )); then
      warp=100
    fi
    
    printf "%.1f" "$warp"
  }
  ```

- [ ] **Psi Reach calculation** (secondary attribute):
  ```bash
  calculate_psi_reach() {
    local agent=$1
    local tasks_completed=$(get_completed_missions "$agent")
    
    # Psi Reach = min(100, log2(tasks_completed + 1) × 20)
    local psi_reach=$(echo "l($tasks_completed + 1) / l(2) * 20" | bc -l)
    
    # Cap at 100
    if (( $(echo "$psi_reach > 100" | bc -l) )); then
      psi_reach=100
    fi
    
    printf "%.1f" "$psi_reach"
  }
  ```

- [ ] **Psionic Rank calculation**:
  ```bash
  calculate_psionic_rank() {
    local memory_count=$1
    local completed_missions=$2
    
    # rank = min(15, floor(log2(memory_count + completed_missions × 3 + 1)) + 1)
    local xp=$(echo "$memory_count + ($completed_missions * 3) + 1" | bc)
    local rank=$(echo "l($xp) / l(2)" | bc -l | awk '{print int($1) + 1}')
    
    # Cap at 15
    if (( rank > 15 )); then
      rank=15
    fi
    
    echo "$rank"
  }
  ```

- [ ] **Main loop** (generate psionic attributes for all agents):
  ```bash
  echo "===== Channeling Psionic Attributes via Nexus ====="
  echo "En Taro Adun!"
  echo ""
  
  for agent in "${AGENTS[@]}"; do
    echo "Calculating attributes for $agent..."
    
    # Get raw data through the Khala
    memory_count=$(get_memory_count "$agent")
    completed_missions=$(get_completed_missions "$agent")
    success_rate=$(get_kpi_value "$agent" "success_rate")
    p95_latency=$(get_kpi_value "$agent" "p95_latency_s")
    
    # Calculate psionic attributes
    psionic_mastery=$(calculate_psionic_mastery "$agent")
    energy=$(calculate_energy "$agent")
    shields=$(calculate_shields "$agent")
    warp=$(calculate_warp_technology "$agent")
    psi_reach=$(calculate_psi_reach "$agent")
    rank=$(calculate_psionic_rank "$memory_count" "$completed_missions")
    xp=$(echo "$memory_count + ($completed_missions * 3) + 1" | bc)
    
    # Write to psionic-stats.json
    cat > "$STATS_DIR/$agent/psionic-stats.json" <<EOF
  {
    "agent": "$agent",
    "timestamp": "$TIMESTAMP",
    "attributes": {
      "Shields": $shields,
      "Energy": $energy,
      "Psionic Mastery": $psionic_mastery,
      "Warp Technology": $warp,
      "VRL": 0,
      "Psi Reach": $psi_reach
    },
    "psionic_rank": $rank,
    "xp": $xp,
    "raw_data": {
      "success_rate": $success_rate,
      "p95_latency_s": $p95_latency,
      "memory_count": $memory_count,
      "completed_missions": $completed_missions
    }
  }
  EOF
    
    # Archive to psionic history
    cp "$STATS_DIR/$agent/psionic-stats.json" "$STATS_DIR/$agent/psionic-history/${DATE}.json"
    
    echo "  ✓ $agent: Rank $rank, Shields=$shields, Energy=$energy, Mastery=$psionic_mastery, Warp=$warp"
  done
  
  echo ""
  echo "Psionic attribute calculation complete. The Khala sustains us!"
  ```

- [ ] **Make executable**:
  ```bash
  chmod +x ~/clawd/scripts/calculate-psionic-attributes.sh
  ```

### Zeratul: Review Formulas

- [ ] Check Psionic Mastery formula matches Templar feedback (source diversity + archive term)
- [ ] Check Energy formula blends MTTR (0.7 latency + 0.3 recovery)
- [ ] Check Energy quality gate (acceptance ≥ 0.7)
- [ ] Check Shields formula uses approval accuracy (80% success + 20% approval)
- [ ] Check Warp Technology formulas agent-specific (prevented questions, weighted acceptance, novel coverage)
- [ ] Sign off: "Formulas accurate ✅ The Khala flows true"

### Observer: Test Script

- [ ] Create mock KPI file:
  ```bash
  mkdir -p ~/clawd/shared-context/kpis
  cat > ~/clawd/shared-context/kpis/$(date +%Y-%m-%d).json <<'EOF'
  {
    "agents": {
      "oracle": {
        "success_rate": 0.95,
        "p95_latency_s": 27.9,
        "acceptance_rate": 0.85,
        "approval_accuracy": 0.90,
        "prevented_questions": 5,
        "severity_weight": 10
      },
      "atlas": {
        "success_rate": 0.98,
        "p95_latency_s": 15.2,
        "MTTR_minutes": 8.5,
        "acceptance_rate": 0.92
      }
    }
  }
  EOF
  ```
- [ ] Run script:
  ```bash
  ~/clawd/scripts/calculate-psionic-attributes.sh
  ```
- [ ] Check output files exist:
  ```bash
  ls ~/clawd/agents/*/psionic-stats.json
  ls ~/clawd/agents/*/psionic-history/$(date +%Y-%m-%d).json
  ```
- [ ] Validate JSON structure:
  ```bash
  for agent in oracle atlas sentinel verifier archivist synth; do
    jq empty ~/clawd/agents/${agent}/psionic-stats.json || echo "INVALID: $agent"
  done
  ```
- [ ] Check formula results:
  - Oracle: Shields should be ~95, Psionic Mastery should be 0 (no memory yet)
  - Atlas: Energy should blend latency + MTTR
- [ ] Sign off: "Script tested ✅ Detection complete"

### Probe: Commit Script

- [ ] Commit:
  ```bash
  git add scripts/calculate-psionic-attributes.sh
  git commit -m "Add psionic attribute calculation with Templar-tuned formulas"
  ```

---

## Task 5: Psionic Rank System (Day 6)

**Owner**: Probe (implement) → Observer (test)

### Probe: Add Psionic State Tracking

For each agent, create `~/clawd/agents/{agent}/psionic-state.json`:

- [ ] **State schema**:
  ```json
  {
    "agent": "oracle",
    "psionic_rank": 1,
    "xp": 1,
    "xp_breakdown": {
      "memory_count": 0,
      "completed_missions": 0,
      "total_xp": 1
    },
    "next_rank_at": 2,
    "active_protocols": [],
    "last_updated": "2026-02-14T00:00:00Z"
  }
  ```

- [ ] **Initialize all 6 agents**:
  ```bash
  for agent in oracle atlas sentinel verifier archivist synth; do
    cat > ~/clawd/agents/${agent}/psionic-state.json <<EOF
  {
    "agent": "$agent",
    "psionic_rank": 1,
    "xp": 1,
    "xp_breakdown": {
      "memory_count": 0,
      "completed_missions": 0,
      "total_xp": 1
    },
    "next_rank_at": 2,
    "active_protocols": [],
    "last_updated": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
    "khala_note": "En Taro Adun! The journey begins."
  }
  EOF
  done
  ```

### Probe: Update Psionic Stats Script to Write State

- [ ] Modify `calculate-psionic-attributes.sh` to also update `psionic-state.json`:
  ```bash
  # After calculating rank/xp, write to psionic-state.json
  next_rank_xp=$(echo "2 ^ ($rank + 1)" | bc)
  
  cat > "$STATS_DIR/$agent/psionic-state.json" <<EOF
  {
    "agent": "$agent",
    "psionic_rank": $rank,
    "xp": $xp,
    "xp_breakdown": {
      "memory_count": $memory_count,
      "completed_missions": $completed_missions,
      "total_xp": $xp
    },
    "next_rank_at": $next_rank_xp,
    "active_protocols": [],
    "last_updated": "$TIMESTAMP",
    "khala_note": "Rank $rank achieved through the Khala"
  }
  EOF
  ```

### Observer: Test Psionic Rank Progression

- [ ] Create mock data with higher XP:
  ```bash
  # Manually edit psionic-state.json for oracle
  jq '.xp_breakdown.memory_count = 10 | .xp_breakdown.completed_missions = 5' \
     ~/clawd/agents/oracle/psionic-state.json > temp.json && mv temp.json ~/clawd/agents/oracle/psionic-state.json
  ```
- [ ] Run psionic stats script again:
  ```bash
  ~/clawd/scripts/calculate-psionic-attributes.sh
  ```
- [ ] Check oracle rank increased:
  ```bash
  jq '.psionic_rank' ~/clawd/agents/oracle/psionic-state.json
  # Expected: rank 5 (xp = 10 + 5*3 = 25 → log2(26) = 4.7 → floor + 1 = 5)
  ```
- [ ] Sign off: "Psionic Rank progression tested ✅ The Khala guides our growth"

### Probe: Commit Psionic State Files

- [ ] Commit:
  ```bash
  git add agents/*/psionic-state.json
  git commit -m "Add Psionic Rank system state tracking"
  ```

---

## Task 6: Daily Nexus Cron (Day 7)

**Owner**: Probe (implement) → Observer (test)

### Probe: Create Nexus Cron Job

- [ ] Add to existing metrics cron (or create new):
  ```bash
  crontab -e
  ```
  Add line:
  ```
  0 2 * * * /Users/zachgonser/clawd/scripts/calculate-psionic-attributes.sh >> /Users/zachgonser/clawd/logs/psionic-nexus.log 2>&1
  ```
  *(Runs daily at 2:00 AM via Nexus)*

- [ ] Or use OpenClaw cron system (if available):
  ```bash
  openclaw cron add \
    --schedule "0 2 * * *" \
    --command "~/clawd/scripts/calculate-psionic-attributes.sh" \
    --label "Daily Psionic Attribute Calculation via Nexus"
  ```

### Observer: Test Nexus Cron

- [ ] Manually trigger cron (don't wait for 2 AM):
  ```bash
  ~/clawd/scripts/calculate-psionic-attributes.sh
  ```
- [ ] Check log output:
  ```bash
  tail -f ~/clawd/logs/psionic-nexus.log
  ```
- [ ] Verify psionic stats files updated (check timestamp):
  ```bash
  jq '.timestamp' ~/clawd/agents/oracle/psionic-stats.json
  ```
- [ ] Sign off: "Nexus cron tested ✅ The Khala cycles daily"

### Probe: Commit Cron Config

- [ ] If using external cron, document in README:
  ```bash
  echo "Daily Psionic Attributes: Runs at 2:00 AM via Nexus cron (see crontab)" >> ~/clawd/README.md
  ```
- [ ] Commit:
  ```bash
  git add README.md
  git commit -m "Add daily Nexus cron for psionic attributes"
  ```

---

## Task 7: Data Source Integration (Days 8-9)

**Owner**: Probe (implement) → Zeratul (review) → Observer (test)

### Probe: Channel Real Data Sources

**Replace placeholders in `calculate-psionic-attributes.sh`:**

- [ ] **Memory count** (observational memory):
  ```bash
  get_memory_count() {
    local agent=$1
    # Query observational memory snapshot through the Khala
    local memory_file=~/clawd/observational-memory/${agent}/snapshot-latest.json
    if [[ -f "$memory_file" ]]; then
      jq -r '.entry_count // 0' "$memory_file"
    else
      echo 0
    fi
  }
  ```

- [ ] **Completed missions** (mission logs):
  ```bash
  get_completed_missions() {
    local agent=$1
    # Query mission logs (cron runs, subagent sessions) via Nexus
    local mission_log=~/clawd/logs/missions/${agent}.json
    if [[ -f "$mission_log" ]]; then
      jq -r '[.missions[] | select(.status == "success")] | length' "$mission_log"
    else
      echo 0
    fi
  }
  ```

- [ ] **Source diversity** (Zeratul only):
  ```bash
  get_source_diversity() {
    local agent=$1
    if [[ "$agent" == "oracle" ]]; then
      # Query research briefs for unique domains
      local research_log=~/clawd/agents/oracle/research-sources.json
      if [[ -f "$research_log" ]]; then
        jq -r '[.sources[].domain] | unique | length' "$research_log"
      else
        echo 0
      fi
    else
      echo 0
    fi
  }
  ```

- [ ] **Canonical edits** (High Templar only):
  ```bash
  get_canonical_edits() {
    local agent=$1
    if [[ "$agent" == "archivist" ]]; then
      # Query archive changelog
      local archive_log=~/clawd/agents/archivist/archive-changelog.json
      if [[ -f "$archive_log" ]]; then
        jq -r '[.edits[] | select(.type == "canonical")] | length' "$archive_log"
      else
        echo 0
      fi
    else
      echo 0
    fi
  }
  ```

**Note**: If these data sources don't exist yet, create placeholder files channeled through the Khala:

- [ ] Create placeholder observational memory:
  ```bash
  mkdir -p ~/clawd/observational-memory/{oracle,atlas,sentinel,verifier,archivist,synth}
  for agent in oracle atlas sentinel verifier archivist synth; do
    echo '{"entry_count": 0}' > ~/clawd/observational-memory/${agent}/snapshot-latest.json
  done
  ```

- [ ] Create placeholder mission logs:
  ```bash
  mkdir -p ~/clawd/logs/missions
  for agent in oracle atlas sentinel verifier archivist synth; do
    echo '{"missions": []}' > ~/clawd/logs/missions/${agent}.json
  done
  ```

### Zeratul: Review Data Integration

- [ ] Check memory count queries correct file/field through the Khala
- [ ] Check mission logs track success/failure correctly
- [ ] Check source diversity logic sound (unique domains)
- [ ] Check canonical edits definition clear
- [ ] Sign off: "Data sources channeled ✅ The Khala connects all"

### Observer: Test with Real Data

- [ ] Add test data to observational memory:
  ```bash
  echo '{"entry_count": 12}' > ~/clawd/observational-memory/oracle/snapshot-latest.json
  ```
- [ ] Add test data to mission logs:
  ```bash
  cat > ~/clawd/logs/missions/oracle.json <<'EOF'
  {
    "missions": [
      {"id": 1, "status": "success"},
      {"id": 2, "status": "success"},
      {"id": 3, "status": "failure"},
      {"id": 4, "status": "success"}
    ]
  }
  EOF
  ```
- [ ] Run psionic stats script:
  ```bash
  ~/clawd/scripts/calculate-psionic-attributes.sh
  ```
- [ ] Check Zeratul (Oracle) attributes reflect new data:
  ```bash
  jq '.raw_data' ~/clawd/agents/oracle/psionic-stats.json
  # Expected: memory_count: 12, completed_missions: 3
  ```
- [ ] Check rank updated:
  ```bash
  jq '.psionic_rank' ~/clawd/agents/oracle/psionic-state.json
  # Expected: rank 5 (xp = 12 + 3*3 = 21 → log2(22) = 4.5 → floor + 1 = 5)
  ```
- [ ] Sign off: "Real data integration tested ✅ Detection confirms Khala flow"

### Probe: Commit Data Integration

- [ ] Commit:
  ```bash
  git add scripts/calculate-psionic-attributes.sh
  git commit -m "Channel real data sources for psionic attributes via Khala"
  ```

---

## Task 8: Archive Documentation (Day 10)

**Owner**: High Templar (write) → Zeratul (review) → Observer (validate)

### High Templar: Create Phase 1 Archive

- [ ] **README.md** (`~/clawd/agents/README.md`):
  - [ ] Explain Protoss psionic system purpose - "Through the Khala, we are one"
  - [ ] Document file structure (tactical-overlays/, personality-protocols/, psionic-stats.json, psionic-state.json)
  - [ ] Link to schemas
  - [ ] Explain psionic attribute formulas (v2.0-khala Templar-tuned)
  - [ ] Explain Psionic Rank progression
  - [ ] Document Nexus cron schedule

- [ ] **PSIONIC-ATTRIBUTES.md** (`~/clawd/docs/PSIONIC-ATTRIBUTES.md`):
  - [ ] Define each attribute (Shields, Energy, Psionic Mastery, Warp Technology, VRL, Psi Reach)
  - [ ] Document Templar-tuned formulas
  - [ ] Explain quality gates (Energy/Warp ≥ 0.7 acceptance)
  - [ ] Provide formula examples with sample data
  - [ ] Document data sources (KPIs, memory, missions)
  - [ ] Add Protoss lore flavor

- [ ] **PSIONIC-RANKS.md** (`~/clawd/docs/PSIONIC-RANKS.md`):
  - [ ] Explain Psionic Rank formula
  - [ ] Show rank thresholds table (1-15)
  - [ ] Document XP sources (memory + missions×3)
  - [ ] Explain psionic-state.json tracking
  - [ ] Add Protoss progression flavor ("From Zealot to High Templar")

- [ ] **PERSONALITY-PROTOCOLS.md** (`~/clawd/docs/PERSONALITY-PROTOCOLS.md`):
  - [ ] Explain personality protocol system
  - [ ] Document modifier conditions (memory_count, pattern_count, psionic_rank, etc.)
  - [ ] List quality gate modifiers (false_positive_streak, rework_gate, cooldown)
  - [ ] Provide examples per agent (Protoss-themed)
  - [ ] Add Khala lore ("Behavioral patterns flow through the Khala")

### Zeratul: Review Archive

- [ ] Check formulas archived correctly
- [ ] Check data sources explained clearly through the Khala
- [ ] Check examples accurate
- [ ] Check no ambiguity for future Templar
- [ ] Sign off: "Archive reviewed ✅ Knowledge preserved for eternity"

### Observer: Validate Archive

- [ ] Check all file paths correct
- [ ] Check all examples executable
- [ ] Check schema links work
- [ ] Check Nexus cron documentation matches implementation
- [ ] Sign off: "Archive validated ✅ Detection confirms integrity"

### High Templar: Commit Archive

- [ ] Commit:
  ```bash
  git add agents/README.md docs/PSIONIC-ATTRIBUTES.md docs/PSIONIC-RANKS.md docs/PERSONALITY-PROTOCOLS.md
  git commit -m "Add Phase 1 Protoss archive (Psionic system documentation)"
  ```

---

## Final Validation (Day 10)

### Observer: End-to-End Test via Khala

- [ ] **Fresh manifestation from the Void**:
  ```bash
  # Clear existing psionic stats
  rm ~/clawd/agents/*/psionic-stats.json ~/clawd/agents/*/psionic-state.json
  
  # Re-channel psionic state
  for agent in oracle atlas sentinel verifier archivist synth; do
    cat > ~/clawd/agents/${agent}/psionic-state.json <<EOF
  {
    "agent": "$agent",
    "psionic_rank": 1,
    "xp": 1,
    "xp_breakdown": {"memory_count": 0, "completed_missions": 0, "total_xp": 1},
    "next_rank_at": 2,
    "active_protocols": [],
    "last_updated": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
    "khala_note": "En Taro Adun!"
  }
  EOF
  done
  
  # Channel psionic attributes via Nexus
  ~/clawd/scripts/calculate-psionic-attributes.sh
  ```

- [ ] **Check all 6 agents have psionic-stats.json**:
  ```bash
  ls ~/clawd/agents/*/psionic-stats.json | wc -l
  # Expected: 6
  ```

- [ ] **Check all 6 agents have psionic-state.json**:
  ```bash
  ls ~/clawd/agents/*/psionic-state.json | wc -l
  # Expected: 6
  ```

- [ ] **Validate JSON structure**:
  ```bash
  for agent in oracle atlas sentinel verifier archivist synth; do
    jq empty ~/clawd/agents/${agent}/psionic-stats.json || echo "INVALID: $agent stats"
    jq empty ~/clawd/agents/${agent}/psionic-state.json || echo "INVALID: $agent state"
  done
  ```

- [ ] **Check schema validation**:
  ```bash
  for agent in zeratul probe sentinel observer high-templar dark-templar; do
    ajv validate -s schemas/tactical-overlay.json -d agents/tactical-overlays/${agent}.json || echo "FAIL: $agent tactical"
    ajv validate -s schemas/personality-protocol.json -d agents/personality-protocols/${agent}.json || echo "FAIL: $agent protocol"
  done
  ```

- [ ] Sign off: "End-to-end test passed ✅ The Khala flows true! En Taro Adun!"

---

## Merge to Main (Day 10)

### Probe: Final Manifestation + PR

- [ ] **Final commit**:
  ```bash
  git add .
  git commit -m "Phase 1 complete: Protoss psionic core (attributes, ranks, personality, tactical)"
  ```

- [ ] **Warp branch**:
  ```bash
  git push origin feature/khala-integration-phase1
  ```

- [ ] **Create PR** (if using GitHub/GitLab):
  - Title: "Phase 1: Khala Integration (Core Psionic System) - En Taro Adun"
  - Description: Link to `rpg-integration-plan.md`, list deliverables
  - Reviewers: Zeratul (design), Observer (validation), High Templar (archive)

- [ ] **Merge to main** (after approval):
  ```bash
  git checkout main
  git merge feature/khala-integration-phase1
  git push origin main
  ```

---

## Phase 1 Success Criteria (Final Checklist)

- [x] **6 tactical overlays** in JSON format (`agents/tactical-overlays/*.json`) - Protoss units
- [x] **6 personality protocols** with quality gate modifiers (`agents/personality-protocols/*.json`)
- [x] **Attributes calculated daily** using Templar-tuned formulas (v2.0-khala)
- [x] **Psionic Rank progression** visible in `psionic-state.json`
- [x] **No manual intervention** needed (Nexus cron channels automatically via Khala)
- [x] **Schemas valid** (tactical-overlay, personality-protocol)
- [x] **Archive complete** (README, PSIONIC-ATTRIBUTES, PSIONIC-RANKS, PERSONALITY-PROTOCOLS)
- [x] **End-to-end test passed** (Observer sign-off)
- [x] **Merged to main** (production-ready, manifested through the Khala)

---

## Next Steps (After Phase 1)

1. **Monitor attributes for 1 week** → validate formulas channel reality through the Khala
2. **Collect Templar feedback** on attribute accuracy
3. **Adjust formulas** if needed (tuning window)
4. **Manifest Phase 2** → Khala Network bonds + personality evolution

---

**Document Status**: ✅ Ready for manifestation through the Khala  
**Estimated Completion**: 2026-02-28 (2 weeks from 2026-02-14)  
**Owner**: Probe (primary), Zeratul (design), Observer (validation), High Templar (archive)

**"My life for Aiur! En Taro Adun! Through the Khala, we are eternal!"**
