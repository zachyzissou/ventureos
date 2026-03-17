# VentureOS External Boundary Protocol v1

Date: 2026-03-17
Version: v1.0
Scope: normative control protocol for any VentureOS interaction that crosses the company boundary to customers, prospective customers, vendors, partners, regulators, press, or the general public.

## 1) Purpose

VentureOS already defines `external_publish` at the RBAC layer, but that permission alone does not determine what may cross the boundary, under what approvals, or with what audit trail. This protocol closes that gap.

It defines:
- counterpart classes
- information classes
- action classes
- approval routes
- required evidence for every external interaction
- prohibited actions and exception handling

This document is normative for Sales, Marketing, Customer Success, Legal, Executive Office, and any other lane that interacts with external parties.

## 2) Canonical relationship to other controls

This protocol works with, and does not replace:
- `docs/VentureOS_RBAC_Spec_v1.md`
- `docs/VentureOS_Tool_Access_Matrix_v1.json`
- `docs/VentureOS_Lane_Contracts_v1.md`
- `docs/VentureOS_Inter_Lane_Security_Model_v1.md`

Interpretation:
- RBAC answers whether a lane may attempt the action class.
- This protocol answers whether the specific external interaction is allowed, what approvals are needed, and what evidence must be stored.
- Inter-lane security governs how the internal artifacts supporting the interaction are exchanged and authenticated.

## 3) Counterpart classes

Canonical external counterpart classes:
- `prospective_customer`
- `customer`
- `vendor`
- `partner`
- `regulator`
- `press`
- `public`

## 4) Information classes

Canonical information classes:
- `I0_public`
  - already approved for public release
  - examples: published launch copy, approved website text, already-public pricing page content
- `I1_approved_operational`
  - approved factual updates for one-to-one external use
  - examples: confirmed delivery dates, approved support status, approved roadmap statements with no commitment expansion
- `I2_counterparty_confidential`
  - counterparty-specific operational, commercial, or account information
  - examples: customer account health, vendor pricing, partner pipeline details
- `I3_contractual_or_regulated`
  - legal, contractual, privacy, compliance, or regulator-sensitive content
  - examples: contract redlines, DPA terms, privacy positions, regulator responses
- `I4_security_or_incident_restricted`
  - active security incidents, legal holds, unresolved material findings, or crisis communications
  - examples: breach notification drafts, open incident details, privileged investigation summaries

## 5) Action classes

Canonical external action classes:
- `outbound_publish`
  - one-to-many public distribution
- `outbound_direct_response`
  - one-to-one or few-to-one replies to external parties
- `commercial_commitment`
  - pricing, discounting, delivery, scope, SLA, or implementation commitments
- `legal_commitment`
  - contractual or compliance commitments
- `regulatory_submission`
  - responses or submissions to regulators, auditors, or formal investigators
- `inbound_request_intake`
  - intake and routing of inbound requests before a substantive response
- `incident_notification`
  - externally visible notice tied to an incident or service disruption

## 6) Global boundary rules

- No lane may make an autonomous legal, financial, regulatory, or security-sensitive commitment.
- No external statement may rely on unpublished or unapproved internal information.
- Every substantive external interaction must have a boundary evidence record before closeout.
- Every approval recorded for an external interaction must use canonical VentureOS binding identifiers.
- If the action includes a commitment, the exact commitment text must be preserved in evidence.
- If there is any ambiguity about whether a statement is public-safe, treat it as non-public and escalate.

## 7) Approval policy

Default approval routes by action class:

| Action class | Minimum required approval | Secondary required partner | Human final arbiter required |
|---|---|---|---|
| `outbound_publish` | `<owning_scope>:director` | `executive_office:director` for high-impact public statements | required for crisis/high-impact public communication |
| `outbound_direct_response` | `<owning_scope>:director` when content goes beyond approved script/material | `legal:director` for `I3`; `it_security:director` for `I4` | only for exceptional/high-impact cases |
| `commercial_commitment` | `sales:director` or `<owning_scope>:director` when the owning scope is the commercial authority | `finance:director` for pricing/budget impact; `legal:director` for non-standard terms | required for material non-standard commitments |
| `legal_commitment` | `legal:director` | `executive_office:director` if company-level risk or policy change is created | only for extraordinary exceptions |
| `regulatory_submission` | `legal:director` | `executive_office:director` and relevant subject-matter director | yes for extraordinary or irreversible submissions |
| `incident_notification` | `operations:director` or `customer_success:director` for service communications | `it_security:director` for security incidents; `legal:director` for liability/privacy exposure | required for material public incident statements |
| `inbound_request_intake` | operator may intake and route | none, unless intake itself discloses non-public information | no |

Where this table uses `<owning_scope>:director`, it means the canonical VentureOS binding for the department that owns the external interaction.

## 8) Lane responsibilities

### Sales lanes
- May handle `prospective_customer` and `customer` interactions.
- May send `I0_public` and approved `I1_approved_operational` materials with evidence.
- May not create `commercial_commitment` outside approved pricing, scope, and legal templates.
- Must route non-standard terms, custom SLAs, or unusual discounts through Finance and Legal.

### Marketing lanes
- Own public campaign and brand communications.
- May perform `outbound_publish` only from approved content sets.
- May not publish security, legal, or contractual claims without required partner approval.

### Customer Success lanes
- May send `customer` operational updates and account-specific service communications.
- May not disclose other customers, internal investigations, or unresolved root-cause claims without approval.
- Must route incident-linked customer communications through Operations and, where applicable, IT/Security and Legal.

### Legal lanes
- Own `legal_commitment` and `regulatory_submission` authority.
- Are the primary control owner for `I3_contractual_or_regulated`.
- Must certify whether the external interaction creates company obligations, policy commitments, or disclosure risk.

### Executive Office lanes
- Own high-impact public communication approval and exception governance.
- May not bypass Legal or IT/Security controls where those functions are required.

### IT/Security lanes
- Own approval for `I4_security_or_incident_restricted`.
- Must review any external interaction that references active security incidents, vulnerabilities, or breach conditions.

## 9) Required evidence record

Every substantive external interaction must produce an evidence record containing:
- `boundary_record_id`
- `counterpart_class`
- `action_class`
- `information_class`
- `owner_binding_id`
- `approver_binding_ids`
- `request_origin`
- `approved_source_artifacts`
- `outbound_artifact` or `submission_artifact`
- `commitments_made`
- `sent_at`
- `linked_contract_id` when relevant
- `linked_incident_id` when relevant
- `retention_class`

Minimum evidence destinations:
- canonical decision or approval note in the relevant daily/weekly evidence package
- linked external artifact or draft reference
- linked contract / ticket / regulator request if applicable

## 10) Prohibited actions

The following are prohibited without explicit escalation:
- promising delivery dates, SLAs, discounts, or scope not already approved
- agreeing to non-standard legal terms outside approved templates
- disclosing customer-confidential or vendor-confidential data to another external party
- discussing active security incidents publicly without IT/Security and Legal approval
- communicating regulator-facing positions without Legal ownership
- making claims about compliance, certification, or legal status that are not evidenced

## 11) Exception handling

- Any exception must include the reason, approving bindings, expiry, and linked evidence.
- Exceptions for legal or regulatory matters require `legal:director`.
- Exceptions for security-sensitive matters require `it_security:director`.
- Exceptions for high-impact public communication require `human_arbiter`.
- Expired exceptions invalidate the boundary action and must be treated as control failures.

## 12) Machine-readable companion

The machine-readable control companion for this protocol is:
- `docs/VentureOS_External_Boundary_Control_Matrix_v1.json`

Any future runtime policy-gate or outbound communication enforcement must use that matrix together with the RBAC artifacts.

## 13) Change control

- Any change to approval routes, information classes, or prohibited actions must update this document and `docs/VentureOS_External_Boundary_Control_Matrix_v1.json` in the same change.
- Changes affecting Legal, Sales, Marketing, Customer Success, or Executive Office responsibilities require those lane owners to review the update.
