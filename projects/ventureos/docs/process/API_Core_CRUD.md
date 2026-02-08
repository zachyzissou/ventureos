# VentureOS Core API CRUD (M1)

**Source of truth:**
- `/specs/VentureOS_Spec_Pack.md`
- `/docs/process/Data_Model_ERD.md`

This document defines the **core CRUD REST endpoints** for M1, aligned to the spec pack workflows and the M0 data model. It also captures common request/response shapes, pagination, error model, and an auth stub for Keycloak.

---

## 1) Base Conventions
- **Base URL (stub):** `/api/v1`
- **Content-Type:** `application/json`
- **Idempotency:** all POST/PATCH/PUT accept `Idempotency-Key`
- **Tracing:** `X-Request-Id` propagated end‑to‑end
- **Soft delete:** use `DELETE` to **archive** (status → `Archived`) unless entity is immutable (e.g., outbox)

### Status / Taxonomy Enums
- **Status:** `Draft | InReview | Approved | Rejected | Active | Paused | Completed | Failed | Archived`
- **Priority:** `P0 | P1 | P2 | P3`
- **Risk:** `Low | Medium | High | Critical`
- **Decision Outcome:** `Go | Iterate | Kill`
- **Milestone Outcome:** `Approved | Rejected`
- **Artifact Type:** `Evidence | Report | Deck | Model | MetricsSnapshot`
- **Gate Type:** `StrategicFit | BudgetCap | Compliance | KillCriteria | FinancialApproval`

---

## 2) Auth (Stub)
**Bearer JWT via Keycloak**
```
Authorization: Bearer <jwt>
```
- **401** if missing/invalid token
- **403** if role/RBAC check fails (gate enforcement)

---

## 3) Pagination & Filtering (List Endpoints)
**Query params:**
- `page` (default: `1`)
- `page_size` (default: `25`, max: `100`)
- `sort` (field name)
- `order` (`asc|desc`)
- Entity‑specific filters (examples below)

**Response shape:**
```json
{
  "items": [/* entity list */],
  "page": {
    "page": 1,
    "page_size": 25,
    "total": 123,
    "has_more": true
  }
}
```

---

## 4) Error Model
**Standard error body:**
```json
{
  "error": {
    "code": "validation_error",
    "message": "Missing required field: title",
    "details": {"field": "title"},
    "request_id": "req_123"
  }
}
```
**Common HTTP codes:** `400, 401, 403, 404, 409, 422, 429, 500`

---

## 5) Core CRUD Endpoints
> All list endpoints support pagination + filters. All create/update endpoints accept `Idempotency-Key`.

### Ideas
- `GET /ideas`
- `POST /ideas`
- `GET /ideas/{id}`
- `PATCH /ideas/{id}`
- `DELETE /ideas/{id}` (archive)

**Filters:** `status, owner_id, priority, risk_level, tag`

### Validation Plans
- `GET /validation-plans`
- `POST /validation-plans`
- `GET /validation-plans/{id}`
- `PATCH /validation-plans/{id}`
- `DELETE /validation-plans/{id}` (archive)

**Filters:** `idea_id, status`

### Validation Runs
- `GET /validation-runs`
- `POST /validation-runs`
- `GET /validation-runs/{id}`
- `PATCH /validation-runs/{id}`
- `DELETE /validation-runs/{id}` (archive)

**Filters:** `plan_id, status, outcome`

### Decisions
- `GET /decisions`
- `POST /decisions`
- `GET /decisions/{id}`
- `PATCH /decisions/{id}`
- `DELETE /decisions/{id}` (archive)

**Filters:** `idea_id, status, outcome`

### Ventures
- `GET /ventures`
- `POST /ventures`
- `GET /ventures/{id}`
- `PATCH /ventures/{id}`
- `DELETE /ventures/{id}` (archive)

**Filters:** `idea_id, owner_id, status, priority`

### Build Plans
- `GET /build-plans`
- `POST /build-plans`
- `GET /build-plans/{id}`
- `PATCH /build-plans/{id}`
- `DELETE /build-plans/{id}` (archive)

**Filters:** `venture_id, status`

### Execution Runs
- `GET /execution-runs`
- `POST /execution-runs`
- `GET /execution-runs/{id}`
- `PATCH /execution-runs/{id}`
- `DELETE /execution-runs/{id}` (archive)

**Filters:** `venture_id, status, sprint_no`

### Milestone Reviews
- `GET /milestone-reviews`
- `POST /milestone-reviews`
- `GET /milestone-reviews/{id}`
- `PATCH /milestone-reviews/{id}`
- `DELETE /milestone-reviews/{id}` (archive)

**Filters:** `venture_id, milestone_id, outcome`

### Portfolios
- `GET /portfolios`
- `POST /portfolios`
- `GET /portfolios/{id}`
- `PATCH /portfolios/{id}`
- `DELETE /portfolios/{id}` (archive)

**Filters:** `owner_id, name`

### Portfolio Updates
- `GET /portfolio-updates`
- `POST /portfolio-updates`
- `GET /portfolio-updates/{id}`
- `PATCH /portfolio-updates/{id}`
- `DELETE /portfolio-updates/{id}` (archive)

**Filters:** `portfolio_id, period, status`

### Stakeholder Reports
- `GET /stakeholder-reports`
- `POST /stakeholder-reports`
- `GET /stakeholder-reports/{id}`
- `PATCH /stakeholder-reports/{id}`
- `DELETE /stakeholder-reports/{id}` (archive)

**Filters:** `update_id, status, format`

### Artifacts
- `GET /artifacts`
- `POST /artifacts`
- `GET /artifacts/{id}`
- `PATCH /artifacts/{id}` (metadata only)
- `DELETE /artifacts/{id}` (archive)

**Filters:** `parent_type, parent_id, type`

### Policy Gates
- `GET /policy-gates`
- `POST /policy-gates`
- `GET /policy-gates/{id}`
- `PATCH /policy-gates/{id}` (approve/reject)
- `DELETE /policy-gates/{id}` (archive)

**Filters:** `entity_type, entity_id, gate_type, status`

### Event Outbox (Read‑Only)
- `GET /event-outbox`
- `GET /event-outbox/{id}`

**Filters:** `entity_type, entity_id, type`

---

## 6) Core Entity Shapes (Request/Response)
> `id`, `created_at`, and `updated_at` are server‑assigned; timestamps are ISO8601.

### Idea
**Create/Update**
```json
{
  "title": "AI note‑taker for PMs",
  "owner_id": "user_123",
  "status": "Draft",
  "risk_level": "Medium",
  "priority": "P1",
  "tags": ["ai", "product"]
}
```
**Response**
```json
{
  "id": "uuid",
  "title": "AI note‑taker for PMs",
  "owner_id": "user_123",
  "status": "Draft",
  "risk_level": "Medium",
  "priority": "P1",
  "tags": ["ai", "product"],
  "created_at": "2026-02-08T18:00:00Z",
  "updated_at": "2026-02-08T18:05:00Z"
}
```

### Validation Plan
```json
{
  "idea_id": "uuid",
  "hypothesis": "PMs will pay for auto‑summaries",
  "success_metrics": "{...}",
  "timeline": "2026‑Q1",
  "status": "Draft"
}
```

### Validation Run
```json
{
  "plan_id": "uuid",
  "outcome": "success",
  "metrics_json": {"signup_rate": 0.42},
  "status": "Completed",
  "completed_at": "2026-02-08T18:00:00Z"
}
```

### Decision
```json
{
  "idea_id": "uuid",
  "outcome": "Go",
  "rationale": "Evidence meets success metrics",
  "approved_by": "user_456",
  "status": "Approved"
}
```

### Venture
```json
{
  "idea_id": "uuid",
  "owner_id": "user_123",
  "status": "Active",
  "budget": 250000,
  "priority": "P1"
}
```

### Build Plan
```json
{
  "venture_id": "uuid",
  "milestones_json": [{"id": "m1", "name": "MVP"}],
  "status": "InReview",
  "approved_by": "user_789"
}
```

### Execution Run
```json
{
  "venture_id": "uuid",
  "sprint_no": 1,
  "status": "Active",
  "metrics_json": {"velocity": 23}
}
```

### Milestone Review
```json
{
  "venture_id": "uuid",
  "milestone_id": "m1",
  "outcome": "Approved",
  "notes": "Targets met",
  "approved_by": "user_789"
}
```

### Portfolio
```json
{
  "name": "Core Ventures",
  "owner_id": "user_123"
}
```

### Portfolio Update
```json
{
  "portfolio_id": "uuid",
  "period": "2026-Q1",
  "status": "Draft",
  "metrics_json": {"irr": 0.18}
}
```

### Stakeholder Report
```json
{
  "update_id": "uuid",
  "format": "pdf",
  "status": "InReview",
  "published_at": "2026-02-08T18:00:00Z"
}
```

### Artifact
```json
{
  "parent_type": "idea",
  "parent_id": "uuid",
  "type": "Evidence",
  "minio_uri": "minio://bucket/path/file.pdf",
  "metadata_json": {"source": "survey"}
}
```

### Policy Gate
```json
{
  "gate_type": "StrategicFit",
  "entity_type": "idea",
  "entity_id": "uuid",
  "required": true,
  "status": "Approved",
  "approver_role": "Exec",
  "approved_by": "user_456"
}
```

### Event Outbox (Read‑Only)
```json
{
  "id": "evt_123",
  "type": "idea.submitted",
  "entity_type": "idea",
  "entity_id": "uuid",
  "payload_json": {"status": "Submitted"},
  "created_at": "2026-02-08T18:00:00Z"
}
```

---

## 7) Workflow Actions (Non‑CRUD, from Spec Pack)
These endpoints perform **state transitions** and must enforce policy gates + idempotency.

### Workflow 1 (Idea → Validation → Decision)
- `POST /ideas/{id}/submit`
- `POST /ideas/{id}/validation-plan`
- `POST /validation-plans/{id}/start`
- `POST /validation-plans/{id}/complete`
- `POST /ideas/{id}/decision`

### Workflow 2 (Venture Build → Execution → Milestone Review)
- `POST /ventures`
- `POST /ventures/{id}/build-plan`
- `POST /ventures/{id}/execution/start`
- `POST /ventures/{id}/milestones/{m}/submit`
- `POST /ventures/{id}/milestones/{m}/review`

### Workflow 3 (Portfolio Update → Stakeholder Report)
- `POST /portfolios/{id}/updates`
- `POST /portfolio-updates/{id}/aggregate`
- `POST /portfolio-updates/{id}/publish`
- `POST /stakeholder-reports/{id}/distribute`

---

## 8) Notes / Constraints
- Evidence links (`artifacts.minio_uri`) are required for approvals and decisions.
- Required `policy_gates` must be **Approved** prior to state transitions.
- `event_outbox` is append‑only and powers integrations (Obsidian/GitLab/Discord).
