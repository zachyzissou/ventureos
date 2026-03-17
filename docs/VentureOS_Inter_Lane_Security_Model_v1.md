# VentureOS Inter-Lane Security Model v1

Date: 2026-03-16
Version: v1.0
Scope: normative security model for artifact exchange, approval transport, and handoff evidence across VentureOS lanes.

## 1) Purpose

This document defines the minimum security controls for any artifact, approval, or handoff exchanged between VentureOS lanes.

Without this model, a lane-to-lane handoff is only operationally structured, not security-qualified. That leaves VentureOS exposed to forged approvals, replayed artifacts, ambiguous producer identity, and unverifiable downstream acceptance.

## 2) Normative relationship to other docs

- `docs/VentureOS_Role_Model_v1.md` remains the normative source for canonical lane bindings and authority classes.
- `docs/VentureOS_RBAC_Spec_v1.md` remains the normative source for who may access which resource classes.
- `docs/VentureOS_Cross_Department_Agent_Contracts_v1.md` remains the normative source for cross-cutting mission, SLA, and escalation obligations.
- `docs/VentureOS_Department_KPI_SLA_v1.md` remains the normative source for handoff SLA behavior and breach handling.
- This document is the normative source for lane-to-lane trust boundaries, authentication, authorization, integrity, provenance, replay protection, and exception handling.

## 3) Trust boundaries

The following trust boundaries are normative:

1. Lane instance boundary
   A producer lane instance is not implicitly trusted by a consumer lane instance, even when both belong to the same department.

2. Department boundary
   Cross-department artifacts must always be treated as external to the receiving department until validated.

3. Control-plane boundary
   Cross-cutting functions may route or certify exchange state, but they do not replace producer identity or consumer acceptance.

4. Human override boundary
   Human override may waive or escalate an exchange rule, but it must be explicit, timestamped, and evidenced.

## 4) Security goals

Every inter-lane exchange must provide:

1. authenticated producer identity
2. authorized producer scope
3. authorized consumer scope
4. artifact integrity verification
5. provenance traceability
6. replay resistance
7. auditable exception handling

## 5) Canonical exchange envelope

Every inter-lane artifact exchange must be representable with this minimum envelope:

- `exchange_id`
- `artifact_type`
- `producer_binding_id`
- `producer_capability_id`
- `consumer_binding_id`
- `issued_at`
- `expires_at`
- `classification`
- `integrity_hash`
- `evidence_ref`
- `transport_auth_class`
- `approval_chain`
- `nonce`

These fields may be implemented in existing handoff or evidence payloads without changing user-facing operator commands, but the security model requires that they exist logically even if runtime surfaces still serialize them differently during transition.

## 6) Authentication rules

### Producer authentication

- Every exchange must identify the producer using canonical `producer_binding_id`.
- Automated exchange transport may use `S1_runtime_token` or `S2_service_secret`, depending on the transport boundary.
- `S3_production_credential` must never be used as a routine inter-lane exchange token.
- Raw secret disclosure is prohibited; transport auth must prove identity, not expose secret material.

### Consumer authentication

- Any system accepting an exchange must authenticate the receiving lane or service boundary before processing or acknowledging the artifact.
- Acknowledgement without authenticated consumer identity is invalid for SLA and audit purposes.

## 7) Authorization rules

- Producer and consumer bindings must be canonical VentureOS bindings.
- A valid producer identity is not sufficient on its own; the producer must also be authorized to emit the artifact class.
- Consumer acceptance is valid only if the consumer is authorized to receive the artifact class.
- Cross-cutting agents may route or validate exchanges only within the authority limits already defined in `docs/VentureOS_Cross_Department_Agent_Contracts_v1.md`.
- Security-sensitive artifacts require `it_security:director` escalation when the exchange crosses into higher-risk policy domains or secret classes.

## 8) Integrity and provenance rules

- Every exchangeable artifact must carry or derive an `integrity_hash`.
- The producer must bind that hash to the issued exchange envelope.
- Downstream mutation after issuance requires a new envelope or explicit revision record.
- `evidence_ref` must point to the canonical evidence location used to reconstruct the exchange.
- Approvals must be attributable to the approving binding, not just a display label or free-text owner string.

## 9) Replay and expiry controls

- `exchange_id` must be unique per issued envelope.
- `nonce` must be unique within the active replay-protection window.
- `expires_at` must be present for time-sensitive approval or handoff envelopes.
- Consumer systems must reject expired or duplicate envelopes unless an explicit exception record exists.
- Replayed approvals are invalid unless reissued through a fresh, auditable exchange envelope.

## 10) Classification model

Every inter-lane exchange must carry one of these classifications:

- `public_operational`
- `internal_operational`
- `restricted_control`
- `security_sensitive`

Required handling:

- `public_operational`: standard authenticated exchange, integrity required
- `internal_operational`: authenticated exchange plus consumer authorization check
- `restricted_control`: authenticated exchange, authorization check, provenance evidence, and explicit approval chain
- `security_sensitive`: authenticated exchange, authorization check, provenance evidence, explicit approval chain, and security escalation rules when required

## 11) Exception handling

- Exceptions may not be implicit.
- Any bypass of expiry, replay protection, provenance completeness, or authorization path must be logged in the daily decision log.
- The exception record must identify:
  - approving binding
  - reason
  - affected exchange scope
  - expiry time
  - remediation requirement
- Critical exceptions require `executive_office:director` approval plus `it_security:director` acknowledgement when the exception changes security exposure.

## 12) Evidence requirements

The following evidence is required for any security-relevant inter-lane exchange:

- producer binding
- consumer binding
- issued timestamp
- acceptance timestamp when accepted
- integrity hash or equivalent immutable content fingerprint
- evidence reference path
- exception record when normal controls are bypassed

Canonical evidence locations remain under `runtime/logs/` and `runtime/reports/`.

## 13) Minimum enforcement expectations

This document defines the model now. Runtime enforcement should follow this order:

1. validate canonical producer and consumer bindings
2. validate transport authentication class
3. validate authorization against the RBAC model
4. validate integrity hash and evidence reference
5. reject replayed or expired envelopes
6. record acceptance or denial into evidence outputs

## 14) Implementation hook targets

The initial enforcement hooks for this model should align with:

- `lib/policy-gate.ts`
- `lib/evidence.ts`
- `dashboard/server/middleware/auth.ts`
- task-board and handoff transport surfaces
- future inter-lane envelope validation utilities

## 15) Current status

This security model is now defined at the doc/spec layer.

Runtime enforcement is still follow-on work. Until enforcement lands, any inter-lane exchange should be treated as operationally structured but not fully security-enforced.
