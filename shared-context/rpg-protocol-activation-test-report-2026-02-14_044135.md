# RPG Protocol Activation Test Report

- **Generated:** 2026-02-14 04:41:41 CST
- **Temp DB:** /tmp/ventureos-rpg-test-2026-02-14_044135.db
- **Prod DB:** /Users/zachgonser/clawd/agents/ventureos-rpg.db
- **Engine:** /Users/zachgonser/clawd/scripts/check-protocol-triggers.sh

## A) Temp DB run (applies changes)

**Active protocols after run:** 3

### Active protocols

`sql
SELECT agent_id, protocol_id, protocol_type, trigger_condition
FROM personality_activations
WHERE deactivated_at IS NULL
ORDER BY agent_id, protocol_id;
`

`text
echo → reference_outcomes (base)  {"observation_or_memory_count":15,"threshold":8}
sentinel → escalation_quality_mode (quality_gate)  {"signal_ratio":0.5833333333333334,"threshold_ratio":0.7,"true_positives":7,"validated_escalations":12,"window_days":30}
sentinel → false_positive_cooldown (quality_gate)  {"false_positives":5,"threshold_false_positives":3,"validated_escalations":12,"window_days":30}
\```

### Engine log excerpt

\```text
[2026-02-14 04:41:35] =========================================
[2026-02-14 04:41:35] Protocol Trigger Check Starting
[2026-02-14 04:41:35] DB_PATH=/tmp/ventureos-rpg-test-2026-02-14_044135.db
[2026-02-14 04:41:35] OBS_DIR=/Users/zachgonser/.openclaw/workspace-archivist/observations (rg=1)
[2026-02-14 04:41:35] OVERLAYS_DIR=/Users/zachgonser/clawd/agents/tactical-overlays
[2026-02-14 04:41:35] LOG_FILE=/Users/zachgonser/clawd/runtime/logs/protocol-triggers-2026-02-14.log
[2026-02-14 04:41:35] =========================================
[2026-02-14 04:41:35] --- agent=archivist ---
[2026-02-14 04:41:35] = keep   archivist → reference_outcomes (inactive)
[2026-02-14 04:41:36] = keep   archivist → use_frameworks (inactive)
[2026-02-14 04:41:36] = keep   archivist → show_confidence (inactive)
[2026-02-14 04:41:36] = keep   archivist → mentor_mode (inactive)
[2026-02-14 04:41:36] = keep   archivist → proactive_documentation (inactive)
[2026-02-14 04:41:36] = keep   archivist → pattern_extraction (inactive)
[2026-02-14 04:41:36] --- agent=atlas ---
[2026-02-14 04:41:36] = keep   atlas → reference_outcomes (inactive)
[2026-02-14 04:41:36] = keep   atlas → use_frameworks (inactive)
[2026-02-14 04:41:36] = keep   atlas → show_confidence (inactive)
[2026-02-14 04:41:36] = keep   atlas → mentor_mode (inactive)
[2026-02-14 04:41:36] = keep   atlas → proactive_monitoring (inactive)
[2026-02-14 04:41:36] --- agent=echo ---
[2026-02-14 04:41:36] = keep   echo → reference_outcomes
[2026-02-14 04:41:36] = keep   echo → use_frameworks (inactive)
[2026-02-14 04:41:36] = keep   echo → show_confidence (inactive)
[2026-02-14 04:41:36] = keep   echo → mentor_mode (inactive)
[2026-02-14 04:41:36] --- agent=nexus ---
[2026-02-14 04:41:36] = keep   nexus → reference_outcomes (inactive)
[2026-02-14 04:41:37] = keep   nexus → use_frameworks (inactive)
[2026-02-14 04:41:37] = keep   nexus → show_confidence (inactive)
[2026-02-14 04:41:37] = keep   nexus → mentor_mode (inactive)
[2026-02-14 04:41:37] = keep   nexus → autonomous_delegation (inactive)
[2026-02-14 04:41:37] = keep   nexus → priority_stack_enforcement (inactive)
[2026-02-14 04:41:37] --- agent=oracle ---
[2026-02-14 04:41:37] = keep   oracle → reference_outcomes (inactive)
[2026-02-14 04:41:37] = keep   oracle → use_frameworks (inactive)
[2026-02-14 04:41:37] = keep   oracle → show_confidence (inactive)
[2026-02-14 04:41:37] = keep   oracle → mentor_mode (inactive)
[2026-02-14 04:41:37] = keep   oracle → cite_precedents (inactive)
[2026-02-14 04:41:37] --- agent=sentinel ---
[2026-02-14 04:41:37] = keep   sentinel → reference_outcomes (inactive)
[2026-02-14 04:41:37] = keep   sentinel → use_frameworks (inactive)
[2026-02-14 04:41:37] = keep   sentinel → show_confidence (inactive)
[2026-02-14 04:41:37] = keep   sentinel → mentor_mode (inactive)
[2026-02-14 04:41:37] = keep   sentinel → false_positive_cooldown
[2026-02-14 04:41:37] = keep   sentinel → escalation_quality_mode
[2026-02-14 04:41:37] --- agent=synth ---
[2026-02-14 04:41:37] = keep   synth → reference_outcomes (inactive)
[2026-02-14 04:41:38] = keep   synth → use_frameworks (inactive)
[2026-02-14 04:41:38] = keep   synth → show_confidence (inactive)
[2026-02-14 04:41:38] = keep   synth → mentor_mode (inactive)
[2026-02-14 04:41:38] = keep   synth → test_first_discipline (inactive)
[2026-02-14 04:41:38] = keep   synth → code_review_checklist (inactive)
[2026-02-14 04:41:38] --- agent=verifier ---
[2026-02-14 04:41:38] = keep   verifier → reference_outcomes (inactive)
[2026-02-14 04:41:38] = keep   verifier → use_frameworks (inactive)
[2026-02-14 04:41:38] = keep   verifier → show_confidence (inactive)
[2026-02-14 04:41:38] = keep   verifier → mentor_mode (inactive)
[2026-02-14 04:41:38] = keep   verifier → context_requirement_enforcement (inactive)
[2026-02-14 04:41:38] =========================================
[2026-02-14 04:41:38] Protocol Trigger Check Complete
[2026-02-14 04:41:38] Log: /Users/zachgonser/clawd/runtime/logs/protocol-triggers-2026-02-14.log
[2026-02-14 04:41:38] =========================================
\```

## B) Prod DB dry-run (no changes)

\```text
[2026-02-14 04:41:38] =========================================
[2026-02-14 04:41:38] Protocol Trigger Check Starting (DRY RUN)
[2026-02-14 04:41:38] DB_PATH=/Users/zachgonser/clawd/agents/ventureos-rpg.db
[2026-02-14 04:41:38] OBS_DIR=/Users/zachgonser/.openclaw/workspace-archivist/observations (rg=1)
[2026-02-14 04:41:38] OVERLAYS_DIR=/Users/zachgonser/clawd/agents/tactical-overlays
[2026-02-14 04:41:38] LOG_FILE=/Users/zachgonser/clawd/runtime/logs/protocol-triggers-2026-02-14.log
[2026-02-14 04:41:38] =========================================
[2026-02-14 04:41:38] --- agent=archivist ---
[2026-02-14 04:41:38] = keep   archivist → reference_outcomes (inactive)
[2026-02-14 04:41:38] = keep   archivist → use_frameworks (inactive)
[2026-02-14 04:41:38] = keep   archivist → show_confidence (inactive)
[2026-02-14 04:41:38] = keep   archivist → mentor_mode (inactive)
[2026-02-14 04:41:38] = keep   archivist → proactive_documentation (inactive)
[2026-02-14 04:41:39] = keep   archivist → pattern_extraction (inactive)
[2026-02-14 04:41:39] --- agent=atlas ---
[2026-02-14 04:41:39] = keep   atlas → reference_outcomes (inactive)
[2026-02-14 04:41:39] = keep   atlas → use_frameworks (inactive)
[2026-02-14 04:41:39] = keep   atlas → show_confidence (inactive)
[2026-02-14 04:41:39] = keep   atlas → mentor_mode (inactive)
[2026-02-14 04:41:39] = keep   atlas → proactive_monitoring (inactive)
[2026-02-14 04:41:39] --- agent=echo ---
[2026-02-14 04:41:39] = keep   echo → reference_outcomes
[2026-02-14 04:41:39] = keep   echo → use_frameworks (inactive)
[2026-02-14 04:41:39] = keep   echo → show_confidence (inactive)
[2026-02-14 04:41:39] = keep   echo → mentor_mode (inactive)
[2026-02-14 04:41:39] --- agent=nexus ---
[2026-02-14 04:41:39] = keep   nexus → reference_outcomes (inactive)
[2026-02-14 04:41:39] = keep   nexus → use_frameworks (inactive)
[2026-02-14 04:41:39] = keep   nexus → show_confidence (inactive)
[2026-02-14 04:41:39] = keep   nexus → mentor_mode (inactive)
[2026-02-14 04:41:39] = keep   nexus → autonomous_delegation (inactive)
[2026-02-14 04:41:40] = keep   nexus → priority_stack_enforcement (inactive)
[2026-02-14 04:41:40] --- agent=oracle ---
[2026-02-14 04:41:40] = keep   oracle → reference_outcomes (inactive)
[2026-02-14 04:41:40] = keep   oracle → use_frameworks (inactive)
[2026-02-14 04:41:40] = keep   oracle → show_confidence (inactive)
[2026-02-14 04:41:40] = keep   oracle → mentor_mode (inactive)
[2026-02-14 04:41:40] = keep   oracle → cite_precedents (inactive)
[2026-02-14 04:41:40] --- agent=sentinel ---
[2026-02-14 04:41:40] = keep   sentinel → reference_outcomes (inactive)
[2026-02-14 04:41:40] = keep   sentinel → use_frameworks (inactive)
[2026-02-14 04:41:40] = keep   sentinel → show_confidence (inactive)
[2026-02-14 04:41:40] = keep   sentinel → mentor_mode (inactive)
[2026-02-14 04:41:40] = keep   sentinel → false_positive_cooldown
[2026-02-14 04:41:40] = keep   sentinel → escalation_quality_mode
[2026-02-14 04:41:40] --- agent=synth ---
[2026-02-14 04:41:40] = keep   synth → reference_outcomes (inactive)
[2026-02-14 04:41:40] = keep   synth → use_frameworks (inactive)
[2026-02-14 04:41:40] = keep   synth → show_confidence (inactive)
[2026-02-14 04:41:40] = keep   synth → mentor_mode (inactive)
[2026-02-14 04:41:41] = keep   synth → test_first_discipline (inactive)
[2026-02-14 04:41:41] = keep   synth → code_review_checklist (inactive)
[2026-02-14 04:41:41] --- agent=verifier ---
[2026-02-14 04:41:41] = keep   verifier → reference_outcomes (inactive)
[2026-02-14 04:41:41] = keep   verifier → use_frameworks (inactive)
[2026-02-14 04:41:41] = keep   verifier → show_confidence (inactive)
[2026-02-14 04:41:41] = keep   verifier → mentor_mode (inactive)
[2026-02-14 04:41:41] = keep   verifier → context_requirement_enforcement (inactive)
[2026-02-14 04:41:41] =========================================
[2026-02-14 04:41:41] Protocol Trigger Check Complete (DRY RUN)
[2026-02-14 04:41:41] Log: /Users/zachgonser/clawd/runtime/logs/protocol-triggers-2026-02-14.log
[2026-02-14 04:41:41] =========================================
\```

## Notes

- The temp DB run validates activation/deactivation logic without mutating production.
- If you need to re-run with a clean slate in temp DB:
  - delete the temp DB and rerun this script.
