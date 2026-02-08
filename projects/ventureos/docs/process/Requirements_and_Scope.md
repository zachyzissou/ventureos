# VentureOS Requirements & Scope (M0)

**Source:** `/specs/VentureOS_Spec_Pack.md`  
**Purpose:** Define M0 requirements, scope, constraints, NFRs, success criteria, and workflow boundaries.

---

## Goals
- Deliver **deterministic, auditable** workflows for venture creation and management.
- Enforce **evidence‑driven, gated decisions** with explicit approvals and policy checks.
- Maintain a **single source of truth** with traceability across ideas, ventures, and portfolio reporting.
- Run **locally and free** using an OSS, Docker‑based stack.

## In‑Scope (M0)
- Three core workflows with explicit state machines:
  1) **Idea → Validation → Decision**
  2) **Venture Build → Execution → Milestone Review**
  3) **Portfolio Update → Stakeholder Report**
- Core domain services and entities (ideas, validation, ventures, portfolio, reports, artifacts, policy gates, event outbox).
- REST API endpoints and event conventions as specified.
- Policy gates (strategic fit, budget, compliance, kill criteria).
- Evidence handling and artifact storage (MinIO).
- Integration patterns (events + webhooks) for Obsidian, GitLab, Discord.
- Observability baseline (metrics/logs dashboards).

## Out‑of‑Scope (M0)
- Full production‑grade SaaS hosting or multi‑tenant deployment.
- Advanced analytics/BI beyond specified portfolio snapshots and reports.
- Custom UI/UX polish beyond functional workflow UI.
- Third‑party financial system integrations or automated payouts.
- Advanced ML/AI decisioning beyond vector search and evidence indexing.
- Full schema DDL, OpenAPI spec, Docker compose hardening (listed as next deliverables).

## Constraints
- **Local‑first, OSS only**: stack must run on a single machine via Docker.
- **Deterministic & replayable** workflows (Temporal) with idempotent operations.
- **Evidence‑required decisions**: approvals must reference artifact URIs.
- **Gate enforcement** is mandatory; no bypass without admin override (and audit).
- **Single source of truth**: Postgres SoR; events via outbox pattern.
- **Integration pattern** limited to events + webhooks using outbox + polling worker.

## Non‑Functional Requirements (NFRs)
- **Determinism/Replayability:** Workflows must be replayable in Temporal without side‑effects.
- **Idempotency:** All POST actions accept `Idempotency‑Key`; retries must be safe.
- **Auditability:** Every decision and approval recorded with actor, timestamp, and evidence links.
- **Security/RBAC:** Keycloak‑based roles; policy gates enforce role checks.
- **Traceability:** `X‑Request‑Id` propagated across services and events.
- **Performance:**
  - Typical workflow transitions complete within **< 2s** (excluding human approvals).
  - Report generation for portfolio update within **< 60s** for M0 dataset.
- **Reliability:** Outbox delivery guarantees at‑least‑once event dispatch.
- **Observability:** Metrics, logs, and dashboards available for workflows, queues, and gates.
- **Data Integrity:** Evidence artifacts immutably stored; references validated at approval time.

## Success Metrics / Acceptance Criteria
- **100% of decisions** include linked evidence artifacts in MinIO.
- **All required gates enforced**: no approval possible without gate pass.
- **Temporal replay tests pass** for each workflow (happy + failure paths).
- **Portfolio reports reproducible** from raw data (same inputs → same outputs).
- **Event outbox** delivers events reliably under retries and crash recovery.
- **Audit trails** show actor + timestamp for all state changes.

## Workflow Boundaries
### 1) Idea → Validation → Decision
- **Starts:** Idea submission (`POST /ideas`, `submitIdea`).
- **Ends:** Decision approved/rejected/revise with decision memo artifact.
- **Handoff Artifacts:** `ValidationPlan.md`, evidence bundle in MinIO, `DecisionMemo`.
- **Boundary Conditions:**
  - No “Go” without required gates (strategic, budget, compliance).
  - Decision must reference evidence artifacts.

### 2) Venture Build → Execution → Milestone Review
- **Starts:** Venture created from approved idea (`POST /ventures`).
- **Ends:** Venture completed or terminated after milestone review.
- **Handoff Artifacts:** `BuildPlan.md`, `MilestoneReviewPack`, `ExecutionReport`.
- **Boundary Conditions:**
  - Budget increase above threshold requires finance + exec gate.
  - Kill criteria must be enforced by workflow policy.

### 3) Portfolio Update → Stakeholder Report
- **Starts:** Portfolio update created (`POST /portfolios/{id}/updates`).
- **Ends:** Stakeholder report published or retracted.
- **Handoff Artifacts:** `PortfolioSnapshot`, `StakeholderReport`.
- **Boundary Conditions:**
  - No publish without compliance + financial approval gates.
  - Reports are auditable and reproducible.

## Assumptions / Risks
- **Assumptions:**
  - Stakeholders accept local‑only deployment for M0.
  - Primary users are internal operators with RBAC roles.
  - Data volumes are small enough for single‑node Postgres/MinIO.
- **Risks:**
  - Integration delays (Obsidian/GitLab/Discord) could slow adoption.
  - Evidence quality variance may impact decision integrity.
  - Policy gate definitions may need refinement based on real‑world usage.
  - Reliance on multiple OSS services increases operational complexity.

---

**Next Deliverables (from Spec Pack):** Schema DDL, Temporal workflow definitions, OpenAPI spec, Docker compose baseline, RACI/ownership map.
