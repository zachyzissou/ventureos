# RPG Protocol Activation Test Report

- **Generated:** 2026-02-14 05:02:37 CST
- **Temp DB:** /tmp/ventureos-rpg-test-2026-02-14_050232.db
- **Prod DB:** /Users/zachgonser/clawd/agents/ventureos-rpg.db
- **Engine:** /Users/zachgonser/clawd/scripts/check-protocol-triggers.sh

## A) Temp DB run (applies changes)

**Active protocols after run:** 3

### Active protocols

```sql
SELECT agent_id, protocol_id, protocol_type, trigger_condition
FROM personality_activations
WHERE deactivated_at IS NULL
ORDER BY agent_id, protocol_id;
```

```text
echo → reference_outcomes (base)  {"observation_or_memory_count":15,"threshold":8}
sentinel → escalation_quality_mode (quality_gate)  {"signal_ratio":0.5833333333333334,"threshold_ratio":0.7,"true_positives":7,"validated_escalations":12,"window_days":30}
sentinel → false_positive_cooldown (quality_gate)  {"false_positives":5,"threshold_false_positives":3,"validated_escalations":12,"window_days":30}
```

### Engine log excerpt

```text
[2026-02-14 05:02:32] =========================================
[2026-02-14 05:02:32] Protocol Trigger Check Starting
[2026-02-14 05:02:32] DB_PATH=/tmp/ventureos-rpg-test-2026-02-14_050232.db
[2026-02-14 05:02:32] OBS_DIR=/Users/zachgonser/.openclaw/workspace-archivist/observations (rg=1)
[2026-02-14 05:02:32] OVERLAYS_DIR=/Users/zachgonser/clawd/agents/tactical-overlays
[2026-02-14 05:02:32] LOG_FILE=/Users/zachgonser/clawd/runtime/logs/protocol-triggers-2026-02-14.log
[2026-02-14 05:02:32] =========================================
[2026-02-14 05:02:32] --- agent=archivist ---
[2026-02-14 05:02:32] = keep   archivist → reference_outcomes (inactive)
[2026-02-14 05:02:32] = keep   archivist → use_frameworks (inactive)
[2026-02-14 05:02:32] = keep   archivist → show_confidence (inactive)
[2026-02-14 05:02:32] = keep   archivist → mentor_mode (inactive)
[2026-02-14 05:02:32] = keep   archivist → proactive_documentation (inactive)
[2026-02-14 05:02:32] = keep   archivist → pattern_extraction (inactive)
[2026-02-14 05:02:32] --- agent=atlas ---
[2026-02-14 05:02:33] = keep   atlas → reference_outcomes (inactive)
[2026-02-14 05:02:33] = keep   atlas → use_frameworks (inactive)
[2026-02-14 05:02:33] = keep   atlas → show_confidence (inactive)
[2026-02-14 05:02:33] = keep   atlas → mentor_mode (inactive)
[2026-02-14 05:02:33] = keep   atlas → proactive_monitoring (inactive)
[2026-02-14 05:02:33] --- agent=echo ---
OK: activated: echo → reference_outcomes (base)
[2026-02-14 05:02:33] + activate echo → reference_outcomes {"observation_or_memory_count":15,"threshold":8}
[2026-02-14 05:02:33] = keep   echo → use_frameworks (inactive)
[2026-02-14 05:02:33] = keep   echo → show_confidence (inactive)
[2026-02-14 05:02:33] = keep   echo → mentor_mode (inactive)
[2026-02-14 05:02:33] --- agent=nexus ---
[2026-02-14 05:02:33] = keep   nexus → reference_outcomes (inactive)
[2026-02-14 05:02:33] = keep   nexus → use_frameworks (inactive)
[2026-02-14 05:02:33] = keep   nexus → show_confidence (inactive)
[2026-02-14 05:02:33] = keep   nexus → mentor_mode (inactive)
[2026-02-14 05:02:33] = keep   nexus → autonomous_delegation (inactive)
[2026-02-14 05:02:33] = keep   nexus → priority_stack_enforcement (inactive)
[2026-02-14 05:02:33] --- agent=oracle ---
OK: deactivated: oracle → reference_outcomes
[2026-02-14 05:02:34] - deactivate oracle → reference_outcomes
[2026-02-14 05:02:34] = keep   oracle → use_frameworks (inactive)
[2026-02-14 05:02:34] = keep   oracle → show_confidence (inactive)
[2026-02-14 05:02:34] = keep   oracle → mentor_mode (inactive)
[2026-02-14 05:02:34] = keep   oracle → cite_precedents (inactive)
[2026-02-14 05:02:34] --- agent=sentinel ---
[2026-02-14 05:02:34] = keep   sentinel → reference_outcomes (inactive)
[2026-02-14 05:02:34] = keep   sentinel → use_frameworks (inactive)
[2026-02-14 05:02:34] = keep   sentinel → show_confidence (inactive)
[2026-02-14 05:02:34] = keep   sentinel → mentor_mode (inactive)
[2026-02-14 05:02:34] = keep   sentinel → false_positive_cooldown
[2026-02-14 05:02:34] = keep   sentinel → escalation_quality_mode
[2026-02-14 05:02:34] --- agent=synth ---
[2026-02-14 05:02:34] = keep   synth → reference_outcomes (inactive)
[2026-02-14 05:02:34] = keep   synth → use_frameworks (inactive)
[2026-02-14 05:02:34] = keep   synth → show_confidence (inactive)
[2026-02-14 05:02:34] = keep   synth → mentor_mode (inactive)
[2026-02-14 05:02:34] = keep   synth → test_first_discipline (inactive)
[2026-02-14 05:02:34] = keep   synth → code_review_checklist (inactive)
[2026-02-14 05:02:34] --- agent=verifier ---
[2026-02-14 05:02:35] = keep   verifier → reference_outcomes (inactive)
[2026-02-14 05:02:35] = keep   verifier → use_frameworks (inactive)
[2026-02-14 05:02:35] = keep   verifier → show_confidence (inactive)
[2026-02-14 05:02:35] = keep   verifier → mentor_mode (inactive)
[2026-02-14 05:02:35] = keep   verifier → context_requirement_enforcement (inactive)
[2026-02-14 05:02:35] =========================================
[2026-02-14 05:02:35] Protocol Trigger Check Complete
[2026-02-14 05:02:35] Log: /Users/zachgonser/clawd/runtime/logs/protocol-triggers-2026-02-14.log
[2026-02-14 05:02:35] =========================================
```

## B) Prod DB dry-run (no changes)

```text
[2026-02-14 05:02:35] =========================================
[2026-02-14 05:02:35] Protocol Trigger Check Starting (DRY RUN)
[2026-02-14 05:02:35] DB_PATH=/Users/zachgonser/clawd/agents/ventureos-rpg.db
[2026-02-14 05:02:35] OBS_DIR=/Users/zachgonser/.openclaw/workspace-archivist/observations (rg=1)
[2026-02-14 05:02:35] OVERLAYS_DIR=/Users/zachgonser/clawd/agents/tactical-overlays
[2026-02-14 05:02:35] LOG_FILE=/Users/zachgonser/clawd/runtime/logs/protocol-triggers-2026-02-14.log
[2026-02-14 05:02:35] =========================================
[2026-02-14 05:02:35] --- agent=archivist ---
[2026-02-14 05:02:35] = keep   archivist → reference_outcomes (inactive)
[2026-02-14 05:02:35] = keep   archivist → use_frameworks (inactive)
[2026-02-14 05:02:35] = keep   archivist → show_confidence (inactive)
[2026-02-14 05:02:35] = keep   archivist → mentor_mode (inactive)
[2026-02-14 05:02:35] = keep   archivist → proactive_documentation (inactive)
[2026-02-14 05:02:35] = keep   archivist → pattern_extraction (inactive)
[2026-02-14 05:02:35] --- agent=atlas ---
[2026-02-14 05:02:35] = keep   atlas → reference_outcomes (inactive)
[2026-02-14 05:02:35] = keep   atlas → use_frameworks (inactive)
[2026-02-14 05:02:35] = keep   atlas → show_confidence (inactive)
[2026-02-14 05:02:35] = keep   atlas → mentor_mode (inactive)
[2026-02-14 05:02:36] = keep   atlas → proactive_monitoring (inactive)
[2026-02-14 05:02:36] --- agent=echo ---
[2026-02-14 05:02:36] + would-activate echo → reference_outcomes {"observation_or_memory_count":15,"threshold":8}
[2026-02-14 05:02:36] = keep   echo → use_frameworks (inactive)
[2026-02-14 05:02:36] = keep   echo → show_confidence (inactive)
[2026-02-14 05:02:36] = keep   echo → mentor_mode (inactive)
[2026-02-14 05:02:36] --- agent=nexus ---
[2026-02-14 05:02:36] = keep   nexus → reference_outcomes (inactive)
[2026-02-14 05:02:36] = keep   nexus → use_frameworks (inactive)
[2026-02-14 05:02:36] = keep   nexus → show_confidence (inactive)
[2026-02-14 05:02:36] = keep   nexus → mentor_mode (inactive)
[2026-02-14 05:02:36] = keep   nexus → autonomous_delegation (inactive)
[2026-02-14 05:02:36] = keep   nexus → priority_stack_enforcement (inactive)
[2026-02-14 05:02:36] --- agent=oracle ---
[2026-02-14 05:02:36] - would-deactivate oracle → reference_outcomes
[2026-02-14 05:02:36] = keep   oracle → use_frameworks (inactive)
[2026-02-14 05:02:36] = keep   oracle → show_confidence (inactive)
[2026-02-14 05:02:36] = keep   oracle → mentor_mode (inactive)
[2026-02-14 05:02:36] = keep   oracle → cite_precedents (inactive)
[2026-02-14 05:02:36] --- agent=sentinel ---
[2026-02-14 05:02:37] = keep   sentinel → reference_outcomes (inactive)
[2026-02-14 05:02:37] = keep   sentinel → use_frameworks (inactive)
[2026-02-14 05:02:37] = keep   sentinel → show_confidence (inactive)
[2026-02-14 05:02:37] = keep   sentinel → mentor_mode (inactive)
[2026-02-14 05:02:37] = keep   sentinel → false_positive_cooldown
[2026-02-14 05:02:37] = keep   sentinel → escalation_quality_mode
[2026-02-14 05:02:37] --- agent=synth ---
[2026-02-14 05:02:37] = keep   synth → reference_outcomes (inactive)
[2026-02-14 05:02:37] = keep   synth → use_frameworks (inactive)
[2026-02-14 05:02:37] = keep   synth → show_confidence (inactive)
[2026-02-14 05:02:37] = keep   synth → mentor_mode (inactive)
[2026-02-14 05:02:37] = keep   synth → test_first_discipline (inactive)
[2026-02-14 05:02:37] = keep   synth → code_review_checklist (inactive)
[2026-02-14 05:02:37] --- agent=verifier ---
[2026-02-14 05:02:37] = keep   verifier → reference_outcomes (inactive)
[2026-02-14 05:02:37] = keep   verifier → use_frameworks (inactive)
[2026-02-14 05:02:37] = keep   verifier → show_confidence (inactive)
[2026-02-14 05:02:37] = keep   verifier → mentor_mode (inactive)
[2026-02-14 05:02:37] = keep   verifier → context_requirement_enforcement (inactive)
[2026-02-14 05:02:37] =========================================
[2026-02-14 05:02:37] Protocol Trigger Check Complete (DRY RUN)
[2026-02-14 05:02:37] Log: /Users/zachgonser/clawd/runtime/logs/protocol-triggers-2026-02-14.log
[2026-02-14 05:02:37] =========================================
```

## Notes

- The temp DB run validates activation/deactivation logic without mutating production.
- If you need to re-run with a clean slate in temp DB:
  - delete the temp DB and rerun this script.
