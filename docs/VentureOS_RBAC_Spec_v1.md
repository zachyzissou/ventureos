# VentureOS RBAC Spec v1

Date: 2026-03-16
Version: v1.0
Scope: normative access-control model for VentureOS lane bindings, capability overlays, subordinate specialists, and escalation rules.

## 1) Subject model

RBAC subjects in VentureOS are evaluated in this order:
1. lane binding baseline
2. capability overlay restriction
3. subordinate specialist narrowing
4. escalation requirement
5. human override if needed

RBAC subjects must be expressed using canonical identifiers from:
- `docs/VentureOS_Role_Model_v1.md`
- `docs/VentureOS_Agent_Role_Registry_v1.json`

## 2) Resource classes

Canonical resource classes:
- `repo_read`
- `repo_write`
- `issue_tracker`
- `pr_merge`
- `evidence_read`
- `evidence_write`
- `dashboard_read`
- `dashboard_control`
- `task_queue_mutation`
- `secret_metadata`
- `secret_runtime_use`
- `secret_raw_read`
- `external_publish`
- `policy_override`

## 3) Secret classes

Canonical secret classes:
- `S0_public_config`
- `S1_runtime_token`
- `S2_service_secret`
- `S3_production_credential`

## 4) Decision values

Permission decisions use one of:
- `allow`
- `allow_with_evidence`
- `escalation_required`
- `deny`

## 5) Lane baselines

### Director baseline
- `repo_write`: `allow_with_evidence`
- `pr_merge`: `escalation_required`
- `secret_raw_read`: `deny`
- `policy_override`: `deny`

### Operator baseline
- `repo_write`: `allow_with_evidence`
- `pr_merge`: `deny`
- `secret_runtime_use`: `allow_with_evidence` for `S1_runtime_token` only
- `secret_raw_read`: `deny`
- `policy_override`: `deny`

### Auditor baseline
- `repo_write`: `deny`
- `evidence_read`: `allow`
- `evidence_write`: `allow_with_evidence`
- `secret_runtime_use`: `deny`
- `policy_override`: `deny`

## 6) Capability overlay restrictions

### `venture_control`
- may mutate `task_queue_mutation`
- may not gain `pr_merge`

### `venture_strategy`
- may issue coordination directives
- may not publish externally
- may not alter security controls directly

### `venture_evidence`
- may certify evidence and gates
- may not self-waive critical findings

### `venture_security`
- may block risky actions
- may not exercise human override
- raw credential access remains escalation-gated

### `venture_comms`
- `external_publish` is `escalation_required`
- human sign-off required for high-impact external communication

### `venture_game_director`
- may author and direct game systems, technical, interface, world, art, and audio work within delegated scope
- may delegate to subordinate game specialists
- may not bypass release, security, or audit gates
- may not gain `policy_override`
- may not gain `pr_merge` unless the underlying lane already permits it

## 7) Subordinate specialist restrictions

### `game_systems`
- may influence design and systems outputs
- may not claim audit authority

### `game_technical`
- may influence implementation and tooling outputs
- may not widen infrastructure or production authority beyond the parent lane

### `game_world`
- may influence narrative and content outputs
- may not publish externally without escalation

### `game_interface`
- may influence UX/UI outputs
- may not self-approve accessibility or quality gates

### `game_art`
- may influence visual outputs
- may not change shipping scope on its own

### `game_audio`
- may influence audio outputs
- may not widen release authority

### `game_qa`
- may recommend rejection or remediation
- formal acceptance remains with the Auditor lane or gate owner

## 8) Escalation rules

### Approval routes
- budget and scope overrides -> `executive_office:director`
- security-sensitive access -> `it_security:director`
- evidence waiver -> `executive_office:director` plus Evidence note
- production-risk override -> `human_arbiter`
- external publish for high-impact communication -> `human_arbiter`

## 9) Enforcement hook map

The following repo paths are the intended integration points for future runtime enforcement:
- `dashboard/client/index.html`
- `lib/authority-map.ts`
- `lib/policy-gate.ts`
- `lib/nexus-arbiter.ts`
- `tactical-map/src/interaction/permissions.ts`
- `dashboard/server/middleware/auth.ts`
- `lib/evidence.ts`

## 10) Non-goals for this spec

- No auth middleware rewrite
- No new token model
- No runtime permission behavior changes in this PR
- No removal of compatibility aliases required for existing runtime data

## 11) Change control

Any change to the RBAC model must update `docs/VentureOS_Tool_Access_Matrix_v1.json` in the same change.
